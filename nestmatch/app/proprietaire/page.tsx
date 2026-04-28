"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../lib/supabase"
import AgendaVisites from "../components/AgendaVisites"
import AnnulerVisiteDialog from "../components/AnnulerVisiteDialog"
import { useResponsive } from "../hooks/useResponsive"
import PipelineFunnel from "./PipelineFunnel"
import { annulerVisite, STATUT_VISITE_STYLE as STATUT_V } from "../../lib/visitesHelpers"
import { joursRetardLoyer, labelRetard } from "../../lib/loyerHelpers"
import EmptyState from "../components/ui/EmptyState"
import UndoToast from "../components/ui/UndoToast"
import { useUndo } from "../components/ui/useUndo"
import { postNotif } from "../../lib/notificationsClient"
import { computeBailTimeline } from "../../lib/bailTimeline"
import BailTimeline from "../components/ui/BailTimeline"
import Image from "next/image"
import { km } from "../components/ui/km"

// 4 onglets (refonte 2026-04-24) : ancien onglet global "Candidatures" retire
// — les candidatures sont gerees par bien via /proprietaire/annonces/[id]/candidatures
// (bouton "Candidatures" sur chaque carte de bien dans l'onglet Mes biens).
const ONGLETS = ["Mes biens", "Visites", "Locataires", "Anciens biens", "Stats & paiements"] as const
type Onglet = typeof ONGLETS[number]

/**
 * Graphique SVG "Revenus encaissés sur les 12 derniers mois".
 *
 * Part d'une liste de loyers (table `loyers`, champ `mois` au format YYYY-MM
 * et `statut` confirmé / déclaré). On groupe par mois civil, somme les
 * confirmés, puis on dessine des barres.
 *
 * Mobile-friendly : overflow horizontal, barres resserrées.
 */
