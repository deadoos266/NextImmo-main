/**
 * V53.5 — GET /api/cron/candidatures-digest
 *
 * Cron quotidien : pour chaque proprio qui a reçu ≥1 candidature dans les
 * dernières 24h, envoie un email récap "X nouvelles candidatures hier".
 * Évite le spam d'1 email par candidature ; un seul digest par jour
 * regroupant toutes les candidatures.
 *
 * Source : `messages` avec type='candidature' AND created_at >= now()-24h.
 * Aggrégation par to_email (= proprio).
 *
 * Auth : Bearer CRON_SECRET en prod.
 *
 * Idempotent : pas de timestamp à update — la fenêtre de 24h glisse, donc
 * un même proprio ne peut recevoir qu'1 digest par exécution. Si Vercel
 * cron firr 2× par accident dans la même heure, le 2e digest contiendra
 * presque les mêmes candidatures mais c'est best-effort.
 */

import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { sendEmail } from "@/lib/email/resend"
import { candidaturesDigestTemplate } from "@/lib/email/templates"
import { calculerScore, type Profil as MatchingProfil, type Annonce as MatchingAnnonce } from "@/lib/matching"
import { shouldSendEmailForEvent } from "@/lib/notifPreferences"

interface CandidatureMsg {
  id: number
  from_email: string | null
  to_email: string | null
  annonce_id: number | null
  created_at: string
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (secret && auth !== `Bearer ${secret}` && process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { data: msgs, error } = await supabaseAdmin
    .from("messages")
    .select("id, from_email, to_email, annonce_id, created_at")
    .eq("type", "candidature")
    .gte("created_at", since)
  if (error) {
    console.error("[cron/candidatures-digest] fetch error:", error)
    return NextResponse.json({ ok: false, error: "DB error" }, { status: 500 })
  }
  const candidatures = (msgs || []) as CandidatureMsg[]

  // Group par proprio (to_email)
  const byProprio = new Map<string, CandidatureMsg[]>()
  for (const c of candidatures) {
    const to = (c.to_email || "").toLowerCase()
    if (!to) continue
    if (!byProprio.has(to)) byProprio.set(to, [])
    byProprio.get(to)!.push(c)
  }

  if (byProprio.size === 0) {
    return NextResponse.json({ ok: true, stats: { proprios: 0, emails_envoyes: 0 } })
  }

  // Charge annonces concernées
  const annIds = Array.from(new Set(candidatures.map(c => c.annonce_id).filter(Boolean) as number[]))
  const annoncesMap = new Map<number, { id: number; titre: string | null; ville: string | null }>()
  if (annIds.length > 0) {
    const { data: anns } = await supabaseAdmin
      .from("annonces")
      .select("id, titre, ville, prix, charges, surface, pieces, meuble, dpe, equipements")
      .in("id", annIds)
    for (const a of (anns || [])) {
      annoncesMap.set((a as { id: number }).id, a as { id: number; titre: string | null; ville: string | null })
    }
  }

  const stats = { proprios: 0, emails_envoyes: 0, errors: 0 }
  const base = process.env.NEXT_PUBLIC_URL || "https://keymatch-immo.fr"

  for (const [proprioEmail, list] of byProprio) {
    stats.proprios++
    // V54.2 — respect notif_preferences (candidatures_digest)
    const allowed = await shouldSendEmailForEvent(proprioEmail, "candidatures_digest")
    if (!allowed) continue
    const { data: prof } = await supabaseAdmin
      .from("profils")
      .select("prenom, nom")
      .eq("email", proprioEmail)
      .maybeSingle()

    // Construit la liste des candidatures avec score matching et profil candidat
    const items: Array<{ candidatName: string; bienTitre: string; ville: string | null; score: number | null; href: string }> = []
    for (const c of list) {
      const annId = c.annonce_id ?? 0
      const ann = annoncesMap.get(annId)
      if (!ann) continue
      const candidatEmail = (c.from_email || "").toLowerCase()
      // Profil candidat pour calcul score (best-effort)
      let candidatName = candidatEmail.split("@")[0]
      let score: number | null = null
      try {
        const { data: candProf } = await supabaseAdmin
          .from("profils")
          .select("prenom, nom, budget_min, budget_max, surface_min, surface_max, pieces_min, dpe_min, type_bail, ville_souhaitee, fibre, parking, cave, balcon, terrasse, jardin, ascenseur, animaux, fumeur, garant, type_garant")
          .eq("email", candidatEmail)
          .maybeSingle()
        if (candProf) {
          const fullName = [candProf.prenom, candProf.nom].filter(Boolean).join(" ").trim()
          if (fullName) candidatName = fullName
          // Calcul score matching
          try {
            score = calculerScore(candProf as unknown as MatchingProfil, ann as unknown as MatchingAnnonce)
            score = Math.round(score / 10) // 0-100
          } catch { /* ignore matching errors */ }
        }
      } catch { /* ignore profil fetch errors */ }
      items.push({
        candidatName,
        bienTitre: ann.titre || "Logement",
        ville: ann.ville,
        score,
        href: `${base}/messages?with=${encodeURIComponent(candidatEmail)}&annonce=${annId}`,
      })
    }
    if (items.length === 0) continue

    const proprioName = [prof?.prenom, prof?.nom].filter(Boolean).join(" ").trim() || proprioEmail
    try {
      const tpl = candidaturesDigestTemplate({
        proprioName,
        candidatures: items,
        dashboardUrl: `${base}/proprietaire`,
      })
      const result = await sendEmail({
        to: proprioEmail,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        tags: [{ name: "category", value: "candidatures_digest" }],
      })
      if (result.ok) stats.emails_envoyes++
    } catch (e) {
      console.warn("[cron/candidatures-digest] send error for", proprioEmail, e)
      stats.errors++
    }
  }

  return NextResponse.json({ ok: true, stats, ranAt: new Date().toISOString() })
}
