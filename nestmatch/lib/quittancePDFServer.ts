/**
 * Génération PDF "Quittance de loyer" côté SERVEUR (Node).
 *
 * Vs `proprietaire/stats/page.tsx:genererQuittancePDF` qui génère côté
 * client + doc.save() (download navigateur), cette variante retourne un
 * Buffer pour upload Supabase Storage et envoi en pièce jointe email.
 *
 * Réutilise jsPDF (fonctionne en Node moderne) + drawLogoPDF de brandPDF.
 * Le contenu est volontairement identique au PDF client pour cohérence
 * juridique (même mention, mêmes blocs identité, même attestation).
 */

import jsPDF from "jspdf"
import { drawLogoPDF } from "./brandPDF"
import { BRAND } from "./brand"

export interface QuittanceData {
  nomProprietaire: string
  emailProprietaire: string
  adresseProprietaire?: string | null
  nomLocataire?: string | null
  emailLocataire: string
  titreBien: string
  villeBien: string
  adresse?: string | null
  loyerHC: number
  charges: number
  moisLabel: string  // "septembre 2026"
  dateEmission?: string  // YYYY-MM-DD, défaut today
  // Origine du bail — pour ajouter une mention transparente quand le
  // bail a été signé hors plateforme (l'attestation reste juridiquement
  // valable, mais on précise que KeyMatch n'est qu'outil de gestion).
  bailSource?: "platform" | "imported" | "imported_pending"
}

/**
 * Génère le PDF de quittance et le retourne sous forme de Buffer.
 * Utilisable côté API route Next.js (runtime nodejs).
 */
export function generateQuittancePDFBuffer(data: QuittanceData): Buffer {
  const doc = new jsPDF()
  const totalCC = data.loyerHC + data.charges
  const today = data.dateEmission
    ? new Date(data.dateEmission).toLocaleDateString("fr-FR")
    : new Date().toLocaleDateString("fr-FR")

  // Header logo + titre
  drawLogoPDF(doc, { x: 20, y: 18, size: "medium" })
  doc.setFontSize(20); doc.setFont("helvetica", "bold")
  doc.text("QUITTANCE DE LOYER", 105, 34, { align: "center" })
  doc.setFontSize(11); doc.setFont("helvetica", "normal")
  doc.text(`Période : ${data.moisLabel}`, 105, 42, { align: "center" })
  doc.setDrawColor(200, 200, 200); doc.line(20, 48, 190, 48)

  // Bailleur
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("BAILLEUR", 20, 58)
  doc.setFont("helvetica", "normal"); doc.setFontSize(9)
  doc.text(`Nom : ${data.nomProprietaire}`, 20, 65)
  doc.text(`Email : ${data.emailProprietaire}`, 20, 71)
  if (data.adresseProprietaire) {
    doc.text(`Adresse : ${data.adresseProprietaire}`, 20, 77)
  }

  // Locataire
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("LOCATAIRE", 110, 58)
  doc.setFont("helvetica", "normal"); doc.setFontSize(9)
  if (data.nomLocataire) {
    doc.text(`Nom : ${data.nomLocataire}`, 110, 65)
    doc.text(`Email : ${data.emailLocataire}`, 110, 71)
  } else {
    doc.text(`Email : ${data.emailLocataire}`, 110, 65)
  }

  // Bien
  doc.line(20, 84, 190, 84)
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("BIEN LOUÉ", 20, 92)
  doc.setFont("helvetica", "normal"); doc.setFontSize(9)
  doc.text(data.titreBien, 20, 99)
  doc.text(data.adresse || data.villeBien, 20, 105)

  // Détail
  doc.line(20, 112, 190, 112)
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("DÉTAIL DU RÈGLEMENT", 20, 120)
  doc.setFont("helvetica", "normal"); doc.setFontSize(9)
  doc.text("Loyer hors charges :", 20, 128)
  doc.text(`${data.loyerHC.toLocaleString("fr-FR")} €`, 170, 128, { align: "right" })
  doc.text("Charges locatives :", 20, 135)
  doc.text(`${data.charges.toLocaleString("fr-FR")} €`, 170, 135, { align: "right" })
  doc.line(100, 140, 190, 140)
  doc.setFont("helvetica", "bold"); doc.setFontSize(10)
  doc.text("TOTAL CHARGES COMPRISES :", 20, 148)
  doc.text(`${totalCC.toLocaleString("fr-FR")} €`, 170, 148, { align: "right" })

  // Attestation
  doc.line(20, 155, 190, 155)
  doc.setFont("helvetica", "normal"); doc.setFontSize(8)
  const locataireRef = data.nomLocataire || data.emailLocataire
  const attestation = `Je soussigné(e), ${data.nomProprietaire}, bailleur du logement désigné ci-dessus, déclare avoir reçu de ${locataireRef} la somme de ${totalCC.toLocaleString("fr-FR")} € correspondant au paiement du loyer et des charges pour la période de ${data.moisLabel}, et lui en donne quittance, sous réserve de tous mes droits.`
  const lines = doc.splitTextToSize(attestation, 170)
  doc.text(lines, 20, 163)

  // Mention légale
  doc.setFontSize(7); doc.setTextColor(120, 120, 120)
  doc.text("Quittance émise en application de l'article 21 de la loi n° 89-462 du 6 juillet 1989.", 20, 188)
  doc.setTextColor(0, 0, 0)

  // Date + signature
  doc.setFontSize(9)
  doc.text(`Fait le ${today}`, 20, 200)
  doc.text("Signature du bailleur :", 110, 200)
  doc.line(110, 215, 185, 215)

  // Footer — mention origine bail si importé (transparence)
  doc.setFontSize(7); doc.setTextColor(150, 150, 150)
  const isImported = data.bailSource === "imported" || data.bailSource === "imported_pending"
  if (isImported) {
    doc.text(
      "Bail signé hors plateforme — KeyMatch est utilisé comme outil de gestion locative.",
      105, 280, { align: "center" }
    )
  }
  doc.text(`Document généré par ${BRAND.name} — ${BRAND.url.replace(/^https?:\/\//, "")}`, 105, 285, { align: "center" })

  // ArrayBuffer → Buffer Node
  const ab = doc.output("arraybuffer") as ArrayBuffer
  return Buffer.from(ab)
}

/**
 * Construit le path de stockage Supabase pour une quittance.
 * Format : {locataire_email}/{annonce_id}/{periode_slug}-{ts}.pdf
 * - locataire_email lowercase pour évier les doublons casse
 * - periode_slug en kebab-case (septembre-2026)
 * - timestamp pour rendre le path unique même si on regenère
 */
export function buildQuittancePath(opts: {
  locataireEmail: string
  annonceId: number | string
  moisLabel: string
}): string {
  const email = opts.locataireEmail.toLowerCase().trim()
  const slug = opts.moisLabel.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const ts = Date.now()
  return `${email}/${opts.annonceId}/${slug}-${ts}.pdf`
}
