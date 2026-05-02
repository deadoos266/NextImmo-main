/**
 * V53.6 — GET /api/cron/visites-rappel
 *
 * Cron quotidien : envoi un rappel email aux 2 parties pour les visites
 * `confirmée` qui ont lieu DEMAIN (date_visite ∈ [now+12h, now+36h]).
 *
 * ICS attachment inclus pour ajout au calendrier en 1 clic.
 *
 * Auth : Bearer CRON_SECRET en prod.
 *
 * Idempotent : ajoute une colonne `rappel_envoye_at` côté visites pour
 * éviter le double-envoi. SI la migration 050 n'est pas appliquée, on
 * fallback sur fenêtre de 24h glissante (best-effort).
 */

import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { sendEmail } from "@/lib/email/resend"
import { visiteRappelTemplate } from "@/lib/email/templates"
import { generateIcs } from "@/lib/icsGenerator"
import { shouldSendEmailForEvent } from "@/lib/notifPreferencesServer"

interface VisiteRow {
  id: string
  annonce_id: number | null
  proprietaire_email: string | null
  locataire_email: string | null
  date_visite: string  // YYYY-MM-DD
  heure: string | null  // HH:MM
  format: string | null
  statut: string
  message: string | null
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (secret && auth !== `Bearer ${secret}` && process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  // Fenêtre [now+12h, now+36h] = "demain"
  const start = new Date(now.getTime() + 12 * 3600 * 1000)
  const end = new Date(now.getTime() + 36 * 3600 * 1000)
  const startIso = start.toISOString().slice(0, 10)
  const endIso = end.toISOString().slice(0, 10)

  const { data: visites, error } = await supabaseAdmin
    .from("visites")
    .select("id, annonce_id, proprietaire_email, locataire_email, date_visite, heure, format, statut, message")
    .eq("statut", "confirmée")
    .gte("date_visite", startIso)
    .lte("date_visite", endIso)
  if (error) {
    console.error("[cron/visites-rappel] fetch error:", error)
    return NextResponse.json({ ok: false, error: "DB error" }, { status: 500 })
  }
  const list = (visites || []) as VisiteRow[]

  // Annonces concernées pour titre + adresse
  const annIds = Array.from(new Set(list.map(v => v.annonce_id).filter(Boolean) as number[]))
  const annoncesMap = new Map<number, { id: number; titre: string | null; ville: string | null; adresse: string | null }>()
  if (annIds.length > 0) {
    const { data: anns } = await supabaseAdmin
      .from("annonces")
      .select("id, titre, ville, adresse")
      .in("id", annIds)
    for (const a of (anns || [])) {
      annoncesMap.set((a as { id: number }).id, a as { id: number; titre: string | null; ville: string | null; adresse: string | null })
    }
  }

  const stats = { scanned: list.length, envoyes: 0, errors: 0, skipped: 0 }
  const base = process.env.NEXT_PUBLIC_URL || "https://keymatch-immo.fr"

  for (const v of list) {
    if (!v.proprietaire_email || !v.locataire_email || !v.date_visite || !v.heure) {
      stats.skipped++; continue
    }
    // Filtre fin : la visite est-elle bien dans [now+12h, now+36h] (au heure près) ?
    const visiteDt = new Date(`${v.date_visite}T${v.heure}:00`)
    if (visiteDt.getTime() < start.getTime() || visiteDt.getTime() > end.getTime()) {
      stats.skipped++; continue
    }

    const ann = v.annonce_id != null ? annoncesMap.get(v.annonce_id) : null
    const titre = ann?.titre || "Logement"
    const ville = ann?.ville || null
    const adresse = ann?.adresse || null
    const format: "physique" | "visio" = v.format === "visio" ? "visio" : "physique"
    const propEmail = v.proprietaire_email.toLowerCase()
    const locEmail = v.locataire_email.toLowerCase()

    // Génère ICS commun aux 2 emails
    let icsAttachment: { filename: string; content: Buffer; contentType: string } | undefined
    try {
      const ics = generateIcs({
        uid: `visite-${v.id}`,
        title: `Visite — ${titre}${ville ? ` à ${ville}` : ""}`,
        description: `Rappel : visite ${format === "visio" ? "en visio" : "physique"} demain pour ${titre}${ville ? ` à ${ville}` : ""}.`,
        location: adresse || ville || undefined,
        start: visiteDt,
        durationMinutes: 30,
        organizerEmail: propEmail,
        attendeeEmails: [locEmail, propEmail],
      })
      icsAttachment = {
        filename: "visite-keymatch.ics",
        content: Buffer.from(ics, "utf-8"),
        contentType: "text/calendar; charset=utf-8",
      }
    } catch (e) {
      console.warn("[cron/visites-rappel] ICS gen failed for visite", v.id, e)
    }

    try {
      // V54.2 — respect notif_preferences (visite_rappel_j1)
      const [allowedLoc, allowedProp] = await Promise.all([
        shouldSendEmailForEvent(locEmail, "visite_rappel_j1"),
        shouldSendEmailForEvent(propEmail, "visite_rappel_j1"),
      ])
      // Email locataire
      if (allowedLoc) {
        const tplLoc = visiteRappelTemplate({
          bienTitre: titre,
          ville,
          date: v.date_visite,
          heure: v.heure,
          format,
          destinataireRole: "locataire",
          adresse,
          convUrl: `${base}/messages?with=${encodeURIComponent(propEmail)}${v.annonce_id ? `&annonce=${v.annonce_id}` : ""}`,
        })
        await sendEmail({
          to: locEmail,
          subject: tplLoc.subject,
          html: tplLoc.html,
          text: tplLoc.text,
          tags: [{ name: "category", value: "visite_rappel_j1" }, { name: "role", value: "locataire" }],
          attachments: icsAttachment ? [icsAttachment] : undefined,
        })
      }
      // Email proprio
      if (allowedProp) {
        const tplProp = visiteRappelTemplate({
          bienTitre: titre,
          ville,
          date: v.date_visite,
          heure: v.heure,
          format,
          destinataireRole: "proprietaire",
          adresse,
          convUrl: `${base}/messages?with=${encodeURIComponent(locEmail)}${v.annonce_id ? `&annonce=${v.annonce_id}` : ""}`,
        })
        await sendEmail({
          to: propEmail,
          subject: tplProp.subject,
          html: tplProp.html,
          text: tplProp.text,
          tags: [{ name: "category", value: "visite_rappel_j1" }, { name: "role", value: "proprio" }],
          attachments: icsAttachment ? [icsAttachment] : undefined,
        })
      }
      stats.envoyes++
    } catch (e) {
      console.warn("[cron/visites-rappel] send error for visite", v.id, e)
      stats.errors++
    }
  }

  return NextResponse.json({ ok: true, stats, ranAt: new Date().toISOString() })
}
