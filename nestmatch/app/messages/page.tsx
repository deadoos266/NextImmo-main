"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState, useRef, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../lib/supabase"
import { useRole } from "../providers"
import { Suspense } from "react"
import { useResponsive } from "../hooks/useResponsive"
import { displayName } from "../../lib/privacy"
import AnnulerVisiteDialog from "../components/AnnulerVisiteDialog"
import { annulerVisite } from "../../lib/visitesHelpers"

const DOSSIER_PREFIX = "[DOSSIER_CARD]"
const DEMANDE_DOSSIER_PREFIX = "[DEMANDE_DOSSIER]"
const EDL_PREFIX = "[EDL_CARD]"
// Prefix encodé dans contenu pour un message en réponse à un autre.
// Format : "[REPLY:<id>]\n<texte>". Permet d'implémenter le reply-to sans migration DB.
const REPLY_REGEX = /^\[REPLY:(\d+)\]\n([\s\S]*)$/

function parseReply(contenu: string): { replyToId: number | null; text: string } {
  const m = contenu.match(REPLY_REGEX)
  if (m) return { replyToId: parseInt(m[1], 10), text: m[2] }
  return { replyToId: null, text: contenu }
}

function encodeReply(replyToId: number | null, text: string): string {
  return replyToId ? `[REPLY:${replyToId}]\n${text}` : text
}

