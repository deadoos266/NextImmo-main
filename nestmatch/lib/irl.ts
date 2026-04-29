/**
 * V34.6 — Indice de Référence des Loyers (IRL) INSEE.
 * Source : https://www.insee.fr/fr/statistiques/serie/001515333
 *
 * Tableau historique mis à jour manuellement chaque trimestre (1× / 3 mois).
 * Note : pas d'API INSEE publique sans clé OAuth, donc on hardcode + on
 * documente la maintenance.
 *
 * Pour mettre à jour : ajouter la nouvelle entrée en TÊTE du tableau
 * (la lib lit IRL_HISTORIQUE[0] comme dernier connu).
 */

export interface IrlEntry {
  /** Format "T1 2026" / "T3 2025" etc. */
  trimestre: string
  /** Année du trimestre (pour tri). */
  annee: number
  /** Numéro de trimestre 1-4. */
  trimNum: 1 | 2 | 3 | 4
  /** Indice publié (ex 145.47). */
  indice: number
  /** Date de publication (label libre). */
  publicationDate: string
  /** Variation annuelle (ex "+1.40%"). */
  variation: string
}

// Tableau historique — du plus récent au plus ancien.
// Source de vérité : https://www.insee.fr/fr/statistiques/serie/001515333
export const IRL_HISTORIQUE: IrlEntry[] = [
  // ⚠ V34.6 : valeurs T1-T4 2026 simulées (Paul 2026-04). À remplacer par
  //   les vrais publishes INSEE dès parution.
  { trimestre: "T1 2026", annee: 2026, trimNum: 1, indice: 145.66, publicationDate: "Avril 2026", variation: "+1.50%" },
  { trimestre: "T4 2025", annee: 2025, trimNum: 4, indice: 145.55, publicationDate: "Janvier 2026", variation: "+1.45%" },
  { trimestre: "T3 2025", annee: 2025, trimNum: 3, indice: 145.47, publicationDate: "Octobre 2025", variation: "+1.40%" },
  { trimestre: "T2 2025", annee: 2025, trimNum: 2, indice: 145.17, publicationDate: "Juillet 2025", variation: "+1.30%" },
  { trimestre: "T1 2025", annee: 2025, trimNum: 1, indice: 144.50, publicationDate: "Avril 2025", variation: "+1.20%" },
  { trimestre: "T4 2024", annee: 2024, trimNum: 4, indice: 143.46, publicationDate: "Janvier 2025", variation: "+2.47%" },
  { trimestre: "T3 2024", annee: 2024, trimNum: 3, indice: 143.46, publicationDate: "Octobre 2024", variation: "+2.50%" },
  { trimestre: "T2 2024", annee: 2024, trimNum: 2, indice: 143.21, publicationDate: "Juillet 2024", variation: "+3.50%" },
  { trimestre: "T1 2024", annee: 2024, trimNum: 1, indice: 142.43, publicationDate: "Avril 2024", variation: "+3.50%" },
] as const

/**
 * Retourne l'IRL le plus récent (= IRL_HISTORIQUE[0]).
 */
export function irlDernier(): IrlEntry {
  return IRL_HISTORIQUE[0]
}

/**
 * Retourne l'IRL d'un trimestre donné, ou null si inconnu.
 * Format trimestre : "T1 2026" ou {annee, trimNum}.
 */
export function irlDuTrimestre(input: string | { annee: number; trimNum: number }): IrlEntry | null {
  if (typeof input === "string") {
    return IRL_HISTORIQUE.find(e => e.trimestre === input) || null
  }
  return IRL_HISTORIQUE.find(e => e.annee === input.annee && e.trimNum === input.trimNum) || null
}

/**
 * Calcule le nouveau loyer après indexation IRL.
 * Formule légale : nouveau_loyer = ancien_loyer × (IRL_nouveau / IRL_ancien)
 *   Arrondi au centime supérieur.
 */
export function calculerNouveauLoyer(
  ancienLoyerHC: number,
  irlAncien: number,
  irlNouveau: number,
): { nouveauLoyer: number; variation: number; variationPct: number } {
  const ratio = irlNouveau / irlAncien
  const nouveauLoyer = Math.round(ancienLoyerHC * ratio * 100) / 100
  const variation = nouveauLoyer - ancienLoyerHC
  const variationPct = ratio - 1
  return { nouveauLoyer, variation, variationPct }
}

/**
 * Détermine si un bail est éligible à indexation IRL :
 *   - bail signé depuis au moins 12 mois (date anniversaire)
 *   - ET pas indexé depuis au moins 11 mois (anti double-index)
 *
 * Retourne `null` si pas éligible, ou la fenêtre d'indexation.
 */
export function fenetreIndexation(
  dateDebutBail: string | Date,
  derniereIndexationAt: string | Date | null = null,
  now: Date = new Date(),
): { eligible: boolean; prochaineDateAnniversaire: Date; joursAvantAnniv: number } {
  const debut = typeof dateDebutBail === "string" ? new Date(dateDebutBail) : dateDebutBail
  if (Number.isNaN(debut.getTime())) {
    return { eligible: false, prochaineDateAnniversaire: now, joursAvantAnniv: 0 }
  }

  // Calcule l'anniversaire le plus proche : on teste anniv passé (floor) et
  // anniv futur (ceil) dans la fenêtre [-90, +30] et on prend celui qui
  // est dans la fenêtre. Sinon on retourne l'anniv FUTUR par défaut.
  const yearsElapsed = (now.getTime() - debut.getTime()) / (365.25 * 24 * 3600 * 1000)
  const annivFutur = new Date(debut)
  annivFutur.setFullYear(annivFutur.getFullYear() + Math.max(1, Math.ceil(yearsElapsed)))
  const annivPasse = new Date(debut)
  annivPasse.setFullYear(annivPasse.getFullYear() + Math.max(1, Math.floor(yearsElapsed)))

  const joursAvantFutur = Math.round((annivFutur.getTime() - now.getTime()) / (24 * 3600 * 1000))
  const joursAvantPasse = Math.round((annivPasse.getTime() - now.getTime()) / (24 * 3600 * 1000))

  // Choisir l'anniv dans la fenêtre [-90, +30]. Préférence : futur dans 30j,
  // sinon passé < 90j.
  let prochaineDate: Date
  let joursAvantAnniv: number
  if (joursAvantFutur >= 0 && joursAvantFutur <= 30) {
    prochaineDate = annivFutur
    joursAvantAnniv = joursAvantFutur
  } else if (joursAvantPasse < 0 && joursAvantPasse >= -90 && annivPasse.getTime() !== annivFutur.getTime()) {
    prochaineDate = annivPasse
    joursAvantAnniv = joursAvantPasse
  } else {
    prochaineDate = annivFutur
    joursAvantAnniv = joursAvantFutur
  }

  // Anti double-index : pas indexé dans les 11 derniers mois.
  const dernier = derniereIndexationAt ? (typeof derniereIndexationAt === "string" ? new Date(derniereIndexationAt) : derniereIndexationAt) : null
  const ELEVEN_MONTHS_MS = 11 * 30.5 * 24 * 3600 * 1000
  const recemmentIndexe = dernier ? (now.getTime() - dernier.getTime()) < ELEVEN_MONTHS_MS : false

  const eligible = !recemmentIndexe && joursAvantAnniv <= 30 && joursAvantAnniv >= -90

  return { eligible, prochaineDateAnniversaire: prochaineDate, joursAvantAnniv }
}
