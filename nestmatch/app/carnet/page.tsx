"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../lib/supabase"
import { useRole } from "../providers"
import { useResponsive } from "../hooks/useResponsive"

type Statut = "planifié" | "en cours" | "terminé"
type TypeEvent = "chaudière" | "plomberie" | "électricité" | "travaux" | "serrurerie" | "nuisibles" | "autre"

const TYPE_LABELS: Record<TypeEvent, string> = {
  "chaudière": "Chaud.", "plomberie": "Plomb.", "électricité": "Élec.",
  "travaux": "Trav.", "serrurerie": "Serr.", "nuisibles": "Nuis.", "autre": "Autre",
}
const STATUT_STYLE: Record<Statut, { bg: string; color: string; border: string }> = {
  "planifié": { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
  "en cours": { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  "terminé":  { bg: "#dcfce7", color: "#15803d", border: "#bbf7d0" },
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
        const { data: profils } = await supabase.from("profils").select("email, nom").in("email", locEmails)
        if (profils) {
          const map: Record<string, any> = {}
          profils.forEach((p: any) => { map[p.email] = p })
          setLocataires(map)
        }
      }
    } else {
      // Locataire : trouver les visites confirmées pour obtenir les biens
      const { data: visites } = await supabase
        .from("visites")
        .select("annonce_id, proprietaire_email")
        .eq("locataire_email", email)
        .in("statut", ["confirmée", "effectuée"])
      if (!visites || visites.length === 0) { setLoading(false); return }

      const annonceIds = [...new Set(visites.map((v: any) => v.annonce_id))]
      const [{ data: b }, { data: e }] = await Promise.all([
        supabase.from("annonces").select("id, titre, ville, photos, proprietaire_email").in("id", annonceIds),
        supabase.from("carnet_entretien").select("*").in("annonce_id", annonceIds).order("date_evenement", { ascending: false }),
      ])
      setBiens(b || [])
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
    else if (data) { setEvenements(prev => [data, ...prev]); setForm(EMPTY_FORM); setShowForm(false) }
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
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#6b7280" }}>Chargement...</div>
  )

  // Locataire sans logement actif
  if (!proprietaireActive && biens.length === 0) return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: isMobile ? "24px 16px" : "40px 48px" }}>
      <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center", paddingTop: 80 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Carnet d'entretien</h1>
        <p style={{ fontSize: 15, color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
          Le carnet d'entretien est disponible une fois votre visite confirmée.<br />
          Il relie votre logement, votre propriétaire et l'historique des travaux.
        </p>
        <Link href="/visites" style={{ padding: "12px 28px", background: "#111", color: "white", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 14 }}>
          Voir mes visites
        </Link>
      </div>
    </main>
  )

  const inp: any = { width: "100%", padding: "10px 14px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 16, outline: "none", boxSizing: "border-box", fontFamily: "inherit", background: "white" }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: isMobile ? "24px 16px" : "40px 48px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", marginBottom: 28, flexDirection: isMobile ? "column" : "row", gap: isMobile ? 14 : 0 }}>
          <div>
            <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, letterSpacing: "-0.5px" }}>Carnet d'entretien</h1>
            <p style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>
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
              <div key={b.id} style={{ background: "white", borderRadius: 16, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, border: "1.5px solid #e5e7eb" }}>
                {Array.isArray(b.photos) && b.photos[0]
                  ? <img src={b.photos[0]} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                  : <div style={{ width: 56, height: 56, borderRadius: 10, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: "#6b7280", flexShrink: 0 }}>{(b.titre || "B")[0].toUpperCase()}</div>
                }
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, fontSize: 15 }}>{b.titre}</p>
                  <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{b.ville}</p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Link href={`/annonces/${b.id}`}
                    style={{ fontSize: 12, fontWeight: 600, color: "#111", textDecoration: "none", border: "1.5px solid #e5e7eb", borderRadius: 999, padding: "6px 14px" }}>
                    Voir l'annonce
                  </Link>
                  {b.proprietaire_email && (
                    <Link href={`/messages?with=${b.proprietaire_email}`}
                      style={{ fontSize: 12, fontWeight: 600, color: "#111", textDecoration: "none", border: "1.5px solid #e5e7eb", borderRadius: 999, padding: "6px 14px" }}>
                      Contacter
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : `repeat(${proprietaireActive ? 4 : 3}, 1fr)`, gap: 12, marginBottom: 24 }}>
          {[
            { label: "Total", val: evenements.length, bg: "white" },
            { label: "En cours", val: evenements.filter(e => e.statut === "en cours").length, bg: evenements.filter(e => e.statut === "en cours").length > 0 ? "#eff6ff" : "white", color: evenements.filter(e => e.statut === "en cours").length > 0 ? "#1d4ed8" : undefined },
            { label: "Planifiés", val: evenements.filter(e => e.statut === "planifié").length, bg: "white" },
            ...(proprietaireActive ? [{ label: "Coût total", val: `${totalCout.toLocaleString("fr-FR")} €`, bg: "white" }] : []),
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: 16, padding: "16px 20px" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: (s as any).color || "#111" }}>{s.val}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Formulaire */}
        {showForm && (
          <div style={{ background: "white", borderRadius: 20, padding: 28, marginBottom: 24, border: "2px solid #111" }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 20 }}>
              {proprietaireActive ? "Nouvel événement" : "Signaler un problème"}
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 6 }}>Bien concerné *</label>
                <select style={inp} value={form.annonce_id} onChange={set("annonce_id")}>
                  <option value="">Sélectionner un bien</option>
                  {biens.map(b => <option key={b.id} value={b.id}>{b.titre} — {b.ville}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 6 }}>Titre *</label>
                <input style={inp} value={form.titre} onChange={set("titre")} placeholder={proprietaireActive ? "Ex: Remplacement chaudière" : "Ex: Fuite sous l'évier"} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 6 }}>Type</label>
                <select style={inp} value={form.type} onChange={set("type")}>
                  {(Object.keys(TYPE_LABELS) as TypeEvent[]).map(t => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 6 }}>Statut</label>
                <select style={inp} value={form.statut} onChange={set("statut")}>
                  <option value="planifié">Planifié</option>
                  <option value="en cours">En cours</option>
                  <option value="terminé">Terminé</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 6 }}>Date</label>
                <input type="date" style={inp} value={form.date_evenement} onChange={set("date_evenement")} />
              </div>
              {proprietaireActive && (
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 6 }}>Coût (€)</label>
                  <input type="number" style={inp} value={form.cout} onChange={set("cout")} placeholder="0" />
                </div>
              )}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 6 }}>Description</label>
                <textarea style={{ ...inp, resize: "vertical", minHeight: 80 }} value={form.description} onChange={set("description")} placeholder="Décrivez l'intervention ou le problème…" />
              </div>
            </div>
            {erreur && <div style={{ background: "#fee2e2", color: "#dc2626", padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, marginTop: 16 }}>{erreur}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <button onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }}
                style={{ padding: "10px 20px", background: "none", border: "1.5px solid #e5e7eb", borderRadius: 999, cursor: "pointer", fontWeight: 600, fontSize: 14, fontFamily: "inherit" }}>
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
                style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, background: filtreStatut === s ? "#111" : "transparent", color: filtreStatut === s ? "white" : "#6b7280" }}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          {biens.length > 1 && (
            <select value={filtreBien} onChange={e => setFiltreBien(e.target.value)}
              style={{ padding: "6px 14px", borderRadius: 10, border: "1.5px solid #e5e7eb", fontSize: 12, fontWeight: 600, fontFamily: "inherit", background: "white", cursor: "pointer" }}>
              <option value="tous">Tous les biens</option>
              {biens.map(b => <option key={b.id} value={String(b.id)}>{b.titre}</option>)}
            </select>
          )}
          {proprietaireActive && nbLocataireSignals > 0 && (
            <div style={{ display: "flex", background: "white", borderRadius: 10, padding: 4, gap: 2 }}>
              {(["tous", "proprio", "locataire"] as const).map(s => (
                <button key={s} onClick={() => setFiltreSource(s)}
                  style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, background: filtreSource === s ? "#111" : "transparent", color: filtreSource === s ? "white" : "#6b7280" }}>
                  {s === "tous" ? "Tous" : s === "proprio" ? "Mes ajouts" : `Signalements (${nbLocataireSignals})`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Liste */}
        {evenementsFiltres.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", background: "white", borderRadius: 20 }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "#374151" }}>Aucun événement</p>
            <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>
              {proprietaireActive ? "Ajoutez votre premier événement d'entretien" : "Aucune intervention enregistrée pour ce logement"}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {evenementsFiltres.map(e => {
              const bien = biens.find(b => b.id === e.annonce_id)
              const s = STATUT_STYLE[e.statut as Statut] ?? STATUT_STYLE["planifié"]
              const isLocataireEntry = !!e.locataire_email
              const locataireProfil = locataires[e.locataire_email]
              const canEdit = proprietaireActive || e.locataire_email === session?.user?.email
              return (
                <div key={e.id} style={{ background: "white", borderRadius: 16, padding: "18px 22px", display: "flex", alignItems: "flex-start", gap: 16, border: isLocataireEntry && proprietaireActive ? "1.5px solid #fde68a" : "1.5px solid transparent" }}>
                  <div style={{ flexShrink: 0, background: "#f3f4f6", borderRadius: 10, padding: "6px 10px", fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.5px" }}>{TYPE_LABELS[e.type as TypeEvent] ?? "Autre"}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <p style={{ fontWeight: 700, fontSize: 15 }}>{e.titre}</p>
                          {isLocataireEntry && (
                            <span style={{ background: "#fef3c7", color: "#92400e", fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999, border: "1px solid #fde68a" }}>
                              {proprietaireActive
                                ? `Signalé par ${locataireProfil?.nom || e.locataire_email}`
                                : "Votre signalement"}
                            </span>
                          )}
                        </div>
                        {bien && biens.length > 1 && (
                          <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{bien.titre} · {bien.ville}</p>
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
                      <p style={{ fontSize: 13, color: "#6b7280", marginTop: 6, lineHeight: 1.5 }}>{e.description}</p>
                    )}

                    <div style={{ display: "flex", gap: 12, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
                      {e.date_evenement && (
                        <span style={{ fontSize: 12, color: "#9ca3af" }}>
                          {new Date(e.date_evenement).toLocaleDateString("fr-FR")}
                        </span>
                      )}
                      {canEdit && e.statut !== "terminé" && (
                        <button onClick={() => changerStatut(e.id, e.statut === "planifié" ? "en cours" : "terminé")}
                          style={{ fontSize: 12, fontWeight: 600, background: "#f3f4f6", border: "none", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", color: "#374151" }}>
                          → {e.statut === "planifié" ? "Démarrer" : "Terminer"}
                        </button>
                      )}
                      {/* Locataire peut contacter le proprio depuis une entrée signalée */}
                      {!proprietaireActive && bien?.proprietaire_email && (
                        <Link href={`/messages?with=${bien.proprietaire_email}`}
                          style={{ fontSize: 12, fontWeight: 600, color: "#111", textDecoration: "none", border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "4px 10px" }}>
                          Contacter
                        </Link>
                      )}
                      {canEdit && (
                        <button onClick={() => supprimer(e.id)}
                          style={{ fontSize: 12, fontWeight: 600, background: "#fee2e2", border: "none", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", color: "#dc2626", marginLeft: "auto" }}>
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
