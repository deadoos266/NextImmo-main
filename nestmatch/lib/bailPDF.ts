/**
 * Générateur PDF bail — version enrichie (conforme loi ALUR + décrets 2015).
 *
 * Extrait de `/proprietaire/bail/[id]/page.tsx` pour être partagé entre proprio
 * (génération) et locataire (re-download depuis BailCard /messages).
 *
 * Tous les nouveaux champs sont OPTIONNELS → les anciens messages
 * `[BAIL_CARD]` avec payload réduit continuent de fonctionner (PDF partiel).
 *
 * jsPDF est lazy-loaded (bundle lourd, on ne le charge qu'au clic).
 */

import { BRAND } from "./brand"
import { drawLogoPDF } from "./brandPDF"

export type BailData = {
  // ── Type ────────────────────────────────────────────────────────────────
  type: "vide" | "meuble"

  // ── Bailleur ────────────────────────────────────────────────────────────
  nomBailleur: string
  adresseBailleur: string
  emailBailleur: string
  telBailleur?: string
  ibanBailleur?: string
  bicBailleur?: string

  // ── Locataire ───────────────────────────────────────────────────────────
  nomLocataire: string
  emailLocataire: string
  telLocataire?: string
  dateNaissanceLocataire?: string
  lieuNaissanceLocataire?: string
  professionLocataire?: string
  nationaliteLocataire?: string

  // ── Garant (optionnel) ─────────────────────────────────────────────────
  garantActif?: boolean
  nomGarant?: string
  adresseGarant?: string
  emailGarant?: string
  telGarant?: string
  montantGarantie?: number // total engagé (€)
  dureeGarantie?: number // années
  lienGarant?: string // parent, conjoint, ami, etc.

  // ── Bien ────────────────────────────────────────────────────────────────
  titreBien: string
  adresseBien: string
  villeBien: string
  codePostalBien?: string
  surface: number
  pieces: number
  etage: string
  description: string
  meuble: boolean
  parking: boolean
  cave: boolean
  balcon?: boolean
  terrasse?: boolean
  jardin?: boolean
  ascenseur?: boolean
  fibre?: boolean
  chambres?: number
  typeLogement?: string // appartement, maison, studio, etc.
  anneeConstruction?: string

  // ── Usage & occupation ─────────────────────────────────────────────────
  usage?: "habitation" | "mixte" | "secondaire"
  nbOccupantsMax?: number
  colocation?: boolean

  // ── Bail & dates ───────────────────────────────────────────────────────
  dateDebut: string
  duree: number // mois
  dateEntree?: string // date remise des clés (peut différer du début bail)

  // ── Conditions financières ─────────────────────────────────────────────
  loyerHC: number
  charges: number
  caution: number
  modeReglement: string
  dateReglement: string

  // ── Encadrement loyer (zone tendue) ────────────────────────────────────
  zoneTendue?: boolean
  loyerReference?: number // loyer de référence (€/m²)
  loyerReferenceMajore?: number // loyer de référence majoré (€/m²)
  complementLoyer?: number // complément au-dessus du plafond
  justifComplement?: string // justification (caractéristiques exceptionnelles)

  // ── Révision annuelle IRL ──────────────────────────────────────────────
  revisionActive?: boolean
  dateRevision?: string // ex "1er janvier"
  irlTrimestre?: string // ex "T3 2025"
  irlIndice?: number // ex 145.47

  // ── Honoraires d'agence ────────────────────────────────────────────────
  honoraires?: number // honoraires totaux locataire
  honorairesEtatLieux?: number // part état des lieux

  // ── Règles de vie ──────────────────────────────────────────────────────
  animauxAutorises?: boolean
  fumeurAutorise?: boolean
  sousLocationAutorisee?: boolean
  activiteProAutorisee?: boolean

  // ── Équipements meublé + travaux ───────────────────────────────────────
  equipementsMeuble?: string[] // liste cochée (ALUR + confort)
  travauxBailleur?: string
  etatLogement?: "neuf" | "renove" | "bon" | "ancien"

  // ── Assurance ──────────────────────────────────────────────────────────
  assuranceAFournir?: boolean // locataire doit fournir PNO
  compagnieAssuranceBailleur?: string

  // ── Clauses particulières + annexes ────────────────────────────────────
  clausesParticulieres?: string // textarea libre
  clausesChoisies?: string[] // titres de clauses cochées dans les modèles
  annexes?: string[] // liste cochée

  // ── DPE ────────────────────────────────────────────────────────────────
  dpe: string
  ges?: string
  consoEnergetique?: string // kWh/m²/an
  emissionsGes?: string // kgCO2/m²/an
}

