"use client"
import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { CARD_GRADIENTS } from "../../../lib/cardGradients"
import { useReducedMotion } from "./hooks"

/**
 * Grille "Par ville" — 6 villes phares avec photos emblématiques.
 *
 * Photos servies depuis `/public/villes/*.jpg` (même domaine → CSP 'self' OK).
 * En cas de 404 sur l'image (retiré du repo, renommé), fallback automatique
 * vers un gradient de `lib/cardGradients.ts` via `onError`.
 *
 * ─── Crédits photos (Unsplash, licence libre) ────────────────────────────
 * Ces photos illustrent les villes — elles ne représentent pas des logements
 * réels. Aucune ressource de propriété n'est associée. Libres de droit
 * commercial et non-commercial selon la licence Unsplash (unsplash.com/license).
 *
 *   paris.jpg     photo-1502602898657-3e91760cbb34  (Tour Eiffel)
 *   lyon.jpg      photo-1524396309943-e03f5249f002  (vue générale Lyon)
 *   bordeaux.jpg  photo-1568605114967-8130f3a36994  (architecture Bordeaux)
 *   marseille.jpg photo-1565689157206-0fddef7589a2  (Vieux-Port)
 *   nantes.jpg    photo-1610641818989-c2051b5e2cfd  (centre Nantes)
 *   toulouse.jpg  photo-1600585154340-be6161a56a0c  (architecture méditerranéenne)
 * ─────────────────────────────────────────────────────────────────────────
 */

const CITIES = [
  { name: "Paris",     n: 412, file: "/villes/paris.jpg" },
  { name: "Lyon",      n: 186, file: "/villes/lyon.jpg" },
  { name: "Bordeaux",  n: 94,  file: "/villes/bordeaux.jpg" },
  { name: "Marseille", n: 128, file: "/villes/marseille.jpg" },
  { name: "Nantes",    n: 72,  file: "/villes/nantes.jpg" },
  { name: "Toulouse",  n: 88,  file: "/villes/toulouse.jpg" },
]

export default function CitiesGrid({ isMobile }: { isMobile: boolean }) {
  const reduced = useReducedMotion()
  // Set des villes dont l'image a échoué (404 ou erreur) — fallback gradient
  const [broken, setBroken] = useState<Set<string>>(new Set())

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
            const useGradient = broken.has(c.name)
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
                  background: useGradient ? gradient : "#EAE6DF",
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
                {!useGradient && (
                  <Image
                    src={c.file}
                    alt={`Illustration ${c.name}`}
                    fill
                    sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 220px"
                    style={{
                      objectFit: "cover",
                      transform: reduced ? "scale(1)" : undefined,
                      transition: "transform 600ms ease",
                    }}
                    onError={() => setBroken(prev => {
                      if (prev.has(c.name)) return prev
                      const next = new Set(prev)
                      next.add(c.name)
                      return next
                    })}
                  />
                )}
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
