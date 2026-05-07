"use client"

// V8 (Paul 2026-04-28) — Design system local au profil pour matcher /dossier
// pixel-perfect sans toucher /dossier (le user adore le design dossier, on
// l'imite mais on ne MODIFIE PAS l'original).
//
// Palette + tokens copies fideles de app/dossier/page.tsx const T + STYLES.
// Composants Section/Field/Hero/Chip/RockerToggle pour reuse dans /profil.

import type { CSSProperties, ReactNode } from "react"

export const T = {
  bg: "#F7F4EF",
  ink: "#111",
  white: "#fff",
  line: "#EAE6DF",
  hairline: "#F0EAE0",
  meta: "#666",
  soft: "#8a8477",
  mutedBg: "#FAF8F3",
  success: "#15803d",
  warning: "#a16207",
  danger: "#b91c1c",
  successBg: "#F0FAEE",
  successLine: "#C6E9C0",
  warningBg: "#FBF6EA",
} as const

export const TOKENS = {
  main: { minHeight: "100vh", background: T.bg, fontFamily: "'DM Sans', sans-serif", paddingBottom: 48 } as CSSProperties,
  container: (isMobile: boolean): CSSProperties => ({
    maxWidth: 1240, margin: "0 auto", padding: isMobile ? "24px 16px" : "40px 40px",
  }),
}

// ── HERO éditorial ─────────────────────────────────────────────────────────
export function DossierHero({
  eyebrow,
  metaRight,
  title,
  titleAccent,
  subtitle,
  isMobile,
  rightSlot,
}: {
  eyebrow: string
  metaRight?: ReactNode
  title: ReactNode
  titleAccent?: ReactNode
  subtitle?: ReactNode
  isMobile: boolean
  rightSlot?: ReactNode
}) {
  return (
    <section style={{ padding: isMobile ? "8px 0 12px" : "0 0 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "2.2px", textTransform: "uppercase", color: T.meta }}>
          {eyebrow}
        </span>
        <span style={{ flex: 1, height: 1, background: T.line, maxWidth: 220, minWidth: 40 }} aria-hidden="true" />
        {metaRight && (
          <span style={{ fontSize: 11, color: T.soft, fontVariantNumeric: "tabular-nums" }}>
            {metaRight}
          </span>
        )}
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : (rightSlot ? "1.4fr 1fr" : "1fr"),
        gap: isMobile ? 28 : 40,
        alignItems: "end",
      }}>
        <div>
          <h1 style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontFeatureSettings: "'ss01'",
            fontSize: isMobile ? 48 : 88,
            fontWeight: 300,
            lineHeight: 0.95,
            letterSpacing: isMobile ? "-1.5px" : "-2px",
            margin: 0,
            color: T.ink,
          }}>
            {title}
            {titleAccent && (
              <>
                <br />
                <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontFeatureSettings: "'ss01'", fontStyle: "italic", fontWeight: 300, color: T.meta }}>
                  {titleAccent}
                </span>
              </>
            )}
          </h1>
          {subtitle && (
            <p style={{ fontSize: 15, color: T.meta, lineHeight: 1.6, maxWidth: 520, marginTop: 22, marginBottom: 0 }}>
              {subtitle}
            </p>
          )}
        </div>
        {rightSlot}
      </div>
    </section>
  )
}

// ── SCORE CARD (style hero side) ────────────────────────────────────────────
export function DossierScoreCard({
  eyebrow,
  number,
  suffix,
  label,
  divider,
  alert,
  isMobile,
}: {
  eyebrow: string
  number: number | string
  suffix?: string
  label?: string
  divider?: ReactNode
  alert?: { title: string; body: string; tone?: "warn" | "success" }
  isMobile: boolean
}) {
  return (
    <div style={{
      position: "relative",
      background: T.white,
      borderRadius: 24,
      padding: isMobile ? "22px 22px" : "28px 32px",
      boxShadow: "0 1px 0 #ebe4d6, 0 30px 60px -30px rgba(0,0,0,0.10)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.6px", textTransform: "uppercase", color: T.soft, marginBottom: 4 }}>
            {eyebrow}
          </div>
          <div style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontFeatureSettings: "'ss01'",
            fontSize: 76,
            fontWeight: 300,
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-3px",
            color: T.ink,
          }}>
            {number}
            {suffix && <span style={{ fontSize: 36, marginLeft: 2 }}>{suffix}</span>}
          </div>
          {label && (
            <div style={{ fontSize: 13, color: T.ink, marginTop: 6, fontWeight: 600 }}>
              {label}
            </div>
          )}
        </div>
      </div>
      {divider && (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${T.hairline}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {divider}
        </div>
      )}
      {alert && (
        <div style={{ marginTop: 16, padding: "10px 12px", background: alert.tone === "success" ? T.successBg : T.warningBg, borderRadius: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: alert.tone === "success" ? T.success : T.warning }}>
            {alert.title}
          </div>
          <div style={{ fontSize: 13, color: "#333", marginTop: 2 }}>
            {alert.body}
          </div>
        </div>
      )}
    </div>
  )
}

