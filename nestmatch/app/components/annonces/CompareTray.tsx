"use client"

import Image from "next/image"
import { km } from "../ui/km"

/**
 * CompareTray v2 (Paul 2026-04-27 sur retour user "Quand on utilise la
 * fonctionnalité comparer ça fait 2 boules en bas pour dire annonce c'est
 * mauvais").
 *
 * Refacto : remplace les chips text-only par des mini-cards horizontales
 * 200x72 avec photo gauche 64x72 + titre + prix + X close. Beaucoup plus
 * lisible. Empile vertical en mobile si la barre depasse 1 ligne.
 *
 * Affiche :
 *  - Eyebrow "À comparer" + count "1/3"
 *  - N mini-cards (max 3) avec photo + titre + ville + prix + X close
 *  - CTA "Comparer (N)" → navigue vers /annonces/comparer?ids=...
 *  - Bouton "Vider" outline → reset complet
 *
 * Rendue uniquement si compareIds.length >= 1. Animation slide-up via
 * keyframe au mount (rendu conditionnel par le caller).
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
      `}</style>
      <div
        role="region"
        aria-label="Comparateur d'annonces"
        style={{
          position: "fixed",
          left: 12, right: 12, bottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
          zIndex: 7500,
          background: km.white,
          border: `1px solid ${km.line}`,
          borderRadius: 20,
          boxShadow: "0 18px 48px rgba(17,17,17,0.16)",
          padding: "14px 18px",
          display: "flex", alignItems: "center", gap: 14,
          flexWrap: "wrap",
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
          maxWidth: 1100, margin: "0 auto",
          animation: "km-compare-rise 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.4px" }}>
            À comparer
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: km.ink }}>
            {items.length} / {max}
          </span>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
          {items.map(it => (
            <div
              key={it.id}
              style={{
                display: "grid",
                gridTemplateColumns: "64px 1fr 28px",
                gap: 0,
                alignItems: "stretch",
                background: km.white,
                border: `1px solid ${km.line}`,
                borderRadius: 12,
                overflow: "hidden",
                width: 220,
                height: 72,
                flexShrink: 0,
                fontFamily: "inherit",
              }}
            >
              {/* Photo gauche 64x72 */}
              <div style={{ position: "relative", width: 64, height: 72, background: km.beige, flexShrink: 0 }}>
                {it.photo ? (
                  <Image
                    src={it.photo}
                    alt={it.titre || "Photo logement"}
                    fill
                    sizes="64px"
                    style={{ objectFit: "cover" }}
                  />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: km.muted, fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif", fontStyle: "italic", fontSize: 18 }}>
                    {(it.titre || "?")[0].toUpperCase()}
                  </div>
                )}
              </div>

              {/* Contenu : titre + ville + prix */}
              <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 0 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: km.ink, margin: 0, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={it.titre || ""}>
                    {it.titre || "Annonce"}
                  </p>
                  {it.ville && (
                    <p style={{ fontSize: 10, color: km.muted, margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {it.ville}
                    </p>
                  )}
                </div>
                {it.prix != null && (
                  <p style={{ fontSize: 12, fontWeight: 700, color: km.ink, margin: 0, fontVariantNumeric: "tabular-nums" }}>
                    {it.prix.toLocaleString("fr-FR")} €
                    <span style={{ fontWeight: 400, color: km.muted, fontSize: 10, marginLeft: 2 }}>/mois</span>
                  </p>
                )}
              </div>

              {/* X close vertical column droite */}
              <button
                type="button"
                aria-label={`Retirer ${it.titre || "l'annonce"} du comparateur`}
                onClick={() => onRemove(it.id)}
                style={{
                  background: km.beige,
                  border: "none",
                  borderLeft: `1px solid ${km.line}`,
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: km.ink, fontFamily: "inherit",
                  WebkitTapHighlightColor: "transparent",
                  transition: "background 150ms",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#FEECEC")}
                onMouseLeave={e => (e.currentTarget.style.background = km.beige)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={onClear}
            style={{
              background: km.white, color: km.ink, border: `1px solid ${km.line}`,
              borderRadius: 999, padding: "9px 16px", fontWeight: 600, fontSize: 11,
              textTransform: "uppercase", letterSpacing: "0.6px",
              cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
              WebkitTapHighlightColor: "transparent",
            }}
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
              borderRadius: 999, padding: "10px 22px", fontWeight: 700, fontSize: 11,
              textTransform: "uppercase", letterSpacing: "0.6px",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.5 : 1,
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
