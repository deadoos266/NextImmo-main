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
  /** V33.3 — timestamps de signature pour distinguer "envoyé" / "vous avez
   * signé en attendant l'autre" / "double signé". */
  bail_signe_locataire_at?: string | null
  bail_signe_bailleur_at?: string | null
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
  // "bail_envoye" est un statut intermédiaire après envoi du bail mais avant
  // signature du locataire. La location est considérée acceptée dès l'envoi.
  const accepteeDone =
    annonce.statut === "loué" || annonce.statut === "bail_envoye"
  const bailDone = !!annonce.bail_genere_at
  // V33.3 — On distingue 4 sous-états signature pour wording adapté :
  //   envoyé (bail_genere_at posé, aucune sig) / vous avez signé / proprio a contresigné / double signé.
  const sigLocAt = annonce.bail_signe_locataire_at || null
  const sigPropAt = annonce.bail_signe_bailleur_at || null
  const bailSigneLocataire = !!sigLocAt || annonce.statut === "loué"
  const doubleSigne = !!sigLocAt && !!sigPropAt
  const edlEntree = edls.find(e => e.type === "entree" && e.statut === "valide")
  const edlDone = !!edlEntree
  const premierLoyer = loyers.find(l => l.statut === "confirmé")
  const loyerDone = !!premierLoyer

  const annonceId = String(annonce.id)

  // V33.3 — Wording finement adapté selon role + sous-état signature.
  let bailLabel: string
  let bailDescription: string
  if (doubleSigne) {
    bailLabel = "Bail signé par les deux parties"
    bailDescription = role === "locataire"
      ? "Vous avez signé et votre bailleur a contresigné. Le bail est juridiquement actif."
      : "Vous avez tous les deux signé. Le bail est juridiquement actif."
  } else if (bailSigneLocataire) {
    bailLabel = role === "locataire" ? "Vous avez signé le bail" : "Locataire a signé le bail"
    bailDescription = role === "locataire"
      ? "Bravo. Le bailleur doit maintenant contresigner pour finaliser."
      : "Le locataire a signé. À vous de contresigner pour finaliser."
  } else if (bailDone) {
    bailLabel = role === "locataire" ? "Bail à signer" : "Bail envoyé"
    bailDescription = role === "locataire"
      ? "Votre bailleur vous a envoyé le bail. Ouvrez votre messagerie pour le lire et le signer."
      : "Bail envoyé au locataire — en attente de signature."
  } else {
    bailLabel = "Bail à générer"
    bailDescription = role === "proprietaire"
      ? "Générez le bail depuis l'espace propriétaire."
      : "Votre propriétaire va générer le contrat."
  }

  return [
    {
      key: "acceptee",
      label: role === "locataire" ? "Candidature acceptée" : "Location acceptée",
      description: accepteeDone
        ? role === "locataire"
          ? "Votre propriétaire vous a retenu pour ce logement."
          : "Le propriétaire vous a accepté."
        : role === "locataire"
          ? "En attente de la validation du propriétaire."
          : "En attente de la validation par le propriétaire.",
      done: accepteeDone,
      date: annonce.date_debut_bail ?? undefined,
    },
    {
      key: "bail",
      label: bailLabel,
      description: bailDescription,
      done: bailDone,
      date: doubleSigne
        ? (sigPropAt ?? sigLocAt ?? annonce.bail_genere_at ?? undefined)
        : bailSigneLocataire
          ? (sigLocAt ?? annonce.bail_genere_at ?? undefined)
          : annonce.bail_genere_at ?? undefined,
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
      label: role === "locataire" ? "Premier loyer payé" : "Premier loyer encaissé",
      description: loyerDone
        ? role === "locataire"
          ? "Paiement enregistré, quittance disponible."
          : "Paiement confirmé, quittance disponible."
        : role === "proprietaire"
          ? "Confirmez dès réception."
          : "Vous recevrez une quittance automatiquement après le paiement.",
      done: loyerDone,
      // V50.15 — User : "quel est l'utilité du bouton gerer ?". Avant :
      // locataire → href "/mon-logement" (= la page actuelle, no-op) +
      // label "Gérer →" (vague). Maintenant :
      // - Locataire : pas de CTA. Le locataire attend la confirmation
      //   du proprio, il ne peut rien "gérer" depuis la timeline.
      // - Proprio : href vers /proprietaire/stats (page Loyers/encaissements).
      //   Label spécifique côté composant ("Confirmer le paiement →").
      href: !loyerDone && role === "proprietaire"
        ? `/proprietaire/stats?id=${annonceId}`
        : undefined,
    },
  ]
}
