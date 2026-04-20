"use client"
import { useState } from "react"
import Image from "next/image"
import { useInterval, useReducedMotion } from "./hooks"
import type { FeaturedListing } from "./useFeaturedListings"

/**
 * "Comment ça marche" — 2 colonnes asymétriques, 3 steps cliquables avec
 * auto-advance 3.5 s + progress bar. Reduced-motion : pas d'auto-advance,
 * pas de progress bar animée, la step active reste la première sans bouger.
 */

const STEPS = [
  { t: "Créez votre dossier",       d: "Bulletins, avis d'imposition, garant : tout centralisé." },
  { t: "Matchez avec un logement",  d: "Score de 0 à 100 % calculé sur vos critères." },
  { t: "Signez votre bail en ligne",d: "Bail électronique + état des lieux digital." },
]

export default function HowItWorks({
  listings,
  isMobile,
}: { listings: FeaturedListing[]; isMobile: boolean }) {
  const reduced = useReducedMotion()
  const [step, setStep] = useState(0)

  useInterval(!reduced, () => setStep(s => (s + 1) % STEPS.length), 3500)

  // 3 photos différentes parmi les listings pour illustrer chaque step
  const stepPhotos: { src: string | null; gradient?: string }[] = [0, 2, 4].map(i => {
    const l = listings[i] ?? listings[0]
    return l?.photos[0] ? { src: l.photos[0] } : { src: null, gradient: l?._gradient || "#EAE6DF" }
  })

  return (
    <section style={{ background: "#F7F4EF", padding: isMobile ? "72px 20px" : "120px 32px" }}>
      <div style={{
        maxWidth: 1280,
        margin: "0 auto",
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        gap: isMobile ? 40 : 80,
        alignItems: "center",
      }}>
        {/* Colonne gauche — texte + steps cliquables */}
        <div>
          <p style={{
            fontSize: 12, fontWeight: 700,
            color: "#666", textTransform: "uppercase", letterSpacing: "1.8px",
            margin: 0, marginBottom: 18,
          }}>
            Comment ça marche
          </p>
          <h2 style={{
            fontSize: isMobile ? 32 : 44,
            fontWeight: 500,
            lineHeight: 1.08,
            letterSpacing: "-1.4px",
            margin: 0,
            marginBottom: isMobile ? 32 : 48,
            color: "#111",
          }}>
            Trois étapes, quinze minutes.<br />
            Pas d&apos;agence, pas de commission.
          </h2>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {STEPS.map((s, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                style={{
                  textAlign: "left",
                  border: "none",
                  background: "transparent",
                  padding: "20px 0",
                  cursor: "pointer",
                  borderTop: "1px solid #111",
                  display: "flex",
                  gap: 20,
                  alignItems: "flex-start",
                  fontFamily: "inherit",
                  opacity: step === i ? 1 : 0.4,
                  transition: "opacity 300ms ease",
                }}
              >
                <span style={{
                  fontSize: 32, fontWeight: 300, letterSpacing: "-1px",
                  color: "#111", lineHeight: 1, flexShrink: 0,
                  fontVariantNumeric: "tabular-nums",
                }}>
                  0{i + 1}
                </span>
                <div style={{ flex: 1, position: "relative" }}>
                  <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.2px", marginBottom: 4 }}>{s.t}</div>
                  <div style={{ fontSize: 13, color: "#555", lineHeight: 1.5 }}>{s.d}</div>
                  {step === i && !reduced && (
                    <div style={{ position: "absolute", left: 0, right: 0, bottom: -20, height: 2, background: "#EAE6DF", overflow: "hidden" }}>
                      <div
                        key={step}
                        style={{
                          height: "100%",
                          background: "#111",
                          width: "100%",
                          transformOrigin: "left",
                          animation: "km-progress 3500ms linear",
                        }}
                      />
                      <style>{`@keyframes km-progress { from { transform: scaleX(0) } to { transform: scaleX(1) } }`}</style>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Colonne droite — image qui change selon step */}
        <div style={{
          position: "relative",
          aspectRatio: "4 / 5",
          borderRadius: 24,
          overflow: "hidden",
          boxShadow: "0 30px 60px rgba(0,0,0,0.15)",
          background: "#EAE6DF",
        }}>
          {stepPhotos.map((p, i) => (
            <div key={i} style={{
              position: "absolute",
              inset: 0,
              opacity: step === i ? 1 : 0,
              transition: "opacity 800ms ease",
              transform: step === i ? "scale(1)" : "scale(1.05)",
              background: p.gradient,
            }}>
              {p.src && (
                <Image src={p.src} alt="" fill sizes="(max-width: 768px) 100vw, 50vw" style={{ objectFit: "cover" }} />
              )}
            </div>
          ))}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.7))",
          }} />
          <div style={{
            position: "absolute", bottom: 32, left: 32, right: 32, color: "#fff",
          }}>
            <div style={{ fontSize: 11, opacity: 0.7, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 8 }}>
              Étape 0{step + 1} sur 03
            </div>
            <div style={{ fontSize: 24, fontWeight: 500, letterSpacing: "-0.5px" }}>
              {STEPS[step].t}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
