"use client"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { km } from "./components/ui/km"

const PILL: React.CSSProperties = {
  padding: "8px 16px",
  border: `1px solid ${km.line}`,
  borderRadius: 999,
  textDecoration: "none",
  color: km.ink,
  fontWeight: 600,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.6px",
}

/**
 * V72.1a — sub-composant client de /not-found qui propose des CTA
 * conditionnés à la session NextAuth. Plus de "Se connecter" affiché à un
 * user déjà authentifié (cas du screenshot admin perdu en page d'erreur).
 */
export default function NotFoundCTAs() {
  const { status } = useSession()
  const isAuthed = status === "authenticated"

  const links = isAuthed
    ? [
        { href: "/annonces", label: "Voir les annonces" },
        { href: "/profil", label: "Mon profil" },
        { href: "/contact", label: "Contacter le support" },
      ]
    : [
        { href: "/annonces", label: "Voir les annonces" },
        { href: "/auth", label: "Se connecter" },
        { href: "/auth?mode=inscription", label: "Créer un compte" },
      ]

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
      {links.map(l => (
        <Link key={l.href} href={l.href} style={PILL}>
          {l.label}
        </Link>
      ))}
    </div>
  )
}
