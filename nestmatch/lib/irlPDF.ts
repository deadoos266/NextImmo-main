/**
 * V38.5 — Génération PDF "Avis de revalorisation IRL".
 * Audit V37 R37.5.
 *
 * Lettre formelle envoyée par le proprio au locataire pour notifier
 * l'application de l'indexation IRL annuelle (art. 17-1 loi 1989).
 *
 * jsPDF lazy-loaded (cohérent avec lib/bailPDF.ts).
 */

export interface IrlPDFData {
  // Parties
  nomBailleur: string
  adresseBailleur: string
  nomLocataire: string
  emailLocataire: string

  // Bien
  titreBien: string
  adresseBien: string
  villeBien: string

  // Indexation
  ancienLoyerHC: number
  nouveauLoyerHC: number
  charges: number
  irlAncien: number
  irlNouveau: number
  trimestreAncien: string  // "T1 2025"
  trimestreNouveau: string  // "T1 2026"
  dateEffet: string  // ISO YYYY-MM-DD
}

async function buildPdf(data: IrlPDFData): Promise<{ doc: import("jspdf").jsPDF; filename: string }> {
  const { default: jsPDF } = await import("jspdf")
  const doc = new jsPDF()
  const W = 170
  const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
  const dateEffetFr = new Date(data.dateEffet).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
  const ratio = data.irlAncien > 0 ? data.irlNouveau / data.irlAncien : 1
  const variationPct = ((ratio - 1) * 100).toFixed(2)
  const variationEur = (data.nouveauLoyerHC - data.ancienLoyerHC).toFixed(2)
  const ancienCC = data.ancienLoyerHC + data.charges
  const nouveauCC = data.nouveauLoyerHC + data.charges

  let y = 25

  // Header — Bailleur
  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.text(data.nomBailleur, 20, y); y += 5
  doc.setFont("helvetica", "normal")
  if (data.adresseBailleur) {
    const lines = doc.splitTextToSize(data.adresseBailleur, 80)
    doc.text(lines, 20, y); y += lines.length * 4.5
  }

  // Destinataire — locataire (haut droit)
  let yLoc = 25
  doc.setFont("helvetica", "bold")
  doc.text(data.nomLocataire, 130, yLoc); yLoc += 5
  doc.setFont("helvetica", "normal")
  if (data.adresseBien) {
    const lines = doc.splitTextToSize(data.adresseBien, 70)
    doc.text(lines, 130, yLoc); yLoc += lines.length * 4.5
  }
  if (data.villeBien) doc.text(data.villeBien, 130, yLoc)

  y = Math.max(y, yLoc) + 12

  // Date + lieu
  doc.setFontSize(10)
  doc.text(`Fait le ${today}`, 130, y); y += 12

  // Objet
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text("Objet : Avis de revalorisation annuelle du loyer (IRL)", 20, y); y += 10

  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.text(`Madame, Monsieur ${data.nomLocataire},`, 20, y); y += 8

  // Corps
  doc.setFontSize(10)
  const intro = `Conformément à l'article 17-1 de la loi du 6 juillet 1989 et à la clause de révision annuelle prévue dans votre bail, je vous informe de la revalorisation du loyer du logement situé ${data.adresseBien}, ${data.villeBien}, en application de l'évolution de l'Indice de Référence des Loyers (IRL) publié par l'INSEE.`
  const introLines = doc.splitTextToSize(intro, W)
  doc.text(introLines, 20, y); y += introLines.length * 4.5 + 6

  // Tableau de calcul
  doc.setFont("helvetica", "bold")
  doc.text("Calcul de la revalorisation", 20, y); y += 7
  doc.setFont("helvetica", "normal")

  const lines = [
    `IRL de référence (${data.trimestreAncien}) : ${data.irlAncien}`,
    `IRL nouveau (${data.trimestreNouveau}) : ${data.irlNouveau}`,
    `Coefficient de revalorisation : ${ratio.toFixed(5)} (${variationPct}%)`,
    "",
    `Loyer hors charges actuel : ${data.ancienLoyerHC.toLocaleString("fr-FR")} € / mois`,
    `Loyer hors charges revalorisé : ${data.nouveauLoyerHC.toLocaleString("fr-FR")} € / mois`,
    `Variation : ${variationEur} € / mois`,
    "",
    `Charges (inchangées) : ${data.charges.toLocaleString("fr-FR")} € / mois`,
    `Loyer charges comprises actuel : ${ancienCC.toLocaleString("fr-FR")} € / mois`,
    `Loyer charges comprises revalorisé : ${nouveauCC.toLocaleString("fr-FR")} € / mois`,
  ]
  lines.forEach(l => {
    doc.text(l, 22, y)
    y += 5
  })
  y += 4

  // Date d'effet
  doc.setFont("helvetica", "bold")
  doc.text(`Date d'effet : ${dateEffetFr}`, 20, y); y += 8
  doc.setFont("helvetica", "normal")

  const note = `Le montant ainsi revalorisé sera applicable à compter de la date d'effet ci-dessus pour les loyers à venir. Les loyers déjà acquittés ne sont pas concernés. Cette revalorisation est de droit, conformément à la clause d'indexation annuelle inscrite dans votre bail.`
  const noteLines = doc.splitTextToSize(note, W)
  doc.text(noteLines, 20, y); y += noteLines.length * 4.5 + 6

  doc.text("Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.", 20, y); y += 14

  // Signature placeholder
  doc.setFont("helvetica", "italic")
  doc.text("Le bailleur,", 130, y); y += 6
  doc.setFont("helvetica", "bold")
  doc.text(data.nomBailleur, 130, y); y += 14

  // Footer mention légale
  doc.setFontSize(8)
  doc.setFont("helvetica", "italic")
  doc.setTextColor(120, 120, 120)
  doc.text("Document généré par KeyMatch — keymatch-immo.fr — Référence légale : art. 17-1 loi du 6 juillet 1989.", 105, 285, { align: "center" })

  const filename = `revalorisation-irl-${(data.villeBien || "logement").toLowerCase()}-${data.dateEffet}.pdf`
  return { doc, filename }
}

/** Télécharge le PDF côté client. */
export async function genererIrlPDF(data: IrlPDFData): Promise<void> {
  const { doc, filename } = await buildPdf(data)
  doc.save(filename)
}

/** Retourne un Blob (pour preview iframe). */
export async function genererIrlPDFBlob(data: IrlPDFData): Promise<{ blob: Blob; filename: string }> {
  const { doc, filename } = await buildPdf(data)
  return { blob: doc.output("blob"), filename }
}
