/**
 * Constantes & valeurs par défaut pour la génération d'un bail.
 *
 * - Liste ALUR des 11 équipements obligatoires pour un meublé (décret 2015-587).
 * - Liste des annexes légales habituelles.
 * - Modèles de clauses particulières préfaites.
 * - Dernier IRL publié (mis à jour manuellement via INSEE).
 */

export const EQUIPEMENTS_MEUBLE_ALUR = [
  "Literie (couette ou couverture + oreillers)",
  "Dispositif d'occultation des fenêtres dans les chambres",
  "Plaques de cuisson",
  "Four ou four à micro-ondes",
  "Réfrigérateur avec compartiment congélation (min. -6 °C)",
  "Vaisselle pour la prise des repas",
  "Ustensiles de cuisine",
  "Table et sièges",
  "Étagères de rangement",
  "Luminaires",
  "Matériel d'entretien ménager (aspirateur, balai…)",
] as const

export const EQUIPEMENTS_MEUBLE_CONFORT = [
  "Lave-linge",
  "Sèche-linge",
  "Lave-vaisselle",
  "Télévision",
  "Connexion internet (fibre/ADSL)",
  "Bureau",
  "Canapé",
  "Armoire / penderie",
  "Literie pour chaque chambre",
  "Linge de maison (draps, serviettes)",
  "Cafetière / bouilloire",
  "Grille-pain",
  "Micro-ondes (en plus du four)",
  "Fer à repasser + table",
] as const

export const ANNEXES_OBLIGATOIRES = [
  "Dossier de diagnostic technique (DPE, CREP, ERP, électricité, gaz)",
  "Notice informative sur les droits et obligations (arrêté du 29 mai 2015)",
  "État des lieux d'entrée (établi contradictoirement)",
  "Grille de vétusté (si convenue entre les parties)",
  "Règlement de copropriété (extraits concernant le locataire, si applicable)",
  "Acte de cautionnement (si garant)",
  "Attestation d'assurance habitation du locataire",
] as const

export const CLAUSES_TYPES = [
  {
    titre: "Entretien annuel de la chaudière",
    texte:
      "Le locataire s'engage à faire procéder, à ses frais, à l'entretien annuel de la chaudière individuelle du logement par un professionnel qualifié, et à remettre au bailleur l'attestation correspondante chaque année.",
  },
  {
    titre: "Ramonage",
    texte:
      "Le locataire s'engage à faire ramoner les conduits de fumée au moins une fois par an, conformément aux dispositions réglementaires, et à conserver les attestations.",
  },
  {
    titre: "Jardin à entretenir",
    texte:
      "Le locataire assure l'entretien courant du jardin (tonte, taille des haies, désherbage). L'élagage des arbres de plus de 2 mètres reste à la charge du bailleur.",
  },
  {
    titre: "Clause de solidarité (colocation)",
    texte:
      "En cas de colocation, les locataires sont solidairement tenus du paiement du loyer et des charges, ainsi que de l'exécution des obligations du présent bail. La solidarité prend fin 6 mois après la délivrance d'un congé par un colocataire, sauf si un nouveau colocataire solidaire figure au bail.",
  },
  {
    titre: "Clause résolutoire (impayés)",
    texte:
      "Conformément à l'article 24 de la loi du 6 juillet 1989, le bail sera résilié de plein droit un mois après un commandement de payer resté infructueux, en cas de non-paiement du loyer, des charges ou du dépôt de garantie aux termes convenus.",
  },
  {
    titre: "Interdiction de faire des trous dans les murs",
    texte:
      "Le locataire s'engage à ne pas percer les murs (au-delà de crochets légers) ni à modifier les revêtements sans accord écrit préalable du bailleur.",
  },
  {
    titre: "Restitution du dépôt de garantie",
    texte:
      "Le dépôt de garantie sera restitué dans un délai d'un mois à compter de la restitution des clés si l'état des lieux de sortie est conforme à celui d'entrée, ou deux mois dans le cas contraire, déduction faite des sommes dues au bailleur.",
  },
  {
    titre: "Révision du loyer (IRL)",
    texte:
      "Le loyer sera révisé chaque année à la date anniversaire du bail, en fonction de la variation de l'indice de référence des loyers (IRL) publié par l'INSEE. La révision ne peut s'appliquer que si elle est expressément stipulée au bail.",
  },
] as const

// Dernier IRL connu — à mettre à jour manuellement via https://www.insee.fr/fr/statistiques/serie/001515333
export const IRL_DERNIER = {
  trimestre: "T3 2025",
  indice: 145.47,
  publicationDate: "Octobre 2025",
  variation: "+1,40 %",
}

export const ZONES_TENDUES_VILLES = [
  // Principales villes en zone tendue (décret n° 2013-392 + actualisations)
  "paris", "lyon", "marseille", "bordeaux", "lille", "toulouse", "nantes",
  "nice", "montpellier", "strasbourg", "rennes", "grenoble", "toulon",
  "aix-en-provence", "annecy", "saint-étienne", "dijon", "angers",
  "le havre", "reims", "nancy", "nîmes", "perpignan", "orléans", "tours",
  "bayonne", "saint-nazaire", "thonon-les-bains", "cluses", "sallanches",
  "chamonix", "la rochelle", "bastia", "ajaccio", "menton", "cannes",
  "antibes", "fréjus", "grasse", "draguignan",
]

export function estZoneTendue(ville: string): boolean {
  return ZONES_TENDUES_VILLES.includes(ville.toLowerCase().trim())
}
