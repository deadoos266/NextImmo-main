"use client"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { km } from "../ui/km"

/**
 * V84.5 — Pill ADMIN cliquable avec dropdown quick-access.
 *
 * V85.11 — Fix stacking : dropdown rendu via React Portal vers <body>
 * pour échapper au stacking context du Navbar (zIndex 10000) qui
 * trappe le dropdown sous l'AdminBar (zIndex 10001).
 *
 * Comportement :
 *  - Click pill → ouvre/ferme dropdown (calc position via getBoundingClientRect)
 *  - Esc → ferme
 *  - Click outside (btn + menu) → ferme
 *  - Scroll/resize → recalc position
 */

const QUICK_LINKS = [
  { href: "/admin", label: "Dashboard", icon: "▦" },
  { href: "/admin/health", label: "Santé services", icon: "♥" },
  { href: "/admin/qa", label: "QA Bot", icon: "✓" },
  { href: "/admin/operations", label: "Opérations", icon: "⚡" },
  { href: "/admin/bugs", label: "Bug reports", icon: "✗" },
]

export default function AdminPill() {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const btnRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => { setMounted(true) }, [])

  // Recalcule position quand on ouvre
  useEffect(() => {
    if (!open || !btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setCoords({ top: rect.bottom + 6, left: rect.left })
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node
      const inBtn = wrapRef.current?.contains(target)
      const menu = document.getElementById("km-adminpill-menu")
      const inMenu = menu?.contains(target)
      if (!inBtn && !inMenu) setOpen(false)
    }
    function onScroll() {
      if (btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect()
        setCoords({ top: rect.bottom + 6, left: rect.left })
      }
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onClickOutside)
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", onScroll)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onClickOutside)
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", onScroll)
    }
  }, [open])

  const menuContent = open && coords ? (
    <div
      id="km-adminpill-menu"
      role="menu"
      aria-label="Accès rapide admin"
      style={{
        position: "fixed",
        top: coords.top,
        left: coords.left,
        minWidth: 220,
        background: km.white,
        border: `1px solid ${km.line}`,
        borderRadius: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        padding: 6,
        // V85.11 — zIndex 100000 pour passer au-dessus AdminBar (10001),
        // Navbar (10000), tous modals existants. Rendu via Portal vers
        // <body> donc pas de stacking context parent qui le contraint.
        zIndex: 100000,
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        animation: "km-adminpill-slide 180ms cubic-bezier(0.32, 0.72, 0, 1)",
      }}
    >
      <style>{`@keyframes km-adminpill-slide { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div style={{
        padding: "8px 12px 6px",
        fontSize: 10, fontWeight: 700, color: km.muted,
        textTransform: "uppercase", letterSpacing: 1.4,
      }}>
        Accès rapide
      </div>
      {QUICK_LINKS.map(item => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setOpen(false)}
          role="menuitem"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "9px 12px",
            borderRadius: 8,
            color: km.ink,
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 500,
            transition: "background 120ms",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = km.beige)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <span style={{ color: km.muted, width: 18, textAlign: "center" }}>{item.icon}</span>
          {item.label}
        </Link>
      ))}
      <div style={{ borderTop: `1px solid ${km.line}`, margin: "6px 0" }} />
      <Link
        href="/admin"
        onClick={() => setOpen(false)}
        style={{
          display: "block",
          padding: "8px 12px",
          fontSize: 11,
          fontWeight: 700,
          color: km.ink,
          textDecoration: "none",
          textTransform: "uppercase",
          letterSpacing: 0.6,
          textAlign: "center",
          borderRadius: 8,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = km.beige)}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        Voir tout l&apos;admin →
      </Link>
    </div>
  ) : null

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu admin"
        style={{
          fontSize: 11,
          background: km.ink,
          color: km.white,
          padding: "2px 8px",
          borderRadius: 999,
          textDecoration: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontWeight: 700,
          letterSpacing: 0.4,
        }}
      >
        ADMIN
        <span aria-hidden style={{ fontSize: 8, opacity: 0.85 }}>{open ? "▲" : "▼"}</span>
      </button>
      {mounted && menuContent && createPortal(menuContent, document.body)}
    </div>
  )
}