// ── SECTION éditoriale ─────────────────────────────────────────────────────
export function DossierSection({
  num,
  kicker,
  subtitle,
  title,
  children,
  footer,
  id,
  isMobile,
}: {
  num: string
  kicker: string
  subtitle?: string
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  id?: string
  isMobile: boolean
}) {
  return (
    <section
      id={id}
      style={{
        background: T.white,
        borderRadius: 24,
        padding: isMobile ? "22px 20px 24px" : "30px 32px 32px",
        boxShadow: "0 1px 0 #ebe4d6",
        scrollMarginTop: 96,
      }}
    >
      <header style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 16, fontStyle: "italic", color: T.soft, fontVariantNumeric: "tabular-nums", fontWeight: 400 }}>
            {num}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.8px", textTransform: "uppercase", color: T.soft }}>
            {kicker}
          </span>
          <span style={{ flex: 1, height: 1, background: T.hairline, minWidth: 20 }} aria-hidden="true" />
          {subtitle && (
            <span style={{ fontSize: 11.5, color: T.soft }}>{subtitle}</span>
          )}
        </div>
        <h2 style={{
          fontSize: isMobile ? 24 : 28,
          fontWeight: 500,
          margin: "0",
          color: T.ink,
          letterSpacing: "-0.4px",
        }}>
          {title}
        </h2>
      </header>
      {children}
      {footer && (
        <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${T.hairline}`, display: "flex", justifyContent: "flex-end" }}>
          {footer}
        </div>
      )}
    </section>
  )
}

// ── FIELD éditorial ─────────────────────────────────────────────────────────
export function DossierField({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{
        display: "block",
        fontSize: 11,
        fontWeight: 700,
        color: T.soft,
        marginBottom: 8,
        textTransform: "uppercase",
        letterSpacing: "1.4px",
      }}>
        {label}
      </label>
      {children}
    </div>
  )
}

export function dossierInputStyle(isMobile: boolean): CSSProperties {
  return {
    width: "100%",
    padding: "11px 14px",
    border: `1px solid ${T.line}`,
    borderRadius: 10,
    fontSize: isMobile ? 16 : 14,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
    background: T.white,
    color: T.ink,
    fontVariantNumeric: "tabular-nums",
  }
}

// ── CHIP (radio chip pill style) ───────────────────────────────────────────
export function DossierChip({
  active,
  onClick,
  children,
  tone,
  ariaPressed,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  tone?: "default" | "success" | "info" | "warn" | "danger"
  ariaPressed?: boolean
}) {
  const toneColor =
    tone === "success" ? T.success :
    tone === "info" ? "#0ea5e9" :
    tone === "warn" ? T.warning :
    tone === "danger" ? T.danger :
    T.ink
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ariaPressed ?? active}
      style={{
        // V10.3 — minHeight 44 pour atteindre tap target WCAG/Apple HIG.
        minHeight: 44,
        padding: "10px 16px",
        borderRadius: 999,
        border: `1px solid ${active ? toneColor : T.line}`,
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 13,
        fontWeight: 600,
        background: active ? toneColor : T.mutedBg,
        color: active ? T.white : "#333",
        transition: "all 0.15s",
        whiteSpace: "nowrap",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
      }}
    >
      {children}
    </button>
  )
}

// ── ROCKER TOGGLE ───────────────────────────────────────────────────────────
export function DossierToggle({
  checked,
  onChange,
  label,
  subText,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: ReactNode
  subText?: ReactNode
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        cursor: "pointer",
        padding: "12px 14px",
        background: checked ? T.successBg : T.mutedBg,
        borderRadius: 12,
        border: `1px solid ${checked ? T.successLine : T.hairline}`,
        transition: "all 0.15s",
      }}
    >
      <span style={{
        position: "relative",
        width: 36,
        height: 22,
        background: checked ? T.success : "#D9D2C4",
        borderRadius: 999,
        flexShrink: 0,
        marginTop: 1,
        transition: "background 0.2s",
      }}>
        <span style={{
          position: "absolute",
          top: 2,
          left: checked ? 16 : 2,
          width: 18,
          height: 18,
          background: T.white,
          borderRadius: "50%",
          transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }} />
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, color: T.ink, fontWeight: 600 }}>{label}</span>
        {subText && (
          <span style={{ display: "block", fontSize: 11.5, color: T.soft, marginTop: 2, lineHeight: 1.4 }}>{subText}</span>
        )}
      </span>
    </label>
  )
}

// ── SAVE BUTTON cohérent dossier ───────────────────────────────────────────
export function DossierSaveBtn({
  state,
  onClick,
  children,
}: {
  state: "idle" | "saving" | "saved"
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === "saving"}
      style={{
        background: state === "saving" ? "#8a8477" : state === "saved" ? T.success : T.ink,
        color: T.white,
        border: "none",
        borderRadius: 999,
        // V10.3 — minHeight 44 + padding adapte pour tap target
        minHeight: 44,
        padding: "12px 22px",
        fontWeight: 700,
        fontSize: 13,
        cursor: state === "saving" ? "not-allowed" : "pointer",
        fontFamily: "'DM Sans', sans-serif",
        letterSpacing: 0,
        whiteSpace: "nowrap",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
      }}
    >
      {children}
    </button>
  )
}
