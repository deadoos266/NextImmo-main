"use client"
import { useEffect, useState, useMemo } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
// V12 (Paul 2026-04-28) — supabase anon retiré : toutes les ops du dashboard
// admin passent désormais par les routes /api/admin/* (server-side avec
// supabaseAdmin + is_admin gating). Aucun appel direct DB depuis le client.
import { displayName } from "../../lib/privacy"
import { RAISONS, getRaisonLabel } from "../../lib/signalements"
import { STATUT_STYLE as CONTACT_STATUTS, getSujetLabel, type ContactStatut } from "../../lib/contacts"
import { useResponsive } from "../hooks/useResponsive"

/**
 * Dashboard admin refondu.
 * Le layout parent vérifie is_admin côté serveur — ici on se concentre sur l'UX.
 */

const ONGLETS = ["Vue d'ensemble", "Signalements", "Contact", "Annonces", "Utilisateurs", "Messages", "SEO", "Activité"] as const
type Onglet = typeof ONGLETS[number]

const BASE_URL = process.env.NEXT_PUBLIC_URL || "https://keymatch-immo.fr"

function seoScore(a: any): { score: number; issues: string[] } {
  const issues: string[] = []
  const titre = a.titre || ""
  const description = a.description || ""
  const photos: string[] = Array.isArray(a.photos) ? a.photos : []

  if (!titre) issues.push("Pas de titre")
  else if (titre.length < 20) issues.push("Titre trop court (<20 car.)")
  else if (titre.length > 70) issues.push("Titre trop long (>70 car.)")
  if (!description) issues.push("Pas de description")
  else if (description.length < 80) issues.push("Description trop courte (<80 car.)")
  if (photos.length === 0) issues.push("Aucune photo (pas d'image OG)")
  if (!a.ville) issues.push("Pas de ville")
  if (!a.prix) issues.push("Pas de prix")

  return { score: Math.max(0, 100 - issues.length * 20), issues }
}

function exportCSV(rows: any[], filename: string) {
  if (rows.length === 0) return
  const keys = Object.keys(rows[0])
  const escape = (v: any) => {
    if (v === null || v === undefined) return ""
    const s = typeof v === "object" ? JSON.stringify(v) : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = keys.join(",")
  const body = rows.map(r => keys.map(k => escape(r[k])).join(",")).join("\n")
  const csv = header + "\n" + body
  // BOM UTF-8 pour qu'Excel reconnaisse l'encodage et affiche les accents
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function trendLast30Days(items: any[], dateField: string): number[] {
  const buckets = new Array(30).fill(0)
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  for (const it of items) {
    const d = it[dateField] ? new Date(it[dateField]).getTime() : 0
    if (!d) continue
    const diff = Math.floor((now - d) / dayMs)
    if (diff >= 0 && diff < 30) buckets[29 - diff]++
  }
  return buckets
}

function MiniBars({ values, color = "#111" }: { values: number[]; color?: string }) {
  const max = Math.max(...values, 1)
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 44 }}>
      {values.map((v, i) => (
        <div key={i} style={{
          flex: 1,
          height: `${(v / max) * 100}%`,
          minHeight: 2,
          background: color,
          opacity: 0.2 + (v / max) * 0.8,
          borderRadius: "2px 2px 0 0",
        }} />
      ))}
    </div>
  )
}

