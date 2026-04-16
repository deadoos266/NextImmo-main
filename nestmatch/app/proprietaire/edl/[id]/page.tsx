"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../../../lib/supabase"
import { useResponsive } from "../../../hooks/useResponsive"
import jsPDF from "jspdf"

// ─── Types & Config ─────────────────────────────────────────────────────────

const ETATS = ["Neuf", "Tres bon", "Bon", "Usage", "Mauvais", "Degrade"] as const
type Etat = typeof ETATS[number]

const ETAT_STYLE: Record<Etat, { bg: string; color: string; icon: string }> = {
  "Neuf":    { bg: "#dcfce7", color: "#16a34a", icon: "★" },
  "Tres bon":{ bg: "#dcfce7", color: "#16a34a", icon: "●" },
  "Bon":     { bg: "#eff6ff", color: "#1d4ed8", icon: "●" },
  "Usage":   { bg: "#fff7ed", color: "#ea580c", icon: "●" },
  "Mauvais": { bg: "#fee2e2", color: "#dc2626", icon: "●" },
  "Degrade": { bg: "#fee2e2", color: "#991b1b", icon: "✗" },
}

// Elements specifiques par type de piece
const ELEMENTS_PAR_TYPE: Record<string, string[]> = {
  "Entree": ["Sol", "Murs", "Plafond", "Porte d'entree", "Serrure / Verrous", "Interphone / Digicode", "Eclairage", "Prises electriques", "Placard / Rangement"],
  "Sejour / Salon": ["Sol", "Murs", "Plafond", "Fenetre(s)", "Volets / Stores", "Porte(s)", "Prises electriques", "Interrupteurs", "Eclairage", "Chauffage / Radiateur"],
  "Cuisine": ["Sol", "Murs", "Plafond", "Fenetre", "Eclairage", "Prises electriques", "Evier", "Robinetterie", "Plaques de cuisson", "Four", "Hotte aspirante", "Refrigerateur", "Lave-vaisselle", "Placards", "Plan de travail"],
  "Chambre": ["Sol", "Murs", "Plafond", "Fenetre(s)", "Volets / Stores", "Porte", "Prises electriques", "Interrupteurs", "Eclairage", "Chauffage / Radiateur", "Placard / Dressing"],
  "Salle de bain": ["Sol", "Murs (carrelage)", "Plafond", "Porte", "Eclairage", "VMC / Aeration", "Baignoire ou Douche", "Paroi / Rideau de douche", "Lavabo", "Robinetterie", "Miroir", "Seche-serviettes", "Rangements"],
  "WC": ["Sol", "Murs", "Porte", "Eclairage", "Cuvette", "Chasse d'eau", "Abattant", "Lave-mains", "Derouleur"],
  "Balcon / Terrasse": ["Sol", "Garde-corps", "Eclairage exterieur"],
  "Cave": ["Sol", "Murs", "Porte / Serrure", "Eclairage"],
  "Garage": ["Sol", "Murs", "Porte de garage", "Eclairage", "Prise electrique"],
  "Buanderie": ["Sol", "Murs", "Plafond", "Eclairage", "Arrivee d'eau", "Evacuation"],
  "Autre": ["Sol", "Murs", "Plafond", "Eclairage"],
}

const PIECES_PROPOSEES = Object.keys(ELEMENTS_PAR_TYPE)

type ElementData = { etat: Etat; observation: string }
type PieceData = {
  nom: string
  type: string
  elements: Record<string, ElementData>
  photos: string[]
}

// ─── Helper: find best matching type ────────────────────────────────────────

function detectType(nom: string): string {
  const n = nom.toLowerCase()
  if (n.includes("entree")) return "Entree"
  if (n.includes("sejour") || n.includes("salon") || n.includes("living")) return "Sejour / Salon"
  if (n.includes("cuisine")) return "Cuisine"
  if (n.includes("chambre")) return "Chambre"
  if (n.includes("salle de bain") || n.includes("sdb")) return "Salle de bain"
  if (n.includes("wc") || n.includes("toilette")) return "WC"
  if (n.includes("balcon") || n.includes("terrasse")) return "Balcon / Terrasse"
  if (n.includes("cave")) return "Cave"
  if (n.includes("garage")) return "Garage"
  if (n.includes("buanderie")) return "Buanderie"
  return "Autre"
}

