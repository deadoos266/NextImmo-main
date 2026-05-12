"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { km } from "../ui/km"

/**
 * V84.3 — AdminSidebar : navigation latérale sticky de l'admin.
 *
 * Desktop ≥ 1024 : sidebar 240px sticky à gauche
 * Tablette 640-1023 : sidebar 200px sticky (icônes + labels courts)
 * Mobile < 640 : drawer top-anchored déclenché par bouton menu dans header
 *
 * Items groupés par section (Vue d'ensemble / Données / Système / Outils).
 * Active state : background beige + bordure gauche 3px ink + bold.
 *
 * Pour les pages "Coming soon V85+", on les affiche grisées avec badge.
 */

type Item = {
  href: string
  label: string
  icon: string  // emoji SVG-like (compact)
  comingSoon?: boolean
}

type Section = {
  title: string
  items: Item[]
}

const SECTIONS: Section[] = [
  {
    title: "Vue d'ensemble",
    items: [
      { href: "/admin", label: "Dashboard", icon: "▦" },
      { href: "/admin/health", label: "Santé", icon: "♥" },
      { href: "/admin/qa", label: "QA Bot", icon: "✓" },
      { href: "/admin/operations", label: "Opérations", icon: "⚡" },
    ],
  },
  {
    title: "Données",
    items: [
      { href: "/admin/users", label: "Utilisateurs", icon: "○" },
      { href: "/admin/annonces", label: "Annonces", icon: "▣" },
      { href: "/admin/baux", label: "Baux", icon: "≡" },
      { href: "/admin/loyers", label: "Loyers", icon: "€" },
    ],
  },
  {
    title: "Système",
    items: [
      { href: "/admin/crons", label: "Crons", icon: "⟳" },
      { href: "/admin/bugs", label: "Bug reports", icon: "✗" },
      { href: "/admin/releases", label: "Validations", icon: "▸" },
      { href: "/admin/emails", label: "Emails", icon: "✉" },
      { href: "/admin/sessions", label: "Sessions", icon: "⚭" },
    ],
  },
  {
    title: "Outils",
    items: [
      { href: "/admin/logos", label: "Logos", icon: "◆" },
      { href: "/admin/settings", label: "Settings", icon: "⚙" },
    ],
  },
]

export default function AdminSidebar() {
  const pathname = usePathname() || "/"
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia("(max-width: 768px)")
    setIsMobile(mq.matches)
    const update = () => setIsMobile(mq.matches)
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  // Auto-close drawer mobile sur navigation
  useEffect(() => { setMobileOpen(false) }, [pathname])

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin"
    return pathname === href || pathname.startsWith(href + "/")
  }

  const renderItem = (item: Item) => {
    const active = isActive(item.href)
    const content = (
      <span style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderRadius: 10,
        background: active ? km.beige : "transparent",
        color: item.comingSoon ? km.muted : km.ink,
        fontWeight: active ? 700 : 500,
        fontSize: 13.5,
        textDecoration: "none",
        borderLeft: active ? `3px solid ${km.ink}` : "3px solid transparent",
        marginLeft: -3,
        cursor: item.comingSoon ? "not-allowed" : "pointer",
        transition: "background 140ms",
        opacity: item.comingSoon ? 0.5 : 1,
      }}>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 22,
          fontSize: 14,
          color: active ? km.ink : km.muted,
        }}>{item.icon}</span>
        <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.label}
        </span>
        {item.comingSoon && (
          <span style={{
            fontSize: 9, fontWeight: 700, textTransform: "uppercase",
            letterSpacing: 0.6, color: km.muted,
            border: `1px solid ${km.line}`, padding: "2px 5px",
            borderRadius: 4,
          }}>V85</span>
        )}
      </span>
    )

    if (item.comingSoon) {
      return <div key={item.href} aria-disabled="true">{content}</div>
    }
    return <Link key={item.href} href={item.href} style={{ textDecoration: "none" }}>{content}</Link>
  }

  const sidebarContent = (
    <>
      <div style={{ padding: "16px 14px 12px", borderBottom: `1px solid ${km.line}` }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: 1.6, margin: 0 }}>
          Admin · Interne
        </p>
        <p style={{
          fontFamily: "var(--font-fraunces), 'Fraunces', serif",
          fontStyle: "italic", fontWeight: 500, fontSize: 22,
          color: km.ink, margin: "4px 0 0", lineHeight: 1.1,
        }}>
          KeyMatch
        </p>
      </div>

      <nav style={{ padding: "10px 8px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
        {SECTIONS.map(section => (
          <div key={section.title}>
            <div style={{
              padding: "0 14px 6px",
              fontSize: 10, fontWeight: 700, color: km.muted,
              textTransform: "uppercase", letterSpacing: 1.4,
            }}>
              {section.title}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {section.items.map(renderItem)}
            </div>
          </div>
        ))}
      </nav>

      <div style={{ marginTop: "auto", padding: "12px 14px", borderTop: `1px solid ${km.line}`, fontSize: 11, color: km.muted }}>
        <Link href="/" style={{ color: km.ink, textDecoration: "none", fontWeight: 600 }}>← Retour au site</Link>
      </div>
    </>
  )

  // Mobile : drawer overlay + bouton trigger
  if (isMobile) {
    return (
      <>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Ouvrir menu admin"
          style={{
            position: "fixed",
            top: 84, left: 16,
            zIndex: 1100,
            width: 44, height: 44,
            borderRadius: 999,
            background: km.white,
            border: `1px solid ${km.line}`,
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "inherit",
            color: km.ink,
            fontSize: 16,
          }}
        >
          ☰
        </button>
        {mobileOpen && (
          <>
            <div
              onClick={() => setMobileOpen(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.5)", zIndex: 1199 }}
              aria-hidden
            />
            <aside style={{
              position: "fixed",
              top: 0, left: 0, bottom: 0,
              width: "min(280px, 85vw)",
              background: km.white,
              zIndex: 1200,
              overflowY: "auto",
              display: "flex", flexDirection: "column",
              borderRight: `1px solid ${km.line}`,
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              animation: "km-admin-sidebar-slide 220ms ease-out",
            }}>
              <style>{`@keyframes km-admin-sidebar-slide { from { transform: translateX(-100%); } to { transform: translateX(0); } }`}</style>
              <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 10px 0" }}>
                <button onClick={() => setMobileOpen(false)} aria-label="Fermer menu" style={{ width: 36, height: 36, borderRadius: 999, background: km.beige, border: `1px solid ${km.line}`, cursor: "pointer", fontSize: 16, fontFamily: "inherit", color: km.ink }}>×</button>
              </div>
              {sidebarContent}
            </aside>
          </>
        )}
      </>
    )
  }

  // Desktop : sticky sidebar
  return (
    <aside style={{
      position: "sticky",
      top: 72,  // sous Navbar fixed
      height: "calc(100vh - 72px)",
      width: 240,
      flexShrink: 0,
      background: km.white,
      borderRight: `1px solid ${km.line}`,
      overflowY: "auto",
      display: "flex", flexDirection: "column",
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
    }}>
      {sidebarContent}
    </aside>
  )
}
