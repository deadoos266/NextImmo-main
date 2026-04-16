"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../../../lib/supabase"
import { useResponsive } from "../../../hooks/useResponsive"
import jsPDF from "jspdf"

const ETATS = ["Neuf", "Bon etat", "Etat d'usage", "Mauvais etat", "Hors service"] as const
type Etat = typeof ETATS[number]

const ETAT_COLOR: Record<Etat, string> = {
  "Neuf": "#16a34a",
  "Bon etat": "#16a34a",
  "Etat d'usage": "#ea580c",
  "Mauvais etat": "#dc2626",
  "Hors service": "#dc2626",
}

const PIECES_DEFAULT = [
  "Entree",
  "Sejour / Salon",
  "Cuisine",
  "Chambre 1",
  "Salle de bain",
  "WC",
]

const ELEMENTS = [
  "Sols",
  "Murs",
  "Plafond",
  "Fenetre(s)",
  "Porte(s)",
  "Prises electriques",
  "Interrupteurs",
  "Eclairage",
  "Chauffage",
  "Placards / rangements",
]

type PieceData = {
  nom: string
  elements: Record<string, { etat: Etat; observation: string }>
}

function genererEdlPDF(data: {
  type: "entree" | "sortie"
  dateEdl: string
  nomBailleur: string
  nomLocataire: string
  titreBien: string
  adresseBien: string
  villeBien: string
  pieces: PieceData[]
  compteurs: { eau: string; elec: string; gaz: string }
  cles: string
  observations: string
}) {
  const doc = new jsPDF()
  const W = 170
  let y = 20

  function addTitle(text: string) {
    doc.setFontSize(16); doc.setFont("helvetica", "bold")
    doc.text(text, 105, y, { align: "center" }); y += 8
  }
  function addSection(text: string) {
    if (y > 255) { doc.addPage(); y = 20 }
    doc.setFontSize(11); doc.setFont("helvetica", "bold")
    doc.text(text, 20, y); y += 7
  }
  function addText(text: string) {
    if (y > 265) { doc.addPage(); y = 20 }
    doc.setFontSize(9); doc.setFont("helvetica", "normal")
    const lines = doc.splitTextToSize(text, W)
    doc.text(lines, 20, y); y += lines.length * 4.5
  }
  function addField(label: string, val: string) {
    if (y > 265) { doc.addPage(); y = 20 }
    doc.setFontSize(9); doc.setFont("helvetica", "bold")
    doc.text(`${label} :`, 20, y)
    doc.setFont("helvetica", "normal")
    doc.text(val, 70, y)
    y += 5.5
  }
  function addLine() {
    doc.setDrawColor(200, 200, 200); doc.line(20, y, 190, y); y += 6
  }

  const dateLabel = new Date(data.dateEdl).toLocaleDateString("fr-FR")
  const typeLabel = data.type === "entree" ? "ENTRÉE" : "SORTIE"

  addTitle(`ÉTAT DES LIEUX D'${typeLabel}`)
  doc.setFontSize(9); doc.setFont("helvetica", "normal")
  doc.text(`Établi le ${dateLabel}`, 105, y, { align: "center" }); y += 10
  addLine()

  // Parties
  addSection("PARTIES")
  addField("Bailleur", data.nomBailleur)
  addField("Locataire", data.nomLocataire)
  y += 3

  // Bien
  addSection("LOGEMENT")
  addField("Bien", data.titreBien)
  addField("Adresse", `${data.adresseBien || ""} ${data.villeBien}`.trim())
  y += 3
  addLine()

  // Compteurs
  addSection("RELEVÉS DE COMPTEURS")
  addField("Eau", data.compteurs.eau || "Non releve")
  addField("Electricite", data.compteurs.elec || "Non releve")
  addField("Gaz", data.compteurs.gaz || "Non releve")
  y += 3

  // Clés
  addField("Cles remises", data.cles || "Non precise")
  y += 3
  addLine()

  // Pièces
  data.pieces.forEach(piece => {
    if (y > 220) { doc.addPage(); y = 20 }
    addSection(piece.nom.toUpperCase())
    y += 2

    // Table header
    doc.setFontSize(8); doc.setFont("helvetica", "bold")
    doc.text("Element", 20, y)
    doc.text("Etat", 90, y)
    doc.text("Observation", 130, y)
    y += 4
    doc.setDrawColor(220, 220, 220); doc.line(20, y, 190, y); y += 3

    doc.setFont("helvetica", "normal")
    Object.entries(piece.elements).forEach(([elem, val]) => {
      if (y > 270) { doc.addPage(); y = 20 }
      doc.setFontSize(8)
      doc.text(elem, 20, y)
      doc.text(val.etat, 90, y)
      if (val.observation) {
        const obs = doc.splitTextToSize(val.observation, 55)
        doc.text(obs, 130, y)
        y += Math.max(4.5, obs.length * 4)
      } else {
        y += 4.5
      }
    })
    y += 4
  })

  addLine()

  // Observations
  if (data.observations) {
    addSection("OBSERVATIONS GÉNÉRALES")
    addText(data.observations)
    y += 4
    addLine()
  }

  // Signatures
  if (y > 220) { doc.addPage(); y = 20 }
  addSection("SIGNATURES")
  y += 4
  addText(`Fait contradictoirement le ${dateLabel}.`)
  y += 10
  doc.setFontSize(10); doc.setFont("helvetica", "bold")
  doc.text("Le Bailleur", 50, y, { align: "center" })
  doc.text("Le Locataire", 155, y, { align: "center" })
  y += 5
  doc.setFontSize(9); doc.setFont("helvetica", "normal")
  doc.text(data.nomBailleur, 50, y, { align: "center" })
  doc.text(data.nomLocataire, 155, y, { align: "center" })
  doc.line(20, y + 15, 85, y + 15)
  doc.line(120, y + 15, 185, y + 15)

  doc.setFontSize(7); doc.setTextColor(150, 150, 150)
  doc.text("Document genere par NestMatch — nestmatch.fr", 105, 285, { align: "center" })

  doc.save(`edl-${data.type}-${data.villeBien.toLowerCase()}-${data.dateEdl}.pdf`)
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
  const [nomLocataire, setNomLocataire] = useState("")
  const [pieces, setPieces] = useState<PieceData[]>([])
  const [compteurs, setCompteurs] = useState({ eau: "", elec: "", gaz: "" })
  const [cles, setCles] = useState("2 cles + 1 badge")
  const [observations, setObservations] = useState("")
  const [newPiece, setNewPiece] = useState("")

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth")
    if (session && bienId) loadBien()
  }, [session, status, bienId])

  async function loadBien() {
    const { data } = await supabase.from("annonces").select("*").eq("id", bienId).single()
    if (data) {
      setBien(data)
      const nbChambres = Number(data.chambres) || 1
      const piecesInit = [...PIECES_DEFAULT]
      for (let i = 2; i <= nbChambres; i++) piecesInit.splice(3 + i - 2, 0, `Chambre ${i}`)
      setPieces(piecesInit.map(nom => ({
        nom,
        elements: Object.fromEntries(ELEMENTS.map(e => [e, { etat: "Bon etat" as Etat, observation: "" }])),
      })))
    }
    setLoading(false)
  }

  function updateElement(pieceIdx: number, element: string, field: "etat" | "observation", value: string) {
    setPieces(prev => prev.map((p, i) =>
      i === pieceIdx
        ? { ...p, elements: { ...p.elements, [element]: { ...p.elements[element], [field]: value } } }
        : p
    ))
  }

  function addPiece() {
    if (!newPiece.trim()) return
    setPieces(prev => [...prev, {
      nom: newPiece.trim(),
      elements: Object.fromEntries(ELEMENTS.map(e => [e, { etat: "Bon etat" as Etat, observation: "" }])),
    }])
    setNewPiece("")
  }

  function removePiece(idx: number) {
    setPieces(prev => prev.filter((_, i) => i !== idx))
  }

  function generer() {
    if (!bien) return
    genererEdlPDF({
      type,
      dateEdl,
      nomBailleur: bien.proprietaire || session?.user?.name || "",
      nomLocataire: nomLocataire || bien.locataire_email || "",
      titreBien: bien.titre || "",
      adresseBien: bien.adresse || "",
      villeBien: bien.ville || "",
      pieces,
      compteurs,
      cles,
      observations,
    })
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#6b7280" }}>Chargement...</div>
  )
  if (!bien) return null

  const inp: any = { width: "100%", padding: "10px 14px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }
  const sel: any = { ...inp, background: "white" }
  const cardS: any = { background: "white", borderRadius: 20, padding: isMobile ? 20 : 28, marginBottom: 20 }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: isMobile ? "24px 16px" : "40px 48px" }}>

        <Link href={`/proprietaire/stats?id=${bienId}`} style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>
          ← Retour aux statistiques
        </Link>

        <div style={{ marginTop: 16, marginBottom: 28 }}>
          <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, letterSpacing: "-0.5px" }}>Etat des lieux</h1>
          <p style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>{bien.titre} — {bien.ville}</p>
        </div>

        {/* Type + Infos generales */}
        <div style={cardS}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Informations generales</h2>
          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
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
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6 }}>Date</label>
              <input style={inp} type="date" value={dateEdl} onChange={e => setDateEdl(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6 }}>Nom du locataire</label>
              <input style={inp} value={nomLocataire} onChange={e => setNomLocataire(e.target.value)} placeholder={bien.locataire_email || "Nom complet"} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6 }}>Cles remises</label>
              <input style={inp} value={cles} onChange={e => setCles(e.target.value)} placeholder="2 cles + 1 badge" />
            </div>
          </div>
        </div>

        {/* Compteurs */}
        <div style={cardS}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Releves de compteurs</h2>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6 }}>Eau (m3)</label>
              <input style={inp} value={compteurs.eau} onChange={e => setCompteurs(c => ({ ...c, eau: e.target.value }))} placeholder="1234" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6 }}>Electricite (kWh)</label>
              <input style={inp} value={compteurs.elec} onChange={e => setCompteurs(c => ({ ...c, elec: e.target.value }))} placeholder="5678" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6 }}>Gaz (m3)</label>
              <input style={inp} value={compteurs.gaz} onChange={e => setCompteurs(c => ({ ...c, gaz: e.target.value }))} placeholder="910" />
            </div>
          </div>
        </div>

        {/* Pièces */}
        {pieces.map((piece, pieceIdx) => (
          <div key={pieceIdx} style={cardS}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{piece.nom}</h2>
              <button onClick={() => removePiece(pieceIdx)}
                style={{ background: "none", border: "1.5px solid #fecaca", color: "#dc2626", borderRadius: 8, padding: "4px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Retirer
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ELEMENTS.map(elem => (
                <div key={elem} style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? 8 : 14, flexDirection: isMobile ? "column" : "row", padding: "8px 0", borderBottom: "1px solid #f9fafb" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, minWidth: 140, color: "#374151" }}>{elem}</span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {ETATS.map(etat => (
                      <button key={etat} onClick={() => updateElement(pieceIdx, elem, "etat", etat)}
                        style={{
                          padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                          cursor: "pointer", fontFamily: "inherit",
                          background: piece.elements[elem]?.etat === etat ? ETAT_COLOR[etat] : "#f3f4f6",
                          color: piece.elements[elem]?.etat === etat ? "white" : "#6b7280",
                          border: "none",
                        }}>
                        {etat}
                      </button>
                    ))}
                  </div>
                  <input
                    value={piece.elements[elem]?.observation || ""}
                    onChange={e => updateElement(pieceIdx, elem, "observation", e.target.value)}
                    placeholder="Observation..."
                    style={{ flex: 1, padding: "6px 10px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 12, outline: "none", fontFamily: "inherit", minWidth: isMobile ? "100%" : 120, boxSizing: "border-box" as const }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Ajouter une piece */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <input value={newPiece} onChange={e => setNewPiece(e.target.value)}
            placeholder="Ajouter une piece (ex: Balcon, Garage...)"
            onKeyDown={e => e.key === "Enter" && addPiece()}
            style={{ flex: 1, padding: "10px 14px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 14, outline: "none", fontFamily: "inherit" }} />
          <button onClick={addPiece}
            style={{ padding: "10px 20px", background: "#111", color: "white", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
            + Ajouter
          </button>
        </div>

        {/* Observations generales */}
        <div style={cardS}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Observations generales</h2>
          <textarea value={observations} onChange={e => setObservations(e.target.value)}
            placeholder="Remarques generales sur l'etat du logement..."
            rows={4}
            style={{ ...inp, resize: "vertical" }} />
        </div>

        {/* Generer */}
        <button onClick={generer}
          style={{
            width: "100%", padding: "16px 32px",
            background: "#111", color: "white",
            border: "none", borderRadius: 16, fontWeight: 800, fontSize: 16,
            cursor: "pointer", fontFamily: "inherit",
          }}>
          Generer l'etat des lieux PDF
        </button>

        <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 12, lineHeight: 1.6 }}>
          Document contradictoire — a signer par les deux parties lors de la remise des cles.
        </p>
      </div>
    </main>
  )
}
