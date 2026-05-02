/**
 * V58.4 — Génération PDF "Quittance solde de tout compte" (server-side).
 *
 * Document final de fin de bail qui détaille tous les flux financiers
 * entre bailleur et locataire pour la durée totale de la location.
 *
 * Conforme aux articles 7 et 22 de la loi du 6 juillet 1989 :
 *   - art. 7 : obligations du locataire (loyers, charges, état du bien)
 *   - art. 22 : restitution du dépôt de garantie
 *
 * Utilisation :
 *   const pdf = generateSoldePDFBuffer(data)
 *   // → Buffer à uploader sur Supabase Storage `baux-solde` ou attacher
 *   //   à un email Resend.
 *
 * Appelé depuis :
 *   - /api/baux/restitution-depot après confirmation restitution
 *   - /api/baux/relouer en bonus si dépôt déjà restitué
 */

import jsPDF from "jspdf"
import { drawLogoPDF } from "./brandPDF"
import { BRAND } from "./brand"

export interface MotifRetenue {
  libelle: string
  montant: number
  type: "degradation" | "loyer_impaye" | "charges" | "autre"
}

export interface SoldeToutCompteData {
  // Identification bailleur
  nomBailleur: string
  emailBailleur: string
  adresseBailleur?: string | null
  // Identification locataire
  nomLocataire: string
  emailLocataire: string
  // Bien
  titreBien: string
  adresseBien: string
  villeBien: string
  // Période
  dateDebutBail: string  // YYYY-MM-DD
  dateFinBail: string    // YYYY-MM-DD
  dureeMois: number
  // Récap financier
  totalLoyersPercus: number
  totalCharges?: number
  caution: number
  depotMontantRestitue: number
  depotMontantRetenu: number
  motifsRetenue: MotifRetenue[]
  // Méta
  dateEmission?: string  // YYYY-MM-DD, défaut today
}

const TYPE_LABEL: Record<MotifRetenue["type"], string> = {
  degradation: "Dégradation imputable",
  loyer_impaye: "Loyer impayé",
  charges: "Régularisation charges",
  autre: "Autre",
}

function formatEur(n: number): string {
  return `${(Number(n) || 0).toLocaleString("fr-FR")} €`
}

function formatDateFr(iso: string): string {
  if (!iso) return ""
  try { return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) }
  catch { return iso }
}

