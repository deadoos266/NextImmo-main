"use client"
import { useState } from "react"
import { useInterval, useReducedMotion } from "./hooks"

/**
 * "Promesses KeyMatch" — fond noir, carousel auto 5.5 s.
 *
 * Anciennement "testimonials" avec noms/villes inventés — retiré en mode
 * "no lies" (Paul). Remplacé par 3 promesses marque réelles, verifiables
 * depuis la plateforme : frais zéro, dossier ALUR, bail eIDAS.
 *
 * Reduced-motion : reste sur la 1ère promesse, pas d'auto-advance.
 */

const PROMISES = [
  {
    q: "Aucun frais d'agence, aucune commission. Vous payez le loyer, rien d'autre.",
    label: "Pour les locataires",
    initiale: "L",
    color: "#EAE6DF",
  },
  {
    q: "Des candidats pré-vérifiés. Dossiers ALUR, revenus, garant : tout arrive prêt.",
    label: "Pour les propriétaires",
    initiale: "P",
    color: "#D4C9B5",
  },
  {
    q: "Bail électronique eIDAS, état des lieux digital, archivage. Plus jamais de paperasse.",
    label: "La promesse KeyMatch",
    initiale: "K",
    color: "#B8A890",
  },
]

export default function Testimonials({ isMobile }: { isMobile: boolean }) {
  const reduced = useReducedMotion()
  const [i, setI] = useState(0)

  useInterval(!reduced, () => setI(x => (x + 1) % PROMISES.length), 5500)

  return (
    <section style={{
      background: "#111",
      color: "#fff",
      padding: isMobile ? "80px 20px" : "120px 32px",
      overflow: "hidden",
      position: "relative",
    }}>
      <div style={{ maxWidth: 960, margin: "0 auto", textAlign: "center", position: "relative" }}>
        <p style={{
          fontSize: 12, fontWeight: 700,
          color: "#888", textTransform: "uppercase", letterSpacing: "1.8px",
          margin: 0, marginBottom: 36,
        }}>
          Ce que nous offrons
        </p>

        <div style={{ position: "relative", minHeight: isMobile ? 320 : 280 }}>
          {PROMISES.map((t, k) => (
            <div
              key={k}
              style={{
                position: "absolute", inset: 0,
                opacity: i === k ? 1 : 0,
                transition: "opacity 800ms ease, transform 800ms ease",
                transform: i === k ? "translateY(0)" : "translateY(20px)",
                pointerEvents: i === k ? "auto" : "none",
              }}
            >
              <p style={{
                fontSize: isMobile ? 22 : 34,
                fontWeight: 500,
                lineHeight: 1.25,
                letterSpacing: "-0.8px",
                margin: 0,
                marginBottom: 40,
              }}>
                « {t.q} »
              </p>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 48, height: 48,
                  borderRadius: "50%",
                  background: t.color,
                  color: "#111",
                  display: "flex",
                  alignItems: "center", justifyContent: "center",
                  fontSize: 16, fontWeight: 500,
                  letterSpacing: "-0.3px",
                }} aria-hidden>
                  {t.initiale}
                </div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.2px" }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: "#888" }}>Promesse KeyMatch</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Dots */}
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 32 }}>
          {PROMISES.map((_, k) => (
            <button
              key={k}
              onClick={() => setI(k)}
              aria-label={`Promesse ${k + 1}`}
              style={{
                width: i === k ? 28 : 8,
                height: 8,
                borderRadius: 999,
                background: i === k ? "#fff" : "rgba(255,255,255,0.3)",
                border: "none",
                cursor: "pointer",
                transition: "width 400ms ease, background 400ms ease",
                padding: 0,
              }}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
