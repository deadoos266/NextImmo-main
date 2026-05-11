/**
 * V97.6 — Helpers pour rendre du texte dans des PDFs jsPDF avec les fonts
 * standard (helvetica, times, courier), qui sont Latin-1 only.
 *
 * Problème : les accents et caractères spéciaux non Latin-1 (é, è, à, œ,
 * €, →, ✓, m², etc.) sortent comme "?" ou glyphes vides dans le PDF
 * généré, alors qu'ils s'affichent bien dans l'UI HTML.
 *
 * Solution : désaccentuer + remplacer les ligatures/symboles avant
 * `doc.text()`. Garde le rendu propre sans alourdir le bundle avec
 * une font TTF UTF-8 embarquée (qui ajouterait 200-500 KB).
 *
 * Trade-off : "État des lieux d'entrée" -> "Etat des lieux d'entree" dans
 * le PDF. Acceptable côté preuve juridique (le contenu reste lisible) en
 * attendant qu'on passe sur jsPDF + Noto Sans en V98 si besoin.
 */

// eslint-disable-next-line no-misleading-character-class
const COMBINING_MARKS = /[̀-ͯ]/g

/**
 * Convertit une chaîne UTF-8 quelconque en équivalent Latin-1 safe pour
 * jsPDF (helvetica/times/courier).
 *
 * - Désaccentue (NFD + retrait des combining marks U+0300-U+036F).
 * - Remplace les ligatures (œ, æ).
 * - Convertit les symboles courants (€, ©, →, ✓, …, m²).
 * - Préserve ponctuation, espaces, chiffres, lettres ASCII.
 *
 * @example pdfStr("État des lieux d'entrée") -> "Etat des lieux d'entree"
 * @example pdfStr("Loyer 850 € · 25 m²")     -> "Loyer 850 EUR . 25 m2"
 */
export function pdfStr(s: unknown): string {
  if (s == null) return ""
  const str = String(s)
  return str
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/œ/g, "oe").replace(/Œ/g, "OE")
    .replace(/æ/g, "ae").replace(/Æ/g, "AE")
    .replace(/ß/g, "ss")
    .replace(/€/g, "EUR")           // €
    .replace(/©/g, "(c)")            // ©
    .replace(/®/g, "(r)")            // ®
    .replace(/™/g, "(tm)")           // ™
    .replace(/[«»]/g, '"')      // « »
    .replace(/[‘’]/g, "'")      // ' '
    .replace(/[“”]/g, '"')      // " "
    .replace(/[–—]/g, "-")      // – —
    .replace(/…/g, "...")            // …
    .replace(/→/g, "->")             // →
    .replace(/←/g, "<-")             // ←
    .replace(/↗/g, "^")              // ↗
    .replace(/✓/g, "OK")             // ✓
    .replace(/✗/g, "X")              // ✗
    .replace(/✉/g, "(@)")            // ✉
    .replace(/°/g, "deg")            // °
    .replace(/²/g, "2")              // ²
    .replace(/³/g, "3")              // ³
    .replace(/·/g, ".")              // ·
    // Fallback : tout caractère non-ASCII restant -> "?"
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x00-\x7F]/g, "?")
}

/**
 * Wrap d'un tableau (cas multi-ligne après splitTextToSize).
 */
export function pdfStrLines(lines: string[] | string): string[] {
  if (Array.isArray(lines)) return lines.map(l => pdfStr(l))
  return [pdfStr(lines)]
}
