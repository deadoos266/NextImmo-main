import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

/**
 * GET /api/visites/ics
 * Génère un fichier iCalendar (.ics) avec les visites à venir de l'utilisateur
 * (côté locataire OU proprio, détection automatique).
 *
 * Permet l'export vers Google Calendar / Apple Calendar / Outlook.
 */

function escapeICS(s: string): string {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
}

function toICSDate(date: string, heure: string): string {
  // date = "2026-04-20", heure = "14:00" → "20260420T140000"
  const d = date.replace(/-/g, "")
  const h = (heure || "12:00").replace(/:/g, "") + "00"
  return `${d}T${h.padEnd(6, "0").slice(0, 6)}`
}

function addHour(icsDate: string): string {
  // On ajoute 1h pour la fin de l'événement. Simple concatenation string-level.
  const year = icsDate.slice(0, 4)
  const month = icsDate.slice(4, 6)
  const day = icsDate.slice(6, 8)
  const hh = parseInt(icsDate.slice(9, 11), 10)
  const mm = icsDate.slice(11, 13)
  const ss = icsDate.slice(13, 15)
  const newHh = (hh + 1) % 24
  return `${year}${month}${day}T${String(newHh).padStart(2, "0")}${mm}${ss}`
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 })
  }

  // Récupère toutes les visites (côté locataire OU proprio) non annulées
  const { data: visites } = await supabaseAdmin
    .from("visites")
    .select("id, annonce_id, date_visite, heure, statut, message, locataire_email, proprietaire_email")
    .or(`locataire_email.eq.${email},proprietaire_email.eq.${email}`)
    .in("statut", ["proposée", "confirmée"])
    .order("date_visite", { ascending: true })

  const annonceIds = Array.from(new Set((visites || []).map(v => v.annonce_id).filter(Boolean)))
  const { data: annonces } = annonceIds.length > 0
    ? await supabaseAdmin.from("annonces").select("id, titre, adresse, ville").in("id", annonceIds)
    : { data: [] }
  const annMap = new Map<number, any>()
  ;(annonces || []).forEach(a => annMap.set(a.id, a))

  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NestMatch//Visites//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Visites NestMatch",
    "X-WR-TIMEZONE:Europe/Paris",
  ]

  for (const v of visites || []) {
    const ann = annMap.get(v.annonce_id)
    const title = ann?.titre || "Visite d'un bien"
    const loc = ann ? `${ann.adresse || ""}, ${ann.ville || ""}`.trim().replace(/^,\s*/, "") : ""
    const start = toICSDate(v.date_visite, v.heure)
    const end = addHour(start)
    const statusText = v.statut === "confirmée" ? "Confirmée" : "Proposée (en attente)"
    const summary = `Visite · ${title}`
    const description = [
      `Visite ${statusText}`,
      ann?.ville ? `Ville : ${ann.ville}` : "",
      v.message ? `Message : ${v.message}` : "",
      "",
      "Gérer sur NestMatch : " + (process.env.NEXT_PUBLIC_URL || "https://next-immo-main.vercel.app") + "/visites",
    ].filter(Boolean).join("\n")

    lines.push(
      "BEGIN:VEVENT",
      `UID:visite-${v.id}@nestmatch`,
      `DTSTAMP:${now}`,
      `DTSTART;TZID=Europe/Paris:${start}`,
      `DTEND;TZID=Europe/Paris:${end}`,
      `SUMMARY:${escapeICS(summary)}`,
      `DESCRIPTION:${escapeICS(description)}`,
      loc ? `LOCATION:${escapeICS(loc)}` : "",
      `STATUS:${v.statut === "confirmée" ? "CONFIRMED" : "TENTATIVE"}`,
      "END:VEVENT",
    )
  }

  lines.push("END:VCALENDAR")
  const ics = lines.filter(l => l !== "").join("\r\n") + "\r\n"

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="visites-nestmatch.ics"',
      "Cache-Control": "no-store",
    },
  })
}
