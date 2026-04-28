// V25.1 (Paul 2026-04-29) — source unique de vérité pour la date de début
// d'un bail. Audit V22.1 finding HIGH #4 : `annonces.date_debut_bail` était
// dupliquée avec `bail_invitations.import_metadata.date_debut` (jsonb stockée
// par /api/bail/importer V23). Pas de sync automatique → dérive possible.
//
// Réalité prod (vérifiée V25.1 via execute_sql) :
//   - Table `baux` N'EXISTE PAS — projet n'a pas de table principale
//     bail actif séparée (pour l'instant). La spec V23.4 imaginait un
//     `baux` qui n'a jamais été créé.
//   - `bail_invitations` n'a PAS de colonne date_debut. La date est
//     juste stockée dans `annonces.import_metadata.date_debut` (JSONB) au
//     moment de l'import.
//   - `annonces.date_debut_bail` (DATE) reste la colonne canonique.
//
// Stratégie : helper qui lit dans l'ordre :
//   1. annonces.date_debut_bail (canonical, DATE typed)
//   2. annonces.import_metadata.date_debut (fallback, string YYYY-MM-DD)
//   3. null
//
// Évite les divergences quand le wizard set date_debut_bail mais l'import
// flow set seulement import_metadata.

interface AnnonceWithBailDates {
  date_debut_bail?: string | null
  import_metadata?: { date_debut?: string | null } | null
}

/**
 * Lit la date de début de bail d'une annonce dans l'ordre de priorité :
 * 1. annonces.date_debut_bail (canonical)
 * 2. annonces.import_metadata.date_debut (legacy/import flow)
 * 3. null si rien
 *
 * Retourne un Date ou null. Format input : "YYYY-MM-DD" ou ISO datetime.
 * Skip silencieusement les valeurs invalides (Number.isNaN(getTime)).
 */
export function getDateDebutBailFromAnnonce(annonce: AnnonceWithBailDates | null | undefined): Date | null {
  if (!annonce) return null
  // 1. Canonical
  if (annonce.date_debut_bail) {
    const d = new Date(annonce.date_debut_bail)
    if (Number.isFinite(d.getTime())) return d
  }
  // 2. Fallback import_metadata
  const meta = annonce.import_metadata
  if (meta && typeof meta === "object" && typeof meta.date_debut === "string" && meta.date_debut) {
    const d = new Date(meta.date_debut)
    if (Number.isFinite(d.getTime())) return d
  }
  return null
}

/**
 * Wrapper string : retourne "YYYY-MM-DD" ou null.
 * Pratique pour l'affichage UI ou l'écriture en DB (typed DATE column).
 */
export function getDateDebutBailIso(annonce: AnnonceWithBailDates | null | undefined): string | null {
  const d = getDateDebutBailFromAnnonce(annonce)
  if (!d) return null
  return d.toISOString().slice(0, 10)
}

/**
 * Wrapper formaté FR : "1er mars 2026" ou null.
 */
export function getDateDebutBailFr(annonce: AnnonceWithBailDates | null | undefined): string | null {
  const d = getDateDebutBailFromAnnonce(annonce)
  if (!d) return null
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
}
