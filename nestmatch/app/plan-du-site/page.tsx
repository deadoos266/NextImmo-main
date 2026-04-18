import Link from "next/link"
import type { Metadata } from "next"
import { CITY_NAMES } from "../../lib/cityCoords"

export const metadata: Metadata = {
  title: "Plan du site",
  description: "Navigation rapide vers toutes les pages publiques de NestMatch : accueil, annonces, villes, espace proprio et locataire.",
  alternates: { canonical: "/plan-du-site" },
}

const sectionStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 20,
  padding: "24px 28px",
  marginBottom: 16,
}

const h2: React.CSSProperties = { fontSize: 18, fontWeight: 800, marginBottom: 14, letterSpacing: "-0.3px" }
const link: React.CSSProperties = { color: "#111", textDecoration: "none", fontSize: 14, lineHeight: 2, display: "inline-block" }

export default function PlanDuSite() {
  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: "40px 20px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <Link href="/" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>← Retour à l&apos;accueil</Link>

        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.5px", margin: "16px 0 6px" }}>Plan du site</h1>
        <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 28 }}>
          Toutes les pages publiques de NestMatch, en un coup d&apos;œil.
        </p>

        <section style={sectionStyle}>
          <h2 style={h2}>Navigation principale</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "4px 24px" }}>
            <Link href="/" style={link}>Accueil</Link>
            <Link href="/annonces" style={link}>Toutes les annonces</Link>
            <Link href="/estimateur" style={link}>Estimateur de budget</Link>
            <Link href="/contact" style={link}>Nous contacter</Link>
            <Link href="/auth" style={link}>Connexion</Link>
            <Link href="/auth?mode=inscription" style={link}>Créer un compte</Link>
          </div>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>Location par ville</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "4px 20px" }}>
            {CITY_NAMES.map(ville => (
              <Link key={ville} href={`/location/${encodeURIComponent(ville.toLowerCase())}`} style={link}>
                Location {ville}
              </Link>
            ))}
          </div>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>Ressources</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "4px 24px" }}>
            <Link href="/cgu" style={link}>Conditions d&apos;utilisation</Link>
            <Link href="/mentions-legales" style={link}>Mentions légales</Link>
            <Link href="/confidentialite" style={link}>Politique de confidentialité</Link>
            <Link href="/cookies" style={link}>Politique cookies</Link>
          </div>
        </section>
      </div>
    </main>
  )
}
