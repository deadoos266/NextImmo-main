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
import { km, KMPageHeader, KMToggle } from "../components/ui/km"

/**
 * /visites — suivi locataire des demandes de visites.
 * Aligné Claude Design handoff : KMPageHeader + KMToggle (vue, filtres) +
 * stats grid pastel + cards visite. Export ICS dans le slot droit du header.
 */

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
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filtre, setFiltre] = useState<Statut | "toutes">("toutes")
  const [vue, setVue] = useState<"liste" | "agenda">("liste")
  const { isMobile } = useResponsive()

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth")
    if (status === "authenticated" && session?.user?.email) load()
  }, [session, status])

  async function load() {
    if (!session?.user?.email) return
    const email = session.user.email
    setLoadError(null)
    const { data, error } = await supabase
      .from("visites")
      .select("*")
      .eq("locataire_email", email)
      .order("date_visite", { ascending: true })

    if (error) {
      console.error("[visites] load failed", error)
      setLoadError("Impossible de charger vos visites. Vérifiez votre connexion et réessayez.")
      setLoading(false)
      return
    }

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
    } else {
      // Silent failure historique — on signale clairement la panne au lieu
      // de laisser l'utilisateur penser que l'annulation est passée.
      console.error("[visites] annulation failed", res)
      alert("L'annulation n'a pas pu être enregistrée. Vérifiez votre connexion et réessayez.")
    }
  }

  const filtrées = filtre === "toutes" ? visites : visites.filter(v => v.statut === filtre)
  // "En attente" compte uniquement les demandes qui attendent MA réponse
  // (proposées par le proprio), pas celles que j'ai moi-même proposées.
  const nbAttente = visites.filter(v => v.statut === "proposée" && (v.propose_par || "").toLowerCase() !== (myEmail || "").toLowerCase()).length
  const nbConfirmées = visites.filter(v => v.statut === "confirmée").length
  const prochaine = visites.find(v => v.statut === "confirmée" && new Date(v.date_visite) >= new Date())

  if (status === "loading" || loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", color: km.muted }}>Chargement…</div>
  )

  // Filtres : on ne montre que les statuts qui ont au moins 1 visite
  const filtreOptions = (["toutes", "proposée", "confirmée", "annulée", "effectuée"] as const).map(f => {
    const count = f === "toutes" ? visites.length : visites.filter(v => v.statut === f).length
    return {
      value: f,
      label: <>
        {f === "toutes" ? "Toutes" : STATUT[f as Statut]?.label}
        {f !== "toutes" && count > 0 && <span style={{ marginLeft: 5, opacity: 0.7 }}>({count})</span>}
      </>,
    }
  })

  return (
    <main style={{ minHeight: "100vh", background: km.beige, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", padding: isMobile ? "24px 16px" : "40px 48px" }}>
      <AnnulerVisiteDialog
        open={!!cancelTarget}
        mode={cancelTarget?.statut === "confirmée" ? "annulation" : "annulation"}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleAnnulation}
      />
      <div style={{ maxWidth: 860, margin: "0 auto" }}>

        <KMPageHeader
          eyebrow="Locataire"
          title="Mes visites"
          subtitle="Suivi de vos demandes de visites"
          isMobile={isMobile}
          right={
            <a href="/api/visites/ics" download="visites-keymatch.ics"
              style={{ background: km.white, border: `1px solid ${km.line}`, color: km.ink, borderRadius: 999, padding: "10px 18px", textDecoration: "none", fontWeight: 600, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 8, letterSpacing: "0.3px", whiteSpace: "nowrap" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Exporter (.ics)
            </a>
          }
        />

        {loadError && (
          <div style={{ background: km.errBg, color: km.errText, border: `1px solid ${km.errLine}`, borderRadius: 16, padding: "14px 18px", fontSize: 13, marginBottom: 20 }}>
            {loadError}
          </div>
        )}

        {/* Prochaine visite confirmée — palette success doux */}
        {prochaine && (
          <div style={{ background: km.successBg, border: `1px solid ${km.successLine}`, borderRadius: 20, padding: isMobile ? "18px 20px" : "22px 26px", marginBottom: 24, display: "flex", alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? 12 : 18, flexDirection: isMobile ? "column" : "row" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#DCF5E4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={km.successText} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: km.successText, textTransform: "uppercase", letterSpacing: "1.2px", margin: 0 }}>Prochaine visite confirmée</p>
              <p style={{ fontWeight: 600, fontSize: 16, color: km.ink, margin: "4px 0 2px", letterSpacing: "-0.2px" }}>
                {annonces[prochaine.annonce_id]?.titre || "Bien"}
              </p>
              <p style={{ fontSize: 13, color: km.successText, margin: 0, lineHeight: 1.5 }}>
                {formatDate(prochaine.date_visite)} à {prochaine.heure}
                <span style={{ marginLeft: 10, background: "#DCF5E4", color: km.successText, fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: 999, textTransform: "uppercase", letterSpacing: "1.2px" }}>
                  {jours(prochaine.date_visite)}
                </span>
              </p>
            </div>
            <Link href={`/annonces/${prochaine.annonce_id}`}
              style={{ fontSize: 12, fontWeight: 600, color: km.successText, textDecoration: "none", border: `1px solid ${km.successLine}`, background: km.white, borderRadius: 999, padding: "9px 18px", whiteSpace: "nowrap", letterSpacing: "0.3px" }}>
              Voir l&apos;annonce →
            </Link>
          </div>
        )}

        {/* Stats — palette pastel + hairline */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
          {[
            { label: "Total",        val: visites.length,                                           bg: km.white,  border: km.line,        color: km.ink },
            { label: "En attente",   val: nbAttente,    bg: nbAttente > 0 ? km.warnBg : km.white,    border: nbAttente > 0 ? km.warnLine : km.line,       color: nbAttente > 0 ? km.warnText : km.ink },
            { label: "Confirmées",   val: nbConfirmées, bg: nbConfirmées > 0 ? km.successBg : km.white, border: nbConfirmées > 0 ? km.successLine : km.line, color: nbConfirmées > 0 ? km.successText : km.ink },
            { label: "Effectuées",   val: visites.filter(v => v.statut === "effectuée").length,    bg: km.white,  border: km.line,        color: km.ink },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 18, padding: "18px 22px" }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: s.color, letterSpacing: "-0.5px", lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 10, color: km.muted, marginTop: 8, textTransform: "uppercase", letterSpacing: "1.2px", fontWeight: 700 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Toggle Liste / Agenda */}
        <div style={{ marginBottom: 20 }}>
          <KMToggle
            ariaLabel="Vue visites"
            value={vue}
            onChange={(v) => setVue(v)}
            options={[
              { value: "liste", label: "Liste" },
              { value: "agenda", label: "Agenda" },
            ]}
          />
        </div>

        {/* Vue Agenda */}
        {vue === "agenda" && (
          <AgendaVisites visites={visites} biens={annonces} mode="locataire" />
        )}

        {/* Vue Liste */}
        {vue === "liste" && <>
          {/* Filtres statuts */}
          <div style={{ marginBottom: 20, overflowX: isMobile ? "auto" : undefined, maxWidth: "100%" }}>
            <KMToggle
              ariaLabel="Filtre statut visites"
              value={filtre}
              onChange={(v) => setFiltre(v)}
              size="sm"
              options={filtreOptions}
            />
          </div>

          {/* Liste */}
          {filtrées.length === 0 ? (
            <EmptyState
              icon={
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              }
              title={filtre === "toutes" ? "Aucune visite demandée" : "Aucune visite dans cette catégorie"}
              description={filtre === "toutes" ? "Trouvez un bien et proposez une visite depuis la fiche annonce. Vous verrez ici tous vos rendez-vous à venir." : undefined}
              ctaLabel={filtre === "toutes" ? "Parcourir les annonces" : undefined}
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
                  <div key={v.id} style={{ background: km.white, borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: isMobile ? "column" : "row", border: `1px solid ${v.statut === "confirmée" && future ? km.successLine : km.line}`, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
                    {/* Photo */}
                    {photo ? (
                      <div style={{ position: "relative", width: isMobile ? "100%" : 140, height: isMobile ? 160 : "auto", minHeight: isMobile ? 160 : 140, flexShrink: 0, background: km.beige }}>
                        <Image src={photo} alt="" fill sizes="(max-width: 768px) 100vw, 140px" style={{ objectFit: "cover", display: "block" }} />
                      </div>
                    ) : (
                      <div style={{ width: isMobile ? "100%" : 140, height: isMobile ? 80 : undefined, flexShrink: 0, background: km.beige, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif", fontStyle: "italic", fontSize: 32, fontWeight: 500, color: km.muted }}>{(ann?.titre || "B")[0].toUpperCase()}</div>
                    )}

                    {/* Contenu */}
                    <div style={{ flex: 1, padding: isMobile ? "16px 18px" : "20px 24px", display: "flex", flexDirection: "column", gap: 0, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontWeight: 600, fontSize: isMobile ? 14 : 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0, letterSpacing: "-0.1px", color: km.ink }}>{ann?.titre || "Bien"}</p>
                          <p style={{ fontSize: 12, color: km.muted, margin: "2px 0 0", letterSpacing: "0.1px" }}>{ann?.ville}{ann?.prix ? ` · ${ann.prix} €/mois` : ""}</p>
                        </div>
                        <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 999, flexShrink: 0, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "1.2px" }}>
                          {s.label}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: v.message ? 10 : 0, flexWrap: "wrap" }}>
                        <span style={{ fontSize: isMobile ? 12.5 : 13.5, fontWeight: 600, color: km.ink, letterSpacing: "-0.1px" }}>
                          {formatDate(v.date_visite)} à {v.heure}
                        </span>
                        {v.format === "visio" && (
                          <span style={{ fontSize: 10, background: "#EAF2FF", color: "#1d4ed8", padding: "2px 10px", borderRadius: 999, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px" }}>
                            Visio
                          </span>
                        )}
                        {future && v.statut !== "annulée" && (
                          <span style={{ fontSize: 10, background: km.beige, color: km.muted, border: `1px solid ${km.line}`, padding: "2px 10px", borderRadius: 999, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px" }}>
                            {jours(v.date_visite)}
                          </span>
                        )}
                      </div>

                      {v.message && (
                        <p style={{ fontSize: 13, color: km.muted, fontStyle: "italic", margin: "0 0 10px", lineHeight: 1.55, fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif" }}>
                          « {v.message} »
                        </p>
                      )}

                      <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <Link href={`/annonces/${v.annonce_id}`}
                          style={{ fontSize: 11, fontWeight: 600, color: km.ink, textDecoration: "none", border: `1px solid ${km.line}`, background: km.white, borderRadius: 999, padding: "7px 14px", letterSpacing: "0.3px", textTransform: "uppercase" }}>
                          Voir l&apos;annonce
                        </Link>
                        {ann?.proprietaire_email && (
                          <Link href={`/messages?with=${ann.proprietaire_email}`}
                            style={{ fontSize: 11, fontWeight: 600, color: km.white, textDecoration: "none", border: "none", background: km.ink, borderRadius: 999, padding: "7px 14px", letterSpacing: "0.3px", textTransform: "uppercase" }}>
                            Contacter
                          </Link>
                        )}
                        {(v.statut === "proposée" || v.statut === "confirmée") && (
                          <button onClick={() => setCancelTarget(v)} type="button"
                            style={{ fontSize: 11, fontWeight: 600, color: km.errText, background: km.errBg, border: `1px solid ${km.errLine}`, borderRadius: 999, padding: "7px 14px", cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.3px", textTransform: "uppercase" }}>
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
