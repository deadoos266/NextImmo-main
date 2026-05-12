/**
 * V97.35 P3-3 — Logique d'éligibilité à laisser une review.
 *
 * Un user est éligible à reviewer un autre user SUR UNE ANNONCE PRÉCISE si :
 *  A) Cas post-bail : une row historique_baux existe pour (annonce, proprio,
 *     locataire). Anti-trolling — pas de review sans bail prouvé.
 *  B) Cas mi-bail : bail actif (annonces.bail_signe_locataire_at +
 *     bail_signe_bailleur_at non-null) depuis ≥6 mois. Permet d'écrire une
 *     review avant la fin si le bail est long. Optionnel V2.
 *
 * ET le user n'a PAS encore soumis de review sur cette annonce/target.
 *
 * On expose 2 helpers :
 *  - checkReviewEligibility() : retourne { eligible, reason, annonce, role,
 *    historique_bail_id, target_email } pour servir l'UI bouton "Laisser une review"
 *  - publishReciprocalReview() : helper transaction quand B soumet alors que
 *    A a déjà soumis — UPDATE les 2 rows avec published_at = now()
 */

import { supabaseAdmin } from "@/lib/supabase-server"

const MIN_BAIL_DURATION_FOR_MIDREVIEW_MS = 1000 * 60 * 60 * 24 * 180  // 6 mois

export type ReviewRole = "locataire" | "proprietaire"

export interface EligibilityResult {
  eligible: boolean
  reason?: string  // si pas éligible : raison user-friendly
  annonce_id?: number
  role?: ReviewRole
  target_email?: string
  historique_bail_id?: number | null
  already_submitted?: boolean
  already_submitted_id?: number
}

/**
 * Vérifie si `author_email` peut laisser une review sur l'annonce `annonce_id`.
 * Détermine automatiquement le rôle et le target_email en cherchant la
 * relation bail en DB.
 */
export async function checkReviewEligibility(
  author_email: string,
  annonce_id: number,
): Promise<EligibilityResult> {
  if (!author_email || !annonce_id) {
    return { eligible: false, reason: "Paramètres manquants" }
  }

  // 1. Récupérer l'annonce + son proprio
  const { data: annonce } = await supabaseAdmin
    .from("annonces")
    .select("id, proprietaire_email, bail_signe_locataire_at, bail_signe_bailleur_at, locataire_email, locataire_email_at_end")
    .eq("id", annonce_id)
    .maybeSingle()
  if (!annonce) return { eligible: false, reason: "Annonce introuvable" }

  // 2. Chercher le bail clos (historique_baux) impliquant author_email
  const { data: histo } = await supabaseAdmin
    .from("historique_baux")
    .select("id, proprietaire_email, locataire_email, bail_termine_at")
    .eq("annonce_id", annonce_id)
    .or(`proprietaire_email.eq.${author_email},locataire_email.eq.${author_email}`)
    .order("bail_termine_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let role: ReviewRole | null = null
  let target_email: string | null = null
  let historique_bail_id: number | null = null
  let viaBailClos = false

  if (histo) {
    historique_bail_id = histo.id
    if (histo.proprietaire_email === author_email) {
      role = "proprietaire"
      target_email = histo.locataire_email
    } else if (histo.locataire_email === author_email) {
      role = "locataire"
      target_email = histo.proprietaire_email
    }
    viaBailClos = true
  }

  // 3. Cas mi-bail : si pas de bail clos, vérifier bail actif ≥6 mois
  if (!role && annonce.bail_signe_locataire_at && annonce.bail_signe_bailleur_at) {
    const signedAt = Math.max(
      new Date(annonce.bail_signe_locataire_at).getTime(),
      new Date(annonce.bail_signe_bailleur_at).getTime(),
    )
    const elapsed = Date.now() - signedAt
    if (elapsed >= MIN_BAIL_DURATION_FOR_MIDREVIEW_MS) {
      const tenantEmail = annonce.locataire_email || annonce.locataire_email_at_end
      if (annonce.proprietaire_email === author_email && tenantEmail) {
        role = "proprietaire"
        target_email = tenantEmail
      } else if (tenantEmail === author_email) {
        role = "locataire"
        target_email = annonce.proprietaire_email
      }
    }
  }

  if (!role || !target_email) {
    return {
      eligible: false,
      reason: viaBailClos
        ? "Lien bail trouvé mais target manquant"
        : "Aucun bail signé ≥6 mois ou terminé entre vous et un autre user sur cette annonce",
    }
  }

  // 4. A-t-il déjà soumis une review sur cette annonce/target ?
  const { data: existing } = await supabaseAdmin
    .from("reviews")
    .select("id")
    .eq("annonce_id", annonce_id)
    .eq("author_email", author_email)
    .eq("target_email", target_email)
    .maybeSingle()

  if (existing) {
    return {
      eligible: false,
      reason: "Review déjà soumise",
      annonce_id,
      role,
      target_email,
      historique_bail_id,
      already_submitted: true,
      already_submitted_id: existing.id,
    }
  }

  return {
    eligible: true,
    annonce_id,
    role,
    target_email,
    historique_bail_id,
  }
}

/**
 * Quand `author_email` soumet sa review, on vérifie si le target a déjà
 * soumis la sienne. Si oui, on publie les 2 atomiquement. Sinon la
 * nouvelle review reste avec published_at = NULL (double-aveugle).
 *
 * Retourne l'array des review IDs qui ont été publiées (0, 1 ou 2 entrées).
 */
export async function tryPublishReciprocal(
  annonce_id: number,
  author_email: string,
  target_email: string,
): Promise<number[]> {
  // Cherche la review réciproque
  const { data: reciprocal } = await supabaseAdmin
    .from("reviews")
    .select("id, published_at")
    .eq("annonce_id", annonce_id)
    .eq("author_email", target_email)
    .eq("target_email", author_email)
    .maybeSingle()

  if (!reciprocal || reciprocal.published_at) {
    // Pas de réciproque OU déjà publiée → on ne touche à rien (la nôtre
    // sera publiée plus tard quand reciprocal sera soumise OU par le cron)
    return []
  }

  // Les 2 reviews existent et sont en attente → publier les 2 maintenant
  const now = new Date().toISOString()
  const { data: published } = await supabaseAdmin
    .from("reviews")
    .update({ published_at: now })
    .or(`and(annonce_id.eq.${annonce_id},author_email.eq.${author_email},target_email.eq.${target_email}),and(annonce_id.eq.${annonce_id},author_email.eq.${target_email},target_email.eq.${author_email})`)
    .is("published_at", null)
    .select("id")

  return (published || []).map(r => r.id)
}