export function generateSoldePDFBuffer(data: SoldeToutCompteData): Buffer {
  const doc = new jsPDF()
  const today = data.dateEmission
    ? new Date(data.dateEmission).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })

  // ── Header ─────────────────────────────────────────────────────────────
  drawLogoPDF(doc, { x: 20, y: 18, size: "medium" })
  doc.setFontSize(20); doc.setFont("helvetica", "bold")
  doc.text("QUITTANCE DE SOLDE DE TOUT COMPTE", 105, 34, { align: "center" })
  doc.setFontSize(10); doc.setFont("helvetica", "normal")
  doc.setTextColor(100, 100, 100)
  doc.text("Document final de fin de bail", 105, 41, { align: "center" })
  doc.setTextColor(0, 0, 0)

  // ── Bloc identités ─────────────────────────────────────────────────────
  let y = 58
  doc.setDrawColor(220, 220, 220)
  doc.line(20, y - 4, 190, y - 4)

  doc.setFontSize(10); doc.setFont("helvetica", "bold")
  doc.text("BAILLEUR", 20, y); y += 6
  doc.setFont("helvetica", "normal"); doc.setFontSize(9)
  doc.text(data.nomBailleur, 20, y); y += 5
  if (data.adresseBailleur) {
    const lines = doc.splitTextToSize(data.adresseBailleur, 80)
    doc.text(lines, 20, y); y += 5 * lines.length
  }
  doc.text(data.emailBailleur, 20, y); y += 5

  // Locataire bloc droit
  let yLoc = 58
  doc.setFontSize(10); doc.setFont("helvetica", "bold")
  doc.text("LOCATAIRE", 110, yLoc); yLoc += 6
  doc.setFont("helvetica", "normal"); doc.setFontSize(9)
  doc.text(data.nomLocataire, 110, yLoc); yLoc += 5
  doc.text(data.emailLocataire, 110, yLoc); yLoc += 5

  y = Math.max(y, yLoc) + 6
  doc.line(20, y, 190, y)
  y += 8

  // ── Bien ───────────────────────────────────────────────────────────────
  doc.setFontSize(10); doc.setFont("helvetica", "bold")
  doc.text("BIEN LOUÉ", 20, y); y += 6
  doc.setFont("helvetica", "normal"); doc.setFontSize(9)
  doc.text(data.titreBien, 20, y); y += 5
  if (data.adresseBien) {
    const lines = doc.splitTextToSize(data.adresseBien, 170)
    doc.text(lines, 20, y); y += 5 * lines.length
  }
  doc.text(data.villeBien, 20, y); y += 8

  // ── Période ────────────────────────────────────────────────────────────
  doc.setFontSize(10); doc.setFont("helvetica", "bold")
  doc.text("PÉRIODE DE LOCATION", 20, y); y += 6
  doc.setFont("helvetica", "normal"); doc.setFontSize(9)
  doc.text(`Du ${formatDateFr(data.dateDebutBail)} au ${formatDateFr(data.dateFinBail)}`, 20, y); y += 5
  doc.text(`Durée totale : ${data.dureeMois} mois`, 20, y); y += 10

  // ── Récap financier ────────────────────────────────────────────────────
  doc.setDrawColor(220, 220, 220)
  doc.line(20, y, 190, y); y += 6
  doc.setFontSize(11); doc.setFont("helvetica", "bold")
  doc.text("RÉCAPITULATIF FINANCIER", 20, y); y += 8

  doc.setFontSize(9); doc.setFont("helvetica", "normal")

  // Total loyers perçus
  doc.text("Total loyers perçus sur la durée du bail", 20, y)
  doc.text(formatEur(data.totalLoyersPercus), 190, y, { align: "right" })
  y += 6

  // Charges régularisées (optionnel)
  if (data.totalCharges != null && data.totalCharges > 0) {
    doc.text("Charges régularisées", 20, y)
    doc.text(formatEur(data.totalCharges), 190, y, { align: "right" })
    y += 6
  }

  y += 4
  doc.setDrawColor(220, 220, 220)
  doc.setLineDashPattern([2, 2], 0)
  doc.line(20, y, 190, y); y += 6
  doc.setLineDashPattern([], 0)

  // Dépôt de garantie reçu
  doc.text("Dépôt de garantie reçu à l'entrée", 20, y)
  doc.text(formatEur(data.caution), 190, y, { align: "right" })
  y += 6

  // Dépôt restitué
  doc.setFont("helvetica", "bold")
  doc.text("Dépôt restitué au locataire", 20, y)
  doc.text(formatEur(data.depotMontantRestitue), 190, y, { align: "right" })
  doc.setFont("helvetica", "normal")
  y += 6

  // Retenues si applicable
  if (data.motifsRetenue && data.motifsRetenue.length > 0) {
    y += 2
    doc.setFontSize(8); doc.setTextColor(150, 80, 30)
    doc.text(`Retenues motivées (total : ${formatEur(data.depotMontantRetenu)})`, 25, y)
    doc.setTextColor(0, 0, 0)
    y += 5
    doc.setFontSize(8.5); doc.setFont("helvetica", "normal")
    for (const m of data.motifsRetenue) {
      const label = `• ${m.libelle} (${TYPE_LABEL[m.type] || m.type})`
      const lines = doc.splitTextToSize(label, 130)
      doc.text(lines, 30, y)
      doc.text(formatEur(m.montant), 190, y, { align: "right" })
      y += 5 * Math.max(1, lines.length)
    }
    y += 2
  }

  y += 4
  doc.setDrawColor(150, 150, 150)
  doc.line(20, y, 190, y); y += 8

  // Solde final
  const soldeFinal = data.depotMontantRestitue - 0 // Solde net pour le locataire
  doc.setFontSize(11); doc.setFont("helvetica", "bold")
  doc.text("SOLDE FINAL VERSÉ AU LOCATAIRE", 20, y)
  doc.setFontSize(13)
  doc.setTextColor(20, 100, 50)
  doc.text(formatEur(soldeFinal), 190, y, { align: "right" })
  doc.setTextColor(0, 0, 0)
  y += 12

  // ── Mention légale ─────────────────────────────────────────────────────
  doc.setFontSize(8); doc.setFont("helvetica", "italic")
  doc.setTextColor(80, 80, 80)
  const mention = "Quittance définitive — bail clos en application des articles 7 et 22 de la loi n°89-462 du 6 juillet 1989. Cette quittance vaut décharge de toute somme due au titre du bail pour la période ci-dessus, sous réserve d'erreur ou d'omission. Conservation 3 ans (loi ALUR)."
  const mentionLines = doc.splitTextToSize(mention, 170)
  doc.text(mentionLines, 20, y)
  y += 5 * mentionLines.length + 6

  // ── Date + signature ───────────────────────────────────────────────────
  doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0)
  doc.text(`Fait le ${today}`, 20, y); y += 12

  // Bloc signatures (placeholders pour signature électronique future)
  doc.setFontSize(9); doc.setFont("helvetica", "bold")
  doc.text("Le Bailleur", 50, y, { align: "center" })
  doc.text("Le Locataire", 155, y, { align: "center" })
  y += 6
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5)
  doc.text(data.nomBailleur, 50, y, { align: "center" })
  doc.text(data.nomLocataire, 155, y, { align: "center" })

  // ── Footer ─────────────────────────────────────────────────────────────
  const footerY = doc.internal.pageSize.height - 12
  doc.setFontSize(7); doc.setTextColor(150, 150, 150)
  doc.text(`Émis via ${BRAND.name || "KeyMatch"} — keymatch-immo.fr`, 105, footerY, { align: "center" })

  return Buffer.from(doc.output("arraybuffer"))
}
