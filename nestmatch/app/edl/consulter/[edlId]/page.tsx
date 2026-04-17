"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../../../lib/supabase"
import { useResponsive } from "../../../hooks/useResponsive"
// jsPDF lazy-loaded pour alleger le bundle initial (voir genererEdlPDF)

// ─── Types & Config ─────────────────────────────────────────────────────────

type Etat = "Neuf" | "Tres bon" | "Bon" | "Usage" | "Mauvais" | "Degrade"

const ETAT_STYLE: Record<Etat, { bg: string; color: string; border: string }> = {
  "Neuf":     { bg: "#dcfce7", color: "#16a34a", border: "#bbf7d0" },
  "Tres bon": { bg: "#dcfce7", color: "#16a34a", border: "#bbf7d0" },
  "Bon":      { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  "Usage":    { bg: "#fff7ed", color: "#ea580c", border: "#fed7aa" },
  "Mauvais":  { bg: "#fee2e2", color: "#dc2626", border: "#fecaca" },
  "Degrade":  { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5" },
}

type ElementData = { etat: Etat; observation: string }
type PieceData = {
  nom: string
  type: string
  elements: Record<string, ElementData>
  photos: string[]
}

// ─── Etat Badge ─────────────────────────────────────────────────────────────

function EtatBadge({ etat }: { etat: Etat }) {
  const s = ETAT_STYLE[etat] || ETAT_STYLE["Bon"]
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999,
    }}>
      {etat}
    </span>
  )
}

// ─── ZIP photos — telechargement de toutes les photos de l'EDL ────────────────

