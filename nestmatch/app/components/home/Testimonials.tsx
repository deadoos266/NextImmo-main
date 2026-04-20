"use client"
import { useState } from "react"
import { useInterval, useReducedMotion } from "./hooks"

/**
 * Carousel "exemple d'utilisation" sur fond noir.
 *
 * 3 témoignages hardcodés (Camille M. / Julien D. / Nora B.), carousel
 * auto 5.5 s. Initiales dans cercles beige neutres (pas de photos).
 *
 * Honest flag : ces témoignages sont **fictifs et servent à illustrer
 * l'usage cible** de la plateforme. L'eyebrow "EXEMPLE D'UTILISATION"
 * (au lieu de "ILS ONT TROUVÉ") rend cela explicite au visiteur sans
 * tuer la dynamique visuelle.
 *
 * Reduced-motion : reste sur la 1re citation, pas d'auto-advance.
 */

const ITEMS = [
  {
    q: "En 8 jours j'avais signé mon bail. Sans un centime d'agence, sans stress, depuis mon canapé.",
    who: "Camille M.",
    role: "Locataire · Paris 10e",
    color: "#EAE6DF",
  },
  {
    q: "J'ai eu 14 candidatures sérieuses en 48 h. Les dossiers arrivent pré-vérifiés, c'est un autre monde.",
    who: "Julien D.",
    role: "Propriétaire · Lyon 2e",
    color: "#D4C9B5",
  },
  {
    q: "L'état des lieux digital m'a évité 40 minutes de paperasse. Tout est signé, archivé, cherchable.",
    who: "Nora B.",
    role: "Locataire · Bordeaux",
    color: "#B8A890",
  },
]

function initiales(name: string): string {
  return name.split(/\s+/).map(p => p[0] || "").join("").slice(0, 2).toUpperCase()
}

export default function Testimonials({ isMobile }: { isMobile: boolean }) {
  const reduced = useReducedMotion()
  const [i, setI] = useState(0)

  useInterval(!reduced, () => setI(x => (x + 1) % ITEMS.length), 5500)

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
          Exemple d&apos;utilisation
        </p>

        <div style={{ position: "relative", minHeight: isMobile ? 320 : 280 }}>
          {ITEMS.map((t, k) => (
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
                  {initiales(t.who)}
                </div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{t.who}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Dots */}
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 32 }}>
          {ITEMS.map((_, k) => (
            <button
              key={k}
              onClick={() => setI(k)}
              aria-label={`Témoignage ${k + 1}`}
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
