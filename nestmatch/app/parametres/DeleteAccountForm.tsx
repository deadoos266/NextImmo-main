"use client"
import { useState } from "react"
import { signOut } from "next-auth/react"

const inp = { width: "100%", padding: "11px 14px", border: "1px solid #EAE6DF", borderRadius: 10, fontSize: 16, outline: "none", boxSizing: "border-box" as const, fontFamily: "inherit", background: "#fff" }

/**
 * Suppression de compte (RGPD).
 * L'API /api/account/delete fait le nettoyage cascade (profils, messages,
 * annonces, visites, etc.) — on ne touche pas à cette logique.
 */
export default function DeleteAccountForm({ onCancel }: { onCancel: () => void }) {
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
      <p style={{ fontSize: 13, color: "#b91c1c" }}>Tapez <strong>SUPPRIMER</strong> pour confirmer la suppression définitive.</p>
      <input type="text" placeholder="SUPPRIMER" value={confirm} onChange={e => setConfirm(e.target.value)} style={inp} />
      {error && <p style={{ color: "#b91c1c", fontSize: 13, background: "#FEECEC", border: "1px solid #F4C9C9", borderRadius: 12, padding: "8px 12px", margin: 0 }}>{error}</p>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="submit" disabled={loading || confirm !== "SUPPRIMER"}
          style={{ background: "#b91c1c", color: "white", border: "none", borderRadius: 999, padding: "10px 22px", fontWeight: 600, fontSize: 11, cursor: loading ? "not-allowed" : (confirm === "SUPPRIMER" ? "pointer" : "not-allowed"), opacity: confirm === "SUPPRIMER" ? 1 : 0.5, fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}>
          {loading ? "Suppression…" : "Supprimer définitivement"}
        </button>
        <button type="button" onClick={onCancel} disabled={loading}
          style={{ background: "white", color: "#111", border: "1px solid #EAE6DF", borderRadius: 999, padding: "10px 22px", fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}>
          Annuler
        </button>
      </div>
    </form>
  )
}
