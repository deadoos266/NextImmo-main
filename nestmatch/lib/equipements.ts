// Source de vérité partagée pour les équipements "étendus" stockés dans
// la colonne `annonces.equipements_extras` (jsonb). Importée par :
// - app/proprietaire/ajouter/page.tsx (saisie wizard)
// - app/proprietaire/modifier/[id]/page.tsx (édition)
// - app/annonces/[id]/EquipementsModal.tsx (popup locataire)
//
// IMPORTANT : ne PAS confondre avec les colonnes boolean directes de la
// table `annonces` (meuble, parking, cave, balcon, terrasse, jardin,
// fibre, ascenseur, animaux). Celles-ci sont des CARACTÉRISTIQUES du bien
// ou des POLITIQUES (animaux), pas des équipements.

export type EquipementKey =
  // Électroménager
  | "lave_linge" | "seche_linge" | "lave_vaisselle"
  | "four" | "micro_ondes" | "frigo" | "congelateur"
  | "plaques" | "hotte"
  // Confort
  | "wifi" | "climatisation" | "cheminee"
  | "interphone" | "gardien" | "rangements"
  | "double_vitrage" | "cuisine_equipee"
  // Exposition & vue
  | "exposition_sud" | "vue_degagee" | "traversant"

export interface EquipementsGroup {
  title: string
  items: ReadonlyArray<{ k: EquipementKey; label: string }>
}

export const EQUIP_EXTRAS_GROUPS: ReadonlyArray<EquipementsGroup> = [
  {
    title: "Électroménager",
    items: [
      { k: "lave_linge",     label: "Lave-linge" },
      { k: "seche_linge",    label: "Sèche-linge" },
      { k: "lave_vaisselle", label: "Lave-vaisselle" },
      { k: "four",           label: "Four" },
      { k: "micro_ondes",    label: "Micro-ondes" },
      { k: "frigo",          label: "Réfrigérateur" },
      { k: "congelateur",    label: "Congélateur" },
      { k: "plaques",        label: "Plaques de cuisson" },
      { k: "hotte",          label: "Hotte aspirante" },
    ],
  },
  {
    title: "Confort",
    items: [
      { k: "wifi",            label: "Wifi inclus" },
      { k: "climatisation",   label: "Climatisation" },
      { k: "cheminee",        label: "Cheminée" },
      { k: "interphone",      label: "Interphone" },
      { k: "gardien",         label: "Gardien" },
      { k: "rangements",      label: "Rangements / placards" },
      { k: "double_vitrage",  label: "Double vitrage" },
      { k: "cuisine_equipee", label: "Cuisine équipée" },
    ],
  },
  {
    title: "Exposition & vue",
    items: [
      { k: "exposition_sud", label: "Exposition sud" },
      { k: "vue_degagee",    label: "Vue dégagée" },
      { k: "traversant",     label: "Traversant" },
    ],
  },
] as const

// Aperçu locataire : N items les plus utiles à afficher en preview avant
// d'ouvrir la popup complète. Sélection éditoriale : utilité concrète au
// locataire potentiel (équipements coûteux à acheter ou clivants).
const APERCU_KEYS: EquipementKey[] = [
  "lave_linge",
  "lave_vaisselle",
  "wifi",
  "climatisation",
  "cuisine_equipee",
  "double_vitrage",
]

/**
 * Renvoie un libellé lisible pour une clé d'équipement, ou null si inconnue.
 */
export function getEquipementLabel(key: string): string | null {
  for (const group of EQUIP_EXTRAS_GROUPS) {
    const item = group.items.find(i => i.k === key)
    if (item) return item.label
  }
  return null
}

/**
 * Compte le nombre d'équipements actifs dans le jsonb proprio. Utile pour
 * conditionner l'affichage du bouton "Voir tous les équipements".
 */
export function countEquipementsActifs(extras: unknown): number {
  if (!extras || typeof extras !== "object") return 0
  return Object.values(extras as Record<string, unknown>).filter(v => v === true).length
}

/**
 * Aperçu locataire : retourne jusqu'à `max` équipements actifs, en privilégiant
 * la liste APERCU_KEYS, puis en complétant avec les autres si besoin.
 */
export function getAperçuEquipements(
  extras: unknown,
  max = 4,
): Array<{ k: string; label: string }> {
  if (!extras || typeof extras !== "object") return []
  const dict = extras as Record<string, unknown>
  const result: Array<{ k: string; label: string }> = []

  // 1. Items prioritaires en premier (dans l'ordre APERCU_KEYS)
  for (const key of APERCU_KEYS) {
    if (result.length >= max) break
    if (dict[key] === true) {
      const label = getEquipementLabel(key)
      if (label) result.push({ k: key, label })
    }
  }
  if (result.length >= max) return result

  // 2. Compléter avec les autres équipements actifs (ordre des groupes)
  for (const group of EQUIP_EXTRAS_GROUPS) {
    for (const item of group.items) {
      if (result.length >= max) break
      if (result.some(r => r.k === item.k)) continue
      if (dict[item.k] === true) {
        result.push({ k: item.k, label: item.label })
      }
    }
  }
  return result
}