function makeElements(type: string): Record<string, ElementData> {
  const elems = ELEMENTS_PAR_TYPE[type] || ELEMENTS_PAR_TYPE["Autre"]
  return Object.fromEntries(elems.map(e => [e, { etat: "Bon" as Etat, observation: "" }]))
}

// ─── PDF Generator ──────────────────────────────────────────────────────────

function genererEdlPDF(data: {
  type: "entree" | "sortie"
  dateEdl: string
  prenomBailleur: string
  nomBailleur: string
  emailBailleur: string
  prenomLocataire: string
  nomLocataire: string
  emailLocataire: string
  titreBien: string
  adresseBien: string
  villeBien: string
  surface: number
  pieces: PieceData[]
  compteurs: { eau: string; elec: string; gaz: string }
  cles: string
  observations: string
  photoCount: number
}) {
  const doc = new jsPDF()
  const W = 170
  let y = 20

  function check() { if (y > 260) { doc.addPage(); y = 20 } }
  function title(t: string) { doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.text(t, 105, y, { align: "center" }); y += 8 }
  function section(t: string) { check(); doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.text(t, 20, y); y += 7 }
  function text(t: string) { check(); doc.setFontSize(9); doc.setFont("helvetica", "normal"); const l = doc.splitTextToSize(t, W); doc.text(l, 20, y); y += l.length * 4.5 }
  function field(l: string, v: string) { if (!v) return; check(); doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text(`${l} :`, 20, y); doc.setFont("helvetica", "normal"); doc.text(v, 75, y); y += 5.5 }
  function line() { doc.setDrawColor(200, 200, 200); doc.line(20, y, 190, y); y += 6 }

  const dateLabel = new Date(data.dateEdl).toLocaleDateString("fr-FR")
  const typeLabel = data.type === "entree" ? "ENTREE" : "SORTIE"

  title(`ETAT DES LIEUX D'${typeLabel}`)
  doc.setFontSize(9); doc.setFont("helvetica", "normal")
  doc.text(`Etabli contradictoirement le ${dateLabel}`, 105, y, { align: "center" }); y += 10
  line()

  section("PARTIES")
  y += 2
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text("LE BAILLEUR", 20, y); y += 5
  field("Nom", data.nomBailleur || "")
  field("Prenom", data.prenomBailleur || "")
  field("Email", data.emailBailleur || "")
  y += 4
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text("LE LOCATAIRE", 20, y); y += 5
  field("Nom", data.nomLocataire || "")
  field("Prenom", data.prenomLocataire || "")
  field("Email", data.emailLocataire || "")
  y += 3

  section("LOGEMENT")
  field("Designation", data.titreBien)
  field("Adresse", `${data.adresseBien || ""} ${data.villeBien}`.trim())
  if (data.surface) field("Surface", `${data.surface} m2`)
  y += 3; line()

  section("RELEVES DE COMPTEURS")
  field("Eau", data.compteurs.eau ? `${data.compteurs.eau} m3` : "Non releve")
  field("Electricite", data.compteurs.elec ? `${data.compteurs.elec} kWh` : "Non releve")
  field("Gaz", data.compteurs.gaz ? `${data.compteurs.gaz} m3` : "Non releve / Pas de gaz")
  y += 2
  field("Cles remises", data.cles || "Non precise")
  y += 3; line()

  // Pieces
  data.pieces.forEach(piece => {
    if (y > 210) { doc.addPage(); y = 20 }
    section(piece.nom.toUpperCase())
    y += 2

    doc.setFontSize(8); doc.setFont("helvetica", "bold")
    doc.text("Element", 20, y); doc.text("Etat", 95, y); doc.text("Observation", 135, y)
    y += 4; doc.setDrawColor(220, 220, 220); doc.line(20, y, 190, y); y += 3

    doc.setFont("helvetica", "normal")
    Object.entries(piece.elements).forEach(([elem, val]) => {
      if (y > 270) { doc.addPage(); y = 20 }
      doc.setFontSize(8)
      doc.text(elem, 20, y)
      // Color code the state
      const isGood = val.etat === "Neuf" || val.etat === "Tres bon" || val.etat === "Bon"
      doc.setTextColor(isGood ? 22 : 220, isGood ? 163 : 38, isGood ? 74 : 38)
      doc.text(val.etat, 95, y)
      doc.setTextColor(0, 0, 0)
      if (val.observation) {
        const obs = doc.splitTextToSize(val.observation, 50)
        doc.text(obs, 135, y)
        y += Math.max(4.5, obs.length * 4)
      } else {
        y += 4.5
      }
    })

    if (piece.photos.length > 0) {
      y += 2
      doc.setFontSize(7); doc.setTextColor(150, 150, 150)
      doc.text(`${piece.photos.length} photo(s) jointe(s) — voir annexe photographique`, 20, y)
      doc.setTextColor(0, 0, 0)
      y += 4
    }
    y += 4
  })

  line()

  if (data.observations) {
    section("OBSERVATIONS GENERALES")
    text(data.observations)
    y += 4; line()
  }

  if (data.photoCount > 0) {
    text(`Annexe photographique : ${data.photoCount} photo(s) stockee(s) en ligne sur NestMatch.`)
    y += 4
  }

  // Signatures
  if (y > 215) { doc.addPage(); y = 20 }
  section("SIGNATURES")
  y += 4
  text(`Les parties declarent que le present etat des lieux a ete etabli contradictoirement et de bonne foi le ${dateLabel}.`)
  y += 10
  doc.setFontSize(10); doc.setFont("helvetica", "bold")
  doc.text("Le Bailleur", 50, y, { align: "center" })
  doc.text("Le Locataire", 155, y, { align: "center" })
  y += 5
  doc.setFontSize(9); doc.setFont("helvetica", "normal")
  const fullBailleur = `${data.prenomBailleur} ${data.nomBailleur}`.trim() || "Le Bailleur"
  const fullLocataire = `${data.prenomLocataire} ${data.nomLocataire}`.trim() || "Le Locataire"
  doc.text(fullBailleur, 50, y, { align: "center" })
  doc.text(fullLocataire, 155, y, { align: "center" })
  y += 3
  doc.setFontSize(7); doc.text("(Lu et approuve)", 50, y, { align: "center" })
  doc.text("(Lu et approuve)", 155, y, { align: "center" })
  doc.line(20, y + 15, 85, y + 15)
  doc.line(120, y + 15, 185, y + 15)

  doc.setFontSize(7); doc.setTextColor(150, 150, 150)
  doc.text("Document genere par NestMatch — nestmatch.fr", 105, 285, { align: "center" })

  doc.save(`edl-${data.type}-${data.villeBien.toLowerCase().replace(/\s/g, "-")}-${data.dateEdl}.pdf`)
}

