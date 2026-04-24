"use client"

/**
 * Helpers de formulaire partagés entre /profil, /proprietaire/ajouter,
 * /proprietaire/modifier et autres pages avec formulaires structurés.
 *
 * IMPORTANT : ces composants sont définis dans un module séparé (pas hors
 * du composant appelant) → sûrs vis-à-vis du bug historique « perte de focus
 * sur inputs » documenté dans MEMORY.md (helpers réinitialisés à chaque
 * render si déclarés dedans).
 */

import { ReactNode } from "react"

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
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span>
      <div
        role="switch"
        aria-checked={!!toggles[k]}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onClick={() => setToggles((t: any) => ({ ...t, [k]: !t[k] }))}
        style={{
          width: 44,
          height: 24,
          borderRadius: 999,
          background: toggles[k] ? "#111" : "#EAE6DF",
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
            background: "white",
            position: "absolute",
            top: 3,
            left: toggles[k] ? 23 : 3,
            transition: "left 0.2s",
            boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
          }}
        />
      </div>
    </div>
  )
}

/** Section carte blanche avec titre h2. Utilisé pour grouper des champs de formulaire. */
export function Sec({ t, children }: { t: ReactNode; children: ReactNode }) {
  return (
    <div style={{ background: "white", borderRadius: 20, padding: 28, marginBottom: 20 }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 20 }}>{t}</h2>
      {children}
    </div>
  )
}

/** Champ de formulaire avec label. */
export function F({ l, children }: { l: ReactNode; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: "#8a8477", display: "block", marginBottom: 6 }}>{l}</label>
      {children}
    </div>
  )
}