function RevenusChart12Mois({ loyers, isMobile }: { loyers: any[]; isMobile: boolean }) {
  // Les 12 derniers mois (inclus le mois courant), du plus ancien à gauche
  const now = new Date()
  const months: { ym: string; label: string }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const label = d.toLocaleDateString("fr-FR", { month: "short" })
    months.push({ ym, label })
  }
  const sums = months.map(m => {
    const total = loyers
      .filter((l: any) => l.mois === m.ym && l.statut === "confirmé")
      .reduce((s: number, l: any) => s + (Number(l.montant) || 0), 0)
    return { ...m, total }
  })
  const maxVal = Math.max(...sums.map(s => s.total), 1)
  const totalCumule = sums.reduce((s, m) => s + m.total, 0)
  const H = 140
  const BAR_W = isMobile ? 24 : 34
  const GAP = isMobile ? 6 : 10
  const totalW = sums.length * (BAR_W + GAP)

  return (
    <section style={{ background: km.white, borderRadius: 20, padding: isMobile ? 18 : 24, marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Revenus 12 derniers mois</h2>
        <p style={{ fontSize: 12, color: km.muted, margin: 0 }}>
          Total encaissé : <strong style={{ color: km.ink }}>{totalCumule.toLocaleString("fr-FR")} €</strong>
        </p>
      </div>
      {totalCumule === 0 ? (
        <p style={{ fontSize: 13, color: km.muted, padding: "20px 0" }}>
          Aucun loyer confirmé sur les 12 derniers mois.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <svg width={Math.max(totalW, 300)} height={H + 36} style={{ display: "block" }} role="img" aria-label="Barres de revenus mensuels">
            {/* Gridlines horizontaux */}
            {[0.25, 0.5, 0.75, 1].map(pct => (
              <line
                key={pct}
                x1={0} y1={H - pct * H}
                x2={totalW} y2={H - pct * H}
                stroke={km.beige} strokeWidth={1}
              />
            ))}
            {sums.map((m, i) => {
              const h = Math.round((m.total / maxVal) * (H - 4))
              const x = i * (BAR_W + GAP)
              const y = H - h
              return (
                <g key={m.ym}>
                  <rect
                    x={x}
                    y={y}
                    width={BAR_W}
                    height={h}
                    fill={m.total > 0 ? km.successText : km.line}
                    rx={4}
                  />
                  {m.total > 0 && (
                    <text
                      x={x + BAR_W / 2}
                      y={y - 4}
                      textAnchor="middle"
                      fontSize={9}
                      fill={km.muted}
                      fontFamily="'DM Sans', sans-serif"
                    >
                      {m.total >= 1000 ? `${Math.round(m.total / 100) / 10}k` : m.total}
                    </text>
                  )}
                  <text
                    x={x + BAR_W / 2}
                    y={H + 16}
                    textAnchor="middle"
                    fontSize={10}
                    fill={km.muted}
                    fontFamily="'DM Sans', sans-serif"
                  >
                    {m.label}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
      )}
    </section>
  )
}

function jours(d: string) {
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
  if (diff === 0) return "Aujourd'hui"
  if (diff === 1) return "Demain"
  if (diff > 0) return `Dans ${diff} j`
  return `Passée`
}

function VisitesProprio({ visites, biens, setVisites, myEmail }: { visites: any[]; biens: any[]; setVisites: any; myEmail?: string | null }) {
  const [filtre, setFiltre] = useState<string>("toutes")
  const [vue, setVue] = useState<"liste" | "agenda">("liste")
  const [cancelTarget, setCancelTarget] = useState<{ v: any; mode: "refus" | "annulation" } | null>(null)
  const { isMobile } = useResponsive()

  async function changerStatut(id: string, statut: string) {
    await supabase.from("visites").update({ statut }).eq("id", id)
    setVisites((prev: any[]) => prev.map(v => v.id === id ? { ...v, statut } : v))
    // Notif locataire : confirmée ou annulée par le proprio
    const v = visites.find(x => x.id === id)
    if (v?.locataire_email && (statut === "confirmée" || statut === "annulée")) {
      const dateStr = v.date_visite ? new Date(v.date_visite).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : ""
      void postNotif({
        userEmail: v.locataire_email,
        type: statut === "confirmée" ? "visite_confirmee" : "visite_annulee",
        title: statut === "confirmée" ? "Visite confirmée" : "Visite annulée",
        body: `${dateStr} à ${v.heure || ""}`,
        href: "/visites",
        relatedId: String(id),
      })
    }
  }

  async function handleAnnulation(motif: string) {
    if (!cancelTarget || !myEmail) return
    const v = cancelTarget.v
    const res = await annulerVisite({
      visiteId: v.id,
      fromEmail: myEmail,
      toEmail: v.locataire_email,
      dateVisite: v.date_visite,
      heureVisite: v.heure,
      motif,
      statutActuel: v.statut,
      annonceId: v.annonce_id ?? null,
    })
    if (res.ok) {
      setVisites((prev: any[]) => prev.map(x => x.id === v.id ? { ...x, statut: "annulée" } : x))
      setCancelTarget(null)
    }
  }

  const filtrées = filtre === "toutes" ? visites : visites.filter(v => v.statut === filtre)
  // "En attente" = demandes qui attendent MA réponse (proposées par le locataire).
  // Les visites que J'AI proposées et pour lesquelles j'attends le locataire
  // ne comptent pas comme une notif (rien à faire de mon côté).
  const nbAttente = visites.filter(v => v.statut === "proposée" && (v.propose_par || "").toLowerCase() !== (myEmail || "").toLowerCase()).length
  const nbConfirmées = visites.filter(v => v.statut === "confirmée").length
  const nbEffectuées = visites.filter(v => v.statut === "effectuée").length

  // Convertir biens[] en Record pour AgendaVisites
  const biensMap: Record<number, any> = {}
  biens.forEach(b => { biensMap[b.id] = b })

  async function changerStatutAgenda(id: string, statut: string) {
    await supabase.from("visites").update({ statut }).eq("id", id)
    setVisites((prev: any[]) => prev.map(v => v.id === id ? { ...v, statut } : v))
    // Même logique notif que changerStatut — duplication assumée (appelé par AgendaVisites)
    const v = visites.find(x => x.id === id)
    if (v?.locataire_email && (statut === "confirmée" || statut === "annulée")) {
      const dateStr = v.date_visite ? new Date(v.date_visite).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : ""
      void postNotif({
        userEmail: v.locataire_email,
        type: statut === "confirmée" ? "visite_confirmee" : "visite_annulee",
        title: statut === "confirmée" ? "Visite confirmée" : "Visite annulée",
        body: `${dateStr} à ${v.heure || ""}`,
        href: "/visites",
        relatedId: String(id),
      })
    }
  }

  return (
    <div>
      {/* Modale d'annulation de visite */}
      <AnnulerVisiteDialog
        open={!!cancelTarget}
        mode={cancelTarget?.mode}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleAnnulation}
      />

      {/* Toggle vue */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <div style={{ display: "flex", background: km.white, borderRadius: 12, padding: 4, gap: 2 }}>
          <button onClick={() => setVue("liste")}
            style={{ padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, background: vue === "liste" ? km.ink : "transparent", color: vue === "liste" ? km.white : km.muted }}>
            Liste
          </button>
          <button onClick={() => setVue("agenda")}
            style={{ padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, background: vue === "agenda" ? km.ink : "transparent", color: vue === "agenda" ? km.white : km.muted }}>
            Agenda
          </button>
        </div>
      </div>

      {/* Vue Agenda */}
      {vue === "agenda" && (
        <AgendaVisites visites={visites} biens={biensMap} mode="proprietaire" onChangerStatut={changerStatutAgenda} myEmail={myEmail} />
      )}

      {vue === "liste" && <>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total demandes", val: visites.length, bg: km.white, color: km.ink },
          { label: "En attente",     val: nbAttente,      bg: nbAttente > 0 ? km.warnBg : km.white, color: nbAttente > 0 ? km.warnText : km.ink },
          { label: "Confirmées",     val: nbConfirmées,   bg: nbConfirmées > 0 ? km.successBg : km.white, color: nbConfirmées > 0 ? km.successText : km.ink },
          { label: "Effectuées",     val: nbEffectuées,   bg: km.white, color: km.ink },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 16, padding: "16px 20px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 12, color: km.muted, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display: "flex", background: km.white, borderRadius: 12, padding: 4, gap: 2, marginBottom: 16, width: isMobile ? "100%" : "fit-content", overflowX: isMobile ? "auto" : undefined }}>
        {["toutes", "proposée", "confirmée", "annulée", "effectuée"].map(f => (
          <button key={f} onClick={() => setFiltre(f)}
            style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, background: filtre === f ? km.ink : "transparent", color: filtre === f ? km.white : km.muted, whiteSpace: "nowrap", flexShrink: 0 }}>
            {f === "toutes" ? "Toutes" : STATUT_V[f]?.label}
            {f !== "toutes" && visites.filter(v => v.statut === f).length > 0 && (
              <span style={{ marginLeft: 4, opacity: 0.7 }}>({visites.filter(v => v.statut === f).length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Liste */}
      {filtrées.length === 0 ? (
        <EmptyState
          title={filtre === "toutes" ? "Aucune visite demandée" : "Aucune visite dans cette catégorie"}
          description={filtre === "toutes" ? "Les demandes de visites de vos locataires apparaîtront ici." : undefined}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtrées.map((v: any) => {
            const bien = biens.find(b => b.id === v.annonce_id)
            const s = STATUT_V[v.statut] ?? STATUT_V["proposée"]
            const photo = Array.isArray(bien?.photos) && bien.photos.length > 0 ? bien.photos[0] : null
            const future = new Date(v.date_visite) >= new Date()
            return (
              <div key={v.id} style={{ background: km.white, borderRadius: 18, border: `1px solid ${v.statut === "proposée" ? km.warnLine : km.line}`, overflow: "hidden", display: "flex", flexDirection: isMobile ? "column" : "row" }}>
                {/* Photo bien */}
                {!isMobile && (
                  photo ? (
                    <div style={{ position: "relative", width: 100, minHeight: 100, flexShrink: 0 }}>
                      <Image src={photo} alt="" fill sizes="100px" style={{ objectFit: "cover" }} />
                    </div>
                  ) : (
                    <div style={{ width: 100, flexShrink: 0, background: km.beige, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: km.muted }}>{(bien?.titre || "B")[0].toUpperCase()}</div>
                  )
                )}

                <div style={{ flex: 1, padding: isMobile ? "14px 16px" : "16px 20px", minWidth: 0 }}>
                  <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "flex-start", marginBottom: 8, gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999 }}>
                          {s.label}
                        </span>
                        {bien && <span style={{ fontSize: 12, color: km.muted }}>{bien.titre} · {bien.ville}</span>}
                      </div>
                      <p style={{ fontWeight: 700, fontSize: isMobile ? 13 : 15, marginTop: 6 }}>
                        {new Date(v.date_visite).toLocaleDateString("fr-FR", { weekday: isMobile ? "short" : "long", day: "numeric", month: isMobile ? "short" : "long" })} à {v.heure}
                        {future && v.statut !== "annulée" && (
                          <span style={{ marginLeft: 8, fontSize: 11, background: km.beige, color: km.muted, padding: "1px 8px", borderRadius: 999, fontWeight: 600 }}>
                            {jours(v.date_visite)}
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Actions — ne pas proposer "Confirmer/Refuser" si c'est MOI qui ai proposé la visite */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {v.statut === "proposée" && (v.propose_par || "").toLowerCase() !== (myEmail || "").toLowerCase() && (
                        <>
                          <button onClick={() => changerStatut(v.id, "confirmée")}
                            style={{ background: km.ink, color: km.white, border: "none", borderRadius: 999, padding: "7px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                            ✓ Confirmer
                          </button>
                          <button onClick={() => setCancelTarget({ v, mode: "refus" })}
                            style={{ background: "none", border: "1px solid #F4C9C9", color: km.errText, borderRadius: 999, padding: "7px 12px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                            Refuser
                          </button>
                        </>
                      )}
                      {v.statut === "proposée" && (v.propose_par || "").toLowerCase() === (myEmail || "").toLowerCase() && (
                        <>
                          <span style={{ fontSize: 11, color: km.muted, fontStyle: "italic", padding: "7px 12px" }}>
                            En attente du locataire
                          </span>
                          <button onClick={() => setCancelTarget({ v, mode: "annulation" })}
                            style={{ background: "none", border: "1px solid #F4C9C9", color: km.errText, borderRadius: 999, padding: "7px 12px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                            Annuler
                          </button>
                        </>
                      )}
                      {v.statut === "confirmée" && (
                        <>
                          <button onClick={() => changerStatut(v.id, "effectuée")}
                            style={{ background: km.beige, border: "none", color: km.ink, borderRadius: 999, padding: "7px 12px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                            Effectuée
                          </button>
                          <button onClick={() => setCancelTarget({ v, mode: "annulation" })}
                            style={{ background: "none", border: "1px solid #F4C9C9", color: km.errText, borderRadius: 999, padding: "7px 12px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                            Annuler
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Locataire + message */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: km.line, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                      {v.locataire_email[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: km.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.locataire_email}</p>
                      {v.message && <p style={{ fontSize: 11, color: km.muted, fontStyle: "italic", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>"{v.message}"</p>}
                    </div>
                    <Link href={`/messages?with=${v.locataire_email}`}
                      style={{ fontSize: 12, fontWeight: 600, color: km.ink, textDecoration: "none", border: "1px solid #EAE6DF", borderRadius: 999, padding: "5px 12px", flexShrink: 0 }}>
                      Message
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
  const myEmail = session?.user?.email?.toLowerCase() ?? null
  const [onglet, setOnglet] = useState<Onglet>("Stats & paiements")
  const [biens, setBiens] = useState<any[]>([])
  const [candidatures, setCandidatures] = useState<any[]>([])
  const [loyers, setLoyers] = useState<any[]>([])
  const [visites, setVisites] = useState<any[]>([])
  const [edls, setEdls] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [supprimerId, setSupprimerId] = useState<number | null>(null)
  const [clicsParBien, setClicsParBien] = useState<Record<number, number>>({})
  // Corbeille locale : garde le bien supprimé optimistiquement pour pouvoir
  // le restaurer si l'user clique "Annuler" dans les 5 sec.
  const [trashBien, setTrashBien] = useState<any | null>(null)

  const {
    pending: pendingSuppression,
    trigger: triggerSuppression,
    undo: cancelSuppression,
  } = useUndo<number>({
    onConfirm: async (id) => {
      // Timer expiré : DELETE réel (cascade visites/messages/carnet/loyers/EDL).
      const res = await fetch(`/api/annonces/${id}`, { method: "DELETE" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        alert(`Suppression échouée : ${json.error || res.statusText}`)
        // Restore depuis le trash puisque le DELETE a foiré
        setTrashBien(prev => {
          if (prev && prev.id === id) setBiens(b => [prev, ...b])
          return null
        })
        return
      }
      setTrashBien(null)
    },
  })

  function handleUndoSuppression() {
    cancelSuppression()
    if (trashBien) setBiens(prev => [trashBien, ...prev])
    setTrashBien(null)
  }

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth")
    if (session?.user?.email) loadData()
  }, [session, status])

  async function loadData() {
    const eo = session!.user!.email!
    const el = eo.toLowerCase()
    const elTrim = el.trim()
    const variants = eo === el ? [eo] : [eo, el]
    const norm = (s: string | null | undefined) => (s || "").toLowerCase().trim()

    // ORDER BY id : garanti d'exister (PRIMARY KEY). `created_at` peut manquer
    // dans les DB qui n'ont pas appliqué la migration 000_baseline.
    const [annRes, msgRes, loyRes, visRes] = await Promise.all([
      supabase.from("annonces").select("*").in("proprietaire_email", variants).order("id", { ascending: false }),
      supabase.from("messages").select("*").in("to_email", variants).order("id", { ascending: false }),
      supabase.from("loyers").select("*").in("proprietaire_email", variants).order("id", { ascending: false }),
      supabase.from("visites").select("*").in("proprietaire_email", variants).order("id", { ascending: false }),
    ])
    let b = annRes.data || []
    if (b.length === 0) {
      const { data: all } = await supabase.from("annonces").select("*").order("id", { ascending: false }).limit(500)
      b = (all || []).filter(a => norm((a as { proprietaire_email?: string | null }).proprietaire_email) === elTrim)
    }
    const m = msgRes.data
    const l = loyRes.data
    const v = visRes.data
    const ve = visRes.error
    if (b) {
      setBiens(b)
      // Charger les clics uniques par bien
      const ids = b.map((a: any) => a.id)
      if (ids.length > 0) {
        const [{ data: clics }, { data: edlRows }] = await Promise.all([
          supabase.from("clics_annonces").select("annonce_id").in("annonce_id", ids),
          supabase.from("etats_des_lieux").select("annonce_id, type, statut, date_edl, created_at").in("annonce_id", ids),
        ])
        if (clics) {
          const map: Record<number, number> = {}
          clics.forEach((c: any) => { map[c.annonce_id] = (map[c.annonce_id] || 0) + 1 })
          setClicsParBien(map)
        }
        setEdls(edlRows || [])
      }
    }
    const candidaturesArr = m ? m.filter((msg: any) => msg.type === "candidature") : []
    if (m) setCandidatures(candidaturesArr)
    if (l) setLoyers(l)
    setVisites(v || [])
    if (ve) console.error("Visites error:", ve.message)

    // Le preload des dossiers candidats a ete retire avec l'ancien onglet
    // global "Candidatures" (2026-04-24). Les dossiers sont desormais charges
    // a la demande par /proprietaire/annonces/[id]/candidatures.

    setLoading(false)
  }

  async function reloadVisites() {
    const email = session?.user?.email
    if (!email) return
    const { data, error } = await supabase.from("visites").select("*").eq("proprietaire_email", email).order("date_visite", { ascending: true })
    if (error) console.error("Visites reload error:", error.message)
    setVisites(data || [])
  }


  async function changerStatut(id: number, statut: string) {
    await supabase.from("annonces").update({ statut }).eq("id", id)
    setBiens(biens.map(b => b.id === id ? { ...b, statut } : b))
  }

  function supprimerBien(id: number) {
    // Optimistic : retire de la UI immédiatement, garde le bien au chaud.
    // Le DELETE API réel est différé 5 sec via useUndo — l'user peut annuler.
    const bien = biens.find(b => b.id === id)
    if (!bien) return
    setBiens(prev => prev.filter(b => b.id !== id))
    setTrashBien(bien)
    setSupprimerId(null)
    triggerSuppression(id)
  }

  async function confirmerLoyer(id: number) {
    // Symétrique avec /proprietaire/stats : confirme + envoie la quittance
    // via messagerie au locataire (card cliquable).
    const loyer = loyers.find(l => l.id === id)
    if (!loyer) return
    const bien = biens.find(b => b.id === loyer.annonce_id)
    const nowIso = new Date().toISOString()
    // V24.1 — via /api/loyers/save mode "confirm" (server-side, proprio-only)
    try {
      await fetch("/api/loyers/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "confirm", id, statut: "confirmé", date_confirmation: nowIso }),
      })
    } catch { /* noop */ }
    setLoyers(loyers.map(l => l.id === id ? { ...l, statut: "confirmé", date_confirmation: nowIso } : l))

    const locataireEmail = (bien?.locataire_email || "").toLowerCase()
    const proprietaireEmail = (bien?.proprietaire_email || myEmail || "").toLowerCase()
    if (!bien || !locataireEmail || !proprietaireEmail) return
    const payload = {
      loyerId: id,
      bienId: bien.id,
      bienTitre: bien.titre,
      mois: loyer.mois,
      montant: loyer.montant,
      dateConfirmation: nowIso,
    }
    const { data: msg } = await supabase.from("messages").insert([{
      from_email: proprietaireEmail,
      to_email: locataireEmail,
      contenu: `[QUITTANCE_CARD]${JSON.stringify(payload)}`,
      lu: false,
      annonce_id: bien.id,
      created_at: nowIso,
    }]).select().single()
    if (msg?.id) {
      // V24.1 — via /api/loyers/save mode "confirm" with quittance fields
      try {
        await fetch("/api/loyers/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "confirm", id,
            quittance_envoyee_at: nowIso,
            quittance_message_id: msg.id,
          }),
        })
      } catch { /* noop */ }
    }

    // Génération PDF serveur + upload Storage + email Resend au locataire
    // (best-effort, ne bloque pas si l'API échoue : la card chat reste OK).
    fetch("/api/loyers/quittance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loyerId: id }),
    }).catch(err => console.error("[confirmerLoyer] quittance API failed", err))

    // Notif cloche locataire : quittance reçue (loyer confirmé)
    void postNotif({
      userEmail: locataireEmail,
      type: "bail_genere",
      title: "Quittance reçue",
      body: `Loyer ${loyer.mois} confirmé pour « ${bien.titre } »`,
      href: "/mes-quittances",
      relatedId: String(id),
    })
  }

  if (status === "loading" || loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: km.muted }}>Chargement...</div>
  )

  const biensDispos = biens.filter(b => !b.statut || b.statut === "disponible").length
  const biensLoues = biens.filter(b => b.statut === "loué").length
  const biensAnciens = biens.filter(b => b.statut === "loue_termine")
  const biensAttenteSignature = biens.filter(b => b.statut === "bail_envoye").length
  const loyersAttendus = loyers.filter(l => l.statut === "déclaré").length
  const loyersConfirmes = loyers.filter(l => l.statut === "confirmé").length

  // Palette handoff 2026-04-24 — badges doux : fond beige/success pastel,
  // pas de couleurs saturees. letterSpacing uniforme applique en inline.
  const statutColor: any = {
    "disponible": { bg: km.successBg, color: km.successText, border: km.successLine },
    "bail_envoye": { bg: km.warnBg, color: km.warnText, border: km.warnLine },
    "loué": { bg: km.beige, color: "#6b6559", border: km.line },
    "en visite": { bg: km.infoBg, color: km.infoText, border: km.infoLine },
    "réservé": { bg: km.warnBg, color: km.warnText, border: km.warnLine },
  }

  // Label affiché pour le statut (surcharge les clés brutes de la DB)
  const statutLabel: Record<string, string> = {
    bail_envoye: "En attente signature",
  }

  // Prénom pour l'accent italique Fraunces du titre (calque dashboard.jsx L74-77)
  // session.user.name est typiquement "Prénom Nom" — on garde juste le premier mot.
  // Fallback sur local-part de l'email si name absent.
  const ownerFirstName = (() => {
    const name = session?.user?.name?.trim() || ""
    if (name) return name.split(/\s+/)[0]
    const email = session?.user?.email || ""
    const local = email.split("@")[0] || ""
    return local ? local.charAt(0).toUpperCase() + local.slice(1) : ""
  })()
  const biensActifs = biens.filter((b: any) => b.statut !== "loué" && b.statut !== "retire").length

  return (
    <main style={{ minHeight: "100vh", background: km.beige, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;1,9..144,300;1,9..144,400&display=swap');
        .km-serif { font-family: 'Fraunces', Georgia, serif; font-feature-settings: 'ss01'; }
      `}</style>

      {pendingSuppression !== null && (
        <UndoToast
          message="Annonce supprimée — visites, messages et documents liés seront perdus"
          onUndo={handleUndoSuppression}
        />
      )}

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? "24px 16px" : "32px 48px" }}>

        {/* V10.5 — Header éditorial align avec /dossier : eyebrow row avec
            rule horizontal hairline + titre Fraunces accent + meta droite,
            puis sous-titre stats. Pattern identique a DossierHero pour
            coherence visuelle quand l'user switch role locataire/proprio. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "2.2px", textTransform: "uppercase", color: "#666" }}>
            Mon espace propriétaire
          </span>
          <span style={{ flex: 1, height: 1, background: "#EAE6DF", maxWidth: 220, minWidth: 40 }} aria-hidden="true" />
          <span style={{ fontSize: 11, color: "#8a8477", fontVariantNumeric: "tabular-nums" }}>
            {biens.length} {biens.length > 1 ? "annonces" : "annonce"}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "flex-end", marginBottom: 28, flexDirection: isMobile ? "column" : "row", gap: isMobile ? 14 : 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: isMobile ? 36 : 56, fontWeight: 300, letterSpacing: isMobile ? "-1.2px" : "-1.6px", margin: 0, lineHeight: 1.05, color: km.ink, fontFamily: "'Fraunces', Georgia, serif", fontFeatureSettings: "'ss01'" }}>
              Tableau de bord
              {ownerFirstName && (
                <>
                  <br />
                  <span
                    className="km-serif"
                    style={{ fontStyle: "italic", fontWeight: 300, color: km.muted }}
                  >
                    {ownerFirstName}.
                  </span>
                </>
              )}
            </h1>
            <p style={{ fontSize: 14, color: "#666", margin: "14px 0 0", lineHeight: 1.5, maxWidth: 520 }}>
              {biens.length === 0
                ? "Aucun bien en gestion pour le moment."
                : `${biens.length} annonce${biens.length > 1 ? "s" : ""} · ${biensActifs} active${biensActifs > 1 ? "s" : ""}${loyersAttendus > 0 ? ` · ${loyersAttendus} loyer${loyersAttendus > 1 ? "s" : ""} à confirmer` : ""}`}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/proprietaire/bail/importer" title="Importer un bail signé hors plateforme et inviter le locataire à le valider"
              style={{ background: "transparent", color: km.ink, padding: "11px 22px", borderRadius: 999, textDecoration: "none", fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", border: `1px solid ${km.line}` }}>
              Importer un bail
            </Link>
            <a href="/proprietaire/ajouter" style={{ background: km.ink, color: km.white, padding: "11px 22px", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}>
              + Ajouter un bien
            </a>
          </div>
        </div>

        {/* ── Stat tiles dashboard cliquables (HAUTE #3 du flow plan) ──
            Vue at-a-glance : combien d'actions sont en attente côté proprio.
            Click = bascule sur l'onglet pertinent. */}
        {biens.length > 0 && (() => {
          const nbCandidaturesActives = candidatures.filter((c: any) => {
            const ann = biens.find(b => b.id === c.annonce_id)
            return ann && ann.statut !== "loue_termine"
          }).length
          const nbVisitesAttente = visites.filter(v => v.statut === "proposée" && (v.propose_par || "").toLowerCase() !== (myEmail || "").toLowerCase()).length
          const tiles = [
            { label: "Biens disponibles", val: biensDispos, accent: km.successBg, color: km.successText, target: "Mes biens" as const },
            { label: "Candidatures", val: nbCandidaturesActives, accent: km.beige, color: km.ink, target: "Mes biens" as const },
            { label: "Visites en attente", val: nbVisitesAttente, accent: nbVisitesAttente > 0 ? "#FEF3E2" : km.beige, color: nbVisitesAttente > 0 ? "#A45A19" : km.muted, target: "Visites" as const },
            { label: "Loyers à confirmer", val: loyersAttendus, accent: loyersAttendus > 0 ? km.warnBg : km.beige, color: loyersAttendus > 0 ? km.warnText : km.muted, target: "Locataires" as const },
          ]
          return (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: isMobile ? 10 : 14, marginBottom: 24 }}>
              {tiles.map(t => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => setOnglet(t.target)}
                  style={{
                    background: t.accent,
                    border: `1px solid ${km.line}`,
                    borderRadius: 18,
                    padding: isMobile ? "16px 18px" : "18px 22px",
                    textAlign: "left" as const,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "transform 0.15s, box-shadow 0.15s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.06)" }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "none" }}
                >
                  <div style={{ fontSize: isMobile ? 24 : 28, fontWeight: 700, color: t.color, letterSpacing: "-0.6px", lineHeight: 1, fontVariantNumeric: "tabular-nums" as const }}>{t.val}</div>
                  <div style={{ fontSize: 10, color: km.muted, marginTop: 8, textTransform: "uppercase" as const, letterSpacing: "1.2px", fontWeight: 700 }}>{t.label}</div>
                </button>
              ))}
            </div>
          )
        })()}

        {/* Onglets */}
        <div style={{ display: "flex", gap: 6, marginBottom: 24, background: km.white, borderRadius: 14, padding: 6, width: isMobile ? "100%" : "fit-content", overflowX: isMobile ? "auto" : undefined }}>
          {ONGLETS.map(o => {
            const nbVisitesAttente = visites.filter(v => v.statut === "proposée" && (v.propose_par || "").toLowerCase() !== (myEmail || "").toLowerCase()).length
            return (
              <button key={o} onClick={() => { setOnglet(o); if (o === "Visites") reloadVisites() }}
                style={{ padding: "8px 18px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit", background: onglet === o ? km.ink : "transparent", color: onglet === o ? km.white : km.muted, transition: "all 0.15s", whiteSpace: "nowrap", flexShrink: 0 }}>
                {o}
                {o === "Locataires" && loyersAttendus > 0 && (
                  <span style={{ marginLeft: 6, background: km.errText, color: km.white, borderRadius: 999, fontSize: 10, padding: "1px 6px", fontWeight: 700 }}>{loyersAttendus}</span>
                )}
                {o === "Visites" && nbVisitesAttente > 0 && (
                  <span style={{ marginLeft: 6, background: "#f97316", color: km.white, borderRadius: 999, fontSize: 10, padding: "1px 6px", fontWeight: 700 }}>{nbVisitesAttente}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* TABLEAU DE BORD — KPIs opérationnels (cliquables pour naviguer) */}
        {onglet === "Stats & paiements" && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: isMobile ? 12 : 18, marginBottom: 24 }}>
            {[
              { label: "Biens disponibles", val: biensDispos, color: km.successText, bg: km.successBg, targetOnglet: "Mes biens" as const },
              { label: "Biens loués",       val: biensLoues, color: km.muted, bg: km.beige, targetOnglet: "Locataires" as const },
              { label: "Loyers à confirmer", val: loyersAttendus, color: km.warnText, bg: loyersAttendus > 0 ? km.warnBg : km.white, targetOnglet: "Locataires" as const },
              { label: "Loyers confirmés",  val: loyersConfirmes, color: km.successText, bg: km.white, targetOnglet: "Locataires" as const },
            ].map(s => (
              <button
                key={s.label}
                onClick={() => setOnglet(s.targetOnglet)}
                style={{
                  background: s.bg, borderRadius: 20, padding: isMobile ? "18px 20px" : "24px 28px",
                  border: "1px solid #F7F4EF", textAlign: "left", cursor: "pointer",
                  fontFamily: "inherit", transition: "transform 0.15s, box-shadow 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.06)" }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "none" }}
              >
                <div style={{ fontSize: isMobile ? 32 : 40, fontWeight: 800, color: s.color, letterSpacing: "-1px", lineHeight: 1 }}>{s.val}</div>
                <div style={{ fontSize: 12, color: km.muted, marginTop: 8, fontWeight: 600 }}>{s.label}</div>
              </button>
            ))}
          </div>
        )}

        {/* Alerte loyers — toujours visible en haut de Statistiques */}
        {onglet === "Stats & paiements" && loyersAttendus > 0 && (
          <div style={{ background: km.warnBg, border: "1px solid #EADFC6", borderRadius: 14, padding: isMobile ? "12px 16px" : "14px 20px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <p style={{ fontSize: isMobile ? 13 : 14, fontWeight: 600, color: km.warnText }}>{loyersAttendus} paiement{loyersAttendus > 1 ? "s" : ""} en attente</p>
            <button onClick={() => setOnglet("Locataires")} style={{ background: km.warnText, color: km.white, border: "none", borderRadius: 999, padding: "6px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Voir</button>
          </div>
        )}

        {/* MES BIENS — grille 2 cols cards photo hero 16/10 fidèle handoff (3) pages.jsx l. 741-770 */}
        {onglet === "Mes biens" && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 14 }}>
            {/* Style global :has() — quand le menu ⋯ d'une card est ouvert,
                on bump le z-index de cette card pour que son dropdown passe
                au-dessus de la card sœur dans la grille. Sans ça, le menu
                était visible mais clipé/recouvert par la voisine. */}
            <style dangerouslySetInnerHTML={{ __html: `.km-bien-card:has(details[open]) { z-index: 50; }` }} />
            {biens.filter(b => b.statut !== "loue_termine").length === 0 ? (
              <div style={{ gridColumn: isMobile ? "1" : "1 / -1" }}>
                <EmptyState
                  title="Aucun bien publié"
                  description="Commencez par créer votre première annonce pour recevoir des candidatures."
                  ctaLabel="Ajouter un bien"
                  ctaHref="/proprietaire/ajouter"
                />
              </div>
            ) : biens.filter(b => b.statut !== "loue_termine").map(b => {
              const statutKey = b.statut || "disponible"
              const badgeStyle = statutColor[statutKey] || statutColor["disponible"]
              const nbCand = candidatures.filter((c: any) => c.annonce_id === b.id).length
              const photoHero = Array.isArray(b.photos) && b.photos.length > 0 ? b.photos[0] : null
              return (
              <div key={b.id} className="km-bien-card" style={{ background: km.white, border: "1px solid #EAE6DF", borderRadius: 20, fontFamily: "'DM Sans', sans-serif", boxShadow: "0 1px 2px rgba(0,0,0,0.02)", display: "flex", flexDirection: "column", position: "relative" }}>
                {/* overflow:hidden retiré du card root (clippait le dropdown ⋯ — bug Paul 2026-04-26).
                    Borderradius top-only délégué à la photo hero, le footer
                    actions hérite naturellement du radius bottom du card. */}
                {/* Photo hero 16/10 + pill statut overlay top-left + badge candidatures overlay top-right */}
                <div style={{ position: "relative", aspectRatio: "16 / 10", background: photoHero ? `#000 url(${photoHero}) center/cover no-repeat` : `linear-gradient(135deg, ${km.beige}, ${km.line})`, borderRadius: "20px 20px 0 0", overflow: "hidden" }}>
                  <span style={{ position: "absolute", top: 14, left: 14, background: badgeStyle.bg, color: badgeStyle.color, border: `1px solid ${badgeStyle.border || km.line}`, padding: "5px 12px", borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px" }}>
                    {statutLabel[b.statut || ""] || b.statut || "disponible"}
                  </span>
                  {nbCand > 0 && (
                    <span style={{ position: "absolute", top: 14, right: 14, background: "rgba(0,0,0,0.78)", color: "#fff", padding: "6px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700, backdropFilter: "blur(6px)" }}>
                      {nbCand} candidature{nbCand > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div style={{ padding: isMobile ? 18 : 22, display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
                  {/* Alerte expiration 45j sans update — conservée mais compacte */}
                  {(() => {
                    const baseDate = b.updated_at || b.created_at
                    if (!baseDate || (b.statut && b.statut !== "disponible")) return null
                    const jours = Math.floor((Date.now() - new Date(baseDate).getTime()) / (1000 * 60 * 60 * 24))
                    if (jours < 45) return null
                    return (
                      <div style={{ background: km.warnBg, border: "1px solid #EADFC6", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                        <p style={{ fontSize: 12, color: km.warnText, margin: 0, lineHeight: 1.4 }}>
                          <strong style={{ fontWeight: 600 }}>{jours}j sans màj.</strong> Pensez à rafraîchir.
                        </p>
                        <a href={`/proprietaire/modifier/${b.id}`} style={{ fontSize: 10, fontWeight: 700, color: km.warnText, textDecoration: "none", padding: "5px 11px", border: "1px solid #EADFC6", borderRadius: 999, background: km.white, flexShrink: 0, letterSpacing: "0.3px", textTransform: "uppercase" }}>
                          Rafraîchir
                        </a>
                      </div>
                    )
                  })()}

                  {/* Titre + adresse */}
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, letterSpacing: "-0.2px", color: km.ink, lineHeight: 1.3 }}>{b.titre}</h3>
                    <p style={{ color: km.muted, fontSize: 12, margin: "4px 0 0", letterSpacing: "0.1px" }}>{b.adresse}{b.adresse && b.ville ? " · " : ""}{b.ville}</p>
                  </div>

                  {/* Mini timeline étapes — visibilité du flow par bien (HAUTE #1)
                      Étapes : Publié / Candidatures / Visite / Bail / Loué.
                      Done si statut atteint, active sur l'étape courante. */}
                  {(() => {
                    const hasVisiteForBien = visites.some((v: any) => v.annonce_id === b.id && (v.statut === "confirmée" || v.statut === "effectuée"))
                    const isLoue = b.statut === "loué" && !!b.locataire_email
                    const hasBailGenere = !!(b.bail_genere_at || isLoue || b.statut === "bail_envoye")
                    // Active step = première étape non-done (capped). Visite est
                    // forcée done si bien loué : impossible de louer sans visite,
                    // l'historique de la table `visites` peut avoir été purgé
                    // après la signature (Paul 2026-04-26).
                    const stepDone = [
                      true, // Publié (toujours)
                      nbCand > 0,
                      hasVisiteForBien || isLoue,
                      hasBailGenere,
                      isLoue,
                    ]
                    const activeIdx = stepDone.findIndex(d => !d)
                    const currentStep = activeIdx === -1 ? 5 : activeIdx
                    const labels = ["Publié", "Candidat", "Visite", "Bail", "Loué"]
                    return (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, paddingTop: 6 }}>
                        {labels.map((l, i) => {
                          const done = stepDone[i]
                          const active = i === currentStep
                          return (
                            <div key={l} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, position: "relative" }}>
                              <div style={{
                                width: 14, height: 14, borderRadius: "50%",
                                background: done ? km.ink : km.white,
                                border: active ? "2px solid #111" : `1px solid ${km.line}`,
                                color: done ? km.white : km.muted,
                                fontSize: 8, fontWeight: 700,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                flexShrink: 0,
                                zIndex: 2,
                              }}>
                                {done ? (
                                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                ) : (i + 1)}
                              </div>
                              <span style={{ fontSize: 9, fontWeight: 600, color: active ? km.ink : done ? km.muted : "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.4px", whiteSpace: "nowrap" }}>{l}</span>
                              {/* Trait entre les étapes */}
                              {i < labels.length - 1 && (
                                <div style={{ position: "absolute", top: 6, left: "calc(50% + 8px)", right: "calc(-50% + 8px)", height: 1, background: stepDone[i + 1] ? km.ink : km.line, zIndex: 1 }} />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}

                  {/* Separator + ligne specs/prix tabular (handoff strict) */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: 12, borderTop: `1px solid ${km.line}`, gap: 8, fontSize: 12, color: km.muted, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: 12 }}>
                      <span>{b.surface} m²</span>
                      <span>{b.pieces} p.</span>
                      {b.meuble && <span>Meublé</span>}
                    </div>
                    <span style={{ fontSize: 18, fontWeight: 700, color: km.ink, fontVariantNumeric: "tabular-nums" as const, letterSpacing: "-0.3px" }}>
                      {b.prix} €<span style={{ fontSize: 10, color: km.muted, fontWeight: 400 }}>/mois</span>
                    </span>
                  </div>

                  {/* Actions row — wrap, CTA principal d'abord, sec ensuite */}
                  <div style={{ display: "flex", gap: 6, marginTop: "auto", flexWrap: "wrap", paddingTop: 4 }}>
                    <a href={`/proprietaire/annonces/${b.id}/candidatures`}
                      style={{ flex: "1 1 auto", textAlign: "center", padding: "9px 14px", border: "none", borderRadius: 999, textDecoration: "none", color: km.white, background: km.ink, fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, letterSpacing: "0.3px", fontFamily: "inherit", whiteSpace: "nowrap", textTransform: "uppercase" as const }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                      Candidatures{nbCand > 0 ? ` (${nbCand})` : ""}
                    </a>
                    <a href={`/proprietaire/modifier/${b.id}`} style={{ padding: "9px 14px", border: "1px solid #EAE6DF", borderRadius: 999, textDecoration: "none", color: km.ink, fontSize: 11, fontWeight: 600, letterSpacing: "0.2px", background: km.white, fontFamily: "inherit" }}>
                      Modifier
                    </a>
                    {/* Menu • • • compresse les autres actions */}
                    <details style={{ position: "relative" }}>
                      <summary style={{ padding: "9px 12px", border: "1px solid #EAE6DF", borderRadius: 999, color: km.muted, fontSize: 11, fontWeight: 600, cursor: "pointer", listStyle: "none", background: km.white, userSelect: "none" as const }}>
                        ⋯
                      </summary>
                      <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: km.white, border: "1px solid #EAE6DF", borderRadius: 12, padding: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 100, minWidth: 180, display: "flex", flexDirection: "column", gap: 2 }}>
                        <a href={`/proprietaire/stats?id=${b.id}`} style={{ padding: "8px 12px", borderRadius: 8, textDecoration: "none", color: km.ink, fontSize: 12, fontWeight: 600 }}>Statistiques</a>
                        <a href={`/annonces/${b.id}`} style={{ padding: "8px 12px", borderRadius: 8, textDecoration: "none", color: km.ink, fontSize: 12, fontWeight: 600 }}>Voir l&apos;annonce</a>
                        <div style={{ height: 1, background: km.line, margin: "4px 0" }} />
                        <label style={{ padding: "6px 12px 8px", display: "block", fontSize: 11, fontWeight: 700, color: km.muted, textTransform: "uppercase" as const, letterSpacing: "0.6px" }}>Statut</label>
                        <select
                          value={b.statut || "disponible"}
                          onChange={e => changerStatut(b.id, e.target.value)}
                          style={{ padding: "8px 12px", border: "1px solid #EAE6DF", borderRadius: 8, fontSize: 12, fontFamily: "inherit", cursor: "pointer", outline: "none", background: km.white, color: km.ink, fontWeight: 600, margin: "0 6px 6px" }}>
                          <option value="disponible">Disponible</option>
                          <option value="en visite">En visite</option>
                          <option value="réservé">Réservé</option>
                          <option value="loué">Loué</option>
                        </select>
                        <div style={{ height: 1, background: km.line, margin: "4px 0" }} />
                        {supprimerId === b.id ? (
                          <div style={{ display: "flex", gap: 4, padding: "4px 6px" }}>
                            <button onClick={() => supprimerBien(b.id)} style={{ flex: 1, background: km.errText, color: km.white, border: "none", borderRadius: 8, padding: "8px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Confirmer</button>
                            <button onClick={() => setSupprimerId(null)} style={{ flex: 1, background: km.white, color: km.muted, border: `1px solid ${km.line}`, borderRadius: 8, padding: "8px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
                          </div>
                        ) : (
                          <button onClick={() => setSupprimerId(b.id)} style={{ padding: "8px 12px", border: "none", borderRadius: 8, color: km.errText, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", background: "transparent", textAlign: "left" as const }}>
                            Supprimer
                          </button>
                        )}
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            )})}
          </div>
        )}

        {/* ─── ANCIENS BIENS — annonces avec statut loue_termine ──────────
             L'historique reste consultable : liens vers stats, EDL, messages.
             Pas de bouton "Modifier" — un bail terminé ne se réédite pas. */}
        {onglet === "Anciens biens" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {biensAnciens.length === 0 ? (
              <EmptyState
                title="Aucun ancien bien"
                description="Vos biens dont le bail a pris fin apparaîtront ici. Vous pourrez consulter l'historique des locataires, échanges et documents."
              />
            ) : biensAnciens.map(b => {
              const fin = b.bail_termine_at
                ? new Date(b.bail_termine_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
                : "—"
              return (
                <div key={b.id} style={{ background: km.white, border: "1px solid #EAE6DF", borderRadius: 20, padding: isMobile ? 20 : 26, fontFamily: "'DM Sans', sans-serif", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
                  <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "flex-start", gap: 16 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                        <h3 style={{ fontSize: isMobile ? 16 : 18, fontWeight: 600, margin: 0, letterSpacing: "-0.2px", color: km.ink }}>{b.titre}</h3>
                        <span style={{ background: km.beige, color: "#6b6559", border: `1px solid ${km.line}`, padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px" }}>
                          Bail terminé
                        </span>
                      </div>
                      <p style={{ color: km.muted, fontSize: 13, margin: 0 }}>{b.adresse} · {b.ville}</p>
                      <p style={{ color: "#6b6559", fontSize: 12, margin: "10px 0 0" }}>
                        Fin de bail : <strong>{fin}</strong>
                        {b.locataire_email_at_end && <> · Dernier locataire : {b.locataire_email_at_end}</>}
                      </p>
                    </div>
                    <div style={{ display: "flex", flexDirection: isMobile ? "row" : "column", gap: 8, flexWrap: "wrap" }}>
                      <a href={`/proprietaire/stats?id=${b.id}`} style={{ textAlign: "center", padding: "9px 16px", border: "1px solid #EAE6DF", borderRadius: 999, textDecoration: "none", color: km.ink, fontSize: 11, fontWeight: 600, letterSpacing: "0.3px", background: km.white }}>
                        Historique loyers
                      </a>
                      <a href={`/messages?annonce=${b.id}`} style={{ textAlign: "center", padding: "9px 16px", border: "1px solid #EAE6DF", borderRadius: 999, textDecoration: "none", color: km.ink, fontSize: 11, fontWeight: 600, letterSpacing: "0.3px", background: km.white }}>
                        Messages archivés
                      </a>
                      <a href={`/annonces/${b.id}`} style={{ textAlign: "center", padding: "9px 16px", border: "1px solid #EAE6DF", borderRadius: 999, textDecoration: "none", color: km.muted, fontSize: 11, fontWeight: 600, letterSpacing: "0.3px", background: km.white }}>
                        Voir la fiche
                      </a>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* MES LOCATAIRES — biens avec locataire_email + bail envoyé ou signé */}
        {onglet === "Locataires" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {(() => {
              // On inclut aussi les biens "bail_envoye" (en attente signature locataire)
              // pour que le proprio puisse suivre la progression depuis cet onglet.
              const actifs = biens.filter((b: any) =>
                (b.statut === "loué" || b.statut === "bail_envoye") && b.locataire_email,
              )
              if (actifs.length === 0) return (
                <EmptyState
                  title="Aucun locataire actif"
                  description="Dès qu'un bail sera envoyé ou signé sur l'un de vos biens, le locataire apparaîtra ici."
                />
              )
              const moisCourant = new Date().toISOString().slice(0, 7) // YYYY-MM
              return actifs.map((b: any) => {
                const loyersBien = loyers.filter((l: any) => l.annonce_id === b.id)
                const moisLoyers = loyersBien.filter((l: any) => l.statut === "confirmé").length
                const loyerDuMois = loyersBien.find((l: any) => l.mois === moisCourant)
                const loyerMoisStatut: "paye" | "declare" | "absent" =
                  loyerDuMois?.statut === "confirmé" ? "paye"
                  : loyerDuMois?.statut === "déclaré" ? "declare"
                  : "absent"
                // Détecter retard sur TOUT loyer non confirmé, pas seulement celui du mois.
                const retardsBien = loyersBien
                  .map((l: any) => ({ l, jours: joursRetardLoyer(l.mois, l.statut) }))
                  .filter((x: any) => x.jours > 0)
                const retardPlusAncien = retardsBien.reduce((m: any, x: any) => x.jours > (m?.jours || 0) ? x : m, null as any)
                const loyerMoisStyle =
                  loyerMoisStatut === "paye"    ? { bg: km.successBg, color: km.successText, border: km.successLine, label: "Loyer du mois reçu" }
                  : loyerMoisStatut === "declare" ? { bg: km.warnBg, color: km.warnText, border: km.warnLine, label: "Loyer du mois en attente" }
                  : { bg: km.errBg, color: km.errText, border: km.errLine, label: "Loyer du mois à déclarer" }
                const edlsBien = edls.filter((e: any) => e.annonce_id === b.id)
                const timelineSteps = computeBailTimeline({
                  annonce: { id: b.id, statut: b.statut, bail_genere_at: b.bail_genere_at, date_debut_bail: b.date_debut_bail },
                  edls: edlsBien,
                  loyers: loyersBien,
                  role: "proprietaire",
                })
                return (
                  <div key={b.id} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ background: km.white, border: "1px solid #EAE6DF", borderRadius: 20, padding: isMobile ? 20 : 26, display: "flex", flexDirection: isMobile ? "column" : "row", gap: 20, alignItems: isMobile ? "stretch" : "flex-start", fontFamily: "'DM Sans', sans-serif", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                          <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0, letterSpacing: "-0.2px", color: km.ink }}>{b.titre}</h3>
                          <span style={{ background: km.successBg, color: km.successText, border: "1px solid #C6E9C0", padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px" }}>Bail actif</span>
                          <span style={{ background: loyerMoisStyle.bg, color: loyerMoisStyle.color, border: `1px solid ${loyerMoisStyle.border}`, padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px" }}>{loyerMoisStyle.label}</span>
                          {retardPlusAncien && (
                            <span title={`Loyer de ${new Date(retardPlusAncien.l.mois + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })} en retard`} style={{ background: km.errBg, color: km.errText, padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 700, border: "1px solid #F4C9C9", textTransform: "uppercase", letterSpacing: "1.2px" }}>
                              {labelRetard(retardPlusAncien.jours)}{retardsBien.length > 1 ? ` · ${retardsBien.length} mois` : ""}
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: 13, color: km.muted, margin: "0 0 14px", letterSpacing: "0.1px" }}>{b.adresse ? b.adresse + " · " : ""}{b.ville}</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 13, lineHeight: 1.5 }}>
                          <div><span style={{ color: km.muted }}>Locataire · </span><strong style={{ fontWeight: 600, color: km.ink }}>{b.locataire_email}</strong></div>
                          {b.date_debut_bail && <div><span style={{ color: km.muted }}>Début du bail · </span><strong style={{ fontWeight: 600, color: km.ink }}>{new Date(b.date_debut_bail).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</strong></div>}
                          <div><span style={{ color: km.muted }}>Loyer · </span><strong style={{ fontWeight: 600, color: km.ink }}>{(b.prix || 0) + (b.charges || 0)} €</strong> <span style={{ color: km.muted }}>/ mois</span></div>
                          <div><span style={{ color: km.muted }}>Loyers confirmés · </span><strong style={{ fontWeight: 600, color: km.ink }}>{moisLoyers}</strong></div>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: isMobile ? "row" : "column", gap: 8, flexWrap: "wrap", minWidth: isMobile ? "auto" : 200 }}>
                        {loyerMoisStatut !== "paye" && (
                          <a href={`/proprietaire/stats?id=${b.id}`} style={{ background: km.ink, color: km.white, borderRadius: 999, padding: "11px 18px", textDecoration: "none", fontSize: 12, fontWeight: 600, textAlign: "center", flex: isMobile ? 1 : undefined, letterSpacing: "0.3px", fontFamily: "inherit" }}>
                            {loyerMoisStatut === "declare" ? "Confirmer loyer" : "Déclarer loyer"}
                          </a>
                        )}
                        <a href={`/messages?with=${encodeURIComponent(b.locataire_email)}`} style={{ background: loyerMoisStatut === "paye" ? km.ink : km.white, color: loyerMoisStatut === "paye" ? km.white : km.ink, border: loyerMoisStatut === "paye" ? "none" : "1px solid #EAE6DF", borderRadius: 999, padding: "11px 18px", textDecoration: "none", fontSize: 12, fontWeight: 600, textAlign: "center", flex: isMobile ? 1 : undefined, letterSpacing: "0.3px", fontFamily: "inherit" }}>Message</a>
                        <a href={`/annonces/${b.id}`} target="_blank" rel="noopener noreferrer" style={{ background: km.white, border: "1px solid #EAE6DF", color: km.ink, borderRadius: 999, padding: "9px 18px", textDecoration: "none", fontSize: 11, fontWeight: 600, textAlign: "center", flex: isMobile ? 1 : undefined, letterSpacing: "0.3px", fontFamily: "inherit" }}>Voir l&apos;annonce</a>
                        <a href={`/proprietaire/bail/${b.id}`} style={{ background: km.white, border: "1px solid #EAE6DF", color: km.ink, borderRadius: 999, padding: "9px 18px", textDecoration: "none", fontSize: 11, fontWeight: 600, textAlign: "center", flex: isMobile ? 1 : undefined, letterSpacing: "0.3px", fontFamily: "inherit" }}>Bail</a>
                        <a href={`/proprietaire/edl/${b.id}?type=entree`} style={{ background: km.white, border: "1px solid #EAE6DF", color: km.ink, borderRadius: 999, padding: "9px 18px", textDecoration: "none", fontSize: 11, fontWeight: 600, textAlign: "center", flex: isMobile ? 1 : undefined, letterSpacing: "0.3px", fontFamily: "inherit" }}>EDL entrée</a>
                        <a href={`/proprietaire/edl/${b.id}?type=sortie`} style={{ background: km.white, border: "1px solid #EAE6DF", color: km.ink, borderRadius: 999, padding: "9px 18px", textDecoration: "none", fontSize: 11, fontWeight: 600, textAlign: "center", flex: isMobile ? 1 : undefined, letterSpacing: "0.3px", fontFamily: "inherit" }}>EDL sortie</a>
                      </div>
                    </div>
                    <BailTimeline steps={timelineSteps} />
                  </div>
                )
              })
            })()}
          </div>
        )}

        {/* PERFORMANCE — vue agrégée + pipeline + détail par bien */}
        {onglet === "Stats & paiements" && biens.length > 0 && (
          <div>
            {biens.length === 0 ? (
              <EmptyState
                title="Aucun bien publié"
                description="Ajoutez un bien pour voir vos statistiques."
                ctaLabel="Ajouter un bien"
                ctaHref="/proprietaire/ajouter"
              />
            ) : (
              <>
                {/* Vue financière globale */}
                {(() => {
                  const revenusConfirmes = loyers.filter((l: any) => l.statut === "confirmé").reduce((s: number, l: any) => s + (Number(l.montant) || 0), 0)
                  const loyerTheoriqueTotal = biens.filter((b: any) => b.statut === "loué").reduce((s: number, b: any) => s + (Number(b.prix) || 0) + (Number(b.charges) || 0), 0)
                  const patrimoineTotal = biens.reduce((s: number, b: any) => s + (Number(b.valeur_bien) || 0), 0)
                  const creditMensuelTotal = biens.reduce((s: number, b: any) => s + (Number(b.mensualite_credit) || 0), 0)
                  const cashflowMensuelTotal = loyerTheoriqueTotal - creditMensuelTotal

                  return (
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? 12 : 18, marginBottom: 24 }}>
                      {[
                        { label: "Revenus confirmés", val: `${revenusConfirmes.toLocaleString("fr-FR")} €`, sub: "cumul toutes périodes", color: km.successText, bg: km.successBg },
                        { label: "Loyers mensuels", val: `${loyerTheoriqueTotal.toLocaleString("fr-FR")} €`, sub: `${biens.filter((b: any) => b.statut === "loué").length} bien(s) loué(s)`, color: km.ink, bg: km.white },
                        { label: "Cashflow mensuel", val: `${cashflowMensuelTotal >= 0 ? "+" : ""}${cashflowMensuelTotal.toLocaleString("fr-FR")} €`, sub: "après crédit", color: cashflowMensuelTotal >= 0 ? km.successText : km.errText, bg: cashflowMensuelTotal >= 0 ? km.successBg : "#fef2f2" },
                        { label: "Valeur patrimoine", val: patrimoineTotal > 0 ? `${Math.round(patrimoineTotal / 1000)} k€` : "—", sub: "somme des biens", color: km.ink, bg: km.white },
                      ].map(s => (
                        <div key={s.label} style={{ background: s.bg, borderRadius: 20, padding: isMobile ? "18px 20px" : "22px 26px", border: "1px solid #F7F4EF" }}>
                          <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, color: s.color, letterSpacing: "-0.5px", lineHeight: 1.1 }}>{s.val}</div>
                          <div style={{ fontSize: 12, color: km.muted, marginTop: 8, fontWeight: 600 }}>{s.label}</div>
                          <div style={{ fontSize: 11, color: km.muted, marginTop: 2 }}>{s.sub}</div>
                        </div>
                      ))}
                    </div>
                  )
                })()}

                {/* Graphique revenus 12 derniers mois */}
                <RevenusChart12Mois loyers={loyers} isMobile={isMobile} />

                {/* Pipeline candidats (aussi visible ici) */}
                <PipelineFunnel biens={biens} candidatures={candidatures} visites={visites} clicsParBien={clicsParBien} />

                {/* KPIs marketing (ex-Performance) */}
                <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 14, marginTop: 8 }}>Activité sur les annonces</h2>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? 10 : 16, marginBottom: 24 }}>
                  {[
                    { label: "Clics uniques", val: Object.values(clicsParBien).reduce((s: number, v: number) => s + v, 0), color: km.infoText, bg: km.infoBg },
                    { label: "Messages reçus", val: candidatures.length, color: km.successText, bg: km.successBg },
                    { label: "Visites demandées", val: visites.length, color: km.warnText, bg: km.warnBg },
                    { label: "Biens actifs", val: biens.filter((b: any) => !b.statut || b.statut === "disponible").length, color: km.ink, bg: km.white },
                  ].map(s => (
                    <div key={s.label} style={{ background: s.bg, borderRadius: 16, padding: "20px 24px" }}>
                      <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.val}</div>
                      <div style={{ fontSize: 12, color: km.muted, marginTop: 4 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Detail par bien — cliquable, mène aux stats détaillées */}
                <div style={{ background: km.white, borderRadius: 20, padding: isMobile ? 18 : 24 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 800 }}>Détail par bien</h2>
                    <p style={{ fontSize: 12, color: km.muted }}>Cliquez sur un bien pour voir ses statistiques détaillées</p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {/* Header */}
                    {!isMobile && (
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 40px", gap: 12, padding: "10px 16px", background: km.beige, borderRadius: "10px 10px 0 0" }}>
                        {["Bien", "Clics uniques", "Messages", "Visites", "Taux conv.", ""].map((h, i) => (
                          <span key={i} style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{h}</span>
                        ))}
                      </div>
                    )}
                    {biens.map((b: any, i: number) => {
                      const vues = clicsParBien[b.id] || 0
                      const msgs = candidatures.filter((c: any) => c.annonce_id === b.id).length
                      const vis = visites.filter((v: any) => v.annonce_id === b.id).length
                      const tauxConv = vues > 0 ? Math.round((msgs / vues) * 100) : 0

                      if (isMobile) {
                        return (
                          <a key={b.id} href={`/proprietaire/stats?id=${b.id}`}
                            style={{ display: "block", padding: "14px 0", borderBottom: i < biens.length - 1 ? "1px solid #F7F4EF" : "none", textDecoration: "none", color: km.ink }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                              <p style={{ fontWeight: 700, fontSize: 14 }}>{b.titre}</p>
                              <span style={{ fontSize: 18, color: km.muted }}>&rsaquo;</span>
                            </div>
                            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                              {[
                                { label: "Clics", val: vues, color: km.infoText },
                                { label: "Messages", val: msgs, color: km.successText },
                                { label: "Visites", val: vis, color: km.warnText },
                                { label: "Conv.", val: `${tauxConv}%`, color: tauxConv >= 5 ? km.successText : km.muted },
                              ].map(s => (
                                <div key={s.label} style={{ background: km.beige, borderRadius: 8, padding: "6px 12px", textAlign: "center" }}>
                                  <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.val}</div>
                                  <div style={{ fontSize: 10, color: km.muted }}>{s.label}</div>
                                </div>
                              ))}
                            </div>
                          </a>
                        )
                      }

                      return (
                        <a key={b.id} href={`/proprietaire/stats?id=${b.id}`}
                          style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 40px", gap: 12, padding: "14px 16px", borderBottom: "1px solid #F7F4EF", alignItems: "center", textDecoration: "none", color: km.ink, cursor: "pointer", transition: "background 0.15s" }}
                          onMouseEnter={e => (e.currentTarget.style.background = km.beige)}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                          <div>
                            <p style={{ fontWeight: 700, fontSize: 14 }}>{b.titre}</p>
                            <p style={{ fontSize: 12, color: km.muted, marginTop: 2 }}>{b.ville} &middot; {b.prix} €/mois</p>
                          </div>
                          <span style={{ fontSize: 16, fontWeight: 800, color: km.infoText }}>{vues}</span>
                          <span style={{ fontSize: 16, fontWeight: 800, color: km.successText }}>{msgs}</span>
                          <span style={{ fontSize: 16, fontWeight: 800, color: km.warnText }}>{vis}</span>
                          <div>
                            <span style={{ fontSize: 16, fontWeight: 800, color: tauxConv >= 5 ? km.successText : tauxConv >= 2 ? km.warnText : km.muted }}>{tauxConv}%</span>
                            <div style={{ background: km.beige, borderRadius: 4, height: 4, marginTop: 4, overflow: "hidden" }}>
                              <div style={{ height: "100%", borderRadius: 4, width: `${Math.min(100, tauxConv * 5)}%`, background: tauxConv >= 5 ? km.successText : tauxConv >= 2 ? km.warnText : km.line }} />
                            </div>
                          </div>
                          <span style={{ fontSize: 22, color: km.muted, textAlign: "right" }}>&rsaquo;</span>
                        </a>
                      )
                    })}
                  </div>
                </div>

                {/* Conseils */}
                <div style={{ background: km.white, borderRadius: 20, padding: isMobile ? 18 : 24, marginTop: 20 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Conseils pour améliorer la visibilité</h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {biens.filter((b: any) => !b.photos || (Array.isArray(b.photos) && b.photos.length < 3)).length > 0 && (
                      <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 16px", background: km.warnBg, borderRadius: 12, border: "1px solid #EADFC6" }}>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#9a3412" }}>Ajoutez plus de photos</p>
                          <p style={{ fontSize: 12, color: km.warnText }}>{biens.filter((b: any) => !b.photos || (Array.isArray(b.photos) && b.photos.length < 3)).length} bien(s) avec moins de 3 photos — les annonces avec 5+ photos reçoivent 3x plus de vues</p>
                        </div>
                      </div>
                    )}
                    {biens.filter((b: any) => !b.description || b.description.length < 100).length > 0 && (
                      <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 16px", background: km.infoBg, borderRadius: 12, border: "1px solid #D7E3F4" }}>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 700, color: km.infoText }}>Enrichissez vos descriptions</p>
                          <p style={{ fontSize: 12, color: km.infoText }}>{biens.filter((b: any) => !b.description || b.description.length < 100).length} bien(s) sans description détaillée — une bonne description augmente les contacts de 40%</p>
                        </div>
                      </div>
                    )}
                    {biens.filter((b: any) => !b.dpe).length > 0 && (
                      <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 16px", background: km.successBg, borderRadius: 12, border: "1px solid #C6E9C0" }}>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 700, color: km.successText }}>Renseignez le DPE</p>
                          <p style={{ fontSize: 12, color: km.successText }}>{biens.filter((b: any) => !b.dpe).length} bien(s) sans DPE — le DPE est obligatoire et rassure les locataires</p>
                        </div>
                      </div>
                    )}
                    {biens.every((b: any) => b.photos && Array.isArray(b.photos) && b.photos.length >= 3 && b.description && b.description.length >= 100 && b.dpe) && (
                      <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 16px", background: km.successBg, borderRadius: 12, border: "1px solid #C6E9C0" }}>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 700, color: km.successText }}>Vos annonces sont optimisées !</p>
                          <p style={{ fontSize: 12, color: km.successText }}>Tous vos biens ont des photos, descriptions et DPE — continuez comme ça</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Ancien bloc DOCUMENTS (désactivé) — les actions bail/EDL sont
            maintenant directement dans la card de chaque locataire ci-dessus
            (évite la duplication des annonces 2x). Bloc conservé en
            `false &&` pour garder l'historique git. A supprimer propre Phase 4. */}
        {false && onglet === "Locataires" && biens.filter((b: any) => b.statut === "loué" && b.locataire_email).length > 0 && (
          <div>
            {biens.length === 0 ? (
              <EmptyState
                title="Aucun bien publié"
                description="Ajoutez un bien pour pouvoir générer ses documents."
                ctaLabel="Ajouter un bien"
                ctaHref="/proprietaire/ajouter"
              />
            ) : (
              <>
                <div style={{ background: km.white, borderRadius: 20, padding: isMobile ? 18 : 24, marginBottom: 16 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6, letterSpacing: "-0.3px" }}>Documents de location</h2>
                  <p style={{ fontSize: 13, color: km.muted }}>
                    Générez baux et états des lieux directement depuis vos biens. Tous les documents sont conformes à la loi ALUR.
                  </p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {biens.filter((b: any) => b.statut === "loué" && b.locataire_email).map((b: any) => {
                    const hasLocataire = !!b.locataire_email
                    return (
                      <div key={b.id} style={{ background: km.white, borderRadius: 20, padding: isMobile ? 18 : 24 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                          <div>
                            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>{b.titre}</h3>
                            <p style={{ fontSize: 13, color: km.muted }}>
                              {b.ville}{b.adresse ? ` · ${b.adresse}` : ""}
                              {hasLocataire && <span style={{ marginLeft: 8, color: km.successText, fontWeight: 600 }}>· Locataire : {b.locataire_email}</span>}
                            </p>
                          </div>
                          <span style={{ background: statutColor[b.statut || "disponible"]?.bg || km.beige, color: statutColor[b.statut || "disponible"]?.color || km.muted, padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                            {b.statut || "disponible"}
                          </span>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 12 }}>
                          {/* Bail */}
                          <a href={`/proprietaire/bail/${b.id}`}
                            style={{ background: km.beige, borderRadius: 14, padding: "16px 18px", textDecoration: "none", color: km.ink, border: "1px solid #F7F4EF", transition: "all 0.15s", display: "block" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = km.ink; (e.currentTarget as HTMLAnchorElement).style.color = km.white }}
                            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = km.beige; (e.currentTarget as HTMLAnchorElement).style.color = km.ink }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                              <p style={{ fontSize: 14, fontWeight: 800 }}>Bail de location</p>
                            </div>
                            <p style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.4 }}>Générer ou mettre à jour le contrat de bail ALUR</p>
                            <p style={{ fontSize: 11, fontWeight: 700, marginTop: 10, display: "flex", alignItems: "center", gap: 4 }}>
                              {hasLocataire ? "Gérer le bail" : "Créer un bail"} <span style={{ fontSize: 14 }}>&rarr;</span>
                            </p>
                          </a>

                          {/* EDL entrée */}
                          <a href={`/proprietaire/edl/${b.id}?type=entree`}
                            style={{ background: km.beige, borderRadius: 14, padding: "16px 18px", textDecoration: "none", color: km.ink, border: "1px solid #F7F4EF", transition: "all 0.15s", display: "block" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = km.ink; (e.currentTarget as HTMLAnchorElement).style.color = km.white }}
                            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = km.beige; (e.currentTarget as HTMLAnchorElement).style.color = km.ink }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                              <p style={{ fontSize: 14, fontWeight: 800 }}>État des lieux d&apos;entrée</p>
                            </div>
                            <p style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.4 }}>Documenter l&apos;état du bien avant la location</p>
                            <p style={{ fontSize: 11, fontWeight: 700, marginTop: 10, display: "flex", alignItems: "center", gap: 4 }}>
                              Créer l&apos;EDL d&apos;entrée <span style={{ fontSize: 14 }}>&rarr;</span>
                            </p>
                          </a>

                          {/* EDL sortie */}
                          <a href={`/proprietaire/edl/${b.id}?type=sortie`}
                            style={{ background: km.beige, borderRadius: 14, padding: "16px 18px", textDecoration: "none", color: km.ink, border: "1px solid #F7F4EF", transition: "all 0.15s", display: "block" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = km.ink; (e.currentTarget as HTMLAnchorElement).style.color = km.white }}
                            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = km.beige; (e.currentTarget as HTMLAnchorElement).style.color = km.ink }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l-3 3 3 3"/><path d="M22 12H6"/><path d="M22 4v16"/></svg>
                              <p style={{ fontSize: 14, fontWeight: 800 }}>État des lieux de sortie</p>
                            </div>
                            <p style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.4 }}>Documenter l&apos;état du bien à la restitution</p>
                            <p style={{ fontSize: 11, fontWeight: 700, marginTop: 10, display: "flex", alignItems: "center", gap: 4 }}>
                              Créer l&apos;EDL de sortie <span style={{ fontSize: 14 }}>&rarr;</span>
                            </p>
                          </a>
                        </div>

                        {!hasLocataire && (
                          <p style={{ fontSize: 12, color: km.muted, marginTop: 12, fontStyle: "italic" }}>
                            Associez un locataire à ce bien (onglet Mes biens → Modifier) pour pouvoir envoyer les documents.
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Ancien onglet global "Candidatures" retire 2026-04-24 : les
            candidatures sont desormais gerees bien par bien via la page
            dediee /proprietaire/annonces/[id]/candidatures (bouton
            "Candidatures" directement sur chaque carte de bien). */}

        {/* LOYERS */}
        {onglet === "Locataires" && (
          <div style={{ background: km.white, borderRadius: 20, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 20 }}>Suivi des loyers</h2>
            {loyers.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: km.muted }}>
                <p style={{ fontSize: 15, fontWeight: 600 }}>Aucun loyer enregistré</p>
                <p style={{ fontSize: 13, marginTop: 8 }}>Les loyers déclarés par vos locataires apparaîtront ici</p>
              </div>
            ) : loyers.map((l: any) => (
              <div key={l.id} style={{ padding: "16px 0", borderBottom: "1px solid #F7F4EF", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 14 }}>{l.titre_bien || "Bien"} — {l.mois}</p>
                  <p style={{ color: km.muted, fontSize: 12, marginTop: 2 }}>Locataire : {l.locataire_email}</p>
                  <p style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}>{l.montant} €</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {l.statut === "confirmé" ? (
                    <span style={{ background: km.successBg, color: km.successText, padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700 }}>Confirmé</span>
                  ) : (
                    <>
                      <span style={{ background: km.warnBg, color: km.warnText, padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700 }}>En attente</span>
                      <button onClick={() => confirmerLoyer(l.id)}
                        style={{ background: km.ink, color: km.white, border: "none", borderRadius: 999, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
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
          <VisitesProprio visites={visites} biens={biens} setVisites={setVisites} myEmail={session?.user?.email} />
        )}
      </div>
    </main>
  )
}
