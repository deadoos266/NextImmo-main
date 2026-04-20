"use client"
import Image from "next/image"
import { useReducedMotion } from "./hooks"
import type { FeaturedListing } from "./useFeaturedListings"

/**
 * Bande défilante infinie des logements vedette (logo-inspirée : scroll
 * horizontal continu). Duplique la liste ×3 pour boucler.
 * Reduced-motion : défilement arrêté (statique), reste lisible.
 */
export default function MarqueeStrip({ listings }: { listings: FeaturedListing[] }) {
  const reduced = useReducedMotion()
  if (listings.length === 0) return null
  const row = [...listings, ...listings, ...listings]

  return (
    <section style={{
      background: "#F7F4EF",
      padding: "40px 0",
      borderBottom: "1px solid #EAE6DF",
      overflow: "hidden",
    }}>
      {!reduced && (
        <style>{`@keyframes km-marquee { from { transform: translateX(0) } to { transform: translateX(-33.333%) } }`}</style>
      )}
      <div style={{
        display: "flex",
        gap: 16,
        width: "fit-content",
        animation: reduced ? "none" : "km-marquee 40s linear infinite",
      }}>
        {row.map((a, i) => {
          const photo = a.photos[0]
          const quartier = a.ville ?? "À découvrir"
          return (
            <div
              key={`${a.id}-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 18px 10px 10px",
                background: "#fff",
                border: "1px solid #EAE6DF",
                borderRadius: 999,
                flexShrink: 0,
              }}
            >
              <div style={{
                position: "relative",
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: a._gradient || "#EAE6DF",
                overflow: "hidden",
                flexShrink: 0,
              }}>
                {photo && (
                  <Image src={photo} alt="" fill sizes="36px" style={{ objectFit: "cover" }} />
                )}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{quartier}</div>
              <div style={{ width: 1, height: 16, background: "#EAE6DF" }} />
              <div style={{ fontSize: 12, color: "#666" }}>
                {a.prix != null ? `${a.prix.toLocaleString("fr-FR")} €` : "—"}
              </div>
              {a._matchPct != null && (
                <div style={{ fontSize: 10, fontWeight: 700, color: "#16A34A", letterSpacing: "1px" }}>
                  {a._matchPct}&nbsp;%
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
