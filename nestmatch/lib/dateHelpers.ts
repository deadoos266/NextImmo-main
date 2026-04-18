/**
 * Helpers de date partagés — format FR, relatif, robuste à divers formats
 * retournés par Supabase (date, timestamp, ISO).
 */

/**
 * Retourne un libellé relatif : "Aujourd'hui" / "Demain" / "Dans N j" / "Passée".
 * Utilisé pour afficher les dates de visites côté locataire et proprio.
 */
export function joursRelatif(dateIso: string): string {
  const target = new Date(dateIso)
  if (isNaN(target.getTime())) return ""
  const diff = Math.ceil((target.getTime() - Date.now()) / 86400000)
  if (diff === 0) return "Aujourd'hui"
  if (diff === 1) return "Demain"
  if (diff > 0) return `Dans ${diff} j`
  return "Passée"
}

/**
 * Parse une date sous forme "YYYY-MM-DD" ou ISO complète, retourne un
 * libellé localisé FR. "" si invalide (pas d'« Invalid Date »).
 */
export function formatDateFR(
  raw: unknown,
  opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric" }
): string {
  if (!raw || typeof raw !== "string") return ""
  const ymd = raw.split("T")[0]
  const d = new Date(ymd + "T12:00:00")
  if (isNaN(d.getTime())) return ""
  return d.toLocaleDateString("fr-FR", opts)
}
