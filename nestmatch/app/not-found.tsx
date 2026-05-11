import Link from "next/link"
import Logo from "./components/Logo"
import { BRAND } from "../lib/brand"
import { km, KMCard, KMEyebrow, KMHeading } from "./components/ui/km"
import NotFoundCTAs from "./not-found.client"
import AutoBugReporter from "./components/AutoBugReporter"

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
      {/* V97.11 — Auto-report la 404 dans /admin/bugs avec referrer */}
      <AutoBugReporter type="404" />
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

        {/* Liens utiles — V72.1a : conditionnés à la session NextAuth.
            Si user authentifié → "Voir annonces / Mon profil / Contacter le support".
            Sinon → "Voir annonces / Se connecter / Créer un compte". */}
        <NotFoundCTAs />
      </KMCard>
    </main>
  )
}
