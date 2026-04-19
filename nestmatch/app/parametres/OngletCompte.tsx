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
    await supabase.from("profils").upsert({ email, ...next }, { onConflict: "email" })
    setSaving(false)
  }

  async function telechargerMesDonnees() {
    const email = session?.user?.email
    if (!email) return
    // Export RGPD minimal côté client. Les données complètes restent serveur
    // et nécessiteront une API dédiée — ici on fournit le profil utilisateur.
    const { data: profil } = await supabase.from("profils").select("*").eq("email", email).single()
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
      {proprietaireActive && (
        <section style={{ background: "white", borderRadius: 20, padding: 28 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>Mode vacances</h2>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 16px", lineHeight: 1.5 }}>
            Masque temporairement vos annonces disponibles de la recherche publique. Un bandeau sur vos fiches annonces prévient les locataires intéressés.
          </p>
          {vacancesLoading ? (
            <p style={{ fontSize: 13, color: "#9ca3af" }}>Chargement…</p>
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
                <span style={{ fontSize: 14, fontWeight: 700 }}>J&apos;active le mode vacances</span>
              </label>
              {vacancesActif && (
                <div style={{ marginTop: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>
                    Message affiché sur vos fiches ({vacancesMessage.length}/{VACANCES_MAX_LENGTH})
                  </label>
                  <textarea
                    value={vacancesMessage}
                    onChange={(e) => setVacancesMessage(e.target.value.slice(0, VACANCES_MAX_LENGTH))}
                    onBlur={() => { if (vacancesActif) sauverVacances(true, vacancesMessage) }}
                    placeholder="Ex : Je suis en congés jusqu'au 25 août. Je réponds aux messages à mon retour. Merci pour votre patience."
                    rows={3}
                    maxLength={VACANCES_MAX_LENGTH}
                    style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e5e7eb", borderRadius: 12, fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", outline: "none" }}
                  />
                </div>
              )}
              {vacancesSaving && <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 10 }}>Enregistrement…</p>}
              {vacancesSaved && !vacancesSaving && <p style={{ fontSize: 11, color: "#16a34a", marginTop: 10, fontWeight: 700 }}>Enregistré.</p>}
              {vacancesError && <p style={{ fontSize: 12, color: "#dc2626", marginTop: 10 }}>{vacancesError}</p>}
            </>
          )}
        </section>
      )}

      <section style={{ background: "white", borderRadius: 20, padding: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>Notifications par e-mail</h2>
        <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 18px", lineHeight: 1.5 }}>
          Choisissez les événements pour lesquels vous souhaitez recevoir un e-mail. Vos préférences sont enregistrées automatiquement.
          {" "}
          <em>Note : l&apos;envoi d&apos;e-mails est en cours de mise en place — vos choix seront appliqués dès l&apos;activation.</em>
        </p>
        {loading ? (
          <p style={{ fontSize: 13, color: "#9ca3af" }}>Chargement…</p>
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
                  <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{label}</p>
                  <p style={{ fontSize: 12, color: "#6b7280", margin: "2px 0 0", lineHeight: 1.5 }}>{desc}</p>
                </div>
              </label>
            ))}
          </div>
        )}
        {saving && <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 12 }}>Enregistrement…</p>}
      </section>

      <section style={{ background: "white", borderRadius: 20, padding: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>Mes données</h2>
        <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 16px", lineHeight: 1.5 }}>
          Téléchargez une copie JSON de votre profil. Pour une extraction complète (messages, candidatures, dossier), contactez-nous depuis la page Contact.
        </p>
        <button
          type="button"
          onClick={telechargerMesDonnees}
          style={{ background: "white", color: "#111", border: "1.5px solid #111", borderRadius: 999, padding: "10px 22px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          Télécharger mes données (JSON)
        </button>
      </section>

      <section style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 20, padding: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: "#991b1b", margin: "0 0 4px" }}>Zone sensible</h2>
        <p style={{ fontSize: 13, color: "#7f1d1d", margin: "0 0 14px", lineHeight: 1.5 }}>
          La suppression du compte est définitive. Vos annonces, messages, visites et dossier sont effacés sans possibilité de récupération.
        </p>
        {!showDelete ? (
          <button onClick={() => setShowDelete(true)}
            style={{ background: "white", border: "1.5px solid #dc2626", color: "#dc2626", borderRadius: 999, padding: "10px 22px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            Supprimer mon compte
          </button>
        ) : (
          <DeleteAccountForm onCancel={() => setShowDelete(false)} />
        )}
      </section>
    </div>
  )
}
