/**
 * V53.3 — GET /api/cron/loyers-retard
 *
 * Cron quotidien : check tous les loyers statut='déclaré' dont l'échéance
 * est passée de +5 jours (1er rappel) ou +15 jours (2e rappel formel).
 * Envoie 2 emails par loyer en retard (locataire + proprio) avec garde
 * `notified_retard_at` / `notified_retard_15_at` pour anti-spam.
 *
 * Échéance d'un loyer : 5 du mois (convention courante en France).
 * Le champ `loyers.mois` est au format "YYYY-MM" (V32.5 finalize.ts).
 *
 * Auth : Bearer CRON_SECRET en prod.
 *
 * Logique :
 *   1. Fetch tous les loyers `statut='déclaré'` avec mois<=courant
 *   2. Pour chaque, calcule `dueDate = mois.5` et `joursRetard = today - dueDate`
 *   3. Si joursRetard >= 15 ET notified_retard_15_at IS NULL → 2e rappel
 *      Si joursRetard >= 5 ET notified_retard_at IS NULL → 1er rappel
 *   4. Envoie 2 emails (locataire + proprio) puis update timestamp
 *   5. Idempotent : safe à re-exécuter sans spam
 */

import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { sendEmail } from "@/lib/email/resend"
import { loyerRetardLocataireTemplate, loyerRetardProprioTemplate } from "@/lib/email/templates"
import { shouldSendEmailForEvent } from "@/lib/notifPreferences"

interface LoyerRow {
  id: number
  annonce_id: number
  mois: string
  montant: number | null
  notified_retard_at: string | null
  notified_retard_15_at: string | null
}

interface AnnonceRow {
  id: number
  titre: string | null
  ville: string | null
  proprietaire_email: string | null
  locataire_email: string | null
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (secret && auth !== `Bearer ${secret}` && process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const today = new Date()
  const todayIso = today.toISOString().slice(0, 10)
  const ymCourant = todayIso.slice(0, 7)

  // Récupère les loyers déclarés des 6 derniers mois (filtre mois<=courant)
  const { data: loyersRaw, error } = await supabaseAdmin
    .from("loyers")
    .select("id, annonce_id, mois, montant, notified_retard_at, notified_retard_15_at")
    .eq("statut", "déclaré")
    .lte("mois", ymCourant)
  if (error) {
    console.error("[cron/loyers-retard] fetch error:", error)
    return NextResponse.json({ ok: false, error: "DB error" }, { status: 500 })
  }
  const loyers: LoyerRow[] = (loyersRaw || []) as LoyerRow[]

  // Annonces uniques pour résoudre proprio/locataire emails + titres
  const annIds = Array.from(new Set(loyers.map(l => l.annonce_id)))
  const annoncesMap = new Map<number, AnnonceRow>()
  if (annIds.length > 0) {
    const { data: annsData } = await supabaseAdmin
      .from("annonces")
      .select("id, titre, ville, proprietaire_email, locataire_email")
      .in("id", annIds)
    for (const a of (annsData || [])) {
      annoncesMap.set((a as AnnonceRow).id, a as AnnonceRow)
    }
  }

  const stats = {
    scanned: loyers.length,
    rappel5j_envoyes: 0,
    rappel15j_envoyes: 0,
    skipped: 0,
    errors: 0,
  }
  const base = process.env.NEXT_PUBLIC_URL || "https://keymatch-immo.fr"

  for (const l of loyers) {
    const ann = annoncesMap.get(l.annonce_id)
    if (!ann) { stats.skipped++; continue }
    if (!ann.proprietaire_email || !ann.locataire_email) { stats.skipped++; continue }

    // Calcul échéance = 5 du mois (convention)
    const [y, m] = l.mois.split("-").map(Number)
    if (!y || !m) { stats.skipped++; continue }
    const dueDate = new Date(Date.UTC(y, m - 1, 5))
    const joursRetard = Math.floor((today.getTime() - dueDate.getTime()) / (24 * 3600 * 1000))
    if (joursRetard < 5) { stats.skipped++; continue }

    const isFinal = joursRetard >= 15 && !l.notified_retard_15_at
    const isFirst = joursRetard >= 5 && joursRetard < 15 && !l.notified_retard_at
    if (!isFinal && !isFirst) { stats.skipped++; continue }

    const propEmail = ann.proprietaire_email.toLowerCase()
    const locEmail = ann.locataire_email.toLowerCase()
    const montant = Number(l.montant || 0)

    // Locataire name from profils (best-effort)
    const { data: locProf } = await supabaseAdmin
      .from("profils")
      .select("prenom, nom")
      .eq("email", locEmail)
      .maybeSingle()
    const locataireName = [locProf?.prenom, locProf?.nom].filter(Boolean).join(" ").trim() || locEmail

    try {
      const eventKey = isFinal ? "loyer_retard_j15" : "loyer_retard_j5"
      // V54.2 — respect notif_preferences (mais loyer_retard_j15 est `required`,
      // shouldSendEmailForEvent retournera toujours true côté légal).
      const [allowedLoc, allowedProp] = await Promise.all([
        shouldSendEmailForEvent(locEmail, eventKey),
        shouldSendEmailForEvent(propEmail, eventKey),
      ])
      // Email locataire
      if (allowedLoc) {
        const tplLoc = loyerRetardLocataireTemplate({
          bienTitre: ann.titre || "Logement",
          ville: ann.ville,
          mois: l.mois,
          montant,
          jours: joursRetard,
          ctaUrl: `${base}/messages?with=${encodeURIComponent(propEmail)}&annonce=${ann.id}`,
          isFinal,
        })
        await sendEmail({
          to: locEmail,
          subject: tplLoc.subject,
          html: tplLoc.html,
          text: tplLoc.text,
          tags: [
            { name: "category", value: "loyer_retard" },
            { name: "role", value: "locataire" },
            { name: "phase", value: isFinal ? "j15" : "j5" },
          ],
        })
      }
      // Email proprio
      if (allowedProp) {
        const tplProp = loyerRetardProprioTemplate({
          locataireName,
          bienTitre: ann.titre || "Logement",
          ville: ann.ville,
          mois: l.mois,
          montant,
          jours: joursRetard,
          ctaUrl: `${base}/proprietaire/stats?id=${ann.id}`,
          isFinal,
        })
        await sendEmail({
          to: propEmail,
          subject: tplProp.subject,
          html: tplProp.html,
          text: tplProp.text,
          tags: [
            { name: "category", value: "loyer_retard" },
            { name: "role", value: "proprio" },
            { name: "phase", value: isFinal ? "j15" : "j5" },
          ],
        })
      }

      // Update timestamp pour anti-spam
      const patch = isFinal
        ? { notified_retard_15_at: new Date().toISOString() }
        : { notified_retard_at: new Date().toISOString() }
      await supabaseAdmin.from("loyers").update(patch).eq("id", l.id)

      if (isFinal) stats.rappel15j_envoyes++
      else stats.rappel5j_envoyes++
    } catch (e) {
      console.warn("[cron/loyers-retard] send error for loyer", l.id, e)
      stats.errors++
    }
  }

  return NextResponse.json({ ok: true, stats, ranAt: new Date().toISOString() })
}