const STATUT_VISITE: Record<string, { bg: string; color: string; border: string; label: string }> = {
  "proposée":  { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa", label: "En attente" },
  "confirmée": { bg: "#dcfce7", color: "#15803d", border: "#bbf7d0", label: "Confirmée" },
  "annulée":   { bg: "#fee2e2", color: "#dc2626", border: "#fecaca", label: "Annulée" },
  "effectuée": { bg: "#f3f4f6", color: "#374151", border: "#e5e7eb", label: "Effectuée" },
}

// ─── Dossier Card ────────────────────────────────────────────────────────────

function DossierCard({ contenu, isMine }: { contenu: string; isMine: boolean }) {
  let data: any = {}
  try { data = JSON.parse(contenu.slice(DOSSIER_PREFIX.length)) } catch {}
  const scoreColor = data.score >= 80 ? "#15803d" : data.score >= 50 ? "#c2410c" : "#b91c1c"
  const scoreBg   = data.score >= 80 ? "#dcfce7" : data.score >= 50 ? "#fff7ed" : "#fee2e2"
  return (
    <div style={{ background: isMine ? "#1a1a1a" : "#f9fafb", border: `1.5px solid ${isMine ? "#333" : "#e5e7eb"}`, borderRadius: 14, padding: "14px 18px", minWidth: 220, maxWidth: 280 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 18 }}>📁</span>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 700, fontSize: 13, color: isMine ? "white" : "#111", margin: 0 }}>Dossier locataire</p>
          <p style={{ fontSize: 11, color: isMine ? "#9ca3af" : "#6b7280", margin: 0 }}>{data.email}</p>
        </div>
        {data.score != null && (
          <span style={{ background: scoreBg, color: scoreColor, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>{data.score}%</span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {data.nom           && <Row label="Nom"       val={data.nom}                                                   isMine={isMine} />}
        {data.situation_pro && <Row label="Situation" val={data.situation_pro}                                         isMine={isMine} />}
        {data.revenus_mensuels && <Row label="Revenus" val={`${Number(data.revenus_mensuels).toLocaleString("fr-FR")} €/mois`} isMine={isMine} />}
        {data.garant        && <Row label="Garant"    val={data.type_garant || "Oui"}                                  isMine={isMine} />}
      </div>
    </div>
  )
}
function Row({ label, val, isMine }: { label: string; val: string; isMine: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span style={{ fontSize: 11, color: isMine ? "#9ca3af" : "#6b7280" }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: isMine ? "white" : "#111" }}>{val}</span>
    </div>
  )
}

// ─── Demande Dossier Card ────────────────────────────────────────────────────

function DemandeDossierCard({ isMine, dossierRecu, onEnvoyer, envoyant }: {
  isMine: boolean
  dossierRecu: boolean
  onEnvoyer: () => void
  envoyant: boolean
}) {
  if (isMine) {
    return (
      <div style={{ background: "#1a1a1a", border: "1.5px solid #333", borderRadius: 14, padding: "14px 18px", minWidth: 220, maxWidth: 280 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>📋</span>
          <div>
            <p style={{ fontWeight: 700, fontSize: 13, color: "white", margin: 0 }}>Dossier demandé</p>
            <p style={{ fontSize: 11, color: dossierRecu ? "#86efac" : "#9ca3af", margin: "2px 0 0" }}>
              {dossierRecu ? "✓ Dossier reçu" : "En attente de réponse..."}
            </p>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div style={{ background: "#f9fafb", border: "1.5px solid #e5e7eb", borderRadius: 14, padding: "14px 18px", minWidth: 220, maxWidth: 280 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>📋</span>
        <div>
          <p style={{ fontWeight: 700, fontSize: 13, color: "#111", margin: 0 }}>Demande de dossier</p>
          <p style={{ fontSize: 11, color: "#6b7280", margin: "2px 0 0" }}>Le propriétaire souhaite voir votre dossier</p>
        </div>
      </div>
      {dossierRecu ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#dcfce7", borderRadius: 8, padding: "7px 12px" }}>
          <span style={{ fontSize: 12 }}>✓</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#15803d" }}>Dossier envoyé</span>
        </div>
      ) : (
        <button onClick={onEnvoyer} disabled={envoyant}
          style={{ width: "100%", background: envoyant ? "#e5e7eb" : "#111", color: envoyant ? "#9ca3af" : "white", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: envoyant ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
          {envoyant ? "Envoi en cours..." : "📁 Envoyer mon dossier"}
        </button>
      )}
    </div>
  )
}

// ─── EDL Card ───────────────────────────────────────────────────────────────

function EdlCard({ contenu, isMine }: { contenu: string; isMine: boolean }) {
  let data: any = {}
  try { data = JSON.parse(contenu.slice(EDL_PREFIX.length)) } catch {}
  const typeLabel = data.type === "entree" ? "entree" : "sortie"
  const dateLabel = data.dateEdl ? new Date(data.dateEdl).toLocaleDateString("fr-FR") : ""

  if (isMine) {
    return (
      <div style={{ background: "#1a1a1a", border: "1.5px solid #333", borderRadius: 14, padding: "14px 18px", minWidth: 220, maxWidth: 280 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>📋</span>
          <div>
            <p style={{ fontWeight: 700, fontSize: 13, color: "white", margin: 0 }}>État des lieux envoye</p>
            <p style={{ fontSize: 11, color: "#9ca3af", margin: "2px 0 0" }}>
              {data.bienTitre || "Bien"} — {dateLabel}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: "#f9fafb", border: "1.5px solid #e5e7eb", borderRadius: 14, padding: "14px 18px", minWidth: 220, maxWidth: 280 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>📋</span>
        <div>
          <p style={{ fontWeight: 700, fontSize: 13, color: "#111", margin: 0 }}>État des lieux d'{typeLabel}</p>
          <p style={{ fontSize: 11, color: "#6b7280", margin: "2px 0 0" }}>
            {data.bienTitre || "Bien"} — {dateLabel}
          </p>
        </div>
      </div>
      {data.edlId && (
        <a href={`/edl/consulter/${data.edlId}`}
          style={{
            display: "block", width: "100%", background: "#111", color: "white",
            border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13,
            fontWeight: 700, textAlign: "center", textDecoration: "none",
            fontFamily: "inherit",
          }}>
          Consulter l'EDL →
        </a>
      )}
    </div>
  )
}

// ─── Date separator ──────────────────────────────────────────────────────────

function dateSep(dateStr: string) {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui"
  if (d.toDateString() === yesterday.toDateString()) return "Hier"
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
}

// ─── Main component ──────────────────────────────────────────────────────────

function MessagesInner() {
  const { data: session, status } = useSession()
  const { proprietaireActive } = useRole()
  const router = useRouter()
  const searchParams = useSearchParams()
  const withEmail = searchParams.get("with")

  const MESSAGES_RAPIDES = proprietaireActive ? [
    "Bien toujours disponible, n'hésitez pas à proposer une visite.",
    "Pourriez-vous m'envoyer votre dossier locataire ?",
    "Votre candidature a retenu notre attention, pouvons-nous convenir d'une visite ?",
    "Suite donnée à une autre candidature. Bonne recherche !",
    "Quelles sont vos disponibilités pour visiter le bien ?",
  ] : [
    "Je suis toujours intéressé(e) par votre bien.",
    "Mon dossier est complet, je peux vous l'envoyer.",
    "Quelles sont vos disponibilités pour une visite ?",
    "Avez-vous d'autres biens disponibles ?",
    "Pouvez-vous me confirmer que le bien est encore disponible ?",
  ]

  const [conversations, setConversations] = useState<any[]>([])
  const [annonces, setAnnonces] = useState<Record<number, any>>({})
  const [convActive, setConvActive] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [nouveau, setNouveau] = useState("")
  const [loading, setLoading] = useState(true)
  const [envoi, setEnvoi] = useState(false)
  const [envoyantDossier, setEnvoyantDossier] = useState(false)
  const [recherche, setRecherche] = useState("")
  const [supprimant, setSupprimant] = useState<string | null>(null)
  const [menuConv, setMenuConv] = useState<string | null>(null)
  // Reply-to : infos du message auquel on répond (null = pas de reply)
  const [replyTo, setReplyTo] = useState<{ id: number; contenu: string; from: string } | null>(null)
  // Menu d'actions sur un message (id du msg ouvert, null = fermé)
  const [menuMsgId, setMenuMsgId] = useState<number | null>(null)
  // Modale annulation visite (inline dans la conv)
  const [visiteCancelTarget, setVisiteCancelTarget] = useState<{ v: any; mode: "refus" | "annulation" } | null>(null)
  const [visitesConv, setVisitesConv] = useState<any[]>([])
  const [showVisiteForm, setShowVisiteForm] = useState(false)
  const [visiteDate, setVisiteDate] = useState("")
  const [visiteHeure, setVisiteHeure] = useState("10:00")
  const [visiteMessage, setVisiteMessage] = useState("")
  const [envoyantVisite, setEnvoyantVisite] = useState(false)
  const [demandantDossier, setDemandantDossier] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const myEmail = session?.user?.email

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth")
    if (session?.user?.email) loadConversations()
  }, [session, status, withEmail])

  // Scroll automatique :
  // - au switch de conversation : position au bas INSTANTANEMENT (pas d'animation qui glisse)
  // - à l'arrivée d'un nouveau message dans la conv active : scroll smooth vers le bas
  const prevConvKey = useRef<string | null>(null)
  const prevMsgCount = useRef(0)
  useEffect(() => {
    if (prevConvKey.current !== convActive) {
      // Changement de conv : sauter directement en bas, sans animation visible
      prevConvKey.current = convActive
      prevMsgCount.current = messages.length
      requestAnimationFrame(() => {
        if (bottomRef.current) bottomRef.current.scrollIntoView({ block: "end" })
      })
      return
    }
    // Même conv : ne scroll que si nouveau message
    if (messages.length > prevMsgCount.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    }
    prevMsgCount.current = messages.length
  }, [messages, convActive])

  // Temps réel — écoute les nouveaux messages de la conv active
  useEffect(() => {
    if (!convActive || !myEmail) return
    const conv = conversations.find(c => c.key === convActive)
    if (!conv) return

    const channel = supabase.channel(`messages-${convActive}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as any
        const isRelevant =
          (m.from_email === myEmail && m.to_email === conv.other) ||
          (m.from_email === conv.other && m.to_email === myEmail)
        if (isRelevant) {
          setMessages(prev => {
            if (prev.find(x => x.id === m.id)) return prev
            return [...prev, m]
          })
          if (m.to_email === myEmail) {
            supabase.from("messages").update({ lu: true }).eq("id", m.id)
            setConversations(prev => prev.map(c => c.key === convActive ? { ...c, unread: 0, lastMsg: m } : c))
          }
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [convActive, myEmail])

  async function loadConversations() {
    const email = session!.user!.email!
    const { data } = await supabase.from("messages")
      .select("*")
      .or(`from_email.eq.${email},to_email.eq.${email}`)
      .order("created_at", { ascending: false })

    const convMap = new Map<string, any>()
    if (data) {
      data.forEach((m: any) => {
        const other = m.from_email === email ? m.to_email : m.from_email
        const key = [email, other].sort().join("|")
        if (!convMap.has(key)) convMap.set(key, { key, other, lastMsg: m, unread: 0, annonceId: m.annonce_id || null })
        if (m.to_email === email && !m.lu) convMap.get(key)!.unread++
        // garder l'annonce_id de la conv (premier message qui en a un)
        if (m.annonce_id && !convMap.get(key)!.annonceId) convMap.get(key)!.annonceId = m.annonce_id
      })
    }

    if (withEmail && withEmail !== email) {
      const key = [email, withEmail].sort().join("|")
      if (!convMap.has(key)) convMap.set(key, { key, other: withEmail, lastMsg: null, unread: 0, annonceId: null })
    }

    const convList = Array.from(convMap.values())
    setConversations(convList)

    // Fetch les annonces liées
    const ids = [...new Set(convList.map(c => c.annonceId).filter(Boolean))]
    if (ids.length > 0) {
      const { data: ann } = await supabase.from("annonces").select("id, titre, ville, photos").in("id", ids)
      if (ann) {
        const map: Record<number, any> = {}
        ann.forEach((a: any) => { map[a.id] = a })
        setAnnonces(map)
      }
    }

    const target = withEmail ? convList.find(c => c.other === withEmail) : convList[0]
    if (target) {
      setConvActive(target.key)
      loadMessages(email, target.other)
      loadVisitesConv(target.other)
    }
    setLoading(false)
  }

  async function loadMessages(email: string, other: string) {
    const [{ data: sent }, { data: received }] = await Promise.all([
      supabase.from("messages").select("*").eq("from_email", email).eq("to_email", other),
      supabase.from("messages").select("*").eq("from_email", other).eq("to_email", email),
    ])
    const data = [...(sent || []), ...(received || [])].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    setMessages(data)
    await supabase.from("messages").update({ lu: true }).eq("to_email", email).eq("from_email", other)
    setConversations(prev => prev.map(c => c.other === other ? { ...c, unread: 0 } : c))
  }

  async function envoyer() {
    if (!nouveau.trim() || !convActive || !myEmail) return
    setEnvoi(true)
    const conv = conversations.find(c => c.key === convActive)
    if (!conv) return
    const contenuFinal = encodeReply(replyTo?.id ?? null, nouveau.trim())
    const msg = { from_email: myEmail, to_email: conv.other, contenu: contenuFinal, lu: false, created_at: new Date().toISOString() }
    const { data } = await supabase.from("messages").insert([msg]).select().single()
    if (data) {
      setMessages(prev => [...prev, data])
      setConversations(prev => prev.map(c => c.key === convActive ? { ...c, lastMsg: data } : c))
    }
    setNouveau("")
    setReplyTo(null)
    setEnvoi(false)
    inputRef.current?.focus()
  }

  async function supprimerMessage(id: number) {
    if (!confirm("Supprimer ce message ?")) return
    const { error } = await supabase.from("messages").delete().eq("id", id)
    if (!error) {
      setMessages(prev => prev.filter(m => m.id !== id))
    }
    setMenuMsgId(null)
  }

  async function copierMessage(contenu: string) {
    const { text } = parseReply(contenu)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Fallback silencieux si clipboard API indisponible
    }
    setMenuMsgId(null)
  }

  function repondreMessage(m: any) {
    const { text } = parseReply(m.contenu)
    setReplyTo({ id: m.id, contenu: text, from: m.from_email })
    setMenuMsgId(null)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  async function envoyerDossier() {
    if (!convActive || !myEmail) return
    setEnvoyantDossier(true)
    const conv = conversations.find(c => c.key === convActive)
    if (!conv) { setEnvoyantDossier(false); return }

    const { data: profil } = await supabase.from("profils")
      .select("nom,situation_pro,revenus_mensuels,garant,type_garant,nb_occupants,dossier_docs")
      .eq("email", myEmail).single()

    let score = 0
    if (profil) {
      if (profil.nom) score += 15
      if (profil.situation_pro) score += 15
      if (profil.revenus_mensuels) score += 20
      if (profil.dossier_docs) {
        const keys = ["identite", "bulletins", "avis_imposition", "contrat", "rib"]
        const filled = keys.filter(k => { const v = (profil.dossier_docs as any)[k]; return Array.isArray(v) ? v.length > 0 : !!v })
        score += Math.round((filled.length / keys.length) * 50)
      }
    }

    const payload = { email: myEmail, nom: profil?.nom || session?.user?.name || "", situation_pro: profil?.situation_pro || "", revenus_mensuels: profil?.revenus_mensuels || "", garant: profil?.garant || false, type_garant: profil?.type_garant || "", nb_occupants: profil?.nb_occupants || 1, score: Math.min(score, 100) }
    const msg = { from_email: myEmail, to_email: conv.other, contenu: DOSSIER_PREFIX + JSON.stringify(payload), lu: false, created_at: new Date().toISOString() }
    const { data } = await supabase.from("messages").insert([msg]).select().single()
    if (data) {
      setMessages(prev => [...prev, data])
      setConversations(prev => prev.map(c => c.key === convActive ? { ...c, lastMsg: data } : c))
    }
    setEnvoyantDossier(false)
  }

  async function supprimerConversation(key: string) {
    setSupprimant(key)
    const conv = conversations.find(c => c.key === key)
    if (!conv || !myEmail) { setSupprimant(null); return }
    await supabase.from("messages")
      .delete()
      .or(`and(from_email.eq.${myEmail},to_email.eq.${conv.other}),and(from_email.eq.${conv.other},to_email.eq.${myEmail})`)
    setConversations(prev => prev.filter(c => c.key !== key))
    if (convActive === key) { setConvActive(null); setMessages([]) }
    setSupprimant(null)
  }

  async function marquerLu(conv: any) {
    await supabase.from("messages").update({ lu: true }).eq("to_email", myEmail!).eq("from_email", conv.other)
    setConversations(prev => prev.map(c => c.key === conv.key ? { ...c, unread: 0 } : c))
  }

  async function loadVisitesConv(otherEmail: string) {
    if (!myEmail) return
    let query = supabase.from("visites").select("*")
    if (proprietaireActive) {
      query = query.eq("proprietaire_email", myEmail).eq("locataire_email", otherEmail)
    } else {
      query = query.eq("locataire_email", myEmail).eq("proprietaire_email", otherEmail)
    }
    const { data } = await query.in("statut", ["proposée", "confirmée"]).order("date_visite", { ascending: true })
    setVisitesConv(data || [])
  }

  async function demanderDossier() {
    if (!convActive || !myEmail) return
    setDemandantDossier(true)
    const conv = conversations.find(c => c.key === convActive)
    if (!conv) { setDemandantDossier(false); return }
    const msg = { from_email: myEmail, to_email: conv.other, contenu: DEMANDE_DOSSIER_PREFIX, lu: false, created_at: new Date().toISOString() }
    const { data } = await supabase.from("messages").insert([msg]).select().single()
    if (data) {
      setMessages(prev => [...prev, data])
      setConversations(prev => prev.map(c => c.key === convActive ? { ...c, lastMsg: data } : c))
    }
    setDemandantDossier(false)
  }

  async function changerStatutVisite(id: string, statut: string) {
    await supabase.from("visites").update({ statut }).eq("id", id)
    setVisitesConv(prev => prev.map(v => v.id === id ? { ...v, statut } : v))
  }

  async function handleAnnulerVisite(motif: string) {
    if (!visiteCancelTarget || !myEmail) return
    const v = visiteCancelTarget.v
    // Destinataire = l'autre partie de la visite
    const toEmail = v.proprietaire_email === myEmail ? v.locataire_email : v.proprietaire_email
    const res = await annulerVisite({
      visiteId: v.id,
      fromEmail: myEmail,
      toEmail,
      dateVisite: v.date_visite,
      heureVisite: v.heure,
      motif,
      statutActuel: v.statut,
    })
    if (res.ok) {
      setVisitesConv(prev => prev.map(x => x.id === v.id ? { ...x, statut: "annulée" } : x))
      // Actualiser les messages pour voir le message auto-posté
      if (convActive) {
        const conv = conversations.find(c => c.key === convActive)
        if (conv) loadMessages(myEmail, conv.other)
      }
      setVisiteCancelTarget(null)
    }
  }

  async function proposerVisite() {
    if (!convActiveData?.annonceId || !myEmail || !visiteDate || !visiteHeure) return
    setEnvoyantVisite(true)
    const propEmail = proprietaireActive ? myEmail : convActiveData.other
    const locEmail  = proprietaireActive ? convActiveData.other : myEmail
    const { data: visite } = await supabase.from("visites").insert([{
      annonce_id: convActiveData.annonceId,
      proprietaire_email: propEmail,
      locataire_email: locEmail,
      date_visite: visiteDate,
      heure: visiteHeure,
      message: visiteMessage.trim() || null,
      statut: "proposée",
      propose_par: myEmail,
    }]).select().single()
    if (visite) {
      setVisitesConv(prev => [...prev, visite])
      const dateFormatee = new Date(visiteDate + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      const contenu = `📅 Demande de visite le ${dateFormatee} à ${visiteHeure}${visiteMessage.trim() ? ` — "${visiteMessage.trim()}"` : ""}`
      const { data: msg } = await supabase.from("messages").insert([{ from_email: myEmail, to_email: convActiveData.other, contenu, lu: false, created_at: new Date().toISOString() }]).select().single()
      if (msg) {
        setMessages(prev => [...prev, msg])
        setConversations(prev => prev.map(c => c.key === convActive ? { ...c, lastMsg: msg } : c))
      }
    }
    setShowVisiteForm(false)
    setVisiteDate("")
    setVisiteHeure("10:00")
    setVisiteMessage("")
    setEnvoyantVisite(false)
  }

  const { isMobile } = useResponsive()
  const convActiveData = conversations.find(c => c.key === convActive)
  const annonceActive = convActiveData?.annonceId ? annonces[convActiveData.annonceId] : null

  const convsFiltrees = conversations
    .filter(c =>
      !recherche || c.other.toLowerCase().includes(recherche.toLowerCase()) ||
      (annonces[c.annonceId]?.titre || "").toLowerCase().includes(recherche.toLowerCase())
    )
    // Tri : conversations non lues en premier, puis par date du dernier message (recent d'abord)
    .slice()
    .sort((a, b) => {
      if ((a.unread > 0) !== (b.unread > 0)) return a.unread > 0 ? -1 : 1
      const da = a.lastMsg?.created_at ? new Date(a.lastMsg.created_at).getTime() : 0
      const db = b.lastMsg?.created_at ? new Date(b.lastMsg.created_at).getTime() : 0
      return db - da
    })

  const dossierDejaEnvoye = messages.some(m =>
    typeof m.contenu === "string" && m.contenu.startsWith(DOSSIER_PREFIX)
  )

  // Grouper les messages par date
  const messagesAvecSep: Array<{ type: "sep"; label: string } | { type: "msg"; msg: any }> = []
  let lastDate = ""
  messages.forEach(m => {
    const d = new Date(m.created_at).toDateString()
    if (d !== lastDate) { messagesAvecSep.push({ type: "sep", label: dateSep(m.created_at) }); lastDate = d }
    messagesAvecSep.push({ type: "msg", msg: m })
  })

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#6b7280" }}>Chargement...</div>
  )

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <AnnulerVisiteDialog
        open={!!visiteCancelTarget}
        mode={visiteCancelTarget?.mode}
        onClose={() => setVisiteCancelTarget(null)}
        onConfirm={handleAnnulerVisite}
      />
      <div style={{ maxWidth: 1140, margin: "0 auto", padding: isMobile ? "20px 16px" : "32px 48px" }}>
        {(!isMobile || !convActiveData) && (
          <h1 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 800, marginBottom: isMobile ? 16 : 24, letterSpacing: "-0.5px" }}>Messages</h1>
        )}

        <div style={{ display: "flex", gap: 16, height: isMobile ? "calc(100vh - 120px)" : "76vh" }}>

          {/* ── Colonne gauche : conversations ── */}
          <div style={{ width: isMobile ? "100%" : 300, flexShrink: 0, background: "white", borderRadius: 20, display: isMobile && convActiveData ? "none" : "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            {/* Recherche */}
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #f3f4f6" }}>
              <input
                value={recherche} onChange={e => setRecherche(e.target.value)}
                placeholder="Rechercher..."
                style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
              {convsFiltrees.length === 0 ? (
                <div style={{ padding: "32px 20px", textAlign: "center", color: "#9ca3af" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
                  <p style={{ fontSize: 13, fontWeight: 600 }}>{recherche ? "Aucun résultat" : "Aucun message"}</p>
                  {!recherche && (
                    <p style={{ fontSize: 12, marginTop: 4, textAlign: "center", lineHeight: 1.5 }}>
                      {proprietaireActive
                        ? "Les locataires vous contacteront depuis vos annonces"
                        : "Contactez un propriétaire depuis une annonce"}
                    </p>
                  )}
                </div>
              ) : convsFiltrees.map(conv => {
                const ann = annonces[conv.annonceId]
                const photo = Array.isArray(ann?.photos) && ann.photos.length > 0 ? ann.photos[0] : null
                const isActive = convActive === conv.key
                const rawPreview = conv.lastMsg?.contenu || ""
                const previewText = rawPreview.startsWith(DOSSIER_PREFIX) ? "Dossier envoyé"
                  : rawPreview.startsWith(DEMANDE_DOSSIER_PREFIX) ? "Dossier demandé"
                  : rawPreview.startsWith(EDL_PREFIX) ? "État des lieux envoyé"
                  : parseReply(rawPreview).text // ignore le préfixe [REPLY:id]
                const preview = rawPreview
                  ? (previewText.length > 35 ? previewText.slice(0, 35) + "…" : previewText)
                  : "Nouvelle conversation"
                const time = conv.lastMsg?.created_at
                  ? new Date(conv.lastMsg.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
                  : ""

                return (
                  <div key={conv.key}
                    onClick={() => { setConvActive(conv.key); setMenuConv(null); setVisitesConv([]); loadMessages(myEmail!, conv.other); loadVisitesConv(conv.other) }}
                    style={{ padding: "12px 16px", cursor: "pointer", background: isActive ? "#f9fafb" : "white", borderBottom: "1px solid #f3f4f6", borderLeft: isActive ? "3px solid #111" : conv.unread > 0 ? "3px solid #ef4444" : "3px solid transparent", position: "relative" }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#fafafa"; const btn = e.currentTarget.querySelector(".menu-btn") as HTMLElement; if (btn) btn.style.opacity = "1" }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "white"; if (menuConv !== conv.key) { const btn = e.currentTarget.querySelector(".menu-btn") as HTMLElement; if (btn) btn.style.opacity = "0" } }}
                  >
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      {/* Avatar annonce ou initiale */}
                      <div style={{ position: "relative", flexShrink: 0 }}>
                        {photo ? (
                          <img src={photo} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover", display: "block" }} />
                        ) : (
                          <div style={{ width: 40, height: 40, borderRadius: 10, background: "#111", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 15 }}>
                            {conv.other[0]?.toUpperCase()}
                          </div>
                        )}
                        {conv.unread > 0 && (
                          <span style={{ position: "absolute", top: -4, right: -4, background: "#ef4444", color: "white", borderRadius: 999, fontSize: 9, fontWeight: 800, minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", border: "2px solid white" }}>
                            {conv.unread}
                          </span>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                          <p style={{ fontWeight: conv.unread > 0 ? 800 : 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130, color: "#111" }}>
                            {ann?.titre || displayName(conv.other, ann?.proprietaire)}
                          </p>
                          <span style={{ fontSize: 10, color: "#9ca3af", whiteSpace: "nowrap" }}>{time}</span>
                        </div>
                        {ann?.titre && (
                          <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName(conv.other, ann?.proprietaire)}</p>
                        )}
                        <p style={{ fontSize: 12, color: conv.unread > 0 ? "#374151" : "#9ca3af", fontWeight: conv.unread > 0 ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview}</p>
                      </div>
                    </div>

                    {/* Bouton 3 points */}
                    <button
                      className="menu-btn"
                      onClick={e => { e.stopPropagation(); setMenuConv(menuConv === conv.key ? null : conv.key) }}
                      style={{ position: "absolute", top: 10, right: 10, opacity: menuConv === conv.key ? 1 : 0, background: "#f3f4f6", border: "none", borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontSize: 16, color: "#6b7280", transition: "opacity 0.15s", lineHeight: 1, letterSpacing: 1 }}>
                      ···
                    </button>

                    {/* Dropdown menu */}
                    {menuConv === conv.key && (
                      <>
                        <div onClick={e => { e.stopPropagation(); setMenuConv(null) }} style={{ position: "fixed", inset: 0, zIndex: 100 }} />
                        <div style={{ position: "absolute", top: 36, right: 10, background: "white", borderRadius: 12, border: "1.5px solid #e5e7eb", boxShadow: "0 6px 20px rgba(0,0,0,0.12)", zIndex: 200, minWidth: 170, overflow: "hidden" }}>
                          {conv.unread > 0 && (
                            <button onClick={e => { e.stopPropagation(); marquerLu(conv); setMenuConv(null) }}
                              style={{ width: "100%", padding: "10px 14px", background: "none", border: "none", borderBottom: "1px solid #f3f4f6", textAlign: "left", fontSize: 13, cursor: "pointer", fontFamily: "inherit", color: "#374151", display: "flex", alignItems: "center", gap: 8 }}
                              onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                              onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                              ✓ Marquer comme lu
                            </button>
                          )}
                          {ann && (
                            <button onClick={e => { e.stopPropagation(); window.location.href = `/annonces/${conv.annonceId}`; setMenuConv(null) }}
                              style={{ width: "100%", padding: "10px 14px", background: "none", border: "none", borderBottom: "1px solid #f3f4f6", textAlign: "left", fontSize: 13, cursor: "pointer", fontFamily: "inherit", color: "#374151", display: "flex", alignItems: "center", gap: 8 }}
                              onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                              onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                              🏠 Voir l'annonce
                            </button>
                          )}
                          <button onClick={e => { e.stopPropagation(); supprimerConversation(conv.key); setMenuConv(null) }}
                            disabled={supprimant === conv.key}
                            style={{ width: "100%", padding: "10px 14px", background: "none", border: "none", textAlign: "left", fontSize: 13, cursor: supprimant === conv.key ? "not-allowed" : "pointer", fontFamily: "inherit", color: "#dc2626", display: "flex", alignItems: "center", gap: 8, opacity: supprimant === conv.key ? 0.5 : 1 }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#fee2e2")}
                            onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                            🗑 {supprimant === conv.key ? "Suppression…" : "Supprimer"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Colonne droite : chat ── */}
          <div style={{ flex: 1, background: "white", borderRadius: 20, display: isMobile && !convActiveData ? "none" : "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            {!convActiveData ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", color: "#9ca3af", gap: 12 }}>
                <div style={{ fontSize: 48 }}>💬</div>
                <p style={{ fontSize: 16, fontWeight: 600, color: "#374151" }}>Sélectionnez une conversation</p>
                {!proprietaireActive ? (
                  <>
                    <p style={{ fontSize: 13 }}>Contactez un propriétaire depuis une annonce</p>
                    <Link href="/annonces" style={{ marginTop: 8, padding: "10px 24px", background: "#111", color: "white", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 14 }}>
                      Voir les annonces
                    </Link>
                  </>
                ) : (
                  <p style={{ fontSize: 13 }}>Les locataires intéressés vous contacteront ici</p>
                )}
              </div>
            ) : (
              <>
                {/* Header chat */}
                <div style={{ padding: isMobile ? "10px 14px" : "14px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: isMobile ? 8 : 12 }}>
                  {isMobile && (
                    <button onClick={() => setConvActive(null)}
                      style={{ background: "#f3f4f6", border: "none", borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 18, flexShrink: 0 }}>
                      ←
                    </button>
                  )}
                  {annonceActive ? (
                    <>
                      {Array.isArray(annonceActive.photos) && annonceActive.photos[0] ? (
                        <img src={annonceActive.photos[0]} alt="" style={{ width: 42, height: 42, borderRadius: 10, objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: 42, height: 42, borderRadius: 10, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🏠</div>
                      )}
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: 700, fontSize: 14 }}>{annonceActive.titre}</p>
                        <p style={{ fontSize: 12, color: "#9ca3af" }}>{annonceActive.ville} &middot; {displayName(convActiveData.other, annonceActive.proprietaire)}</p>
                      </div>
                      <Link href={`/annonces/${convActiveData.annonceId}`}
                        style={{ fontSize: 12, fontWeight: 600, color: "#111", textDecoration: "none", border: "1.5px solid #e5e7eb", borderRadius: 999, padding: "6px 14px", whiteSpace: "nowrap" }}>
                        Voir l&apos;annonce
                      </Link>
                    </>
                  ) : (
                    <>
                      <div style={{ width: 42, height: 42, borderRadius: "50%", background: "#111", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 16 }}>
                        {convActiveData.other[0]?.toUpperCase()}
                      </div>
                      <p style={{ fontWeight: 700, fontSize: 14 }}>{displayName(convActiveData.other)}</p>
                    </>
                  )}
                </div>

                {/* Messages */}
                <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {messages.length === 0 && (
                    <div style={{ textAlign: "center", color: "#9ca3af", marginTop: 40 }}>
                      <p style={{ fontSize: 14 }}>Démarrez la conversation</p>
                    </div>
                  )}
                  {messagesAvecSep.map((item, idx) => {
                    if (item.type === "sep") return (
                      <div key={`sep-${idx}`} style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0" }}>
                        <div style={{ flex: 1, height: 1, background: "#f3f4f6" }} />
                        <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, whiteSpace: "nowrap" }}>{item.label}</span>
                        <div style={{ flex: 1, height: 1, background: "#f3f4f6" }} />
                      </div>
                    )
                    const m = item.msg
                    const isMine = m.from_email === myEmail
                    const isDossier = typeof m.contenu === "string" && m.contenu.startsWith(DOSSIER_PREFIX)
                    const isDemande = typeof m.contenu === "string" && m.contenu === DEMANDE_DOSSIER_PREFIX
                    const isEdl = typeof m.contenu === "string" && m.contenu.startsWith(EDL_PREFIX)
                    return (
                      <div key={m.id} style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start" }}>
                        {isDossier ? (
                          <div>
                            <DossierCard contenu={m.contenu} isMine={isMine} />
                            <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 3, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : isDemande ? (
                          <div>
                            <DemandeDossierCard
                              isMine={isMine}
                              dossierRecu={dossierDejaEnvoye}
                              onEnvoyer={envoyerDossier}
                              envoyant={envoyantDossier}
                            />
                            <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 3, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : isEdl ? (
                          <div>
                            <EdlCard contenu={m.contenu} isMine={isMine} />
                            <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 3, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : (() => {
                          // Parse reply-to : si le message est une réponse, afficher la quote au-dessus
                          const { replyToId, text } = parseReply(m.contenu || "")
                          const quoted = replyToId ? messages.find(x => x.id === replyToId) : null
                          const quotedText = quoted ? parseReply(quoted.contenu || "").text : null
                          const quotedLabel = quoted ? (quoted.from_email === myEmail ? "Vous" : displayName(quoted.from_email)) : null

                          return (
                            <div
                              style={{ position: "relative", maxWidth: "68%" }}
                              onMouseEnter={() => {
                                const el = document.getElementById(`msg-actions-${m.id}`)
                                if (el) el.style.opacity = "1"
                              }}
                              onMouseLeave={() => {
                                if (menuMsgId !== m.id) {
                                  const el = document.getElementById(`msg-actions-${m.id}`)
                                  if (el) el.style.opacity = "0"
                                }
                              }}
                            >
                              <div style={{ padding: "10px 14px", borderRadius: isMine ? "18px 18px 4px 18px" : "18px 18px 18px 4px", background: isMine ? "#111" : "#f3f4f6", color: isMine ? "white" : "#111" }}>
                                {/* Quote du message auquel on répond */}
                                {quoted && quotedText && (
                                  <div
                                    onClick={() => {
                                      const el = document.getElementById(`msg-${quoted.id}`)
                                      if (el) {
                                        el.scrollIntoView({ behavior: "smooth", block: "center" })
                                        el.style.transition = "background 0.3s"
                                        el.style.background = "rgba(255,200,0,0.2)"
                                        setTimeout(() => { el.style.background = "" }, 1000)
                                      }
                                    }}
                                    style={{
                                      borderLeft: `3px solid ${isMine ? "rgba(255,255,255,0.5)" : "#9ca3af"}`,
                                      padding: "4px 10px",
                                      marginBottom: 6,
                                      opacity: 0.75,
                                      fontSize: 12,
                                      lineHeight: 1.4,
                                      cursor: "pointer",
                                      background: isMine ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)",
                                      borderRadius: 6,
                                    }}
                                  >
                                    <p style={{ fontSize: 10, fontWeight: 700, margin: 0, marginBottom: 2, opacity: 0.9 }}>{quotedLabel}</p>
                                    <p style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
                                      {quotedText.length > 120 ? quotedText.slice(0, 120) + "…" : quotedText}
                                    </p>
                                  </div>
                                )}
                                <p id={`msg-${m.id}`} style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>{text}</p>
                                <p style={{ fontSize: 10, opacity: 0.5, marginTop: 4, textAlign: "right", margin: "4px 0 0" }}>
                                  {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                                  {isMine && <span style={{ marginLeft: 4 }}>{m.lu ? "✓✓" : "✓"}</span>}
                                </p>
                              </div>

                              {/* Bouton actions (...) + menu */}
                              <div
                                id={`msg-actions-${m.id}`}
                                style={{
                                  position: "absolute",
                                  top: 4,
                                  [isMine ? "left" : "right"]: -30,
                                  opacity: menuMsgId === m.id ? 1 : 0,
                                  transition: "opacity 0.15s",
                                } as React.CSSProperties}
                              >
                                <button
                                  onClick={e => { e.stopPropagation(); setMenuMsgId(menuMsgId === m.id ? null : m.id) }}
                                  aria-label="Actions sur le message"
                                  style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "50%", width: 26, height: 26, cursor: "pointer", fontSize: 14, color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontFamily: "inherit", lineHeight: 1, boxShadow: "0 2px 6px rgba(0,0,0,0.1)" }}
                                >
                                  ⋯
                                </button>
                                {menuMsgId === m.id && (
                                  <>
                                    <div onClick={() => setMenuMsgId(null)} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
                                    <div style={{ position: "absolute", top: 30, [isMine ? "left" : "right"]: 0, background: "white", border: "1px solid #e5e7eb", borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 60, minWidth: 160, overflow: "hidden" } as React.CSSProperties}>
                                      <button onClick={() => repondreMessage(m)}
                                        style={{ display: "block", width: "100%", padding: "10px 14px", background: "white", border: "none", textAlign: "left", fontSize: 13, color: "#111", cursor: "pointer", fontFamily: "inherit" }}
                                        onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                                        onMouseLeave={e => (e.currentTarget.style.background = "white")}>
                                        Répondre
                                      </button>
                                      <button onClick={() => copierMessage(m.contenu)}
                                        style={{ display: "block", width: "100%", padding: "10px 14px", background: "white", border: "none", textAlign: "left", fontSize: 13, color: "#111", cursor: "pointer", fontFamily: "inherit" }}
                                        onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                                        onMouseLeave={e => (e.currentTarget.style.background = "white")}>
                                        Copier le texte
                                      </button>
                                      {isMine && (
                                        <button onClick={() => supprimerMessage(m.id)}
                                          style={{ display: "block", width: "100%", padding: "10px 14px", background: "white", border: "none", textAlign: "left", fontSize: 13, color: "#dc2626", cursor: "pointer", fontFamily: "inherit", borderTop: "1px solid #f3f4f6" }}
                                          onMouseEnter={e => (e.currentTarget.style.background = "#fef2f2")}
                                          onMouseLeave={e => (e.currentTarget.style.background = "white")}>
                                          Supprimer
                                        </button>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })}
                  <div ref={bottomRef} />
                </div>

                {/* Visites liées à cette conversation */}
                {visitesConv.length > 0 && (
                  <div style={{ borderTop: "1px solid #f3f4f6", padding: "12px 20px", background: "#fafafa" }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
                      📅 Demandes de visite
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {visitesConv.map(v => {
                        const s = STATUT_VISITE[v.statut] ?? STATUT_VISITE["proposée"]
                        const isPending = v.statut === "proposée"
                        return (
                          <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "white", borderRadius: 12, padding: "10px 14px", border: `1.5px solid ${s.border}` }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>
                                  {new Date(v.date_visite + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} à {v.heure}
                                </span>
                                <span style={{ background: s.bg, color: s.color, fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999, border: `1px solid ${s.border}`, flexShrink: 0 }}>
                                  {s.label}
                                </span>
                              </div>
                              {v.message && (
                                <p style={{ fontSize: 11, color: "#6b7280", fontStyle: "italic", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  "{v.message}"
                                </p>
                              )}
                            </div>
                            {proprietaireActive && isPending && v.propose_par !== myEmail && (
                              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                                <button onClick={() => changerStatutVisite(v.id, "confirmée")}
                                  style={{ background: "#111", color: "white", border: "none", borderRadius: 999, padding: "5px 12px", fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                                  ✓ Confirmer
                                </button>
                                <button onClick={() => setVisiteCancelTarget({ v, mode: "refus" })}
                                  style={{ background: "none", border: "1.5px solid #fecaca", color: "#dc2626", borderRadius: 999, padding: "5px 10px", fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                                  Refuser
                                </button>
                              </div>
                            )}
                            {(isPending || v.statut === "confirmée") && (
                              <button onClick={() => setVisiteCancelTarget({ v, mode: "annulation" })}
                                style={{ background: "none", border: "1.5px solid #fecaca", color: "#dc2626", borderRadius: 999, padding: "5px 10px", fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                                Annuler
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Zone saisie */}
                <div style={{ borderTop: "1px solid #f3f4f6", padding: "10px 20px 14px" }}>
                  {/* Bouton dossier + réponses rapides */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                    {!proprietaireActive && (
                      <button onClick={envoyerDossier} disabled={envoyantDossier}
                        style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0", color: "#15803d", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: envoyantDossier ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, opacity: envoyantDossier ? 0.6 : 1 }}>
                        📁 {envoyantDossier ? "Envoi..." : "Mon dossier"}
                      </button>
                    )}
                    {proprietaireActive && (
                      <button onClick={demanderDossier} disabled={demandantDossier}
                        style={{ background: "#fef3c7", border: "1.5px solid #fde68a", color: "#d97706", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: demandantDossier ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, opacity: demandantDossier ? 0.6 : 1 }}>
                        📋 {demandantDossier ? "Envoi..." : "Demander le dossier"}
                      </button>
                    )}
                    {convActiveData?.annonceId && (
                      <button onClick={() => setShowVisiteForm(!showVisiteForm)}
                        style={{ background: showVisiteForm ? "#111" : "#eff6ff", border: "1.5px solid " + (showVisiteForm ? "#111" : "#bfdbfe"), color: showVisiteForm ? "white" : "#1d4ed8", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
                        📅 {showVisiteForm ? "Fermer" : "Proposer une visite"}
                      </button>
                    )}
                    <div style={{ width: 1, height: 16, background: "#e5e7eb" }} />
                    {MESSAGES_RAPIDES.map((msg, i) => (
                      <button key={i} onClick={() => setNouveau(msg)}
                        style={{ background: "#f3f4f6", border: "none", borderRadius: 999, padding: "5px 11px", fontSize: 11, fontWeight: 500, cursor: "pointer", color: "#374151", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                        {msg.slice(0, 30)}{msg.length > 30 ? "…" : ""}
                      </button>
                    ))}
                  </div>
                  {showVisiteForm && convActiveData?.annonceId && (
                    <div style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 14, padding: "14px 16px", marginBottom: 10 }}>
                      <p style={{ fontSize: 12, fontWeight: 800, color: "#1d4ed8", marginBottom: 12 }}>📅 Proposer une visite</p>
                      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 4, textTransform: "uppercase" as const }}>Date</label>
                          <input type="date" min={new Date().toISOString().split("T")[0]} value={visiteDate} onChange={e => setVisiteDate(e.target.value)}
                            style={{ width: "100%", padding: "7px 10px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 4, textTransform: "uppercase" as const }}>Heure</label>
                          <select value={visiteHeure} onChange={e => setVisiteHeure(e.target.value)}
                            style={{ padding: "7px 10px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", background: "white" }}>
                            {["08:00","09:00","10:00","11:00","12:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"].map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                      </div>
                      <input value={visiteMessage} onChange={e => setVisiteMessage(e.target.value)}
                        placeholder="Message pour le propriétaire (optionnel)..."
                        style={{ width: "100%", padding: "7px 10px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", marginBottom: 10, boxSizing: "border-box" as const }} />
                      <button onClick={proposerVisite} disabled={!visiteDate || !visiteHeure || envoyantVisite}
                        style={{ background: visiteDate && visiteHeure && !envoyantVisite ? "#111" : "#e5e7eb", color: visiteDate && visiteHeure && !envoyantVisite ? "white" : "#9ca3af", border: "none", borderRadius: 999, padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: visiteDate && visiteHeure ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
                        {envoyantVisite ? "Envoi..." : "Envoyer la demande"}
                      </button>
                    </div>
                  )}
                  {/* Preview du message auquel on répond */}
                  {replyTo && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f9fafb", borderLeft: "3px solid #111", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: "#111", margin: 0, marginBottom: 2 }}>
                          Répondre à {replyTo.from === myEmail ? "vous-même" : displayName(replyTo.from)}
                        </p>
                        <p style={{ fontSize: 12, color: "#6b7280", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {replyTo.contenu.slice(0, 100)}{replyTo.contenu.length > 100 ? "…" : ""}
                        </p>
                      </div>
                      <button onClick={() => setReplyTo(null)}
                        aria-label="Annuler la réponse"
                        style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#9ca3af", padding: 4, fontFamily: "inherit", lineHeight: 1 }}>
                        ×
                      </button>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 10 }}>
                    <input ref={inputRef} value={nouveau} onChange={e => setNouveau(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && !e.shiftKey && envoyer()}
                      placeholder={replyTo ? "Votre réponse…" : "Votre message…"}
                      style={{ flex: 1, padding: "11px 16px", border: "1.5px solid #e5e7eb", borderRadius: 999, fontSize: 14, outline: "none", fontFamily: "inherit" }} />
                    <button onClick={envoyer} disabled={envoi || !nouveau.trim()}
                      style={{ background: "#111", color: "white", border: "none", borderRadius: 999, padding: "0 22px", fontWeight: 700, fontSize: 14, cursor: envoi || !nouveau.trim() ? "not-allowed" : "pointer", opacity: envoi || !nouveau.trim() ? 0.4 : 1, fontFamily: "inherit" }}>
                      Envoyer
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

export default function Messages() {
  return (
    <Suspense fallback={<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>Chargement...</div>}>
      <MessagesInner />
    </Suspense>
  )
}