export default function Admin() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { isMobile } = useResponsive()
  const [onglet, setOnglet] = useState<Onglet>("Vue d'ensemble")
  const [annonces, setAnnonces] = useState<any[]>([])
  const [profils, setProfils] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [signalements, setSignalements] = useState<any[]>([])
  const [signalStatutFilter, setSignalStatutFilter] = useState<"ouvert" | "traite" | "rejete" | "all">("ouvert")
  const [contacts, setContacts] = useState<any[]>([])
  const [contactFilter, setContactFilter] = useState<ContactStatut | "all">("ouvert")
  const [contactExpanded, setContactExpanded] = useState<number | null>(null)
  const [contactReponse, setContactReponse] = useState<Record<number, string>>({})
  const [convThread, setConvThread] = useState<{ a: string; b: string; annonceId?: number | null; messages: any[] } | null>(null)
  const [loadingThread, setLoadingThread] = useState(false)
  // Modération vitrine — sélection multiple pour bulk flag is_test
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  useEffect(() => {
    if (status === "authenticated" && !session?.user?.isAdmin) router.replace("/")
    if (status === "authenticated" && session?.user?.isAdmin) loadData()
  }, [status, session, router])

  async function loadData() {
    setLoading(true)
    // V12 (Paul 2026-04-28) — sécurité : les 4 SELECT bruts (annonces,
    // profils, users, messages) faits avec la clé anon ont été migrés
    // vers /api/admin/dashboard (server-side, supabaseAdmin + is_admin
    // gating). Empêche un attaquant non-admin d'exfiltrer dossier_docs
    // (CNI, fiches paie) avec la clé anon publique du bundle.
    try {
      const res = await fetch("/api/admin/dashboard")
      const json = await res.json()
      if (res.ok && json.success) {
        setAnnonces(json.annonces || [])
        setProfils(json.profils || [])
        setUsers(json.users || [])
        setMessages(json.messages || [])
      } else if (res.status === 403) {
        router.replace("/")
        return
      }
    } catch (e) {
      console.error("[admin loadData]", e)
    }
    setLoading(false)
    loadSignalements(signalStatutFilter)
    loadContacts(contactFilter)
  }

  async function loadContacts(statut: ContactStatut | "all") {
    try {
      const res = await fetch(`/api/contact?statut=${statut}`)
      const json = await res.json()
      if (res.ok && json.success) setContacts(json.contacts || [])
    } catch { /* silencieux */ }
  }

  async function openConversation(a: string, b: string, annonceId?: number | null) {
    setConvThread({ a, b, annonceId, messages: [] })
    setLoadingThread(true)
    try {
      // V12 — lecture des threads via /api/admin/messages (server-side,
      // is_admin gating). Avant : supabase anon direct sans contrôle.
      const params = new URLSearchParams({ a, b })
      if (annonceId) params.set("annonceId", String(annonceId))
      const res = await fetch(`/api/admin/messages?${params.toString()}`)
      const json = await res.json()
      if (res.ok && json.success) {
        setConvThread({ a, b, annonceId, messages: json.messages || [] })
      } else {
        setConvThread({ a, b, annonceId, messages: [] })
      }
    } finally {
      setLoadingThread(false)
    }
  }

  async function patchContact(id: number, patch: { statut?: ContactStatut; reponse?: string | null; prendre_en_charge?: boolean }) {
    try {
      const res = await fetch(`/api/contact/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (res.ok) loadContacts(contactFilter)
    } catch { /* noop */ }
  }

  async function loadSignalements(statut: "ouvert" | "traite" | "rejete" | "all") {
    try {
      const res = await fetch(`/api/signalements?statut=${statut}`)
      const json = await res.json()
      if (res.ok && json.success) setSignalements(json.signalements || [])
    } catch { /* silencieux */ }
  }

  async function traiterSignalement(id: number, nouveauStatut: "traite" | "rejete" | "ouvert") {
    try {
      const res = await fetch(`/api/signalements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut: nouveauStatut }),
      })
      if (res.ok) {
        setSignalements(signalements.filter(s => s.id !== id || signalStatutFilter === "all"))
        if (signalStatutFilter === "all") {
          setSignalements(signalements.map(s => s.id === id ? { ...s, statut: nouveauStatut } : s))
        }
      }
    } catch { /* noop */ }
  }

  // Toggle is_test sur une annonce (action individuelle ligne par ligne).
  // Optimistic update : refletée localement avant le retour DB pour ne pas
  // bloquer la modération par à-coups.
  // V12 — passe par /api/admin/annonces (PATCH) au lieu de supabase anon.
  async function toggleTest(id: number, current: boolean) {
    const next = !current
    setAnnonces(prev => prev.map(a => a.id === id ? { ...a, is_test: next } : a))
    try {
      const res = await fetch("/api/admin/annonces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id], is_test: next }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        setAnnonces(prev => prev.map(a => a.id === id ? { ...a, is_test: current } : a))
        alert(`Erreur modération : ${json.error || res.statusText}`)
      }
    } catch (e) {
      setAnnonces(prev => prev.map(a => a.id === id ? { ...a, is_test: current } : a))
      alert(`Erreur modération : ${e instanceof Error ? e.message : "réseau"}`)
    }
  }

  // Bulk : flag/unflag is_test sur les annonces sélectionnées.
  // `mode` détermine la cible — toujours appliquer le même état pour
  // éviter les confusions (cocher = test ; décocher = public).
  // V12 — passe par /api/admin/annonces (PATCH).
  async function toggleTestBulk(mode: "test" | "public") {
    if (selectedIds.size === 0 || bulkBusy) return
    setBulkBusy(true)
    const ids = Array.from(selectedIds)
    const next = mode === "test"
    // Optimistic
    setAnnonces(prev => prev.map(a => ids.includes(a.id) ? { ...a, is_test: next } : a))
    try {
      const res = await fetch("/api/admin/annonces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, is_test: next }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        setAnnonces(prev => prev.map(a => ids.includes(a.id) ? { ...a, is_test: !next } : a))
        alert(`Erreur bulk : ${json.error || res.statusText}`)
      } else {
        setSelectedIds(new Set())
      }
    } catch (e) {
      setAnnonces(prev => prev.map(a => ids.includes(a.id) ? { ...a, is_test: !next } : a))
      alert(`Erreur bulk : ${e instanceof Error ? e.message : "réseau"}`)
    }
    setBulkBusy(false)
  }

  async function supprimerAnnonce(id: number) {
    const res = await fetch(`/api/annonces/${id}`, { method: "DELETE" })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      alert(`Suppression échouée : ${json.error || res.statusText}`)
      return
    }
    setAnnonces(annonces.filter(a => a.id !== id))
    setConfirmId(null)
  }

  // V12 — toutes les mutations users (suppression, is_admin, ban) passent
  // désormais par /api/admin/users (server-side, is_admin gating + zod
  // validation + garde-fous self-action). Avant : supabase anon direct
  // permettait à un attaquant de s'élever en admin ou supprimer/bannir.
  async function supprimerUtilisateur(email: string) {
    try {
      const res = await fetch(`/api/admin/users?email=${encodeURIComponent(email)}`, { method: "DELETE" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        alert(`Suppression échouée : ${json.error || res.statusText}`)
        return
      }
      setProfils(profils.filter(p => p.email !== email))
      setUsers(users.filter(u => u.email !== email))
      setConfirmId(null)
    } catch (e) {
      alert(`Erreur suppression : ${e instanceof Error ? e.message : "réseau"}`)
    }
  }

  async function togglerAdmin(email: string, current: boolean) {
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "toggle_admin", email, is_admin: !current }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        alert(`Erreur : ${json.error || res.statusText}`)
        return
      }
      setUsers(users.map(u => u.email === email ? { ...u, is_admin: !current } : u))
    } catch (e) {
      alert(`Erreur : ${e instanceof Error ? e.message : "réseau"}`)
    }
  }

  async function bannirUser(email: string) {
    const raison = prompt("Motif du bannissement (obligatoire) :")
    if (!raison || !raison.trim()) return
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "ban", email, ban_reason: raison.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        alert(`Erreur bannissement : ${json.error || res.statusText}`)
        return
      }
      setUsers(users.map(u => u.email === email ? { ...u, is_banned: true, ban_reason: raison.trim() } : u))
    } catch (e) {
      alert(`Erreur bannissement : ${e instanceof Error ? e.message : "réseau"}`)
    }
  }

  async function debannirUser(email: string) {
    if (!confirm("Débannir cet utilisateur ? Il pourra à nouveau se connecter.")) return
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "unban", email }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        alert(`Erreur débannissement : ${json.error || res.statusText}`)
        return
      }
      setUsers(users.map(u => u.email === email ? { ...u, is_banned: false, ban_reason: null } : u))
    } catch (e) {
      alert(`Erreur débannissement : ${e instanceof Error ? e.message : "réseau"}`)
    }
  }

  const trendAnnonces = useMemo(() => trendLast30Days(annonces, "created_at"), [annonces])
  const trendUsers = useMemo(() => trendLast30Days(users, "created_at"), [users])
  const trendMessages = useMemo(() => trendLast30Days(messages, "created_at"), [messages])

  const annoncesFiltrees = useMemo(() => {
    if (!search.trim()) return annonces
    const q = search.toLowerCase()
    return annonces.filter(a =>
      (a.titre || "").toLowerCase().includes(q) ||
      (a.ville || "").toLowerCase().includes(q) ||
      (a.proprietaire_email || "").toLowerCase().includes(q)
    )
  }, [annonces, search])

  const usersFiltres = useMemo(() => {
    if (!search.trim()) return users
    const q = search.toLowerCase()
    return users.filter(u => (u.email || "").toLowerCase().includes(q) || (u.name || "").toLowerCase().includes(q))
  }, [users, search])

  const messagesFiltres = useMemo(() => {
    if (!search.trim()) return messages
    const q = search.toLowerCase()
    return messages.filter(m =>
      (m.from_email || "").toLowerCase().includes(q) ||
      (m.to_email || "").toLowerCase().includes(q) ||
      (m.contenu || "").toLowerCase().includes(q)
    )
  }, [messages, search])

  if (status === "loading" || (status === "authenticated" && loading)) {
    return <main style={{ minHeight: "100vh", background: "#F7F4EF", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
      <p style={{ color: "#8a8477" }}>Chargement...</p>
    </main>
  }
  if (!session?.user?.isAdmin) return null

  const statuts = ["disponible", "loué", "en visite", "réservé"]
  const inputStyle: React.CSSProperties = { padding: "8px 14px", border: "1px solid #EAE6DF", borderRadius: 10, fontSize: 16, outline: "none", fontFamily: "inherit" }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? "20px 14px" : "32px 40px" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.5px" }}>Administration</h1>
            <p style={{ color: "#8a8477", marginTop: 4, fontSize: 13 }}>KeyMatch · Connecté : {session.user.email}</p>
          </div>
          <button onClick={loadData} style={{ background: "white", border: "1px solid #EAE6DF", color: "#111", borderRadius: 999, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Rafraîchir
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Utilisateurs", val: users.length, color: "#111" },
            { label: "Annonces", val: annonces.length, color: "#111" },
            { label: "Annonces actives", val: annonces.filter(a => !a.statut || a.statut === "disponible").length, color: "#15803d" },
            { label: "Biens loués", val: annonces.filter(a => a.statut === "loué").length, color: "#8a8477" },
            { label: "Messages", val: messages.length, color: "#111" },
          ].map(k => (
            <div key={k.label} style={{ background: "white", borderRadius: 16, padding: "18px 22px" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: k.color, letterSpacing: "-0.5px" }}>{k.val}</div>
              <div style={{ fontSize: 12, color: "#8a8477", marginTop: 4 }}>{k.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 20, background: "white", borderRadius: 14, padding: 6, overflowX: "auto" }}>
          {ONGLETS.map(o => (
            <button key={o} onClick={() => { setOnglet(o); setSearch(""); setConfirmId(null) }}
              style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit", whiteSpace: "nowrap", background: onglet === o ? "#111" : "transparent", color: onglet === o ? "white" : "#8a8477" }}>
              {o}
            </button>
          ))}
        </div>

        {["Annonces", "Utilisateurs", "Messages"].includes(onglet) && (
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={`Rechercher dans ${onglet.toLowerCase()}...`}
              style={{ ...inputStyle, flex: "1 1 280px", maxWidth: 400 }} />
            <button onClick={() => {
              if (onglet === "Annonces") exportCSV(annoncesFiltrees, "annonces.csv")
              else if (onglet === "Utilisateurs") exportCSV(usersFiltres, "utilisateurs.csv")
              else if (onglet === "Messages") exportCSV(messagesFiltres, "messages.csv")
            }}
              style={{ background: "white", border: "1px solid #EAE6DF", color: "#111", borderRadius: 999, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Exporter CSV
            </button>
          </div>
        )}

        {onglet === "Vue d'ensemble" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            <div style={{ background: "white", borderRadius: 20, padding: 24 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.5px" }}>Inscriptions (30 j.)</p>
              <p style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px", color: "#111", marginTop: 2, marginBottom: 12 }}>{trendUsers.reduce((s, v) => s + v, 0)}</p>
              <MiniBars values={trendUsers} color="#111" />
            </div>
            <div style={{ background: "white", borderRadius: 20, padding: 24 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.5px" }}>Annonces publiées (30 j.)</p>
              <p style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px", color: "#15803d", marginTop: 2, marginBottom: 12 }}>{trendAnnonces.reduce((s, v) => s + v, 0)}</p>
              <MiniBars values={trendAnnonces} color="#15803d" />
            </div>
            <div style={{ background: "white", borderRadius: 20, padding: 24 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.5px" }}>Messages (30 j.)</p>
              <p style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px", color: "#1d4ed8", marginTop: 2, marginBottom: 12 }}>{trendMessages.reduce((s, v) => s + v, 0)}</p>
              <MiniBars values={trendMessages} color="#1d4ed8" />
            </div>
            <div style={{ background: "white", borderRadius: 20, padding: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 14 }}>Annonces par statut</h3>
              {statuts.map(s => {
                const count = annonces.filter(a => (a.statut || "disponible") === s).length
                const pct = annonces.length > 0 ? Math.round(count / annonces.length * 100) : 0
                return (
                  <div key={s} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, fontSize: 13 }}>
                      <span style={{ textTransform: "capitalize", color: "#111" }}>{s}</span>
                      <span style={{ fontWeight: 700 }}>{count} ({pct}%)</span>
                    </div>
                    <div style={{ background: "#F7F4EF", borderRadius: 999, height: 6 }}>
                      <div style={{ background: "#111", borderRadius: 999, height: 6, width: `${pct}%`, transition: "width 0.4s" }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ background: "white", borderRadius: 20, padding: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 14 }}>Top villes (profils)</h3>
              {(() => {
                const map = new Map<string, number>()
                profils.forEach(p => { if (p.ville_souhaitee) map.set(p.ville_souhaitee, (map.get(p.ville_souhaitee) || 0) + 1) })
                const top = Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6)
                return top.length === 0 ? <p style={{ fontSize: 13, color: "#8a8477" }}>Aucune donnée</p>
                  : top.map(([v, c]) => (
                    <div key={v} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                      <span style={{ color: "#111" }}>{v}</span>
                      <span style={{ fontWeight: 700 }}>{c}</span>
                    </div>
                  ))
              })()}
            </div>
          </div>
        )}

        {onglet === "Annonces" && (
          <div style={{ background: "white", borderRadius: 20, overflow: "hidden" }}>
            {/* Bulk actions — apparaissent quand au moins une ligne sélectionnée.
                Permet de modérer en masse les annonces de test sans passer par
                Supabase MCP. Toggle public/test est appliqué uniformément
                sur la sélection (UX moins ambiguë que toggle individuel). */}
            {selectedIds.size > 0 && (
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #F7F4EF", background: "#FBF6EA", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "#a16207", fontWeight: 700 }}>
                  {selectedIds.size} annonce{selectedIds.size > 1 ? "s" : ""} sélectionnée{selectedIds.size > 1 ? "s" : ""}
                </span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => toggleTestBulk("test")}
                    disabled={bulkBusy}
                    style={{ background: "#a16207", color: "white", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: bulkBusy ? "wait" : "pointer", fontFamily: "inherit" }}
                  >
                    {bulkBusy ? "…" : "Marquer comme test"}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleTestBulk("public")}
                    disabled={bulkBusy}
                    style={{ background: "#15803d", color: "white", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: bulkBusy ? "wait" : "pointer", fontFamily: "inherit" }}
                  >
                    {bulkBusy ? "…" : "Rendre public"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    disabled={bulkBusy}
                    style={{ background: "#F7F4EF", color: "#111", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Tout désélectionner
                  </button>
                </div>
              </div>
            )}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                <thead>
                  <tr style={{ background: "#F7F4EF" }}>
                    <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.5px", width: 32 }}>
                      <input
                        type="checkbox"
                        checked={annoncesFiltrees.length > 0 && annoncesFiltrees.every(a => selectedIds.has(a.id))}
                        ref={el => {
                          if (!el) return
                          const someSelected = annoncesFiltrees.some(a => selectedIds.has(a.id))
                          const allSelected = annoncesFiltrees.length > 0 && annoncesFiltrees.every(a => selectedIds.has(a.id))
                          el.indeterminate = someSelected && !allSelected
                        }}
                        onChange={e => {
                          if (e.target.checked) setSelectedIds(new Set(annoncesFiltrees.map(a => a.id as number)))
                          else setSelectedIds(new Set())
                        }}
                        aria-label="Tout sélectionner"
                        style={{ cursor: "pointer", width: 16, height: 16 }}
                      />
                    </th>
                    {["ID", "Titre", "Ville", "Prix", "Statut", "Visibilité", "Propriétaire", "Action"].map(h => (
                      <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {annoncesFiltrees.map((a, i) => {
                    const checked = selectedIds.has(a.id)
                    const isTest = !!a.is_test
                    return (
                    <tr key={a.id} style={{ borderTop: "1px solid #F7F4EF", background: checked ? "#FBF6EA" : i % 2 === 0 ? "white" : "#F7F4EF" }}>
                      <td style={{ padding: "12px 16px", width: 32 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => {
                            const next = new Set(selectedIds)
                            if (e.target.checked) next.add(a.id)
                            else next.delete(a.id)
                            setSelectedIds(next)
                          }}
                          aria-label={`Sélectionner annonce ${a.id}`}
                          style={{ cursor: "pointer", width: 16, height: 16 }}
                        />
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#8a8477", fontFamily: "monospace" }}>#{a.id}</td>
                      <td style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <a href={`/annonces/${a.id}`} target="_blank" rel="noopener noreferrer" style={{ color: "#111", textDecoration: "none" }}>{a.titre || "—"}</a>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "#8a8477" }}>{a.ville || "—"}</td>
                      <td style={{ padding: "12px 16px", fontSize: 14, fontWeight: 700 }}>{a.prix ? `${a.prix} €` : "—"}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ background: a.statut === "loué" ? "#F7F4EF" : "#F0FAEE", color: a.statut === "loué" ? "#8a8477" : "#15803d", padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                          {a.statut || "disponible"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <button
                          type="button"
                          onClick={() => toggleTest(a.id, isTest)}
                          title={isTest ? "Cliquer pour rendre publique" : "Cliquer pour marquer comme test"}
                          style={{
                            background: isTest ? "#FBF6EA" : "#F0FAEE",
                            color: isTest ? "#a16207" : "#15803d",
                            border: `1px solid ${isTest ? "#EADFC6" : "#C6E9C0"}`,
                            borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700,
                            cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.3px",
                            textTransform: "uppercase",
                          }}
                        >
                          {isTest ? "Test" : "Public"}
                        </button>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#8a8477", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.proprietaire_email || "—"}</td>
                      <td style={{ padding: "12px 16px" }}>
                        {confirmId === `annonce-${a.id}` ? (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => supprimerAnnonce(a.id)} style={{ background: "#b91c1c", color: "white", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Confirmer</button>
                            <button onClick={() => setConfirmId(null)} style={{ background: "#F7F4EF", color: "#111", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmId(`annonce-${a.id}`)} style={{ background: "#FEECEC", color: "#b91c1c", border: "none", borderRadius: 8, padding: "5px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                            Supprimer
                          </button>
                        )}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {onglet === "Utilisateurs" && (
          <div style={{ background: "white", borderRadius: 20, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                <thead>
                  <tr style={{ background: "#F7F4EF" }}>
                    {["Nom", "Email", "Rôle", "Admin", "Inscription", "Actions"].map(h => (
                      <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usersFiltres.map((u, i) => (
                    <tr key={u.id || u.email} style={{ borderTop: "1px solid #F7F4EF", background: i % 2 === 0 ? "white" : "#F7F4EF" }}>
                      <td style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600 }}>{u.name || displayName(u.email)}</td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#8a8477" }}>{u.email}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ background: u.role === "proprietaire" ? "#EEF3FB" : "#F7F4EF", color: u.role === "proprietaire" ? "#1d4ed8" : "#8a8477", padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                          {u.role || "locataire"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {u.is_admin && <span style={{ background: "#111", color: "white", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700 }}>Admin</span>}
                          {u.is_banned && <span style={{ background: "#FEECEC", color: "#b91c1c", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700 }} title={u.ban_reason || ""}>Banni</span>}
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#8a8477" }}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString("fr-FR") : "—"}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {u.email !== session.user.email && (
                            <>
                              <button onClick={() => togglerAdmin(u.email, !!u.is_admin)}
                                style={{ background: u.is_admin ? "#fef3c7" : "#F0FAEE", color: u.is_admin ? "#a16207" : "#15803d", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                                {u.is_admin ? "Retirer admin" : "Promouvoir admin"}
                              </button>
                              {u.is_banned ? (
                                <button onClick={() => debannirUser(u.email)}
                                  style={{ background: "#F0FAEE", color: "#15803d", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                                  Débannir
                                </button>
                              ) : (
                                <button onClick={() => bannirUser(u.email)}
                                  style={{ background: "#FBF6EA", color: "#a16207", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                                  Bannir
                                </button>
                              )}
                            </>
                          )}
                          {confirmId === `user-${u.email}` ? (
                            <>
                              <button onClick={() => supprimerUtilisateur(u.email)} style={{ background: "#b91c1c", color: "white", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Confirmer</button>
                              <button onClick={() => setConfirmId(null)} style={{ background: "#F7F4EF", color: "#111", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
                            </>
                          ) : u.email !== session.user.email && (
                            <button onClick={() => setConfirmId(`user-${u.email}`)} style={{ background: "#FEECEC", color: "#b91c1c", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                              Supprimer
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {onglet === "Messages" && (
          <div style={{ background: "white", borderRadius: 20, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
                <thead>
                  <tr style={{ background: "#F7F4EF" }}>
                    {["De", "À", "Message", "Date", "Lu", ""].map(h => (
                      <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {messagesFiltres.map((m, i) => (
                    <tr key={m.id} style={{ borderTop: "1px solid #F7F4EF", background: i % 2 === 0 ? "white" : "#F7F4EF" }}>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#8a8477" }}>{m.from_email}</td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#8a8477" }}>{m.to_email}</td>
                      <td style={{ padding: "12px 16px", fontSize: 13, maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.contenu}</td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#8a8477" }}>{new Date(m.created_at).toLocaleDateString("fr-FR")}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ background: m.lu ? "#F0FAEE" : "#FEECEC", color: m.lu ? "#15803d" : "#b91c1c", padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                          {m.lu ? "Lu" : "Non lu"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <button onClick={() => openConversation(m.from_email, m.to_email, m.annonce_id ?? null)}
                          style={{ background: "#111", color: "white", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                          Voir thread
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {onglet === "SEO" && (() => {
          const annoncesAvecSeo = annonces.map(a => ({ ...a, _seo: seoScore(a) }))
          const parfaites = annoncesAvecSeo.filter(a => a._seo.score === 100).length
          const aAmeliorer = annoncesAvecSeo.filter(a => a._seo.score < 60).length
          const moyenneSeo = annoncesAvecSeo.length > 0 ? Math.round(annoncesAvecSeo.reduce((acc, a) => acc + a._seo.score, 0) / annoncesAvecSeo.length) : 0

          return (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 }}>
                {[
                  { label: "Score SEO moyen", val: `${moyenneSeo}%`, color: moyenneSeo >= 80 ? "#15803d" : moyenneSeo >= 60 ? "#a16207" : "#b91c1c" },
                  { label: "Annonces parfaites", val: parfaites, color: "#15803d" },
                  { label: "À améliorer", val: aAmeliorer, color: aAmeliorer > 0 ? "#b91c1c" : "#15803d" },
                  { label: "Total", val: annonces.length, color: "#111" },
                ].map(k => (
                  <div key={k.label} style={{ background: "white", borderRadius: 16, padding: "18px 22px" }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: k.color }}>{k.val}</div>
                    <div style={{ fontSize: 12, color: "#8a8477", marginTop: 4 }}>{k.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: "white", borderRadius: 16, padding: "14px 22px", marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>Fichiers :</span>
                <a href={`${BASE_URL}/sitemap.xml`} target="_blank" rel="noopener noreferrer" style={{ background: "#F7F4EF", color: "#111", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>sitemap.xml ↗</a>
                <a href={`${BASE_URL}/robots.txt`} target="_blank" rel="noopener noreferrer" style={{ background: "#F7F4EF", color: "#111", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>robots.txt ↗</a>
              </div>
              <div style={{ background: "white", borderRadius: 20, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                    <thead>
                      <tr style={{ background: "#F7F4EF" }}>
                        {["Score", "Titre", "Ville", "Description", "Photos", "Problèmes", ""].map(h => (
                          <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {annoncesAvecSeo.sort((a, b) => a._seo.score - b._seo.score).map((a, i) => {
                        const { score, issues } = a._seo
                        const scoreColor = score === 100 ? "#15803d" : score >= 60 ? "#a16207" : "#b91c1c"
                        const scoreBg = score === 100 ? "#F0FAEE" : score >= 60 ? "#FBF6EA" : "#FEECEC"
                        const photos: string[] = Array.isArray(a.photos) ? a.photos : []
                        return (
                          <tr key={a.id} style={{ borderTop: "1px solid #F7F4EF", background: i % 2 === 0 ? "white" : "#F7F4EF" }}>
                            <td style={{ padding: "12px 16px" }}><span style={{ background: scoreBg, color: scoreColor, padding: "4px 10px", borderRadius: 999, fontSize: 13, fontWeight: 800 }}>{score}%</span></td>
                            <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.titre || <em style={{ color: "#b91c1c" }}>Manquant</em>}</td>
                            <td style={{ padding: "12px 16px", fontSize: 12, color: a.ville ? "#8a8477" : "#b91c1c" }}>{a.ville || "—"}</td>
                            <td style={{ padding: "12px 16px", fontSize: 12 }}>
                              {a.description ? <span style={{ color: a.description.length >= 80 ? "#15803d" : "#a16207" }}>{a.description.length} car.</span> : <span style={{ color: "#b91c1c" }}>Manquante</span>}
                            </td>
                            <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: photos.length > 0 ? "#15803d" : "#b91c1c" }}>{photos.length}</td>
                            <td style={{ padding: "12px 16px", maxWidth: 240 }}>
                              {issues.length === 0 ? <span style={{ color: "#15803d", fontSize: 12, fontWeight: 700 }}>Parfait</span> : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                  {issues.map(issue => <span key={issue} style={{ fontSize: 11, color: "#b91c1c", background: "#FEECEC", padding: "2px 7px", borderRadius: 4, width: "fit-content" }}>{issue}</span>)}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: "12px 16px" }}>
                              <a href={`/annonces/${a.id}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>Voir ↗</a>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )
        })()}

        {onglet === "Signalements" && (
          <div>
            <div style={{ display: "flex", gap: 6, marginBottom: 16, background: "white", borderRadius: 12, padding: 4, width: "fit-content" }}>
              {(["ouvert", "traite", "rejete", "all"] as const).map(f => (
                <button key={f} onClick={() => { setSignalStatutFilter(f); loadSignalements(f) }}
                  style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 12, fontFamily: "inherit", background: signalStatutFilter === f ? "#111" : "transparent", color: signalStatutFilter === f ? "white" : "#8a8477" }}>
                  {f === "ouvert" ? "Ouverts" : f === "traite" ? "Traités" : f === "rejete" ? "Rejetés" : "Tous"}
                </button>
              ))}
            </div>

            {signalements.length === 0 ? (
              <div style={{ background: "white", borderRadius: 20, padding: 48, textAlign: "center" }}>
                <p style={{ fontSize: 16, fontWeight: 600, color: "#111", marginBottom: 4 }}>Aucun signalement {signalStatutFilter === "ouvert" ? "ouvert" : signalStatutFilter === "traite" ? "traité" : signalStatutFilter === "rejete" ? "rejeté" : ""}</p>
                <p style={{ fontSize: 13, color: "#8a8477" }}>Rien à modérer pour l&apos;instant.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {signalements.map(s => {
                  const statutColor = s.statut === "ouvert" ? "#a16207" : s.statut === "traite" ? "#15803d" : "#8a8477"
                  const statutBg = s.statut === "ouvert" ? "#FBF6EA" : s.statut === "traite" ? "#F0FAEE" : "#F7F4EF"
                  const targetUrl = s.type === "annonce" ? `/annonces/${s.target_id}` : s.type === "user" ? `/admin` : "/messages"
                  return (
                    <div key={s.id} style={{ background: "white", borderRadius: 16, padding: 20, display: "flex", gap: 16, flexWrap: "wrap", borderLeft: `4px solid ${statutColor}` }}>
                      <div style={{ flex: 1, minWidth: 240 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                          <span style={{ background: statutBg, color: statutColor, padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                            {s.statut}
                          </span>
                          <span style={{ background: "#F7F4EF", color: "#111", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                            {s.type}
                          </span>
                          <span style={{ fontSize: 11, color: "#8a8477" }}>
                            {new Date(s.created_at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{getRaisonLabel(s.raison)}</p>
                        {s.description && (
                          <p style={{ fontSize: 13, color: "#111", lineHeight: 1.5, marginBottom: 8, fontStyle: "italic", background: "#F7F4EF", padding: "8px 12px", borderRadius: 8 }}>
                            &laquo; {s.description} &raquo;
                          </p>
                        )}
                        <p style={{ fontSize: 12, color: "#8a8477", marginTop: 6 }}>
                          Signalé par <strong>{displayName(s.signale_par)}</strong> · Cible : <a href={targetUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1d4ed8", textDecoration: "none", fontWeight: 600 }}>{s.type === "annonce" ? `Annonce #${s.target_id}` : s.type === "user" ? s.target_id : `Message #${s.target_id}`}</a>
                        </p>
                        {s.traite_par && (
                          <p style={{ fontSize: 11, color: "#8a8477", marginTop: 4 }}>
                            Traité par {s.traite_par} le {new Date(s.traite_at).toLocaleDateString("fr-FR")}
                          </p>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "flex-start" }}>
                        {s.statut === "ouvert" ? (
                          <>
                            <button onClick={() => traiterSignalement(s.id, "traite")}
                              style={{ background: "#111", color: "white", border: "none", borderRadius: 999, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                              Marquer traité
                            </button>
                            <button onClick={() => traiterSignalement(s.id, "rejete")}
                              style={{ background: "white", color: "#8a8477", border: "1px solid #EAE6DF", borderRadius: 999, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                              Rejeter
                            </button>
                          </>
                        ) : (
                          <button onClick={() => traiterSignalement(s.id, "ouvert")}
                            style={{ background: "white", color: "#a16207", border: "1px solid #EADFC6", borderRadius: 999, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                            Rouvrir
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {onglet === "Contact" && (
          <div>
            <div style={{ display: "flex", gap: 6, marginBottom: 16, background: "white", borderRadius: 12, padding: 4, width: "fit-content" }}>
              {(["ouvert", "en_cours", "resolu", "all"] as const).map(f => (
                <button key={f} onClick={() => { setContactFilter(f); loadContacts(f) }}
                  style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 12, fontFamily: "inherit", background: contactFilter === f ? "#111" : "transparent", color: contactFilter === f ? "white" : "#8a8477" }}>
                  {f === "ouvert" ? "Ouverts" : f === "en_cours" ? "En cours" : f === "resolu" ? "Résolus" : "Tous"}
                </button>
              ))}
            </div>

            {contacts.length === 0 ? (
              <div style={{ background: "white", borderRadius: 20, padding: 48, textAlign: "center" }}>
                <p style={{ fontSize: 16, fontWeight: 600, color: "#111", marginBottom: 4 }}>Aucun message</p>
                <p style={{ fontSize: 13, color: "#8a8477" }}>Les messages reçus via /contact apparaîtront ici.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {contacts.map(c => {
                  const s = CONTACT_STATUTS[c.statut as ContactStatut] ?? CONTACT_STATUTS.ouvert
                  const expanded = contactExpanded === c.id
                  const mine = c.assigne_a && c.assigne_a === session.user.email
                  return (
                    <div key={c.id} style={{ background: "white", borderRadius: 16, padding: 20, borderLeft: `4px solid ${s.color}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: 240 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                            <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                              {s.label}
                            </span>
                            <span style={{ background: "#F7F4EF", color: "#111", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                              {getSujetLabel(c.sujet)}
                            </span>
                            <span style={{ fontSize: 11, color: "#8a8477" }}>
                              {new Date(c.created_at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </span>
                            {c.assigne_a && (
                              <span style={{ background: mine ? "#F0FAEE" : "#EEF3FB", color: mine ? "#15803d" : "#1d4ed8", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                                {mine ? "Pris par vous" : `Pris par ${c.assigne_a}`}
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: 15, fontWeight: 800, marginBottom: 2 }}>{c.nom}</p>
                          <p style={{ fontSize: 12, color: "#8a8477", marginBottom: 10 }}>
                            <a href={`mailto:${c.email}`} style={{ color: "#1d4ed8", textDecoration: "none" }}>{c.email}</a>
                          </p>
                          <p style={{ fontSize: 14, color: "#111", lineHeight: 1.6, whiteSpace: "pre-wrap", background: "#F7F4EF", padding: "12px 14px", borderRadius: 10 }}>
                            {expanded || c.message.length <= 280 ? c.message : c.message.slice(0, 280) + "…"}
                          </p>
                          {c.message.length > 280 && (
                            <button onClick={() => setContactExpanded(expanded ? null : c.id)}
                              style={{ marginTop: 6, background: "none", border: "none", color: "#1d4ed8", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                              {expanded ? "Réduire" : "Voir tout"}
                            </button>
                          )}
                          {c.reponse && (
                            <p style={{ fontSize: 13, color: "#8a8477", marginTop: 10, fontStyle: "italic", borderLeft: "3px solid #EAE6DF", paddingLeft: 10 }}>
                              <strong>Note interne :</strong> {c.reponse}
                            </p>
                          )}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, minWidth: 160 }}>
                          {!c.assigne_a && c.statut !== "resolu" && (
                            <button onClick={() => patchContact(c.id, { prendre_en_charge: true })}
                              style={{ background: "#111", color: "white", border: "none", borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                              Prendre en charge
                            </button>
                          )}
                          {c.statut === "ouvert" && (
                            <button onClick={() => patchContact(c.id, { statut: "en_cours" })}
                              style={{ background: "white", color: "#1d4ed8", border: "1px solid #D7E3F4", borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                              Marquer en cours
                            </button>
                          )}
                          {c.statut !== "resolu" && (
                            <button onClick={() => patchContact(c.id, { statut: "resolu" })}
                              style={{ background: "#F0FAEE", color: "#15803d", border: "none", borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                              Marquer résolu
                            </button>
                          )}
                          {c.statut === "resolu" && (
                            <button onClick={() => patchContact(c.id, { statut: "ouvert" })}
                              style={{ background: "white", color: "#a16207", border: "1px solid #EADFC6", borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                              Rouvrir
                            </button>
                          )}
                          <a href={`mailto:${c.email}?subject=Re: ${getSujetLabel(c.sujet)}`}
                            style={{ background: "white", color: "#111", border: "1px solid #EAE6DF", borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 700, textDecoration: "none", textAlign: "center", fontFamily: "inherit" }}>
                            Répondre par email
                          </a>
                        </div>
                      </div>
                      <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          type="text"
                          placeholder="Ajouter une note interne…"
                          value={contactReponse[c.id] ?? c.reponse ?? ""}
                          onChange={e => setContactReponse({ ...contactReponse, [c.id]: e.target.value })}
                          style={{ flex: 1, padding: "8px 12px", border: "1px solid #EAE6DF", borderRadius: 10, fontSize: 13, outline: "none", fontFamily: "inherit" }}
                        />
                        <button
                          onClick={() => patchContact(c.id, { reponse: (contactReponse[c.id] ?? "").trim() || null })}
                          style={{ background: "#111", color: "white", border: "none", borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          Sauver
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {onglet === "Activité" && (() => {
          type Event = { label: string; date: string; meta?: string; color: string }
          const events: Event[] = []
          users.slice(0, 30).forEach(u => u.created_at && events.push({
            label: `Inscription : ${u.name || displayName(u.email)}`,
            date: u.created_at, meta: u.email, color: "#111",
          }))
          annonces.slice(0, 30).forEach(a => a.created_at && events.push({
            label: `Annonce publiée : ${a.titre || "Sans titre"}`,
            date: a.created_at, meta: `${a.ville || "—"} · ${a.prix || "?"} €`, color: "#15803d",
          }))
          messages.slice(0, 30).forEach(m => events.push({
            label: `Message de ${displayName(m.from_email)} à ${displayName(m.to_email)}`,
            date: m.created_at, meta: (m.contenu || "").slice(0, 60), color: "#1d4ed8",
          }))
          const sorted = events.filter(e => e.date).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 60)

          return (
            <div style={{ background: "white", borderRadius: 20, padding: "24px 28px" }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>Derniers événements</h3>
              {sorted.length === 0 ? <p style={{ color: "#8a8477", fontSize: 13 }}>Aucune activité.</p> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {sorted.map((e, i) => (
                    <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "8px 0", borderBottom: i < sorted.length - 1 ? "1px solid #F7F4EF" : "none" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: e.color, marginTop: 7, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{e.label}</p>
                        {e.meta && <p style={{ fontSize: 12, color: "#8a8477", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.meta}</p>}
                      </div>
                      <p style={{ fontSize: 11, color: "#8a8477", whiteSpace: "nowrap", flexShrink: 0 }}>
                        {new Date(e.date).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

      </div>

      {/* Modale : thread de conversation complet entre 2 utilisateurs */}
      {convThread && (
        <>
          <div onClick={() => setConvThread(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9000 }} />
          <div role="dialog" aria-modal="true"
            style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", background: "white", borderRadius: 20, padding: 0, width: "min(720px, 94vw)", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.25)", zIndex: 9001, fontFamily: "'DM Sans', sans-serif", overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #F7F4EF", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.5px" }}>Conversation</p>
                <p style={{ fontSize: 14, fontWeight: 700, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {convThread.a} &nbsp;↔&nbsp; {convThread.b}
                </p>
                {convThread.annonceId && (
                  <p style={{ fontSize: 12, color: "#8a8477", marginTop: 2 }}>
                    Annonce <a href={`/annonces/${convThread.annonceId}`} target="_blank" rel="noopener noreferrer" style={{ color: "#1d4ed8", textDecoration: "none" }}>#{convThread.annonceId}</a>
                  </p>
                )}
              </div>
              <button onClick={() => setConvThread(null)}
                style={{ background: "#F7F4EF", border: "none", borderRadius: 999, width: 32, height: 32, fontSize: 16, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                ×
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px", background: "#F7F4EF", display: "flex", flexDirection: "column", gap: 8 }}>
              {loadingThread ? (
                <p style={{ textAlign: "center", color: "#8a8477", padding: 40 }}>Chargement…</p>
              ) : convThread.messages.length === 0 ? (
                <p style={{ textAlign: "center", color: "#8a8477", padding: 40 }}>Aucun message dans cette conversation.</p>
              ) : convThread.messages.map(m => {
                const mine = m.from_email === convThread.a
                return (
                  <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-start" : "flex-end" }}>
                    <div style={{ maxWidth: "75%", background: mine ? "white" : "#111", color: mine ? "#111" : "white", padding: "10px 14px", borderRadius: 14, border: mine ? "1px solid #EAE6DF" : "none" }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: mine ? "#8a8477" : "#8a8477", marginBottom: 4 }}>
                        {m.from_email}
                      </p>
                      <p style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", margin: 0 }}>{m.contenu}</p>
                      <p style={{ fontSize: 10, color: mine ? "#8a8477" : "#EAE6DF", marginTop: 4 }}>
                        {new Date(m.created_at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {m.lu && " · Lu"}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ padding: "12px 24px", borderTop: "1px solid #F7F4EF", fontSize: 12, color: "#8a8477", textAlign: "center" }}>
              {convThread.messages.length} message(s) · Vue admin en lecture seule
            </div>
          </div>
        </>
      )}
    </main>
  )
}
