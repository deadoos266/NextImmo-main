"use client"

import Image from "next/image"
import { km } from "../ui/km"

/**
 * CompareTray v3 (Paul 2026-04-27 — refacto v2 jugee "encore un peu de
 * la merde" sur retour user). Pattern Booking.com / Idealista mobile :
 * 1 ligne horizontale compact ~72-80px avec thumbnails + boutons a droite.
 *
 * Layout :
 *  [thumb 48][thumb 48][thumb 48] [scroll-x si >3]  |  VIDER  COMPARER (n)
 *
 * Thumb : photo 48x48 carree, X close top-right (16x16), prix overlay
 * bottom (10px tabular). Hover/tap → highlight + retire.
 *
 * Scroll horizontal natif si beaucoup de cards (max 3 contraint deja
 * par COMPARE_MAX, mais le pattern reste robuste). Scroll-snap pour
 * UX fluide.
 *
 * Hauteur fixe → pas de jump visuel quand on ajoute/retire une card.
 */
export interface CompareTrayProps {
  items: Array<{
    id: number
    titre: string | null
    ville: string | null
    prix: number | null
    photo: string | null
  }>
  onRemove: (id: number) => void
  onClear: () => void
  onCompare: () => void
  max: number
}

export default function CompareTray({ items, onRemove, onClear, onCompare, max }: CompareTrayProps) {
  if (items.length === 0) return null
  const disabled = items.length < 2

  return (
    <>
      <style>{`
        @keyframes km-compare-rise { from { transform: translateY(120%) } to { transform: translateY(0) } }
        .km-compare-thumbs::-webkit-scrollbar { display: none }
      `}</style>
      <div
        role="region"
        aria-label="Comparateur d'annonces"
        style={{
          position: "fixed",
          left: 0, right: 0, bottom: 0,
          zIndex: 8500,
          background: km.white,
          borderTop: `1px solid ${km.line}`,
          boxShadow: "0 -8px 24px rgba(17,17,17,0.12)",
          padding: "10px 16px calc(10px + env(safe-area-inset-bottom, 0px))",
          display: "flex", alignItems: "center", gap: 12,
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
          height: 80,
          animation: "km-compare-rise 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {/* Eyebrow + count à gauche, compact 1 ligne */}
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.2px", lineHeight: 1 }}>
            Comparer
          </span>
          <span style={{ fontSize: 14, fontWeight: 800, color: km.ink, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {items.length}/{max}
          </span>
        </div>

        {/* Thumbnails 1 ligne — scroll horizontal natif si > viewport */}
        <div
          className="km-compare-thumbs"
          style={{
            display: "flex",
            gap: 8,
            flex: 1,
            minWidth: 0,
            overflowX: "auto",
            overflowY: "hidden",
            scrollSnapType: "x proximity",
            scrollbarWidth: "none",
            WebkitOverflowScrolling: "touch",
            paddingBottom: 2,
          }}
        >
          {items.map(it => (
            <div
              key={it.id}
              style={{
                position: "relative",
                width: 48,
                height: 48,
                flexShrink: 0,
                borderRadius: 10,
                overflow: "hidden",
                background: km.beige,
                border: `1px solid ${km.line}`,
                scrollSnapAlign: "start",
              }}
              title={`${it.titre || "Annonce"}${it.prix ? ` — ${it.prix.toLocaleString("fr-FR")} €/mois` : ""}`}
            >
              {it.photo ? (
                <Image
                  src={it.photo}
                  alt={it.titre || "Photo logement"}
                  fill
                  sizes="48px"
                  style={{ objectFit: "cover" }}
                />
              ) : (
                <div style={{
                  width: "100%", height: "100%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: km.muted,
                  fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif",
                  fontStyle: "italic", fontSize: 18,
                }}>
                  {(it.titre || "?")[0].toUpperCase()}
                </div>
              )}

              {/* Prix overlay bottom (gradient noir transparent → noir) */}
              {it.prix != null && (
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: 0, right: 0, bottom: 0,
                    padding: "8px 4px 2px",
                    fontSize: 9,
                    fontWeight: 800,
                    color: "#fff",
                    fontVariantNumeric: "tabular-nums",
                    textAlign: "center",
                    background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)",
                    pointerEvents: "none",
                    lineHeight: 1.1,
                  }}
                >
                  {Math.round(it.prix / 100) / 10}k€
                </span>
              )}

              {/* X close top-right (zone tactile reduite mais accessible) */}
              <button
                type="button"
                aria-label={`Retirer ${it.titre || "l'annonce"} du comparateur`}
                onClick={() => onRemove(it.id)}
                style={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.94)",
                  color: km.ink,
                  border: `1px solid ${km.line}`,
                  cursor: "pointer",
                  padding: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "inherit",
                  WebkitTapHighlightColor: "transparent",
                  backdropFilter: "blur(4px)",
                }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          ))}
        </div>

        {/* Divider vertical hairline */}
        <div aria-hidden="true" style={{ width: 1, height: 40, background: km.line, flexShrink: 0 }} />

        {/* Boutons VIDER + COMPARER à droite */}
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={onClear}
            aria-label="Vider le comparateur"
            style={{
              background: "transparent",
              color: km.muted,
              border: "none",
              borderRadius: 999,
              padding: "8px 10px",
              fontWeight: 600, fontSize: 11,
              textTransform: "uppercase", letterSpacing: "0.5px",
              cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
              WebkitTapHighlightColor: "transparent",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = km.ink }}
            onMouseLeave={e => { e.currentTarget.style.color = km.muted }}
          >
            Vider
          </button>
          <button
            type="button"
            onClick={onCompare}
            disabled={disabled}
            aria-label={disabled ? "Sélectionnez au moins 2 annonces pour comparer" : `Comparer ${items.length} annonces`}
            title={disabled ? "Sélectionnez au moins 2 annonces" : undefined}
            style={{
              background: km.ink, color: km.white, border: "none",
              borderRadius: 999, padding: "10px 18px", fontWeight: 700, fontSize: 11,
              textTransform: "uppercase", letterSpacing: "0.6px",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.45 : 1,
              fontFamily: "inherit", whiteSpace: "nowrap",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            Comparer ({items.length})
          </button>
        </div>
      </div>
    </>
  )
}
