"use client"
import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"

export default function ResetPasswordPage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const token = params?.token || ""

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError("Au moins 8 caractères."); return }
    if (password !== confirm) { setError("Les deux mots de passe ne correspondent pas."); return }
    setSubmitting(true)
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        setError(json.error || "Lien invalide ou expiré")
        setSubmitting(false)
        return
      }
      setDone(true)
      setTimeout(() => router.push("/auth?reset=1"), 2000)
    } catch {
      setError("Erreur réseau, réessayez.")
      setSubmitting(false)
    }
  }

  const inp: React.CSSProperties = {
    width: "100%",
    padding: "11px 14px",
    border: "1px solid #EAE6DF",
    borderRadius: 10,
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: "40px 16px" }}>
      <div style={{ maxWidth: 440, margin: "0 auto", background: "white", borderRadius: 20, padding: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 8px", letterSpacing: "-0.4px" }}>
          Nouveau mot de passe
        </h1>
        <p style={{ fontSize: 13, color: "#8a8477", margin: "0 0 22px", lineHeight: 1.5 }}>
          Choisissez un mot de passe d&apos;au moins 8 caractères.
        </p>

        {done ? (
          <div style={{ background: "#F0FAEE", border: "1px solid #C6E9C0", borderRadius: 12, padding: 16, color: "#15803d" }}>
            <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Mot de passe modifié.</p>
            <p style={{ fontSize: 13, margin: "4px 0 0" }}>Redirection vers la connexion…</p>
          </div>
        ) : (
          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#111", display: "block", marginBottom: 6 }}>
                Nouveau mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                style={inp}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#111", display: "block", marginBottom: 6 }}>
                Confirmez
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                style={inp}
              />
            </div>
            {error && <p style={{ fontSize: 13, color: "#b91c1c", margin: 0 }}>{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              style={{
                background: "#111",
                color: "white",
                border: "none",
                borderRadius: 999,
                padding: "12px 22px",
                fontSize: 14,
                fontWeight: 700,
                cursor: submitting ? "wait" : "pointer",
                fontFamily: "inherit",
                marginTop: 4,
              }}
            >
              {submitting ? "Envoi…" : "Définir le mot de passe"}
            </button>
            <p style={{ fontSize: 12, color: "#8a8477", textAlign: "center", margin: "4px 0 0" }}>
              <Link href="/auth" style={{ color: "#8a8477", textDecoration: "underline" }}>
                Retour à la connexion
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  )
}
