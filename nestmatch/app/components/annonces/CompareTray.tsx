"use client"

import { km } from "../ui/km"

/**
 * CompareTray — barre sticky bas d'écran listant les annonces cochées
 * "Comparer" sur /annonces (R10.2b). Max 3 annonces (contrainte handoff).
 *
 * Affiche :
 *  - N chips avec aperçu titre + ville + loyer (click = retirer de la compare)
 *  - CTA "Comparer (N)" → navigue vers /annonces/comparer?ids=...
 *  - Bouton "Vider" → reset
 *
 * Rendue uniquement si compareIds.length >= 1. Zero-state = pas de tray.
 * Position fixed, z-index 7500 pour flotter au-dessus de la Navbar (7000).
 */
export interface CompareTrayProps {
  items: Array<{ id: number; titre: string | null; ville: string | null; prix: number | null }>
  onRemove: (id: number) => void
  onClear: () => void
  onCompare: () => void
  max: number
}

export default function CompareTray({ items, onRemove, onClear, onCompare, max }: CompareTrayProps) {
  if (items.length === 0) return null
  const disabled = items.length < 2

  return (
    <div
      role="region"
      aria-label="Comparateur d'annonces"
      style={{
        position: "fixed",
        left: 12, right: 12, bottom: 12,
        zIndex: 7500,
        background: km.white,
        border: `1px solid ${km.line}`,
        borderRadius: 20,
        boxShadow: "0 18px 48px rgba(17,17,17,0.14)",
        padding: "14px 18px",
        display: "flex", alignItems: "center", gap: 14,
        flexWrap: "wrap",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        maxWidth: 1100, margin: "0 auto",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.4px" }}>
          À comparer
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: km.ink }}>
          {items.length}/{max}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
        {items.map(it => (
          <span
            key={it.id}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: km.beige, border: `1px solid ${km.line}`,
              borderRadius: 999, padding: "5px 6px 5px 12px",
              fontSize: 12, fontWeight: 500, color: km.ink,
              maxWidth: 260, minWidth: 0,
            }}
          >
            <span
              style={{
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                minWidth: 0, flex: 1,
              }}
              title={`${it.titre || "Annonce"}${it.ville ? ` — ${it.ville}` : ""}`}
            >
              {it.titre || "Annonce"}
              {it.prix != null && (
                <span style={{ color: km.muted, fontWeight: 500, marginLeft: 6 }}>
                  · {it.prix.toLocaleString("fr-FR")} €
                </span>
              )}
            </span>
            <button
              type="button"
              aria-label={`Retirer ${it.titre || "l'annonce"} du comparateur`}
              onClick={() => onRemove(it.id)}
              style={{
                background: km.white, border: `1px solid ${km.line}`,
                borderRadius: "50%", width: 22, height: 22,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", flexShrink: 0, color: km.ink, fontFamily: "inherit",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </span>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          onClick={onClear}
          style={{
            background: km.white, color: km.ink, border: `1px solid ${km.line}`,
            borderRadius: 999, padding: "8px 16px", fontWeight: 600, fontSize: 11,
            textTransform: "uppercase", letterSpacing: "0.6px",
            cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
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
            borderRadius: 999, padding: "9px 20px", fontWeight: 700, fontSize: 11,
            textTransform: "uppercase", letterSpacing: "0.6px",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.5 : 1,
            fontFamily: "inherit", whiteSpace: "nowrap",
          }}
        >
          Comparer ({items.length})
        </button>
      </div>
    </div>
  )
}
