"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../../../lib/supabase"
import { useResponsive } from "../../../hooks/useResponsive"
import { BRAND } from "../../../../lib/brand"
import { drawLogoPDF } from "../../../../lib/brandPDF"
import { postNotif } from "../../../../lib/notificationsClient"
import EdlSignatureModal from "../../../components/EdlSignatureModal"
import Image from "next/image"
// jsPDF lazy-loaded pour alleger le bundle initial (voir genererEdlPDF)

// ─── Types & Config ─────────────────────────────────────────────────────────

type Etat = "Neuf" | "Tres bon" | "Bon" | "Usage" | "Mauvais" | "Degrade"

const ETAT_STYLE: Record<Etat, { bg: string; color: string; border: string }> = {
  "Neuf":     { bg: "#F0FAEE", color: "#15803d", border: "#C6E9C0" },
  "Tres bon": { bg: "#F0FAEE", color: "#15803d", border: "#C6E9C0" },
  "Bon":      { bg: "#EEF3FB", color: "#1d4ed8", border: "#D7E3F4" },
  "Usage":    { bg: "#FBF6EA", color: "#a16207", border: "#EADFC6" },
  "Mauvais":  { bg: "#FEECEC", color: "#b91c1c", border: "#F4C9C9" },
  "Degrade":  { bg: "#FEECEC", color: "#b91c1c", border: "#F4C9C9" },
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
  // Bug fix : le champ DB s'appelle `pieces_data`, pas `pieces`. Avant, le zip
  // était toujours vide car edl.pieces = undefined → "Aucune photo".
  const pieces: PieceData[] = Array.isArray(edl?.pieces_data) ? edl.pieces_data : []
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
    alert(`${failed} photo(s) n'ont pas pu être téléchargées. L'archive contient ${allPhotos.length - failed} photo(s).`)
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

  drawLogoPDF(doc, { x: 20, y: 18, size: "medium" })
  y = 30
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

  // Fetch signatures electroniques (si table edl_signatures + signatures existent)
  type SigRow = { role: string; nom: string; png: string; signeAt: string; mention?: string | null; ipAddress?: string | null }
  const signatures: SigRow[] = Array.isArray(edl.__edl_signatures) ? edl.__edl_signatures : []
  const sigBailleur = signatures.find(s => s.role === "bailleur")
  const sigLocataire = signatures.find(s => s.role === "locataire")

  doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 0)
  doc.text("Le Bailleur", 50, y, { align: "center" })
  doc.text("Le Locataire", 155, y, { align: "center" })
  y += 6
  doc.setFontSize(9); doc.setFont("helvetica", "normal")
  doc.text(`${edl.prenom_bailleur || ""} ${edl.nom_bailleur || ""}`.trim(), 50, y, { align: "center" })
  doc.text(`${edl.prenom_locataire || ""} ${edl.nom_locataire || ""}`.trim(), 155, y, { align: "center" })
  y += 8

  const sigW = 60; const sigH = 24
  const renderSig = (sig: SigRow | undefined, xCenter: number) => {
    const xImg = xCenter - sigW / 2
    if (sig) {
      doc.setFontSize(8); doc.setFont("helvetica", "italic"); doc.setTextColor(60, 60, 60)
      doc.text(sig.mention || 'Lu et approuvé, bon pour accord', xCenter, y, { align: "center" })
      try { doc.addImage(sig.png, "PNG", xImg, y + 5, sigW, sigH) }
      catch { doc.line(xImg, y + sigH + 5, xImg + sigW, y + sigH + 5) }
      doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(21, 128, 61)
      doc.text(`✓ Signé le ${new Date(sig.signeAt).toLocaleDateString("fr-FR")}`, xCenter, y + sigH + 9, { align: "center" })
      doc.setTextColor(0, 0, 0)
    } else {
      doc.setFontSize(7); doc.setFont("helvetica", "italic"); doc.setTextColor(120, 120, 120)
      doc.text('(Mention "Lu et approuvé" + signature)', xCenter, y, { align: "center" })
      doc.setTextColor(0, 0, 0)
      doc.setDrawColor(180, 180, 180)
      doc.line(xImg, y + sigH + 5, xImg + sigW, y + sigH + 5)
    }
  }
  renderSig(sigBailleur, 50)
  renderSig(sigLocataire, 155)
  y += sigH + 16

  doc.setFontSize(7); doc.setTextColor(150, 150, 150)
  doc.text(`Document genere par ${BRAND.name} — ${BRAND.url.replace(/^https?:\/\//, "")}`, 105, 285, { align: "center" })

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
  const [signModalOpen, setSignModalOpen] = useState(false)
  const [signatures, setSignatures] = useState<Array<{ role: string; nom: string; signe_at: string }>>([])

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth")
    if (session && edlId) loadEdl()
  }, [session, status, edlId])

  async function loadEdl() {
    // Accès via API serveur : auth + vérification email côté service_role,
    // pas d'exposition directe de la table via l'anon key.
    const res = await fetch(`/api/edl/${encodeURIComponent(edlId as string)}`, { cache: "no-store" })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Erreur de chargement" }))
      setError(body?.error || (res.status === 403 ? "Vous n'avez pas accès à cet état des lieux" : "État des lieux introuvable"))
      setLoading(false)
      return
    }
    const { edl: data, bien: bienData } = await res.json()
    setEdl(data)
    if (bienData) setBien(bienData)
    // V55.1b — Fetch signatures EDL via /api/edl/signatures (RLS Phase 5)
    try {
      const sigRes = await fetch(`/api/edl/signatures?edl_id=${encodeURIComponent(edlId as string)}`, { cache: "no-store" })
      const sigJson = await sigRes.json().catch(() => ({}))
      if (sigJson?.ok && Array.isArray(sigJson.signatures)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setSignatures(sigJson.signatures.map((s: any) => ({ role: s.signataire_role, nom: s.signataire_nom, signe_at: s.signe_at })))
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  function ouvrirSignatureValidation() {
    // Passe par la modale de signature au lieu d'un simple clic.
    // L'API /api/edl/signer valide le rôle + met à jour statut="valide".
    setSignModalOpen(true)
  }
  async function onSignedEdl() {
    // V55.1b — Refetch signatures via /api/edl/signatures
    if (!edl) return
    try {
      const sigRes = await fetch(`/api/edl/signatures?edl_id=${encodeURIComponent(String(edl.id))}`, { cache: "no-store" })
      const sigJson = await sigRes.json().catch(() => ({}))
      if (sigJson?.ok && Array.isArray(sigJson.signatures)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setSignatures(sigJson.signatures.map((s: any) => ({ role: s.signataire_role, nom: s.signataire_nom, signe_at: s.signe_at })))
      }
    } catch { /* ignore */ }
    // Refetch EDL pour avoir le nouveau statut
    const res = await fetch(`/api/edl/${encodeURIComponent(edlId as string)}`, { cache: "no-store" })
    if (res.ok) {
      const { edl: data } = await res.json()
      setEdl(data)
    }
  }

  async function contesterEdl() {
    if (!edl || !session?.user?.email || !commentaire.trim()) return
    setContesting(true)
    try {
      // V24.1 — via /api/edl/save (server-side avec auth check locataire)
      const res = await fetch("/api/edl/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: edl.id,
          statut: "conteste",
          commentaire_locataire: commentaire.trim(),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) {
        alert(`Contestation échouée : ${json.error || res.statusText}`)
        return
      }
      const toEmail = (edl.proprietaire_email || "").toLowerCase().trim()
      if (toEmail) {
        await supabase.from("messages").insert([{
          from_email: session.user.email.toLowerCase(),
          to_email: toEmail,
          contenu: `⚠ État des lieux contesté par le locataire :\n"${commentaire.trim()}"`,
          lu: false,
          annonce_id: edl.annonce_id || null,
          created_at: new Date().toISOString(),
        }])
        void postNotif({
          userEmail: toEmail,
          type: "edl_envoye",
          title: "EDL contesté",
          body: `Le locataire a contesté l'état des lieux. Motif : "${commentaire.trim().slice(0, 80)}"`,
          href: `/edl/consulter/${edl.id}`,
          relatedId: String(edl.annonce_id || edl.id),
        })
        // V53.10 — email proprio "EDL contesté" (fire-and-forget)
        void fetch("/api/notifications/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "edl_conteste",
            to: toEmail,
            bienTitre: edl.bien_titre || edl.titre || "Logement",
            ville: edl.ville || null,
            edlType: edl.type === "sortie" ? "sortie" : "entree",
            motif: commentaire.trim(),
            consultUrl: `/edl/consulter/${edl.id}`,
          }),
        })
      }
      setEdl({ ...edl, statut: "conteste", commentaire_locataire: commentaire.trim() })
      setShowContest(false)
    } catch (err) {
      alert(`Erreur : ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setContesting(false)
    }
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'DM Sans', sans-serif", color: "#8a8477" }}>
      Chargement...
    </div>
  )

  if (error) return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "white", borderRadius: 20, padding: "40px 48px", textAlign: "center", maxWidth: 420, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{error}</h2>
        <Link href="/" style={{ fontSize: 13, color: "#1d4ed8", textDecoration: "none", fontWeight: 600 }}>
          Retour à l'accueil
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
  const lbl: any = { fontSize: 12, fontWeight: 700, color: "#8a8477", display: "block", marginBottom: 4 }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: isMobile ? "24px 16px" : "40px 48px" }}>

        {/* ─── Header ─── */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
            État des lieux
          </p>
          <h1 style={{ fontSize: isMobile ? 22 : 30, fontWeight: 800, letterSpacing: "-0.5px", margin: "0 0 6px" }}>
            État des lieux d'{typeLabel}
          </h1>
          <p style={{ color: "#8a8477", fontSize: 14, margin: 0 }}>
            {bien?.titre || "Bien"} — {bien?.ville || ""} — {dateLabel}
          </p>
        </div>

        {/* ─── Status banner ─── */}
        {statut === "brouillon" && (
          <div style={{ background: "#F7F4EF", border: "1px solid #EAE6DF", borderRadius: 14, padding: "14px 20px", marginBottom: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#8a8477", margin: 0 }}>Ce document est en cours de préparation par le propriétaire</p>
          </div>
        )}

        {statut === "envoye" && (
          <div style={{ background: "#EEF3FB", border: "1px solid #D7E3F4", borderRadius: 14, padding: "14px 20px", marginBottom: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#1d4ed8", margin: 0 }}>Veuillez vérifier les informations puis valider ou contester cet état des lieux</p>
          </div>
        )}

        {statut === "valide" && (
          <div style={{ background: "#F0FAEE", border: "1px solid #C6E9C0", borderRadius: 14, padding: "14px 20px", marginBottom: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#15803d", margin: 0 }}>
              État des lieux validé {edl.date_validation ? `le ${new Date(edl.date_validation).toLocaleDateString("fr-FR")}` : ""}
            </p>
          </div>
        )}

        {statut === "conteste" && (
          <div style={{ background: "#FBF6EA", border: "1px solid #EADFC6", borderRadius: 14, padding: "14px 20px", marginBottom: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#a16207", margin: edl.commentaire_locataire ? "0 0 8px" : 0 }}>État des lieux contesté — en attente de révision par le propriétaire</p>
            {edl.commentaire_locataire && (
              <p style={{ fontSize: 13, color: "#a16207", margin: "4px 0 0", fontStyle: "italic" }}>
                "{edl.commentaire_locataire}"
              </p>
            )}
          </div>
        )}

        {/* ─── General info ─── */}
        <div style={cardS}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Informations générales</h2>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
            <div><span style={lbl}>Type</span><p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{edl.type === "entree" ? "Entree" : "Sortie"}</p></div>
            <div><span style={lbl}>Date</span><p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{dateLabel}</p></div>
            <div><span style={lbl}>Clés remises</span><p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{edl.cles || "—"}</p></div>
          </div>
        </div>

        {/* ─── Bailleur ─── */}
        <div style={cardS}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Le bailleur</h2>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
            <div><span style={lbl}>Prénom</span><p style={{ fontSize: 14, margin: 0 }}>{edl.prenom_bailleur || "—"}</p></div>
            <div><span style={lbl}>Nom</span><p style={{ fontSize: 14, margin: 0 }}>{edl.nom_bailleur || "—"}</p></div>
            <div><span style={lbl}>Email</span><p style={{ fontSize: 14, margin: 0 }}>{edl.email_bailleur || "—"}</p></div>
          </div>
        </div>

        {/* ─── Locataire ─── */}
        <div style={cardS}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Le locataire</h2>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
            <div><span style={lbl}>Prénom</span><p style={{ fontSize: 14, margin: 0 }}>{edl.prenom_locataire || "—"}</p></div>
            <div><span style={lbl}>Nom</span><p style={{ fontSize: 14, margin: 0 }}>{edl.nom_locataire || "—"}</p></div>
            <div><span style={lbl}>Email</span><p style={{ fontSize: 14, margin: 0 }}>{edl.email_locataire || edl.locataire_email || "—"}</p></div>
          </div>
        </div>

        {/* ─── Compteurs ─── */}
        <div style={cardS}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Relevés de compteurs</h2>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
            <div><span style={lbl}>Eau (m³)</span><p style={{ fontSize: 14, margin: 0 }}>{compteurs.eau || "Non relevé"}</p></div>
            <div><span style={lbl}>Électricité (kWh)</span><p style={{ fontSize: 14, margin: 0 }}>{compteurs.elec || "Non relevé"}</p></div>
            <div><span style={lbl}>Gaz (m³)</span><p style={{ fontSize: 14, margin: 0 }}>{compteurs.gaz || "Non relevé"}</p></div>
          </div>
        </div>

        {/* ─── Pieces ─── */}
        {pieces.map((piece, pieceIdx) => (
          <div key={pieceIdx} style={cardS}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{piece.nom}</h2>
              <span style={{ fontSize: 11, color: "#8a8477", fontWeight: 600 }}>{Object.keys(piece.elements).length} elements</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {Object.entries(piece.elements).map(([elem, val]) => (
                <div key={elem} style={{
                  padding: "10px 0", borderBottom: "1px solid #F7F4EF",
                  display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#111", flex: 1, minWidth: 120 }}>{elem}</span>
                  <EtatBadge etat={val.etat} />
                  {val.observation && (
                    <span style={{ fontSize: 12, color: "#8a8477", fontStyle: "italic", flexBasis: isMobile ? "100%" : "auto" }}>
                      {val.observation}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Photos */}
            {piece.photos && piece.photos.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #F7F4EF" }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#8a8477", marginBottom: 8 }}>Photos ({piece.photos.length})</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {piece.photos.map((url: string, photoIdx: number) => (
                    <a key={photoIdx} href={url} target="_blank" rel="noopener noreferrer"
                      style={{ position: "relative", width: 80, height: 80, borderRadius: 10, overflow: "hidden", border: "1px solid #EAE6DF", display: "block", flexShrink: 0 }}>
                      <Image src={url} alt="" fill sizes="80px" style={{ objectFit: "cover" }} />
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
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Observations générales</h2>
            <p style={{ fontSize: 14, color: "#111", lineHeight: 1.6, margin: 0 }}>{edl.observations}</p>
          </div>
        )}

        {/* ─── Actions ─── */}
        {/* Vue proprio : EDL envoyé, on attend le locataire */}
        {statut === "envoye" && (session?.user?.email || "").toLowerCase() === (edl.proprietaire_email || "").toLowerCase() && (
          <div style={{ ...cardS, background: "#EEF3FB", border: "1px solid #D7E3F4" }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#1d4ed8", margin: 0 }}>
              En attente de la décision du locataire
            </p>
            <p style={{ fontSize: 12, color: "#1d4ed8", margin: "6px 0 0", lineHeight: 1.6 }}>
              Le locataire a reçu l&apos;état des lieux et peut le valider ou le contester depuis sa messagerie.
              Vous serez notifié dès sa réponse.
            </p>
          </div>
        )}

        {/* Bloc "Valider / Contester" — uniquement le locataire peut décider.
            Le proprio visualise l'EDL qu'il a envoyé, il n'est pas juge et partie. */}
        {statut === "envoye" && (session?.user?.email || "").toLowerCase() === (edl.locataire_email || "").toLowerCase() && (
          <div style={cardS}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Votre décision</h2>

            {!showContest ? (
              <div style={{ display: "flex", gap: 12, flexDirection: isMobile ? "column" : "row" }}>
                <button onClick={ouvrirSignatureValidation}
                  style={{
                    flex: 1, padding: "16px 32px",
                    background: "#15803d", color: "white",
                    border: "none", borderRadius: 16, fontWeight: 800, fontSize: 16,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>
                  ✍ Signer et valider l&apos;état des lieux
                </button>
                <button onClick={() => setShowContest(true)}
                  style={{
                    flex: 1, padding: "16px 32px",
                    background: "white", color: "#a16207",
                    border: "1px solid #EADFC6", borderRadius: 16, fontWeight: 800, fontSize: 16,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>
                  Contester
                </button>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#a16207", marginBottom: 10 }}>Décrivez les points que vous contestez :</p>
                <textarea
                  value={commentaire}
                  onChange={e => setCommentaire(e.target.value)}
                  placeholder="Indiquez les éléments que vous souhaitez contester et pourquoi..."
                  rows={4}
                  style={{
                    width: "100%", padding: "12px 14px", border: "1px solid #EADFC6", borderRadius: 12,
                    fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const,
                    resize: "vertical", marginBottom: 12,
                  }}
                />
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={contesterEdl} disabled={contesting || !commentaire.trim()}
                    style={{
                      padding: "12px 24px",
                      background: contesting || !commentaire.trim() ? "#EAE6DF" : "#a16207",
                      color: contesting || !commentaire.trim() ? "#8a8477" : "white",
                      border: "none", borderRadius: 999, fontWeight: 700, fontSize: 14,
                      cursor: contesting || !commentaire.trim() ? "not-allowed" : "pointer",
                      fontFamily: "inherit",
                    }}>
                    {contesting ? "Envoi..." : "Envoyer la contestation"}
                  </button>
                  <button onClick={() => { setShowContest(false); setCommentaire("") }}
                    style={{
                      padding: "12px 24px", background: "none", border: "1px solid #EAE6DF",
                      borderRadius: 999, fontWeight: 600, fontSize: 14, cursor: "pointer",
                      fontFamily: "inherit", color: "#8a8477",
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
            <button onClick={async () => {
              // V55.1b — Fetch images signatures via /api/edl/signatures (RLS Phase 5)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              let sigsFull: any[] = []
              try {
                const res = await fetch(`/api/edl/signatures?edl_id=${encodeURIComponent(String(edl.id))}&include_png=true`, { cache: "no-store" })
                const json = await res.json().catch(() => ({}))
                if (json?.ok && Array.isArray(json.signatures)) sigsFull = json.signatures
              } catch { /* ignore — PDF rendu sans signatures plutôt que crash */ }
              const edlWithSigs = {
                ...edl,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                __edl_signatures: sigsFull.map((s: any) => ({
                  role: s.signataire_role,
                  nom: s.signataire_nom,
                  png: s.signature_png,
                  signeAt: s.signe_at,
                  mention: s.mention,
                  ipAddress: s.ip_address,
                })),
              }
              await genererEdlPDF(edlWithSigs, bien)
            }}
              style={{
                flex: "1 1 200px", padding: "14px 24px",
                background: "#111", color: "white",
                border: "1px solid #111", borderRadius: 16, fontWeight: 800, fontSize: 14,
                cursor: "pointer", fontFamily: "inherit",
              }}>
              Télécharger le PDF
            </button>
            <button onClick={() => telechargerPhotosZip(edl)}
              style={{
                flex: "1 1 200px", padding: "14px 24px",
                background: "white", color: "#111",
                border: "1px solid #111", borderRadius: 16, fontWeight: 700, fontSize: 14,
                cursor: "pointer", fontFamily: "inherit",
              }}>
              Télécharger les photos (.zip)
            </button>
          </div>
        )}

        {/* Statut signatures */}
        {signatures.length > 0 && (
          <div style={{ ...cardS, background: "#F0FAEE", border: "1px solid #86efac" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 10px" }}>
              Signatures électroniques
            </p>
            {signatures.map(s => (
              <p key={`${s.role}-${s.signe_at}`} style={{ fontSize: 13, color: "#15803d", margin: "4px 0", fontWeight: 600 }}>
                ✓ {s.role === "locataire" ? "Locataire" : "Bailleur"} — {s.nom} — {new Date(s.signe_at).toLocaleDateString("fr-FR")}
              </p>
            ))}
          </div>
        )}

        {/* Contresignature proprio (après signature locataire) */}
        {statut === "valide"
          && (session?.user?.email || "").toLowerCase() === (edl.proprietaire_email || "").toLowerCase()
          && !signatures.find(s => s.role === "bailleur")
          && signatures.find(s => s.role === "locataire")
          && (
          <div style={{ ...cardS, background: "#FBF6EA", border: "1px solid #EADFC6" }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#9a3412", margin: "0 0 10px" }}>
              Le locataire a signé cet EDL
            </p>
            <p style={{ fontSize: 12, color: "#9a3412", margin: "0 0 14px", lineHeight: 1.6 }}>
              Vous pouvez contresigner pour officialiser la validation bilatérale.
            </p>
            <button onClick={() => setSignModalOpen(true)}
              style={{ background: "#9a3412", color: "white", border: "none", borderRadius: 999, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              ✍ Contresigner l&apos;EDL
            </button>
          </div>
        )}

        <p style={{ fontSize: 12, color: "#8a8477", textAlign: "center", marginTop: 20, lineHeight: 1.6 }}>
          Document contradictoire — généré par {BRAND.name}.
        </p>
      </div>

      {signModalOpen && edl && (
        <EdlSignatureModal
          open={signModalOpen}
          onClose={() => setSignModalOpen(false)}
          onSigned={() => { setSignModalOpen(false); void onSignedEdl() }}
          edlId={edl.id}
          role={(session?.user?.email || "").toLowerCase() === (edl.proprietaire_email || "").toLowerCase() ? "bailleur" : "locataire"}
          typeEdl={edl.type === "sortie" ? "sortie" : "entree"}
          dateEdl={edl.date_edl || ""}
          bienTitre={bien?.titre || ""}
          nomDefaut={session?.user?.name || ""}
        />
      )}
    </main>
  )
}
