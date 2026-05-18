/**
 * V97.39.34 — Détecte le format d'un fichier importé (Apimo / Hektor / CSV).
 *
 * Logique :
 *   1. Si le contenu commence par `<?xml` ou `<` → XML, on inspect les balises racines.
 *   2. Si la 1ère ligne contient des séparateurs CSV `,` `;` `\t` → CSV.
 *   3. Sinon → unknown.
 */

import type { ImportFormat } from "./types"

export function detectFormat(content: string): ImportFormat {
  const start = content.trim().slice(0, 500)

  if (start.startsWith("<?xml") || start.startsWith("<")) {
    // Apimo : <export><listings><listing> ou <listings><listing>
    if (/<listings?\b/i.test(start) || /<export\b/i.test(start)) {
      return "apimo"
    }
    // Hektor / Périclès : <annonces><annonce> ou <BienXMLImport>
    if (/<annonces?\b/i.test(start) || /<biensxmlimport\b/i.test(start) || /<bien\b/i.test(start)) {
      return "hektor"
    }
    // Fallback : si XML générique avec <property> on tente Apimo (couvre 80%)
    if (/<property\b/i.test(start) || /<properties\b/i.test(start)) {
      return "apimo"
    }
    return "unknown"
  }

  // CSV : 1ère ligne avec séparateurs
  const firstLine = content.split(/\r?\n/)[0] || ""
  if (firstLine.includes(",") || firstLine.includes(";") || firstLine.includes("\t")) {
    return "csv"
  }

  return "unknown"
}
