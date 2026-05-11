/**
 * POST /api/bail/accepter/[token]
 *
 * Le locataire clique sur le lien email "Accepter et créer mon compte".
 * Cette route :
 *  1. Valide le token (existe, statut=pending, pas expiré).
 *  2. Vérifie que le user connecté correspond bien à locataire_email
 *     (sinon retourne `requireLogin` avec l'email à utiliser).
 *  3. Marque l'invitation `accepted` + responded_at.
 *  4. Met à jour l'annonce : bail_source = 'imported',
 *     locataire_email = email du user (statut déjà 'loué' depuis l'import).
 *  5. Crée une notif cloche pour le proprio + envoie email confirmation.
 *
 * GET /api/bail/accepter/[token] : retourne les détails de l'invitation
 * (utilisé par la page /bail-invitation/[token] avant action).
 */

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../../../lib/auth"
import { supabaseAdmin } from "../../../../../lib/supabase-server"
import { sendEmail } from "../../../../../lib/email/resend"
import { bailImportAcceptedTemplate } from "../../../../../lib/email/templates"
import { shouldSendEmailForEvent } from "../../../../../lib/notifPreferencesServer"

export const runtime = "nodejs"

interface RouteParams {
  params: Promise<{ token: string }>
}

/**
 * V89.9 — Liste tous les mois YYYY-MM entre 2 dates (inclus).
 * Ex: monthsBetween("2025-10-15", "2026-05-11") = ["2025-10","2025-11",...,"2026-05"]
 */
