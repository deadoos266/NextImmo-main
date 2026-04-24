"use client"

/**
 * StepBar — primitive partagée pour les wizards multi-étapes.
 * Utilisée par /profil/creer et /proprietaire/ajouter (refacto R10).
 *
 * Pattern « handoff Claude Design » : une pill par étape, avec état
 * done (check) / current (encre) / future (gris). Barre de progression
 * fine en dessous. Respecte cubic-bezier(0.4,0,0.2,1) + prefers-reduced-motion.
 */

import { km } from "./km"

export type StepDef = {
  n: number
  /** Label affiché à droite de la pill (masqué sur mobile). */
  label: string
}

export function StepBar({
  steps,
  current,
  isMobile,
  onStepClick,
}: {
  steps: readonly StepDef[]
  current: number
  isMobile: boolean
  /**
   * Si fourni, les étapes déjà franchies deviennent cliquables pour revenir
   * en arrière sans casser la validation. Les étapes futures restent figées.
   */
  onStepClick?: (n: number) => void
}) {
  const total = steps.length
  const pct = Math.round((current / total) * 100)
  return (
    <div style={{ marginBottom: isMobile ? 24 : 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {steps.map(s => {
            const state: "done" | "current" | "future" = s.n < current ? "done" : s.n === current ? "current" : "future"
            const bg = state === "future" ? km.line : km.ink
            const color = state === "future" ? km.muted : km.white
            const clickable = onStepClick && s.n < current
            const pillContent = (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: state === "current" ? km.beige : "transparent",
                  border: state === "current" ? `1px solid ${km.ink}` : "1px solid transparent",
                  padding: "4px 10px 4px 4px",
                  borderRadius: 999,
                }}
              >
                <span
                  style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: bg, color,
                    fontSize: 11, fontWeight: 700,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "inherit",
                  }}
                >
                  {state === "done" ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : s.n}
                </span>
                {!isMobile && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: state === "future" ? km.muted : km.ink, textTransform: "uppercase", letterSpacing: "1.2px" }}>
                    {s.label}
                  </span>
                )}
              </span>
            )
            if (clickable) {
              return (
                <button
                  key={s.n}
                  type="button"
                  onClick={() => onStepClick(s.n)}
                  aria-label={`Revenir à l'étape ${s.n} : ${s.label}`}
                  style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}
                >
                  {pillContent}
                </button>
              )
            }
            return (
              <span
                key={s.n}
                aria-current={state === "current" ? "step" : undefined}
              >
                {pillContent}
              </span>
            )
          })}
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.2px" }}>
          {pct}%
        </span>
      </div>
      <div style={{ background: km.line, borderRadius: 999, height: 4, overflow: "hidden" }}>
        <div
          style={{
            background: km.ink,
            borderRadius: 999,
            height: "100%",
            width: `${pct}%`,
            transition: "width 320ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      </div>
    </div>
  )
}
