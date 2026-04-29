/**
 * V38.5 — Génération PDF "Lettre de congé / préavis".
 * Audit V37 R37.6.
 *
 * Lettre formelle envoyée par locataire OU bailleur pour donner congé,
 * conforme à la loi du 6 juillet 1989 (art. 12 / 15).
 *
 * jsPDF lazy-loaded.
 */

import type { LocataireMotif, ProprietaireMotif } from "./preavis"

export interface PreavisPDFData {
  // Auteur du congé (qui envoie la lettre)
  qui: "locataire" | "proprietaire"
  nomAuteur: string
  adresseAuteur: string

  // Destinataire (l'autre partie)
  nomDestinataire: string
  adresseDestinataire: string

  // Bien
  titreBien: string
  adresseBien: string
  villeBien: string

  // Préavis
  motif: LocataireMotif | ProprietaireMotif
  motifLabel: string
  motifDetail?: string
  dateEnvoi: string  // ISO YYYY-MM-DD
  delaiMois: number
  dateFinEffective: string  // ISO YYYY-MM-DD
}

async function buildPdf(data: PreavisPDFData): Promise<{ doc: import("jspdf").jsPDF; filename: string }> {
  const { default: jsPDF } = await import("jspdf")
  const doc = new jsPDF()
  const W = 170
  const dateEnvoiFr = new Date(data.dateEnvoi).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
  const dateFinFr = new Date(data.dateFinEffective).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })

  let y = 25

  // Auteur en haut gauche
  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.text(data.nomAuteur, 20, y); y += 5
  doc.setFont("helvetica", "normal")
  if (data.adresseAuteur) {
    const lines = doc.splitTextToSize(data.adresseAuteur, 80)
    doc.text(lines, 20, y); y += lines.length * 4.5
  }

  // Destinataire en haut droite
  let yDest = 25
  doc.setFont("helvetica", "bold")
  doc.text(data.nomDestinataire, 130, yDest); yDest += 5
  doc.setFont("helvetica", "normal")
  if (data.adresseDestinataire) {
    const lines = doc.splitTextToSize(data.adresseDestinataire, 70)
    doc.text(lines, 130, yDest); yDest += lines.length * 4.5
  }

  y = Math.max(y, yDest) + 12

  // Date
  doc.text(`Fait le ${dateEnvoiFr}`, 130, y); y += 6
  // Recommandé
  doc.setFont("helvetica", "italic")
  doc.text("Lettre recommandée avec AR (recommandé)", 130, y); y += 12
  doc.setFont("helvetica", "normal")

  // Objet
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  const objetTitre = data.qui === "locataire"
    ? "Objet : Congé / lettre de résiliation du bail"
    : "Objet : Congé donné au locataire (vente / reprise / motif sérieux)"
  doc.text(objetTitre, 20, y); y += 10

  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.text(`Madame, Monsieur,`, 20, y); y += 8

  // Corps
  const intro = data.qui === "locataire"
    ? `Par la présente, je vous notifie mon souhait de mettre fin au bail concernant le logement situé ${data.adresseBien}, ${data.villeBien}, conformément à l'article 12 de la loi du 6 juillet 1989.`
    : `Par la présente, je vous notifie mon souhait de mettre fin au bail concernant le logement situé ${data.adresseBien}, ${data.villeBien}, conformément à l'article 15 de la loi du 6 juillet 1989.`
  const introLines = doc.splitTextToSize(intro, W)
  doc.text(introLines, 20, y); y += introLines.length * 4.5 + 6

  doc.setFont("helvetica", "bold")
  doc.text(`Motif : ${data.motifLabel}`, 20, y); y += 7
  doc.setFont("helvetica", "normal")
  if (data.motifDetail) {
    const detailLines = doc.splitTextToSize(data.motifDetail, W)
    doc.text(detailLines, 20, y); y += detailLines.length * 4.5 + 4
  }
  y += 2

  doc.setFont("helvetica", "bold")
  doc.text(`Préavis : ${data.delaiMois} mois`, 20, y); y += 7
  doc.text(`Date d'effet (fin du bail) : ${dateFinFr}`, 20, y); y += 10
  doc.setFont("helvetica", "normal")

  const conclusion = data.qui === "locataire"
    ? `Pendant la période de préavis, je m'engage à régler les loyers et charges aux échéances prévues, à laisser visiter le logement aux candidats locataires aux dates et horaires convenus avec vous, et à restituer les clés à la date de fin de bail au cours d'un état des lieux contradictoire.`
    : `Pendant la période de préavis (6 mois conformément à l'art. 15 de la loi de 1989), vous resterez débiteur des loyers et charges aux échéances prévues. Un état des lieux contradictoire sera réalisé à la fin du préavis.`
  const conclLines = doc.splitTextToSize(conclusion, W)
  doc.text(conclLines, 20, y); y += conclLines.length * 4.5 + 8

  doc.text("Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.", 20, y); y += 14

  // Signature placeholder
  doc.setFont("helvetica", "italic")
  doc.text(data.qui === "locataire" ? "Le locataire," : "Le bailleur,", 130, y); y += 6
  doc.setFont("helvetica", "bold")
  doc.text(data.nomAuteur, 130, y); y += 14

  // Footer
  doc.setFontSize(8)
  doc.setFont("helvetica", "italic")
  doc.setTextColor(120, 120, 120)
  const articleRef = data.qui === "locataire" ? "art. 12 loi du 6 juillet 1989" : "art. 15 loi du 6 juillet 1989"
  doc.text(`Document généré par KeyMatch — keymatch-immo.fr — Référence légale : ${articleRef}.`, 105, 285, { align: "center" })

  const filename = `lettre-conge-${data.qui}-${data.dateEnvoi}.pdf`
  return { doc, filename }
}

export async function genererPreavisPDF(data: PreavisPDFData): Promise<void> {
  const { doc, filename } = await buildPdf(data)
  doc.save(filename)
}

export async function genererPreavisPDFBlob(data: PreavisPDFData): Promise<{ blob: Blob; filename: string }> {
  const { doc, filename } = await buildPdf(data)
  return { blob: doc.output("blob"), filename }
}
