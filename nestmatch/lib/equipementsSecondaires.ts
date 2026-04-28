// V13 (Paul 2026-04-28) — équipements secondaires côté locataire.
//
// Le catalogue d'équipements (lave_linge, wifi, climatisation, etc.) est
// déjà défini dans lib/equipements.ts (`EQUIP_EXTRAS_GROUPS`) et utilisé
// par le proprio (saisie + popup `EquipementsModal`).
//
// V13 ajoute le PARSER côté locataire : le locataire peut maintenant
// cocher (checkbox simple, pas tri-state) un sous-ensemble d'équipements
// qu'il SOUHAITE. Stocké comme string[] dans la jsonb existante
// `profils.preferences_equipements` sous la clé `__secondaires`.
//
// Backward compat : si la clé est absente, on retourne []. L'ancien code
// du tri-state (parking/balcon/etc.) continue de fonctionner sans changement
// car on stocke `__secondaires` à côté des keys existantes — son value est
// un array, et `normalizePref` (matching.ts) renvoie undefined pour les
// arrays, donc l'ancien iterator Object.entries(prefs) skip safe.

import { EQUIP_EXTRAS_GROUPS, type EquipementKey } from "./equipements"

/**
 * Clé "magique" stockée dans preferences_equipements jsonb pour la liste
 * des équipements secondaires souhaités par le locataire. Préfixée __ pour
 * éviter toute collision future avec une vraie EquipementKey.
 */
export const SECONDAIRES_KEY = "__secondaires" as const

/**
 * Lit la liste des équipements secondaires depuis la jsonb. Retourne []
 * si absent / mal formé. Filtre pour ne garder que les keys valides du
 * catalogue (anti-pollution si quelqu'un a injecté des valeurs random).
 */
export function readEquipementsSecondaires(prefs: unknown): EquipementKey[] {
  if (!prefs || typeof prefs !== "object") return []
  const raw = (prefs as Record<string, unknown>)[SECONDAIRES_KEY]
  if (!Array.isArray(raw)) return []
  const known = new Set<string>()
  for (const g of EQUIP_EXTRAS_GROUPS) for (const i of g.items) known.add(i.k)
  return raw.filter((x): x is EquipementKey => typeof x === "string" && known.has(x))
}

/**
 * Réécrit la jsonb en remplaçant la clé `__secondaires` par la liste donnée.
 * Préserve les autres entrées (tri-state principaux). Renvoie un objet à
 * passer directement à un upsert Supabase.
 */
export function writeEquipementsSecondaires(
  currentPrefs: Record<string, unknown> | null | undefined,
  secondaires: string[],
): Record<string, unknown> {
  const base: Record<string, unknown> = currentPrefs && typeof currentPrefs === "object"
    ? { ...currentPrefs }
    : {}
  if (secondaires.length === 0) {
    delete base[SECONDAIRES_KEY]
  } else {
    base[SECONDAIRES_KEY] = secondaires
  }
  return base
}
