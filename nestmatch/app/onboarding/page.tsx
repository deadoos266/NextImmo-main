"use client"
import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import CityAutocomplete from "../components/CityAutocomplete"
import { useResponsive } from "../hooks/useResponsive"
import { km, KMButton, KMButtonOutline, KMCard, KMChip, KMEyebrow, KMHeading } from "../components/ui/km"

/**
 * Onboarding 3 étapes pour les nouveaux locataires.
 * Arrivée attendue juste après l'inscription.
 * Collecte les critères essentiels et redirige vers /annonces avec filtres.
 *
 * Design handoff KeyMatch : titres éditoriaux Fraunces italic via KMHeading,
 * CTAs pilule noire via KMButton, chips de sélection via KMChip ink/neutral.
 * Logique métier (finaliser/upsert profils/redirection filtres) INCHANGÉE.
 */

const STEPS = 3

export default function Onboarding() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { isMobile } = useResponsive()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)

  const [ville, setVille] = useState("")
  const [budgetMax, setBudgetMax] = useState("")
  const [pieces, setPieces] = useState("2")
  const [surfaceMin, setSurfaceMin] = useState("")
  const [meublePref, setMeublePref] = useState<"peu_importe" | "oui" | "non">("peu_importe")
  const [animaux, setAnimaux] = useState(false)
  const [parking, setParking] = useState(false)
  const [exterieur, setExterieur] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth")
  }, [status, router])

  async function finaliser() {
    if (!session?.user?.email) return
    setSaving(true)
    const payload = {
      email: session.user.email,
      ville_souhaitee: ville || null,
      budget_max: budgetMax ? parseInt(budgetMax) : null,
      pieces_min: pieces,
      surface_min: surfaceMin ? parseInt(surfaceMin) : null,
      meuble: meublePref === "peu_importe" ? null : meublePref === "oui",
      animaux,
      parking,
      balcon: exterieur,
      terrasse: exterieur,
    }
    // V24.3 — via /api/profil/save (server-side, email forcé)
    try {
      await fetch("/api/profil/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    } catch { /* noop */ }

    // Redirection avec filtres pré-remplis
    const params = new URLSearchParams()
    if (ville) params.set("ville", ville)
    if (budgetMax) params.set("budget_max", budgetMax)
    const qs = params.toString()
    router.push(qs ? `/annonces?${qs}` : "/annonces")
  }

  function next() {
    if (step < STEPS) setStep(step + 1)
    else finaliser()
  }

  function prev() {
    if (step > 1) setStep(step - 1)
  }

  if (status === "loading") return null

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    border: `1px solid ${km.line}`,
    borderRadius: 10,
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
    background: km.white,
    color: km.ink,
  }

  return (
    <main style={{ minHeight: "100vh", background: km.beige, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "32px 16px" : "56px 40px" }}>
      <div style={{ maxWidth: 620, width: "100%" }}>

        {/* Eyebrow + compteur */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <KMEyebrow>Votre recherche · Étape {step} sur {STEPS}</KMEyebrow>
          <div style={{ flex: 1, height: 1, background: km.line }} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.5px", color: km.muted }}>
            {String(step).padStart(2, "0")}
          </span>
        </div>

        {/* Barre progression */}
        <div style={{ display: "flex", gap: 6, marginBottom: 28 }}>
          {Array.from({ length: STEPS }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 999, background: i < step ? km.ink : km.line, transition: "background 0.3s" }} />
          ))}
        </div>

        <KMCard padding={isMobile ? 24 : 36}>
          {step === 1 && (
            <>
              <KMHeading size={isMobile ? 30 : 38} as="h1">Où cherchez-vous ?</KMHeading>
              <p style={{ fontSize: 14, color: km.muted, margin: "12px 0 24px", lineHeight: 1.6 }}>
                Cette information nous permet de centrer la carte et pré-remplir vos filtres.
              </p>
              <label style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.6px", display: "block", marginBottom: 8 }}>Ville</label>
              <CityAutocomplete value={ville} onChange={setVille} placeholder="Paris, Lyon, Marseille…" />
              <label style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.6px", display: "block", marginBottom: 8, marginTop: 20 }}>Budget maximum par mois (€)</label>
              <input type="number" value={budgetMax} onChange={e => setBudgetMax(e.target.value)} placeholder="1200" style={inputStyle} />
            </>
          )}

          {step === 2 && (
            <>
              <KMHeading size={isMobile ? 30 : 38} as="h1">Quel type de bien ?</KMHeading>
              <p style={{ fontSize: 14, color: km.muted, margin: "12px 0 24px", lineHeight: 1.6 }}>
                Sélectionnez vos préférences de taille.
              </p>
              <label style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.6px", display: "block", marginBottom: 10 }}>Nombre de pièces minimum</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 }}>
                {["1", "2", "3", "4", "5+"].map(p => (
                  <button key={p} type="button" onClick={() => setPieces(p)}
                    aria-pressed={pieces === p}
                    style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
                    <KMChip variant={pieces === p ? "ink" : "neutral"}>
                      {p} {p === "1" ? "pièce" : "pièces"}
                    </KMChip>
                  </button>
                ))}
              </div>
              <label style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.6px", display: "block", marginBottom: 8 }}>Surface minimum (m²)</label>
              <input type="number" value={surfaceMin} onChange={e => setSurfaceMin(e.target.value)} placeholder="35" style={inputStyle} />
            </>
          )}

          {step === 3 && (
            <>
              <KMHeading size={isMobile ? 30 : 38} as="h1">Quelques critères clés</KMHeading>
              <p style={{ fontSize: 14, color: km.muted, margin: "12px 0 24px", lineHeight: 1.6 }}>
                Indiquez ce qui compte vraiment pour vous. Vous pourrez ajuster tout ça plus tard dans votre profil.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {/* Meublé : 3 options (peu importe / oui / non) — évite de pénaliser
                    le locataire sans avis (cf. lib/matching.ts toBool null = neutre). */}
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: km.ink, marginBottom: 8 }}>Meublé</p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[
                      { v: "peu_importe" as const, l: "Peu importe" },
                      { v: "oui" as const, l: "Meublé" },
                      { v: "non" as const, l: "Non meublé" },
                    ].map(opt => {
                      const active = meublePref === opt.v
                      return (
                        <button key={opt.v} type="button" onClick={() => setMeublePref(opt.v)}
                          aria-pressed={active}
                          style={{ padding: "10px 16px", borderRadius: 999, border: `1px solid ${active ? km.ink : km.line}`, background: active ? km.ink : km.white, color: active ? km.white : km.ink, cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit" }}>
                          {opt.l}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {[
                  { val: animaux, set: setAnimaux, label: "J'ai un animal" },
                  { val: parking, set: setParking, label: "Parking nécessaire" },
                  { val: exterieur, set: setExterieur, label: "Extérieur (balcon ou terrasse)" },
                ].map(opt => (
                  <button key={opt.label} type="button" onClick={() => opt.set(!opt.val)}
                    aria-pressed={opt.val}
                    style={{ padding: "14px 18px", border: `1px solid ${opt.val ? km.ink : km.line}`, background: opt.val ? km.ink : km.white, color: opt.val ? km.white : km.ink, borderRadius: 14, cursor: "pointer", fontWeight: 600, fontSize: 14, fontFamily: "inherit", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", letterSpacing: "0.2px" }}>
                    {opt.label}
                    <span style={{ fontSize: 16, opacity: 0.9 }}>{opt.val ? "✓" : "+"}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28, gap: 12 }}>
            {step > 1 ? (
              <KMButtonOutline onClick={prev} size="sm">← Retour</KMButtonOutline>
            ) : <span />}
            <KMButton onClick={next} disabled={saving} size="md">
              {step < STEPS ? "Continuer" : (saving ? "Enregistrement…" : "Voir les annonces")}
            </KMButton>
          </div>
        </KMCard>

        {/* Boutons secondaires Ignorer / Mon dossier — visibles sur toutes les etapes.
            "Ignorer" skip cet onboarding light et va voir les annonces tout de suite.
            "Mon dossier" va directement sur la page dossier complete ALUR, pour les
            users qui veulent poser leur dossier immediatement avant de chercher. */}
        <div style={{ display: "flex", justifyContent: "center", gap: 18, marginTop: 24, flexWrap: "wrap" }}>
          <a href="/annonces" style={{ color: km.muted, fontSize: 11, fontWeight: 700, textDecoration: "none", letterSpacing: "1.2px", textTransform: "uppercase" }}>
            Ignorer cette étape
          </a>
          <span style={{ color: km.line, fontSize: 11 }}>·</span>
          <a href="/dossier" style={{ color: km.ink, fontSize: 11, fontWeight: 700, textDecoration: "none", letterSpacing: "1.2px", textTransform: "uppercase", borderBottom: `1px solid ${km.ink}`, paddingBottom: 2 }}>
            Remplir mon dossier complet
          </a>
        </div>
      </div>
    </main>
  )
}
