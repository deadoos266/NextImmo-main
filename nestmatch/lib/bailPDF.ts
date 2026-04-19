/**
 * Générateur PDF bail (partagé proprio + locataire).
 *
 * Extrait de `/proprietaire/bail/[id]/page.tsx` pour que le locataire puisse
 * régénérer et télécharger le même PDF depuis sa messagerie (BailCard) et
 * depuis /mon-logement. Le payload complet est stocké dans le message
 * système `[BAIL_CARD]` au moment où le proprio génère le bail.
 *
 * jsPDF est lazy-loaded (bundle lourd, on ne le charge qu'au clic).
 */

import { BRAND } from "./brand"
import { drawLogoPDF } from "./brandPDF"

export type BailData = {
  type: "vide" | "meuble"
  // Bailleur
  nomBailleur: string
  adresseBailleur: string
  emailBailleur: string
  // Locataire
  nomLocataire: string
  emailLocataire: string
  // Bien
  titreBien: string
  adresseBien: string
  villeBien: string
  surface: number
  pieces: number
  etage: string
  description: string
  meuble: boolean
  parking: boolean
  cave: boolean
  // Bail
  dateDebut: string
  duree: number // mois
  loyerHC: number
  charges: number
  caution: number
  modeReglement: string
  dateReglement: string
  // DPE
  dpe: string
}

