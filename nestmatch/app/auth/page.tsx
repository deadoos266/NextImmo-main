"use client"
import { Suspense, useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import PasswordInput from "../components/PasswordInput"
import Logo from "../components/Logo"
import { BRAND } from "../../lib/brand"

type Mode = "connexion" | "inscription"
type Role = "locataire" | "proprietaire"

interface FormState {
  name: string
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
  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", color: "#6b7280" }}>
      Chargement...
    </main>
  )
}

function AuthContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialMode: Mode = searchParams?.get("mode") === "inscription" ? "inscription" : "connexion"
  const [mode, setMode] = useState<Mode>(initialMode)
  const [role, setRole] = useState<Role>("locataire")
  const [form, setForm] = useState<FormState>({ name: "", email: "", password: "" })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetEmail, setResetEmail] = useState("")
  const [resetState, setResetState] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [resetError, setResetError] = useState("")

  function handleChange(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm(prev => ({ ...prev, [field]: e.target.value }))
      setError("")
    }
  }

  function switchMode(m: Mode) {
    setMode(m)
    setError("")
    setForm({ name: "", email: "", password: "" })
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
          body: JSON.stringify({ email: form.email, password: form.password, name: form.name, role }),
        })
        const json = await res.json()
        if (!res.ok) {
          setError(json.error ?? "Erreur lors de l'inscription")
          setLoading(false)
          return
        }
      }

      const result = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      })

      if (result?.error) {
        setError(mode === "connexion" ? "Email ou mot de passe incorrect" : "Connexion automatique échouée, veuillez vous connecter manuellement")
        setLoading(false)
        return
      }

      // Les nouveaux locataires passent par l'onboarding pour remplir critères essentiels.
      // Les proprios vont direct au dashboard.
      if (role === "proprietaire") {
        router.push("/proprietaire")
      } else {
        router.push(mode === "inscription" ? "/onboarding" : "/annonces")
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
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: "Demande réinitialisation",
          email,
          sujet: "reset_password",
          message: `Demande de réinitialisation de mot de passe pour ${email}. Merci de recontacter l'utilisateur sous 24 h pour lui communiquer un nouveau mot de passe temporaire.`,
        }),
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
    <main style={{ minHeight: "100vh", background: "#F7F4EF", display: "flex", flexDirection: "column", fontFamily: "'DM Sans', sans-serif" }}>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 16px" }}>
        <div style={{ background: "white", borderRadius: 24, padding: "32px 24px", width: "100%", maxWidth: 460, boxShadow: "0 4px 32px rgba(0,0,0,0.08)" }}>

          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <Logo variant="auth" />
          </div>

          {/* Toggle connexion / inscription */}
          <div style={{ display: "flex", background: "#f3f4f6", borderRadius: 14, padding: 4, marginBottom: 32 }}>
            {(["connexion", "inscription"] as Mode[]).map(m => (
              <button key={m} onClick={() => switchMode(m)}
                style={{ flex: 1, padding: "10px 0", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "inherit", background: mode === m ? "white" : "transparent", color: mode === m ? "#111" : "#6b7280", boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.1)" : "none", transition: "all 0.2s" }}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>

          <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8, letterSpacing: "-0.5px" }}>
            {mode === "connexion" ? "Bon retour" : "Créer un compte"}
          </h1>
          <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 28 }}>
            {mode === "connexion" ? "Connecte-toi pour accéder à ton espace." : `Rejoins ${BRAND.name} gratuitement.`}
          </p>

          {/* Choix du rôle — seulement à l'inscription */}
          {mode === "inscription" && (
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#6b7280", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>Je suis</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { val: "locataire" as Role, label: "Locataire", desc: "Je cherche un logement" },
                  { val: "proprietaire" as Role, label: "Propriétaire", desc: "Je mets en location" },
                ].map(r => (
                  <div key={r.val} onClick={() => setRole(r.val)}
                    style={{ padding: "14px 16px", border: `2px solid ${role === r.val ? "#111" : "#e5e7eb"}`, borderRadius: 14, cursor: "pointer", background: role === r.val ? "#111" : "white", transition: "all 0.2s" }}>
                    <p style={{ fontWeight: 700, fontSize: 14, color: role === r.val ? "white" : "#111" }}>{r.label}</p>
                    <p style={{ fontSize: 12, color: role === r.val ? "#9ca3af" : "#6b7280", marginTop: 2 }}>{r.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Google */}
          <button
            onClick={() => signIn("google", { callbackUrl: role === "proprietaire" ? "/proprietaire" : "/profil" })}
            disabled={loading}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "13px 0", border: "1.5px solid #e5e7eb", borderRadius: 999, background: "white", cursor: "pointer", fontWeight: 700, fontSize: 15, fontFamily: "inherit", marginBottom: 20, opacity: loading ? 0.6 : 1 }}>
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continuer avec Google
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
            <span style={{ color: "#9ca3af", fontSize: 13 }}>ou</span>
            <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {mode === "inscription" && (
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, display: "block", color: "#6b7280" }}>Prénom et nom</label>
                <input
                  type="text"
                  placeholder="Jean Dupont"
                  value={form.name}
                  onChange={handleChange("name")}
                  required
                  style={{ width: "100%", padding: "12px 16px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
                />
              </div>
            )}
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, display: "block", color: "#6b7280" }}>Email</label>
              <input
                type="email"
                placeholder="jean@exemple.fr"
                value={form.email}
                onChange={handleChange("email")}
                required
                style={{ width: "100%", padding: "12px 16px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
              />
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: "#6b7280" }}>Mot de passe</label>
                {mode === "connexion" && (
                  <button
                    type="button"
                    onClick={() => { setResetOpen(v => !v); setResetEmail(form.email); setResetState("idle"); setResetError("") }}
                    style={{ fontSize: 12, color: "#1d4ed8", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", fontWeight: 600 }}>
                    Mot de passe oublié ?
                  </button>
                )}
              </div>
              <PasswordInput
                value={form.password}
                onChange={v => setForm(prev => ({ ...prev, password: v }))}
                placeholder="********"
                required
                minLength={8}
                autoComplete={mode === "inscription" ? "new-password" : "current-password"}
              />
            </div>

            {resetOpen && mode === "connexion" && (
              <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 }}>
                {resetState === "sent" ? (
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "#15803d", margin: "0 0 6px" }}>Demande envoyée</p>
                    <p style={{ fontSize: 12, color: "#4b5563", margin: 0, lineHeight: 1.5 }}>
                      Notre équipe vous recontactera à <strong>{resetEmail}</strong> sous 24 h pour vous transmettre un nouveau mot de passe temporaire.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={envoyerResetPassword} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <p style={{ fontSize: 12, color: "#4b5563", margin: 0, lineHeight: 1.5 }}>
                      Indiquez votre adresse e-mail, nous vous recontacterons pour réinitialiser votre mot de passe.
                    </p>
                    <input
                      type="email"
                      placeholder="votre@email.fr"
                      value={resetEmail}
                      onChange={e => setResetEmail(e.target.value)}
                      required
                      style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
                    />
                    {resetError && <p style={{ fontSize: 12, color: "#dc2626", margin: 0 }}>{resetError}</p>}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="submit"
                        disabled={resetState === "sending"}
                        style={{ background: "#111", color: "white", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: resetState === "sending" ? "wait" : "pointer", fontFamily: "inherit", opacity: resetState === "sending" ? 0.7 : 1 }}>
                        {resetState === "sending" ? "Envoi…" : "Envoyer la demande"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setResetOpen(false)}
                        style={{ background: "white", color: "#111", border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        Annuler
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {error && (
              <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{ width: "100%", background: loading ? "#6b7280" : "#111", color: "white", border: "none", borderRadius: 999, padding: "14px 0", fontWeight: 800, fontSize: 15, cursor: loading ? "not-allowed" : "pointer", marginTop: 4, fontFamily: "inherit", transition: "background 0.2s" }}>
              {loading ? "Chargement..." : mode === "connexion" ? "Se connecter" : "Créer mon compte"}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
