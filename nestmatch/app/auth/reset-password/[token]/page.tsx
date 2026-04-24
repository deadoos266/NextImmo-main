"use client"
import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { km, KMButton, KMCard, KMEyebrow, KMHeading } from "../../../components/ui/km"

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
    border: `1px solid ${km.line}`,
    borderRadius: 10,
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
    background: km.white,
    color: km.ink,
  }

  const lbl: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: km.muted,
    textTransform: "uppercase", letterSpacing: "1.4px",
    display: "block", marginBottom: 8,
  }

  return (
    <main style={{
      minHeight: "100vh",
      background: km.beige,
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      padding: "40px 16px",
    }}>
      <div style={{ maxWidth: 440, margin: "0 auto" }}>
        <KMCard padding={32} style={{ borderRadius: 20 }}>
          <KMEyebrow style={{ marginBottom: 10 }}>Réinitialisation</KMEyebrow>
          <KMHeading as="h1" size={28} style={{ marginBottom: 10 }}>
            Nouveau mot de passe
          </KMHeading>
          <p style={{ fontSize: 13, color: km.muted, margin: "0 0 24px", lineHeight: 1.55 }}>
            Choisissez un mot de passe d&apos;au moins 8 caractères.
          </p>

          {done ? (
            <div style={{
              background: km.successBg,
              border: `1px solid ${km.successLine}`,
              borderRadius: 12, padding: 16,
              color: km.successText,
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, margin: 0, textTransform: "uppercase", letterSpacing: "1.2px" }}>Mot de passe modifié</p>
              <p style={{ fontSize: 13, margin: "6px 0 0" }}>Redirection vers la connexion…</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={lbl}>Nouveau mot de passe</label>
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
                <label style={lbl}>Confirmez</label>
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
              {error && (
                <p style={{
                  fontSize: 13, color: km.errText,
                  background: km.errBg, border: `1px solid ${km.errLine}`,
                  padding: "10px 14px", borderRadius: 10, margin: 0,
                }}>{error}</p>
              )}
              <KMButton type="submit" disabled={submitting} size="lg" style={{ width: "100%", marginTop: 4 }}>
                {submitting ? "Envoi…" : "Définir le mot de passe"}
              </KMButton>
              <p style={{
                fontSize: 10, color: km.muted,
                textAlign: "center", margin: "4px 0 0",
                textTransform: "uppercase", letterSpacing: "1.2px", fontWeight: 700,
              }}>
                <Link href="/auth" style={{ color: km.muted, textDecoration: "underline", textUnderlineOffset: 3 }}>
                  Retour à la connexion
                </Link>
              </p>
            </form>
          )}
        </KMCard>
      </div>
    </main>
  )
}
