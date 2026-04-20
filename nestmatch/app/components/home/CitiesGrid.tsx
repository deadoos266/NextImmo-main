"use client"
import Link from "next/link"
import { CARD_GRADIENTS } from "../../../lib/cardGradients"
import { useReducedMotion } from "./hooks"

/**
 * Grille "Par ville" — 6 villes phares. Pas de photos (pas de CDN brand),
 * on utilise des gradients `cardGradients.ts` pour le rendu. Hover : légère
 * élévation du gradient. Clic → /annonces?ville=X.
 */

const CITIES = [
  { name: "Paris",     n: 412 },
  { name: "Lyon",      n: 186 },
  { name: "Bordeaux",  n: 94 },
  { name: "Marseille", n: 128 },
  { name: "Nantes",    n: 72 },
  { name: "Toulouse",  n: 88 },
]

export default function CitiesGrid({ isMobile }: { isMobile: boolean }) {
  const reduced = useReducedMotion()
  return (
    <section style={{ background: "#fff", padding: isMobile ? "72px 20px" : "120px 32px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: isMobile ? 28 : 40,
          borderBottom: "1px solid #EAE6DF",
          paddingBottom: 22,
          flexWrap: "wrap",
          gap: 16,
        }}>
          <div>
            <p style={{
              fontSize: 12, fontWeight: 700,
              color: "#666", textTransform: "uppercase", letterSpacing: "1.8px",
              margin: 0, marginBottom: 14,
            }}>
              Explorer
            </p>
            <h2 style={{
              fontSize: isMobile ? 30 : 42,
              fontWeight: 500,
              letterSpacing: "-1.2px",
              margin: 0,
              lineHeight: 1.1,
            }}>
              Par ville
            </h2>
          </div>
          <Link
            href="/annonces"
            style={{
              fontSize: 13, fontWeight: 500, color: "#111",
              textDecoration: "none",
              borderBottom: "1px solid #111",
              paddingBottom: 2,
              letterSpacing: "0.3px",
            }}
          >
            Toutes les villes
          </Link>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 14,
        }}>
          {CITIES.map((c, i) => {
            const gradient = CARD_GRADIENTS[i % CARD_GRADIENTS.length]
            return (
              <Link
                key={c.name}
                href={`/annonces?ville=${encodeURIComponent(c.name)}`}
                style={{
                  position: "relative",
                  aspectRatio: "4 / 5",
                  borderRadius: 18,
                  overflow: "hidden",
                  textDecoration: "none",
                  color: "#fff",
                  display: "block",
                  background: gradient,
                  transition: "transform 300ms ease, box-shadow 300ms ease",
                }}
                onMouseEnter={e => {
                  if (reduced) return
                  e.currentTarget.style.transform = "translateY(-2px)"
                  e.currentTarget.style.boxShadow = "0 12px 32px rgba(0,0,0,0.12)"
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = "translateY(0)"
                  e.currentTarget.style.boxShadow = "none"
                }}
              >
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(180deg, transparent 30%, rgba(0,0,0,0.6))",
                }} />
                <div style={{ position: "absolute", bottom: 20, left: 20, right: 20 }}>
                  <div style={{
                    fontSize: 22,
                    fontWeight: 500,
                    letterSpacing: "-0.5px",
                    textShadow: "0 1px 4px rgba(0,0,0,0.3)",
                  }}>
                    {c.name}
                  </div>
                  <div style={{
                    fontSize: 11,
                    opacity: 0.85,
                    textTransform: "uppercase",
                    letterSpacing: "1.2px",
                    marginTop: 4,
                  }}>
                    {c.n.toLocaleString("fr-FR")} logements
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
