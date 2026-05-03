"use client"
import { Suspense, useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import PasswordInput from "../components/PasswordInput"
import Logo from "../components/Logo"
import { BRAND } from "../../lib/brand"
import { km, KMButton, KMEyebrow, KMHeading, KMCard } from "../components/ui/km"

type Mode = "connexion" | "inscription"
type Role = "locataire" | "proprietaire"

interface FormState {
  prenom: string
  nom: string
  email: string
  password: string
}

export default function Auth() {
  return (
    <Suspense fallback={<AuthFallback />}>
      <AuthContent />
    </Suspense>
  )
}

function AuthFallback() {
  // Skeleton loader (Paul 2026-04-27) : reproduit la shape de la page auth
  // (titre + 3 inputs + CTA) en blocs gris animes shimmer plutot que le
  // texte "Chargement..." brut. Reduit le perçu de latence sur les pages
  // d'auth (audit consultant : 2-3s d'ecran chargement).
  const block: React.CSSProperties = {
    background: "linear-gradient(90deg, #EAE6DF 0%, #F4F1EC 50%, #EAE6DF 100%)",
    backgroundSize: "200% 100%",
    animation: "km-skeleton 1.4s ease-in-out infinite",
    borderRadius: 10,
  }
  return (
    <main style={{
      minHeight: "100vh",
      background: km.beige,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      padding: 20,
    }}>
      <style>{`@keyframes km-skeleton { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
      <div aria-busy="true" aria-label="Chargement de la page d'authentification" style={{
        background: km.white,
        border: `1px solid ${km.line}`,
        borderRadius: 20,
        padding: "40px 32px",
        width: "100%",
        maxWidth: 440,
        boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}>
        {/* Logo placeholder */}
        <div style={{ ...block, width: 56, height: 56, borderRadius: "50%", margin: "0 auto 6px" }} />
        {/* Titre */}
        <div style={{ ...block, height: 28, width: "70%", margin: "0 auto" }} />
        {/* Sous-titre */}
        <div style={{ ...block, height: 14, width: "85%", margin: "0 auto 12px" }} />
        {/* 3 inputs */}
        <div style={{ ...block, height: 46 }} />
        <div style={{ ...block, height: 46 }} />
        <div style={{ ...block, height: 46 }} />
        {/* CTA */}
        <div style={{ ...block, height: 48, marginTop: 6, borderRadius: 999 }} />
        {/* Lien secondaire */}
        <div style={{ ...block, height: 12, width: "60%", margin: "8px auto 0" }} />
      </div>
    </main>
  )
}

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  border: `1px solid ${km.line}`,
  borderRadius: 10,
  fontSize: 15,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
  background: km.white,
  color: km.ink,
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  marginBottom: 8,
  display: "block",
  color: km.muted,
  textTransform: "uppercase",
  letterSpacing: "1.4px",
}

function AuthContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialMode: Mode = searchParams?.get("mode") === "inscription" ? "inscription" : "connexion"
  const [mode, setMode] = useState<Mode>(initialMode)
  const [role, setRole] = useState<Role>("locataire")
  const [form, setForm] = useState<FormState>({ prenom: "", nom: "", email: "", password: "" })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetEmail, setResetEmail] = useState("")
  const [resetState, setResetState] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [resetError, setResetError] = useState("")
  // V42 — flag spécifique 409 (email existant) pour CTA "Se connecter" inline.
  const [emailExisteDeja, setEmailExisteDeja] = useState(false)

  function handleChange(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm(prev => ({ ...prev, [field]: e.target.value }))
      setError("")
      setEmailExisteDeja(false)
    }
  }

  function switchMode(m: Mode) {
    setMode(m)
    setError("")
    setEmailExisteDeja(false)
    setForm({ prenom: "", nom: "", email: "", password: "" })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      if (mode === "inscription") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: form.email, password: form.password, prenom: form.prenom, nom: form.nom, role }),
        })
        const json = await res.json()
        if (!res.ok) {
          // V42 — détecte 409 email existant pour afficher CTA "Se connecter".
          if (res.status === 409) {
            setEmailExisteDeja(true)
          }
          setError(json.error ?? "Erreur lors de l'inscription")
          setLoading(false)
          return
        }
        // Au lieu de connecter automatiquement l'user, on le redirige vers
        // la page de vérif email (code OTP 6 chiffres). Une fois le code
        // validé, il revient sur /auth?verified=1 et se connecte normalement.
        // Cela GATE le site : impossible d'accéder à /annonces / /onboarding
        // / /proprietaire avant d'avoir validé le code.
        // V36.7 — Toast contextuel pour rassurer (audit V35 R35.13).
        // Avant : redirection silencieuse, l'user pensait être inscrit puis
        // se demandait pourquoi il voyait un formulaire OTP.
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("km:toast", {
            detail: {
              type: "success",
              title: "Inscription créée ✓",
              body: "Vérifiez vos emails pour activer votre compte (code à 6 chiffres).",
            },
          }))
        }
        router.push(`/auth/verifier-email?email=${encodeURIComponent(form.email)}`)
        return
      }

      // Mode connexion : signIn direct
      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      })

      if (result?.error) {
        // Le provider credentials renvoie "EMAIL_NOT_VERIFIED" si l'user n'a
        // pas encore validé son code. On lui repropose la page de vérif.
        if (result.error === "EMAIL_NOT_VERIFIED") {
          router.push(`/auth/verifier-email?email=${encodeURIComponent(form.email)}`)
          return
        }
        setError("Email ou mot de passe incorrect")
        setLoading(false)
        return
      }

      // Connexion OK : direction dashboard selon rôle
      if (role === "proprietaire") {
        router.push("/proprietaire")
      } else {
        router.push("/annonces")
      }
    } catch {
      setError("Une erreur est survenue. Veuillez réessayer.")
      setLoading(false)
    }
  }

  async function envoyerResetPassword(e: React.FormEvent) {
    e.preventDefault()
    setResetError("")
    const email = resetEmail.trim().toLowerCase()
    if (!email || !email.includes("@")) {
      setResetError("Veuillez saisir une adresse e-mail valide.")
      return
    }
    setResetState("sending")
    try {
      // Nouveau flow automatisé via Resend : si l'email existe, un lien de
      // reset expirant 1h est envoyé. Anti-enumeration : réponse toujours
      // 200 même si l'email est inconnu.
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        setResetState("error")
        setResetError(json.error || "Envoi impossible. Réessayez plus tard.")
        return
      }
      setResetState("sent")
    } catch {
      setResetState("error")
      setResetError("Erreur réseau. Réessayez plus tard.")
    }
  }

  return (
    <main style={{
      minHeight: "100vh",
      background: km.beige,
      display: "flex", flexDirection: "column",
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
    }}>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 16px" }}>
        <KMCard padding="36px 28px" style={{ width: "100%", maxWidth: 460, borderRadius: 24 }}>

          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <Logo variant="auth" />
          </div>

          {/* Toggle connexion / inscription — carré hairline, pas de gros pastille grise */}
          <div style={{
            display: "flex",
            borderTop: `1px solid ${km.line}`,
            borderBottom: `1px solid ${km.line}`,
            marginBottom: 28,
          }}>
            {(["connexion", "inscription"] as Mode[]).map(m => (
              <button key={m} onClick={() => switchMode(m)}
                style={{
                  flex: 1,
                  padding: "14px 0",
                  border: "none",
                  borderBottom: mode === m ? `2px solid ${km.ink}` : "2px solid transparent",
                  marginBottom: -1,
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 10,
                  fontFamily: "inherit",
                  background: "transparent",
                  color: mode === m ? km.ink : km.muted,
                  textTransform: "uppercase",
                  letterSpacing: "1.5px",
                  transition: "color 0.2s, border-color 0.2s",
                }}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>

          <KMEyebrow style={{ marginBottom: 10 }}>
            {mode === "connexion" ? "Retour sur votre espace" : `Rejoindre ${BRAND.name}`}
          </KMEyebrow>
          <KMHeading as="h1" size={30} style={{ marginBottom: 10 }}>
            {mode === "connexion" ? "Bon retour" : "Créer un compte"}
          </KMHeading>
          <p style={{ color: km.muted, fontSize: 14, marginBottom: 28, lineHeight: 1.5 }}>
            {mode === "connexion" ? "Connectez-vous pour accéder à votre espace." : `Rejoignez ${BRAND.name} gratuitement, en moins d'une minute.`}
          </p>

          {/* Choix du rôle — seulement à l'inscription */}
          {mode === "inscription" && (
            <div style={{ marginBottom: 24 }}>
              <p style={LABEL_STYLE}>Je suis</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { val: "locataire" as Role, label: "Locataire", desc: "Je cherche un logement" },
                  { val: "proprietaire" as Role, label: "Propriétaire", desc: "Je mets en location" },
                ].map(r => (
                  <button key={r.val} type="button" onClick={() => setRole(r.val)}
                    style={{
                      padding: "14px 16px",
                      border: `1px solid ${role === r.val ? km.ink : km.line}`,
                      borderRadius: 14,
                      cursor: "pointer",
                      background: role === r.val ? km.ink : km.white,
                      color: role === r.val ? km.white : km.ink,
                      transition: "all 0.2s",
                      textAlign: "left",
                      fontFamily: "inherit",
                    }}>
                    <p style={{ fontWeight: 700, fontSize: 13, margin: 0, textTransform: "uppercase", letterSpacing: "1px" }}>{r.label}</p>
                    <p style={{ fontSize: 12, color: role === r.val ? "rgba(255,255,255,0.72)" : km.muted, marginTop: 4 }}>{r.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Google */}
          <button
            onClick={() => signIn("google", { callbackUrl: role === "proprietaire" ? "/proprietaire" : "/profil" })}
            disabled={loading}
            style={{
              width: "100%",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
              padding: "13px 0",
              border: `1px solid ${km.line}`,
              borderRadius: 999,
              background: km.white,
              cursor: "pointer",
              fontWeight: 700, fontSize: 13,
              fontFamily: "inherit",
              marginBottom: 20,
              opacity: loading ? 0.6 : 1,
              color: km.ink,
              textTransform: "uppercase",
              letterSpacing: "0.8px",
            }}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continuer avec Google
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: km.line }} />
            <span style={{ color: km.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>ou</span>
            <div style={{ flex: 1, height: 1, background: km.line }} />
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {mode === "inscription" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label htmlFor="signup-prenom" style={LABEL_STYLE}>Prénom</label>
                    <input
                      id="signup-prenom"
                      type="text"
                      autoComplete="given-name"
                      placeholder="Jean"
                      value={form.prenom}
                      onChange={handleChange("prenom")}
                      maxLength={80}
                      required
                      style={INPUT_STYLE}
                    />
                  </div>
                  <div>
                    <label htmlFor="signup-nom" style={LABEL_STYLE}>Nom de famille</label>
                    <input
                      id="signup-nom"
                      type="text"
                      autoComplete="family-name"
                      placeholder="Dupont"
                      value={form.nom}
                      onChange={handleChange("nom")}
                      maxLength={80}
                      required
                      style={INPUT_STYLE}
                    />
                  </div>
                </div>
                {/* V36.7 — Hint adouci (audit V35 R35.12).
                    Avant : "ne pourront plus être modifiés ensuite" sonnait
                    comme une menace. Ton plus doux + détail en (?) tooltip. */}
                <p style={{ fontSize: 12, color: "#666", margin: "-4px 0 0", lineHeight: 1.5 }}>
                  Saisissez-les comme sur votre carte d&apos;identité — ils apparaîtront sur votre dossier et le bail.
                  <span title="Une modification après validation nécessite une demande au support. C'est rare et fait pour protéger votre identité contre les changements non sollicités." style={{ marginLeft: 6, color: "#a16207", cursor: "help", fontWeight: 600 }}>(?)</span>
                </p>
              </>
            )}
            <div>
              <label htmlFor="auth-email" style={LABEL_STYLE}>Email</label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                placeholder="jean@exemple.fr"
                value={form.email}
                onChange={handleChange("email")}
                required
                style={INPUT_STYLE}
              />
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <label htmlFor="auth-password" style={{ ...LABEL_STYLE, marginBottom: 0 }}>Mot de passe</label>
                {mode === "connexion" && (
                  <button
                    type="button"
                    onClick={() => { setResetOpen(v => !v); setResetEmail(form.email); setResetState("idle"); setResetError("") }}
                    style={{
                      fontSize: 10, color: km.ink,
                      background: "none", border: "none",
                      cursor: "pointer", padding: 0,
                      fontFamily: "inherit", fontWeight: 700,
                      textTransform: "uppercase", letterSpacing: "1.2px",
                      textDecoration: "underline", textUnderlineOffset: 3,
                    }}>
                    Oublié ?
                  </button>
                )}
              </div>
              <PasswordInput
                id="auth-password"
                value={form.password}
                onChange={v => setForm(prev => ({ ...prev, password: v }))}
                placeholder="********"
                required
                minLength={8}
                autoComplete={mode === "inscription" ? "new-password" : "current-password"}
              />
            </div>

            {resetOpen && mode === "connexion" && (
              <div style={{ background: km.beige, border: `1px solid ${km.line}`, borderRadius: 12, padding: 14 }}>
                {resetState === "sent" ? (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 700, color: km.successText, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "1.4px" }}>Email envoyé</p>
                    <p style={{ fontSize: 12, color: "#4b5563", margin: 0, lineHeight: 1.5 }}>
                      Si un compte existe pour <strong>{resetEmail}</strong>, vous allez recevoir un lien de réinitialisation. Le lien est valide 1 heure.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={envoyerResetPassword} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <label htmlFor="reset-email" style={{ fontSize: 12, color: "#4b5563", margin: 0, lineHeight: 1.5 }}>
                      Indiquez votre adresse e-mail, nous vous enverrons un lien pour réinitialiser votre mot de passe.
                    </label>
                    <input
                      id="reset-email"
                      type="email"
                      autoComplete="email"
                      placeholder="votre@email.fr"
                      value={resetEmail}
                      onChange={e => setResetEmail(e.target.value)}
                      required
                      style={{ ...INPUT_STYLE, padding: "10px 14px", fontSize: 14 }}
                    />
                    {resetError && <p style={{ fontSize: 12, color: km.errText, margin: 0 }}>{resetError}</p>}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="submit"
                        disabled={resetState === "sending"}
                        style={{
                          background: km.ink, color: km.white,
                          border: "none", borderRadius: 999,
                          padding: "8px 20px", fontSize: 10, fontWeight: 700,
                          cursor: resetState === "sending" ? "wait" : "pointer",
                          fontFamily: "inherit",
                          opacity: resetState === "sending" ? 0.7 : 1,
                          textTransform: "uppercase", letterSpacing: "0.8px",
                        }}>
                        {resetState === "sending" ? "Envoi…" : "Envoyer la demande"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setResetOpen(false)}
                        style={{
                          background: km.white, color: km.ink,
                          border: `1px solid ${km.line}`, borderRadius: 999,
                          padding: "8px 20px", fontSize: 10, fontWeight: 600,
                          cursor: "pointer", fontFamily: "inherit",
                          textTransform: "uppercase", letterSpacing: "0.8px",
                        }}>
                        Annuler
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {error && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 14px", background: km.errBg, border: `1px solid ${km.errLine}`, borderRadius: 10 }}>
                <p style={{ color: km.errText, fontSize: 13, margin: 0, lineHeight: 1.45 }}>{error}</p>
                {/* V42 — CTA inline pour basculer vers connexion si l'user a tenté
                    une inscription avec un email existant. Pré-remplit l'email
                    pour éviter la re-saisie. */}
                {emailExisteDeja && (
                  <button
                    type="button"
                    onClick={() => {
                      switchMode("connexion")
                      setForm(prev => ({ ...prev, email: form.email, password: "" }))
                    }}
                    style={{
                      alignSelf: "flex-start",
                      background: km.ink, color: km.white,
                      border: "none", borderRadius: 999,
                      padding: "7px 16px", fontSize: 12, fontWeight: 700,
                      cursor: "pointer", fontFamily: "inherit",
                      letterSpacing: "0.3px",
                    }}
                  >
                    Se connecter avec cet email →
                  </button>
                )}
              </div>
            )}

            <KMButton type="submit" disabled={loading} size="lg" style={{ width: "100%", marginTop: 4 }}>
              {loading ? "Chargement…" : mode === "connexion" ? "Se connecter" : "Créer mon compte"}
            </KMButton>
          </form>
        </KMCard>
      </div>
    </main>
  )
}
