"use client"
import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { supabase } from "../../lib/supabase"
import { useRole } from "../providers"
import DeleteAccountForm from "./DeleteAccountForm"

const VACANCES_MAX_LENGTH = 400

type NotifPrefs = {
  notif_messages_email: boolean
  notif_visites_email: boolean
  notif_candidatures_email: boolean
  notif_loyer_retard_email: boolean
}

const DEFAULT_PREFS: NotifPrefs = {
  notif_messages_email: true,
  notif_visites_email: true,
  notif_candidatures_email: true,
  notif_loyer_retard_email: true,
}

const LABELS: { key: keyof NotifPrefs; label: string; desc: string }[] = [
  { key: "notif_messages_email", label: "Nouveaux messages", desc: "Un e-mail lorsqu'un interlocuteur vous envoie un message." },
  { key: "notif_visites_email", label: "Demandes de visite", desc: "Proposition, confirmation ou annulation d'une visite." },
  { key: "notif_candidatures_email", label: "Nouvelles candidatures", desc: "Quand un locataire contacte l'une de vos annonces (propriétaires)." },
  { key: "notif_loyer_retard_email", label: "Loyer en retard", desc: "Rappel automatique si un loyer n'est pas confirmé après le 10 du mois." },
]

export default function OngletCompte() {
  const { data: session } = useSession()
  const { proprietaireActive } = useRole()
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  // Mode vacances : actif + message auto-répondeur (affichés proprio only)
  const [vacancesActif, setVacancesActif] = useState(false)
  const [vacancesMessage, setVacancesMessage] = useState("")
  const [vacancesLoading, setVacancesLoading] = useState(true)
  const [vacancesSaving, setVacancesSaving] = useState(false)
  const [vacancesSaved, setVacancesSaved] = useState(false)
  const [vacancesError, setVacancesError] = useState<string | null>(null)

  useEffect(() => {
    const email = session?.user?.email
    if (!email) return
    supabase.from("profils")
      .select("notif_messages_email, notif_visites_email, notif_candidatures_email, notif_loyer_retard_email")
      .eq("email", email)
      .single()
      .then(({ data }) => {
        if (data) {
          setPrefs({
            notif_messages_email: data.notif_messages_email ?? true,
            notif_visites_email: data.notif_visites_email ?? true,
            notif_candidatures_email: data.notif_candidatures_email ?? true,
            notif_loyer_retard_email: data.notif_loyer_retard_email ?? true,
          })
        }
        setLoading(false)
      })
  }, [session?.user?.email])

  // Charge l'état vacances initial côté proprio uniquement
  useEffect(() => {
    if (!proprietaireActive) {
      setVacancesLoading(false)
      return
    }
    fetch("/api/profil/vacances").then(async (r) => {
      if (!r.ok) { setVacancesLoading(false); return }
      const json = await r.json()
      if (json.ok) {
        setVacancesActif(!!json.vacances_actif)
        setVacancesMessage(json.vacances_message ?? "")
      }
      setVacancesLoading(false)
    }).catch(() => setVacancesLoading(false))
  }, [proprietaireActive])

  async function sauverVacances(nextActif: boolean, nextMessage: string) {
    setVacancesSaving(true)
    setVacancesSaved(false)
    setVacancesError(null)
    try {
      const res = await fetch("/api/profil/vacances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actif: nextActif, message: nextMessage.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setVacancesError(json.error || "Erreur d'enregistrement")
      } else {
        setVacancesActif(!!json.vacances_actif)
        setVacancesMessage(json.vacances_message ?? "")
        setVacancesSaved(true)
        setTimeout(() => setVacancesSaved(false), 2500)
      }
    } catch {
      setVacancesError("Erreur réseau, réessayez.")
    } finally {
      setVacancesSaving(false)
    }
  }

  async function togglePref(key: keyof NotifPrefs) {
    const email = session?.user?.email
    if (!email) return
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    setSaving(true)
    // V24.3 — via /api/profil/save
    try {
      await fetch("/api/profil/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      })
    } catch { /* noop */ }
    setSaving(false)
  }

  async function telechargerMesDonnees() {
    const email = session?.user?.email
    if (!email) return
    // Export RGPD minimal côté client. Les données complètes restent serveur
    // et nécessiteront une API dédiée — ici on fournit le profil utilisateur.
    // V29.B — /api/profil/me (RLS Phase 5)
    const meRes = await fetch("/api/profil/me", { cache: "no-store" })
    const meJson = await meRes.json().catch(() => ({}))
    const profil = meJson.ok ? meJson.profil : null
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), email, profil }, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `export-${email}-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500&display=swap');`}</style>
      {proprietaireActive && (
        <section style={{ background: "white", border: "1px solid #EAE6DF", borderRadius: 20, padding: 28, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
          <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, letterSpacing: "-0.3px", color: "#111", margin: "0 0 6px" }}>Message d&apos;indisponibilité</h2>
          <p style={{ fontSize: 13, color: "#8a8477", margin: "0 0 16px", lineHeight: 1.5 }}>
            Affiche un bandeau sur vos fiches annonces pour prévenir les locataires que vos réponses peuvent tarder (congés, forte activité, etc.). Vos annonces restent visibles et les candidatures possibles.
          </p>
          {vacancesLoading ? (
            <p style={{ fontSize: 13, color: "#8a8477" }}>Chargement…</p>
          ) : (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={vacancesActif}
                  onChange={(e) => sauverVacances(e.target.checked, vacancesMessage)}
                  disabled={vacancesSaving}
                  style={{ width: 18, height: 18, accentColor: "#111", cursor: vacancesSaving ? "wait" : "pointer" }}
                />
                <span style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>Afficher le bandeau sur mes annonces</span>
              </label>
              {vacancesActif && (
                <div style={{ marginTop: 14 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "1.2px" }}>
                    Message affiché sur vos fiches ({vacancesMessage.length}/{VACANCES_MAX_LENGTH})
                  </label>
                  <textarea
                    value={vacancesMessage}
                    onChange={(e) => setVacancesMessage(e.target.value.slice(0, VACANCES_MAX_LENGTH))}
                    onBlur={() => { if (vacancesActif) sauverVacances(true, vacancesMessage) }}
                    placeholder="Ex : Délai de réponse actuel 3 à 5 jours. Merci pour votre patience."
                    rows={3}
                    maxLength={VACANCES_MAX_LENGTH}
                    style={{ width: "100%", padding: "10px 12px", border: "1px solid #EAE6DF", borderRadius: 12, fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", outline: "none", background: "#fff" }}
                  />
                </div>
              )}
              {vacancesSaving && <p style={{ fontSize: 11, color: "#8a8477", marginTop: 10 }}>Enregistrement…</p>}
              {vacancesSaved && !vacancesSaving && (
                <p style={{ fontSize: 11, color: "#15803d", marginTop: 10, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span aria-hidden style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", background: "#DCF5E4", border: "1px solid #C6E9C0", color: "#15803d" }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </span>
                  Enregistré.
                </p>
              )}
              {vacancesError && <p style={{ fontSize: 12, color: "#b91c1c", marginTop: 10, background: "#FEECEC", border: "1px solid #F4C9C9", borderRadius: 12, padding: "8px 12px" }}>{vacancesError}</p>}
            </>
          )}
        </section>
      )}

      <section style={{ background: "white", border: "1px solid #EAE6DF", borderRadius: 20, padding: 28, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
        <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, letterSpacing: "-0.3px", color: "#111", margin: "0 0 6px" }}>Notifications par e-mail</h2>
        <p style={{ fontSize: 13, color: "#8a8477", margin: "0 0 18px", lineHeight: 1.5 }}>
          Choisissez les événements pour lesquels vous souhaitez recevoir un e-mail. Vos préférences sont enregistrées automatiquement.
          {" "}
          <em>Note : l&apos;envoi d&apos;e-mails est en cours de mise en place — vos choix seront appliqués dès l&apos;activation.</em>
        </p>
        {loading ? (
          <p style={{ fontSize: 13, color: "#8a8477" }}>Chargement…</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {LABELS.map(({ key, label, desc }) => (
              <label key={key} style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={prefs[key]}
                  onChange={() => togglePref(key)}
                  style={{ marginTop: 3, width: 18, height: 18, accentColor: "#111", cursor: "pointer" }}
                />
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: 0 }}>{label}</p>
                  <p style={{ fontSize: 12, color: "#8a8477", margin: "2px 0 0", lineHeight: 1.5 }}>{desc}</p>
                </div>
              </label>
            ))}
          </div>
        )}
        {saving && <p style={{ fontSize: 11, color: "#8a8477", marginTop: 12 }}>Enregistrement…</p>}
      </section>

      <section style={{ background: "white", border: "1px solid #EAE6DF", borderRadius: 20, padding: 28, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
        <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, letterSpacing: "-0.3px", color: "#111", margin: "0 0 6px" }}>Mes données</h2>
        <p style={{ fontSize: 13, color: "#8a8477", margin: "0 0 16px", lineHeight: 1.5 }}>
          Téléchargez une copie JSON de votre profil. Pour une extraction complète (messages, candidatures, dossier), contactez-nous depuis la page Contact.
        </p>
        <button
          type="button"
          onClick={telechargerMesDonnees}
          style={{ background: "#F7F4EF", color: "#111", border: "1px solid #EAE6DF", borderRadius: 999, padding: "10px 22px", fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}>
          Télécharger mes données (JSON)
        </button>
      </section>

      <section style={{ background: "#FEECEC", border: "1px solid #F4C9C9", borderRadius: 20, padding: 26 }}>
        <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 20, letterSpacing: "-0.3px", color: "#b91c1c", margin: "0 0 6px" }}>Zone sensible</h2>
        <p style={{ fontSize: 13, color: "#b91c1c", opacity: 0.85, margin: "0 0 14px", lineHeight: 1.5 }}>
          La suppression du compte est définitive. Vos annonces, messages, visites et dossier sont effacés sans possibilité de récupération.
        </p>
        {!showDelete ? (
          <button onClick={() => setShowDelete(true)}
            style={{ background: "white", border: "1px solid #F4C9C9", color: "#b91c1c", borderRadius: 999, padding: "10px 22px", fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}>
            Supprimer mon compte
          </button>
        ) : (
          <DeleteAccountForm onCancel={() => setShowDelete(false)} />
        )}
      </section>
    </div>
  )
}
