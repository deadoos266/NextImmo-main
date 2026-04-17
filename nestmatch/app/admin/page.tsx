"use client"
import { useEffect, useState, useMemo } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import { displayName } from "../../lib/privacy"

/**
 * Dashboard admin refondu.
 * Le layout parent vérifie is_admin côté serveur — ici on se concentre sur l'UX.
 */

const ONGLETS = ["Vue d'ensemble", "Annonces", "Utilisateurs", "Messages", "SEO", "Activité"] as const
type Onglet = typeof ONGLETS[number]

const BASE_URL = process.env.NEXT_PUBLIC_URL || "https://nestmatch.fr"

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
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
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
  const [onglet, setOnglet] = useState<Onglet>("Vue d'ensemble")
  const [annonces, setAnnonces] = useState<any[]>([])
  const [profils, setProfils] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (status === "authenticated" && !session?.user?.isAdmin) router.replace("/")
    if (status === "authenticated" && session?.user?.isAdmin) loadData()
  }, [status, session, router])

  async function loadData() {
    setLoading(true)
    const [{ data: a }, { data: p }, { data: u }, { data: m }] = await Promise.all([
      supabase.from("annonces").select("*").order("id", { ascending: false }),
      supabase.from("profils").select("*"),
      supabase.from("users").select("id, email, name, role, is_admin, email_verified, created_at").order("created_at", { ascending: false }),
      supabase.from("messages").select("*").order("created_at", { ascending: false }).limit(100),
    ])
    if (a) setAnnonces(a)
    if (p) setProfils(p)
    if (u) setUsers(u)
    if (m) setMessages(m)
    setLoading(false)
  }

  async function supprimerAnnonce(id: number) {
    const { error } = await supabase.from("annonces").delete().eq("id", id)
    if (!error) { setAnnonces(annonces.filter(a => a.id !== id)); setConfirmId(null) }
  }

  async function supprimerUtilisateur(email: string) {
    await supabase.from("profils").delete().eq("email", email)
    await supabase.from("users").delete().eq("email", email)
    setProfils(profils.filter(p => p.email !== email))
    setUsers(users.filter(u => u.email !== email))
    setConfirmId(null)
  }

  async function togglerAdmin(email: string, current: boolean) {
    const { error } = await supabase.from("users").update({ is_admin: !current }).eq("email", email)
    if (!error) setUsers(users.map(u => u.email === email ? { ...u, is_admin: !current } : u))
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
      <p style={{ color: "#6b7280" }}>Chargement...</p>
    </main>
  }
  if (!session?.user?.isAdmin) return null

  const statuts = ["disponible", "loué", "en visite", "réservé"]
  const inputStyle: React.CSSProperties = { padding: "8px 14px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 13, outline: "none", fontFamily: "inherit" }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 40px" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.5px" }}>Administration</h1>
            <p style={{ color: "#6b7280", marginTop: 4, fontSize: 13 }}>NestMatch · Connecté : {session.user.email}</p>
          </div>
          <button onClick={loadData} style={{ background: "white", border: "1.5px solid #e5e7eb", color: "#111", borderRadius: 999, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Rafraîchir
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Utilisateurs", val: users.length, color: "#111" },
            { label: "Annonces", val: annonces.length, color: "#111" },
            { label: "Annonces actives", val: annonces.filter(a => !a.statut || a.statut === "disponible").length, color: "#16a34a" },
            { label: "Biens loués", val: annonces.filter(a => a.statut === "loué").length, color: "#6b7280" },
            { label: "Messages", val: messages.length, color: "#111" },
          ].map(k => (
            <div key={k.label} style={{ background: "white", borderRadius: 16, padding: "18px 22px" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: k.color, letterSpacing: "-0.5px" }}>{k.val}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{k.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 20, background: "white", borderRadius: 14, padding: 6, overflowX: "auto" }}>
          {ONGLETS.map(o => (
            <button key={o} onClick={() => { setOnglet(o); setSearch(""); setConfirmId(null) }}
              style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit", whiteSpace: "nowrap", background: onglet === o ? "#111" : "transparent", color: onglet === o ? "white" : "#6b7280" }}>
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
              style={{ background: "white", border: "1.5px solid #e5e7eb", color: "#111", borderRadius: 999, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Exporter CSV
            </button>
          </div>
        )}

        {onglet === "Vue d'ensemble" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            <div style={{ background: "white", borderRadius: 20, padding: 24 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>Inscriptions (30 j.)</p>
              <p style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px", color: "#111", marginTop: 2, marginBottom: 12 }}>{trendUsers.reduce((s, v) => s + v, 0)}</p>
              <MiniBars values={trendUsers} color="#111" />
            </div>
            <div style={{ background: "white", borderRadius: 20, padding: 24 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>Annonces publiées (30 j.)</p>
              <p style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px", color: "#16a34a", marginTop: 2, marginBottom: 12 }}>{trendAnnonces.reduce((s, v) => s + v, 0)}</p>
              <MiniBars values={trendAnnonces} color="#16a34a" />
            </div>
            <div style={{ background: "white", borderRadius: 20, padding: 24 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>Messages (30 j.)</p>
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
                      <span style={{ textTransform: "capitalize", color: "#374151" }}>{s}</span>
                      <span style={{ fontWeight: 700 }}>{count} ({pct}%)</span>
                    </div>
                    <div style={{ background: "#f3f4f6", borderRadius: 999, height: 6 }}>
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
                return top.length === 0 ? <p style={{ fontSize: 13, color: "#9ca3af" }}>Aucune donnée</p>
                  : top.map(([v, c]) => (
                    <div key={v} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                      <span style={{ color: "#374151" }}>{v}</span>
                      <span style={{ fontWeight: 700 }}>{c}</span>
                    </div>
                  ))
              })()}
            </div>
          </div>
        )}

        {onglet === "Annonces" && (
          <div style={{ background: "white", borderRadius: 20, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    {["ID", "Titre", "Ville", "Prix", "Statut", "Propriétaire", "Action"].map(h => (
                      <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {annoncesFiltrees.map((a, i) => (
                    <tr key={a.id} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "white" : "#fafafa" }}>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#9ca3af", fontFamily: "monospace" }}>#{a.id}</td>
                      <td style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <a href={`/annonces/${a.id}`} target="_blank" rel="noopener noreferrer" style={{ color: "#111", textDecoration: "none" }}>{a.titre || "—"}</a>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "#6b7280" }}>{a.ville || "—"}</td>
                      <td style={{ padding: "12px 16px", fontSize: 14, fontWeight: 700 }}>{a.prix ? `${a.prix} €` : "—"}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ background: a.statut === "loué" ? "#f3f4f6" : "#dcfce7", color: a.statut === "loué" ? "#6b7280" : "#16a34a", padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                          {a.statut || "disponible"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#6b7280", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.proprietaire_email || "—"}</td>
                      <td style={{ padding: "12px 16px" }}>
                        {confirmId === `annonce-${a.id}` ? (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => supprimerAnnonce(a.id)} style={{ background: "#dc2626", color: "white", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Confirmer</button>
                            <button onClick={() => setConfirmId(null)} style={{ background: "#f3f4f6", color: "#111", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmId(`annonce-${a.id}`)} style={{ background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 8, padding: "5px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                            Supprimer
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
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
                  <tr style={{ background: "#f9fafb" }}>
                    {["Nom", "Email", "Rôle", "Admin", "Inscription", "Actions"].map(h => (
                      <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usersFiltres.map((u, i) => (
                    <tr key={u.id || u.email} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "white" : "#fafafa" }}>
                      <td style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600 }}>{u.name || displayName(u.email)}</td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#6b7280" }}>{u.email}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ background: u.role === "proprietaire" ? "#eff6ff" : "#f3f4f6", color: u.role === "proprietaire" ? "#1d4ed8" : "#6b7280", padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                          {u.role || "locataire"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        {u.is_admin && <span style={{ background: "#111", color: "white", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700 }}>Admin</span>}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#9ca3af" }}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString("fr-FR") : "—"}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {u.email !== session.user.email && (
                            <button onClick={() => togglerAdmin(u.email, !!u.is_admin)}
                              style={{ background: u.is_admin ? "#fef3c7" : "#dcfce7", color: u.is_admin ? "#92400e" : "#15803d", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                              {u.is_admin ? "Retirer admin" : "Promouvoir admin"}
                            </button>
                          )}
                          {confirmId === `user-${u.email}` ? (
                            <>
                              <button onClick={() => supprimerUtilisateur(u.email)} style={{ background: "#dc2626", color: "white", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Confirmer</button>
                              <button onClick={() => setConfirmId(null)} style={{ background: "#f3f4f6", color: "#111", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
                            </>
                          ) : u.email !== session.user.email && (
                            <button onClick={() => setConfirmId(`user-${u.email}`)} style={{ background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
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
                  <tr style={{ background: "#f9fafb" }}>
                    {["De", "À", "Message", "Date", "Lu"].map(h => (
                      <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {messagesFiltres.map((m, i) => (
                    <tr key={m.id} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "white" : "#fafafa" }}>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#6b7280" }}>{m.from_email}</td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#6b7280" }}>{m.to_email}</td>
                      <td style={{ padding: "12px 16px", fontSize: 13, maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.contenu}</td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: "#9ca3af" }}>{new Date(m.created_at).toLocaleDateString("fr-FR")}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ background: m.lu ? "#dcfce7" : "#fee2e2", color: m.lu ? "#16a34a" : "#dc2626", padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                          {m.lu ? "Lu" : "Non lu"}
                        </span>
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
                  { label: "Score SEO moyen", val: `${moyenneSeo}%`, color: moyenneSeo >= 80 ? "#16a34a" : moyenneSeo >= 60 ? "#ea580c" : "#dc2626" },
                  { label: "Annonces parfaites", val: parfaites, color: "#16a34a" },
                  { label: "À améliorer", val: aAmeliorer, color: aAmeliorer > 0 ? "#dc2626" : "#16a34a" },
                  { label: "Total", val: annonces.length, color: "#111" },
                ].map(k => (
                  <div key={k.label} style={{ background: "white", borderRadius: 16, padding: "18px 22px" }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: k.color }}>{k.val}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{k.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: "white", borderRadius: 16, padding: "14px 22px", marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>Fichiers :</span>
                <a href={`${BASE_URL}/sitemap.xml`} target="_blank" rel="noopener noreferrer" style={{ background: "#f3f4f6", color: "#111", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>sitemap.xml ↗</a>
                <a href={`${BASE_URL}/robots.txt`} target="_blank" rel="noopener noreferrer" style={{ background: "#f3f4f6", color: "#111", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>robots.txt ↗</a>
              </div>
              <div style={{ background: "white", borderRadius: 20, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                    <thead>
                      <tr style={{ background: "#f9fafb" }}>
                        {["Score", "Titre", "Ville", "Description", "Photos", "Problèmes", ""].map(h => (
                          <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {annoncesAvecSeo.sort((a, b) => a._seo.score - b._seo.score).map((a, i) => {
                        const { score, issues } = a._seo
                        const scoreColor = score === 100 ? "#16a34a" : score >= 60 ? "#ea580c" : "#dc2626"
                        const scoreBg = score === 100 ? "#dcfce7" : score >= 60 ? "#fff7ed" : "#fee2e2"
                        const photos: string[] = Array.isArray(a.photos) ? a.photos : []
                        return (
                          <tr key={a.id} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "white" : "#fafafa" }}>
                            <td style={{ padding: "12px 16px" }}><span style={{ background: scoreBg, color: scoreColor, padding: "4px 10px", borderRadius: 999, fontSize: 13, fontWeight: 800 }}>{score}%</span></td>
                            <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.titre || <em style={{ color: "#dc2626" }}>Manquant</em>}</td>
                            <td style={{ padding: "12px 16px", fontSize: 12, color: a.ville ? "#6b7280" : "#dc2626" }}>{a.ville || "—"}</td>
                            <td style={{ padding: "12px 16px", fontSize: 12 }}>
                              {a.description ? <span style={{ color: a.description.length >= 80 ? "#16a34a" : "#ea580c" }}>{a.description.length} car.</span> : <span style={{ color: "#dc2626" }}>Manquante</span>}
                            </td>
                            <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: photos.length > 0 ? "#16a34a" : "#dc2626" }}>{photos.length}</td>
                            <td style={{ padding: "12px 16px", maxWidth: 240 }}>
                              {issues.length === 0 ? <span style={{ color: "#16a34a", fontSize: 12, fontWeight: 700 }}>Parfait</span> : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                  {issues.map(issue => <span key={issue} style={{ fontSize: 11, color: "#dc2626", background: "#fee2e2", padding: "2px 7px", borderRadius: 4, width: "fit-content" }}>{issue}</span>)}
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

        {onglet === "Activité" && (() => {
          type Event = { label: string; date: string; meta?: string; color: string }
          const events: Event[] = []
          users.slice(0, 30).forEach(u => u.created_at && events.push({
            label: `Inscription : ${u.name || displayName(u.email)}`,
            date: u.created_at, meta: u.email, color: "#111",
          }))
          annonces.slice(0, 30).forEach(a => a.created_at && events.push({
            label: `Annonce publiée : ${a.titre || "Sans titre"}`,
            date: a.created_at, meta: `${a.ville || "—"} · ${a.prix || "?"} €`, color: "#16a34a",
          }))
          messages.slice(0, 30).forEach(m => events.push({
            label: `Message de ${displayName(m.from_email)} à ${displayName(m.to_email)}`,
            date: m.created_at, meta: (m.contenu || "").slice(0, 60), color: "#1d4ed8",
          }))
          const sorted = events.filter(e => e.date).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 60)

          return (
            <div style={{ background: "white", borderRadius: 20, padding: "24px 28px" }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>Derniers événements</h3>
              {sorted.length === 0 ? <p style={{ color: "#9ca3af", fontSize: 13 }}>Aucune activité.</p> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {sorted.map((e, i) => (
                    <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "8px 0", borderBottom: i < sorted.length - 1 ? "1px solid #f9fafb" : "none" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: e.color, marginTop: 7, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{e.label}</p>
                        {e.meta && <p style={{ fontSize: 12, color: "#9ca3af", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.meta}</p>}
                      </div>
                      <p style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap", flexShrink: 0 }}>
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
    </main>
  )
}
