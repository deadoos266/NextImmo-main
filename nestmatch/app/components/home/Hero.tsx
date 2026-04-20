"use client"
import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import CityAutocomplete from "../CityAutocomplete"
import GrainBackground from "./GrainBackground"

/**
 * Hero editorial "La location directe" (Direction A validée par Paul).
 *
 * Contraintes :
 * - Plein écran (min-height 88vh desktop)
 * - 1 colonne centrée, max-width 900px, padding vertical 180px / 96px mobile
 * - Fond #F7F4EF + grain SVG 3 %
 * - Titre 3 lignes en weight 500, line-height 1.02, letter-spacing -2px
 * - Alignement texte à gauche (style presse)
 * - Search bar blanche pilule, hauteur 64px, max 620px
 * - 4 chips villes ghost alignés à gauche
 * - Zéro emoji, zéro visuel stock
 */

const VILLES_CHIP = ["Paris", "Lyon", "Bordeaux", "Marseille"]

export default function Hero({ isMobile, isTablet }: { isMobile: boolean; isTablet: boolean }) {
  const router = useRouter()
  const [ville, setVille] = useState("")
  const [budget, setBudget] = useState("")

  function handleSubmit(e?: FormEvent) {
    e?.preventDefault()
    const params = new URLSearchParams()
    if (ville.trim()) params.set("ville", ville.trim())
    const b = budget.replace(/[^0-9]/g, "")
    if (b) params.set("budget_max", b)
    const qs = params.toString()
    router.push(qs ? `/annonces?${qs}` : "/annonces")
  }

  function allerAnnoncesVille(v: string) {
    router.push(`/annonces?ville=${encodeURIComponent(v)}`)
  }

  return (
    <section style={{
      position: "relative",
      overflow: "hidden",
      background: "#F7F4EF",
      minHeight: isMobile ? "auto" : "88vh",
      display: "flex",
      alignItems: "center",
      padding: isMobile ? "96px 20px 72px" : isTablet ? "140px 40px 120px" : "180px 48px 160px",
    }}>
      <GrainBackground />

      <div style={{
        position: "relative",
        zIndex: 1,
        maxWidth: 900,
        margin: "0 auto",
        width: "100%",
      }}>
        {/* Eyebrow */}
        <p style={{
          fontSize: 12,
          fontWeight: 700,
          color: "#666",
          textTransform: "uppercase",
          letterSpacing: "1.8px",
          margin: 0,
          marginBottom: isMobile ? 24 : 36,
        }}>
          Keymatch-immo
        </p>

        {/* Titre massif, 3 lignes, alignement gauche */}
        <h1 style={{
          fontSize: isMobile ? 40 : isTablet ? 56 : 72,
          fontWeight: 500,
          lineHeight: 1.02,
          letterSpacing: isMobile ? "-1.2px" : "-2px",
          color: "#111",
          margin: 0,
          marginBottom: isMobile ? 28 : 40,
        }}>
          La location directe.<br />
          Sans agence. Sans commission.<br />
          Juste une plateforme.
        </h1>

        {/* Sous-titre */}
        <p style={{
          fontSize: isMobile ? 15 : 18,
          lineHeight: 1.55,
          color: "#555",
          fontWeight: 400,
          maxWidth: 540,
          margin: 0,
          marginBottom: isMobile ? 36 : 48,
        }}>
          Keymatch-immo connecte propriétaires et locataires vérifiés pour une location
          conforme ALUR, bail électronique à la clé.
        </p>

        {/* Barre de recherche */}
        <form onSubmit={handleSubmit} style={{
          display: "flex",
          alignItems: "stretch",
          background: "white",
          border: "1px solid #EAE6DF",
          borderRadius: 20,
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          width: "100%",
          maxWidth: 620,
          height: isMobile ? "auto" : 64,
          flexDirection: isMobile ? "column" : "row",
          overflow: "hidden",
        }}>
          <div style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: isMobile ? "14px 18px 10px" : "0 22px",
            borderRight: isMobile ? "none" : "1px solid #EAE6DF",
            borderBottom: isMobile ? "1px solid #EAE6DF" : "none",
          }}>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#999",
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              marginBottom: 2,
            }}>
              Ville
            </span>
            <CityAutocomplete
              value={ville}
              onChange={setVille}
              placeholder="Paris, Lyon, Bordeaux..."
              style={{ border: "none", padding: 0, fontSize: 15, background: "transparent", fontFamily: "inherit" }}
            />
          </div>
          <div style={{
            flex: isMobile ? "none" : 0.8,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: isMobile ? "10px 18px 14px" : "0 22px",
          }}>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#999",
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              marginBottom: 2,
            }}>
              Budget max
            </span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="1 200 €/mois"
              value={budget}
              onChange={e => setBudget(e.target.value)}
              style={{
                outline: "none",
                fontSize: 15,
                background: "transparent",
                border: "none",
                color: "#111",
                fontFamily: "inherit",
                width: "100%",
                padding: 0,
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              background: "#111",
              color: "white",
              padding: isMobile ? "16px 24px" : "0 36px",
              fontWeight: 600,
              fontSize: 14,
              letterSpacing: "0.3px",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              flexShrink: 0,
              transition: "transform 200ms ease, box-shadow 200ms ease",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = "translateY(-1px)"
              e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.18)"
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = "translateY(0)"
              e.currentTarget.style.boxShadow = "none"
            }}
          >
            Rechercher
          </button>
        </form>

        {/* Chips villes */}
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          marginTop: isMobile ? 24 : 28,
        }}>
          {VILLES_CHIP.map(v => (
            <button
              key={v}
              type="button"
              onClick={() => allerAnnoncesVille(v)}
              style={{
                background: "transparent",
                border: "1px solid #EAE6DF",
                color: "#333",
                padding: "8px 16px",
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.8px",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "background 200ms ease, border-color 200ms ease, transform 200ms ease",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "white"
                e.currentTarget.style.borderColor = "#111"
                e.currentTarget.style.transform = "translateY(-1px)"
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "transparent"
                e.currentTarget.style.borderColor = "#EAE6DF"
                e.currentTarget.style.transform = "translateY(0)"
              }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