// ─── Helpers formatage ────────────────────────────────────────────────────

function formatDateFR(iso: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString("fr-FR")
}

function formatEuros(n: number | undefined | null): string {
  const v = Number(n || 0)
  return v.toLocaleString("fr-FR") + " €"
}

// ─── Générateur ───────────────────────────────────────────────────────────

export async function genererBailPDF(data: BailData): Promise<void> {
  const { default: jsPDF } = await import("jspdf")
  const doc = new jsPDF()
  const W = 170
  const totalCC = data.loyerHC + data.charges
  const today = new Date().toLocaleDateString("fr-FR")
  const dateDebut = formatDateFR(data.dateDebut)
  const dureeAns =
    data.duree >= 12
      ? `${Math.round(data.duree / 12)} an${data.duree >= 24 ? "s" : ""}`
      : `${data.duree} mois`
  const dateFin = data.dateDebut
    ? new Date(
        new Date(data.dateDebut).setMonth(
          new Date(data.dateDebut).getMonth() + data.duree,
        ),
      ).toLocaleDateString("fr-FR")
    : ""

  let y = 20

  function addTitle(text: string) {
    doc.setFontSize(14)
    doc.setFont("helvetica", "bold")
    doc.text(text, 105, y, { align: "center" })
    y += 8
  }
  function addSection(text: string) {
    if (y > 255) {
      doc.addPage()
      y = 20
    }
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(0, 0, 0)
    doc.text(text, 20, y)
    y += 7
  }
  function addSubsection(text: string) {
    if (y > 260) {
      doc.addPage()
      y = 20
    }
    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(60, 60, 60)
    doc.text(text, 20, y)
    y += 5.5
  }
  function addText(text: string) {
    if (y > 265) {
      doc.addPage()
      y = 20
    }
    doc.setFontSize(9)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(0, 0, 0)
    const lines = doc.splitTextToSize(text, W)
    doc.text(lines, 20, y)
    y += lines.length * 4.5
  }
  function addLine() {
    doc.setDrawColor(200, 200, 200)
    doc.line(20, y, 190, y)
    y += 6
  }
  function addField(label: string, val: string) {
    if (y > 265) {
      doc.addPage()
      y = 20
    }
    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(0, 0, 0)
    doc.text(`${label} :`, 20, y)
    doc.setFont("helvetica", "normal")
    const lines = doc.splitTextToSize(val, W - 60)
    doc.text(lines, 80, y)
    y += Math.max(5.5, lines.length * 4.5)
  }
  function addBullet(text: string) {
    if (y > 265) {
      doc.addPage()
      y = 20
    }
    doc.setFontSize(9)
    doc.setFont("helvetica", "normal")
    const lines = doc.splitTextToSize("• " + text, W - 5)
    doc.text(lines, 22, y)
    y += lines.length * 4.5
  }

  // ── Header brand (logo NestMatch en haut à gauche) ────────────────────
  drawLogoPDF(doc, { x: 20, y: 18, size: "medium" })
  y = 30

  // ── Titre ─────────────────────────────────────────────────────────────
  addTitle(`CONTRAT DE LOCATION`)
  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.text(
    data.type === "meuble"
      ? "Bail d'habitation meublée"
      : "Bail d'habitation non meublée (vide)",
    105,
    y,
    { align: "center" },
  )
  y += 5
  doc.setFontSize(8)
  doc.setTextColor(100, 100, 100)
  doc.text(
    "Conforme à la loi n°89-462 du 6 juillet 1989 modifiée par la loi ALUR et la loi ELAN",
    105,
    y,
    { align: "center" },
  )
  y += 10
  doc.setTextColor(0, 0, 0)

  addLine()

  // ── I. Parties ────────────────────────────────────────────────────────
  addSection("I. DÉSIGNATION DES PARTIES")
  y += 2
  addText("Le présent contrat est conclu entre :")
  y += 2
  addSubsection("Le bailleur")
  addField("Nom et prénom", data.nomBailleur)
  addField("Adresse", data.adresseBailleur || "Non renseignée")
  addField("Email", data.emailBailleur)
  if (data.telBailleur) addField("Téléphone", data.telBailleur)
  y += 3

  addSubsection("Le locataire")
  addField("Nom et prénom", data.nomLocataire || data.emailLocataire)
  addField("Email", data.emailLocataire)
  if (data.telLocataire) addField("Téléphone", data.telLocataire)
  if (data.dateNaissanceLocataire)
    addField(
      "Né(e) le",
      `${formatDateFR(data.dateNaissanceLocataire)}${data.lieuNaissanceLocataire ? ` à ${data.lieuNaissanceLocataire}` : ""}`,
    )
  if (data.nationaliteLocataire)
    addField("Nationalité", data.nationaliteLocataire)
  if (data.professionLocataire)
    addField("Profession", data.professionLocataire)
  y += 4

  addLine()

  // ── I bis. Garant (si actif) ──────────────────────────────────────────
  if (data.garantActif && (data.nomGarant || data.emailGarant)) {
    addSection("I bis. CAUTION SOLIDAIRE")
    y += 2
    addText(
      "Une caution solidaire se porte garante du paiement du loyer, des charges et de l'exécution des obligations du présent bail.",
    )
    y += 2
    addField("Nom du garant", data.nomGarant || "")
    if (data.adresseGarant) addField("Adresse", data.adresseGarant)
    if (data.emailGarant) addField("Email", data.emailGarant)
    if (data.telGarant) addField("Téléphone", data.telGarant)
    if (data.lienGarant) addField("Lien avec le locataire", data.lienGarant)
    if (data.montantGarantie && data.montantGarantie > 0)
      addField("Montant de l'engagement", formatEuros(data.montantGarantie))
    if (data.dureeGarantie && data.dureeGarantie > 0)
      addField(
        "Durée de l'engagement",
        `${data.dureeGarantie} an${data.dureeGarantie > 1 ? "s" : ""}`,
      )
    y += 2
    addText(
      "Un acte de cautionnement, daté et signé, est annexé au présent bail (mentions manuscrites prévues par l'article 22-1 de la loi du 6 juillet 1989).",
    )
    y += 4
    addLine()
  }

  // ── II. Objet du contrat ──────────────────────────────────────────────
  addSection("II. OBJET DU CONTRAT")
  y += 2
  const usageLabel =
    data.usage === "mixte"
      ? "mixte (habitation + activité professionnelle)"
      : data.usage === "secondaire"
        ? "résidence secondaire"
        : "habitation principale"
  addText(
    `Le bailleur loue au locataire le bien désigné ci-après, à usage ${usageLabel}.`,
  )
  y += 2
  addField("Désignation du bien", data.titreBien)
  if (data.typeLogement) addField("Type de logement", data.typeLogement)
  const adresseComplete = [
    data.adresseBien,
    data.codePostalBien,
    data.villeBien,
  ]
    .filter(Boolean)
    .join(" ")
    .trim()
  addField("Adresse", adresseComplete || data.villeBien)
  addField("Surface habitable (loi Boutin)", `${data.surface} m²`)
  addField("Nombre de pièces principales", `${data.pieces}`)
  if (data.chambres && data.chambres > 0)
    addField("Dont chambres", `${data.chambres}`)
  if (data.etage) addField("Étage", data.etage)
  if (data.anneeConstruction)
    addField("Année de construction", data.anneeConstruction)
  addField(
    "Type de location",
    data.type === "meuble" ? "Meublée" : "Non meublée (vide)",
  )
  if (data.nbOccupantsMax && data.nbOccupantsMax > 0)
    addField("Nombre maximum d'occupants", `${data.nbOccupantsMax}`)

  // Annexes physiques du bien
  y += 2
  const annexesBien: string[] = []
  if (data.parking) annexesBien.push("Place de parking")
  if (data.cave) annexesBien.push("Cave")
  if (data.balcon) annexesBien.push("Balcon")
  if (data.terrasse) annexesBien.push("Terrasse")
  if (data.jardin) annexesBien.push("Jardin")
  if (data.ascenseur) annexesBien.push("Ascenseur")
  if (data.fibre) annexesBien.push("Fibre optique disponible")
  addText(
    `Éléments annexes et équipements du bien : ${annexesBien.length > 0 ? annexesBien.join(", ") : "aucun"}.`,
  )

  // Équipements meublé (loi ALUR)
  if (data.type === "meuble" && data.equipementsMeuble && data.equipementsMeuble.length > 0) {
    y += 3
    addSubsection("Équipements fournis (décret n°2015-981)")
    for (const eq of data.equipementsMeuble) addBullet(eq)
  }
  y += 4

  addLine()

  // ── III. Durée du bail ────────────────────────────────────────────────
  addSection("III. DURÉE DU BAIL")
  y += 2
  addText(
    `Le présent bail est consenti pour une durée de ${dureeAns}, soit du ${dateDebut}${dateFin ? ` au ${dateFin}` : ""}.`,
  )
  if (data.dateEntree && data.dateEntree !== data.dateDebut) {
    addText(
      `La remise des clés interviendra le ${formatDateFR(data.dateEntree)}, date à laquelle sera établi l'état des lieux d'entrée.`,
    )
  }
  y += 2
  if (data.type === "vide") {
    addText(
      "Conformément à l'article 10 de la loi du 6 juillet 1989, le bail est conclu pour une durée minimale de 3 ans lorsque le bailleur est une personne physique (6 ans pour une personne morale).",
    )
  } else {
    addText(
      "Conformément à l'article 25-7 de la loi du 6 juillet 1989, le bail meublé est conclu pour une durée minimale d'1 an (9 mois pour un étudiant, non reconductible tacitement).",
    )
  }
  y += 2
  addText(
    "Le bail se renouvelle par tacite reconduction aux mêmes conditions, sauf congé délivré dans les formes et délais légaux.",
  )
  if (data.zoneTendue) {
    y += 2
    addText(
      "Le logement est situé en zone tendue : le préavis du locataire est réduit à 1 mois en toutes circonstances (article 15 de la loi du 6 juillet 1989).",
    )
  }
  y += 4

  addLine()

  // ── IV. Conditions financières ────────────────────────────────────────
  if (y > 220) {
    doc.addPage()
    y = 20
  }
  addSection("IV. CONDITIONS FINANCIÈRES")
  y += 2
  addField(
    "Loyer mensuel hors charges",
    `${formatEuros(data.loyerHC)}`,
  )
  addField(
    "Provision pour charges",
    `${formatEuros(data.charges)} / mois`,
  )
  addField(
    "Total charges comprises",
    `${formatEuros(totalCC)} / mois`,
  )
  addField("Dépôt de garantie", formatEuros(data.caution))
  if (data.honoraires && data.honoraires > 0) {
    addField(
      "Honoraires de location (locataire)",
      `${formatEuros(data.honoraires)}${data.honorairesEtatLieux ? ` (dont ${formatEuros(data.honorairesEtatLieux)} pour l'état des lieux)` : ""}`,
    )
  }
  y += 2
  if (data.type === "vide") {
    addText(
      "Le dépôt de garantie ne peut excéder un mois de loyer hors charges (article 22 de la loi du 6 juillet 1989).",
    )
  } else {
    addText(
      "Le dépôt de garantie ne peut excéder deux mois de loyer hors charges pour un bail meublé.",
    )
  }
  y += 2

  // Encadrement zone tendue
  if (data.zoneTendue && (data.loyerReference || data.loyerReferenceMajore)) {
    addSubsection("Encadrement du loyer (zone tendue)")
    if (data.loyerReference)
      addField("Loyer de référence", `${data.loyerReference.toLocaleString("fr-FR")} € /m²`)
    if (data.loyerReferenceMajore)
      addField(
        "Loyer de référence majoré",
        `${data.loyerReferenceMajore.toLocaleString("fr-FR")} € /m²`,
      )
    if (data.complementLoyer && data.complementLoyer > 0) {
      addField("Complément de loyer", formatEuros(data.complementLoyer))
      if (data.justifComplement)
        addField("Justification", data.justifComplement)
    }
    y += 2
  }

  addSubsection("Modalités de règlement")
  addField(
    "Mode de règlement",
    data.modeReglement || "Virement bancaire",
  )
  addField(
    "Date de paiement",
    data.dateReglement || "Le 1er de chaque mois",
  )
  if (data.ibanBailleur) {
    addField("IBAN du bailleur", data.ibanBailleur)
    if (data.bicBailleur) addField("BIC", data.bicBailleur)
  }
  y += 2
  addText(
    "Les charges locatives sont réglées par provisions mensuelles avec régularisation annuelle sur justificatifs.",
  )

  // Révision IRL
  if (data.revisionActive) {
    y += 3
    addSubsection("Révision annuelle du loyer")
    addText(
      `Le loyer sera révisé chaque année${data.dateRevision ? ` à la date du ${data.dateRevision}` : " à la date anniversaire du bail"}, en fonction de la variation de l'indice de référence des loyers (IRL) publié par l'INSEE.`,
    )
    if (data.irlTrimestre && data.irlIndice) {
      addText(
        `Indice de référence au jour de la signature : ${data.irlTrimestre} = ${data.irlIndice.toLocaleString("fr-FR")}.`,
      )
    }
  }
  y += 4

  addLine()

  // ── V. Diagnostics ───────────────────────────────────────────────────
  if (y > 230) {
    doc.addPage()
    y = 20
  }
  addSection("V. DIAGNOSTICS TECHNIQUES")
  y += 2
  addText(
    "Conformément à la loi, les diagnostics suivants sont annexés au présent bail (dossier de diagnostic technique — DDT) :",
  )
  y += 2
  addBullet(
    `Diagnostic de performance énergétique (DPE) : classe ${data.dpe || "non renseignée"}${data.ges ? ` — GES : classe ${data.ges}` : ""}`,
  )
  if (data.consoEnergetique)
    addBullet(`Consommation énergétique : ${data.consoEnergetique} kWh/m²/an`)
  if (data.emissionsGes)
    addBullet(`Émissions de gaz à effet de serre : ${data.emissionsGes} kgCO2/m²/an`)
  addBullet(
    "Constat de risque d'exposition au plomb (CREP) — immeubles avant 1949",
  )
  addBullet("État des risques et pollutions (ERP)")
  addBullet(
    "Diagnostic amiante (parties privatives, immeubles avant 1997)",
  )
  addBullet(
    "Diagnostic électricité et gaz (installations de plus de 15 ans)",
  )
  addBullet(`Surface habitable (loi Boutin) : ${data.surface} m²`)
  y += 4

  addLine()

  // ── VI. Obligations ───────────────────────────────────────────────────
  if (y > 215) {
    doc.addPage()
    y = 20
  }
  addSection("VI. OBLIGATIONS DES PARTIES")
  y += 2
  addSubsection("Le bailleur est tenu de :")
  addBullet(
    "Remettre un logement décent, en bon état d'usage et de réparations",
  )
  addBullet("Assurer la jouissance paisible du logement")
  addBullet(
    "Entretenir les locaux et effectuer les réparations nécessaires (hors locatives)",
  )
  addBullet("Remettre gratuitement les quittances de loyer")
  addBullet(
    "Ne pas s'opposer aux aménagements réalisés par le locataire, dès lors qu'ils ne constituent pas une transformation de la chose louée",
  )
  y += 3
  addSubsection("Le locataire est tenu de :")
  addBullet("Payer le loyer et les charges aux termes convenus")
  addBullet("User paisiblement des locaux suivant la destination prévue au bail")
  addBullet(
    "Répondre des dégradations survenues pendant la durée du bail",
  )
  addBullet(
    "Souscrire une assurance habitation couvrant les risques locatifs et en fournir l'attestation annuellement",
  )
  addBullet(
    "Assurer l'entretien courant du logement et les menues réparations (décret n°87-712)",
  )
  addBullet(
    "Ne pas transformer les locaux sans l'accord écrit du bailleur",
  )
  addBullet(
    "Permettre l'accès au logement pour les réparations urgentes et travaux d'amélioration",
  )
  y += 4

  addLine()

  // ── VII. Règles de vie ────────────────────────────────────────────────
  if (y > 230) {
    doc.addPage()
    y = 20
  }
  addSection("VII. RÈGLES DE VIE")
  y += 2
  const oui = (b: boolean | undefined, textOui: string, textNon: string) =>
    b ? textOui : textNon
  addBullet(
    oui(
      data.animauxAutorises,
      "Les animaux domestiques sont autorisés dans le logement (sauf chiens de 1ʳᵉ catégorie, interdits par la loi).",
      "Les animaux sont interdits dans le logement, sauf accord écrit préalable du bailleur.",
    ),
  )
  addBullet(
    oui(
      data.fumeurAutorise,
      "Le logement est autorisé aux fumeurs.",
      "Il est interdit de fumer à l'intérieur du logement.",
    ),
  )
  addBullet(
    oui(
      data.sousLocationAutorisee,
      "La sous-location est autorisée avec accord écrit préalable du bailleur et sans excéder le loyer principal.",
      "La sous-location est interdite, y compris partielle et temporaire (plateformes type Airbnb incluses).",
    ),
  )
  addBullet(
    oui(
      data.activiteProAutorisee,
      "Une activité professionnelle non commerciale peut être exercée dans le logement, dans le respect du règlement de copropriété.",
      "Toute activité professionnelle, commerciale ou artisanale est interdite dans le logement.",
    ),
  )
  if (data.colocation) {
    addBullet(
      "Les locataires sont solidairement tenus du paiement du loyer et des charges (clause de solidarité, durée limitée à 6 mois après le départ d'un colocataire).",
    )
  }
  y += 4

  addLine()

  // ── VIII. Résiliation & congé ─────────────────────────────────────────
  if (y > 230) {
    doc.addPage()
    y = 20
  }
  addSection("VIII. RÉSILIATION ET CONGÉ")
  y += 2
  if (data.type === "vide") {
    const preavisLoc = data.zoneTendue ? "1 mois" : "3 mois"
    addText(
      `Le locataire peut donner congé à tout moment avec un préavis de ${preavisLoc}${!data.zoneTendue ? " (réduit à 1 mois en zone tendue, mutation professionnelle, perte d'emploi, nouvel emploi, état de santé ou bénéficiaire du RSA/AAH)" : ""}.`,
    )
    addText(
      "Le bailleur peut donner congé pour la fin du bail avec un préavis de 6 mois, uniquement pour vente, reprise, ou motif légitime et sérieux.",
    )
  } else {
    addText(
      "Le locataire peut donner congé à tout moment avec un préavis de 1 mois.",
    )
    addText(
      "Le bailleur peut donner congé pour la fin du bail avec un préavis de 3 mois, pour vente, reprise, ou motif légitime et sérieux.",
    )
  }
  addText(
    "Le congé doit être notifié par lettre recommandée avec accusé de réception, signification d'huissier, ou remise en main propre contre récépissé.",
  )
  y += 4

  addLine()

  // ── IX. État des lieux ────────────────────────────────────────────────
  if (y > 240) {
    doc.addPage()
    y = 20
  }
  addSection("IX. ÉTAT DES LIEUX")
  y += 2
  addText(
    "Un état des lieux d'entrée sera établi de manière contradictoire entre les parties lors de la remise des clés. Un état des lieux de sortie sera réalisé selon les mêmes modalités lors de la restitution des clés.",
  )
  addText(
    "À défaut d'accord, chaque partie peut faire réaliser l'état des lieux par un huissier de justice, les frais étant partagés par moitié.",
  )
  if (data.etatLogement) {
    const labels = {
      neuf: "neuf",
      renove: "entièrement rénové",
      bon: "en bon état général",
      ancien: "ancien, rafraîchissement locataire possible",
    }
    y += 2
    addText(`État général du logement à la date de signature : ${labels[data.etatLogement]}.`)
  }
  if (data.travauxBailleur && data.travauxBailleur.trim()) {
    y += 2
    addSubsection("Travaux convenus à la charge du bailleur")
    addText(data.travauxBailleur)
  }
  y += 4

  addLine()

  // ── X. Assurance ──────────────────────────────────────────────────────
  if (y > 240) {
    doc.addPage()
    y = 20
  }
  addSection("X. ASSURANCES")
  y += 2
  addText(
    "Le locataire s'engage à souscrire une assurance multirisques habitation couvrant les risques locatifs (incendie, dégâts des eaux, explosion) avant la remise des clés et à en fournir l'attestation chaque année.",
  )
  addText(
    "Le défaut d'assurance, après mise en demeure restée infructueuse pendant un mois, peut entraîner la résiliation du bail.",
  )
  if (data.compagnieAssuranceBailleur) {
    y += 2
    addField(
      "Assurance PNO du bailleur",
      data.compagnieAssuranceBailleur,
    )
  }
  y += 4

  addLine()

  // ── XI. Clauses particulières ─────────────────────────────────────────
  const hasClauses =
    (data.clausesChoisies && data.clausesChoisies.length > 0) ||
    (data.clausesParticulieres && data.clausesParticulieres.trim().length > 0)
  if (hasClauses) {
    if (y > 240) {
      doc.addPage()
      y = 20
    }
    addSection("XI. CLAUSES PARTICULIÈRES")
    y += 2
    if (data.clausesChoisies && data.clausesChoisies.length > 0) {
      for (const titre of data.clausesChoisies) addBullet(titre)
      y += 2
    }
    if (data.clausesParticulieres && data.clausesParticulieres.trim()) {
      addText(data.clausesParticulieres)
    }
    y += 4

    addLine()
  }

  // ── XII. Annexes ──────────────────────────────────────────────────────
  if (data.annexes && data.annexes.length > 0) {
    if (y > 240) {
      doc.addPage()
      y = 20
    }
    addSection("XII. ANNEXES AU PRÉSENT BAIL")
    y += 2
    addText("Les documents suivants sont annexés au présent contrat :")
    y += 2
    for (const a of data.annexes) addBullet(a)
    y += 4
    addLine()
  }

  // ── XIII. Clause résolutoire ──────────────────────────────────────────
  if (y > 235) {
    doc.addPage()
    y = 20
  }
  addSection("XIII. CLAUSE RÉSOLUTOIRE")
  y += 2
  addText(
    "Conformément à l'article 24 de la loi du 6 juillet 1989, le bail sera résilié de plein droit, un mois après un commandement de payer demeuré infructueux, en cas de non-paiement du loyer, des charges, du dépôt de garantie, ou de défaut d'assurance du locataire.",
  )
  y += 4

  addLine()

  // ── Signatures ────────────────────────────────────────────────────────
  if (y > 220) {
    doc.addPage()
    y = 20
  }
  addSection("SIGNATURES")
  y += 4
  addText(`Fait en deux exemplaires, le ${today}.`)
  y += 10

  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.text("Le Bailleur", 50, y, { align: "center" })
  doc.text("Le Locataire", 155, y, { align: "center" })
  y += 5
  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.text(data.nomBailleur, 50, y, { align: "center" })
  doc.text(data.nomLocataire || data.emailLocataire, 155, y, { align: "center" })
  y += 5
  doc.text('(Signature précédée de "Lu et approuvé")', 50, y + 3, {
    align: "center",
  })
  doc.text('(Signature précédée de "Lu et approuvé")', 155, y + 3, {
    align: "center",
  })
  doc.line(20, y + 20, 85, y + 20)
  doc.line(120, y + 20, 185, y + 20)

  // Garant signature si actif
  if (data.garantActif && data.nomGarant) {
    y += 35
    if (y > 250) {
      doc.addPage()
      y = 20
    }
    doc.setFont("helvetica", "bold")
    doc.text("La caution solidaire", 105, y, { align: "center" })
    y += 5
    doc.setFont("helvetica", "normal")
    doc.text(data.nomGarant, 105, y, { align: "center" })
    y += 5
    doc.setFontSize(8)
    doc.text(
      '(Mentions manuscrites + signature précédée de "Lu et approuvé, bon pour caution solidaire")',
      105,
      y + 3,
      { align: "center" },
    )
    doc.line(60, y + 20, 150, y + 20)
  }

  // ── Footer ────────────────────────────────────────────────────────────
  doc.setFontSize(7)
  doc.setTextColor(150, 150, 150)
  doc.text(
    `Document généré par ${BRAND.name} — ${BRAND.url.replace(/^https?:\/\//, "")} — Ce document ne se substitue pas à un conseil juridique.`,
    105,
    285,
    { align: "center" },
  )

  doc.save(
    `bail-${(data.villeBien || "logement").toLowerCase()}-${data.dateDebut || "nouveau"}.pdf`,
  )
}
