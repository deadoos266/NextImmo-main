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
