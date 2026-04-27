"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../lib/supabase"
import { useRole } from "../providers"
import { useResponsive } from "../hooks/useResponsive"
import EmptyState from "../components/ui/EmptyState"
import Image from "next/image"
import { formatNomComplet } from "../../lib/profilHelpers"
import { postNotif } from "../../lib/notificationsClient"

type Statut = "planifié" | "en cours" | "terminé"
type TypeEvent = "urgence" | "chaudière" | "plomberie" | "électricité" | "travaux" | "serrurerie" | "nuisibles" | "autre"

const TYPE_LABELS: Record<TypeEvent, string> = {
  "urgence": "URG.", "chaudière": "Chaud.", "plomberie": "Plomb.", "électricité": "Élec.",
  "travaux": "Trav.", "serrurerie": "Serr.", "nuisibles": "Nuis.", "autre": "Autre",
}
const STATUT_STYLE: Record<Statut, { bg: string; color: string; border: string }> = {
  "planifié": { bg: "#FBF6EA", color: "#a16207", border: "#EADFC6" },
  "en cours": { bg: "#EEF3FB", color: "#1d4ed8", border: "#D7E3F4" },
  "terminé":  { bg: "#F0FAEE", color: "#15803d", border: "#C6E9C0" },
}
const EMPTY_FORM = {
  titre: "", description: "", type: "autre" as TypeEvent,
  statut: "planifié" as Statut, date_evenement: "", cout: "", annonce_id: "",
}

