"use client"
import { Suspense, useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"

/**
 * Page de confirmation d'email avec code OTP 6 chiffres.
 * Paul : "Page de confirmation d'email manquante : envoi d'un vrai code
 * a saisir par l'utilisateur pour acceder au site."
 *
 * Flow :
 * - User s'inscrit -> reçoit un email avec code 6 chiffres (valide 15 min)
 * - Arrive ici -> entre son email + code -> POST /api/auth/verify-code
 * - Si OK -> redirect /auth?verified=1
 * - Si KO -> message d'erreur + possibilité de redemander un code
 */
export default function VerifierEmail() {
  return (
    <Suspense fallback={null}>
      <VerifierEmailForm />
    </Suspense>
  )
}

function VerifierEmailForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const prefillEmail = searchParams?.get("email") || ""

  const [email, setEmail] = useState(prefillEmail)
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""])
  const inputs = useRef<Array<HTMLInputElement | null>>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendMsg, setResendMsg] = useState<string | null>(null)

  useEffect(() => {
    // Focus 1er input digit au mount si email pré-rempli via querystring
    if (prefillEmail && inputs.current[0]) {
      inputs.current[0].focus()
    }
  }, [prefillEmail])

  function handleDigit(i: number, v: string) {
    // Accepter uniquement chiffres, 1 par case
    const clean = v.replace(/\D/g, "").slice(0, 1)
    const next = [...digits]
    next[i] = clean
    setDigits(next)
    if (clean && i < 5) inputs.current[i + 1]?.focus()
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const txt = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
    if (txt.length === 0) return
    e.preventDefault()
    const next = ["", "", "", "", "", ""]
    for (let i = 0; i < txt.length; i++) next[i] = txt[i]
    setDigits(next)
    inputs.current[Math.min(txt.length, 5)]?.focus()
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    const code = digits.join("")
    if (code.length !== 6) {
      setError("Le code doit contenir 6 chiffres.")
      return
    }
    if (!email.trim()) {
      setError("Entrez votre email.")
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        setError(json.error || "Code invalide")
        setSubmitting(false)
        return
      }
      setSuccess(true)
      setTimeout(() => router.push("/auth?verified=1"), 1200)
    } catch {
      setError("Erreur réseau, réessayez.")
      setSubmitting(false)
    }
  }

  return (
    <main style={{ minHeight: "calc(100vh - 72px)", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div style={{ maxWidth: 440, width: "100%", background: "white", borderRadius: 24, padding: "36px 32px", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
        {success ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 56, height: 56, margin: "0 auto 18px", background: "#F0FAEE", color: "#15803d", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.3px", margin: 0, marginBottom: 6 }}>Email confirmé</h1>
            <p style={{ fontSize: 14, color: "#8a8477", margin: 0 }}>Redirection vers la connexion…</p>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px", margin: 0, marginBottom: 6 }}>Confirme ton email</h1>
            <p style={{ fontSize: 14, color: "#8a8477", marginBottom: 22, lineHeight: 1.55 }}>
              Entre le code à 6 chiffres reçu dans ton inbox. Il est valide 15 minutes.
            </p>

            <form onSubmit={submit}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 6 }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="ton@email.com"
                autoComplete="email"
                style={{ width: "100%", padding: "11px 14px", border: "1px solid #EAE6DF", borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit", marginBottom: 18 }}
              />

              <label style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 8 }}>Code de vérification</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 18, justifyContent: "space-between" }}>
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={el => { inputs.current[i] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={e => handleDigit(i, e.target.value)}
                    onKeyDown={e => handleKeyDown(i, e)}
                    onPaste={handlePaste}
                    aria-label={`Chiffre ${i + 1}`}
                    style={{
                      width: 46, height: 56,
                      border: `1px solid ${d ? "#111" : "#EAE6DF"}`,
                      borderRadius: 10,
                      fontSize: 24, fontWeight: 800, textAlign: "center",
                      outline: "none", fontFamily: "'DM Mono', ui-monospace, monospace",
                      color: "#111", background: "white", boxSizing: "border-box",
                    }}
                  />
                ))}
              </div>

              {error && (
                <p style={{ background: "#FEECEC", color: "#b91c1c", padding: "10px 14px", borderRadius: 10, fontSize: 13, marginBottom: 16, lineHeight: 1.4 }}>
                  {error}
                </p>
              )}

              <button type="submit" disabled={submitting}
                style={{ width: "100%", padding: "13px 20px", background: submitting ? "#8a8477" : "#111", color: "white", border: "none", borderRadius: 999, fontWeight: 700, fontSize: 15, cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                {submitting ? "Vérification…" : "Vérifier mon email"}
              </button>
            </form>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #F7F4EF", textAlign: "center" }}>
              <p style={{ fontSize: 12, color: "#8a8477", margin: 0, marginBottom: 8, lineHeight: 1.5 }}>
                Pas de code reçu ? Vérifie tes spams ou demande un nouvel envoi.
              </p>
              <button
                type="button"
                onClick={async () => {
                  if (!email.trim()) {
                    setResendMsg("Entre d'abord ton email.")
                    return
                  }
                  setResending(true)
                  setResendMsg(null)
                  try {
                    const res = await fetch("/api/auth/resend-verify-code", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ email: email.trim() }),
                    })
                    if (res.ok) {
                      setResendMsg("Un nouveau code a été envoyé. Vérifie ta boîte mail.")
                    } else {
                      const j = await res.json().catch(() => ({}))
                      setResendMsg(j.error || "Erreur, réessaie plus tard.")
                    }
                  } catch {
                    setResendMsg("Erreur réseau.")
                  }
                  setResending(false)
                }}
                disabled={resending}
                style={{ background: "none", border: "none", color: "#111", fontSize: 13, fontWeight: 700, textDecoration: "underline", cursor: resending ? "not-allowed" : "pointer", fontFamily: "inherit", padding: 0 }}>
                {resending ? "Envoi…" : "Renvoyer un code"}
              </button>
              {resendMsg && (
                <p style={{ fontSize: 12, color: resendMsg.startsWith("Un nouveau") ? "#15803d" : "#b91c1c", marginTop: 8, marginBottom: 0 }}>
                  {resendMsg}
                </p>
              )}
              <p style={{ fontSize: 12, color: "#8a8477", marginTop: 14, margin: "14px 0 0" }}>
                <a href="/auth" style={{ color: "#8a8477", textDecoration: "underline" }}>Retour à la connexion</a>
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
