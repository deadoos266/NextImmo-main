"use client"

/**
 * Primitives UI « KeyMatch » alignées sur le handoff Claude Design.
 * Composants atomiques réutilisables partout où la cohérence visuelle
 * compte — boutons, chips, badges, eyebrows, match ring, DPE tag, count.
 *
 * Pas de dépendance CSS, uniquement des inline styles (convention KeyMatch).
 * Définis ici plutôt que par page pour éviter la divergence progressive.
 */

import { CSSProperties, ReactNode, MouseEventHandler } from "react"

// ─── Palette (source de vérité) ────────────────────────────────────────────
export const km = {
  beige: "#F7F4EF",
  ink: "#111",
  muted: "#8a8477",
  line: "#EAE6DF",
  white: "#ffffff",
  // Accents sémantiques — variant « warm » shippée (voir ContactButton etc.)
  successBg: "#F0FAEE",
  successLine: "#C6E9C0",
  successText: "#15803d",
  warnBg: "#FBF6EA",
  warnLine: "#EADFC6",
  warnText: "#a16207",
  errBg: "#FEECEC",
  errLine: "#F4C9C9",
  errText: "#b91c1c",
  infoBg: "#EEF3FB",
  infoLine: "#D7E3F4",
  infoText: "#1d4ed8",
} as const

// ─── Button : pilule noire, principale ─────────────────────────────────────
export function KMButton({
  children,
  onClick,
  disabled,
  type = "button",
  size = "md",
  style,
  ariaLabel,
}: {
  children: ReactNode
  onClick?: MouseEventHandler<HTMLButtonElement>
  disabled?: boolean
  type?: "button" | "submit" | "reset"
  size?: "sm" | "md" | "lg"
  style?: CSSProperties
  ariaLabel?: string
}) {
  const pad = size === "sm" ? "8px 18px" : size === "lg" ? "16px 36px" : "12px 26px"
  const font = size === "sm" ? 10 : size === "lg" ? 13 : 11
  return (
    <button type={type} onClick={onClick} disabled={disabled} aria-label={ariaLabel}
      style={{
        background: km.ink, color: km.white, border: "none",
        borderRadius: 999, padding: pad,
        fontWeight: 700, fontSize: font,
        textTransform: "uppercase", letterSpacing: "0.6px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        fontFamily: "inherit",
        whiteSpace: "nowrap",
        ...style,
      }}>
      {children}
    </button>
  )
}

// ─── Button : pilule outline, secondaire ───────────────────────────────────
export function KMButtonOutline({
  children,
  onClick,
  disabled,
  type = "button",
  size = "md",
  style,
  ariaLabel,
}: {
  children: ReactNode
  onClick?: MouseEventHandler<HTMLButtonElement>
  disabled?: boolean
  type?: "button" | "submit" | "reset"
  size?: "sm" | "md" | "lg"
  style?: CSSProperties
  ariaLabel?: string
}) {
  const pad = size === "sm" ? "7px 17px" : size === "lg" ? "15px 35px" : "11px 25px"
  const font = size === "sm" ? 10 : size === "lg" ? 13 : 11
  return (
    <button type={type} onClick={onClick} disabled={disabled} aria-label={ariaLabel}
      style={{
        background: km.white, color: km.ink, border: `1px solid ${km.ink}`,
        borderRadius: 999, padding: pad,
        fontWeight: 600, fontSize: font,
        textTransform: "uppercase", letterSpacing: "0.6px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        fontFamily: "inherit",
        whiteSpace: "nowrap",
        ...style,
      }}>
      {children}
    </button>
  )
}

// ─── Button : link-style noir, tertiaire ───────────────────────────────────
export function KMButtonText({
  children,
  onClick,
  style,
}: {
  children: ReactNode
  onClick?: MouseEventHandler<HTMLButtonElement>
  style?: CSSProperties
}) {
  return (
    <button type="button" onClick={onClick}
      style={{
        background: "transparent", color: km.ink, border: "none",
        padding: "8px 4px",
        fontWeight: 700, fontSize: 11,
        textTransform: "uppercase", letterSpacing: "0.6px",
        cursor: "pointer",
        fontFamily: "inherit",
        textDecoration: "underline",
        textUnderlineOffset: 4,
        ...style,
      }}>
      {children}
    </button>
  )
}

// ─── Eyebrow : étiquette de section 10–12 px uppercase tracked ─────────────
export function KMEyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 700, color: km.muted,
      textTransform: "uppercase", letterSpacing: "1.6px",
      margin: 0,
      ...style,
    }}>{children}</p>
  )
}

// ─── Heading éditorial Fraunces italic ─────────────────────────────────────
export function KMHeading({
  children,
  size = 32,
  as: Tag = "h1",
  style,
}: {
  children: ReactNode
  size?: number
  as?: "h1" | "h2" | "h3"
  style?: CSSProperties
}) {
  return (
    <Tag style={{
      fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif",
      fontStyle: "italic",
      fontWeight: 500,
      fontSize: size,
      letterSpacing: "-0.5px",
      color: km.ink,
      margin: 0,
      lineHeight: 1.15,
      ...style,
    }}>{children}</Tag>
  )
}