export default function Carnet() {
  const { data: session, status } = useSession()
  const { proprietaireActive } = useRole()
  const router = useRouter()

  // Données communes
  const { isMobile } = useResponsive()
  const [evenements, setEvenements] = useState<any[]>([])
  const [biens, setBiens] = useState<any[]>([])         // annonces liées (pour proprio: ses biens; pour locataire: biens loués)
  const [locataires, setLocataires] = useState<Record<string, any>>({}) // email → profil pour proprio
  const [loading, setLoading] = useState(true)

  // Formulaire
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [erreur, setErreur] = useState("")

  // Filtres
  const [filtreStatut, setFiltreStatut] = useState<Statut | "tous">("tous")
  const [filtreBien, setFiltreBien] = useState<string>("tous")
  const [filtreSource, setFiltreSource] = useState<"tous" | "proprio" | "locataire">("tous")

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth")
    if (status === "authenticated" && session?.user?.email) loadData()
  }, [session, status, proprietaireActive])

  async function loadData() {
    const email = session!.user!.email!

    if (proprietaireActive) {
      // Proprio : ses biens + les entrées carnet
      const [{ data: b }, { data: e }] = await Promise.all([
        supabase.from("annonces").select("id, titre, ville, photos").eq("proprietaire_email", email),
        supabase.from("carnet_entretien").select("*").eq("proprietaire_email", email).order("date_evenement", { ascending: false }),
      ])
      const biensData = b || []
      const evts = e || []
      setBiens(biensData)
      setEvenements(evts)

      // Charger les profils des locataires qui ont signalé des entrées
      const locEmails = [...new Set(evts.filter(ev => ev.locataire_email).map(ev => ev.locataire_email))]
      if (locEmails.length > 0) {
        const { data: profils } = await supabase.from("profils").select("email, prenom, nom").in("email", locEmails)
        if (profils) {
          const map: Record<string, any> = {}
          profils.forEach((p: any) => { map[p.email] = p })
          setLocataires(map)
        }
      }
    } else {
      // Locataire : on aggrège 2 sources d'éligibilité au carnet :
      //   (a) bail signé/en cours → annonces.locataire_email = me (priorité)
      //   (b) visite confirmée/effectuée pour les futurs locataires qui veulent
      //       déjà signaler un problème en amont.
      // Avant : seulement (b) — un locataire avec bail mais sans visite préalable
      // ne voyait RIEN dans son carnet (bug Paul 2026-04-26).
      const [{ data: bailAnnonces }, { data: visites }] = await Promise.all([
        supabase.from("annonces")
          .select("id, titre, ville, photos, proprietaire_email")
          .eq("locataire_email", email),
        supabase.from("visites")
          .select("annonce_id, proprietaire_email")
          .eq("locataire_email", email)
          .in("statut", ["confirmée", "effectuée"]),
      ])
      const annonceIds = new Set<number>()
      const biensMap = new Map<number, any>()
      ;(bailAnnonces || []).forEach((b: any) => {
        annonceIds.add(b.id)
        biensMap.set(b.id, b)
      })
      const visiteIds = (visites || []).map((v: any) => v.annonce_id).filter(Boolean)
      const missingFromBail = visiteIds.filter(id => !annonceIds.has(id))
      if (missingFromBail.length > 0) {
        const { data: visiteAnnonces } = await supabase
          .from("annonces")
          .select("id, titre, ville, photos, proprietaire_email")
          .in("id", missingFromBail)
        ;(visiteAnnonces || []).forEach((b: any) => {
          annonceIds.add(b.id)
          biensMap.set(b.id, b)
        })
      }
      if (annonceIds.size === 0) { setLoading(false); return }
      const { data: e } = await supabase
        .from("carnet_entretien")
        .select("*")
        .in("annonce_id", Array.from(annonceIds))
        .order("date_evenement", { ascending: false })
      setBiens(Array.from(biensMap.values()))
      setEvenements(e || [])
    }
    setLoading(false)
  }

  const set = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function ajouter() {
    if (!form.titre) { setErreur("Le titre est obligatoire"); return }
    if (!form.annonce_id) { setErreur("Sélectionnez un bien"); return }
    setSaving(true); setErreur("")

    const bien = biens.find(b => String(b.id) === form.annonce_id)
    const proprioEmail = proprietaireActive ? session!.user!.email! : (bien?.proprietaire_email || "")

    const payload: any = {
      annonce_id: Number(form.annonce_id),
      proprietaire_email: proprioEmail,
      titre: form.titre,
      description: form.description || null,
      type: form.type,
      statut: form.statut,
      date_evenement: form.date_evenement || null,
      cout: form.cout ? Number(form.cout) : null,
    }
    if (!proprietaireActive) payload.locataire_email = session!.user!.email!

    const { data, error } = await supabase.from("carnet_entretien").insert(payload).select().single()
    if (error) { setErreur("L'enregistrement a echoue. Veuillez reessayer.") }
    else if (data) {
      setEvenements(prev => [data, ...prev])
      setForm(EMPTY_FORM)
      setShowForm(false)
      // Notif cloche proprio quand le locataire signale un problème (Paul 2026-04-26)
      // Particulier urgent si type === "urgence" → titre adapté.
      if (!proprietaireActive && proprioEmail) {
        const isUrgent = form.type === "urgence"
        void postNotif({
          userEmail: proprioEmail,
          type: "carnet_signalement",
          title: isUrgent ? "Urgence signalée" : "Nouvelle entrée carnet",
          body: `${form.titre}${bien?.titre ? ` — ${bien.titre}` : ""}`,
          href: `/carnet`,
          relatedId: String(data.id),
        })
      }
    }
    setSaving(false)
  }

  async function changerStatut(id: string, statut: Statut) {
    await supabase.from("carnet_entretien").update({ statut }).eq("id", id)
    setEvenements(prev => prev.map(e => e.id === id ? { ...e, statut } : e))
  }

  async function supprimer(id: string) {
    await supabase.from("carnet_entretien").delete().eq("id", id)
    setEvenements(prev => prev.filter(e => e.id !== id))
  }

  const evenementsFiltres = evenements.filter(e => {
    if (filtreStatut !== "tous" && e.statut !== filtreStatut) return false
    if (filtreBien !== "tous" && String(e.annonce_id) !== filtreBien) return false
    if (filtreSource === "proprio" && e.locataire_email) return false
    if (filtreSource === "locataire" && !e.locataire_email) return false
    return true
  })
  const nbLocataireSignals = evenements.filter(e => e.locataire_email).length
  const totalCout = evenementsFiltres.reduce((acc, e) => acc + (Number(e.cout) || 0), 0)

  if (status === "loading" || loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#8a8477" }}>Chargement...</div>
  )

  // Locataire sans logement actif
  if (!proprietaireActive && biens.length === 0) return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: isMobile ? "24px 16px" : "40px 48px" }}>
      <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center", paddingTop: 80 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Carnet d'entretien</h1>
        <p style={{ fontSize: 15, color: "#8a8477", marginBottom: 24, lineHeight: 1.6 }}>
          Le carnet d'entretien est disponible une fois votre visite confirmée.<br />
          Il relie votre logement, votre propriétaire et l'historique des travaux.
        </p>
        <Link href="/visites" style={{ padding: "12px 28px", background: "#111", color: "white", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 14 }}>
          Voir mes visites
        </Link>
      </div>
    </main>
  )

  const inp: any = { width: "100%", padding: "10px 14px", border: "1px solid #EAE6DF", borderRadius: 10, fontSize: 16, outline: "none", boxSizing: "border-box", fontFamily: "inherit", background: "white" }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: isMobile ? "24px 16px" : "40px 48px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", marginBottom: 28, flexDirection: isMobile ? "column" : "row", gap: isMobile ? 14 : 0 }}>
          <div>
            <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, letterSpacing: "-0.5px" }}>Carnet d'entretien</h1>
            <p style={{ color: "#8a8477", marginTop: 4, fontSize: 14 }}>
              {proprietaireActive
                ? "Historique des interventions sur vos biens"
                : "Suivi des interventions pour votre logement"}
            </p>
          </div>
          <button onClick={() => setShowForm(!showForm)}
            style={{ background: "#111", color: "white", border: "none", borderRadius: 999, padding: "12px 24px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            {proprietaireActive ? "+ Ajouter" : "Signaler un problème"}
          </button>
        </div>

        {/* Biens liés — locataire */}
        {!proprietaireActive && biens.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {biens.map(b => (
              <div key={b.id} style={{ background: "white", borderRadius: 16, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, border: "1px solid #EAE6DF" }}>
                {Array.isArray(b.photos) && b.photos[0]
                  ? <Image src={b.photos[0]} alt="" width={56} height={56} sizes="56px" style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                  : <div style={{ width: 56, height: 56, borderRadius: 10, background: "#F7F4EF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: "#8a8477", flexShrink: 0 }}>{(b.titre || "B")[0].toUpperCase()}</div>
                }
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, fontSize: 15 }}>{b.titre}</p>
                  <p style={{ fontSize: 12, color: "#8a8477", marginTop: 2 }}>{b.ville}</p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Link href={`/annonces/${b.id}`}
                    style={{ fontSize: 12, fontWeight: 600, color: "#111", textDecoration: "none", border: "1px solid #EAE6DF", borderRadius: 999, padding: "6px 14px" }}>
                    Voir l'annonce
                  </Link>
                  {b.proprietaire_email && (
                    <Link href={`/messages?with=${b.proprietaire_email}`}
                      style={{ fontSize: 12, fontWeight: 600, color: "#111", textDecoration: "none", border: "1px solid #EAE6DF", borderRadius: 999, padding: "6px 14px" }}>
                      Contacter
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats — Total / En cours / Planifiés (avec indicateur en retard) /
            Terminés (proprio) / Coût total (proprio). Calcul "en retard"
            inline : événement planifié dont la date est passée — alerte
            visuelle au proprio pour qu'il agisse. */}
        {(() => {
          const nowMs = Date.now()
          const enRetard = evenements.filter(e =>
            e.statut === "planifié"
            && e.date_evenement
            && new Date(e.date_evenement).getTime() < nowMs
          ).length
          const termines = evenements.filter(e => e.statut === "terminé").length
          const enCours = evenements.filter(e => e.statut === "en cours").length
          const planifies = evenements.filter(e => e.statut === "planifié").length
          const tiles = [
            { label: "Total", val: evenements.length, bg: "white" },
            { label: "En cours", val: enCours, bg: enCours > 0 ? "#EEF3FB" : "white", color: enCours > 0 ? "#1d4ed8" : undefined },
            { label: enRetard > 0 ? `Planifiés · ${enRetard} en retard` : "Planifiés", val: planifies, bg: enRetard > 0 ? "#FEECEC" : "white", color: enRetard > 0 ? "#b91c1c" : undefined },
            ...(proprietaireActive ? [
              { label: "Terminés", val: termines, bg: termines > 0 ? "#F0FAEE" : "white", color: termines > 0 ? "#15803d" : undefined },
              { label: "Coût total", val: `${totalCout.toLocaleString("fr-FR")} €`, bg: "white" },
            ] : []),
          ]
          const cols = isMobile ? "1fr 1fr" : `repeat(${tiles.length}, 1fr)`
          return (
            <div style={{ display: "grid", gridTemplateColumns: cols, gap: 12, marginBottom: 24 }}>
              {tiles.map(s => (
                <div key={s.label} style={{ background: s.bg, borderRadius: 16, padding: "16px 20px" }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: (s as any).color || "#111" }}>{s.val}</div>
                  <div style={{ fontSize: 12, color: "#8a8477", marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )
        })()}

        {/* Formulaire */}
        {showForm && (
          <div style={{ background: "white", borderRadius: 20, padding: 28, marginBottom: 24, border: "2px solid #111" }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 20 }}>
              {proprietaireActive ? "Nouvel événement" : "Signaler un problème"}
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#8a8477", display: "block", marginBottom: 6 }}>Bien concerné *</label>
                <select style={inp} value={form.annonce_id} onChange={set("annonce_id")}>
                  <option value="">Sélectionner un bien</option>
                  {biens.map(b => <option key={b.id} value={b.id}>{b.titre} — {b.ville}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#8a8477", display: "block", marginBottom: 6 }}>Titre *</label>
                <input style={inp} value={form.titre} onChange={set("titre")} placeholder={proprietaireActive ? "Ex: Remplacement chaudière" : "Ex: Fuite sous l'évier"} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#8a8477", display: "block", marginBottom: 6 }}>Type</label>
                <select style={inp} value={form.type} onChange={set("type")}>
                  {(Object.keys(TYPE_LABELS) as TypeEvent[]).map(t => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#8a8477", display: "block", marginBottom: 6 }}>Statut</label>
                <select style={inp} value={form.statut} onChange={set("statut")}>
                  <option value="planifié">Planifié</option>
                  <option value="en cours">En cours</option>
                  <option value="terminé">Terminé</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#8a8477", display: "block", marginBottom: 6 }}>Date</label>
                <input type="date" style={inp} value={form.date_evenement} onChange={set("date_evenement")} />
              </div>
              {proprietaireActive && (
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#8a8477", display: "block", marginBottom: 6 }}>Coût (€)</label>
                  <input type="number" style={inp} value={form.cout} onChange={set("cout")} placeholder="0" />
                </div>
              )}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#8a8477", display: "block", marginBottom: 6 }}>Description</label>
                <textarea style={{ ...inp, resize: "vertical", minHeight: 80 }} value={form.description} onChange={set("description")} placeholder="Décrivez l'intervention ou le problème…" />
              </div>
            </div>
            {erreur && <div style={{ background: "#FEECEC", color: "#b91c1c", border: "1px solid #F4C9C9", padding: "10px 16px", borderRadius: 12, fontSize: 13, fontWeight: 500, marginTop: 16 }}>{erreur}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <button onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }}
                style={{ padding: "10px 20px", background: "none", border: "1px solid #EAE6DF", borderRadius: 999, cursor: "pointer", fontWeight: 600, fontSize: 14, fontFamily: "inherit" }}>
                Annuler
              </button>
              <button onClick={ajouter} disabled={saving}
                style={{ padding: "10px 24px", background: "#111", color: "white", border: "none", borderRadius: 999, cursor: saving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 14, fontFamily: "inherit", opacity: saving ? 0.6 : 1 }}>
                {saving ? "Enregistrement..." : (proprietaireActive ? "Ajouter" : "Envoyer le signalement")}
              </button>
            </div>
          </div>
        )}

        {/* Filtres */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", background: "white", borderRadius: 10, padding: 4, gap: 2 }}>
            {(["tous", "planifié", "en cours", "terminé"] as const).map(s => (
              <button key={s} onClick={() => setFiltreStatut(s)}
                style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, background: filtreStatut === s ? "#111" : "transparent", color: filtreStatut === s ? "white" : "#8a8477" }}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          {biens.length > 1 && (
            <select value={filtreBien} onChange={e => setFiltreBien(e.target.value)}
              style={{ padding: "6px 14px", borderRadius: 10, border: "1px solid #EAE6DF", fontSize: 12, fontWeight: 600, fontFamily: "inherit", background: "white", cursor: "pointer" }}>
              <option value="tous">Tous les biens</option>
              {biens.map(b => <option key={b.id} value={String(b.id)}>{b.titre}</option>)}
            </select>
          )}
          {proprietaireActive && nbLocataireSignals > 0 && (
            <div style={{ display: "flex", background: "white", borderRadius: 10, padding: 4, gap: 2 }}>
              {(["tous", "proprio", "locataire"] as const).map(s => (
                <button key={s} onClick={() => setFiltreSource(s)}
                  style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, background: filtreSource === s ? "#111" : "transparent", color: filtreSource === s ? "white" : "#8a8477" }}>
                  {s === "tous" ? "Tous" : s === "proprio" ? "Mes ajouts" : `Signalements (${nbLocataireSignals})`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Liste */}
        {evenementsFiltres.length === 0 ? (
          <EmptyState
            title="Aucun événement"
            description={proprietaireActive ? "Ajoutez votre premier événement d'entretien." : "Aucune intervention enregistrée pour ce logement."}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {evenementsFiltres.map(e => {
              const bien = biens.find(b => b.id === e.annonce_id)
              const s = STATUT_STYLE[e.statut as Statut] ?? STATUT_STYLE["planifié"]
              const isLocataireEntry = !!e.locataire_email
              const locataireProfil = locataires[e.locataire_email]
              const canEdit = proprietaireActive || e.locataire_email === session?.user?.email
              return (
                <div key={e.id} style={{ background: "white", borderRadius: 16, padding: "18px 22px", display: "flex", alignItems: "flex-start", gap: 16, border: e.type === "urgence" ? "1.5px solid #b91c1c" : (isLocataireEntry && proprietaireActive ? "1px solid #EADFC6" : "1px solid transparent") }}>
                  <div style={{ flexShrink: 0, background: e.type === "urgence" ? "#FEECEC" : "#F7F4EF", borderRadius: 10, padding: "6px 10px", fontSize: 11, fontWeight: 700, color: e.type === "urgence" ? "#b91c1c" : "#111", textTransform: "uppercase", letterSpacing: "0.5px" }}>{TYPE_LABELS[e.type as TypeEvent] ?? "Autre"}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <p style={{ fontWeight: 700, fontSize: 15 }}>{e.titre}</p>
                          {isLocataireEntry && (
                            <span style={{ background: "#FBF6EA", color: "#a16207", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, border: "1px solid #EADFC6", textTransform: "uppercase", letterSpacing: "1.2px" }}>
                              {proprietaireActive
                                ? `Signalé par ${formatNomComplet(locataireProfil) || e.locataire_email}`
                                : "Votre signalement"}
                            </span>
                          )}
                        </div>
                        {bien && biens.length > 1 && (
                          <p style={{ fontSize: 12, color: "#8a8477", marginTop: 2 }}>{bien.titre} · {bien.ville}</p>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                        <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                          {e.statut}
                        </span>
                        {e.cout && proprietaireActive && (
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{Number(e.cout).toLocaleString("fr-FR")} €</span>
                        )}
                      </div>
                    </div>

                    {e.description && (
                      <p style={{ fontSize: 13, color: "#8a8477", marginTop: 6, lineHeight: 1.5 }}>{e.description}</p>
                    )}

                    <div style={{ display: "flex", gap: 12, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
                      {e.date_evenement && (() => {
                        // Format court éditorial "12 nov. 2026" + indicateur "en retard"
                        // si planifié et date passée — flag rouge pour pousser à l'action.
                        const d = new Date(e.date_evenement)
                        const isOverdue = e.statut === "planifié" && d.getTime() < Date.now()
                        const formatted = d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
                        return (
                          <span style={{
                            fontSize: 12,
                            color: isOverdue ? "#b91c1c" : "#8a8477",
                            fontWeight: isOverdue ? 700 : 400,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                          }}>
                            {isOverdue && (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                              </svg>
                            )}
                            {formatted}
                            {isOverdue && " · en retard"}
                          </span>
                        )
                      })()}
                      {canEdit && e.statut !== "terminé" && (
                        <button onClick={() => changerStatut(e.id, e.statut === "planifié" ? "en cours" : "terminé")}
                          style={{ fontSize: 12, fontWeight: 600, background: "#F7F4EF", border: "none", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", color: "#111" }}>
                          → {e.statut === "planifié" ? "Démarrer" : "Terminer"}
                        </button>
                      )}
                      {/* Locataire peut contacter le proprio depuis une entrée signalée */}
                      {!proprietaireActive && bien?.proprietaire_email && (
                        <Link href={`/messages?with=${bien.proprietaire_email}`}
                          style={{ fontSize: 12, fontWeight: 600, color: "#111", textDecoration: "none", border: "1px solid #EAE6DF", borderRadius: 8, padding: "4px 10px" }}>
                          Contacter
                        </Link>
                      )}
                      {canEdit && (
                        <button onClick={() => supprimer(e.id)}
                          style={{ fontSize: 12, fontWeight: 600, background: "#FEECEC", border: "1px solid #F4C9C9", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", color: "#b91c1c", marginLeft: "auto" }}>
                          Supprimer
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
