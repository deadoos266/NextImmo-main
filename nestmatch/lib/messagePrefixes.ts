/**
 * Source unique des préfixes de messages système.
 *
 * Les messages "cards" (bail, EDL, quittance, etc.) sont stockés dans la
 * table `messages` avec un préfixe entre crochets. Le rendu dans /messages
 * les détecte et affiche une carte dédiée au lieu du texte brut.
 *
 * Centraliser ici évite les doublons de constantes et les erreurs de frappe
 * (ex. "[DOSSIER_CARD]" vs "[DOSSIER_CART]").
 */

export const PREFIXES = {
  DOSSIER:              "[DOSSIER_CARD]",
  DEMANDE_DOSSIER:      "[DEMANDE_DOSSIER]",
  EDL:                  "[EDL_CARD]",
  BAIL:                 "[BAIL_CARD]",
  BAIL_SIGNE:           "[BAIL_SIGNE]",
  EDL_A_PLANIFIER:      "[EDL_A_PLANIFIER]",
  QUITTANCE:            "[QUITTANCE_CARD]",
  CANDIDATURE_RETIREE:  "[CANDIDATURE_RETIREE]",
  RELANCE:              "[RELANCE]",
  LOCATION_ACCEPTEE:    "[LOCATION_ACCEPTEE]",
} as const

export type PrefixKey = keyof typeof PREFIXES

/**
 * Retourne le préfixe du message s'il en a un, sinon null.
 */
export function getPrefix(content: string | null | undefined): PrefixKey | null {
  if (!content) return null
  const entries = Object.entries(PREFIXES) as [PrefixKey, string][]
  for (const [key, prefix] of entries) {
    if (content.startsWith(prefix)) return key
  }
  return null
}

/**
 * Retire le préfixe du contenu. Utile pour extraire la charge utile
 * (JSON, texte de relance, etc.) avant rendu.
 */
export function stripPrefix(content: string, key: PrefixKey): string {
  return content.slice(PREFIXES[key].length)
}

/**
 * Label court pour la preview d'une conv list. Retourne null si aucun
 * préfixe (le caller prendra alors le texte normal).
 */
export function previewLabel(content: string | null | undefined): string | null {
  const key = getPrefix(content)
  if (!key) return null
  switch (key) {
    case "DOSSIER": return "Dossier envoyé"
    case "DEMANDE_DOSSIER": return "Dossier demandé"
    case "EDL": return "État des lieux envoyé"
    case "BAIL": return "Bail généré"
    case "BAIL_SIGNE": return "Bail signé ✓"
    case "EDL_A_PLANIFIER": return "État des lieux à planifier"
    case "QUITTANCE": return "Quittance reçue"
    case "CANDIDATURE_RETIREE": return "Candidature retirée"
    case "RELANCE": {
      const text = (content || "").slice(PREFIXES.RELANCE.length)
      return "Relance : " + text.slice(0, 60)
    }
    case "LOCATION_ACCEPTEE": return "Location acceptée ✓"
  }
}
