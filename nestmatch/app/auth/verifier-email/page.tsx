"use client"
import { Suspense, useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { km, KMButton, KMCard, KMEyebrow, KMHeading } from "../../components/ui/km"

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

  const LABEL: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: km.muted,
    textTransform: "uppercase", letterSpacing: "1.4px",
    display: "block", marginBottom: 8,
  }

  return (
    <main style={{
      minHeight: "calc(100vh - 72px)",
      background: km.beige,
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "40px 20px",
    }}>
      <KMCard padding="36px 32px" style={{ maxWidth: 440, width: "100%", borderRadius: 24 }}>
        {success ? (
          <div style={{ textAlign: "center" }}>
            <div style={{
              width: 56, height: 56, margin: "0 auto 18px",
              background: km.successBg, color: km.successText,
              border: `1px solid ${km.successLine}`,
              borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <KMHeading as="h1" size={24} style={{ marginBottom: 8 }}>Email confirmé</KMHeading>
            <p style={{ fontSize: 13, color: km.muted, margin: 0, textTransform: "uppercase", letterSpacing: "1.2px", fontWeight: 600 }}>Redirection vers la connexion…</p>
          </div>
        ) : (
          <>
            <KMEyebrow style={{ marginBottom: 12 }}>Étape · Confirmation email</KMEyebrow>
            <KMHeading as="h1" size={28} style={{ marginBottom: 10 }}>Confirmez votre email</KMHeading>
            <p style={{ fontSize: 14, color: km.muted, marginBottom: 24, lineHeight: 1.55 }}>
              Entrez le code à 6 chiffres reçu dans votre boîte mail. Il est valide 15 minutes.
            </p>

            <form onSubmit={submit}>
              <label style={LABEL}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="votre@email.com"
                autoComplete="email"
                style={{
                  width: "100%", padding: "11px 14px",
                  border: `1px solid ${km.line}`,
                  borderRadius: 10, fontSize: 14,
                  outline: "none", boxSizing: "border-box",
                  fontFamily: "inherit", marginBottom: 20,
                  background: km.white, color: km.ink,
                }}
              />

              <label style={LABEL}>Code de vérification</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 20, justifyContent: "space-between" }}>
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
                      border: `1px solid ${d ? km.ink : km.line}`,
                      borderRadius: 10,
                      fontSize: 24, fontWeight: 700, textAlign: "center",
                      outline: "none",
                      fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif",
                      fontStyle: "italic",
                      color: km.ink, background: km.white, boxSizing: "border-box",
                    }}
                  />
                ))}
              </div>

              {error && (
                <p style={{
                  background: km.errBg, color: km.errText,
                  border: `1px solid ${km.errLine}`,
                  padding: "10px 14px", borderRadius: 10,
                  fontSize: 13, marginBottom: 16, lineHeight: 1.4,
                }}>
                  {error}
                </p>
              )}

              <KMButton type="submit" disabled={submitting} size="lg" style={{ width: "100%" }}>
                {submitting ? "Vérification…" : "Vérifier mon email"}
              </KMButton>
            </form>

            <div style={{ marginTop: 24, paddingTop: 18, borderTop: `1px solid ${km.line}`, textAlign: "center" }}>
              <p style={{ fontSize: 12, color: km.muted, margin: 0, marginBottom: 10, lineHeight: 1.5 }}>
                Pas de code reçu ? Vérifiez vos spams ou demandez un nouvel envoi.
              </p>
              <button
                type="button"
                onClick={async () => {
                  if (!email.trim()) {
                    setResendMsg("Entrez d'abord votre email.")
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
                      setResendMsg("Un nouveau code a été envoyé. Vérifiez votre boîte mail.")
                    } else {
                      const j = await res.json().catch(() => ({}))
                      setResendMsg(j.error || "Erreur, réessayez plus tard.")
                    }
                  } catch {
                    setResendMsg("Erreur réseau.")
                  }
                  setResending(false)
                }}
                disabled={resending}
                style={{
                  background: "none", border: "none",
                  color: km.ink,
                  fontSize: 10, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "1.2px",
                  textDecoration: "underline", textUnderlineOffset: 4,
                  cursor: resending ? "not-allowed" : "pointer",
                  fontFamily: "inherit", padding: 0,
                }}>
                {resending ? "Envoi…" : "Renvoyer un code"}
              </button>
              {resendMsg && (
                <p style={{
                  fontSize: 12,
                  color: resendMsg.startsWith("Un nouveau") ? km.successText : km.errText,
                  marginTop: 10, marginBottom: 0,
                }}>
                  {resendMsg}
                </p>
              )}
              {/* Échappatoire UX : si le user ne reçoit pas l'email
                  (provider lent, spam, typo) il peut continuer en mode
                  consultation seule. Les actions sensibles (publier,
                  candidater, dossier) re-prompteront la vérification —
                  le user n'est jamais bloqué hors du site (audit 2026-04-26).
                  Lien discret pour ne pas inciter à skip systématiquement. */}
              <p style={{ fontSize: 12, color: km.muted, margin: "20px 0 0", lineHeight: 1.55, textAlign: "center" }}>
                Pas de code après 5 min ?
                {" "}
                <a href="/annonces" style={{ color: km.ink, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}>
                  Vérifier plus tard
                </a>
                {" "}— vous pouvez consulter les annonces, la vérification sera demandée au moment de candidater.
              </p>
              <p style={{ fontSize: 11, color: km.muted, margin: "12px 0 0", textTransform: "uppercase", letterSpacing: "1.2px", fontWeight: 600, textAlign: "center" }}>
                <a href="/auth" style={{ color: km.muted, textDecoration: "underline", textUnderlineOffset: 3 }}>Retour à la connexion</a>
              </p>
            </div>
          </>
        )}
      </KMCard>
    </main>
  )
}
