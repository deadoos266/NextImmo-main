/**
 * V34.5 — Helpers préavis (notice) bail résidentiel français.
 * Audit produit V31 R3.4.
 *
 * Délai légal :
 *   - Locataire vide hors zone tendue : 3 mois.
 *   - Locataire vide en zone tendue : 1 mois.
 *   - Locataire meublé : 1 mois.
 *   - Locataire avec motif réduit (mutation pro, perte emploi, état santé) : 1 mois.
 *   - Bailleur : 6 mois minimum, motifs légaux uniquement.
 */

export type Roleurol = "locataire" | "proprietaire"

export type LocataireMotif = "mutation_pro" | "achat" | "perte_emploi" | "etat_sante" | "autre"
export type ProprietaireMotif = "vente" | "reprise" | "motif_serieux"

export const LOCATAIRE_MOTIFS: { code: LocataireMotif; label: string; reduit: boolean }[] = [
  { code: "mutation_pro", label: "Mutation professionnelle", reduit: true },
  { code: "perte_emploi", label: "Perte d'emploi", reduit: true },
  { code: "etat_sante", label: "État de santé (justificatif requis)", reduit: true },
  { code: "achat", label: "Achat d'un logement", reduit: false },
  { code: "autre", label: "Autre raison", reduit: false },
]

export const PROPRIETAIRE_MOTIFS: { code: ProprietaireMotif; label: string }[] = [
  { code: "vente", label: "Vente du logement" },
  { code: "reprise", label: "Reprise pour habiter (proprio ou famille proche)" },
  { code: "motif_serieux", label: "Motif sérieux et légitime (manquements locataire)" },
]

interface CalculePreavisArgs {
  qui: Roleurol
  meuble: boolean
  zoneTendue: boolean
  motifLocataire?: LocataireMotif
  dateEnvoi: Date
  dateDepartSouhaitee?: Date | null
}

export interface PreavisResult {
  delaiMois: number
  dateFinLegale: Date
  dateFinEffective: Date
  bonus: string | null  // explication du délai
}

/**
 * Calcule la date effective de fin de bail selon les règles légales.
 * dateFinEffective = max(dateEnvoi + delaiMois, dateDepartSouhaitee si fournie).
 */
export function calculerPreavis(args: CalculePreavisArgs): PreavisResult {
  let delaiMois: number
  let bonus: string | null = null

  if (args.qui === "proprietaire") {
    delaiMois = 6
    bonus = "Préavis bailleur : 6 mois minimum (loi du 6 juillet 1989, art. 15)."
  } else {
    if (args.meuble) {
      delaiMois = 1
      bonus = "Bail meublé : préavis 1 mois (art. 25-8 loi 1989)."
    } else if (args.zoneTendue) {
      delaiMois = 1
      bonus = "Zone tendue : préavis 1 mois (loi ALUR, art. 15-1)."
    } else if (args.motifLocataire && ["mutation_pro", "perte_emploi", "etat_sante"].includes(args.motifLocataire)) {
      delaiMois = 1
      bonus = "Motif réduit : préavis 1 mois (mutation, perte emploi, état santé — justificatif à fournir)."
    } else {
      delaiMois = 3
      bonus = "Préavis standard locataire : 3 mois (bail vide hors zone tendue)."
    }
  }

  const dateFinLegale = new Date(args.dateEnvoi)
  dateFinLegale.setMonth(dateFinLegale.getMonth() + delaiMois)

  const dateFinEffective = args.dateDepartSouhaitee && args.dateDepartSouhaitee > dateFinLegale
    ? new Date(args.dateDepartSouhaitee)
    : dateFinLegale

  return { delaiMois, dateFinLegale, dateFinEffective, bonus }
}

/**
 * Renvoie le nombre de jours restants avant la fin effective.
 * Négatif si la date est passée.
 */
export function joursAvantFinPreavis(dateFinEffective: Date | string, now: Date = new Date()): number {
  const d = typeof dateFinEffective === "string" ? new Date(dateFinEffective) : dateFinEffective
  return Math.ceil((d.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
}

/**
 * Renvoie un label humain pour un compteur ("dans 28 jours" / "demain" / "passé").
 */
export function formatJoursRestants(jours: number): string {
  if (jours > 1) return `dans ${jours} jours`
  if (jours === 1) return "demain"
  if (jours === 0) return "aujourd'hui"
  if (jours === -1) return "hier"
  if (jours < -1) return `il y a ${Math.abs(jours)} jours`
  return ""
}

/**
 * Détermine si on doit envoyer une notif de countdown selon les jalons J-30/15/7/1.
 * Retourne le jalon concerné ou null si on n'est pas pile dessus (±12h).
 */
export function jalonNotif(jours: number): 30 | 15 | 7 | 1 | null {
  for (const j of [30, 15, 7, 1] as const) {
    if (Math.abs(jours - j) === 0) return j
  }
  return null
}
