"use client"
import { useState } from "react"
import PasswordInput from "../components/PasswordInput"

/**
 * Formulaire de changement de mot de passe.
 * POST /api/account/change-password — déjà en place côté serveur.
 */
export default function ChangePasswordForm({ onDone }: { onDone: () => void }) {
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
    <p style={{ marginTop: 14, color: "#15803d", fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span aria-hidden style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: "#DCF5E4", border: "1px solid #C6E9C0", color: "#15803d" }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </span>
      Mot de passe mis à jour.
    </p>
  )

  return (
    <form onSubmit={submit} style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10, maxWidth: 420 }}>
      <PasswordInput value={currentPassword} onChange={setCurrentPassword} placeholder="Mot de passe actuel" required autoComplete="current-password" />
      <PasswordInput value={newPassword} onChange={setNewPassword} placeholder="Nouveau mot de passe (8+ caractères)" required minLength={8} autoComplete="new-password" />
      <PasswordInput value={confirmPassword} onChange={setConfirmPassword} placeholder="Confirmer le nouveau mot de passe" required autoComplete="new-password" />
      {error && <p style={{ color: "#b91c1c", fontSize: 13, background: "#FEECEC", border: "1px solid #F4C9C9", borderRadius: 12, padding: "8px 12px", margin: 0 }}>{error}</p>}
      <button type="submit" disabled={loading}
        style={{ alignSelf: "flex-start", background: "#111", color: "white", border: "none", borderRadius: 999, padding: "10px 22px", fontWeight: 600, fontSize: 11, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}>
        {loading ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  )
}
