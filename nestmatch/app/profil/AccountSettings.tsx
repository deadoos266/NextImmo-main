"use client"
import { useState } from "react"
import { signOut } from "next-auth/react"
import PasswordInput from "../components/PasswordInput"
import ThemeToggle from "../components/ThemeToggle"

const inp = { width: "100%", padding: "11px 14px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 16, outline: "none", boxSizing: "border-box" as const, fontFamily: "inherit" }

export default function AccountSettings({ userEmail }: { userEmail: string | null }) {
  const [showPwd, setShowPwd] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  return (
    <div style={{ background: "white", borderRadius: 20, padding: 28, marginTop: 24, marginBottom: 20 }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Paramètres du compte</h2>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 24 }}>
        Gestion de votre mot de passe, adresse email et données personnelles.
      </p>

      {/* Mot de passe */}
      <SettingRow
        title="Mot de passe"
        desc="Mettre à jour le mot de passe que vous utilisez pour vous connecter."
        action={
          <button onClick={() => setShowPwd(v => !v)}
            style={{ background: "white", border: "1.5px solid #111", color: "#111", borderRadius: 999, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            {showPwd ? "Annuler" : "Modifier"}
          </button>
        }
      />
      {showPwd && <ChangePasswordForm onDone={() => setShowPwd(false)} />}

      <div style={{ height: 1, background: "#f3f4f6", margin: "20px 0" }} />

      {/* Thème clair/sombre */}
      <ThemeToggle />

      <div style={{ height: 1, background: "#f3f4f6", margin: "20px 0" }} />

      {/* Email */}
      <SettingRow
        title="Adresse email"
        desc={userEmail ? `Compte actuellement associé à ${userEmail}. Le changement d'email est bientôt disponible.` : "Adresse email non disponible"}
        action={
          <button disabled
            style={{ background: "#f3f4f6", border: "1.5px solid #e5e7eb", color: "#9ca3af", borderRadius: 999, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "not-allowed", fontFamily: "inherit" }}>
            Bientôt
          </button>
        }
      />

      <div style={{ height: 1, background: "#f3f4f6", margin: "20px 0" }} />

      {/* Notifications */}
      <SettingRow
        title="Notifications"
        desc="Recevez un email lors des nouveaux messages et demandes de visite. Réglages avancés bientôt disponibles."
        action={
          <button disabled
            style={{ background: "#f3f4f6", border: "1.5px solid #e5e7eb", color: "#9ca3af", borderRadius: 999, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "not-allowed", fontFamily: "inherit" }}>
            Bientôt
          </button>
        }
      />

      <div style={{ height: 1, background: "#f3f4f6", margin: "20px 0" }} />

      {/* Suppression */}
      <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 14, padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: "#991b1b", marginBottom: 4 }}>Zone à risque</h3>
        <p style={{ fontSize: 13, color: "#7f1d1d", marginBottom: 14, lineHeight: 1.5 }}>
          La suppression du compte est définitive. Vos annonces, messages, visites et dossier seront effacés.
        </p>
        {!showDelete ? (
          <button onClick={() => setShowDelete(true)}
            style={{ background: "white", border: "1.5px solid #dc2626", color: "#dc2626", borderRadius: 999, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            Supprimer mon compte
          </button>
        ) : (
          <DeleteAccountForm onCancel={() => setShowDelete(false)} />
        )}
      </div>
    </div>
  )
}

function SettingRow({ title, desc, action }: { title: string; desc: string; action: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 280px" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{title}</h3>
        <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>{desc}</p>
      </div>
      <div style={{ flexShrink: 0 }}>{action}</div>
    </div>
  )
}

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [ok, setOk] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (newPassword.length < 8) { setError("Le nouveau mot de passe doit contenir au moins 8 caractères"); return }
    if (newPassword !== confirmPassword) { setError("Les deux nouveaux mots de passe ne correspondent pas"); return }
    setLoading(true)
    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error || "Erreur lors du changement")
        setLoading(false)
        return
      }
      setOk(true)
      setTimeout(() => { onDone() }, 1800)
    } catch {
      setError("Erreur réseau. Veuillez réessayer.")
      setLoading(false)
    }
  }

  if (ok) return (
    <p style={{ marginTop: 14, color: "#16a34a", fontSize: 13, fontWeight: 600 }}>Mot de passe mis à jour.</p>
  )

  return (
    <form onSubmit={submit} style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10, maxWidth: 420 }}>
      <PasswordInput value={currentPassword} onChange={setCurrentPassword} placeholder="Mot de passe actuel" required autoComplete="current-password" />
      <PasswordInput value={newPassword} onChange={setNewPassword} placeholder="Nouveau mot de passe (8+ caractères)" required minLength={8} autoComplete="new-password" />
      <PasswordInput value={confirmPassword} onChange={setConfirmPassword} placeholder="Confirmer le nouveau mot de passe" required autoComplete="new-password" />
      {error && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}
      <button type="submit" disabled={loading}
        style={{ alignSelf: "flex-start", background: "#111", color: "white", border: "none", borderRadius: 999, padding: "10px 24px", fontWeight: 700, fontSize: 14, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, fontFamily: "inherit" }}>
        {loading ? "Enregistrement..." : "Enregistrer"}
      </button>
    </form>
  )
}

function DeleteAccountForm({ onCancel }: { onCancel: () => void }) {
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (confirm !== "SUPPRIMER") { setError("Tapez SUPPRIMER en majuscules pour confirmer"); return }
    setLoading(true)
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error || "Erreur lors de la suppression")
        setLoading(false)
        return
      }
      await signOut({ callbackUrl: "/" })
    } catch {
      setError("Erreur réseau. Veuillez réessayer.")
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 420 }}>
      <p style={{ fontSize: 13, color: "#7f1d1d" }}>Tapez <strong>SUPPRIMER</strong> pour confirmer la suppression définitive.</p>
      <input type="text" placeholder="SUPPRIMER" value={confirm} onChange={e => setConfirm(e.target.value)} style={inp} />
      {error && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}
      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" disabled={loading || confirm !== "SUPPRIMER"}
          style={{ background: "#dc2626", color: "white", border: "none", borderRadius: 999, padding: "10px 24px", fontWeight: 700, fontSize: 14, cursor: loading ? "not-allowed" : (confirm === "SUPPRIMER" ? "pointer" : "not-allowed"), opacity: confirm === "SUPPRIMER" ? 1 : 0.5, fontFamily: "inherit" }}>
          {loading ? "Suppression..." : "Supprimer définitivement"}
        </button>
        <button type="button" onClick={onCancel} disabled={loading}
          style={{ background: "white", color: "#111", border: "1.5px solid #e5e7eb", borderRadius: 999, padding: "10px 24px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
          Annuler
        </button>
      </div>
    </form>
  )
}
