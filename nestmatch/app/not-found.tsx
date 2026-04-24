import Link from "next/link"
import Logo from "./components/Logo"
import { BRAND } from "../lib/brand"
import { km, KMCard, KMEyebrow, KMHeading } from "./components/ui/km"

export const metadata = {
  title: "Page introuvable",
}

export default function NotFound() {
  return (
    <main style={{
      minHeight: "calc(100vh - 72px)",
      background: km.beige,
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 20px",
    }}>
      <KMCard padding="48px 40px" style={{ maxWidth: 520, width: "100%", textAlign: "center", borderRadius: 24 }}>
        <div style={{ marginBottom: 18 }}>
          <Logo variant="compact" />
        </div>

        {/* Eyebrow éditorial */}
        <KMEyebrow style={{ marginBottom: 14 }}>Erreur · 404</KMEyebrow>

        {/* Gros "404" Fraunces italic */}
        <KMHeading as="h1" size={96} style={{ letterSpacing: "-4px", lineHeight: 1, marginBottom: 10 }}>
          404
        </KMHeading>

        <KMHeading as="h2" size={22} style={{ marginBottom: 10 }}>
          Cette page n&apos;existe pas.
        </KMHeading>

        <p style={{
          color: km.muted,
          fontSize: 14,
          lineHeight: 1.6,
          marginBottom: 28,
        }}>
          Le lien a peut-être changé ou la page a été déplacée. Retournez à l&apos;accueil ou explorez {BRAND.name}.
        </p>

        {/* CTA principal — pilule noire KM */}
        <Link href="/" style={{
          display: "inline-block",
          background: km.ink,
          color: km.white,
          padding: "14px 32px",
          borderRadius: 999,
          textDecoration: "none",
          fontWeight: 700,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.6px",
          marginBottom: 20,
        }}>
          Retour à l&apos;accueil
        </Link>

        {/* Liens utiles */}
        <div style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          justifyContent: "center",
          marginTop: 8,
        }}>
          {[
            { href: "/annonces", label: "Voir les annonces" },
            { href: "/auth", label: "Se connecter" },
            { href: "/auth?mode=inscription", label: "Créer un compte" },
          ].map(l => (
            <Link key={l.href} href={l.href} style={{
              padding: "8px 16px",
              border: `1px solid ${km.line}`,
              borderRadius: 999,
              textDecoration: "none",
              color: km.ink,
              fontWeight: 600,
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.6px",
            }}>
              {l.label}
            </Link>
          ))}
        </div>
      </KMCard>
    </main>
  )
}
