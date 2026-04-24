import Link from "next/link"
import type { Metadata } from "next"
import { CITY_NAMES } from "../../lib/cityCoords"
import { km, KMCard, KMEyebrow, KMHeading } from "../components/ui/km"

export const metadata: Metadata = {
  title: "Plan du site",
  description: "Navigation rapide vers toutes les pages publiques de KeyMatch : accueil, annonces, villes, espace proprio et locataire.",
  alternates: { canonical: "/plan-du-site" },
}

const linkStyle: React.CSSProperties = {
  color: km.ink,
  textDecoration: "none",
  fontSize: 14,
  lineHeight: 2,
  display: "inline-block",
  borderBottom: `1px solid transparent`,
  transition: "border-color 0.15s",
}

export default function PlanDuSite() {
  return (
    <main style={{
      minHeight: "100vh",
      background: km.beige,
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      padding: "40px 20px",
    }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <Link href="/" style={{
          fontSize: 10, color: km.muted, textDecoration: "none",
          textTransform: "uppercase", letterSpacing: "1.4px", fontWeight: 700,
        }}>← Retour à l&apos;accueil</Link>

        <div style={{ margin: "22px 0 30px" }}>
          <KMEyebrow style={{ marginBottom: 10 }}>Navigation · Toutes les pages</KMEyebrow>
          <KMHeading as="h1" size={42} style={{ marginBottom: 8 }}>Plan du site</KMHeading>
          <p style={{ fontSize: 14, color: km.muted, margin: 0, lineHeight: 1.55 }}>
            Toutes les pages publiques de KeyMatch, en un coup d&apos;œil.
          </p>
        </div>

        <KMCard padding="28px 32px" style={{ marginBottom: 16 }}>
          <KMHeading as="h2" size={22} style={{ marginBottom: 18 }}>Navigation principale</KMHeading>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "4px 24px" }}>
            <Link href="/" style={linkStyle}>Accueil</Link>
            <Link href="/annonces" style={linkStyle}>Toutes les annonces</Link>
            <Link href="/estimateur" style={linkStyle}>Estimateur de budget</Link>
            <Link href="/contact" style={linkStyle}>Nous contacter</Link>
            <Link href="/auth" style={linkStyle}>Connexion</Link>
            <Link href="/auth?mode=inscription" style={linkStyle}>Créer un compte</Link>
          </div>
        </KMCard>

        <KMCard padding="28px 32px" style={{ marginBottom: 16 }}>
          <KMHeading as="h2" size={22} style={{ marginBottom: 18 }}>Location par ville</KMHeading>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "4px 20px" }}>
            {CITY_NAMES.map(ville => (
              <Link key={ville} href={`/location/${encodeURIComponent(ville.toLowerCase())}`} style={linkStyle}>
                Location {ville}
              </Link>
            ))}
          </div>
        </KMCard>

        <KMCard padding="28px 32px" style={{ marginBottom: 16 }}>
          <KMHeading as="h2" size={22} style={{ marginBottom: 18 }}>Ressources</KMHeading>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "4px 24px" }}>
            <Link href="/cgu" style={linkStyle}>Conditions d&apos;utilisation</Link>
            <Link href="/mentions-legales" style={linkStyle}>Mentions légales</Link>
            <Link href="/confidentialite" style={linkStyle}>Politique de confidentialité</Link>
            <Link href="/cookies" style={linkStyle}>Politique cookies</Link>
          </div>
        </KMCard>
      </div>
    </main>
  )
}
