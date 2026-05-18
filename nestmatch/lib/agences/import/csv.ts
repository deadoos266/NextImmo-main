/**
 * V97.39.34 — Parser CSV générique
 *
 * Format ultra-flexible : auto-détection des séparateurs (`,` `;` `\t`) et
 * mapping colonnes par nom (case-insensitive, accents ignorés).
 *
 * Colonnes reconnues (header EN ou FR) :
 *   titre / title / nom         → titre
 *   description                 → description
 *   ville / city                → ville
 *   code postal / zip           → code_postal
 *   adresse / address           → adresse
 *   prix / price / loyer        → prix
 *   charges                     → charges
 *   caution / deposit           → caution
 *   surface / area              → surface (m²)
 *   pieces / rooms              → pieces
 *   chambres / bedrooms         → chambres
 *   etage / floor               → etage
 *   dpe / energy                → dpe
 *   type / type_bien            → type_bien
 *   photos                      → photos (séparateur "|" entre URLs)
 *   meuble / furnished          → meuble (bool, "oui"/"yes"/"true"/"1")
 *   parking / garage            → parking
 *   ... etc pour tous les bool équipements
 *   reference / external_ref    → external_ref (pour UPSERT)
 *
 * Aucune dépendance npm : split manuel des lignes/champs (RFC 4180 simple).
 */

import type { ParsedAnnonce } from "./types"

const COLUMN_ALIASES: Record<string, keyof ParsedAnnonce> = {
  // titre
  titre: "titre", title: "titre", nom: "titre", name: "titre",
  // description
  description: "description", desc: "description",
  // ville
  ville: "ville", city: "ville", town: "ville",
  // postal code
  codepostal: "code_postal", code_postal: "code_postal", zip: "code_postal", zipcode: "code_postal", cp: "code_postal",
  // adresse
  adresse: "adresse", address: "adresse", rue: "adresse", street: "adresse",
  // prix
  prix: "prix", price: "prix", loyer: "prix", rent: "prix",
  // charges
  charges: "charges",
  // caution
  caution: "caution", deposit: "caution",
  // surface
  surface: "surface", area: "surface", superficie: "surface", m2: "surface",
  // pieces
  pieces: "pieces", rooms: "pieces", nb_pieces: "pieces",
  // chambres
  chambres: "chambres", bedrooms: "chambres", nb_chambres: "chambres",
  // etage
  etage: "etage", floor: "etage",
  // dpe
  dpe: "dpe", energy: "dpe", gespp: "dpe",
  // type
  type: "type_bien", type_bien: "type_bien", category: "type_bien",
  // photos
  photos: "photos", images: "photos", pictures: "photos",
  // bools
  meuble: "meuble", furnished: "meuble",
  fibre: "fibre", fiber: "fibre",
  parking: "parking", garage: "parking",
  cave: "cave", cellar: "cave",
  balcon: "balcon", balcony: "balcon",
  terrasse: "terrasse", terrace: "terrasse",
  jardin: "jardin", garden: "jardin",
  ascenseur: "ascenseur", elevator: "ascenseur", lift: "ascenseur",
  // ref externe
  reference: "external_ref", ref: "external_ref", external_ref: "external_ref", id: "external_ref",
  dispo: "dispo", disponibilite: "dispo",
}

function normalizeKey(h: string): string {
  return h
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_]/g, "")
}

function detectSeparator(line: string): string {
  const counts: Record<string, number> = {
    ",": (line.match(/,/g) || []).length,
    ";": (line.match(/;/g) || []).length,
    "\t": (line.match(/\t/g) || []).length,
  }
  let max = ","
  for (const [sep, n] of Object.entries(counts)) {
    if (n > counts[max]) max = sep
  }
  return max
}

/** Parse une ligne CSV en tenant compte des champs entre quotes. */
function parseLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += c
      }
    } else {
      if (c === '"') {
        inQuotes = true
      } else if (c === sep) {
        out.push(cur)
        cur = ""
      } else {
        cur += c
      }
    }
  }
  out.push(cur)
  return out
}

function asNumber(s: string): number | null {
  const cleaned = s.replace(/[^\d.,-]/g, "").replace(",", ".")
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

function asBool(s: string): boolean | null {
  const v = s.toLowerCase().trim()
  if (["oui", "yes", "true", "1", "vrai", "x"].includes(v)) return true
  if (["non", "no", "false", "0", "faux", ""].includes(v)) return false
  return null
}

export function parseCSV(csv: string): { annonces: ParsedAnnonce[]; warnings: string[] } {
  const warnings: string[] = []
  // Supprime BOM si présent
  const cleaned = csv.replace(/^﻿/, "")
  const lines = cleaned.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length < 2) {
    throw new Error("CSV vide ou sans données (header + 1 ligne minimum requise)")
  }

  const sep = detectSeparator(lines[0])
  const headers = parseLine(lines[0], sep).map(normalizeKey)

  // Vérifie qu'au moins une colonne reconnue existe
  const knownCols = headers.filter(h => COLUMN_ALIASES[h])
  if (knownCols.length === 0) {
    throw new Error(`Aucune colonne reconnue. Headers détectés : ${headers.join(", ")}. Voir la doc pour les noms acceptés.`)
  }
  if (!headers.includes("titre") && !headers.includes("title") && !headers.includes("nom") && !headers.includes("name")) {
    warnings.push("Colonne 'titre' manquante. Un titre par défaut sera généré.")
  }

  const annonces: ParsedAnnonce[] = []
  for (let i = 1; i < lines.length; i++) {
    const fields = parseLine(lines[i], sep)
    if (fields.length !== headers.length) {
      warnings.push(`Ligne ${i + 1} ignorée (${fields.length} champs vs ${headers.length} headers)`)
      continue
    }
    const row: Partial<ParsedAnnonce> & Record<string, unknown> = {}
    for (let j = 0; j < headers.length; j++) {
      const h = headers[j]
      const key = COLUMN_ALIASES[h]
      if (!key) continue
      const raw = fields[j].trim()
      if (!raw) continue

      switch (key) {
        case "prix":
        case "charges":
        case "caution":
        case "surface":
        case "pieces":
        case "chambres":
        case "etage":
          row[key] = asNumber(raw)
          break
        case "meuble":
        case "fibre":
        case "parking":
        case "cave":
        case "balcon":
        case "terrasse":
        case "jardin":
        case "ascenseur": {
          const b = asBool(raw)
          if (b !== null) row[key] = b
          break
        }
        case "photos":
          // Séparateur "|" ou ", " entre URLs
          row.photos = raw.split(/[|,]/).map(s => s.trim()).filter(Boolean)
          break
        case "external_ref":
          row.external_ref = raw
          break
        default:
          row[key] = raw
      }
    }

    if (!row.titre && row.type_bien) {
      row.titre = `${row.type_bien}${row.ville ? ` ${row.ville}` : ""}`
    }
    if (!row.titre) {
      warnings.push(`Ligne ${i + 1} : pas de titre, ignorée`)
      continue
    }

    annonces.push(row as ParsedAnnonce)
  }

  return { annonces, warnings }
}