// ─── Page component ─────────────────────────────────────────────────────────

export default function EdlPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const bienId = params.id as string
  const { isMobile } = useResponsive()
  const [bien, setBien] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [type, setType] = useState<"entree" | "sortie">("entree")
  const [dateEdl, setDateEdl] = useState(new Date().toISOString().split("T")[0])
  const [prenomBailleur, setPrenomBailleur] = useState("")
  const [nomBailleur, setNomBailleur] = useState("")
  const [emailBailleur, setEmailBailleur] = useState("")
  const [prenomLocataire, setPrenomLocataire] = useState("")
  const [nomLocataire, setNomLocataire] = useState("")
  const [emailLocataire, setEmailLocataire] = useState("")
  const [pieces, setPieces] = useState<PieceData[]>([])
  const [compteurs, setCompteurs] = useState({ eau: "", elec: "", gaz: "" })
  const [cles, setCles] = useState("2 cles + 1 badge")
  const [observations, setObservations] = useState("")
  const [uploadingPiece, setUploadingPiece] = useState<number | null>(null)
  const [customPieceName, setCustomPieceName] = useState("")
  const [newElemName, setNewElemName] = useState<Record<number, string>>({})
  const photoRefs = useRef<Record<number, HTMLInputElement | null>>({})
  const [edlExistant, setEdlExistant] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth")
    if (session && bienId) loadBien()
  }, [session, status, bienId])

  async function loadBien() {
    const [{ data }, { data: edl }] = await Promise.all([
      supabase.from("annonces").select("*").eq("id", bienId).single(),
      supabase.from("etats_des_lieux").select("*").eq("annonce_id", bienId).order("created_at", { ascending: false }).limit(1).single(),
    ])
    if (edl) {
      setEdlExistant(edl)
      // Restaurer l'EDL sauvegarde
      setType(edl.type || "entree")
      setDateEdl(edl.date_edl || new Date().toISOString().split("T")[0])
      setPrenomBailleur(edl.prenom_bailleur || "")
      setNomBailleur(edl.nom_bailleur || "")
      setEmailBailleur(edl.email_bailleur || "")
      setPrenomLocataire(edl.prenom_locataire || "")
      setNomLocataire(edl.nom_locataire || "")
      setEmailLocataire(edl.email_locataire || "")
      setCompteurs(edl.compteurs || { eau: "", elec: "", gaz: "" })
      setCles(edl.cles || "")
      setObservations(edl.observations || "")
      if (edl.pieces_data) setPieces(edl.pieces_data)
    }
    if (data) {
      setBien(data)
      if (!edl) {
        // Pre-remplir bailleur seulement si pas d'EDL existant
        const nameParts = (data.proprietaire || session?.user?.name || "").split(" ")
        setPrenomBailleur(nameParts[0] || "")
        setNomBailleur(nameParts.slice(1).join(" ") || "")
        setEmailBailleur(data.proprietaire_email || session?.user?.email || "")
        setEmailLocataire(data.locataire_email || "")
      }
      if (!edl) {
        // Generer les pieces par defaut selon le bien
        const nbChambres = Math.max(1, Number(data.chambres) || 1)
        const initialPieces: PieceData[] = [
          { nom: "Entree", type: "Entree", elements: makeElements("Entree"), photos: [] },
          { nom: "Sejour / Salon", type: "Sejour / Salon", elements: makeElements("Sejour / Salon"), photos: [] },
          { nom: "Cuisine", type: "Cuisine", elements: makeElements("Cuisine"), photos: [] },
        ]
        for (let i = 1; i <= nbChambres; i++) {
          initialPieces.push({ nom: `Chambre ${i}`, type: "Chambre", elements: makeElements("Chambre"), photos: [] })
        }
        initialPieces.push(
          { nom: "Salle de bain", type: "Salle de bain", elements: makeElements("Salle de bain"), photos: [] },
          { nom: "WC", type: "WC", elements: makeElements("WC"), photos: [] },
        )
        if (data.balcon) initialPieces.push({ nom: "Balcon", type: "Balcon / Terrasse", elements: makeElements("Balcon / Terrasse"), photos: [] })
        if (data.terrasse) initialPieces.push({ nom: "Terrasse", type: "Balcon / Terrasse", elements: makeElements("Balcon / Terrasse"), photos: [] })
        if (data.cave) initialPieces.push({ nom: "Cave", type: "Cave", elements: makeElements("Cave"), photos: [] })
        if (data.parking) initialPieces.push({ nom: "Garage / Parking", type: "Garage", elements: makeElements("Garage"), photos: [] })
        setPieces(initialPieces)
      }
    }
    setLoading(false)
  }

  function updateElement(pieceIdx: number, element: string, field: "etat" | "observation", value: string) {
    setPieces(prev => prev.map((p, i) =>
      i === pieceIdx ? { ...p, elements: { ...p.elements, [element]: { ...p.elements[element], [field]: value } } } : p
    ))
  }

  function removeElement(pieceIdx: number, element: string) {
    setPieces(prev => prev.map((p, i) => {
      if (i !== pieceIdx) return p
      const newElems = { ...p.elements }
      delete newElems[element]
      return { ...p, elements: newElems }
    }))
  }

  function addElement(pieceIdx: number) {
    const name = newElemName[pieceIdx]?.trim()
    if (!name) return
    setPieces(prev => prev.map((p, i) =>
      i === pieceIdx ? { ...p, elements: { ...p.elements, [name]: { etat: "Bon" as Etat, observation: "" } } } : p
    ))
    setNewElemName(prev => ({ ...prev, [pieceIdx]: "" }))
  }

  function addPiece(typeName: string, customName?: string) {
    const nom = customName || typeName
    const t = detectType(nom)
    setPieces(prev => [...prev, { nom, type: t, elements: makeElements(t), photos: [] }])
    setCustomPieceName("")
  }

  function removePiece(idx: number) {
    setPieces(prev => prev.filter((_, i) => i !== idx))
  }

  async function uploadPhotos(pieceIdx: number, files: FileList) {
    if (!session?.user?.email) return
    const currentCount = pieces[pieceIdx]?.photos.length || 0
    const maxToAdd = 5 - currentCount
    if (maxToAdd <= 0) { alert("Maximum 5 photos par piece"); return }
    const filesToUpload = Array.from(files).slice(0, maxToAdd)
    setUploadingPiece(pieceIdx)
    for (const file of filesToUpload) {
      const ext = file.name.split(".").pop()
      const path = `edl/${session.user.email}/${bienId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`
      const { error } = await supabase.storage.from("annonces-photos").upload(path, file, { upsert: false })
      if (error) { continue }
      const { data: urlData } = supabase.storage.from("annonces-photos").getPublicUrl(path)
      setPieces(prev => prev.map((p, i) =>
        i === pieceIdx ? { ...p, photos: [...p.photos, urlData.publicUrl] } : p
      ))
    }
    setUploadingPiece(null)
  }

  function removePhoto(pieceIdx: number, photoIdx: number) {
    setPieces(prev => prev.map((p, i) =>
      i === pieceIdx ? { ...p, photos: p.photos.filter((_, j) => j !== photoIdx) } : p
    ))
  }

  async function sauvegarderEdl() {
    if (!bien || !session?.user?.email) return
    setSaving(true)
    const payload = {
      annonce_id: Number(bienId),
      proprietaire_email: session.user.email,
      type,
      date_edl: dateEdl,
      prenom_bailleur: prenomBailleur,
      nom_bailleur: nomBailleur,
      email_bailleur: emailBailleur,
      prenom_locataire: prenomLocataire,
      nom_locataire: nomLocataire,
      email_locataire: emailLocataire,
      compteurs,
      cles,
      observations,
      pieces_data: pieces,
    }
    if (edlExistant) {
      await supabase.from("etats_des_lieux").update(payload).eq("id", edlExistant.id)
    } else {
      const { data } = await supabase.from("etats_des_lieux").insert([payload]).select().single()
      if (data) setEdlExistant(data)
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  function generer() {
    if (!bien) return
    const totalPhotos = pieces.reduce((s, p) => s + p.photos.length, 0)
    genererEdlPDF({
      type,
      dateEdl,
      prenomBailleur,
      nomBailleur,
      emailBailleur,
      prenomLocataire,
      nomLocataire,
      emailLocataire,
      titreBien: bien.titre || "",
      adresseBien: bien.adresse || "",
      villeBien: bien.ville || "",
      surface: Number(bien.surface) || 0,
      pieces,
      compteurs,
      cles,
      observations,
      photoCount: totalPhotos,
    })
  }

  // Score de completion
  const totalElements = pieces.reduce((s, p) => s + Object.keys(p.elements).length, 0)
  const elementsRemplis = pieces.reduce((s, p) => s + Object.values(p.elements).filter(e => e.etat !== "Bon").length, 0)
  const totalPhotos = pieces.reduce((s, p) => s + p.photos.length, 0)

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#6b7280" }}>Chargement...</div>
  )
  if (!bien) return null

  const inp: any = { width: "100%", padding: "10px 14px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }
  const cardS: any = { background: "white", borderRadius: 20, padding: isMobile ? 18 : 28, marginBottom: 20 }
  const lbl: any = { fontSize: 12, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6 }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: isMobile ? "24px 16px" : "40px 48px" }}>

        <Link href={`/proprietaire/stats?id=${bienId}`} style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>
          ← Retour aux statistiques
        </Link>

        <div style={{ marginTop: 16, marginBottom: 28 }}>
          <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, letterSpacing: "-0.5px" }}>Etat des lieux</h1>
          <p style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>{bien.titre} — {bien.ville} — {bien.surface} m²</p>
        </div>

        {/* Recap barre */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            { label: "Pieces", val: pieces.length, bg: "#eff6ff", color: "#1d4ed8" },
            { label: "Elements", val: totalElements, bg: "#f3f4f6", color: "#374151" },
            { label: "Modifies", val: elementsRemplis, bg: elementsRemplis > 0 ? "#fff7ed" : "#f3f4f6", color: elementsRemplis > 0 ? "#ea580c" : "#9ca3af" },
            { label: "Photos", val: totalPhotos, bg: totalPhotos > 0 ? "#dcfce7" : "#f3f4f6", color: totalPhotos > 0 ? "#16a34a" : "#9ca3af" },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: "10px 16px", flex: 1, minWidth: 70, textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.val}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Type */}
        <div style={cardS}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Type d'etat des lieux</h2>
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            {(["entree", "sortie"] as const).map(t => (
              <button key={t} onClick={() => setType(t)}
                style={{
                  flex: 1, padding: "14px 20px", borderRadius: 14, cursor: "pointer", fontFamily: "inherit", textAlign: "center",
                  background: type === t ? "#111" : "white", color: type === t ? "white" : "#111",
                  border: type === t ? "1.5px solid #111" : "1.5px solid #e5e7eb", fontWeight: 700, fontSize: 14,
                }}>
                {t === "entree" ? "Entree" : "Sortie"}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            <div><label style={lbl}>Date de l'etat des lieux</label><input style={inp} type="date" value={dateEdl} onChange={e => setDateEdl(e.target.value)} /></div>
            <div><label style={lbl}>Cles remises</label><input style={inp} value={cles} onChange={e => setCles(e.target.value)} /></div>
          </div>
        </div>

        {/* Le Bailleur */}
        <div style={cardS}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Le bailleur</h2>
          <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 16 }}>Pre-rempli depuis votre profil — modifiable</p>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
            <div><label style={lbl}>Prenom</label><input style={inp} value={prenomBailleur} onChange={e => setPrenomBailleur(e.target.value)} placeholder="Prenom" /></div>
            <div><label style={lbl}>Nom</label><input style={inp} value={nomBailleur} onChange={e => setNomBailleur(e.target.value)} placeholder="Nom de famille" /></div>
            <div><label style={lbl}>Email</label><input style={inp} value={emailBailleur} onChange={e => setEmailBailleur(e.target.value)} placeholder="email@exemple.fr" type="email" /></div>
          </div>
        </div>

        {/* Le Locataire */}
        <div style={cardS}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Le locataire</h2>
          <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 16 }}>Si non renseigne, les champs seront a completer a la main sur le PDF</p>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
            <div><label style={lbl}>Prenom</label><input style={inp} value={prenomLocataire} onChange={e => setPrenomLocataire(e.target.value)} placeholder="Prenom" /></div>
            <div><label style={lbl}>Nom</label><input style={inp} value={nomLocataire} onChange={e => setNomLocataire(e.target.value)} placeholder="Nom de famille" /></div>
            <div><label style={lbl}>Email</label><input style={inp} value={emailLocataire} onChange={e => setEmailLocataire(e.target.value)} placeholder="email@exemple.fr" type="email" /></div>
          </div>
        </div>

        {/* Compteurs */}
        <div style={cardS}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Releves de compteurs</h2>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
            <div><label style={lbl}>Eau (m3)</label><input style={inp} value={compteurs.eau} onChange={e => setCompteurs(c => ({ ...c, eau: e.target.value }))} placeholder="1234" /></div>
            <div><label style={lbl}>Electricite (kWh)</label><input style={inp} value={compteurs.elec} onChange={e => setCompteurs(c => ({ ...c, elec: e.target.value }))} placeholder="5678" /></div>
            <div><label style={lbl}>Gaz (m3)</label><input style={inp} value={compteurs.gaz} onChange={e => setCompteurs(c => ({ ...c, gaz: e.target.value }))} placeholder="Non concerne" /></div>
          </div>
        </div>

        {/* ─── Pieces ─── */}
        {pieces.map((piece, pieceIdx) => (
          <div key={pieceIdx} style={cardS}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{piece.nom}</h2>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#9ca3af" }}>{Object.keys(piece.elements).length} elements</span>
                <button onClick={() => removePiece(pieceIdx)}
                  style={{ background: "none", border: "1.5px solid #fecaca", color: "#dc2626", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Retirer
                </button>
              </div>
            </div>
            <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 16 }}>Type : {piece.type}</p>

            {/* Elements */}
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {Object.entries(piece.elements).map(([elem, val]) => {
                const st = ETAT_STYLE[val.etat]
                return (
                  <div key={elem} style={{ padding: "10px 0", borderBottom: "1px solid #f9fafb" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", flex: 1 }}>{elem}</span>
                      <button onClick={() => removeElement(pieceIdx, elem)}
                        style={{ background: "none", border: "none", color: "#d1d5db", fontSize: 16, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}
                        title="Retirer cet element">
                        ×
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: val.observation || isMobile ? 8 : 0 }}>
                      {ETATS.map(etat => {
                        const s = ETAT_STYLE[etat]
                        const active = val.etat === etat
                        return (
                          <button key={etat} onClick={() => updateElement(pieceIdx, elem, "etat", etat)}
                            style={{
                              padding: isMobile ? "5px 8px" : "4px 10px", borderRadius: 999,
                              fontSize: isMobile ? 10 : 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                              background: active ? s.bg : "#f9fafb",
                              color: active ? s.color : "#9ca3af",
                              border: active ? `1.5px solid ${s.color}` : "1.5px solid transparent",
                            }}>
                            {etat}
                          </button>
                        )
                      })}
                    </div>
                    <input
                      value={val.observation}
                      onChange={e => updateElement(pieceIdx, elem, "observation", e.target.value)}
                      placeholder="Observation (tache, rayure, manque...)..."
                      style={{ width: "100%", padding: "6px 10px", border: "1.5px solid #f3f4f6", borderRadius: 8, fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const, marginTop: 4 }}
                    />
                  </div>
                )
              })}
            </div>

            {/* Ajouter un element */}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input
                value={newElemName[pieceIdx] || ""}
                onChange={e => setNewElemName(prev => ({ ...prev, [pieceIdx]: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && addElement(pieceIdx)}
                placeholder="Ajouter un element..."
                style={{ flex: 1, padding: "7px 10px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 12, outline: "none", fontFamily: "inherit" }}
              />
              <button onClick={() => addElement(pieceIdx)}
                style={{ background: "#f3f4f6", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", color: "#374151" }}>
                +
              </button>
            </div>

            {/* Photos */}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #f3f4f6" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>Photos ({piece.photos.length}/5)</span>
                <input
                  ref={el => { photoRefs.current[pieceIdx] = el }}
                  type="file" accept="image/*" multiple
                  style={{ display: "none" }}
                  onChange={e => { if (e.target.files && e.target.files.length > 0) { uploadPhotos(pieceIdx, e.target.files); e.target.value = "" } }}
                />
                {piece.photos.length < 5 && (
                  <button onClick={() => photoRefs.current[pieceIdx]?.click()}
                    disabled={uploadingPiece === pieceIdx}
                    style={{
                      background: "#eff6ff", border: "1.5px solid #bfdbfe", color: "#1d4ed8",
                      borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700,
                      cursor: uploadingPiece === pieceIdx ? "not-allowed" : "pointer",
                      fontFamily: "inherit", opacity: uploadingPiece === pieceIdx ? 0.6 : 1,
                    }}>
                    {uploadingPiece === pieceIdx ? "Upload..." : `Ajouter des photos (${5 - piece.photos.length} restantes)`}
                  </button>
                )}
              </div>
              {piece.photos.length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {piece.photos.map((url, photoIdx) => (
                    <div key={photoIdx} style={{ position: "relative", width: 80, height: 80, borderRadius: 10, overflow: "hidden", border: "1.5px solid #e5e7eb" }}>
                      <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <button onClick={() => removePhoto(pieceIdx, photoIdx)}
                        style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.6)", color: "white", border: "none", borderRadius: "50%", width: 20, height: 20, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Ajouter une piece */}
        <div style={cardS}>
          <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>Ajouter une piece</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {PIECES_PROPOSEES.filter(p => p !== "Autre").map(p => (
              <button key={p} onClick={() => addPiece(p)}
                style={{ padding: "7px 14px", background: "#f3f4f6", border: "none", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#374151" }}>
                + {p}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={customPieceName} onChange={e => setCustomPieceName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && customPieceName.trim() && addPiece("Autre", customPieceName.trim())}
              placeholder="Nom personnalise (ex: Dressing, Cellier...)"
              style={{ flex: 1, padding: "9px 14px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 13, outline: "none", fontFamily: "inherit" }} />
            <button onClick={() => customPieceName.trim() && addPiece("Autre", customPieceName.trim())}
              style={{ background: "#111", color: "white", border: "none", borderRadius: 10, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
              Ajouter
            </button>
          </div>
        </div>

        {/* Observations */}
        <div style={cardS}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Observations generales</h2>
          <textarea value={observations} onChange={e => setObservations(e.target.value)}
            placeholder="Remarques generales, defauts constates, accord entre les parties..."
            rows={4}
            style={{ ...inp, resize: "vertical" }} />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 12, flexDirection: isMobile ? "column" : "row" }}>
          <button onClick={sauvegarderEdl} disabled={saving}
            style={{
              flex: 1, padding: "16px 32px",
              background: saved ? "#16a34a" : saving ? "#9ca3af" : "#111", color: "white",
              border: "none", borderRadius: 16, fontWeight: 800, fontSize: 16,
              cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit",
            }}>
            {saving ? "Sauvegarde..." : saved ? "Sauvegarde !" : edlExistant ? "Mettre a jour l'EDL" : "Sauvegarder l'EDL"}
          </button>
          <button onClick={generer}
            style={{
              flex: 1, padding: "16px 32px",
              background: "white", color: "#111",
              border: "1.5px solid #111", borderRadius: 16, fontWeight: 800, fontSize: 16,
              cursor: "pointer", fontFamily: "inherit",
            }}>
            Telecharger le PDF
          </button>
        </div>

        {edlExistant && (
          <div style={{ background: "#dcfce7", border: "1.5px solid #bbf7d0", borderRadius: 12, padding: "12px 16px", marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16 }}>✓</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#166534", margin: 0 }}>Etat des lieux sauvegarde</p>
              <p style={{ fontSize: 12, color: "#16a34a", margin: "2px 0 0" }}>
                {edlExistant.type === "entree" ? "Entree" : "Sortie"} — {new Date(edlExistant.date_edl || edlExistant.created_at).toLocaleDateString("fr-FR")}
              </p>
            </div>
          </div>
        )}

        <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 12, lineHeight: 1.6 }}>
          Document contradictoire — a signer par les deux parties.{totalPhotos > 0 ? ` ${totalPhotos} photo(s) jointes en annexe.` : ""}
        </p>
      </div>
    </main>
  )
}
