import Link from "next/link"
import Logo from "./components/Logo"
import { BRAND } from "../lib/brand"

export const metadata = {
  title: "Page introuvable",
}

export default function NotFound() {
  return (
    <main style={{
      minHeight: "calc(100vh - 72px)",
      background: "#F7F4EF",
      fontFamily: "'DM Sans', sans-serif",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 20px",
    }}>
      <div style={{
        maxWidth: 520,
        width: "100%",
        background: "white",
        borderRadius: 24,
        padding: "48px 40px",
        textAlign: "center",
        boxShadow: "0 4px 32px rgba(0,0,0,0.06)",
      }}>
        <div style={{ marginBottom: 18 }}>
          <Logo variant="compact" />
        </div>
        {/* Gros "404" stylisé */}
        <p style={{
          fontSize: 96,
          fontWeight: 800,
          letterSpacing: "-4px",
          lineHeight: 1,
          color: "#111",
          marginBottom: 4,
        }}>
          404
        </p>

        <h1 style={{
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: "-0.5px",
          marginBottom: 8,
        }}>
          Cette page n&apos;existe pas.
        </h1>

        <p style={{
          color: "#8a8477",
          fontSize: 14,
          lineHeight: 1.6,
          marginBottom: 28,
        }}>
          Le lien a peut-être changé ou la page a été déplacée. Retournez à l&apos;accueil ou explorez {BRAND.name}.
        </p>

        {/* CTA principal */}
        <Link href="/" style={{
          display: "inline-block",
          background: "#111",
          color: "white",
          padding: "14px 32px",
          borderRadius: 999,
          textDecoration: "none",
          fontWeight: 700,
          fontSize: 15,
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
              border: "1px solid #EAE6DF",
              borderRadius: 999,
              textDecoration: "none",
              color: "#111",
              fontWeight: 600,
              fontSize: 13,
            }}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
