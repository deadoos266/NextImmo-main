"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../lib/supabase"
import AgendaVisites from "../components/AgendaVisites"
import { useResponsive } from "../hooks/useResponsive"

const ONGLETS = ["Vue d'ensemble", "Mes biens", "Candidatures", "Loyers", "Visites"] as const
type Onglet = typeof ONGLETS[number]

const STATUT_V: Record<string, { bg: string; color: string; border: string; label: string; icon: string }> = {
  "proposée":  { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa", label: "En attente",  icon: "⏳" },
  "confirmée": { bg: "#dcfce7", color: "#15803d", border: "#bbf7d0", label: "Confirmée",   icon: "✅" },
  "annulée":   { bg: "#fee2e2", color: "#dc2626", border: "#fecaca", label: "Annulée",     icon: "❌" },
  "effectuée": { bg: "#f3f4f6", color: "#374151", border: "#e5e7eb", label: "Effectuée",  icon: "🏠" },
}

function jours(d: string) {
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
  if (diff === 0) return "Aujourd'hui"
  if (diff === 1) return "Demain"
  if (diff > 0) return `Dans ${diff} j`
  return `Passée`
}

function VisitesProprio({ visites, biens, setVisites }: { visites: any[]; biens: any[]; setVisites: any }) {
  const [filtre, setFiltre] = useState<string>("toutes")
  const [vue, setVue] = useState<"liste" | "agenda">("liste")
  const { isMobile } = useResponsive()

  async function changerStatut(id: string, statut: string) {
    await supabase.from("visites").update({ statut }).eq("id", id)
    setVisites((prev: any[]) => prev.map(v => v.id === id ? { ...v, statut } : v))
  }

  const filtrées = filtre === "toutes" ? visites : visites.filter(v => v.statut === filtre)
  const nbAttente = visites.filter(v => v.statut === "proposée").length
  const nbConfirmées = visites.filter(v => v.statut === "confirmée").length
  const nbEffectuées = visites.filter(v => v.statut === "effectuée").length

  // Convertir biens[] en Record pour AgendaVisites
  const biensMap: Record<number, any> = {}
  biens.forEach(b => { biensMap[b.id] = b })

  async function changerStatutAgenda(id: string, statut: string) {
    await supabase.from("visites").update({ statut }).eq("id", id)
    setVisites((prev: any[]) => prev.map(v => v.id === id ? { ...v, statut } : v))
  }

  return (
    <div>
      {/* Toggle vue */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <div style={{ display: "flex", background: "white", borderRadius: 12, padding: 4, gap: 2 }}>
          <button onClick={() => setVue("liste")}
            style={{ padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, background: vue === "liste" ? "#111" : "transparent", color: vue === "liste" ? "white" : "#6b7280" }}>
            ☰ Liste
          </button>
          <button onClick={() => setVue("agenda")}
            style={{ padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, background: vue === "agenda" ? "#111" : "transparent", color: vue === "agenda" ? "white" : "#6b7280" }}>
            📅 Agenda
          </button>
        </div>
      </div>

      {/* Vue Agenda */}
      {vue === "agenda" && (
        <AgendaVisites visites={visites} biens={biensMap} mode="proprietaire" onChangerStatut={changerStatutAgenda} />
      )}

      {vue === "liste" && <>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total demandes", val: visites.length, bg: "white", color: "#111" },
          { label: "En attente",     val: nbAttente,      bg: nbAttente > 0 ? "#fff7ed" : "white", color: nbAttente > 0 ? "#c2410c" : "#111" },
          { label: "Confirmées",     val: nbConfirmées,   bg: nbConfirmées > 0 ? "#dcfce7" : "white", color: nbConfirmées > 0 ? "#15803d" : "#111" },
          { label: "Effectuées",     val: nbEffectuées,   bg: "white", color: "#374151" },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 16, padding: "16px 20px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display: "flex", background: "white", borderRadius: 12, padding: 4, gap: 2, marginBottom: 16, width: isMobile ? "100%" : "fit-content", overflowX: isMobile ? "auto" : undefined }}>
        {["toutes", "proposée", "confirmée", "annulée", "effectuée"].map(f => (
          <button key={f} onClick={() => setFiltre(f)}
            style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, background: filtre === f ? "#111" : "transparent", color: filtre === f ? "white" : "#6b7280", whiteSpace: "nowrap", flexShrink: 0 }}>
            {f === "toutes" ? "Toutes" : STATUT_V[f]?.label}
            {f !== "toutes" && visites.filter(v => v.statut === f).length > 0 && (
              <span style={{ marginLeft: 4, opacity: 0.7 }}>({visites.filter(v => v.statut === f).length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Liste */}
      {filtrées.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 0", background: "white", borderRadius: 20, color: "#9ca3af" }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📅</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#374151" }}>Aucune visite{filtre !== "toutes" ? " dans cette catégorie" : ""}</p>
          {filtre === "toutes" && <p style={{ fontSize: 13, marginTop: 6 }}>Les demandes de visites de vos locataires apparaîtront ici</p>}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtrées.map((v: any) => {
            const bien = biens.find(b => b.id === v.annonce_id)
            const s = STATUT_V[v.statut] ?? STATUT_V["proposée"]
            const photo = Array.isArray(bien?.photos) && bien.photos.length > 0 ? bien.photos[0] : null
            const future = new Date(v.date_visite) >= new Date()
            return (
              <div key={v.id} style={{ background: "white", borderRadius: 18, border: `1.5px solid ${v.statut === "proposée" ? "#fed7aa" : "#e5e7eb"}`, overflow: "hidden", display: "flex", flexDirection: isMobile ? "column" : "row" }}>
                {/* Photo bien */}
                {!isMobile && (
                  photo ? (
                    <div style={{ width: 100, flexShrink: 0 }}>
                      <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  ) : (
                    <div style={{ width: 100, flexShrink: 0, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🏠</div>
                  )
                )}

                <div style={{ flex: 1, padding: isMobile ? "14px 16px" : "16px 20px", minWidth: 0 }}>
                  <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "flex-start", marginBottom: 8, gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999 }}>
                          {s.icon} {s.label}
                        </span>
                        {bien && <span style={{ fontSize: 12, color: "#9ca3af" }}>{bien.titre} · {bien.ville}</span>}
                      </div>
                      <p style={{ fontWeight: 700, fontSize: isMobile ? 13 : 15, marginTop: 6 }}>
                        {new Date(v.date_visite).toLocaleDateString("fr-FR", { weekday: isMobile ? "short" : "long", day: "numeric", month: isMobile ? "short" : "long" })} à {v.heure}
                        {future && v.statut !== "annulée" && (
                          <span style={{ marginLeft: 8, fontSize: 11, background: "#f3f4f6", color: "#6b7280", padding: "1px 8px", borderRadius: 999, fontWeight: 600 }}>
                            {jours(v.date_visite)}
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {v.statut === "proposée" && (
                        <>
                          <button onClick={() => changerStatut(v.id, "confirmée")}
                            style={{ background: "#111", color: "white", border: "none", borderRadius: 999, padding: "7px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                            ✓ Confirmer
                          </button>
                          <button onClick={() => changerStatut(v.id, "annulée")}
                            style={{ background: "none", border: "1.5px solid #fecaca", color: "#dc2626", borderRadius: 999, padding: "7px 12px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                            Refuser
                          </button>
                        </>
                      )}
                      {v.statut === "confirmée" && (
                        <button onClick={() => changerStatut(v.id, "effectuée")}
                          style={{ background: "#f3f4f6", border: "none", color: "#374151", borderRadius: 999, padding: "7px 12px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                          Effectuée
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Locataire + message */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                      {v.locataire_email[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.locataire_email}</p>
                      {v.message && <p style={{ fontSize: 11, color: "#6b7280", fontStyle: "italic", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>"{v.message}"</p>}
                    </div>
                    <Link href={`/messages?with=${v.locataire_email}`}
                      style={{ fontSize: 12, fontWeight: 600, color: "#111", textDecoration: "none", border: "1.5px solid #e5e7eb", borderRadius: 999, padding: "5px 12px", flexShrink: 0 }}>
                      💬
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      </>}
    </div>
  )
}

export default function Proprietaire() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { isMobile } = useResponsive()
  const [onglet, setOnglet] = useState<Onglet>("Vue d'ensemble")
  const [biens, setBiens] = useState<any[]>([])
  const [candidatures, setCandidatures] = useState<any[]>([])
  const [loyers, setLoyers] = useState<any[]>([])
  const [visites, setVisites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dossierOuvert, setDossierOuvert] = useState<string | null>(null)
  const [dossiers, setDossiers] = useState<Record<string, any>>({})

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth")
    if (session?.user?.email) loadData()
  }, [session, status])

  async function loadData() {
    const email = session!.user!.email!
    const [{ data: b }, { data: m }, { data: l }, { data: v, error: ve }] = await Promise.all([
      supabase.from("annonces").select("*").eq("proprietaire_email", email),
      supabase.from("messages").select("*").eq("to_email", email).order("created_at", { ascending: false }),
      supabase.from("loyers").select("*").eq("proprietaire_email", email).order("mois", { ascending: false }),
      supabase.from("visites").select("*").eq("proprietaire_email", email).order("date_visite", { ascending: true }),
    ])
    if (b) setBiens(b)
    if (m) setCandidatures(m.filter((msg: any) => msg.type === "candidature"))
    if (l) setLoyers(l)
    setVisites(v || [])
    if (ve) console.error("Visites error:", ve.message)
    setLoading(false)
  }

  async function reloadVisites() {
    const email = session?.user?.email
    if (!email) return
    const { data, error } = await supabase.from("visites").select("*").eq("proprietaire_email", email).order("date_visite", { ascending: true })
    if (error) console.error("Visites reload error:", error.message)
    setVisites(data || [])
  }

  async function voirDossier(email: string) {
    if (dossierOuvert === email) { setDossierOuvert(null); return }
    if (!dossiers[email]) {
      const { data } = await supabase.from("profils").select("*").eq("email", email).single()
      if (data) setDossiers(prev => ({ ...prev, [email]: data }))
    }
    setDossierOuvert(email)
  }

  async function changerStatut(id: number, statut: string) {
    await supabase.from("annonces").update({ statut }).eq("id", id)
    setBiens(biens.map(b => b.id === id ? { ...b, statut } : b))
  }

  async function confirmerLoyer(id: number) {
    await supabase.from("loyers").update({ statut: "confirmé", date_confirmation: new Date().toISOString() }).eq("id", id)
    setLoyers(loyers.map(l => l.id === id ? { ...l, statut: "confirmé" } : l))
  }

  if (status === "loading" || loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#6b7280" }}>Chargement...</div>
  )

  const biensDispos = biens.filter(b => !b.statut || b.statut === "disponible").length
  const biensLoues = biens.filter(b => b.statut === "loué").length
  const loyersAttendus = loyers.filter(l => l.statut === "déclaré").length
  const loyersConfirmes = loyers.filter(l => l.statut === "confirmé").length

  const statutColor: any = {
    "disponible": { bg: "#dcfce7", color: "#16a34a" },
    "loué": { bg: "#f3f4f6", color: "#6b7280" },
    "en visite": { bg: "#dbeafe", color: "#2563eb" },
    "réservé": { bg: "#fef9c3", color: "#ca8a04" },
  }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "24px 16px" : "32px 48px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", marginBottom: 28, flexDirection: isMobile ? "column" : "row", gap: isMobile ? 14 : 0 }}>
          <div>
            <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, letterSpacing: "-0.5px" }}>Espace propriétaire</h1>
            <p style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>{session?.user?.name} · {biens.length} bien{biens.length > 1 ? "s" : ""} en gestion</p>
          </div>
          <a href="/proprietaire/ajouter" style={{ background: "#111", color: "white", padding: "11px 22px", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 14 }}>
            + Ajouter un bien
          </a>
        </div>

        {/* Onglets */}
        <div style={{ display: "flex", gap: 6, marginBottom: 24, background: "white", borderRadius: 14, padding: 6, width: isMobile ? "100%" : "fit-content", overflowX: isMobile ? "auto" : undefined }}>
          {ONGLETS.map(o => (
            <button key={o} onClick={() => { setOnglet(o); if (o === "Visites") reloadVisites() }}
              style={{ padding: "8px 18px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit", background: onglet === o ? "#111" : "transparent", color: onglet === o ? "white" : "#6b7280", transition: "all 0.15s", whiteSpace: "nowrap", flexShrink: 0 }}>
              {o}
              {o === "Loyers" && loyersAttendus > 0 && (
                <span style={{ marginLeft: 6, background: "#ef4444", color: "white", borderRadius: 999, fontSize: 10, padding: "1px 6px", fontWeight: 700 }}>{loyersAttendus}</span>
              )}
              {o === "Visites" && visites.filter(v => v.statut === "proposée").length > 0 && (
                <span style={{ marginLeft: 6, background: "#f97316", color: "white", borderRadius: 999, fontSize: 10, padding: "1px 6px", fontWeight: 700 }}>{visites.filter(v => v.statut === "proposée").length}</span>
              )}
            </button>
          ))}
        </div>

        {/* VUE D'ENSEMBLE */}
        {onglet === "Vue d'ensemble" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: isMobile ? 10 : 16, marginBottom: 24 }}>
              {[
                { label: "Biens disponibles", val: biensDispos, color: "#16a34a" },
                { label: "Biens loues", val: biensLoues, color: "#6b7280" },
                { label: "Loyers a confirmer", val: loyersAttendus, color: "#ea580c" },
                { label: "Loyers confirmes", val: loyersConfirmes, color: "#16a34a" },
              ].map(s => (
                <div key={s.label} style={{ background: "white", borderRadius: 16, padding: "20px 24px" }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Alertes */}
            {loyersAttendus > 0 && (
              <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 14, padding: isMobile ? "12px 16px" : "14px 20px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <p style={{ fontSize: isMobile ? 13 : 14, fontWeight: 600, color: "#ea580c" }}>{loyersAttendus} paiement{loyersAttendus > 1 ? "s" : ""} en attente</p>
                <button onClick={() => setOnglet("Loyers")} style={{ background: "#ea580c", color: "white", border: "none", borderRadius: 999, padding: "6px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Voir</button>
              </div>
            )}

            {/* Biens rapides */}
            <div style={{ background: "white", borderRadius: 20, padding: 24 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Mes biens</h2>
              {biens.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }} />
                  <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Aucun bien publié</p>
                  <a href="/proprietaire/ajouter" style={{ color: "#111", fontWeight: 700, textDecoration: "none" }}>Ajouter votre premier bien →</a>
                </div>
              ) : biens.slice(0, 4).map(b => (
                <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f3f4f6" }}>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 14 }}>{b.titre}</p>
                    <p style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>{b.ville} · {b.surface} m² · {b.prix} €/mois</p>
                  </div>
                  <span style={{ background: statutColor[b.statut || "disponible"]?.bg || "#f3f4f6", color: statutColor[b.statut || "disponible"]?.color || "#6b7280", padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                    {b.statut || "disponible"}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* MES BIENS */}
        {onglet === "Mes biens" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {biens.length === 0 ? (
              <div style={{ background: "white", borderRadius: 20, padding: 48, textAlign: "center", color: "#9ca3af" }}>
                <div style={{ fontSize: 48, marginBottom: 16, color: "#d1d5db" }}>—</div>
                <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Aucun bien publié</p>
                <a href="/proprietaire/ajouter" style={{ background: "#111", color: "white", padding: "12px 28px", borderRadius: 999, textDecoration: "none", fontWeight: 700 }}>Ajouter un bien</a>
              </div>
            ) : biens.map(b => (
              <div key={b.id} style={{ background: "white", borderRadius: 20, padding: isMobile ? 18 : 24 }}>
                <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "flex-start", gap: isMobile ? 14 : 0 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                      <h3 style={{ fontSize: isMobile ? 15 : 17, fontWeight: 800 }}>{b.titre}</h3>
                      <span style={{ background: statutColor[b.statut || "disponible"]?.bg || "#f3f4f6", color: statutColor[b.statut || "disponible"]?.color || "#6b7280", padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                        {b.statut || "disponible"}
                      </span>
                    </div>
                    <p style={{ color: "#6b7280", fontSize: 13 }}>{b.adresse} · {b.ville}</p>
                    <div style={{ display: "flex", gap: isMobile ? 10 : 16, marginTop: 10, fontSize: 13, color: "#6b7280", flexWrap: "wrap" }}>
                      <span>{b.surface} m²</span>
                      <span>{b.pieces} pieces</span>
                      <span>{b.prix} €/mois</span>
                      {b.meuble && <span>Meuble</span>}
                      {b.animaux && <span>Animaux OK</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: isMobile ? "row" : "column", gap: 8, marginLeft: isMobile ? 0 : 24, flexWrap: "wrap" }}>
                    <select
                      value={b.statut || "disponible"}
                      onChange={e => changerStatut(b.id, e.target.value)}
                      style={{ padding: "8px 12px", borderRadius: 10, border: "1.5px solid #e5e7eb", fontSize: 12, fontFamily: "inherit", cursor: "pointer", outline: "none", flex: isMobile ? 1 : undefined }}>
                      <option value="disponible">Disponible</option>
                      <option value="en visite">En visite</option>
                      <option value="réservé">Réservé</option>
                      <option value="loué">Loué</option>
                    </select>
                    <a href={`/proprietaire/modifier/${b.id}`} style={{ textAlign: "center", padding: "8px 12px", border: "none", borderRadius: 10, textDecoration: "none", color: "white", background: "#111", fontSize: 12, fontWeight: 600, flex: isMobile ? 1 : undefined }}>
                      Modifier
                    </a>
                    <a href={`/annonces/${b.id}`} style={{ textAlign: "center", padding: "8px 12px", border: "1.5px solid #e5e7eb", borderRadius: 10, textDecoration: "none", color: "#111", fontSize: 12, fontWeight: 600, flex: isMobile ? 1 : undefined }}>
                      Annonce
                    </a>
                    <a href={`/proprietaire/stats?id=${b.id}`} style={{ textAlign: "center", padding: "8px 12px", border: "1.5px solid #e5e7eb", borderRadius: 10, textDecoration: "none", color: "#6b7280", fontSize: 12, fontWeight: 600, flex: isMobile ? 1 : undefined }}>
                      Statistiques
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CANDIDATURES */}
        {onglet === "Candidatures" && (
          <div style={{ background: "white", borderRadius: 20, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 20 }}>Candidatures reçues</h2>
            {candidatures.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af" }}>
                <p style={{ fontSize: 15, fontWeight: 600 }}>Aucune candidature pour le moment</p>
              </div>
            ) : candidatures.map((c: any) => {
              const isOpen = dossierOuvert === c.from_email
              const d = dossiers[c.from_email]
              return (
                <div key={c.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <div style={{ padding: "16px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 700, fontSize: 14 }}>{c.from_email}</p>
                      <p style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>{c.contenu?.slice(0, 80)}{c.contenu?.length > 80 ? "..." : ""}</p>
                      <p style={{ color: "#9ca3af", fontSize: 11, marginTop: 4 }}>{new Date(c.created_at).toLocaleDateString("fr-FR")}</p>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => voirDossier(c.from_email)}
                        style={{ background: isOpen ? "#111" : "white", color: isOpen ? "white" : "#111", border: "1.5px solid #e5e7eb", padding: "7px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        {isOpen ? "Masquer le dossier" : "Voir le dossier"}
                      </button>
                      <a href={`/messages?with=${encodeURIComponent(c.from_email)}`} style={{ background: "#111", color: "white", padding: "7px 14px", borderRadius: 999, textDecoration: "none", fontSize: 13, fontWeight: 600 }}>Repondre</a>
                    </div>
                  </div>
                  {isOpen && (
                    <div style={{ background: "#f9fafb", borderRadius: 14, padding: 20, marginBottom: 16 }}>
                      {!d ? (
                        <p style={{ fontSize: 13, color: "#9ca3af" }}>Aucun dossier rempli par ce locataire.</p>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 16 }}>
                          {[
                            { label: "Nom", val: d.nom },
                            { label: "Situation pro", val: d.situation_pro },
                            { label: "Revenus mensuels", val: d.revenus_mensuels ? `${d.revenus_mensuels.toLocaleString("fr-FR")} €` : null },
                            { label: "Garant", val: d.garant === true ? "Oui" : d.garant === false ? "Non" : null },
                            { label: "Type de garant", val: d.type_garant },
                            { label: "Nb occupants", val: d.nb_occupants },
                            { label: "Animaux", val: d.animaux === true ? "Oui" : d.animaux === false ? "Non" : null },
                            { label: "Fumeur", val: d.fumeur === true ? "Oui" : d.fumeur === false ? "Non" : null },
                            { label: "Ville souhaitee", val: d.ville_souhaitee },
                          ].filter(item => item.val != null && item.val !== "").map(item => (
                            <div key={item.label}>
                              <p style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 3 }}>{item.label}</p>
                              <p style={{ fontSize: 14, fontWeight: 600 }}>{String(item.val)}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* LOYERS */}
        {onglet === "Loyers" && (
          <div style={{ background: "white", borderRadius: 20, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 20 }}>Suivi des loyers</h2>
            {loyers.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af" }}>
                <p style={{ fontSize: 15, fontWeight: 600 }}>Aucun loyer enregistre</p>
                <p style={{ fontSize: 13, marginTop: 8 }}>Les loyers déclarés par vos locataires apparaîtront ici</p>
              </div>
            ) : loyers.map((l: any) => (
              <div key={l.id} style={{ padding: "16px 0", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 14 }}>{l.titre_bien || "Bien"} — {l.mois}</p>
                  <p style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>Locataire : {l.locataire_email}</p>
                  <p style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}>{l.montant} €</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {l.statut === "confirmé" ? (
                    <span style={{ background: "#dcfce7", color: "#16a34a", padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700 }}>Confirme</span>
                  ) : (
                    <>
                      <span style={{ background: "#fff7ed", color: "#ea580c", padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700 }}>En attente</span>
                      <button onClick={() => confirmerLoyer(l.id)}
                        style={{ background: "#111", color: "white", border: "none", borderRadius: 999, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                        Confirmer
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {onglet === "Visites" && (
          <VisitesProprio visites={visites} biens={biens} setVisites={setVisites} />
        )}
      </div>
    </main>
  )
}