async function telechargerPhotosZip(edl: any) {
  const pieces: PieceData[] = Array.isArray(edl?.pieces) ? edl.pieces : []
  const allPhotos: { url: string; piece: string; idx: number }[] = []
  pieces.forEach(p => {
    if (Array.isArray(p.photos)) {
      p.photos.forEach((url: string, idx: number) => {
        if (url) allPhotos.push({ url, piece: p.nom || "piece", idx: idx + 1 })
      })
    }
  })

  if (allPhotos.length === 0) {
    alert("Aucune photo dans cet etat des lieux.")
    return
  }

  const { default: JSZip } = await import("jszip")
  const zip = new JSZip()

  // Fetch toutes les photos en parallele, les ajouter au zip
  const results = await Promise.allSettled(
    allPhotos.map(async ({ url, piece, idx }) => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Photo ${idx} (${piece}) : ${res.status}`)
      const blob = await res.blob()
      const ext = (url.split(".").pop() || "jpg").split("?")[0].slice(0, 4)
      const safePiece = piece.replace(/[^a-zA-Z0-9\-_]/g, "_").slice(0, 40)
      zip.file(`${safePiece}/photo-${String(idx).padStart(2, "0")}.${ext}`, blob)
    })
  )

  const failed = results.filter(r => r.status === "rejected").length
  if (failed > 0 && failed === allPhotos.length) {
    alert("Impossible de telecharger les photos. Verifiez votre connexion.")
    return
  }

  const zipBlob = await zip.generateAsync({ type: "blob" })
  const typeLabel = edl?.type === "entree" ? "entree" : "sortie"
  const dateLabel = edl?.date_edl ? new Date(edl.date_edl).toISOString().split("T")[0] : "edl"
  const filename = `edl-${typeLabel}-${dateLabel}-photos.zip`

  const link = document.createElement("a")
  const href = URL.createObjectURL(zipBlob)
  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(href)

  if (failed > 0) {
    alert(`${failed} photo(s) n'ont pas pu etre telechargees. L'archive contient ${allPhotos.length - failed} photo(s).`)
  }
}

// ─── PDF Generator (simplified from proprietaire page) ──────────────────────

async function genererEdlPDF(edl: any, bien: any) {
  const { default: jsPDF } = await import("jspdf")
  const doc = new jsPDF()
  const W = 170
  let y = 20

  function check() { if (y > 260) { doc.addPage(); y = 20 } }
  function title(t: string) { doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.text(t, 105, y, { align: "center" }); y += 8 }
  function section(t: string) { check(); doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.text(t, 20, y); y += 7 }
  function text(t: string) { check(); doc.setFontSize(9); doc.setFont("helvetica", "normal"); const l = doc.splitTextToSize(t, W); doc.text(l, 20, y); y += l.length * 4.5 }
  function field(l: string, v: string) {
    check(); doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text(`${l} :`, 20, y)
    if (v) { doc.setFont("helvetica", "normal"); doc.text(v, 75, y) }
    y += 5.5
  }
  function line() { doc.setDrawColor(200, 200, 200); doc.line(20, y, 190, y); y += 6 }

  const dateLabel = new Date(edl.date_edl).toLocaleDateString("fr-FR")
  const typeLabel = edl.type === "entree" ? "ENTREE" : "SORTIE"

  title(`ETAT DES LIEUX D'${typeLabel}`)
  doc.setFontSize(9); doc.setFont("helvetica", "normal")
  doc.text(`Etabli contradictoirement le ${dateLabel}`, 105, y, { align: "center" }); y += 10
  line()

  section("PARTIES")
  y += 2
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text("LE BAILLEUR", 20, y); y += 5
  field("Nom", edl.nom_bailleur || "")
  field("Prenom", edl.prenom_bailleur || "")
  field("Email", edl.email_bailleur || "")
  y += 4
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text("LE LOCATAIRE", 20, y); y += 5
  field("Nom", edl.nom_locataire || "")
  field("Prenom", edl.prenom_locataire || "")
  field("Email", edl.email_locataire || "")
  y += 3; line()

  section("LOGEMENT")
  field("Designation", bien?.titre || "")
  field("Adresse", `${bien?.adresse || ""} ${bien?.ville || ""}`.trim())
  if (bien?.surface) field("Surface", `${bien.surface} m2`)
  y += 3; line()

  const compteurs = edl.compteurs || {}
  section("RELEVES DE COMPTEURS")
  field("Eau", compteurs.eau ? `${compteurs.eau} m3` : "Non releve")
  field("Electricite", compteurs.elec ? `${compteurs.elec} kWh` : "Non releve")
  field("Gaz", compteurs.gaz ? `${compteurs.gaz} m3` : "Non releve")
  field("Cles remises", edl.cles || "Non precise")
  y += 3; line()

  const pieces: PieceData[] = edl.pieces_data || []
  pieces.forEach((piece: PieceData) => {
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
      const isGood = val.etat === "Neuf" || val.etat === "Tres bon" || val.etat === "Bon"
      doc.setTextColor(isGood ? 22 : 220, isGood ? 163 : 38, isGood ? 74 : 38)
      doc.text(val.etat, 95, y)
      doc.setTextColor(0, 0, 0)
      if (val.observation) {
        const obs = doc.splitTextToSize(val.observation, 50)
        doc.text(obs, 135, y)
        y += Math.max(4.5, obs.length * 4)
      } else { y += 4.5 }
    })
    y += 4
  })

  line()
  if (edl.observations) { section("OBSERVATIONS GENERALES"); text(edl.observations); y += 4; line() }

  section("SIGNATURES")
  y += 4
  text(`Les parties declarent que le present etat des lieux a ete etabli contradictoirement et de bonne foi le ${dateLabel}.`)
  y += 10
  doc.setFontSize(10); doc.setFont("helvetica", "bold")
  doc.text("Le Bailleur", 50, y, { align: "center" })
  doc.text("Le Locataire", 155, y, { align: "center" })

  doc.setFontSize(7); doc.setTextColor(150, 150, 150)
  doc.text("Document genere par NestMatch — nestmatch.fr", 105, 285, { align: "center" })

  doc.save(`edl-${edl.type}-${(bien?.ville || "bien").toLowerCase().replace(/\s/g, "-")}-${edl.date_edl}.pdf`)
}

// ─── Page component ─────────────────────────────────────────────────────────

