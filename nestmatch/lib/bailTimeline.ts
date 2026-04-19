/**
 * Timeline post-location : calcul des 4 étapes d'onboarding d'un bail.
 *
 * Après "Louer à ce candidat", les 2 parties restent dans un flou — cette
 * timeline rend visible la progression et les prochaines actions :
 *   1. Location acceptée (statut annonce = "loué")
 *   2. Bail signé      (bail_genere_at posé)
 *   3. EDL d'entrée validé
 *   4. Premier loyer confirmé
 *
 * Fonction pure : même input → même output, facile à tester.
 */

export type BailStepKey = "acceptee" | "bail" | "edl" | "loyer"

export type BailStep = {
  key: BailStepKey
  label: string
  description: string
  done: boolean
  date?: string
  href?: string
}

export type BailAnnonceInput = {
  id: number | string
  statut?: string | null
  bail_genere_at?: string | null
  date_debut_bail?: string | null
}

export type BailEdlInput = {
  type?: string | null
  statut?: string | null
  date_edl?: string | null
  created_at?: string | null
}

export type BailLoyerInput = {
  statut?: string | null
  mois?: string | null
}

export type BailTimelineInputs = {
  annonce: BailAnnonceInput
  edls: BailEdlInput[]
  loyers: BailLoyerInput[]
  role: "proprietaire" | "locataire"
}

export function computeBailTimeline({
  annonce,
  edls,
  loyers,
  role,
}: BailTimelineInputs): BailStep[] {
  const accepteeDone = annonce.statut === "loué"
  const bailDone = !!annonce.bail_genere_at
  const edlEntree = edls.find(e => e.type === "entree" && e.statut === "valide")
  const edlDone = !!edlEntree
  const premierLoyer = loyers.find(l => l.statut === "confirmé")
  const loyerDone = !!premierLoyer

  const annonceId = String(annonce.id)

  return [
    {
      key: "acceptee",
      label: "Location acceptée",
      description: accepteeDone
        ? "Le propriétaire vous a accepté."
        : "En attente de la validation par le propriétaire.",
      done: accepteeDone,
      date: annonce.date_debut_bail ?? undefined,
    },
    {
      key: "bail",
      label: "Bail signé",
      description: bailDone
        ? "Contrat de bail généré."
        : role === "proprietaire"
          ? "Générez le bail depuis l'onglet Documents."
          : "Votre propriétaire va générer le contrat.",
      done: bailDone,
      date: annonce.bail_genere_at ?? undefined,
      href: !bailDone && role === "proprietaire" ? `/proprietaire/bail/${annonceId}` : undefined,
    },
    {
      key: "edl",
      label: "État des lieux d'entrée",
      description: edlDone
        ? "EDL validé contradictoirement."
        : role === "proprietaire"
          ? "À réaliser lors de la remise des clés."
          : "Lors de la remise des clés avec le propriétaire.",
      done: edlDone,
      date: edlEntree?.date_edl ?? edlEntree?.created_at ?? undefined,
      href: !edlDone && role === "proprietaire" ? `/proprietaire/edl/${annonceId}` : undefined,
    },
    {
      key: "loyer",
      label: "Premier loyer encaissé",
      description: loyerDone
        ? "Paiement confirmé, quittance disponible."
        : role === "proprietaire"
          ? "Confirmez dès réception."
          : "Vous recevrez une quittance automatiquement.",
      done: loyerDone,
      href: !loyerDone
        ? (role === "proprietaire" ? `/proprietaire/stats?id=${annonceId}` : "/mon-logement")
        : undefined,
    },
  ]
}
