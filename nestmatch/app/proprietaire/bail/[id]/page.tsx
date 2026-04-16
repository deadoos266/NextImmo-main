"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../../../lib/supabase"
import { useResponsive } from "../../../hooks/useResponsive"
import jsPDF from "jspdf"

// ─── Bail PDF Generator (conforme loi ALUR) ────────────────────────────────

function genererBailPDF(data: {
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
}) {
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

  // ── Titre
  addTitle(`CONTRAT DE LOCATION`)
  doc.setFontSize(10); doc.setFont("helvetica", "normal")
  doc.text(data.type === "meuble" ? "Bail d'habitation meublée" : "Bail d'habitation non meublée (vide)", 105, y, { align: "center" })
  y += 5
  doc.setFontSize(8); doc.text("Conforme à la loi n°89-462 du 6 juillet 1989 modifiée par la loi ALUR", 105, y, { align: "center" })
  y += 10

  addLine()

  // ── I. Parties
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

  // ── II. Objet du contrat
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

  // Annexes
  y += 2
  addText("Éléments annexes :")
  const annexes = []
  if (data.parking) annexes.push("Place de parking")
  if (data.cave) annexes.push("Cave")
  addText(annexes.length > 0 ? annexes.join(", ") : "Aucun")
  y += 4

  addLine()

  // ── III. Durée du bail
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

  // ── IV. Conditions financières
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

  // ── V. Diagnostics
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

  // ── VI. Obligations
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

  // ── VII. Résiliation / congé
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

  // ── VIII. État des lieux
  if (y > 250) { doc.addPage(); y = 20 }
  addSection("VIII. ÉTAT DES LIEUX")
  y += 2
  addText("Un état des lieux d'entrée sera établi de manière contradictoire entre les parties lors de la remise des clés. Un état des lieux de sortie sera réalisé selon les mêmes modalités lors de la restitution des clés.")
  y += 4

  addLine()

  // ── Signatures
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

  // ── Footer
  doc.setFontSize(7); doc.setTextColor(150, 150, 150)
  doc.text("Document généré par NestMatch — nestmatch.fr — Ce document ne se substitue pas à un conseil juridique.", 105, 285, { align: "center" })

  doc.save(`bail-${data.villeBien.toLowerCase()}-${data.dateDebut}.pdf`)
}

// ─── Form component ─────────────────────────────────────────────────────────

