"use client"
import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import CityAutocomplete from "../components/CityAutocomplete"
import { useResponsive } from "../hooks/useResponsive"

/**
 * Onboarding 3 étapes pour les nouveaux locataires.
 * Arrivée attendue juste après l'inscription.
 * Collecte les critères essentiels et redirige vers /annonces avec filtres.
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
  const [meuble, setMeuble] = useState(false)
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
      nom: session.user.name,
      ville_souhaitee: ville || null,
      budget_max: budgetMax ? parseInt(budgetMax) : null,
      pieces_min: pieces,
      surface_min: surfaceMin ? parseInt(surfaceMin) : null,
      meuble,
      animaux,
      parking,
      balcon: exterieur,
      terrasse: exterieur,
    }
    await supabase.from("profils").upsert(payload, { onConflict: "email" })

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

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "24px 16px" : "40px" }}>
      <div style={{ maxWidth: 520, width: "100%", background: "white", borderRadius: 24, padding: isMobile ? "28px 24px" : "40px 44px", boxShadow: "0 4px 32px rgba(0,0,0,0.08)" }}>

        {/* Barre progression */}
        <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
          {Array.from({ length: STEPS }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 999, background: i < step ? "#111" : "#e5e7eb", transition: "background 0.3s" }} />
          ))}
        </div>

        <p style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
          Étape {step} sur {STEPS}
        </p>

        {step === 1 && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 6 }}>Où cherchez-vous ?</h1>
            <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
              Cette information nous permet de centrer la carte et pré-remplir vos filtres.
            </p>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 6 }}>Ville</label>
            <CityAutocomplete value={ville} onChange={setVille} placeholder="Paris, Lyon, Marseille…" />
            <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 6, marginTop: 18 }}>Budget maximum par mois (€)</label>
            <input type="number" value={budgetMax} onChange={e => setBudgetMax(e.target.value)} placeholder="1200"
              style={{ width: "100%", padding: "11px 14px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
          </>
        )}

        {step === 2 && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 6 }}>Quel type de bien ?</h1>
            <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
              Sélectionnez vos préférences de taille.
            </p>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 8 }}>Nombre de pièces minimum</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
              {["1", "2", "3", "4", "5+"].map(p => (
                <button key={p} onClick={() => setPieces(p)}
                  style={{ padding: "10px 18px", borderRadius: 999, border: `1.5px solid ${pieces === p ? "#111" : "#e5e7eb"}`, background: pieces === p ? "#111" : "white", color: pieces === p ? "white" : "#111", cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "inherit" }}>
                  {p} {p === "1" ? "pièce" : "pièces"}
                </button>
              ))}
            </div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 6 }}>Surface minimum (m²)</label>
            <input type="number" value={surfaceMin} onChange={e => setSurfaceMin(e.target.value)} placeholder="35"
              style={{ width: "100%", padding: "11px 14px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
          </>
        )}

        {step === 3 && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 6 }}>Quelques critères clés</h1>
            <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
              Indiquez ce qui compte vraiment pour vous. Vous pourrez ajuster tout ça plus tard dans votre profil.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { val: meuble, set: setMeuble, label: "Meublé" },
                { val: animaux, set: setAnimaux, label: "J'ai un animal" },
                { val: parking, set: setParking, label: "Parking nécessaire" },
                { val: exterieur, set: setExterieur, label: "Extérieur (balcon ou terrasse)" },
              ].map(opt => (
                <button key={opt.label} onClick={() => opt.set(!opt.val)}
                  style={{ padding: "14px 18px", border: `1.5px solid ${opt.val ? "#111" : "#e5e7eb"}`, background: opt.val ? "#111" : "white", color: opt.val ? "white" : "#111", borderRadius: 12, cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "inherit", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  {opt.label}
                  <span style={{ fontSize: 16 }}>{opt.val ? "✓" : "+"}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28, gap: 12 }}>
          {step > 1 ? (
            <button onClick={prev} style={{ background: "none", border: "none", color: "#6b7280", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              ← Retour
            </button>
          ) : (
            <a href="/annonces" style={{ background: "none", border: "none", color: "#9ca3af", fontWeight: 500, fontSize: 13, textDecoration: "none" }}>
              Passer
            </a>
          )}
          <button onClick={next} disabled={saving}
            style={{ background: saving ? "#9ca3af" : "#111", color: "white", border: "none", borderRadius: 999, padding: "12px 32px", fontWeight: 700, fontSize: 15, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {step < STEPS ? "Continuer" : (saving ? "Enregistrement…" : "Voir les annonces")}
          </button>
        </div>
      </div>
    </main>
  )
}
