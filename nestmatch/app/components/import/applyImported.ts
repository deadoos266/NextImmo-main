/**
 * V97.36 P3-7 — Mapping ImportedAnnonce → AnnonceForm / toggles / etc.
 *
 * Helper pur (sans React state) qui prend le payload retourné par
 * /api/proprio/annonce/import et produit les partial updates à appliquer.
 */

import type { ImportedAnnonce } from "../../../lib/import/types"

export interface ApplyImportedResult {
  formPatch: Record<string, string | number | boolean | null>
  togglesPatch: Record<string, boolean>
  equipExtrasPatch: Record<string, boolean>
  photoUrls: string[]
  importedFields: Set<string>
  warnings: string[]
}

export function applyImported(data: ImportedAnnonce): ApplyImportedResult {
  const formPatch: ApplyImportedResult["formPatch"] = {}
  const togglesPatch: Record<string, boolean> = {}
  const equipExtrasPatch: Record<string, boolean> = {}
  const importedFields = new Set<string>()
  const warnings: string[] = [...(data.warnings || [])]

  if (data.title) { formPatch.titre = data.title.slice(0, 120); importedFields.add("titre") }
  if (data.description) { formPatch.description = data.description; importedFields.add("description") }
  if (typeof data.price === "number") { formPatch.prix = String(data.price); importedFields.add("prix") }
  if (typeof data.charges === "number") { formPatch.charges = String(data.charges); importedFields.add("charges") }
  if (typeof data.deposit === "number") { formPatch.caution = String(data.deposit); importedFields.add("caution") }
  if (typeof data.surface === "number") { formPatch.surface = String(data.surface); importedFields.add("surface") }
  if (typeof data.rooms === "number") { formPatch.pieces = String(data.rooms); importedFields.add("pieces") }
  if (typeof data.bedrooms === "number") { formPatch.chambres = String(data.bedrooms); importedFields.add("chambres") }
  if (data.floor) { formPatch.etage = String(data.floor); importedFields.add("etage") }
  if (data.dpe) { formPatch.dpe = data.dpe; importedFields.add("dpe") }
  if (data.property_type) { formPatch.type_bien = data.property_type; importedFields.add("type_bien") }
  if (data.city) { formPatch.ville = data.city; importedFields.add("ville") }
  if (data.address) { formPatch.adresse = data.address; importedFields.add("adresse") }
  if (typeof data.lat === "number") { formPatch.lat = data.lat; importedFields.add("lat") }
  if (typeof data.lng === "number") { formPatch.lng = data.lng; importedFields.add("lng") }
  if (data.available_from) { formPatch.dispo = `Disponible le ${data.available_from}`; importedFields.add("dispo") }

  // Toggles depuis furnished + equipments
  if (data.furnished === true) { togglesPatch.meuble = true; importedFields.add("meuble") }

  const eq = data.equipments || []
  for (const tag of eq) {
    const t = tag.toLowerCase()
    if (t === "parking") togglesPatch.parking = true
    else if (t === "balcon") togglesPatch.balcon = true
    else if (t === "terrasse") togglesPatch.terrasse = true
    else if (t === "cave") togglesPatch.cave = true
    else if (t === "ascenseur") togglesPatch.ascenseur = true
    else if (t === "jardin") togglesPatch.jardin = true
    else if (t === "fibre") togglesPatch.fibre = true
  }
  for (const k of Object.keys(togglesPatch)) importedFields.add(k)

  // Photos : URLs externes (à uploader manuellement pour les héberger sur Supabase)
  const photoUrls = (data.photos || []).filter(u => typeof u === "string" && /^https?:\/\//.test(u))
  if (photoUrls.length > 0) {
    warnings.push(
      `${photoUrls.length} photo${photoUrls.length > 1 ? "s" : ""} trouvée${photoUrls.length > 1 ? "s" : ""} — uploade-les manuellement à l'étape Récit (les photos hébergées chez la source ne peuvent pas être réutilisées directement).`,
    )
  }

  return { formPatch, togglesPatch, equipExtrasPatch, photoUrls, importedFields, warnings }
}
