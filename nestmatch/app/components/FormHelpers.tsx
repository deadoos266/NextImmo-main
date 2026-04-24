"use client"

/**
 * Helpers de formulaire partagés entre /profil, /proprietaire/ajouter,
 * /proprietaire/modifier et autres pages avec formulaires structurés.
 *
 * IMPORTANT : ces composants sont définis dans un module séparé (pas hors
 * du composant appelant) → sûrs vis-à-vis du bug historique « perte de focus
 * sur inputs » documenté dans MEMORY.md (helpers réinitialisés à chaque
 * render si déclarés dedans).
 *
 * Alignés sur le design handoff éditorial KM (km.tsx) :
 * - Sec = carte blanche bordée beige, h2 Fraunces italic
 * - F = label uppercase tracked 10px
 * - Toggle = switch noir/blanc bordure KM
 */

import { ReactNode } from "react"
import { km, KMHeading } from "./ui/km"

/** Ligne de toggle (label + switch) pilotée par une map d'états `toggles` et un setter.
 *  Types volontairement larges pour accepter n'importe quel state object avec clés booléennes. */
export function Toggle({
  label,
  k,
  toggles,
  setToggles,
}: {
  label: ReactNode
  k: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toggles: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setToggles: (fn: (t: any) => any) => void
}) {
  const on = !!toggles[k]
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <span style={{ fontSize: 14, fontWeight: 500, color: km.ink }}>{label}</span>
      <div
        role="switch"
        aria-checked={on}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onClick={() => setToggles((t: any) => ({ ...t, [k]: !t[k] }))}
        style={{
          width: 44,
          height: 24,
          borderRadius: 999,
          background: on ? km.ink : km.line,
          cursor: "pointer",
          position: "relative",
          transition: "background 0.2s",
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: km.white,
            position: "absolute",
            top: 3,
            left: on ? 23 : 3,
            transition: "left 0.2s",
            boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
          }}
        />
      </div>
    </div>
  )
}

/** Section carte blanche avec titre h2. Utilisé pour grouper des champs de formulaire.
 *
 *  Props optionnelles (backward-compat):
 *  - `id`     → attribut DOM id pour ancre TOC + IntersectionObserver (R10.3)
 *  - `footer` → zone rendue en bas (typiquement bouton « Enregistrer cette section »)
 */
export function Sec({
  t, children, id, footer,
}: {
  t: ReactNode
  children: ReactNode
  id?: string
  footer?: ReactNode
}) {
  return (
    <section id={id} style={{
      background: km.white,
      border: `1px solid ${km.line}`,
      borderRadius: 20,
      padding: 28,
      marginBottom: 20,
      boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
      scrollMarginTop: 96,
    }}>
      <KMHeading as="h2" size={22} style={{ marginBottom: 20 }}>{t}</KMHeading>
      {children}
      {footer && <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${km.beige}`, display: "flex", justifyContent: "flex-end" }}>{footer}</div>}
    </section>
  )
}

/** Champ de formulaire avec label — label style éditorial uppercase tracked 10 px. */
export function F({ l, children }: { l: ReactNode; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        fontSize: 10,
        fontWeight: 700,
        color: km.muted,
        display: "block",
        marginBottom: 8,
        textTransform: "uppercase",
        letterSpacing: "1.4px",
      }}>{l}</label>
      {children}
    </div>
  )
}
