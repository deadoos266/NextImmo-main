"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../../../lib/supabase"
import { validateImage } from "../../../../lib/fileValidation"
import { useResponsive } from "../../../hooks/useResponsive"
import { BRAND } from "../../../../lib/brand"
import { drawLogoPDF } from "../../../../lib/brandPDF"
import { postNotif } from "../../../../lib/notificationsClient"
// jsPDF lazy-loaded pour alleger le bundle initial (voir genererEdlPDF)

// ─── Types & Config ─────────────────────────────────────────────────────────

const ETATS = ["Neuf", "Tres bon", "Bon", "Usage", "Mauvais", "Degrade"] as const
type Etat = typeof ETATS[number]

const ETAT_STYLE: Record<Etat, { bg: string; color: string; icon: string }> = {
  "Neuf":    { bg: "#F0FAEE", color: "#15803d", icon: "★" },
  "Tres bon":{ bg: "#F0FAEE", color: "#15803d", icon: "●" },
  "Bon":     { bg: "#EEF3FB", color: "#1d4ed8", icon: "●" },
  "Usage":   { bg: "#FBF6EA", color: "#a16207", icon: "●" },
  "Mauvais": { bg: "#FEECEC", color: "#b91c1c", icon: "●" },
  "Degrade": { bg: "#FEECEC", color: "#b91c1c", icon: "✗" },
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

async function genererEdlPDF(data: {
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
  const { default: jsPDF } = await import("jspdf")
  const doc = new jsPDF()
  const W = 170
  let y = 20

  function check() { if (y > 260) { doc.addPage(); y = 20 } }
  function title(t: string) { doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.text(t, 105, y, { align: "center" }); y += 8 }
  function section(t: string) { check(); doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.text(t, 20, y); y += 7 }
  function text(t: string) { check(); doc.setFontSize(9); doc.setFont("helvetica", "normal"); const l = doc.splitTextToSize(t, W); doc.text(l, 20, y); y += l.length * 4.5 }
  function field(l: string, v: string, required?: boolean) {
    check(); doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text(`${l} :`, 20, y)
    if (v) { doc.setFont("helvetica", "normal"); doc.text(v, 75, y) }
    else if (required) { doc.setDrawColor(180, 180, 180); doc.setLineDashPattern([1, 1], 0); doc.line(75, y, 180, y); doc.setLineDashPattern([], 0) }
    y += 5.5
  }
  function line() { doc.setDrawColor(200, 200, 200); doc.line(20, y, 190, y); y += 6 }

  const dateLabel = new Date(data.dateEdl).toLocaleDateString("fr-FR")
  const typeLabel = data.type === "entree" ? "ENTREE" : "SORTIE"

  drawLogoPDF(doc, { x: 20, y: 18, size: "medium" })
  y = 30
  title(`ETAT DES LIEUX D'${typeLabel}`)
  doc.setFontSize(9); doc.setFont("helvetica", "normal")
  doc.text(`Etabli contradictoirement le ${dateLabel}`, 105, y, { align: "center" }); y += 10
  line()

  section("PARTIES")
  y += 2
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text("LE BAILLEUR", 20, y); y += 5
  field("Nom", data.nomBailleur, true)
  field("Prenom", data.prenomBailleur, true)
  field("Email", data.emailBailleur, true)
  y += 4
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.text("LE LOCATAIRE", 20, y); y += 5
  field("Nom", data.nomLocataire, true)
  field("Prenom", data.prenomLocataire, true)
  field("Email", data.emailLocataire, true)
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
    text(`Annexe photographique : ${data.photoCount} photo(s) stockee(s) en ligne sur ${BRAND.name}.`)
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
  doc.text(`Document genere par ${BRAND.name} — ${BRAND.url.replace(/^https?:\/\//, "")}`, 105, 285, { align: "center" })

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
  const [locataireVerifie, setLocataireVerifie] = useState<boolean | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth")
    if (session && bienId) loadBien()
  }, [session, status, bienId])

  async function loadBien() {
    const [{ data }, { data: edl }] = await Promise.all([
      supabase.from("annonces").select("*").eq("id", bienId).single(),
      supabase.from("etats_des_lieux").select("*").eq("annonce_id", bienId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
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
      // V50.14 — vérifier l'inscription via `profils` (créé pour TOUS les
      // users, OAuth ET credentials), pas `users` (seulement credentials).
      // Avant, un locataire Google OAuth voyait : "Envoi impossible — pas
      // encore inscrit". Cas reproduit user : keymatchimmo@gmail.com.
      if (data.locataire_email) {
        const { count } = await supabase.from("profils").select("email", { count: "exact", head: true }).eq("email", data.locataire_email.toLowerCase())
        setLocataireVerifie((count ?? 0) > 0)
      }
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
    // V50.13 — limite 5 → 10 photos par pièce (user : "ajuste la limites de
    // bail a 10 photos au lieu de 5"). Storage Supabase + PDF supportent
    // sans modif (pas de hard cap technique).
    const maxToAdd = 10 - currentCount
    if (maxToAdd <= 0) { alert("Maximum 10 photos par piece"); return }
    const filesToUpload = Array.from(files).slice(0, maxToAdd)
    setUploadingPiece(pieceIdx)
    const rejected: string[] = []
    for (const file of filesToUpload) {
      const check = await validateImage(file)
      if (!check.ok) {
        rejected.push(`${file.name} : ${check.error}`)
        continue
      }
      // Passe par l'API serveur : strip EXIF/GPS + resize + re-encode JPEG.
      const fd = new FormData()
      fd.append("file", file)
      fd.append("bienId", String(bienId))
      let url: string | null = null
      try {
        const res = await fetch("/api/edl/photo", { method: "POST", body: fd })
        const json = await res.json()
        if (res.ok && json.ok && json.url) url = json.url
        else rejected.push(`${file.name} : ${json.error || "upload échoué"}`)
      } catch {
        rejected.push(`${file.name} : upload échoué`)
      }
      if (!url) continue
      setPieces(prev => prev.map((p, i) =>
        i === pieceIdx ? { ...p, photos: [...p.photos, url!] } : p
      ))
    }
    setUploadingPiece(null)
    if (rejected.length > 0) alert(`Fichiers refusés :\n${rejected.join("\n")}`)
  }

  function removePhoto(pieceIdx: number, photoIdx: number) {
    setPieces(prev => prev.map((p, i) =>
      i === pieceIdx ? { ...p, photos: p.photos.filter((_, j) => j !== photoIdx) } : p
    ))
  }

  async function sauvegarderEdl(statutOverride?: string) {
    if (!bien || !session?.user?.email) return null
    setSaving(true)
    const payload: any = {
      annonce_id: Number(bienId),
      proprietaire_email: (bien?.proprietaire_email || session.user.email || "").toLowerCase(),
      type,
      date_edl: dateEdl,
      prenom_bailleur: prenomBailleur,
      nom_bailleur: nomBailleur,
      email_bailleur: emailBailleur,
      prenom_locataire: prenomLocataire,
      nom_locataire: nomLocataire,
      email_locataire: emailLocataire.trim().toLowerCase(),
      locataire_email: emailLocataire.trim().toLowerCase(),
      compteurs,
      cles,
      observations,
      pieces_data: pieces,
      statut: statutOverride || edlExistant?.statut || "brouillon",
    }
    // V24.1 (Paul 2026-04-29) — migration vers /api/edl/save (server-side
    // supabaseAdmin) pour permettre REVOKE INSERT/UPDATE anon (migration 034).
    let saved: any = null
    try {
      const res = await fetch("/api/edl/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edlExistant ? { id: edlExistant.id, ...payload } : payload),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.ok && json.edl) {
        setEdlExistant(json.edl); saved = json.edl
      } else {
        console.error("[edl/save]", json.error || res.statusText)
      }
    } catch (e) {
      console.error("[edl/save] exception", e)
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    return saved
  }

  async function envoyerAuLocataire() {
    if (!bien || !session?.user?.email || !emailLocataire.trim()) return
    setSending(true)
    try {
      // Save with statut "envoye" et récupère la row directement (React state
      // async — on ne peut pas relire edlExistant tout de suite après setEdlExistant).
      const saved = await sauvegarderEdl("envoye")
      const edlId = saved?.id || edlExistant?.id
      if (!edlId) {
        alert("L'EDL n'a pas pu être enregistré. Vérifiez que tous les champs obligatoires sont remplis.")
        setSending(false)
        return
      }
      const cardPayload = JSON.stringify({ edlId, bienTitre: bien.titre, type, dateEdl })
      const fromEmail = (bien.proprietaire_email || session.user.email || "").toLowerCase()
      const toEmail = emailLocataire.trim().toLowerCase()
      const { error: msgErr } = await supabase.from("messages").insert([{
        from_email: fromEmail,
        to_email: toEmail,
        contenu: "[EDL_CARD]" + cardPayload,
        lu: false,
        annonce_id: Number(bienId),
        created_at: new Date().toISOString(),
      }])
      if (msgErr) {
        alert(`Erreur envoi message : ${msgErr.message}`)
        setSending(false)
        return
      }
      // Notif cloche pour le locataire
      const typeLabel = type === "entree" ? "d'entrée" : "de sortie"
      void postNotif({
        userEmail: toEmail,
        type: "edl_envoye",
        title: `État des lieux ${typeLabel} à valider`,
        body: `Votre propriétaire a partagé l'EDL ${typeLabel} pour « ${bien.titre} ». Consultez-le et validez-le.`,
        href: `/edl/consulter/${edlId}`,
        relatedId: String(bienId),
      })
      // V53.2 — email locataire pour signer l'EDL (fire-and-forget)
      void fetch("/api/notifications/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "edl_a_signer",
          to: toEmail,
          bienTitre: bien.titre || "Logement",
          ville: bien.ville || null,
          edlType: type,
          consultUrl: `/edl/consulter/${edlId}`,
        }),
      })
      setSent(true)
      setTimeout(() => setSent(false), 4000)
    } catch (err) {
      console.error("[envoyerAuLocataire] error:", err)
      alert(`Erreur inattendue : ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSending(false)
    }
  }

  async function remettreEnBrouillon() {
    if (!edlExistant) return
    // V24.1 — via /api/edl/save (server-side)
    try {
      await fetch("/api/edl/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: edlExistant.id, statut: "brouillon" }),
      })
    } catch { /* noop */ }
    setEdlExistant({ ...edlExistant, statut: "brouillon" })
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

  async function telechargerPhotosZip() {
    const allPhotos: { url: string; piece: string; idx: number }[] = []
    pieces.forEach(p => {
      p.photos.forEach((url, idx) => {
        if (url) allPhotos.push({ url, piece: p.nom || "piece", idx: idx + 1 })
      })
    })
    if (allPhotos.length === 0) { alert("Aucune photo a telecharger."); return }

    const { default: JSZip } = await import("jszip")
    const zip = new JSZip()
    const results = await Promise.allSettled(
      allPhotos.map(async ({ url, piece, idx }) => {
        const res = await fetch(url)
        if (!res.ok) throw new Error(String(res.status))
        const blob = await res.blob()
        const ext = (url.split(".").pop() || "jpg").split("?")[0].slice(0, 4)
        const safe = piece.replace(/[^a-zA-Z0-9\-_]/g, "_").slice(0, 40)
        zip.file(`${safe}/photo-${String(idx).padStart(2, "0")}.${ext}`, blob)
      })
    )
    const failed = results.filter(r => r.status === "rejected").length
    if (failed === allPhotos.length) { alert("Impossible de telecharger les photos."); return }

    const zipBlob = await zip.generateAsync({ type: "blob" })
    const typeLabel = type === "entree" ? "entree" : "sortie"
    const dateLabel = dateEdl ? new Date(dateEdl).toISOString().split("T")[0] : "edl"
    const link = document.createElement("a")
    const href = URL.createObjectURL(zipBlob)
    link.href = href
    link.download = `edl-${typeLabel}-${dateLabel}-photos.zip`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(href)

    if (failed > 0) alert(`${failed} photo(s) n'ont pas pu etre telechargees.`)
  }

  // Score de completion
  const totalElements = pieces.reduce((s, p) => s + Object.keys(p.elements).length, 0)
  const elementsRemplis = pieces.reduce((s, p) => s + Object.values(p.elements).filter(e => e.etat !== "Bon").length, 0)
  const totalPhotos = pieces.reduce((s, p) => s + p.photos.length, 0)

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#8a8477" }}>Chargement...</div>
  )
  if (!bien) return null

  const statut = edlExistant?.statut || "brouillon"
  const isReadOnly = statut === "envoye" || statut === "valide"
  const isLocked = statut === "valide"

  const inp: any = { width: "100%", padding: "10px 14px", border: "1px solid #EAE6DF", borderRadius: 10, fontSize: 16, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }
  const cardS: any = { background: "white", borderRadius: 20, padding: isMobile ? 18 : 28, marginBottom: 20 }
  const lbl: any = { fontSize: 12, fontWeight: 700, color: "#8a8477", display: "block", marginBottom: 6 }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: isMobile ? "24px 16px" : "40px 48px" }}>

        <button
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) router.back()
            else router.push("/proprietaire")
          }}
          style={{ fontSize: 13, color: "#8a8477", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
          ← Retour
        </button>

        <div style={{ marginTop: 16, marginBottom: 28 }}>
          <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, letterSpacing: "-0.5px" }}>État des lieux</h1>
          <p style={{ color: "#8a8477", marginTop: 4, fontSize: 14 }}>{bien.titre} — {bien.ville} — {bien.surface} m²</p>
        </div>

        {/* ─── Status banners ─── */}
        {statut === "conteste" && (
          <div style={{ background: "#FBF6EA", border: "1px solid #EADFC6", borderRadius: 14, padding: "14px 20px", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: edlExistant?.commentaire_locataire ? 10 : 0 }}>
              <span style={{ fontSize: 18 }}>⚠</span>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#a16207", margin: 0 }}>Le locataire a contesté cet état des lieux</p>
            </div>
            {edlExistant?.commentaire_locataire && (
              <div style={{ background: "white", borderRadius: 10, padding: "10px 14px", border: "1px solid #EADFC6" }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "#8a8477", margin: "0 0 4px" }}>Commentaire du locataire :</p>
                <p style={{ fontSize: 13, color: "#111", margin: 0, lineHeight: 1.5 }}>{edlExistant.commentaire_locataire}</p>
              </div>
            )}
          </div>
        )}

        {statut === "envoye" && (
          <div style={{ background: "#F0FAEE", border: "1px solid #C6E9C0", borderRadius: 14, padding: "14px 20px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>📩</span>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#15803d", margin: 0 }}>État des lieux envoyé au locataire — en attente de validation</p>
            </div>
            <button onClick={remettreEnBrouillon}
              style={{ background: "none", border: "none", color: "#8a8477", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>
              Remettre en brouillon
            </button>
          </div>
        )}

        {statut === "valide" && (
          <div style={{ background: "#F0FAEE", border: "1px solid #C6E9C0", borderRadius: 14, padding: "14px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>✓</span>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#15803d", margin: 0 }}>
              État des lieux valide le {edlExistant?.date_validation ? new Date(edlExistant.date_validation).toLocaleDateString("fr-FR") : "—"}
            </p>
          </div>
        )}

        {/* Recap barre */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            { label: "Pieces", val: pieces.length, bg: "#EEF3FB", color: "#1d4ed8" },
            { label: "Elements", val: totalElements, bg: "#F7F4EF", color: "#111" },
            { label: "Modifies", val: elementsRemplis, bg: elementsRemplis > 0 ? "#FBF6EA" : "#F7F4EF", color: elementsRemplis > 0 ? "#a16207" : "#8a8477" },
            { label: "Photos", val: totalPhotos, bg: totalPhotos > 0 ? "#F0FAEE" : "#F7F4EF", color: totalPhotos > 0 ? "#15803d" : "#8a8477" },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: "10px 16px", flex: 1, minWidth: 70, textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.val}</div>
              <div style={{ fontSize: 11, color: "#8a8477", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ─── READ-ONLY display for envoye / valide ─── */}
        {isReadOnly ? (
          <>
            {/* Type + date */}
            <div style={cardS}>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Informations generales</h2>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
                <div><span style={lbl}>Type</span><p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{type === "entree" ? "Entree" : "Sortie"}</p></div>
                <div><span style={lbl}>Date</span><p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{new Date(dateEdl).toLocaleDateString("fr-FR")}</p></div>
                <div><span style={lbl}>Cles</span><p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{cles || "—"}</p></div>
              </div>
            </div>
            {/* Bailleur */}
            <div style={cardS}>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Le bailleur</h2>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
                <div><span style={lbl}>Prenom</span><p style={{ fontSize: 14, margin: 0 }}>{prenomBailleur || "—"}</p></div>
                <div><span style={lbl}>Nom</span><p style={{ fontSize: 14, margin: 0 }}>{nomBailleur || "—"}</p></div>
                <div><span style={lbl}>Email</span><p style={{ fontSize: 14, margin: 0 }}>{emailBailleur || "—"}</p></div>
              </div>
            </div>
            {/* Locataire */}
            <div style={cardS}>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Le locataire</h2>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
                <div><span style={lbl}>Prenom</span><p style={{ fontSize: 14, margin: 0 }}>{prenomLocataire || "—"}</p></div>
                <div><span style={lbl}>Nom</span><p style={{ fontSize: 14, margin: 0 }}>{nomLocataire || "—"}</p></div>
                <div><span style={lbl}>Email</span><p style={{ fontSize: 14, margin: 0 }}>{emailLocataire || "—"}</p></div>
              </div>
            </div>
            {/* Compteurs */}
            <div style={cardS}>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Releves de compteurs</h2>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
                <div><span style={lbl}>Eau (m3)</span><p style={{ fontSize: 14, margin: 0 }}>{compteurs.eau || "Non releve"}</p></div>
                <div><span style={lbl}>Electricite (kWh)</span><p style={{ fontSize: 14, margin: 0 }}>{compteurs.elec || "Non releve"}</p></div>
                <div><span style={lbl}>Gaz (m3)</span><p style={{ fontSize: 14, margin: 0 }}>{compteurs.gaz || "Non releve"}</p></div>
              </div>
            </div>
            {/* Pieces read-only */}
            {pieces.map((piece, pieceIdx) => (
              <div key={pieceIdx} style={cardS}>
                <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{piece.nom}</h2>
                <p style={{ fontSize: 12, color: "#8a8477", marginBottom: 14 }}>{Object.keys(piece.elements).length} elements</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {Object.entries(piece.elements).map(([elem, val]) => {
                    const st = ETAT_STYLE[val.etat]
                    return (
                      <div key={elem} style={{ padding: "8px 0", borderBottom: "1px solid #F7F4EF", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#111", flex: 1, minWidth: 120 }}>{elem}</span>
                        <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.color}`, fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999 }}>
                          {val.etat}
                        </span>
                        {val.observation && (
                          <span style={{ fontSize: 12, color: "#8a8477", fontStyle: "italic" }}>{val.observation}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
                {piece.photos.length > 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                    {piece.photos.map((url, photoIdx) => (
                      <div key={photoIdx} style={{ width: 72, height: 72, borderRadius: 10, overflow: "hidden", border: "1px solid #EAE6DF" }}>
                        <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {/* Observations */}
            {observations && (
              <div style={cardS}>
                <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Observations generales</h2>
                <p style={{ fontSize: 14, color: "#111", lineHeight: 1.6, margin: 0 }}>{observations}</p>
              </div>
            )}
            {/* Actions read-only */}
            <div style={{ display: "flex", gap: 12, flexDirection: isMobile ? "column" : "row", flexWrap: "wrap" }}>
              <button onClick={generer}
                style={{
                  flex: "1 1 200px", padding: "16px 24px",
                  background: "#111", color: "white",
                  border: "1px solid #111", borderRadius: 16, fontWeight: 800, fontSize: 15,
                  cursor: "pointer", fontFamily: "inherit",
                }}>
                Telecharger le PDF
              </button>
              <button onClick={telechargerPhotosZip}
                style={{
                  flex: "1 1 200px", padding: "16px 24px",
                  background: "white", color: "#111",
                  border: "1px solid #111", borderRadius: 16, fontWeight: 700, fontSize: 15,
                  cursor: "pointer", fontFamily: "inherit",
                }}>
                Telecharger les photos (.zip)
              </button>
            </div>
          </>
        ) : (
          <>
            {/* ─── EDITABLE MODE (brouillon / conteste) ─── */}
            {/* V50.12 — Toggle Entrée/Sortie masqué quand contexte = post-bail
                récent (pas de préavis donné, pas d'EDL précédent). User :
                "ca propose de creer l'etat des lieux de sortie ou d'entrée
                je trouve ca un peu con alors que le bail vient d'etre signé".
                Logique :
                - Pas d'EDL existant ET pas de préavis → forcément Entrée
                  (le bail vient d'être signé, c'est l'EDL d'entrée).
                - Sinon → toggle visible (cas EDL contesté ou préavis donné). */}
            {(() => {
              const aPreavis = !!(bien?.preavis_donne_par || bien?.preavis_date_envoi)
              const isFirstEdlPostBail = !edlExistant && !aPreavis
              if (isFirstEdlPostBail) {
                return (
                  <div style={cardS}>
                    <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>État des lieux d'entrée</h2>
                    <p style={{ fontSize: 12, color: "#8a8477", margin: "0 0 16px" }}>
                      Le bail a été signé — voici l'EDL d'entrée. (L'EDL de sortie sera
                      proposé en fin de bail, après préavis.)
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                      <div><label style={lbl}>Date de l'etat des lieux</label><input style={inp} type="date" value={dateEdl} onChange={e => setDateEdl(e.target.value)} /></div>
                      <div><label style={lbl}>Cles remises</label><input style={inp} value={cles} onChange={e => setCles(e.target.value)} /></div>
                    </div>
                  </div>
                )
              }
              return (
            <div style={cardS}>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Type d'etat des lieux</h2>
              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                {(["entree", "sortie"] as const).map(t => (
                  <button key={t} onClick={() => setType(t)}
                    style={{
                      flex: 1, padding: "14px 20px", borderRadius: 14, cursor: "pointer", fontFamily: "inherit", textAlign: "center",
                      background: type === t ? "#111" : "white", color: type === t ? "white" : "#111",
                      border: type === t ? "1px solid #111" : "1px solid #EAE6DF", fontWeight: 700, fontSize: 14,
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
              )
            })()}

            {/* Le Bailleur */}
            <div style={cardS}>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Le bailleur</h2>
              <p style={{ fontSize: 12, color: "#8a8477", marginBottom: 16 }}>Pre-rempli depuis votre profil — modifiable</p>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
                <div><label style={lbl}>Prenom</label><input style={inp} value={prenomBailleur} onChange={e => setPrenomBailleur(e.target.value)} placeholder="Prenom" /></div>
                <div><label style={lbl}>Nom</label><input style={inp} value={nomBailleur} onChange={e => setNomBailleur(e.target.value)} placeholder="Nom de famille" /></div>
                <div><label style={lbl}>Email</label><input style={inp} value={emailBailleur} onChange={e => setEmailBailleur(e.target.value)} placeholder="email@exemple.fr" type="email" /></div>
              </div>
            </div>

            {/* Le Locataire */}
            <div style={cardS}>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Le locataire</h2>
              {bien.locataire_email ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  {locataireVerifie === true && (
                    <span style={{ background: "#F0FAEE", color: "#15803d", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999 }}>✓ Compte verifie : {bien.locataire_email}</span>
                  )}
                  {locataireVerifie === false && (
                    <span style={{ background: "#FBF6EA", color: "#a16207", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999 }}>{bien.locataire_email} — pas encore inscrit (l'envoi via messagerie sera possible apres inscription)</span>
                  )}
                  {locataireVerifie === null && (
                    <span style={{ background: "#F7F4EF", color: "#8a8477", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999 }}>Verification en cours...</span>
                  )}
                </div>
              ) : (
                <div style={{ background: "#FBF6EA", border: "1px solid #EADFC6", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#9a3412", margin: 0 }}>Aucun locataire rattache a ce bien</p>
                  <p style={{ fontSize: 12, color: "#a16207", margin: "4px 0 0" }}>
                    Renseignez l'email du locataire dans les parametres du bien (bouton "Modifier les donnees") pour pouvoir envoyer l'EDL via la plateforme.
                  </p>
                </div>
              )}
              <p style={{ fontSize: 12, color: "#8a8477", marginBottom: 16 }}>Completez nom et prenom pour le document officiel (ou laissez vide pour remplir a la main)</p>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
                <div><label style={lbl}>Prenom</label><input style={inp} value={prenomLocataire} onChange={e => setPrenomLocataire(e.target.value)} placeholder="Prenom" /></div>
                <div><label style={lbl}>Nom</label><input style={inp} value={nomLocataire} onChange={e => setNomLocataire(e.target.value)} placeholder="Nom de famille" /></div>
                <div>
                  <label style={lbl}>Email (compte plateforme)</label>
                  <input value={emailLocataire} disabled style={{ ...inp, background: "#F7F4EF", color: bien.locataire_email ? "#111" : "#8a8477" }} />
                </div>
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
                    <span style={{ fontSize: 11, color: "#8a8477" }}>{Object.keys(piece.elements).length} elements</span>
                    <button onClick={() => removePiece(pieceIdx)}
                      style={{ background: "none", border: "1px solid #F4C9C9", color: "#b91c1c", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                      Retirer
                    </button>
                  </div>
                </div>
                <p style={{ fontSize: 12, color: "#8a8477", marginBottom: 16 }}>Type : {piece.type}</p>

                {/* Elements */}
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {Object.entries(piece.elements).map(([elem, val]) => {
                    const st = ETAT_STYLE[val.etat]
                    return (
                      <div key={elem} style={{ padding: "10px 0", borderBottom: "1px solid #F7F4EF" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#111", flex: 1 }}>{elem}</span>
                          <button onClick={() => removeElement(pieceIdx, elem)}
                            style={{ background: "none", border: "none", color: "#EAE6DF", fontSize: 16, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}
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
                                  background: active ? s.bg : "#F7F4EF",
                                  color: active ? s.color : "#8a8477",
                                  border: active ? `1px solid ${s.color}` : "1px solid transparent",
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
                          style={{ width: "100%", padding: "6px 10px", border: "1px solid #F7F4EF", borderRadius: 8, fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const, marginTop: 4 }}
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
                    style={{ flex: 1, padding: "7px 10px", border: "1px solid #EAE6DF", borderRadius: 8, fontSize: 12, outline: "none", fontFamily: "inherit" }}
                  />
                  <button onClick={() => addElement(pieceIdx)}
                    style={{ background: "#F7F4EF", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", color: "#111" }}>
                    +
                  </button>
                </div>

                {/* Photos */}
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #F7F4EF" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#8a8477" }}>Photos ({piece.photos.length}/5)</span>
                    <input
                      ref={el => { photoRefs.current[pieceIdx] = el }}
                      type="file" accept="image/*" multiple
                      style={{ display: "none" }}
                      onChange={e => { if (e.target.files && e.target.files.length > 0) { uploadPhotos(pieceIdx, e.target.files); e.target.value = "" } }}
                    />
                    {/* V50.13 — limite 5 → 10 photos par pièce */}
                    {piece.photos.length < 10 && (
                      <button onClick={() => photoRefs.current[pieceIdx]?.click()}
                        disabled={uploadingPiece === pieceIdx}
                        style={{
                          background: "#EEF3FB", border: "1px solid #D7E3F4", color: "#1d4ed8",
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
                        <div key={photoIdx} style={{ position: "relative", width: 80, height: 80, borderRadius: 10, overflow: "hidden", border: "1px solid #EAE6DF" }}>
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
                    style={{ padding: "7px 14px", background: "#F7F4EF", border: "none", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#111" }}>
                    + {p}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={customPieceName} onChange={e => setCustomPieceName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && customPieceName.trim() && addPiece("Autre", customPieceName.trim())}
                  placeholder="Nom personnalise (ex: Dressing, Cellier...)"
                  style={{ flex: 1, padding: "9px 14px", border: "1px solid #EAE6DF", borderRadius: 10, fontSize: 13, outline: "none", fontFamily: "inherit" }} />
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
            <div style={{ display: "flex", gap: 12, flexDirection: isMobile ? "column" : "row", flexWrap: "wrap" }}>
              <button onClick={() => sauvegarderEdl()} disabled={saving}
                style={{
                  flex: 1, padding: "16px 32px",
                  background: saved ? "#15803d" : saving ? "#8a8477" : "#111", color: "white",
                  border: "none", borderRadius: 16, fontWeight: 800, fontSize: 16,
                  cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit",
                }}>
                {saving ? "Sauvegarde..." : saved ? "Sauvegarde !" : edlExistant ? "Mettre a jour l'EDL" : "Sauvegarder l'EDL"}
              </button>
              <button onClick={generer}
                style={{
                  flex: 1, padding: "16px 32px",
                  background: "white", color: "#111",
                  border: "1px solid #111", borderRadius: 16, fontWeight: 800, fontSize: 16,
                  cursor: "pointer", fontFamily: "inherit",
                }}>
                Telecharger le PDF
              </button>
              <button onClick={telechargerPhotosZip}
                style={{
                  flex: 1, padding: "16px 32px",
                  background: "white", color: "#111",
                  border: "1px solid #111", borderRadius: 16, fontWeight: 700, fontSize: 15,
                  cursor: "pointer", fontFamily: "inherit",
                }}>
                Photos (.zip)
              </button>
              {bien.locataire_email && locataireVerifie ? (
                <button onClick={envoyerAuLocataire} disabled={sending}
                  style={{
                    flex: 1, padding: "16px 32px",
                    background: sent ? "#15803d" : sending ? "#8a8477" : "#1d4ed8", color: "white",
                    border: "none", borderRadius: 16, fontWeight: 800, fontSize: 16,
                    cursor: sending ? "not-allowed" : "pointer", fontFamily: "inherit",
                  }}>
                  {sending ? "Envoi en cours..." : sent ? "Envoye a " + bien.locataire_email + " !" : "Envoyer a " + bien.locataire_email}
                </button>
              ) : bien.locataire_email && !locataireVerifie ? (
                <div style={{ flex: 1, padding: "14px 20px", background: "#FBF6EA", borderRadius: 16, border: "1px solid #EADFC6", textAlign: "center" }}>
                  <p style={{ fontSize: 13, color: "#a16207", fontWeight: 600, margin: 0 }}>Envoi impossible — {bien.locataire_email} pas encore inscrit</p>
                  <p style={{ fontSize: 11, color: "#8a8477", margin: "4px 0 0" }}>Invitez-le depuis les parametres du bien. Le PDF reste telechargeable.</p>
                </div>
              ) : (
                <div style={{ flex: 1, padding: "14px 20px", background: "#F7F4EF", borderRadius: 16, border: "1.5px dashed #EAE6DF", textAlign: "center" }}>
                  <p style={{ fontSize: 13, color: "#8a8477", fontWeight: 600, margin: 0 }}>Rattachez un locataire pour envoyer l&apos;EDL</p>
                </div>
              )}
            </div>
          </>
        )}

        {edlExistant && !isReadOnly && (
          <div style={{ background: "#F0FAEE", border: "1px solid #C6E9C0", borderRadius: 12, padding: "12px 16px", marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16 }}>✓</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#15803d", margin: 0 }}>État des lieux sauvegardé</p>
              <p style={{ fontSize: 12, color: "#15803d", margin: "2px 0 0" }}>
                {edlExistant.type === "entree" ? "Entree" : "Sortie"} — {new Date(edlExistant.date_edl || edlExistant.created_at).toLocaleDateString("fr-FR")}
              </p>
            </div>
          </div>
        )}

        <p style={{ fontSize: 12, color: "#8a8477", textAlign: "center", marginTop: 12, lineHeight: 1.6 }}>
          Document contradictoire — a signer par les deux parties.{totalPhotos > 0 ? ` ${totalPhotos} photo(s) jointes en annexe.` : ""}
        </p>
      </div>
    </main>
  )
}