function monthsBetween(startIso: string, endIso: string): string[] {
  const start = new Date(startIso)
  const end = new Date(endIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []
  const months: string[] = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const stop = new Date(end.getFullYear(), end.getMonth(), 1)
  while (cursor.getTime() <= stop.getTime()) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`)
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return months
}

async function loadInvitation(token: string) {
  const { data, error } = await supabaseAdmin
    .from("bail_invitations")
    .select("id, annonce_id, proprietaire_email, locataire_email, statut, loyer_hc, charges, message_proprio, expires_at, responded_at, created_at")
    .eq("token", token)
    .maybeSingle()
  if (error) {
    console.error("[bail/accepter] load failed", error)
    return null
  }
  return data
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { token } = await params
  if (!token || token.length < 32) {
    return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 400 })
  }

  const invit = await loadInvitation(token)
  if (!invit) {
    return NextResponse.json({ ok: false, error: "Invitation introuvable" }, { status: 404 })
  }

  // Joindre le titre/ville de l'annonce + nom proprio pour l'affichage
  const [{ data: annonce }, { data: proprioProfil }] = await Promise.all([
    supabaseAdmin
      .from("annonces")
      .select("id, titre, ville, adresse, surface, pieces, meuble, prix, charges, bail_source, import_metadata")
      .eq("id", invit.annonce_id)
      .maybeSingle(),
    supabaseAdmin
      .from("profils")
      .select("nom, prenom")
      .eq("email", invit.proprietaire_email)
      .maybeSingle(),
  ])

  const proprioName = [proprioProfil?.prenom, proprioProfil?.nom].filter(Boolean).join(" ") || invit.proprietaire_email
  const isExpired = new Date(invit.expires_at).getTime() < Date.now()

  return NextResponse.json({
    ok: true,
    invitation: {
      id: invit.id,
      statut: isExpired && invit.statut === "pending" ? "expired" : invit.statut,
      proprietaireEmail: invit.proprietaire_email,
      proprietaireName: proprioName,
      locataireEmail: invit.locataire_email,
      loyerHC: invit.loyer_hc,
      charges: invit.charges,
      messageProprio: invit.message_proprio,
      expiresAt: invit.expires_at,
      respondedAt: invit.responded_at,
      annonce,
    },
  })
}

export async function POST(_req: Request, { params }: RouteParams) {
  const { token } = await params
  if (!token || token.length < 32) {
    return NextResponse.json({ ok: false, error: "Token invalide" }, { status: 400 })
  }

  const session = await getServerSession(authOptions)
  const userEmail = session?.user?.email?.toLowerCase()

  const invit = await loadInvitation(token)
  if (!invit) {
    return NextResponse.json({ ok: false, error: "Invitation introuvable" }, { status: 404 })
  }
  if (invit.statut !== "pending") {
    return NextResponse.json({ ok: false, error: `Invitation déjà ${invit.statut}` }, { status: 409 })
  }
  if (new Date(invit.expires_at).getTime() < Date.now()) {
    await supabaseAdmin
      .from("bail_invitations")
      .update({ statut: "expired", responded_at: new Date().toISOString() })
      .eq("id", invit.id)
    return NextResponse.json({ ok: false, error: "Invitation expirée" }, { status: 410 })
  }

  // Pas connecté → demande de login avec l'email cible préfilled
  if (!userEmail) {
    return NextResponse.json({
      ok: false,
      requireLogin: true,
      targetEmail: invit.locataire_email,
      error: `Connectez-vous avec ${invit.locataire_email} pour accepter cette invitation.`,
    }, { status: 401 })
  }

  // Connecté avec un autre email → erreur claire
  if (userEmail !== invit.locataire_email.toLowerCase()) {
    return NextResponse.json({
      ok: false,
      wrongAccount: true,
      targetEmail: invit.locataire_email,
      error: `Cette invitation a été envoyée à ${invit.locataire_email}. Connectez-vous avec ce compte.`,
    }, { status: 403 })
  }

  // Marque accepted
  const now = new Date().toISOString()
  const { error: updErr } = await supabaseAdmin
    .from("bail_invitations")
    .update({ statut: "accepted", responded_at: now })
    .eq("id", invit.id)
    .eq("statut", "pending")  // double check anti-race

  if (updErr) {
    console.error("[bail/accepter] update invitation failed", updErr)
    return NextResponse.json({ ok: false, error: "Mise à jour invitation a échoué" }, { status: 500 })
  }

  // V89.1 — Met à jour l'annonce avec TOUS les champs d'état du bail.
  // Sans ça : préavis bloqué, IRL bloquée, avenants bloqués, /mon-logement
  // affiche "Bail en préparation", échéancier vide, etc. (cf audit V88).
  //
  // Pour un bail importé, on considère l'acceptance comme l'équivalent d'une
  // double signature plateforme (le PDF est déjà signé hors KeyMatch). Donc
  // bail_signe_* = accepted_at pour débloquer tout l'aval.
  //
  // date_debut_bail : vient de import_metadata.date_debut si fourni, sinon
  // fallback sur la date du jour (au pire le proprio corrigera après).
  const { data: annonceForMeta } = await supabaseAdmin
    .from("annonces")
    .select("import_metadata")
    .eq("id", invit.annonce_id)
    .maybeSingle()
  const meta = (annonceForMeta?.import_metadata as Record<string, unknown> | null) || {}
  const dateDebut = typeof meta.date_debut === "string" && meta.date_debut
    ? meta.date_debut
    : now.slice(0, 10)

  const { error: annonceErr } = await supabaseAdmin
    .from("annonces")
    .update({
      bail_source: "imported",
      locataire_email: userEmail,
      date_debut_bail: dateDebut,
      bail_genere_at: now,
      bail_signe_locataire_at: now,
      bail_signe_bailleur_at: now,
    })
    .eq("id", invit.annonce_id)
    .eq("proprietaire_email", invit.proprietaire_email)  // sécurité

  if (annonceErr) {
    console.error("[bail/accepter] update annonce failed", annonceErr)
    return NextResponse.json({
      ok: false,
      error: "Liaison de l'annonce au compte a échoué. Réessayez ou contactez le support.",
      detail: annonceErr.message,
    }, { status: 500 })
  }

  // V89.9 — Génération rétroactive : loyers passés + EDL d'entrée si le
  // locataire était déjà installé avant l'import (cas "migration en cours
  // de bail").
  let generatedLoyers = 0
  let generatedEdl = false
  if (meta.deja_installe === true) {
    // 1. Loyers passés
    if (meta.loyers_passes_payes === true) {
      const dateEntree = (meta.date_entree_reelle as string | null) || dateDebut
      const months = monthsBetween(dateEntree, now.slice(0, 10))
      if (months.length > 0) {
        // Récupère les infos de l'annonce pour titre/montant
        const { data: annDetails } = await supabaseAdmin
          .from("annonces")
          .select("titre, prix, charges")
          .eq("id", invit.annonce_id)
          .maybeSingle()
        const montant = Math.round((Number(annDetails?.prix) || 0) + (Number(annDetails?.charges) || 0))
        if (montant > 0) {
          // Évite doublons : vérifier les mois déjà présents pour cette annonce
          const { data: existingLoyers } = await supabaseAdmin
            .from("loyers")
            .select("mois")
            .eq("annonce_id", invit.annonce_id)
          const existingSet = new Set((existingLoyers || []).map(l => l.mois))
          const toInsert = months
            .filter(m => !existingSet.has(m))
            .map(mois => ({
              annonce_id: invit.annonce_id,
              proprietaire_email: invit.proprietaire_email,
              locataire_email: userEmail,
              titre_bien: annDetails?.titre || null,
              mois,
              montant,
              statut: "confirmé",
              date_confirmation: now,
              created_at: now,
            }))
          if (toInsert.length > 0) {
            const { error: loyersErr } = await supabaseAdmin.from("loyers").insert(toInsert)
            if (loyersErr) {
              console.error("[bail/accepter] loyers backfill failed", loyersErr)
            } else {
              generatedLoyers = toInsert.length
            }
          }
        }
      }
    }

    // 2. EDL d'entrée pré-rempli "valide" si flag edl_entree_deja_fait
    if (meta.edl_entree_deja_fait === true) {
      const { count } = await supabaseAdmin
        .from("etats_des_lieux")
        .select("id", { count: "exact", head: true })
        .eq("annonce_id", invit.annonce_id)
        .eq("type", "entree")
      if ((count || 0) === 0) {
        // Récupère profils proprio + locataire pour pré-remplir l'EDL
        const [{ data: propProfil }, { data: locProfil }] = await Promise.all([
          supabaseAdmin.from("profils").select("nom, prenom").eq("email", invit.proprietaire_email).maybeSingle(),
          supabaseAdmin.from("profils").select("nom, prenom").eq("email", userEmail).maybeSingle(),
        ])
        const dateEdl = (meta.date_entree_reelle as string | null) || dateDebut
        const { error: edlErr } = await supabaseAdmin.from("etats_des_lieux").insert({
          annonce_id: invit.annonce_id,
          proprietaire_email: invit.proprietaire_email,
          locataire_email: userEmail,
          type: "entree",
          statut: "valide",
          date_edl: dateEdl,
          prenom_bailleur: propProfil?.prenom || null,
          nom_bailleur: propProfil?.nom || null,
          email_bailleur: invit.proprietaire_email,
          prenom_locataire: locProfil?.prenom || null,
          nom_locataire: locProfil?.nom || null,
          email_locataire: userEmail,
          observations: "État des lieux d'entrée réalisé hors plateforme et déclaré valide à l'import KeyMatch. Aucun document scanné n'a été uploadé — référence : votre exemplaire papier original.",
          signe_locataire_at: now,
          signe_bailleur_at: now,
          date_validation: now,
        })
        if (edlErr) {
          console.error("[bail/accepter] EDL backfill failed", edlErr)
        } else {
          generatedEdl = true
        }
      }
    }
  }

  // V92.1 — Création de la conversation proprio ↔ locataire avec :
  //  - 1 message [BAIL_CARD] (= card du bail + lien PDF) qui apparaît dans /messages
  //    ET active la section "Mon bail" sur /mon-logement (cf api/bail/card-payload)
  //  - 1 message texte d'introduction ("Bienvenue sur KeyMatch...") pour expliquer
  //    le but de la conv et inviter à discuter
  try {
    const { data: annDataForCard } = await supabaseAdmin
      .from("annonces")
      .select("titre, ville, adresse, prix, charges, surface, pieces, meuble, bail_pdf_url")
      .eq("id", invit.annonce_id)
      .maybeSingle()
    const loyerHC = Number(annDataForCard?.prix) || 0
    const charges = Number(annDataForCard?.charges) || 0
    const bailCardPayload = {
      _imported: true,
      fichierUrl: annDataForCard?.bail_pdf_url || null,
      titreBien: annDataForCard?.titre || "Logement",
      villeBien: annDataForCard?.ville || "",
      adresseBien: annDataForCard?.adresse || "",
      surface: annDataForCard?.surface || null,
      pieces: annDataForCard?.pieces || null,
      meuble: annDataForCard?.meuble ?? false,
      loyerHC,
      charges,
      dateDebut: dateDebut,
      duree: meta.duree_mois || 36,
      depotGarantie: meta.depot_garantie || 0,
    }
    const introText = `Bonjour, votre bail pour ${annDataForCard?.titre || "le logement"}${annDataForCard?.ville ? " à " + annDataForCard.ville : ""} est désormais lié à KeyMatch. Vous trouverez ici l'historique de vos quittances, l'EDL et toutes les notifications liées à votre location. N'hésitez pas à utiliser cette conversation pour échanger.`
    await supabaseAdmin.from("messages").insert([
      {
        from_email: invit.proprietaire_email,
        to_email: userEmail,
        contenu: `[BAIL_CARD]${JSON.stringify(bailCardPayload)}`,
        lu: false,
        annonce_id: invit.annonce_id,
        created_at: now,
      },
      {
        from_email: invit.proprietaire_email,
        to_email: userEmail,
        contenu: introText,
        lu: false,
        annonce_id: invit.annonce_id,
        created_at: new Date(Date.now() + 1).toISOString(),  // +1ms pour ordering stable
      },
    ])
  } catch (e) {
    console.error("[bail/accepter] conv create failed (non-blocking)", e)
  }

  // V89.1 — Notif cloche proprio (href pointe sur la fiche bail, pas dashboard générique)
  const proprioHref = `/proprietaire/bail/${invit.annonce_id}`
  try {
    await supabaseAdmin.from("notifications").insert([{
      user_email: invit.proprietaire_email,
      type: "bail_invitation_accepted",
      title: "Bail accepté",
      body: `${invit.locataire_email} a accepté votre invitation et rejoint la plateforme.`,
      href: proprioHref,
      related_id: String(invit.annonce_id),
      lu: false,
      created_at: now,
    }])
  } catch (e) {
    console.error("[bail/accepter] notif insert failed", e)
  }

  // V89.4 — Email proprio avec checklist post-acceptance (EDL, premier loyer, etc.)
  try {
    // Réutilise le canal `bail_actif` (audience: both, required) qui couvre
    // sémantiquement "le bail vient de devenir actif" — pas de clé dédiée
    // dans NOTIF_EVENTS pour le moment.
    const allowed = await shouldSendEmailForEvent(invit.proprietaire_email, "bail_actif")
    if (allowed) {
      const [{ data: locProfil }, { data: annData }] = await Promise.all([
        supabaseAdmin.from("profils").select("nom, prenom").eq("email", userEmail).maybeSingle(),
        supabaseAdmin.from("annonces").select("titre, ville").eq("id", invit.annonce_id).maybeSingle(),
      ])
      const locataireName = [locProfil?.prenom, locProfil?.nom].filter(Boolean).join(" ") || invit.locataire_email
      const base = process.env.NEXT_PUBLIC_URL || "https://keymatch-immo.fr"
      const { subject, html, text } = bailImportAcceptedTemplate({
        locataireName,
        bienTitre: annData?.titre || "Logement",
        ville: annData?.ville || null,
        bailUrl: `${base}${proprioHref}`,
      })
      await sendEmail({
        to: invit.proprietaire_email,
        subject,
        html,
        text,
        templateName: "bail_import_accepted",
        tags: [{ name: "type", value: "bail_import_accepted" }],
      })
    }
  } catch (e) {
    console.error("[bail/accepter] proprio email failed", e)
  }

  return NextResponse.json({
    ok: true,
    annonceId: invit.annonce_id,
    // V88.fix — redirect côté locataire vers son espace logement, pas /proprietaire
    redirect: "/mon-logement",
    // V89.9 — Stats backfill
    generatedLoyers,
    generatedEdl,
  })
}
