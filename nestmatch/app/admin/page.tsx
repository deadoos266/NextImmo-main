"use client"
import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"

const ONGLETS = ["Stats", "Annonces", "Profils", "Messages", "SEO"] as const
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

  const score = Math.max(0, 100 - issues.length * 20)
  return { score, issues }
}

export default function Admin() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [onglet, setOnglet] = useState<Onglet>("Stats")
  const [annonces, setAnnonces] = useState<any[]>([])
  const [profils, setProfils] = useState<any[]>([])
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState<number | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/auth")
      return
    }
    if (status === "authenticated" && !session?.user?.isAdmin) {
      router.replace("/")
      return
    }
    if (status === "authenticated" && session?.user?.isAdmin) {
      loadData()
    }
  }, [status, session])

  async function loadData() {
    setLoading(true)
    const [{ data: a }, { data: p }, { data: m }] = await Promise.all([
      supabase.from("annonces").select("*").order("id", { ascending: false }),
      supabase.from("profils").select("*"),
      supabase.from("messages").select("*").order("created_at", { ascending: false }).limit(50),
    ])
    if (a) setAnnonces(a)
    if (p) setProfils(p)
    if (m) setMessages(m)
    setLoading(false)
  }

  async function supprimerAnnonce(id: number) {
    const { error } = await supabase.from("annonces").delete().eq("id", id)
    if (!error) {
      setAnnonces(annonces.filter(a => a.id !== id))
      setConfirm(null)
    }
  }

  async function supprimerProfil(email: string) {
    await supabase.from("profils").delete().eq("email", email)
    setProfils(profils.filter(p => p.email !== email))
  }

  if (status === "loading" || (status === "authenticated" && loading)) {
    return (
      <main style={{ minHeight: "100vh", background: "#F7F4EF", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ color: "#6b7280" }}>Chargement...</p>
      </main>
    )
  }

  if (status === "unauthenticated" || !session?.user?.isAdmin) return null

  const statuts = ["disponible", "loué", "en visite", "réservé"]

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 48px" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px" }}>Dashboard Admin</h1>
            <p style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>NestMatch — Vue complète · {session.user.email}</p>
          </div>
        </div>

        {/* Stats rapides */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
          {[
            { label: "Annonces", val: annonces.length },
            { label: "Profils locataires", val: profils.length },
            { label: "Messages", val: messages.length },
            { label: "Annonces actives", val: annonces.filter(a => !a.statut || a.statut === "disponible").length },
          ].map(s => (
            <div key={s.label} style={{ background: "white", borderRadius: 16, padding: "20px 24px" }}>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{s.val}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Onglets */}
        <div style={{ display: "flex", gap: 6, marginBottom: 24, background: "white", borderRadius: 14, padding: 6, width: "fit-content" }}>
          {ONGLETS.map(o => (
            <button key={o} onClick={() => setOnglet(o)}
              style={{ padding: "8px 18px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit", background: onglet === o ? "#111" : "transparent", color: onglet === o ? "white" : "#6b7280" }}>
              {o} {o === "Annonces" ? `(${annonces.length})` : o === "Profils" ? `(${profils.length})` : o === "Messages" ? `(${messages.length})` : ""}
            </button>
          ))}
        </div>

        {/* STATS */}
        {onglet === "Stats" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={{ background: "white", borderRadius: 20, padding: 28 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>Annonces par statut</h3>
              {statuts.map(s => {
                const count = annonces.filter(a => (a.statut || "disponible") === s).length
                const pct = annonces.length > 0 ? Math.round(count / annonces.length * 100) : 0
                return (
                  <div key={s} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
                      <span style={{ textTransform: "capitalize", color: "#6b7280" }}>{s}</span>
                      <span style={{ fontWeight: 700 }}>{count}</span>
                    </div>
                    <div style={{ background: "#f3f4f6", borderRadius: 999, height: 6 }}>
                      <div style={{ background: "#111", borderRadius: 999, height: 6, width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ background: "white", borderRadius: 20, padding: 28 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>Profils par ville</h3>
              {Array.from(new Set(profils.map(p => p.ville_souhaitee).filter(Boolean))).slice(0, 8).map(v => {
                const count = profils.filter(p => p.ville_souhaitee === v).length
                return (
                  <div key={v as string} style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 13 }}>
                    <span style={{ color: "#6b7280" }}>{v as string}</span>
                    <span style={{ fontWeight: 700 }}>{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ANNONCES */}
        {onglet === "Annonces" && (
          <div style={{ background: "white", borderRadius: 20, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {["Titre", "Ville", "Prix", "Statut", "Propriétaire", "Action"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {annonces.map((a, i) => (
                  <tr key={a.id} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "white" : "#fafafa" }}>
                    <td style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.titre || "—"}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#6b7280" }}>{a.ville || "—"}</td>
                    <td style={{ padding: "12px 16px", fontSize: 14, fontWeight: 700 }}>{a.prix ? `${a.prix} €` : "—"}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ background: a.statut === "loué" ? "#f3f4f6" : "#dcfce7", color: a.statut === "loué" ? "#6b7280" : "#16a34a", padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                        {a.statut || "disponible"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#6b7280", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.proprietaire_email || "—"}</td>
                    <td style={{ padding: "12px 16px" }}>
                      {confirm === a.id ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => supprimerAnnonce(a.id)} style={{ background: "#dc2626", color: "white", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Confirmer</button>
                          <button onClick={() => setConfirm(null)} style={{ background: "#f3f4f6", color: "#111", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirm(a.id)} style={{ background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 8, padding: "5px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                          Supprimer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* PROFILS */}
        {onglet === "Profils" && (
          <div style={{ background: "white", borderRadius: 20, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {["Nom", "Email", "Ville", "Budget max", "Mode", "Action"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profils.map((p, i) => (
                  <tr key={p.email} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "white" : "#fafafa" }}>
                    <td style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600 }}>{p.nom || "—"}</td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#6b7280" }}>{p.email}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13 }}>{p.ville_souhaitee || "—"}</td>
                    <td style={{ padding: "12px 16px", fontSize: 14, fontWeight: 700 }}>{p.budget_max ? `${p.budget_max} €` : "—"}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ background: p.mode_localisation === "strict" ? "#fee2e2" : "#f3f4f6", color: p.mode_localisation === "strict" ? "#dc2626" : "#6b7280", padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                        {p.mode_localisation || "souple"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <button onClick={() => supprimerProfil(p.email)} style={{ background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 8, padding: "5px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* SEO */}
        {onglet === "SEO" && (() => {
          const annoncesAvecSeo = annonces.map(a => ({ ...a, _seo: seoScore(a) }))
          const parfaites = annoncesAvecSeo.filter(a => a._seo.score === 100).length
          const aAmeliorer = annoncesAvecSeo.filter(a => a._seo.score < 60).length
          const moyenneSeo = annoncesAvecSeo.length > 0
            ? Math.round(annoncesAvecSeo.reduce((acc, a) => acc + a._seo.score, 0) / annoncesAvecSeo.length)
            : 0

          return (
            <div>
              {/* KPI */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
                {[
                  { label: "Score SEO moyen", val: `${moyenneSeo}%`, color: moyenneSeo >= 80 ? "#16a34a" : moyenneSeo >= 60 ? "#ea580c" : "#dc2626" },
                  { label: "Annonces parfaites", val: parfaites, color: "#16a34a" },
                  { label: "À améliorer (<60%)", val: aAmeliorer, color: aAmeliorer > 0 ? "#dc2626" : "#16a34a" },
                  { label: "Total indexées", val: annonces.length, color: "#111" },
                ].map(k => (
                  <div key={k.label} style={{ background: "white", borderRadius: 16, padding: "20px 24px" }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: k.color }}>{k.val}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{k.label}</div>
                  </div>
                ))}
              </div>

              {/* Liens techniques */}
              <div style={{ background: "white", borderRadius: 16, padding: "20px 24px", marginBottom: 20, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111", marginRight: 8 }}>Fichiers techniques :</span>
                {[
                  { label: "sitemap.xml", url: `${BASE_URL}/sitemap.xml` },
                  { label: "robots.txt", url: `${BASE_URL}/robots.txt` },
                ].map(l => (
                  <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer"
                    style={{ background: "#f3f4f6", color: "#111", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                    {l.label} ↗
                  </a>
                ))}
              </div>

              {/* Tableau annonces */}
              <div style={{ background: "white", borderRadius: 20, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      {["Score", "Titre", "Ville", "Description", "Photos", "Problèmes", "Lien"].map(h => (
                        <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {annoncesAvecSeo
                      .sort((a, b) => a._seo.score - b._seo.score)
                      .map((a, i) => {
                        const { score, issues } = a._seo
                        const scoreColor = score === 100 ? "#16a34a" : score >= 60 ? "#ea580c" : "#dc2626"
                        const scoreBg = score === 100 ? "#dcfce7" : score >= 60 ? "#fff7ed" : "#fee2e2"
                        const photos: string[] = Array.isArray(a.photos) ? a.photos : []
                        return (
                          <tr key={a.id} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "white" : "#fafafa" }}>
                            <td style={{ padding: "12px 16px" }}>
                              <span style={{ background: scoreBg, color: scoreColor, padding: "4px 10px", borderRadius: 999, fontSize: 13, fontWeight: 800 }}>
                                {score}%
                              </span>
                            </td>
                            <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {a.titre || <span style={{ color: "#dc2626", fontStyle: "italic" }}>Manquant</span>}
                              {a.titre && <span style={{ color: "#9ca3af", fontSize: 11, marginLeft: 6 }}>({a.titre.length})</span>}
                            </td>
                            <td style={{ padding: "12px 16px", fontSize: 12, color: a.ville ? "#6b7280" : "#dc2626" }}>
                              {a.ville || "—"}
                            </td>
                            <td style={{ padding: "12px 16px", fontSize: 12, color: "#6b7280" }}>
                              {a.description
                                ? <span style={{ color: a.description.length >= 80 ? "#16a34a" : "#ea580c" }}>{a.description.length} car.</span>
                                : <span style={{ color: "#dc2626" }}>Manquante</span>
                              }
                            </td>
                            <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: photos.length > 0 ? "#16a34a" : "#dc2626" }}>
                              {photos.length > 0 ? `${photos.length} photo${photos.length > 1 ? "s" : ""}` : "Aucune"}
                            </td>
                            <td style={{ padding: "12px 16px", maxWidth: 220 }}>
                              {issues.length === 0
                                ? <span style={{ color: "#16a34a", fontSize: 12, fontWeight: 700 }}>✓ Parfait</span>
                                : <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                  {issues.map(issue => (
                                    <span key={issue} style={{ fontSize: 11, color: "#dc2626", background: "#fee2e2", padding: "2px 7px", borderRadius: 4, width: "fit-content" }}>{issue}</span>
                                  ))}
                                </div>
                              }
                            </td>
                            <td style={{ padding: "12px 16px" }}>
                              <a href={`/annonces/${a.id}`} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: 12, color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
                                Voir ↗
                              </a>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })()}

        {/* MESSAGES */}
        {onglet === "Messages" && (
          <div style={{ background: "white", borderRadius: 20, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {["De", "À", "Message", "Date", "Lu"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {messages.map((m: any, i: number) => (
                  <tr key={m.id} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "white" : "#fafafa" }}>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#6b7280" }}>{m.from_email}</td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#6b7280" }}>{m.to_email}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.contenu}</td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#9ca3af" }}>{new Date(m.created_at).toLocaleDateString("fr-FR")}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ background: m.lu ? "#dcfce7" : "#fee2e2", color: m.lu ? "#16a34a" : "#dc2626", padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                        {m.lu ? "✓ Lu" : "Non lu"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
