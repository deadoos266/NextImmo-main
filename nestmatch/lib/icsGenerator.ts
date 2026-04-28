// V4.4 (Paul 2026-04-28) — generateur de fichier .ics (RFC 5545) pour
// exporter une visite vers Apple Calendar / Google Calendar / Outlook /
// Samsung Calendar / etc. Pas de dependance externe — implem minimale
// suffisante pour un VEVENT simple.

export interface IcsEvent {
  uid: string                    // identifiant unique (visite id ou hash)
  title: string                  // ex. "Visite — T2 Lyon"
  description?: string
  location?: string              // adresse complete
  start: Date                    // date + heure debut
  durationMinutes?: number       // default 30
  organizerEmail?: string
  attendeeEmails?: string[]
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/**
 * Format date en UTC : YYYYMMDDTHHMMSSZ.
 * Important : on convertit en UTC pour eviter les problemes de timezone
 * cote calendrier importateur.
 */
function toICSDate(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  )
}

/**
 * Echappe un texte pour insertion dans une ligne ics : virgules,
 * point-virgules, retours ligne. RFC 5545 section 3.3.11.
 */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "")
}

/**
 * Genere le contenu d'un fichier .ics avec un seul VEVENT.
 * Le fichier est compatible Apple, Google, Outlook, Samsung, Thunderbird.
 */
export function generateIcs(event: IcsEvent): string {
  const dtStart = toICSDate(event.start)
  const end = new Date(event.start.getTime() + (event.durationMinutes ?? 30) * 60_000)
  const dtEnd = toICSDate(end)
  const dtStamp = toICSDate(new Date())

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KeyMatch//Visite Logement//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}@keymatch-immo.fr`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeText(event.title)}`,
  ]
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`)
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`)
  if (event.organizerEmail) lines.push(`ORGANIZER:mailto:${event.organizerEmail}`)
  for (const att of event.attendeeEmails || []) {
    lines.push(`ATTENDEE;CN=${att}:mailto:${att}`)
  }
  lines.push(
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  )
  // RFC 5545 demande CRLF en fin de ligne
  return lines.join("\r\n")
}

/**
 * Construit un data URL telechargeable depuis le contenu ics.
 * Utile pour <a href="..." download="visite.ics">.
 */
export function icsDataUrl(content: string): string {
  return "data:text/calendar;charset=utf-8," + encodeURIComponent(content)
}

/**
 * Construit un Google Calendar deep link (?action=template) qui ouvre
 * directement la creation d'evenement pre-rempli dans le compte connecte
 * de l'utilisateur. Ne necessite pas de telechargement.
 */
export function googleCalendarUrl(event: IcsEvent): string {
  const end = new Date(event.start.getTime() + (event.durationMinutes ?? 30) * 60_000)
  const fmt = (d: Date) => toICSDate(d).replace(/[-:]/g, "")
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${fmt(event.start)}/${fmt(end)}`,
  })
  if (event.description) params.set("details", event.description)
  if (event.location) params.set("location", event.location)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
