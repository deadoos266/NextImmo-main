"use client"
import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { IDENTITE_PATTERN } from "../../../lib/profilHelpers"

/**
 * Page de gate identité. Présentée à tout user authentifié dont
 * `profils.identite_verrouillee` est false. Les champs sont pré-remplis
 * si l'utilisateur vient de Google (given_name/family_name) ou d'un
 * signup email récent. Après confirmation, l'identité est figée via
 * trigger Postgres — cf. migration 020.
 */

export default function OnboardingIdentite() {
  return (
    <Suspense fallback={null}>
      <IdentiteForm />
    </Suspense>
  )
}

const T = {
  bg: "#F7F4EF",
  white: "#fff",
  ink: "#111",
  line: "#EAE6DF",
  hairline: "#F0EAE0",
  meta: "#666",
  soft: "#8a8477",
  mutedBg: "#FAF8F3",
  danger: "#b91c1c",
}

function IdentiteForm() {
  const { status, update } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams?.get("callbackUrl") || "/profil"

  const [prenom, setPrenom] = useState("")
  const [nom, setNom] = useState("")
  const [certifie, setCertifie] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/auth")
      return
    }
    if (status !== "authenticated") return
    fetch("/api/profil/identite", { cache: "no-store" })
      .then(r => r.ok ? r.json() : { prenom: "", nom: "", verrouillee: false })
      .then(json => {
        if (json.verrouillee) {
          // Déjà verrouillée : rien à faire ici, on redirige.
          router.replace(callbackUrl)
          return
        }
        setPrenom(json.prenom || "")
        setNom(json.nom || "")
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [status, router, callbackUrl])

  const prenomTrim = prenom.trim()
  const nomTrim = nom.trim()
  const prenomValid = prenomTrim.length > 0 && prenomTrim.length <= 80 && IDENTITE_PATTERN.test(prenomTrim)
  const nomValid = nomTrim.length > 0 && nomTrim.length <= 80 && IDENTITE_PATTERN.test(nomTrim)
  const canSubmit = prenomValid && nomValid && certifie && !submitting

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/profil/identite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prenom: prenomTrim, nom: nomTrim }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 409) {
          // Déjà verrouillée entre-temps — redirect silencieux.
          await update()
          router.replace(callbackUrl)
          return
        }
        setError(json.error || "Erreur lors de l'enregistrement")
        setSubmitting(false)
        return
      }
      // Force NextAuth à rafraîchir le JWT (identiteVerrouillee=true)
      // avant de partir — sinon le middleware renverrait ici en boucle.
      await update()
      router.replace(callbackUrl)
    } catch {
      setError("Erreur réseau. Réessayez.")
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    border: `1px solid ${T.line}`,
    borderRadius: 10,
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
    background: T.white,
    color: T.ink,
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "1.8px",
    textTransform: "uppercase",
    color: T.soft,
    display: "block",
    marginBottom: 8,
  }

  return (
    <main style={{ minHeight: "100vh", background: T.bg, fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div style={{ maxWidth: 560, width: "100%" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.8px", textTransform: "uppercase", color: T.soft }}>
            Vérification identité
          </span>
          <div style={{ flex: 1, height: 1, background: T.hairline }} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.5px", color: T.soft }}>01</span>
        </div>

        <h1 style={{ fontSize: 44, fontWeight: 500, fontStyle: "italic", letterSpacing: "-0.8px", margin: 0, color: T.ink, lineHeight: 1.05 }}>
          Confirmez votre identité
        </h1>
        <p style={{ fontSize: 13, color: T.meta, margin: "14px 0 28px", lineHeight: 1.6 }}>
          Cette information apparaîtra sur tous vos documents officiels (dossier, bail, état des lieux). Elle ne pourra plus être modifiée ensuite.
        </p>

        {loading ? (
          <p style={{ fontSize: 13, color: T.soft, fontStyle: "italic" }}>Chargement…</p>
        ) : (
          <form onSubmit={submit} style={{ background: T.white, border: `1px solid ${T.line}`, borderRadius: 20, padding: 28 }}>
            <div style={{ marginBottom: 18 }}>
              <label htmlFor="id-prenom" style={labelStyle}>Prénom</label>
              <input
                id="id-prenom"
                type="text"
                autoComplete="given-name"
                placeholder="Jean"
                value={prenom}
                onChange={e => setPrenom(e.target.value)}
                maxLength={80}
                required
                style={{ ...inputStyle, borderColor: prenom && !prenomValid ? T.danger : T.line }}
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label htmlFor="id-nom" style={labelStyle}>Nom de famille</label>
              <input
                id="id-nom"
                type="text"
                autoComplete="family-name"
                placeholder="Dupont"
                value={nom}
                onChange={e => setNom(e.target.value)}
                maxLength={80}
                required
                style={{ ...inputStyle, borderColor: nom && !nomValid ? T.danger : T.line }}
              />
            </div>

            <div style={{ background: T.mutedBg, border: `1px solid ${T.line}`, borderLeft: `3px solid ${T.ink}`, borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
              <p style={{ fontSize: 12, color: "#333", lineHeight: 1.55, margin: 0, fontStyle: "italic" }}>
                Ces informations doivent correspondre exactement à votre pièce d&apos;identité. Toute modification ultérieure (mariage, faute de frappe, transition) passe par <a href="mailto:contact@keymatch-immo.fr" style={{ color: T.ink, fontWeight: 600 }}>contact@keymatch-immo.fr</a> avec un justificatif officiel.
              </p>
            </div>

            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 20, cursor: "pointer", fontSize: 13, color: T.ink, lineHeight: 1.5 }}>
              <input
                type="checkbox"
                checked={certifie}
                onChange={e => setCertifie(e.target.checked)}
                style={{ marginTop: 3, width: 16, height: 16, accentColor: T.ink, cursor: "pointer", flexShrink: 0 }}
              />
              <span>Je certifie sur l&apos;honneur que ces informations correspondent à ma pièce d&apos;identité officielle.</span>
            </label>

            {error && (
              <p style={{ background: "#FEECEC", color: T.danger, padding: "10px 14px", borderRadius: 10, fontSize: 13, margin: "0 0 14px", lineHeight: 1.5 }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                width: "100%",
                padding: "14px 20px",
                background: canSubmit ? T.ink : "#d5d1ca",
                color: T.white,
                border: "none",
                borderRadius: 999,
                fontWeight: 600,
                fontSize: 15,
                cursor: canSubmit ? "pointer" : "not-allowed",
                fontFamily: "inherit",
                letterSpacing: "0.3px",
                transition: "background 0.2s",
              }}
            >
              {submitting ? "Verrouillage…" : "Confirmer définitivement"}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
