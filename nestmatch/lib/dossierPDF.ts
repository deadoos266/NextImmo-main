/**
 * Génération du PDF "Dossier locataire" via jsPDF natif (texte vectoriel).
 *
 * Vs html2canvas : texte sélectionnable, taille fichier ~5× inférieure, police
 * lisible, pagination propre. Pas de rendu des logos images tant que le PNG
 * base64 n'est pas inline dans brandPDF — on utilise drawLogoPDF (texte).
 */

import { drawLogoPDF } from "./brandPDF"
import { BRAND } from "./brand"

export type DossierDocEntry = {
  key: string
  label: string
  count: number
}

export type DossierData = {
  nom: string
  email: string
  telephone?: string
  dateNaissance?: string
  nationalite?: string
  situationFamiliale?: string
  nbEnfants?: number
  situationPro?: string
  employeurNom?: string
  dateEmbauche?: string
  revenusMensuels?: number | null
  nbOccupants?: number
  logementActuelType?: string
  logementActuelVille?: string
  aApl?: boolean
  mobilitePro?: boolean
  garant?: boolean
  typeGarant?: string
  presentation?: string
  villeSouhaitee?: string
  budgetMax?: number | null
  score: number
  docs: DossierDocEntry[]
}

function fmtDate(s?: string): string {
  if (!s) return "—"
  try {
    return new Date(s).toLocaleDateString("fr-FR")
  } catch {
    return s
  }
}

function fmtEuro(n?: number | null): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—"
  return `${Number(n).toLocaleString("fr-FR")} €`
}

export async function genererDossierPDF(data: DossierData): Promise<void> {
  const { default: jsPDF } = await import("jspdf")
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const W = 170
  const margin = 20
  const pageH = doc.internal.pageSize.getHeight()
  const pageW = doc.internal.pageSize.getWidth()
  let y = margin
  let pageNum = 1

  // ── Helpers locaux
  function newPage() {
    footer()
    doc.addPage()
    pageNum++
    y = margin
    header()
  }
  function check(height = 10) {
    if (y + height > pageH - 20) newPage()
  }
  function header() {
    drawLogoPDF(doc, { x: margin, y: 16, size: "medium" })
    doc.setDrawColor(220, 220, 220)
    doc.line(margin, 22, pageW - margin, 22)
    y = Math.max(y, 30)
  }
  function footer() {
    doc.setFontSize(8)
    doc.setFont("helvetica", "italic")
    doc.setTextColor(140, 140, 140)
    const editedAt = new Date().toLocaleDateString("fr-FR")
    doc.text(`Dossier locataire — Édité le ${editedAt} — ${BRAND.name}`, margin, pageH - 10)
    doc.text(`Page ${pageNum}`, pageW - margin, pageH - 10, { align: "right" })
    doc.setTextColor(0, 0, 0)
  }
  function sectionTitle(t: string) {
    check(14)
    doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(17, 17, 17)
    doc.text(t.toUpperCase(), margin, y)
    doc.setDrawColor(17, 17, 17); doc.setLineWidth(0.6)
    doc.line(margin, y + 1.5, margin + 40, y + 1.5)
    doc.setLineWidth(0.2)
    y += 8
  }
  function field(label: string, value: string) {
    check(7)
    doc.setFontSize(9); doc.setFont("helvetica", "bold")
    doc.text(`${label} :`, margin, y)
    doc.setFont("helvetica", "normal")
    const lines = doc.splitTextToSize(value || "—", W - 55)
    doc.text(lines, margin + 55, y)
    y += Math.max(5.5, lines.length * 4.8)
  }
  function paragraph(t: string) {
    if (!t) return
    check(12)
    doc.setFontSize(9); doc.setFont("helvetica", "normal")
    const lines = doc.splitTextToSize(t, W)
    lines.forEach((ln: string) => {
      check(5)
      doc.text(ln, margin, y)
      y += 4.5
    })
  }

  // ── Première page
  header()

  // Titre principal + score
  doc.setFontSize(22); doc.setFont("helvetica", "bold")
  doc.text("DOSSIER LOCATAIRE", margin, y + 4)
  y += 12
  doc.setFontSize(12); doc.setFont("helvetica", "normal"); doc.setTextColor(80, 80, 80)
  doc.text(`${data.nom || "—"}`, margin, y)
  y += 5
  doc.setFontSize(10)
  doc.text(`Complétude : ${data.score}%`, margin, y)
  doc.setTextColor(0, 0, 0)
  y += 10

  // Section Identité
  sectionTitle("Identité")
  field("Nom complet", data.nom)
  field("Email", data.email)
  field("Téléphone", data.telephone || "—")
  field("Date de naissance", fmtDate(data.dateNaissance))
  field("Nationalité", data.nationalite || "—")
  field("Situation familiale", data.situationFamiliale || "—")
  field("Enfants à charge", String(data.nbEnfants ?? 0))
  y += 3

  // Section Professionnelle
  sectionTitle("Situation professionnelle")
  field("Statut", data.situationPro || "—")
  if (data.employeurNom) field("Employeur", data.employeurNom)
  if (data.dateEmbauche) field("Date d'embauche", fmtDate(data.dateEmbauche))
  field("Revenus mensuels nets", fmtEuro(data.revenusMensuels))
  y += 3

  // Section Logement
  sectionTitle("Logement actuel & projet")
  field("Logement actuel", data.logementActuelType || "—")
  if (data.logementActuelVille) field("Ville actuelle", data.logementActuelVille)
  field("Nombre d'occupants prévus", String(data.nbOccupants ?? 1))
  if (data.villeSouhaitee) field("Ville recherchée", data.villeSouhaitee)
  if (data.budgetMax) field("Budget maximum", fmtEuro(data.budgetMax))
  const aides: string[] = []
  if (data.aApl) aides.push("Bénéficie des APL")
  if (data.mobilitePro) aides.push("Mobilité professionnelle (éligible Visale)")
  if (aides.length > 0) field("Aides / dispositifs", aides.join(" · "))
  y += 3

  // Section Garant
  sectionTitle("Garant")
  field("Garant fourni", data.garant ? "Oui" : "Non")
  if (data.garant && data.typeGarant) field("Type de garant", data.typeGarant)
  y += 3

  // Section Présentation
  if (data.presentation && data.presentation.trim()) {
    sectionTitle("Présentation")
    paragraph(data.presentation.trim())
    y += 3
  }

  // Section Documents
  sectionTitle("Pièces justificatives")
  doc.setFontSize(9); doc.setFont("helvetica", "normal")
  if (data.docs.length === 0) {
    paragraph("Aucun document déposé.")
  } else {
    for (const d of data.docs) {
      check(6)
      const marker = d.count > 0 ? "[x]" : "[ ]"
      const countStr = d.count > 1 ? ` (${d.count} fichiers)` : ""
      doc.text(`${marker}  ${d.label}${countStr}`, margin, y)
      y += 5
    }
  }

  y += 6
  doc.setFontSize(8); doc.setFont("helvetica", "italic"); doc.setTextColor(120, 120, 120)
  const disclaimer = `Ce dossier est généré par ${BRAND.name} à titre indicatif sur déclaration du locataire. Les pièces justificatives doivent être consultées séparément via le lien de partage sécurisé fourni par le locataire.`
  paragraph(disclaimer)
  doc.setTextColor(0, 0, 0)

  footer()

  const safeName = (data.nom || "locataire").replace(/[^a-zA-Z0-9-_]+/g, "_").slice(0, 40)
  doc.save(`dossier_${safeName}.pdf`)
}
