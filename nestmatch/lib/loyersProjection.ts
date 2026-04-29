/**
 * V33.5 — Projection de l'échéancier complet d'un bail.
 * Audit produit V31 R2.2 : avant ce helper, /mon-logement n'affichait que
 * les loyers DÉJÀ enregistrés dans la table loyers (générés à double-sig
 * via /api/bail/signer V23.3). Le locataire ne voyait pas son échéancier
 * futur, ce qui rendait impossible de planifier un budget.
 *
 * Cette fonction merge les loyers existants avec les projections futures
 * (mois où aucune row loyers n'existe encore) pour donner une vue complète
 * de N mois (typiquement 12 ou 36 selon la durée du bail).
 *
 * Pure function — facile à tester.
 */

export type LoyerProjete = {
  /** Format YYYY-MM */
  mois: string
  /** Date d'échéance (1er du mois calculé) en ISO */
  echeanceIso: string
  /** Montant CC attendu en € */
  montant: number
  /** Statut effectif :
   *   - "paye" : confirmé en DB
   *   - "declare" : signalé en DB, en attente confirmation
   *   - "retard" : attendu mais aucune row depuis > 5 jours après échéance
   *   - "imminent" : échéance dans les 5 prochains jours
   *   - "futur" : prochaine échéance
   *   - "passe_inconnu" : passé sans row (souvent pour les vieux baux import)
   */
  statut: "paye" | "declare" | "retard" | "imminent" | "futur" | "passe_inconnu"
  /** Jours restants avant l'échéance (négatif si passée) */
  joursAvantEcheance: number
  /** ID en DB si la row existe */
  loyerId?: number | string
  /** Quittance disponible côté DB ? */
  quittanceDispo?: boolean
  /** Date de confirmation effective si payé */
  dateConfirmation?: string | null
}

export type LoyerExistant = {
  id?: number | string | null
  mois?: string | null
  montant?: number | string | null
  statut?: string | null
  date_confirmation?: string | null
  quittance_envoyee_at?: string | null
}

interface ProjeterArgs {
  /** Date de début du bail (ISO ou YYYY-MM-DD) */
  dateDebutBail: string | null | undefined
  /** Durée en mois (12, 24, 36...). Défaut : 36 (vide). */
  dureeMois?: number
  /** Loyer mensuel CC à projeter pour les mois futurs */
  loyerCC: number
  /** Loyers déjà enregistrés en DB pour ce bail */
  loyersExistants: LoyerExistant[]
  /** Date "now" pour faciliter les tests. Défaut : Date.now() */
  now?: Date | number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function moisKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export function projeterEcheancierBail(args: ProjeterArgs): LoyerProjete[] {
  const { dateDebutBail, dureeMois = 36, loyerCC, loyersExistants } = args
  const now = args.now ? new Date(args.now) : new Date()
  if (!dateDebutBail || !Number.isFinite(loyerCC) || loyerCC <= 0) return []

  const debut = new Date(dateDebutBail)
  if (Number.isNaN(debut.getTime())) return []

  const indexExistants = new Map<string, LoyerExistant>()
  for (const l of loyersExistants) {
    if (l.mois) indexExistants.set(l.mois, l)
  }

  const result: LoyerProjete[] = []
  const nbMois = Math.max(1, Math.min(120, dureeMois)) // safety clamp

  for (let i = 0; i < nbMois; i++) {
    const echeance = new Date(debut.getFullYear(), debut.getMonth() + i, 1)
    const mois = moisKey(echeance)
    const existant = indexExistants.get(mois)
    const joursAvant = Math.round((echeance.getTime() - now.getTime()) / MS_PER_DAY)
    const montantExistant = existant?.montant != null ? Number(existant.montant) : NaN
    const montant = Number.isFinite(montantExistant) && montantExistant > 0 ? montantExistant : loyerCC

    let statut: LoyerProjete["statut"]
    if (existant?.statut === "confirmé" || existant?.statut === "paye" || existant?.statut === "payé") {
      statut = "paye"
    } else if (existant?.statut === "déclaré" || existant?.statut === "declare") {
      statut = "declare"
    } else if (joursAvant >= 0 && joursAvant <= 5) {
      statut = "imminent"
    } else if (joursAvant > 5) {
      statut = "futur"
    } else if (joursAvant < -5) {
      // Plus de 5 jours après l'échéance sans confirmation → retard
      statut = existant ? "retard" : "passe_inconnu"
    } else {
      // -5 ≤ joursAvant < 0 — léger retard tolérable
      statut = existant ? "declare" : "imminent"
    }

    result.push({
      mois,
      echeanceIso: echeance.toISOString(),
      montant,
      statut,
      joursAvantEcheance: joursAvant,
      loyerId: existant?.id ?? undefined,
      quittanceDispo: !!existant?.quittance_envoyee_at,
      dateConfirmation: existant?.date_confirmation ?? null,
    })
  }

  return result
}

/**
 * Compte le nombre de loyers payés (statut paye) sur une projection.
 */
export function compterPayes(echeancier: LoyerProjete[]): number {
  return echeancier.filter(e => e.statut === "paye").length
}

/**
 * Renvoie le prochain loyer dû (futur, imminent, ou en retard non payé).
 * Utile pour afficher "Prochaine échéance" en hero.
 */
export function prochaineEcheance(echeancier: LoyerProjete[]): LoyerProjete | null {
  return echeancier.find(e => e.statut !== "paye" && e.statut !== "passe_inconnu") || null
}
