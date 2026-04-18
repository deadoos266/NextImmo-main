/**
 * Utilitaires communs pour le suivi des loyers (locataire + proprio).
 */

/**
 * Nombre de jours de retard d'un loyer par rapport à une date butoir au 10 du mois.
 *
 * Règles :
 * - Un loyer "confirmé" n'est jamais en retard.
 * - Un loyer "déclaré" mais non confirmé est en retard après le 10 du mois.
 * - Une valeur de `mois` invalide renvoie 0 (échec gracieux).
 *
 * @param mois format "YYYY-MM" (conforme au schéma loyers)
 * @param statut statut DB : "confirmé" | "déclaré" | null
 */
export function joursRetardLoyer(mois: string | null | undefined, statut: string | null | undefined): number {
  if (!mois || statut === "confirmé") return 0
  const [yStr, mStr] = String(mois).split("-")
  const y = Number(yStr), m = Number(mStr)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return 0
  const echeance = new Date(y, m - 1, 10, 23, 59, 59)
  const diff = Math.floor((Date.now() - echeance.getTime()) / 86400000)
  return diff > 0 ? diff : 0
}

/**
 * Libellé humain du retard (pour badge UI).
 */
export function labelRetard(jours: number): string {
  if (jours <= 0) return ""
  if (jours === 1) return "En retard 1 j"
  return `En retard ${jours} j`
}
