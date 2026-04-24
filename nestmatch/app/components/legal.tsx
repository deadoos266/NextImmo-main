/**
 * Primitives éditoriales pour les pages légales (CGU, confidentialité,
 * cookies, mentions légales, contact, estimateur, etc.).
 *
 * Centralise le shell layout + les styles de section pour que toutes
 * les pages à contenu long partagent la même sobriété KM (beige, cartes
 * bordées, h2 Fraunces italic, liens ink+underline).
 */

import Link from "next/link"
import type { ReactNode, CSSProperties } from "react"
import { km, KMCard, KMEyebrow, KMHeading } from "./ui/km"

/** Styles partagés — centralisés pour éviter la divergence progressive. */
export const legalStyles = {
  backLink: {
    fontSize: 10, color: km.muted, textDecoration: "none",
    textTransform: "uppercase", letterSpacing: "1.4px", fontWeight: 700,
  } as CSSProperties,
  subtitle: {
    fontSize: 11, color: km.muted, margin: "0 0 28px",
    textTransform: "uppercase", letterSpacing: "1.2px", fontWeight: 600,
  } as CSSProperties,
  p: {
    fontSize: 14, color: "#3f3c37", lineHeight: 1.75, marginBottom: 10,
  } as CSSProperties,
  li: {
    fontSize: 14, color: "#3f3c37", lineHeight: 1.85,
  } as CSSProperties,
  ul: {
    paddingLeft: 20, margin: "4px 0 10px",
  } as CSSProperties,
  todo: {
    color: km.warnText, fontWeight: 700,
    background: km.warnBg, padding: "1px 6px", borderRadius: 4,
  } as CSSProperties,
  link: {
    color: km.ink, fontWeight: 600,
    textDecoration: "underline", textUnderlineOffset: 3,
  } as CSSProperties,
  strong: {
    color: km.ink, fontWeight: 700,
  } as CSSProperties,
}

/** Shell principal des pages légales. Back link + header. */
export function LegalMain({
  eyebrow,
  title,
  subtitle,
  maxWidth = 820,
  children,
}: {
  eyebrow: string
  title: ReactNode
  subtitle?: ReactNode
  maxWidth?: number
  children: ReactNode
}) {
  return (
    <main style={{
      minHeight: "100vh",
      background: km.beige,
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      padding: "40px 20px",
    }}>
      <div style={{ maxWidth, margin: "0 auto" }}>
        <Link href="/" style={legalStyles.backLink}>← Retour à l&apos;accueil</Link>

        <div style={{ margin: "22px 0 28px" }}>
          <KMEyebrow style={{ marginBottom: 10 }}>{eyebrow}</KMEyebrow>
          <KMHeading as="h1" size={38} style={{ marginBottom: subtitle ? 8 : 0 }}>{title}</KMHeading>
          {subtitle && (
            <p style={legalStyles.subtitle}>{subtitle}</p>
          )}
        </div>

        {children}
      </div>
    </main>
  )
}

/** Section = carte blanche bordée beige avec h2 éditorial Fraunces italic. */
export function LegalSec({
  title,
  children,
  style,
}: {
  title: ReactNode
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <div style={{ marginBottom: 16, ...style }}>
      <KMCard padding="28px 32px">
        <KMHeading as="h2" size={20} style={{ marginBottom: 14 }}>{title}</KMHeading>
        {children}
      </KMCard>
    </div>
  )
}

/** Bannière d'avertissement (ex : "Note : cette page sera finalisée…"). */
export function LegalNotice({ children }: { children: ReactNode }) {
  return (
    <div style={{
      background: km.warnBg,
      border: `1px solid ${km.warnLine}`,
      borderRadius: 14,
      padding: "14px 18px",
      marginBottom: 20,
    }}>
      <p style={{ fontSize: 13, color: km.warnText, margin: 0, lineHeight: 1.6 }}>
        {children}
      </p>
    </div>
  )
}