export async function genererBailPDF(data: BailData): Promise<void> {
  const { default: jsPDF } = await import("jspdf")
  const doc = new jsPDF()
  const W = 170
  const totalCC = data.loyerHC + data.charges
  const today = new Date().toLocaleDateString("fr-FR")
  const dateDebut = new Date(data.dateDebut).toLocaleDateString("fr-FR")
  const dureeAns = data.duree >= 12 ? `${Math.round(data.duree / 12)} an${data.duree >= 24 ? "s" : ""}` : `${data.duree} mois`
  const dateFin = new Date(new Date(data.dateDebut).setMonth(new Date(data.dateDebut).getMonth() + data.duree)).toLocaleDateString("fr-FR")

  let y = 20

  function addTitle(text: string) {
    doc.setFontSize(14); doc.setFont("helvetica", "bold")
    doc.text(text, 105, y, { align: "center" }); y += 8
  }
  function addSection(text: string) {
    if (y > 260) { doc.addPage(); y = 20 }
    doc.setFontSize(11); doc.setFont("helvetica", "bold")
    doc.text(text, 20, y); y += 7
  }
  function addText(text: string) {
    if (y > 265) { doc.addPage(); y = 20 }
    doc.setFontSize(9); doc.setFont("helvetica", "normal")
    const lines = doc.splitTextToSize(text, W)
    doc.text(lines, 20, y); y += lines.length * 4.5
  }
  function addLine() {
    doc.setDrawColor(200, 200, 200); doc.line(20, y, 190, y); y += 6
  }
  function addField(label: string, val: string) {
    if (y > 265) { doc.addPage(); y = 20 }
    doc.setFontSize(9); doc.setFont("helvetica", "bold")
    doc.text(`${label} :`, 20, y)
    doc.setFont("helvetica", "normal")
    doc.text(val, 80, y)
    y += 5.5
  }

  drawLogoPDF(doc, { x: 20, y: 18, size: "medium" })
  y = 30

  addTitle(`CONTRAT DE LOCATION`)
  doc.setFontSize(10); doc.setFont("helvetica", "normal")
  doc.text(data.type === "meuble" ? "Bail d'habitation meublée" : "Bail d'habitation non meublée (vide)", 105, y, { align: "center" })
  y += 5
  doc.setFontSize(8); doc.text("Conforme à la loi n°89-462 du 6 juillet 1989 modifiée par la loi ALUR", 105, y, { align: "center" })
  y += 10

  addLine()

  addSection("I. DÉSIGNATION DES PARTIES")
  y += 2
  addText("Le présent contrat est conclu entre :")
  y += 2
  addField("LE BAILLEUR", data.nomBailleur)
  addField("Adresse", data.adresseBailleur || "Non renseignée")
  addField("Email", data.emailBailleur)
  y += 3
  addField("LE LOCATAIRE", data.nomLocataire || data.emailLocataire)
  addField("Email", data.emailLocataire)
  y += 4

  addLine()

  addSection("II. OBJET DU CONTRAT")
  y += 2
  addText(`Le bailleur loue au locataire le bien désigné ci-après, à usage exclusif d'habitation principale.`)
  y += 2
  addField("Désignation du bien", data.titreBien)
  addField("Adresse", `${data.adresseBien || ""} ${data.villeBien}`.trim())
  addField("Surface habitable", `${data.surface} m²`)
  addField("Nombre de pièces", `${data.pieces}`)
  if (data.etage) addField("Étage", data.etage)
  addField("Type de location", data.type === "meuble" ? "Meublée" : "Non meublée (vide)")

  y += 2
  addText("Éléments annexes :")
  const annexes = []
  if (data.parking) annexes.push("Place de parking")
  if (data.cave) annexes.push("Cave")
  addText(annexes.length > 0 ? annexes.join(", ") : "Aucun")
  y += 4

  addLine()

  addSection("III. DURÉE DU BAIL")
  y += 2
  addText(`Le présent bail est consenti pour une durée de ${dureeAns}, soit du ${dateDebut} au ${dateFin}.`)
  y += 2
  if (data.type === "vide") {
    addText("Conformément à l'article 10 de la loi du 6 juillet 1989, le bail est conclu pour une durée minimale de 3 ans lorsque le bailleur est une personne physique.")
  } else {
    addText("Conformément à l'article 25-7 de la loi du 6 juillet 1989, le bail meublé est conclu pour une durée minimale d'1 an (9 mois pour un étudiant).")
  }
  y += 2
  addText("Le bail se renouvelle par tacite reconduction aux mêmes conditions, sauf congé délivré dans les formes et délais légaux.")
  y += 4

  addLine()

  if (y > 220) { doc.addPage(); y = 20 }
  addSection("IV. CONDITIONS FINANCIÈRES")
  y += 2
  addField("Loyer mensuel hors charges", `${data.loyerHC.toLocaleString("fr-FR")} €`)
  addField("Provision pour charges", `${data.charges.toLocaleString("fr-FR")} €/mois`)
  addField("Total charges comprises", `${totalCC.toLocaleString("fr-FR")} €/mois`)
  addField("Dépôt de garantie", `${data.caution.toLocaleString("fr-FR")} €`)
  y += 2
  if (data.type === "vide") {
    addText("Le dépôt de garantie ne peut excéder un mois de loyer hors charges (article 22 de la loi du 6 juillet 1989).")
  } else {
    addText("Le dépôt de garantie ne peut excéder deux mois de loyer hors charges pour un bail meublé.")
  }
  y += 2
  addField("Mode de règlement", data.modeReglement || "Virement bancaire")
  addField("Date de paiement", data.dateReglement || "Le 1er de chaque mois")
  y += 2
  addText("Les charges locatives sont réglées par provisions mensuelles avec régularisation annuelle.")
  y += 4

  addLine()

  if (y > 240) { doc.addPage(); y = 20 }
  addSection("V. DIAGNOSTICS TECHNIQUES")
  y += 2
  addText("Conformément à la loi, les diagnostics suivants sont annexés au présent bail :")
  y += 2
  addText(`• Diagnostic de performance énergétique (DPE) : classe ${data.dpe || "Non renseigné"}`)
  addText("• Constat de risque d'exposition au plomb (CREP) si immeuble avant 1949")
  addText("• État des risques et pollutions (ERP)")
  addText("• Diagnostic électricité et gaz (si installation > 15 ans)")
  if (data.surface >= 1) addText(`• Surface habitable : ${data.surface} m² (loi Boutin)`)
  y += 4

  addLine()

  if (y > 220) { doc.addPage(); y = 20 }
  addSection("VI. OBLIGATIONS DES PARTIES")
  y += 2
  addText("Le bailleur est tenu de :")
  addText("• Remettre au locataire un logement décent, en bon état d'usage et de réparations")
  addText("• Assurer la jouissance paisible du logement")
  addText("• Entretenir les locaux et effectuer les réparations nécessaires (hors locatives)")
  addText("• Remettre gratuitement les quittances de loyer")
  y += 3
  addText("Le locataire est tenu de :")
  addText("• Payer le loyer et les charges aux termes convenus")
  addText("• User paisiblement des locaux suivant la destination prévue au bail")
  addText("• Répondre des dégradations survenues pendant la durée du bail")
  addText("• Souscrire une assurance habitation couvrant les risques locatifs")
  addText("• Ne pas transformer les locaux sans l'accord écrit du bailleur")
  y += 4

  addLine()

  if (y > 230) { doc.addPage(); y = 20 }
  addSection("VII. RÉSILIATION ET CONGÉ")
  y += 2
  if (data.type === "vide") {
    addText("Le locataire peut donner congé à tout moment avec un préavis de 3 mois (réduit à 1 mois dans les zones tendues ou en cas de mutation professionnelle, perte d'emploi, nouvel emploi, ou état de santé).")
    addText("Le bailleur peut donner congé pour la fin du bail avec un préavis de 6 mois, uniquement pour vente, reprise, ou motif légitime et sérieux.")
  } else {
    addText("Le locataire peut donner congé à tout moment avec un préavis de 1 mois.")
    addText("Le bailleur peut donner congé pour la fin du bail avec un préavis de 3 mois, pour vente, reprise, ou motif légitime et sérieux.")
  }
  y += 4

  addLine()

  if (y > 250) { doc.addPage(); y = 20 }
  addSection("VIII. ÉTAT DES LIEUX")
  y += 2
  addText("Un état des lieux d'entrée sera établi de manière contradictoire entre les parties lors de la remise des clés. Un état des lieux de sortie sera réalisé selon les mêmes modalités lors de la restitution des clés.")
  y += 4

  addLine()

  if (y > 220) { doc.addPage(); y = 20 }
  addSection("SIGNATURES")
  y += 4
  addText(`Fait en deux exemplaires, le ${today}.`)
  y += 10

  doc.setFontSize(10); doc.setFont("helvetica", "bold")
  doc.text("Le Bailleur", 50, y, { align: "center" })
  doc.text("Le Locataire", 155, y, { align: "center" })
  y += 5
  doc.setFontSize(9); doc.setFont("helvetica", "normal")
  doc.text(data.nomBailleur, 50, y, { align: "center" })
  doc.text(data.nomLocataire || data.emailLocataire, 155, y, { align: "center" })
  y += 5
  doc.text('(Signature précédée de "Lu et approuvé")', 50, y + 3, { align: "center" })
  doc.text('(Signature précédée de "Lu et approuvé")', 155, y + 3, { align: "center" })
  doc.line(20, y + 20, 85, y + 20)
  doc.line(120, y + 20, 185, y + 20)

  doc.setFontSize(7); doc.setTextColor(150, 150, 150)
  doc.text(`Document généré par ${BRAND.name} — ${BRAND.url.replace(/^https?:\/\//, "")} — Ce document ne se substitue pas à un conseil juridique.`, 105, 285, { align: "center" })

  doc.save(`bail-${data.villeBien.toLowerCase()}-${data.dateDebut}.pdf`)
}
