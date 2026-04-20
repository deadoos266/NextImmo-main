"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../lib/supabase"
import AgendaVisites from "../components/AgendaVisites"
import AnnulerVisiteDialog from "../components/AnnulerVisiteDialog"
import { useResponsive } from "../hooks/useResponsive"
import { annulerVisite, STATUT_VISITE_STYLE as STATUT, type StatutVisite as Statut } from "../../lib/visitesHelpers"
import EmptyState from "../components/ui/EmptyState"
import Image from "next/image"

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
}

function jours(d: string) {
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
  if (diff === 0) return "Aujourd'hui"
  if (diff === 1) return "Demain"
  if (diff > 0) return `Dans ${diff} jours`
  return `Il y a ${Math.abs(diff)} jours`
}

export default function MesVisites() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [visites, setVisites] = useState<any[]>([])
  const [annonces, setAnnonces] = useState<Record<number, any>>({})
  const [loading, setLoading] = useState(true)
  const [filtre, setFiltre] = useState<Statut | "toutes">("toutes")
  const [vue, setVue] = useState<"liste" | "agenda">("liste")
  const { isMobile } = useResponsive()

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth")
    if (status === "authenticated" && session?.user?.email) load()
  }, [session, status])

  async function load() {
    const email = session!.user!.email!
    const { data } = await supabase
      .from("visites")
      .select("*")
      .eq("locataire_email", email)
      .order("date_visite", { ascending: true })

    if (data && data.length > 0) {
      setVisites(data)
      const ids = [...new Set(data.map((v: any) => v.annonce_id))]
      const { data: ann } = await supabase
        .from("annonces")
        .select("id, titre, ville, prix, photos, proprietaire_email")
        .in("id", ids)
      if (ann) {
        const map: Record<number, any> = {}
        ann.forEach((a: any) => { map[a.id] = a })
        setAnnonces(map)
      }
    }
    setLoading(false)
  }

  const [cancelTarget, setCancelTarget] = useState<any | null>(null)
  const myEmail = session?.user?.email?.toLowerCase() ?? ""

  async function handleAnnulation(motif: string) {
    if (!cancelTarget) return
    const v = cancelTarget
    const res = await annulerVisite({
      visiteId: v.id,
      fromEmail: myEmail,
      toEmail: v.proprietaire_email,
      dateVisite: v.date_visite,
      heureVisite: v.heure,
      motif,
      statutActuel: v.statut,
      annonceId: v.annonce_id ?? null,
    })
    if (res.ok) {
      setVisites(prev => prev.map(x => x.id === v.id ? { ...x, statut: "annulée" } : x))
      setCancelTarget(null)
    }
  }

  const filtrées = filtre === "toutes" ? visites : visites.filter(v => v.statut === filtre)
  // "En attente" compte uniquement les demandes qui attendent MA réponse
  // (proposées par le proprio), pas celles que j'ai moi-même proposées.
  const nbAttente = visites.filter(v => v.statut === "proposée" && (v.propose_par || "").toLowerCase() !== (myEmail || "").toLowerCase()).length
  const nbConfirmées = visites.filter(v => v.statut === "confirmée").length
  const prochaine = visites.find(v => v.statut === "confirmée" && new Date(v.date_visite) >= new Date())

  if (status === "loading" || loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#6b7280" }}>Chargement...</div>
  )

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: isMobile ? "24px 16px" : "40px 48px" }}>
      <AnnulerVisiteDialog
        open={!!cancelTarget}
        mode={cancelTarget?.statut === "confirmée" ? "annulation" : "annulation"}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleAnnulation}
      />
      <div style={{ maxWidth: 860, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px" }}>Mes visites</h1>
            <p style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>Suivi de vos demandes de visites</p>
          </div>
          <a href="/api/visites/ics" download="visites-nestmatch.ics"
            style={{ background: "white", border: "1.5px solid #e5e7eb", color: "#111", borderRadius: 999, padding: "10px 18px", textDecoration: "none", fontWeight: 700, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Exporter (.ics)
          </a>
        </div>

        {/* Prochaine visite confirmée */}
        {prochaine && (
          <div style={{ background: "#dcfce7", border: "1.5px solid #bbf7d0", borderRadius: 20, padding: isMobile ? "16px 18px" : "20px 24px", marginBottom: 24, display: "flex", alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? 12 : 16, flexDirection: isMobile ? "column" : "row" }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "0.5px" }}>Prochaine visite confirmée</p>
              <p style={{ fontWeight: 800, fontSize: 16, color: "#111", marginTop: 2 }}>
                {annonces[prochaine.annonce_id]?.titre || "Bien"}
              </p>
              <p style={{ fontSize: 14, color: "#374151", marginTop: 2 }}>
                {formatDate(prochaine.date_visite)} à {prochaine.heure}
                <span style={{ marginLeft: 10, background: "#bbf7d0", color: "#15803d", fontSize: 12, fontWeight: 700, padding: "1px 8px", borderRadius: 999 }}>
                  {jours(prochaine.date_visite)}
                </span>
              </p>
            </div>
            <Link href={`/annonces/${prochaine.annonce_id}`}
              style={{ fontSize: 13, fontWeight: 700, color: "#15803d", textDecoration: "none", border: "1.5px solid #86efac", borderRadius: 999, padding: "8px 16px", whiteSpace: "nowrap" }}>
              Voir l'annonce →
            </Link>
          </div>
        )}

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Total",        val: visites.length,                                             bg: "white" },
            { label: "En attente",   val: nbAttente,      color: nbAttente > 0 ? "#c2410c" : undefined, bg: nbAttente > 0 ? "#fff7ed" : "white" },
            { label: "Confirmées",   val: nbConfirmées,   color: nbConfirmées > 0 ? "#15803d" : undefined, bg: nbConfirmées > 0 ? "#dcfce7" : "white" },
            { label: "Effectuées",   val: visites.filter(v => v.statut === "effectuée").length,       bg: "white" },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: 16, padding: "16px 20px" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color || "#111" }}>{s.val}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Toggle Liste / Agenda */}
        <div style={{ display: "flex", background: "white", borderRadius: 12, padding: 4, gap: 2, marginBottom: 20, width: "fit-content" }}>
          <button onClick={() => setVue("liste")}
            style={{ padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, background: vue === "liste" ? "#111" : "transparent", color: vue === "liste" ? "white" : "#6b7280" }}>
            Liste
          </button>
          <button onClick={() => setVue("agenda")}
            style={{ padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, background: vue === "agenda" ? "#111" : "transparent", color: vue === "agenda" ? "white" : "#6b7280" }}>
            Agenda
          </button>
        </div>

        {/* Vue Agenda */}
        {vue === "agenda" && (
          <AgendaVisites visites={visites} biens={annonces} mode="locataire" />
        )}

        {/* Vue Liste */}
        {vue === "liste" && <>
        {/* Filtres */}
        <div style={{ display: "flex", background: "white", borderRadius: 12, padding: 4, gap: 2, marginBottom: 20, width: isMobile ? "100%" : "fit-content", overflowX: isMobile ? "auto" : undefined }}>
          {(["toutes", "proposée", "confirmée", "annulée", "effectuée"] as const).map(f => (
            <button key={f} onClick={() => setFiltre(f)}
              style={{ padding: "6px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, background: filtre === f ? "#111" : "transparent", color: filtre === f ? "white" : "#6b7280", transition: "all 0.15s", whiteSpace: "nowrap", flexShrink: 0 }}>
              {f === "toutes" ? "Toutes" : STATUT[f as Statut]?.label}
              {f !== "toutes" && visites.filter(v => v.statut === f).length > 0 && (
                <span style={{ marginLeft: 5, opacity: 0.7 }}>({visites.filter(v => v.statut === f).length})</span>
              )}
            </button>
          ))}
        </div>

        {/* Liste */}
        {filtrées.length === 0 ? (
          <EmptyState
            title={filtre === "toutes" ? "Aucune visite demandée" : "Aucune visite dans cette catégorie"}
            description={filtre === "toutes" ? "Trouvez un bien et proposez une visite depuis la fiche annonce." : undefined}
            ctaLabel={filtre === "toutes" ? "Voir les annonces" : undefined}
            ctaHref={filtre === "toutes" ? "/annonces" : undefined}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {filtrées.map((v: any) => {
              const ann = annonces[v.annonce_id]
              const s = STATUT[v.statut as Statut] ?? STATUT["proposée"]
              const photo = Array.isArray(ann?.photos) && ann.photos.length > 0 ? ann.photos[0] : null
              const future = new Date(v.date_visite) >= new Date()
              return (
                <div key={v.id} style={{ background: "white", borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: isMobile ? "column" : "row", border: `1.5px solid ${v.statut === "confirmée" && future ? "#bbf7d0" : "#e5e7eb"}` }}>
                  {/* Photo */}
                  {photo ? (
                    <div style={{ position: "relative", width: isMobile ? "100%" : 120, height: isMobile ? 140 : "100%", minHeight: isMobile ? 140 : 120, flexShrink: 0, background: "#f3f4f6" }}>
                      <Image src={photo} alt="" fill sizes="(max-width: 768px) 100vw, 120px" style={{ objectFit: "cover", display: "block" }} />
                    </div>
                  ) : (
                    <div style={{ width: isMobile ? "100%" : 120, height: isMobile ? 80 : undefined, flexShrink: 0, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 700, color: "#6b7280" }}>{(ann?.titre || "B")[0].toUpperCase()}</div>
                  )}

                  {/* Contenu */}
                  <div style={{ flex: 1, padding: isMobile ? "14px 16px" : "18px 22px", display: "flex", flexDirection: "column", gap: 0, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontWeight: 700, fontSize: isMobile ? 14 : 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ann?.titre || "Bien"}</p>
                        <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 1 }}>{ann?.ville}{ann?.prix ? ` · ${ann.prix} €/mois` : ""}</p>
                      </div>
                      <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, flexShrink: 0, whiteSpace: "nowrap" }}>
                        {s.label}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: v.message ? 8 : 0, flexWrap: "wrap" }}>
                      <span style={{ fontSize: isMobile ? 12 : 14, fontWeight: 700, color: "#111" }}>
                        {formatDate(v.date_visite)} à {v.heure}
                      </span>
                      {future && v.statut !== "annulée" && (
                        <span style={{ fontSize: 11, background: "#f3f4f6", color: "#6b7280", padding: "1px 8px", borderRadius: 999, fontWeight: 600 }}>
                          {jours(v.date_visite)}
                        </span>
                      )}
                    </div>

                    {v.message && (
                      <p style={{ fontSize: 13, color: "#6b7280", fontStyle: "italic", marginBottom: 8 }}>
                        "{v.message}"
                      </p>
                    )}

                    <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <Link href={`/annonces/${v.annonce_id}`}
                        style={{ fontSize: 12, fontWeight: 600, color: "#111", textDecoration: "none", border: "1.5px solid #e5e7eb", borderRadius: 999, padding: "5px 12px" }}>
                        Voir l'annonce
                      </Link>
                      {ann?.proprietaire_email && (
                        <Link href={`/messages?with=${ann.proprietaire_email}`}
                          style={{ fontSize: 12, fontWeight: 600, color: "#111", textDecoration: "none", border: "1.5px solid #e5e7eb", borderRadius: 999, padding: "5px 12px" }}>
                          Contacter
                        </Link>
                      )}
                      {(v.statut === "proposée" || v.statut === "confirmée") && (
                        <button onClick={() => setCancelTarget(v)}
                          style={{ fontSize: 12, fontWeight: 600, color: "#dc2626", background: "none", border: "1.5px solid #fecaca", borderRadius: 999, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit" }}>
                          Annuler
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        </>}
      </div>
    </main>
  )
}