export default function ConsulterEdlPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const edlId = params.edlId as string
  const { isMobile } = useResponsive()

  const [edl, setEdl] = useState<any>(null)
  const [bien, setBien] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showContest, setShowContest] = useState(false)
  const [commentaire, setCommentaire] = useState("")
  const [validating, setValidating] = useState(false)
  const [contesting, setContesting] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth")
    if (session && edlId) loadEdl()
  }, [session, status, edlId])

  async function loadEdl() {
    const { data, error: err } = await supabase
      .from("etats_des_lieux")
      .select("*")
      .eq("id", edlId)
      .single()

    if (err || !data) {
      setError("État des lieux introuvable")
      setLoading(false)
      return
    }

    // Verify access: locataire email must match
    const userEmail = session?.user?.email?.toLowerCase()
    const edlLocataireEmail = (data.email_locataire || data.locataire_email || "").toLowerCase()
    const edlProprietaireEmail = (data.proprietaire_email || "").toLowerCase()

    if (userEmail !== edlLocataireEmail && userEmail !== edlProprietaireEmail) {
      setError("Vous n'avez pas acces a cet etat des lieux")
      setLoading(false)
      return
    }

    setEdl(data)

    // Load the bien
    if (data.annonce_id) {
      const { data: bienData } = await supabase
        .from("annonces")
        .select("titre, ville, adresse, surface")
        .eq("id", data.annonce_id)
        .single()
      if (bienData) setBien(bienData)
    }

    setLoading(false)
  }

  async function validerEdl() {
    if (!edl || !session?.user?.email) return
    setValidating(true)

    await supabase.from("etats_des_lieux").update({
      statut: "valide",
      date_validation: new Date().toISOString(),
    }).eq("id", edl.id)

    // Send auto message to proprietaire
    await supabase.from("messages").insert([{
      from_email: session.user.email,
      to_email: edl.proprietaire_email,
      contenu: "L'etat des lieux a ete valide par le locataire",
      lu: false,
    }])

    setEdl({ ...edl, statut: "valide", date_validation: new Date().toISOString() })
    setValidating(false)
  }

  async function contesterEdl() {
    if (!edl || !session?.user?.email || !commentaire.trim()) return
    setContesting(true)

    await supabase.from("etats_des_lieux").update({
      statut: "conteste",
      commentaire_locataire: commentaire.trim(),
    }).eq("id", edl.id)

    // Send auto message to proprietaire
    await supabase.from("messages").insert([{
      from_email: session.user.email,
      to_email: edl.proprietaire_email,
      contenu: `L'etat des lieux a ete conteste par le locataire : "${commentaire.trim()}"`,
      lu: false,
    }])

    setEdl({ ...edl, statut: "conteste", commentaire_locataire: commentaire.trim() })
    setContesting(false)
    setShowContest(false)
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'DM Sans', sans-serif", color: "#6b7280" }}>
      Chargement...
    </div>
  )

  if (error) return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "white", borderRadius: 20, padding: "40px 48px", textAlign: "center", maxWidth: 420, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{error}</h2>
        <Link href="/" style={{ fontSize: 13, color: "#1d4ed8", textDecoration: "none", fontWeight: 600 }}>
          Retour a l'accueil
        </Link>
      </div>
    </main>
  )

  if (!edl) return null

  const statut = edl.statut || "brouillon"
  const pieces: PieceData[] = edl.pieces_data || []
  const compteurs = edl.compteurs || { eau: "", elec: "", gaz: "" }
  const typeLabel = edl.type === "entree" ? "entree" : "sortie"
  const dateLabel = edl.date_edl ? new Date(edl.date_edl).toLocaleDateString("fr-FR") : "—"

  const cardS: any = { background: "white", borderRadius: 20, padding: isMobile ? 18 : 28, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }
  const lbl: any = { fontSize: 12, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 4 }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: isMobile ? "24px 16px" : "40px 48px" }}>

        {/* ─── Header ─── */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
            État des lieux
          </p>
          <h1 style={{ fontSize: isMobile ? 22 : 30, fontWeight: 800, letterSpacing: "-0.5px", margin: "0 0 6px" }}>
            État des lieux d'{typeLabel}
          </h1>
          <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>
            {bien?.titre || "Bien"} — {bien?.ville || ""} — {dateLabel}
          </p>
        </div>

        {/* ─── Status banner ─── */}
        {statut === "brouillon" && (
          <div style={{ background: "#f3f4f6", border: "1.5px solid #e5e7eb", borderRadius: 14, padding: "14px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>📝</span>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#6b7280", margin: 0 }}>Ce document est en cours de preparation par le proprietaire</p>
          </div>
        )}

        {statut === "envoye" && (
          <div style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 14, padding: "14px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>📋</span>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#1d4ed8", margin: 0 }}>Veuillez vérifier les informations puis valider ou contester cet état des lieux</p>
          </div>
        )}

        {statut === "valide" && (
          <div style={{ background: "#dcfce7", border: "1.5px solid #bbf7d0", borderRadius: 14, padding: "14px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>✓</span>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#166534", margin: 0 }}>
              État des lieux valide {edl.date_validation ? `le ${new Date(edl.date_validation).toLocaleDateString("fr-FR")}` : ""}
            </p>
          </div>
        )}

        {statut === "conteste" && (
          <div style={{ background: "#fefce8", border: "1.5px solid #fde68a", borderRadius: 14, padding: "14px 20px", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: edl.commentaire_locataire ? 8 : 0 }}>
              <span style={{ fontSize: 18 }}>⚠</span>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#92400e", margin: 0 }}>État des lieux contesté — en attente de révision par le propriétaire</p>
            </div>
            {edl.commentaire_locataire && (
              <p style={{ fontSize: 13, color: "#92400e", margin: "4px 0 0", fontStyle: "italic" }}>
                "{edl.commentaire_locataire}"
              </p>
            )}
          </div>
        )}

        {/* ─── General info ─── */}
        <div style={cardS}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Informations generales</h2>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
            <div><span style={lbl}>Type</span><p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{edl.type === "entree" ? "Entree" : "Sortie"}</p></div>
            <div><span style={lbl}>Date</span><p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{dateLabel}</p></div>
            <div><span style={lbl}>Cles remises</span><p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{edl.cles || "—"}</p></div>
          </div>
        </div>

        {/* ─── Bailleur ─── */}
        <div style={cardS}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Le bailleur</h2>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
            <div><span style={lbl}>Prenom</span><p style={{ fontSize: 14, margin: 0 }}>{edl.prenom_bailleur || "—"}</p></div>
            <div><span style={lbl}>Nom</span><p style={{ fontSize: 14, margin: 0 }}>{edl.nom_bailleur || "—"}</p></div>
            <div><span style={lbl}>Email</span><p style={{ fontSize: 14, margin: 0 }}>{edl.email_bailleur || "—"}</p></div>
          </div>
        </div>

        {/* ─── Locataire ─── */}
        <div style={cardS}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Le locataire</h2>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
            <div><span style={lbl}>Prenom</span><p style={{ fontSize: 14, margin: 0 }}>{edl.prenom_locataire || "—"}</p></div>
            <div><span style={lbl}>Nom</span><p style={{ fontSize: 14, margin: 0 }}>{edl.nom_locataire || "—"}</p></div>
            <div><span style={lbl}>Email</span><p style={{ fontSize: 14, margin: 0 }}>{edl.email_locataire || edl.locataire_email || "—"}</p></div>
          </div>
        </div>

        {/* ─── Compteurs ─── */}
        <div style={cardS}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Releves de compteurs</h2>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
            <div><span style={lbl}>Eau (m3)</span><p style={{ fontSize: 14, margin: 0 }}>{compteurs.eau || "Non releve"}</p></div>
            <div><span style={lbl}>Electricite (kWh)</span><p style={{ fontSize: 14, margin: 0 }}>{compteurs.elec || "Non releve"}</p></div>
            <div><span style={lbl}>Gaz (m3)</span><p style={{ fontSize: 14, margin: 0 }}>{compteurs.gaz || "Non releve"}</p></div>
          </div>
        </div>

        {/* ─── Pieces ─── */}
        {pieces.map((piece, pieceIdx) => (
          <div key={pieceIdx} style={cardS}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{piece.nom}</h2>
              <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>{Object.keys(piece.elements).length} elements</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {Object.entries(piece.elements).map(([elem, val]) => (
                <div key={elem} style={{
                  padding: "10px 0", borderBottom: "1px solid #f3f4f6",
                  display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", flex: 1, minWidth: 120 }}>{elem}</span>
                  <EtatBadge etat={val.etat} />
                  {val.observation && (
                    <span style={{ fontSize: 12, color: "#6b7280", fontStyle: "italic", flexBasis: isMobile ? "100%" : "auto" }}>
                      {val.observation}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Photos */}
            {piece.photos && piece.photos.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #f3f4f6" }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 8 }}>Photos ({piece.photos.length})</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {piece.photos.map((url: string, photoIdx: number) => (
                    <a key={photoIdx} href={url} target="_blank" rel="noopener noreferrer"
                      style={{ width: 80, height: 80, borderRadius: 10, overflow: "hidden", border: "1.5px solid #e5e7eb", display: "block", flexShrink: 0 }}>
                      <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* ─── Observations ─── */}
        {edl.observations && (
          <div style={cardS}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Observations generales</h2>
            <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.6, margin: 0 }}>{edl.observations}</p>
          </div>
        )}

        {/* ─── Actions ─── */}
        {statut === "envoye" && (
          <div style={cardS}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Votre decision</h2>

            {!showContest ? (
              <div style={{ display: "flex", gap: 12, flexDirection: isMobile ? "column" : "row" }}>
                <button onClick={validerEdl} disabled={validating}
                  style={{
                    flex: 1, padding: "16px 32px",
                    background: validating ? "#9ca3af" : "#16a34a", color: "white",
                    border: "none", borderRadius: 16, fontWeight: 800, fontSize: 16,
                    cursor: validating ? "not-allowed" : "pointer", fontFamily: "inherit",
                  }}>
                  {validating ? "Validation en cours..." : "Valider l'etat des lieux"}
                </button>
                <button onClick={() => setShowContest(true)}
                  style={{
                    flex: 1, padding: "16px 32px",
                    background: "white", color: "#ea580c",
                    border: "1.5px solid #fed7aa", borderRadius: 16, fontWeight: 800, fontSize: 16,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>
                  Contester
                </button>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#92400e", marginBottom: 10 }}>Décrivez les points que vous contestez :</p>
                <textarea
                  value={commentaire}
                  onChange={e => setCommentaire(e.target.value)}
                  placeholder="Indiquez les elements que vous souhaitez contester et pourquoi..."
                  rows={4}
                  style={{
                    width: "100%", padding: "12px 14px", border: "1.5px solid #fde68a", borderRadius: 12,
                    fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const,
                    resize: "vertical", marginBottom: 12,
                  }}
                />
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={contesterEdl} disabled={contesting || !commentaire.trim()}
                    style={{
                      padding: "12px 24px",
                      background: contesting || !commentaire.trim() ? "#e5e7eb" : "#ea580c",
                      color: contesting || !commentaire.trim() ? "#9ca3af" : "white",
                      border: "none", borderRadius: 999, fontWeight: 700, fontSize: 14,
                      cursor: contesting || !commentaire.trim() ? "not-allowed" : "pointer",
                      fontFamily: "inherit",
                    }}>
                    {contesting ? "Envoi..." : "Envoyer la contestation"}
                  </button>
                  <button onClick={() => { setShowContest(false); setCommentaire("") }}
                    style={{
                      padding: "12px 24px", background: "none", border: "1.5px solid #e5e7eb",
                      borderRadius: 999, fontWeight: 600, fontSize: 14, cursor: "pointer",
                      fontFamily: "inherit", color: "#6b7280",
                    }}>
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Telechargements */}
        {(statut === "valide" || statut === "envoye") && (
          <div style={{ display: "flex", gap: 12, marginTop: statut === "envoye" ? 0 : 0, flexWrap: "wrap" }}>
            <button onClick={() => genererEdlPDF(edl, bien)}
              style={{
                flex: "1 1 200px", padding: "14px 24px",
                background: "#111", color: "white",
                border: "1.5px solid #111", borderRadius: 16, fontWeight: 800, fontSize: 14,
                cursor: "pointer", fontFamily: "inherit",
              }}>
              Telecharger le PDF
            </button>
            <button onClick={() => telechargerPhotosZip(edl)}
              style={{
                flex: "1 1 200px", padding: "14px 24px",
                background: "white", color: "#111",
                border: "1.5px solid #111", borderRadius: 16, fontWeight: 700, fontSize: 14,
                cursor: "pointer", fontFamily: "inherit",
              }}>
              Telecharger les photos (.zip)
            </button>
          </div>
        )}

        <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 20, lineHeight: 1.6 }}>
          Document contradictoire — genere par NestMatch.
        </p>
      </div>
    </main>
  )
}
