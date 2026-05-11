"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { km } from "../ui/km"

/**
 * V84.4 — AdminBreadcrumb : fil d'Ariane Home > Admin > Section > Page.
 *
 * Construit dynamiquement depuis usePathname(). Click sur chaque segment
 * navigue vers le parent.
 */

const LABELS: Record<string, string> = {
  admin: "Admin",
  health: "Santé",
  qa: "QA Bot",
  operations: "Opérations",
  bugs: "Bug reports",
  logos: "Logos",
  users: "Utilisateurs",
  annonces: "Annonces",
  baux: "Baux",
  loyers: "Loyers",
  crons: "Crons",
  emails: "Emails",
  sessions: "Sessions",
  settings: "Settings",
}

export default function AdminBreadcrumb() {
  const pathname = usePathname() || "/"
  // Split + filter empty
  const segments = pathname.split("/").filter(Boolean)
  if (segments[0] !== "admin") return null

  // Construire les liens cumulés
  const crumbs = segments.map((seg, idx) => {
    const href = "/" + segments.slice(0, idx + 1).join("/")
    const label = LABELS[seg] || seg
    return { href, label, isLast: idx === segments.length - 1 }
  })

  return (
    <nav aria-label="Fil d'Ariane" style={{
      display: "flex", alignItems: "center", gap: 6,
      fontSize: 12, color: km.muted, marginBottom: 18,
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      flexWrap: "wrap",
    }}>
      <Link href="/" style={{ color: km.muted, textDecoration: "none" }}>
        Accueil
      </Link>
      {crumbs.map(c => (
        <span key={c.href} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span aria-hidden style={{ color: km.line }}>›</span>
          {c.isLast ? (
            <span style={{ color: km.ink, fontWeight: 600 }}>{c.label}</span>
          ) : (
            <Link href={c.href} style={{ color: km.muted, textDecoration: "none" }}>{c.label}</Link>
          )}
        </span>
      ))}
    </nav>
  )
}