export default function BailPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const bienId = params.id as string
  const { isMobile } = useResponsive()
  const [bien, setBien] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({
    type: "vide" as "vide" | "meuble",
    nomBailleur: "",
    adresseBailleur: "",
    nomLocataire: "",
    duree: "36",
    dateDebut: "",
    modeReglement: "Virement bancaire",
    dateReglement: "Le 1er de chaque mois",
  })

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth")
    if (session && bienId) loadBien()
  }, [session, status, bienId])

  async function loadBien() {
    const { data } = await supabase.from("annonces").select("*").eq("id", bienId).single()
    if (data) {
      setBien(data)
      setForm(f => ({
        ...f,
        type: data.meuble ? "meuble" : "vide",
        nomBailleur: data.proprietaire || session?.user?.name || "",
        nomLocataire: "",
        dateDebut: data.date_debut_bail || "",
        duree: data.meuble ? "12" : "36",
      }))
    }
    setLoading(false)
  }

  const set = (key: string) => (e: any) => setForm(f => ({ ...f, [key]: e.target.value }))

  function generer() {
    if (!bien) return
    genererBailPDF({
      type: form.type,
      nomBailleur: form.nomBailleur,
      adresseBailleur: form.adresseBailleur,
      emailBailleur: bien.proprietaire_email || session?.user?.email || "",
      nomLocataire: form.nomLocataire,
      emailLocataire: bien.locataire_email || "",
      titreBien: bien.titre || "",
      adresseBien: bien.adresse || "",
      villeBien: bien.ville || "",
      surface: Number(bien.surface) || 0,
      pieces: Number(bien.pieces) || 0,
      etage: bien.etage || "",
      description: bien.description || "",
      meuble: !!bien.meuble,
      parking: !!bien.parking,
      cave: !!bien.cave,
      dateDebut: form.dateDebut,
      duree: Number(form.duree) || 36,
      loyerHC: Number(bien.prix) || 0,
      charges: Number(bien.charges) || 0,
      caution: Number(bien.caution) || Number(bien.prix) || 0,
      modeReglement: form.modeReglement,
      dateReglement: form.dateReglement,
      dpe: bien.dpe || "",
    })
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#6b7280" }}>Chargement...</div>
  )
  if (!bien) return null

  const inp: any = { width: "100%", padding: "11px 14px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }
  const sel: any = { ...inp, background: "white" }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: isMobile ? "24px 16px" : "40px 48px" }}>

        <Link href={`/proprietaire/stats?id=${bienId}`} style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>
          ← Retour aux statistiques
        </Link>

        <div style={{ marginTop: 16, marginBottom: 28 }}>
          <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, letterSpacing: "-0.5px" }}>Generateur de bail</h1>
          <p style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>{bien.titre} — {bien.ville}</p>
        </div>

        {/* Type de bail */}
        <div style={{ background: "white", borderRadius: 20, padding: isMobile ? 20 : 28, marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Type de bail</h2>
          <div style={{ display: "flex", gap: 12 }}>
            {([
              { val: "vide", label: "Location vide", desc: "Bail 3 ans, preavis 3 mois" },
              { val: "meuble", label: "Location meublee", desc: "Bail 1 an, preavis 1 mois" },
            ] as const).map(t => (
              <button key={t.val} onClick={() => setForm(f => ({ ...f, type: t.val, duree: t.val === "meuble" ? "12" : "36" }))}
                style={{
                  flex: 1, padding: "16px 20px", borderRadius: 14, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  background: form.type === t.val ? "#111" : "white",
                  color: form.type === t.val ? "white" : "#111",
                  border: form.type === t.val ? "1.5px solid #111" : "1.5px solid #e5e7eb",
                }}>
                <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{t.label}</p>
                <p style={{ fontSize: 12, marginTop: 4, opacity: 0.7, margin: "4px 0 0" }}>{t.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Informations des parties */}
        <div style={{ background: "white", borderRadius: 20, padding: isMobile ? 20 : 28, marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Parties du contrat</h2>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6 }}>Nom du bailleur</label>
              <input style={inp} value={form.nomBailleur} onChange={set("nomBailleur")} placeholder="Nom complet" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6 }}>Adresse du bailleur</label>
              <input style={inp} value={form.adresseBailleur} onChange={set("adresseBailleur")} placeholder="Adresse postale" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6 }}>Nom du locataire</label>
              <input style={inp} value={form.nomLocataire} onChange={set("nomLocataire")} placeholder="Nom complet du locataire" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6 }}>Email locataire</label>
              <input value={bien.locataire_email || ""} disabled
                 style={{ ...inp, background: "#f9fafb", color: "#6b7280" }} />
            </div>
          </div>
        </div>

        {/* Conditions du bail */}
        <div style={{ background: "white", borderRadius: 20, padding: isMobile ? 20 : 28, marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Conditions du bail</h2>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6 }}>Date de debut</label>
              <input style={inp} type="date" value={form.dateDebut} onChange={set("dateDebut")} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6 }}>Duree (mois)</label>
              <select style={sel} value={form.duree} onChange={set("duree")}>
                {form.type === "meuble"
                  ? [9, 12, 24].map(v => <option key={v} value={v}>{v} mois{v === 9 ? " (etudiant)" : ""}</option>)
                  : [36, 72].map(v => <option key={v} value={v}>{v / 12} ans</option>)
                }
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6 }}>Mode de reglement</label>
              <select style={sel} value={form.modeReglement} onChange={set("modeReglement")}>
                <option>Virement bancaire</option>
                <option>Prelevement automatique</option>
                <option>Cheque</option>
                <option>Especes</option>
              </select>
            </div>
          </div>
        </div>

        {/* Récapitulatif financier (lecture seule) */}
        <div style={{ background: "white", borderRadius: 20, padding: isMobile ? 20 : 28, marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Recapitulatif financier</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {[
              { label: "Loyer mensuel HC", val: `${(Number(bien.prix) || 0).toLocaleString("fr-FR")} euros` },
              { label: "Charges mensuelles", val: `${(Number(bien.charges) || 0).toLocaleString("fr-FR")} euros` },
              { label: "Total charges comprises", val: `${((Number(bien.prix) || 0) + (Number(bien.charges) || 0)).toLocaleString("fr-FR")} euros`, bold: true },
              { label: "Depot de garantie", val: `${(Number(bien.caution) || Number(bien.prix) || 0).toLocaleString("fr-FR")} euros` },
            ].map((r, i, arr) => (
              <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: i < arr.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                <span style={{ fontSize: 14, color: "#6b7280" }}>{r.label}</span>
                <span style={{ fontSize: 14, fontWeight: r.bold ? 800 : 600, color: "#111" }}>{r.val}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 12 }}>
            Pour modifier ces montants, allez dans les statistiques du bien.
          </p>
        </div>

        {/* DPE + Surface */}
        <div style={{ background: "white", borderRadius: 20, padding: isMobile ? 20 : 28, marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Diagnostics annexes</h2>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: "#6b7280" }}>DPE :</span>
              <span style={{ fontWeight: 700, fontSize: 16, background: "#f3f4f6", padding: "4px 12px", borderRadius: 8 }}>{bien.dpe || "Non renseigne"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: "#6b7280" }}>Surface loi Boutin :</span>
              <span style={{ fontWeight: 700 }}>{bien.surface || "?"} m2</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: "#6b7280" }}>Parking :</span>
              <span style={{ fontWeight: 700 }}>{bien.parking ? "Oui" : "Non"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: "#6b7280" }}>Cave :</span>
              <span style={{ fontWeight: 700 }}>{bien.cave ? "Oui" : "Non"}</span>
            </div>
          </div>
        </div>

        {/* Bouton generer */}
        <button onClick={generer}
          disabled={!form.dateDebut || !form.nomBailleur}
          style={{
            width: "100%", padding: "16px 32px",
            background: form.dateDebut && form.nomBailleur ? "#111" : "#e5e7eb",
            color: form.dateDebut && form.nomBailleur ? "white" : "#9ca3af",
            border: "none", borderRadius: 16, fontWeight: 800, fontSize: 16,
            cursor: form.dateDebut && form.nomBailleur ? "pointer" : "not-allowed",
            fontFamily: "inherit",
          }}>
          Generer le bail PDF
        </button>

        <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 12, lineHeight: 1.6 }}>
          Ce document est genere a titre indicatif et ne se substitue pas a un conseil juridique.
          Il est conforme a la structure prevue par la loi ALUR mais doit etre verifie par un professionnel.
        </p>
      </div>
    </main>
  )
}
