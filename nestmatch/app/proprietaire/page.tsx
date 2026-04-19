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
import { computeScreening } from "../../lib/screening"
import { joursRetardLoyer, labelRetard } from "../../lib/loyerHelpers"
import EmptyState from "../components/ui/EmptyState"
import UndoToast from "../components/ui/UndoToast"
import { useUndo } from "../components/ui/useUndo"
import { postNotif } from "../../lib/notificationsClient"

const ONGLETS = ["Tableau de bord", "Mes biens", "Mes locataires", "Performance", "Documents", "Candidatures", "Loyers", "Visites"] as const
type Onglet = typeof ONGLETS[number]

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
        <div style={{ display: "flex", background: "white", borderRadius: 12, padding: 4, gap: 2 }}>
          <button onClick={() => setVue("liste")}
            style={{ padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, background: vue === "liste" ? "#111" : "transparent", color: vue === "liste" ? "white" : "#6b7280" }}>
            Liste
          </button>
          <button onClick={() => setVue("agenda")}
            style={{ padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, background: vue === "agenda" ? "#111" : "transparent", color: vue === "agenda" ? "white" : "#6b7280" }}>
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
              <div key={v.id} style={{ background: "white", borderRadius: 18, border: `1.5px solid ${v.statut === "proposée" ? "#fed7aa" : "#e5e7eb"}`, overflow: "hidden", display: "flex", flexDirection: isMobile ? "column" : "row" }}>
                {/* Photo bien */}
                {!isMobile && (
                  photo ? (
                    <div style={{ width: 100, flexShrink: 0 }}>
                      <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  ) : (
                    <div style={{ width: 100, flexShrink: 0, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: "#6b7280" }}>{(bien?.titre || "B")[0].toUpperCase()}</div>
                  )
                )}

                <div style={{ flex: 1, padding: isMobile ? "14px 16px" : "16px 20px", minWidth: 0 }}>
                  <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "flex-start", marginBottom: 8, gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999 }}>
                          {s.label}
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

                    {/* Actions — ne pas proposer "Confirmer/Refuser" si c'est MOI qui ai proposé la visite */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {v.statut === "proposée" && (v.propose_par || "").toLowerCase() !== (myEmail || "").toLowerCase() && (
                        <>
                          <button onClick={() => changerStatut(v.id, "confirmée")}
                            style={{ background: "#111", color: "white", border: "none", borderRadius: 999, padding: "7px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                            ✓ Confirmer
                          </button>
                          <button onClick={() => setCancelTarget({ v, mode: "refus" })}
                            style={{ background: "none", border: "1.5px solid #fecaca", color: "#dc2626", borderRadius: 999, padding: "7px 12px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                            Refuser
                          </button>
                        </>
                      )}
                      {v.statut === "proposée" && (v.propose_par || "").toLowerCase() === (myEmail || "").toLowerCase() && (
                        <>
                          <span style={{ fontSize: 11, color: "#6b7280", fontStyle: "italic", padding: "7px 12px" }}>
                            En attente du locataire
                          </span>
                          <button onClick={() => setCancelTarget({ v, mode: "annulation" })}
                            style={{ background: "none", border: "1.5px solid #fecaca", color: "#dc2626", borderRadius: 999, padding: "7px 12px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                            Annuler
                          </button>
                        </>
                      )}
                      {v.statut === "confirmée" && (
                        <>
                          <button onClick={() => changerStatut(v.id, "effectuée")}
                            style={{ background: "#f3f4f6", border: "none", color: "#374151", borderRadius: 999, padding: "7px 12px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                            Effectuée
                          </button>
                          <button onClick={() => setCancelTarget({ v, mode: "annulation" })}
                            style={{ background: "none", border: "1.5px solid #fecaca", color: "#dc2626", borderRadius: 999, padding: "7px 12px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                            Annuler
                          </button>
                        </>
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
  const [onglet, setOnglet] = useState<Onglet>("Tableau de bord")
  const [biens, setBiens] = useState<any[]>([])
  const [candidatures, setCandidatures] = useState<any[]>([])
  const [loyers, setLoyers] = useState<any[]>([])
  const [visites, setVisites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [supprimerId, setSupprimerId] = useState<number | null>(null)
  const [dossierOuvert, setDossierOuvert] = useState<string | null>(null)
  const [dossiers, setDossiers] = useState<Record<string, any>>({})
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
    const email = session!.user!.email!
    const [{ data: b }, { data: m }, { data: l }, { data: v, error: ve }] = await Promise.all([
      supabase.from("annonces").select("*").eq("proprietaire_email", email),
      supabase.from("messages").select("*").eq("to_email", email).order("created_at", { ascending: false }),
      supabase.from("loyers").select("*").eq("proprietaire_email", email).order("mois", { ascending: false }),
      supabase.from("visites").select("*").eq("proprietaire_email", email).order("date_visite", { ascending: true }),
    ])
    if (b) {
      setBiens(b)
      // Charger les clics uniques par bien
      const ids = b.map((a: any) => a.id)
      if (ids.length > 0) {
        const { data: clics } = await supabase.from("clics_annonces").select("annonce_id").in("annonce_id", ids)
        if (clics) {
          const map: Record<number, number> = {}
          clics.forEach((c: any) => { map[c.annonce_id] = (map[c.annonce_id] || 0) + 1 })
          setClicsParBien(map)
        }
      }
    }
    const candidaturesArr = m ? m.filter((msg: any) => msg.type === "candidature") : []
    if (m) setCandidatures(candidaturesArr)
    if (l) setLoyers(l)
    setVisites(v || [])
    if (ve) console.error("Visites error:", ve.message)

    // Préchargement des dossiers des candidats — permet au screening auto
    // de s'afficher dès le chargement sans que le proprio ait à cliquer
    // « Voir le dossier » pour chaque candidature.
    const emails = Array.from(new Set(candidaturesArr.map((c: any) => c.from_email).filter(Boolean)))
    if (emails.length > 0) {
      const { data: profilsCandidats } = await supabase
        .from("profils")
        .select("*")
        .in("email", emails)
      if (profilsCandidats) {
        const map: Record<string, any> = {}
        profilsCandidats.forEach((p: any) => { if (p.email) map[p.email] = p })
        setDossiers(map)
      }
    }

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
    await supabase.from("loyers").update({ statut: "confirmé", date_confirmation: nowIso }).eq("id", id)
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
      await supabase.from("loyers").update({
        quittance_envoyee_at: nowIso,
        quittance_message_id: msg.id,
      }).eq("id", id)
    }
    // Notif cloche locataire : quittance reçue (loyer confirmé)
    void postNotif({
      userEmail: locataireEmail,
      type: "bail_genere",
      title: "Quittance reçue",
      body: `Loyer ${loyer.mois} confirmé pour « ${bien.titre } »`,
      href: "/mon-logement",
      relatedId: String(id),
    })
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
      {pendingSuppression !== null && (
        <UndoToast
          message="Annonce supprimée — visites, messages et documents liés seront perdus"
          onUndo={handleUndoSuppression}
        />
      )}

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? "24px 16px" : "32px 48px" }}>

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
              {o === "Visites" && visites.filter(v => v.statut === "proposée" && (v.propose_par || "").toLowerCase() !== (myEmail || "").toLowerCase()).length > 0 && (
                <span style={{ marginLeft: 6, background: "#f97316", color: "white", borderRadius: 999, fontSize: 10, padding: "1px 6px", fontWeight: 700 }}>{visites.filter(v => v.statut === "proposée" && (v.propose_par || "").toLowerCase() !== (myEmail || "").toLowerCase()).length}</span>
              )}
            </button>
          ))}
        </div>

        {/* TABLEAU DE BORD */}
        {onglet === "Tableau de bord" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: isMobile ? 12 : 18, marginBottom: 24 }}>
              {[
                { label: "Biens disponibles", val: biensDispos, color: "#16a34a", bg: "#f0fdf4", targetOnglet: "Mes biens" as const },
                { label: "Biens loués",       val: biensLoues, color: "#6b7280", bg: "#f9fafb", targetOnglet: "Mes locataires" as const },
                { label: "Loyers à confirmer", val: loyersAttendus, color: "#ea580c", bg: loyersAttendus > 0 ? "#fff7ed" : "white", targetOnglet: "Loyers" as const },
                { label: "Loyers confirmés",  val: loyersConfirmes, color: "#16a34a", bg: "white", targetOnglet: "Loyers" as const },
              ].map(s => (
                <button
                  key={s.label}
                  onClick={() => setOnglet(s.targetOnglet)}
                  style={{
                    background: s.bg, borderRadius: 20, padding: isMobile ? "18px 20px" : "24px 28px",
                    border: "1px solid #f3f4f6", textAlign: "left", cursor: "pointer",
                    fontFamily: "inherit", transition: "transform 0.15s, box-shadow 0.15s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.06)" }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "none" }}
                >
                  <div style={{ fontSize: isMobile ? 32 : 40, fontWeight: 800, color: s.color, letterSpacing: "-1px", lineHeight: 1 }}>{s.val}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8, fontWeight: 600 }}>{s.label}</div>
                </button>
              ))}
            </div>

            {/* Pipeline candidats */}
            <PipelineFunnel biens={biens} candidatures={candidatures} visites={visites} clicsParBien={clicsParBien} />

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
              <EmptyState
                title="Aucun bien publié"
                description="Commencez par créer votre première annonce pour recevoir des candidatures."
                ctaLabel="Ajouter un bien"
                ctaHref="/proprietaire/ajouter"
              />
            ) : biens.map(b => (
              <div key={b.id} style={{ background: "white", borderRadius: 20, padding: isMobile ? 18 : 24 }}>
                {(() => {
                  // Alerte expiration si bien disponible et publié depuis > 45 jours sans update
                  const baseDate = b.updated_at || b.created_at
                  if (!baseDate || (b.statut && b.statut !== "disponible")) return null
                  const jours = Math.floor((Date.now() - new Date(baseDate).getTime()) / (1000 * 60 * 60 * 24))
                  if (jours < 45) return null
                  return (
                    <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 12, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                      <p style={{ fontSize: 13, color: "#9a3412", margin: 0 }}>
                        <strong>Annonce en ligne depuis {jours} jours.</strong> Pensez à la rafraîchir (photos, description, prix) pour regagner en visibilité.
                      </p>
                      <a href={`/proprietaire/modifier/${b.id}`} style={{ fontSize: 12, fontWeight: 700, color: "#9a3412", textDecoration: "none", padding: "5px 12px", border: "1.5px solid #fed7aa", borderRadius: 999, background: "white", flexShrink: 0 }}>
                        Rafraîchir
                      </a>
                    </div>
                  )
                })()}
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
                      <span>{b.pieces} pièces</span>
                      <span>{b.prix} €/mois</span>
                      {b.meuble && <span>Meuble</span>}
                      {b.animaux && <span>Animaux OK</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: isMobile ? "row" : "column", gap: 8, marginLeft: isMobile ? 0 : 24, flexWrap: "wrap" }}>
                    {/* Bouton Statistiques mis en avant — action principale sur le bien */}
                    <a href={`/proprietaire/stats?id=${b.id}`}
                      style={{ textAlign: "center", padding: "10px 16px", border: "none", borderRadius: 10, textDecoration: "none", color: "white", background: "#111", fontSize: 13, fontWeight: 700, flex: isMobile ? 1 : undefined, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                      Statistiques
                    </a>
                    <select
                      value={b.statut || "disponible"}
                      onChange={e => changerStatut(b.id, e.target.value)}
                      style={{ padding: "8px 12px", borderRadius: 10, border: "1.5px solid #e5e7eb", fontSize: 12, fontFamily: "inherit", cursor: "pointer", outline: "none", flex: isMobile ? 1 : undefined }}>
                      <option value="disponible">Disponible</option>
                      <option value="en visite">En visite</option>
                      <option value="réservé">Réservé</option>
                      <option value="loué">Loué</option>
                    </select>
                    <a href={`/proprietaire/modifier/${b.id}`} style={{ textAlign: "center", padding: "8px 12px", border: "1.5px solid #e5e7eb", borderRadius: 10, textDecoration: "none", color: "#111", fontSize: 12, fontWeight: 600, flex: isMobile ? 1 : undefined }}>
                      Modifier
                    </a>
                    <a href={`/annonces/${b.id}`} style={{ textAlign: "center", padding: "8px 12px", border: "1.5px solid #e5e7eb", borderRadius: 10, textDecoration: "none", color: "#6b7280", fontSize: 12, fontWeight: 600, flex: isMobile ? 1 : undefined }}>
                      Voir l&apos;annonce
                    </a>
                    {supprimerId === b.id ? (
                      <div style={{ display: "flex", gap: 6, flex: isMobile ? 1 : undefined }}>
                        <button onClick={() => supprimerBien(b.id)} style={{ background: "#dc2626", color: "white", border: "none", borderRadius: 10, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Confirmer</button>
                        <button onClick={() => setSupprimerId(null)} style={{ background: "#f3f4f6", color: "#111", border: "none", borderRadius: 10, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
                      </div>
                    ) : (
                      <button onClick={() => setSupprimerId(b.id)} style={{ textAlign: "center", padding: "8px 12px", border: "1.5px solid #fecaca", background: "#fef2f2", borderRadius: 10, color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flex: isMobile ? 1 : undefined }}>
                        Supprimer
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MES LOCATAIRES — biens loués avec locataire_email renseigné */}
        {onglet === "Mes locataires" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {(() => {
              const actifs = biens.filter((b: any) => b.statut === "loué" && b.locataire_email)
              if (actifs.length === 0) return (
                <EmptyState
                  title="Aucun locataire actif"
                  description="Dès qu'un bail sera signé sur un de vos biens (génération PDF depuis l'onglet Documents), le locataire apparaîtra ici."
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
                  loyerMoisStatut === "paye"    ? { bg: "#dcfce7", color: "#15803d", label: "Loyer du mois reçu" }
                  : loyerMoisStatut === "declare" ? { bg: "#fff7ed", color: "#c2410c", label: "Loyer du mois en attente" }
                  : { bg: "#fee2e2", color: "#dc2626", label: "Loyer du mois à déclarer" }
                return (
                  <div key={b.id} style={{ background: "white", borderRadius: 20, padding: isMobile ? 18 : 24, display: "flex", flexDirection: isMobile ? "column" : "row", gap: 16, alignItems: isMobile ? "stretch" : "center" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{b.titre}</h3>
                        <span style={{ background: "#dcfce7", color: "#15803d", padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>Bail actif</span>
                        <span style={{ background: loyerMoisStyle.bg, color: loyerMoisStyle.color, padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{loyerMoisStyle.label}</span>
                        {retardPlusAncien && (
                          <span title={`Loyer de ${new Date(retardPlusAncien.l.mois + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })} en retard`} style={{ background: "#fef2f2", color: "#b91c1c", padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, border: "1.5px solid #fecaca" }}>
                            {labelRetard(retardPlusAncien.jours)}{retardsBien.length > 1 ? ` · ${retardsBien.length} mois` : ""}
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 10px" }}>{b.adresse ? b.adresse + " · " : ""}{b.ville}</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                        <div><span style={{ color: "#9ca3af" }}>Locataire : </span><strong>{b.locataire_email}</strong></div>
                        {b.date_debut_bail && <div><span style={{ color: "#9ca3af" }}>Début du bail : </span><strong>{new Date(b.date_debut_bail).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</strong></div>}
                        <div><span style={{ color: "#9ca3af" }}>Loyer : </span><strong>{(b.prix || 0) + (b.charges || 0)} €</strong> <span style={{ color: "#6b7280" }}>/ mois</span></div>
                        <div><span style={{ color: "#9ca3af" }}>Loyers confirmés : </span><strong>{moisLoyers}</strong></div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: isMobile ? "row" : "column", gap: 8, flexWrap: "wrap" }}>
                      {loyerMoisStatut !== "paye" && (
                        <a href={`/proprietaire/stats?id=${b.id}`} style={{ background: "#111", color: "white", borderRadius: 10, padding: "10px 16px", textDecoration: "none", fontSize: 13, fontWeight: 700, textAlign: "center", flex: isMobile ? 1 : undefined }}>
                          {loyerMoisStatut === "declare" ? "Confirmer loyer" : "Déclarer loyer"}
                        </a>
                      )}
                      <a href={`/messages?with=${encodeURIComponent(b.locataire_email)}`} style={{ background: loyerMoisStatut === "paye" ? "#111" : "white", color: loyerMoisStatut === "paye" ? "white" : "#111", border: loyerMoisStatut === "paye" ? "none" : "1.5px solid #e5e7eb", borderRadius: 10, padding: "10px 16px", textDecoration: "none", fontSize: 13, fontWeight: 700, textAlign: "center", flex: isMobile ? 1 : undefined }}>Message</a>
                      <a href={`/proprietaire/edl/${b.id}`} style={{ background: "white", border: "1.5px solid #e5e7eb", color: "#111", borderRadius: 10, padding: "10px 16px", textDecoration: "none", fontSize: 13, fontWeight: 700, textAlign: "center", flex: isMobile ? 1 : undefined }}>EDL</a>
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        )}

        {/* PERFORMANCE — vue agrégée + pipeline + détail par bien */}
        {onglet === "Performance" && (
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
                        { label: "Revenus confirmés", val: `${revenusConfirmes.toLocaleString("fr-FR")} €`, sub: "cumul toutes périodes", color: "#16a34a", bg: "#f0fdf4" },
                        { label: "Loyers mensuels", val: `${loyerTheoriqueTotal.toLocaleString("fr-FR")} €`, sub: `${biens.filter((b: any) => b.statut === "loué").length} bien(s) loué(s)`, color: "#111", bg: "white" },
                        { label: "Cashflow mensuel", val: `${cashflowMensuelTotal >= 0 ? "+" : ""}${cashflowMensuelTotal.toLocaleString("fr-FR")} €`, sub: "après crédit", color: cashflowMensuelTotal >= 0 ? "#16a34a" : "#dc2626", bg: cashflowMensuelTotal >= 0 ? "#f0fdf4" : "#fef2f2" },
                        { label: "Valeur patrimoine", val: patrimoineTotal > 0 ? `${Math.round(patrimoineTotal / 1000)} k€` : "—", sub: "somme des biens", color: "#111", bg: "white" },
                      ].map(s => (
                        <div key={s.label} style={{ background: s.bg, borderRadius: 20, padding: isMobile ? "18px 20px" : "22px 26px", border: "1px solid #f3f4f6" }}>
                          <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, color: s.color, letterSpacing: "-0.5px", lineHeight: 1.1 }}>{s.val}</div>
                          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8, fontWeight: 600 }}>{s.label}</div>
                          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{s.sub}</div>
                        </div>
                      ))}
                    </div>
                  )
                })()}

                {/* Pipeline candidats (aussi visible ici) */}
                <PipelineFunnel biens={biens} candidatures={candidatures} visites={visites} clicsParBien={clicsParBien} />

                {/* KPIs marketing (ex-Performance) */}
                <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 14, marginTop: 8 }}>Activité sur les annonces</h2>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? 10 : 16, marginBottom: 24 }}>
                  {[
                    { label: "Clics uniques", val: Object.values(clicsParBien).reduce((s: number, v: number) => s + v, 0), color: "#1d4ed8", bg: "#eff6ff" },
                    { label: "Messages reçus", val: candidatures.length, color: "#16a34a", bg: "#dcfce7" },
                    { label: "Visites demandées", val: visites.length, color: "#ea580c", bg: "#fff7ed" },
                    { label: "Biens actifs", val: biens.filter((b: any) => !b.statut || b.statut === "disponible").length, color: "#111", bg: "white" },
                  ].map(s => (
                    <div key={s.label} style={{ background: s.bg, borderRadius: 16, padding: "20px 24px" }}>
                      <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.val}</div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Detail par bien — cliquable, mène aux stats détaillées */}
                <div style={{ background: "white", borderRadius: 20, padding: isMobile ? 18 : 24 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 800 }}>Performance par bien</h2>
                    <p style={{ fontSize: 12, color: "#6b7280" }}>Cliquez sur un bien pour voir ses statistiques détaillées</p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {/* Header */}
                    {!isMobile && (
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 40px", gap: 12, padding: "10px 16px", background: "#f9fafb", borderRadius: "10px 10px 0 0" }}>
                        {["Bien", "Clics uniques", "Messages", "Visites", "Taux conv.", ""].map((h, i) => (
                          <span key={i} style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{h}</span>
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
                            style={{ display: "block", padding: "14px 0", borderBottom: i < biens.length - 1 ? "1px solid #f3f4f6" : "none", textDecoration: "none", color: "#111" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                              <p style={{ fontWeight: 700, fontSize: 14 }}>{b.titre}</p>
                              <span style={{ fontSize: 18, color: "#9ca3af" }}>&rsaquo;</span>
                            </div>
                            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                              {[
                                { label: "Clics", val: vues, color: "#1d4ed8" },
                                { label: "Messages", val: msgs, color: "#16a34a" },
                                { label: "Visites", val: vis, color: "#ea580c" },
                                { label: "Conv.", val: `${tauxConv}%`, color: tauxConv >= 5 ? "#16a34a" : "#6b7280" },
                              ].map(s => (
                                <div key={s.label} style={{ background: "#f9fafb", borderRadius: 8, padding: "6px 12px", textAlign: "center" }}>
                                  <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.val}</div>
                                  <div style={{ fontSize: 10, color: "#9ca3af" }}>{s.label}</div>
                                </div>
                              ))}
                            </div>
                          </a>
                        )
                      }

                      return (
                        <a key={b.id} href={`/proprietaire/stats?id=${b.id}`}
                          style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 40px", gap: 12, padding: "14px 16px", borderBottom: "1px solid #f3f4f6", alignItems: "center", textDecoration: "none", color: "#111", cursor: "pointer", transition: "background 0.15s" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                          <div>
                            <p style={{ fontWeight: 700, fontSize: 14 }}>{b.titre}</p>
                            <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{b.ville} &middot; {b.prix} €/mois</p>
                          </div>
                          <span style={{ fontSize: 16, fontWeight: 800, color: "#1d4ed8" }}>{vues}</span>
                          <span style={{ fontSize: 16, fontWeight: 800, color: "#16a34a" }}>{msgs}</span>
                          <span style={{ fontSize: 16, fontWeight: 800, color: "#ea580c" }}>{vis}</span>
                          <div>
                            <span style={{ fontSize: 16, fontWeight: 800, color: tauxConv >= 5 ? "#16a34a" : tauxConv >= 2 ? "#ea580c" : "#6b7280" }}>{tauxConv}%</span>
                            <div style={{ background: "#f3f4f6", borderRadius: 4, height: 4, marginTop: 4, overflow: "hidden" }}>
                              <div style={{ height: "100%", borderRadius: 4, width: `${Math.min(100, tauxConv * 5)}%`, background: tauxConv >= 5 ? "#16a34a" : tauxConv >= 2 ? "#ea580c" : "#d1d5db" }} />
                            </div>
                          </div>
                          <span style={{ fontSize: 22, color: "#9ca3af", textAlign: "right" }}>&rsaquo;</span>
                        </a>
                      )
                    })}
                  </div>
                </div>

                {/* Conseils */}
                <div style={{ background: "white", borderRadius: 20, padding: isMobile ? 18 : 24, marginTop: 20 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Conseils pour améliorer vos performances</h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {biens.filter((b: any) => !b.photos || (Array.isArray(b.photos) && b.photos.length < 3)).length > 0 && (
                      <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 16px", background: "#fff7ed", borderRadius: 12, border: "1px solid #fed7aa" }}>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#9a3412" }}>Ajoutez plus de photos</p>
                          <p style={{ fontSize: 12, color: "#ea580c" }}>{biens.filter((b: any) => !b.photos || (Array.isArray(b.photos) && b.photos.length < 3)).length} bien(s) avec moins de 3 photos — les annonces avec 5+ photos reçoivent 3x plus de vues</p>
                        </div>
                      </div>
                    )}
                    {biens.filter((b: any) => !b.description || b.description.length < 100).length > 0 && (
                      <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 16px", background: "#eff6ff", borderRadius: 12, border: "1px solid #bfdbfe" }}>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#1e40af" }}>Enrichissez vos descriptions</p>
                          <p style={{ fontSize: 12, color: "#1d4ed8" }}>{biens.filter((b: any) => !b.description || b.description.length < 100).length} bien(s) sans description détaillée — une bonne description augmente les contacts de 40%</p>
                        </div>
                      </div>
                    )}
                    {biens.filter((b: any) => !b.dpe).length > 0 && (
                      <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 16px", background: "#dcfce7", borderRadius: 12, border: "1px solid #bbf7d0" }}>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#166534" }}>Renseignez le DPE</p>
                          <p style={{ fontSize: 12, color: "#16a34a" }}>{biens.filter((b: any) => !b.dpe).length} bien(s) sans DPE — le DPE est obligatoire et rassure les locataires</p>
                        </div>
                      </div>
                    )}
                    {biens.every((b: any) => b.photos && Array.isArray(b.photos) && b.photos.length >= 3 && b.description && b.description.length >= 100 && b.dpe) && (
                      <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 16px", background: "#dcfce7", borderRadius: 12, border: "1px solid #bbf7d0" }}>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#166534" }}>Vos annonces sont optimisées !</p>
                          <p style={{ fontSize: 12, color: "#16a34a" }}>Tous vos biens ont des photos, descriptions et DPE — continuez comme ça</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* DOCUMENTS — baux et EDL centralisés par bien */}
        {onglet === "Documents" && (
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
                <div style={{ background: "white", borderRadius: 20, padding: isMobile ? 18 : 24, marginBottom: 16 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6, letterSpacing: "-0.3px" }}>Documents de location</h2>
                  <p style={{ fontSize: 13, color: "#6b7280" }}>
                    Générez baux et états des lieux directement depuis vos biens. Tous les documents sont conformes à la loi ALUR.
                  </p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {biens.map((b: any) => {
                    const hasLocataire = !!b.locataire_email
                    return (
                      <div key={b.id} style={{ background: "white", borderRadius: 20, padding: isMobile ? 18 : 24 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                          <div>
                            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>{b.titre}</h3>
                            <p style={{ fontSize: 13, color: "#6b7280" }}>
                              {b.ville}{b.adresse ? ` · ${b.adresse}` : ""}
                              {hasLocataire && <span style={{ marginLeft: 8, color: "#16a34a", fontWeight: 600 }}>· Locataire : {b.locataire_email}</span>}
                            </p>
                          </div>
                          <span style={{ background: statutColor[b.statut || "disponible"]?.bg || "#f3f4f6", color: statutColor[b.statut || "disponible"]?.color || "#6b7280", padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                            {b.statut || "disponible"}
                          </span>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 12 }}>
                          {/* Bail */}
                          <a href={`/proprietaire/bail/${b.id}`}
                            style={{ background: "#f9fafb", borderRadius: 14, padding: "16px 18px", textDecoration: "none", color: "#111", border: "1px solid #f3f4f6", transition: "all 0.15s", display: "block" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = "#111"; (e.currentTarget as HTMLAnchorElement).style.color = "white" }}
                            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = "#f9fafb"; (e.currentTarget as HTMLAnchorElement).style.color = "#111" }}>
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
                            style={{ background: "#f9fafb", borderRadius: 14, padding: "16px 18px", textDecoration: "none", color: "#111", border: "1px solid #f3f4f6", transition: "all 0.15s", display: "block" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = "#111"; (e.currentTarget as HTMLAnchorElement).style.color = "white" }}
                            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = "#f9fafb"; (e.currentTarget as HTMLAnchorElement).style.color = "#111" }}>
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
                            style={{ background: "#f9fafb", borderRadius: 14, padding: "16px 18px", textDecoration: "none", color: "#111", border: "1px solid #f3f4f6", transition: "all 0.15s", display: "block" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = "#111"; (e.currentTarget as HTMLAnchorElement).style.color = "white" }}
                            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = "#f9fafb"; (e.currentTarget as HTMLAnchorElement).style.color = "#111" }}>
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
                          <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 12, fontStyle: "italic" }}>
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

        {/* CANDIDATURES */}
        {onglet === "Candidatures" && (() => {
          // Enrichir chaque candidature avec son screening automatique
          // (basé sur le profil pré-chargé + le loyer de l'annonce visée)
          const candidaturesAvecScreening = candidatures.map((c: any) => {
            const bien = biens.find(b => b.id === c.annonce_id)
            const loyer = bien ? (Number(bien.prix || 0) + Number(bien.charges || 0)) : null
            const screening = computeScreening(dossiers[c.from_email] || null, loyer)
            return { ...c, _screening: screening, _bien: bien }
          })
          // Tri par score desc — les meilleurs candidats en haut
          const candidaturesTriees = [...candidaturesAvecScreening].sort((a, b) => b._screening.score - a._screening.score)

          const exportCandidatsCSV = () => {
            if (candidaturesTriees.length === 0) return
            // CSV RFC 4180 — quote si contient , " ou \n
            const esc = (v: unknown) => {
              const s = v == null ? "" : String(v)
              return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
            }
            const headers = ["Email", "Score", "Label", "Bien", "Prix", "Flags", "Date contact", "Premier message"]
            const rows = candidaturesTriees.map((c: any) => [
              c.from_email,
              c._screening.score,
              c._screening.label,
              c._bien?.titre || "",
              c._bien?.prix ?? "",
              (c._screening.flags || []).join(" / "),
              new Date(c.created_at).toLocaleDateString("fr-FR"),
              (c.contenu || "").slice(0, 200),
            ])
            const csv = "\uFEFF" + [headers, ...rows].map(r => r.map(esc).join(",")).join("\n")
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `candidatures-${new Date().toISOString().slice(0, 10)}.csv`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
          }

          return (
          <div style={{ background: "white", borderRadius: 20, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800 }}>Candidatures reçues</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                {candidatures.length > 0 && (
                  <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
                    Tri par score (solvabilité, pro, garant, complétude)
                  </p>
                )}
                {candidaturesTriees.length > 0 && (
                  <button type="button" onClick={exportCandidatsCSV}
                    style={{ background: "white", border: "1.5px solid #e5e7eb", borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 700, color: "#111", cursor: "pointer", fontFamily: "inherit" }}>
                    Exporter CSV
                  </button>
                )}
              </div>
            </div>
            <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 18, lineHeight: 1.5 }}>
              Le score est calculé automatiquement à partir du dossier du candidat. C'est une aide à la décision, pas un verdict.
            </p>

            {candidaturesTriees.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af" }}>
                <p style={{ fontSize: 15, fontWeight: 600 }}>Aucune candidature pour le moment</p>
              </div>
            ) : candidaturesTriees.map((c: any) => {
              const isOpen = dossierOuvert === c.from_email
              const d = dossiers[c.from_email]
              const s = c._screening
              return (
                <div key={c.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <div style={{ padding: "16px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
                    {/* Badge screening — score + label */}
                    <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 260 }}>
                      <div style={{
                        background: s.bg,
                        color: s.color,
                        border: `1.5px solid ${s.border}`,
                        borderRadius: 14,
                        padding: "8px 14px",
                        textAlign: "center",
                        flexShrink: 0,
                        minWidth: 72,
                      }}>
                        <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>{s.score}</div>
                        <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginTop: 3 }}>{s.label}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 700, fontSize: 14 }}>{c.from_email}</p>
                        <p style={{ fontSize: 13, color: "#374151", marginTop: 3, fontWeight: 500 }}>{s.summary}</p>
                        {c._bien && (
                          <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>
                            Pour : <strong style={{ color: "#6b7280" }}>{c._bien.titre}</strong> · {c._bien.prix} €/mois
                          </p>
                        )}
                        {s.flags.length > 0 && (
                          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                            {s.flags.map((f: string, i: number) => (
                              <span key={i} style={{ fontSize: 11, background: "#fff7ed", color: "#c2410c", padding: "2px 8px", borderRadius: 999, border: "1px solid #fed7aa" }}>{f}</span>
                            ))}
                          </div>
                        )}
                        <p style={{ color: "#9ca3af", fontSize: 11, marginTop: 6 }}>{new Date(c.created_at).toLocaleDateString("fr-FR")}{c.contenu ? ` · "${c.contenu.slice(0, 50)}${c.contenu.length > 50 ? "…" : ""}"` : ""}</p>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button onClick={() => voirDossier(c.from_email)}
                        style={{ background: isOpen ? "#111" : "white", color: isOpen ? "white" : "#111", border: "1.5px solid #e5e7eb", padding: "7px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                        {isOpen ? "Masquer le dossier" : "Voir le dossier"}
                      </button>
                      <a href={`/messages?with=${encodeURIComponent(c.from_email)}`} style={{ background: "#111", color: "white", padding: "7px 14px", borderRadius: 999, textDecoration: "none", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>Répondre</a>
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
                            { label: "Ville souhaitée", val: d.ville_souhaitee },
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
          )
        })()}

        {/* LOYERS */}
        {onglet === "Loyers" && (
          <div style={{ background: "white", borderRadius: 20, padding: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 20 }}>Suivi des loyers</h2>
            {loyers.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af" }}>
                <p style={{ fontSize: 15, fontWeight: 600 }}>Aucun loyer enregistré</p>
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
                    <span style={{ background: "#dcfce7", color: "#16a34a", padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700 }}>Confirmé</span>
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
          <VisitesProprio visites={visites} biens={biens} setVisites={setVisites} myEmail={session?.user?.email} />
        )}
      </div>
    </main>
  )
}