// ─── Chip : tag ronde type « Meublé · Balcon » ─────────────────────────────
export function KMChip({
  children,
  removable,
  onRemove,
  variant = "neutral",
  style,
}: {
  children: ReactNode
  removable?: boolean
  onRemove?: () => void
  variant?: "neutral" | "ink" | "success" | "warn" | "err" | "info"
  style?: CSSProperties
}) {
  const cfg = {
    neutral: { bg: km.white, color: km.ink, border: km.line },
    ink: { bg: km.ink, color: km.white, border: km.ink },
    success: { bg: km.successBg, color: km.successText, border: km.successLine },
    warn: { bg: km.warnBg, color: km.warnText, border: km.warnLine },
    err: { bg: km.errBg, color: km.errText, border: km.errLine },
    info: { bg: km.infoBg, color: km.infoText, border: km.infoLine },
  }[variant]
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.border}`,
      padding: removable ? "4px 6px 4px 12px" : "4px 12px",
      borderRadius: 999, fontSize: 11, fontWeight: 700,
      textTransform: "uppercase", letterSpacing: "1px",
      lineHeight: 1.4,
      ...style,
    }}>
      {children}
      {removable && (
        <button type="button" aria-label="Retirer" onClick={onRemove}
          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, width: 18, height: 18, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", color: cfg.color, fontSize: 14, lineHeight: 1, fontFamily: "inherit" }}>
          ×
        </button>
      )}
    </span>
  )
}

// ─── Badge : indicateur compact (Dispo, Nouveau, À venir, etc.) ────────────
export function KMBadge({
  children,
  variant = "neutral",
  style,
}: {
  children: ReactNode
  variant?: "neutral" | "ink" | "success" | "warn" | "err" | "info"
  style?: CSSProperties
}) {
  const cfg = {
    neutral: { bg: km.beige, color: km.muted, border: km.line },
    ink: { bg: km.ink, color: km.white, border: km.ink },
    success: { bg: km.successBg, color: km.successText, border: km.successLine },
    warn: { bg: km.warnBg, color: km.warnText, border: km.warnLine },
    err: { bg: km.errBg, color: km.errText, border: km.errLine },
    info: { bg: km.infoBg, color: km.infoText, border: km.infoLine },
  }[variant]
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.border}`,
      padding: "3px 10px",
      borderRadius: 999, fontSize: 9, fontWeight: 700,
      textTransform: "uppercase", letterSpacing: "1.3px",
      lineHeight: 1.4,
      ...style,
    }}>{children}</span>
  )
}

// ─── Anneau de match conique ( score 0–100 ) ───────────────────────────────
export function KMMatchRing({
  score,
  size = 56,
}: {
  score: number
  size?: number
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  const color = clamped >= 80 ? km.successText : clamped >= 50 ? km.warnText : km.errText
  const trackSize = size
  const innerSize = size - 12
  return (
    <div style={{
      width: trackSize, height: trackSize, borderRadius: "50%",
      background: `conic-gradient(${color} ${clamped * 3.6}deg, ${km.line} 0)`,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: innerSize, height: innerSize, borderRadius: "50%",
        background: km.white,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif",
        fontStyle: "italic", fontWeight: 500,
        fontSize: Math.round(size * 0.32),
        color: km.ink,
        letterSpacing: "-0.5px",
      }}>{clamped}%</div>
    </div>
  )
}

// ─── Tag DPE : lbl + val side-by-side ──────────────────────────────────────
export function KMDPE({
  value,
}: {
  value: "A" | "B" | "C" | "D" | "E" | "F" | "G" | string
}) {
  const colors: Record<string, string> = {
    A: "#1b9e50", B: "#5dbf5a", C: "#b8d13a",
    D: "#f6c344", E: "#f6963c", F: "#e26a3b", G: "#c9372a",
  }
  const bg = colors[value] || km.muted
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 0, border: `1px solid ${km.line}`, borderRadius: 8, overflow: "hidden", fontSize: 10, fontWeight: 700 }}>
      <span style={{ background: km.white, color: km.muted, padding: "4px 8px", textTransform: "uppercase", letterSpacing: "1px" }}>DPE</span>
      <span style={{ background: bg, color: km.white, padding: "4px 10px", letterSpacing: "0.5px" }}>{value}</span>
    </span>
  )
}

// ─── Compteur rouge (notifications) ────────────────────────────────────────
export function KMCount({ n, style }: { n: number; style?: CSSProperties }) {
  if (n <= 0) return null
  const display = n > 99 ? "99+" : n.toString()
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: km.errText, color: km.white,
      minWidth: 18, height: 18, padding: "0 5px",
      borderRadius: 999, fontSize: 10, fontWeight: 800,
      fontFamily: "inherit",
      ...style,
    }}>{display}</span>
  )
}

// ─── Card : conteneur blanc radius 20 avec bordure beige ──────────────────
export function KMCard({
  children,
  padding = 26,
  style,
}: {
  children: ReactNode
  padding?: number | string
  style?: CSSProperties
}) {
  return (
    <div style={{
      background: km.white,
      border: `1px solid ${km.line}`,
      borderRadius: 20,
      padding,
      boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
      ...style,
    }}>{children}</div>
  )
}
