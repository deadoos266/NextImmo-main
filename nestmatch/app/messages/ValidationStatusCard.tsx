"use client"

// V11.17 (Paul 2026-04-28) — composant unifié pour les status events système
// dans le thread /messages. Remplace les 4 cards inline divergentes :
// CandidatureValideeCard, CandidatureDevalideeCard, CandidatureRetireeCard,
// CandidatureNonRetenueCard.
//
// Grammaire commune : eyebrow couleur tier (✓/↩/×) + body wrap propre + date
// discrete bottom. Refined design : icon dans pastille colorée, body avec
// strong sur mots cles, animation slide-up subtile au mount.
//
// Mobile-first : padding adapté (12px mobile / 14px desktop), max-width: 100%
// + box-sizing border-box defensif, body avec overflowWrap: anywhere fallback,
// header (eyebrow+heure) flex-wrap pour permettre stack < 320px.

import type { ReactNode } from "react"

export type ValidationStatusKind = "success" | "warning" | "danger" | "info"

const KIND_TOKENS: Record<ValidationStatusKind, {
  bg: string
  border: string
  ink: string
  iconBg: string
}> = {
  success: { bg: "#F0FAEE", border: "#C6E9C0", ink: "#15803d", iconBg: "#DCF5E4" },
  warning: { bg: "#FBF6EA", border: "#EADFC6", ink: "#a16207", iconBg: "#F5E9CC" },
  danger:  { bg: "#FEECEC", border: "#F4C9C9", ink: "#b91c1c", iconBg: "#F8DADA" },
  info:    { bg: "#F7F4EF", border: "#EAE6DF", ink: "#6b6559", iconBg: "#EFEAE0" },
}

// Icônes inline SVG, 14×14 — choisies en cohérence avec le sens du status.
function StatusIcon({ kind }: { kind: ValidationStatusKind }) {
  const t = KIND_TOKENS[kind]
  if (kind === "success") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={t.ink} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="20 6 9 17 4 12" />
      </svg>
    )
  }
  if (kind === "warning") {
    // Arrow-uturn-left : "retiré / annulé / en attente"
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={t.ink} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 14L4 9l5-5" />
        <path d="M4 9h11a5 5 0 0 1 0 10h-2" />
      </svg>
    )
  }
  if (kind === "danger") {
    // X : "refusé / annulé"
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={t.ink} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    )
  }
  // info — info-circle
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={t.ink} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <line x1="12" y1="8" x2="12" y2="8" />
    </svg>
  )
}

interface Props {
  kind: ValidationStatusKind
  eyebrow: string
  body: ReactNode
  date?: string
  cta?: ReactNode
  /**
   * Petit slot complémentaire affiché entre body et date (callout secondaire).
   * Utilisé par exemple pour la note de bas verte ("Le candidat peut désormais...").
   */
  hint?: ReactNode
}

export function ValidationStatusCard({ kind, eyebrow, body, date, cta, hint }: Props) {
  const t = KIND_TOKENS[kind]
  return (
    <div
      role="status"
      style={{
        background: t.bg,
        border: `1px solid ${t.border}`,
        borderRadius: 16,
        padding: "13px 14px",
        // Mobile-first defensif : zero overflow horizontal possible.
        boxSizing: "border-box",
        width: "100%",
        maxWidth: 360,
        minWidth: 0,
        fontFamily: "'DM Sans', sans-serif",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        // Animation au mount (slide-up + fade-in).
        animation: "km-status-card-in 260ms ease-out",
      }}
    >
      <style>{`
        @keyframes km-status-card-in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
          flexWrap: "wrap",
          minWidth: 0,
        }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: t.iconBg,
            flexShrink: 0,
          }}
        >
          <StatusIcon kind={kind} />
        </span>
        <p
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: t.ink,
            textTransform: "uppercase",
            letterSpacing: "1.1px",
            margin: 0,
            overflowWrap: "anywhere",
            wordBreak: "break-word",
            lineHeight: 1.3,
            minWidth: 0,
          }}
        >
          {eyebrow}
        </p>
      </div>
      <p
        style={{
          fontSize: 13.5,
          color: "#111",
          margin: 0,
          lineHeight: 1.5,
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        {body}
      </p>
      {hint && (
        <p
          style={{
            fontSize: 12,
            color: t.ink,
            margin: "8px 0 0",
            lineHeight: 1.45,
            overflowWrap: "anywhere",
            wordBreak: "break-word",
          }}
        >
          {hint}
        </p>
      )}
      {cta && <div style={{ marginTop: 12 }}>{cta}</div>}
      {date && (
        <p
          style={{
            fontSize: 11,
            color: "#8a8477",
            margin: "8px 0 0",
            fontStyle: "italic",
            fontFamily: "'Fraunces', Georgia, serif",
            fontWeight: 400,
            letterSpacing: "0.2px",
          }}
        >
          {date}
        </p>
      )}
    </div>
  )
}

export default ValidationStatusCard
