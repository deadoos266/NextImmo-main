"use client"
import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import { useResponsive } from "../hooks/useResponsive"
import Link from "next/link"

interface CookieConsent {
  necessary: boolean
  functional: boolean
  analytics: boolean
  marketing: boolean
  date: string
}

const STORAGE_KEY = "cookie_consent"

function getStoredConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveConsent(consent: CookieConsent): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(consent))
}

/* ── Toggle switch ── */
function Toggle({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange?: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        border: "none",
        background: checked ? "#111" : "#d1d5db",
        position: "relative",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.2s ease",
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 23 : 3,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "white",
          transition: "left 0.2s ease",
          boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
        }}
      />
    </button>
  )
}

/* ── Category row ── */
function CategoryRow({ label, description, checked, disabled, onChange }: {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange?: (v: boolean) => void
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "12px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: 0 }}>{label}</p>
        <p style={{ fontSize: 12, color: "#6b7280", margin: "2px 0 0", lineHeight: 1.4 }}>{description}</p>
      </div>
      <Toggle checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  )
}

/* ── Floating cookie button ── */
function FloatingCookieButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Modifier les préférences cookies"
      style={{
        position: "fixed",
        bottom: 20,
        left: 20,
        zIndex: 400,
        width: 40,
        height: 40,
        borderRadius: "50%",
        border: "none",
        background: "white",
        boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 22,
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.1)"
        ;(e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 24px rgba(0,0,0,0.18)"
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"
        ;(e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.12)"
      }}
    >
      🍪
    </button>
  )
}

/* ── Main banner ── */
export default function CookieBanner() {
  const { isMobile } = useResponsive()
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [functional, setFunctional] = useState(true)
  const [analytics, setAnalytics] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [animateIn, setAnimateIn] = useState(false)

  // Masquer l'icône flottante sur toutes les pages avec carte Leaflet pour
  // éviter le chevauchement avec les contrôles zoom / attribution.
  const hideFloatingOnThisPage =
    pathname === "/annonces" ||
    pathname?.startsWith("/annonces/") === true ||
    pathname?.startsWith("/location/") === true

  useEffect(() => {
    const stored = getStoredConsent()
    if (stored) {
      setDismissed(true)
    } else {
      setVisible(true)
      // Trigger animation after mount
      const t = setTimeout(() => setAnimateIn(true), 50)
      return () => clearTimeout(t)
    }
  }, [])

  function handleAcceptAll(): void {
    const consent: CookieConsent = { necessary: true, functional: true, analytics: true, marketing: false, date: new Date().toISOString() }
    saveConsent(consent)
    setAnimateIn(false)
    setTimeout(() => { setVisible(false); setDismissed(true) }, 300)
  }

  function handleRefuseAll(): void {
    const consent: CookieConsent = { necessary: true, functional: false, analytics: false, marketing: false, date: new Date().toISOString() }
    saveConsent(consent)
    setAnimateIn(false)
    setTimeout(() => { setVisible(false); setDismissed(true) }, 300)
  }

  function handleSavePreferences(): void {
    const consent: CookieConsent = { necessary: true, functional, analytics, marketing: false, date: new Date().toISOString() }
    saveConsent(consent)
    setAnimateIn(false)
    setTimeout(() => { setVisible(false); setDismissed(true) }, 300)
  }

  function handleReopen(): void {
    const stored = getStoredConsent()
    if (stored) {
      setFunctional(stored.functional)
      setAnalytics(stored.analytics)
    }
    setShowDetails(true)
    setVisible(true)
    setDismissed(false)
    setTimeout(() => setAnimateIn(true), 50)
  }

  if (!visible && dismissed) {
    if (hideFloatingOnThisPage) return null
    return <FloatingCookieButton onClick={handleReopen} />
  }

  if (!visible) return null

  return (
    <>
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          padding: isMobile ? "16px" : "20px 32px",
          fontFamily: "'DM Sans', sans-serif",
          opacity: animateIn ? 1 : 0,
          transform: animateIn ? "translateY(0)" : "translateY(20px)",
          transition: "opacity 0.3s ease, transform 0.3s ease",
        }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            background: "rgba(255,255,255,0.85)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderRadius: 20,
            border: "1px solid rgba(255,255,255,0.6)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)",
            padding: isMobile ? "20px" : "24px 28px",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>🍪</span>
            <p style={{ fontSize: 16, fontWeight: 800, color: "#111", margin: 0 }}>
              Nous respectons votre vie privée
            </p>
          </div>

          {/* Description */}
          <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, margin: "0 0 16px" }}>
            NestMatch utilise des cookies pour assurer le bon fonctionnement du site et améliorer votre expérience.
            Vous pouvez personnaliser vos choix à tout moment.{" "}
            <Link href="/cookies" style={{ color: "#111", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 2 }}>
              En savoir plus
            </Link>
          </p>

          {/* Expanded preferences */}
          {showDetails && (
            <div style={{ marginBottom: 16, borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 4 }}>
              <CategoryRow
                label="Nécessaires"
                description="Session, authentification, sécurité. Indispensables au fonctionnement du site."
                checked={true}
                disabled={true}
              />
              <CategoryRow
                label="Fonctionnels"
                description="Préférences, favoris, personnalisation de l'interface."
                checked={functional}
                onChange={setFunctional}
              />
              <CategoryRow
                label="Analytiques"
                description="Comptage des pages vues, mesure de performance. Aucun outil tiers."
                checked={analytics}
                onChange={setAnalytics}
              />
              <CategoryRow
                label="Marketing"
                description="Aucun cookie marketing n'est utilisé actuellement."
                checked={false}
                disabled={true}
              />
            </div>
          )}

          {/* Buttons */}
          <div
            style={{
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              gap: isMobile ? 8 : 10,
              alignItems: isMobile ? "stretch" : "center",
            }}
          >
            {!showDetails ? (
              <>
                <button
                  onClick={handleAcceptAll}
                  style={{
                    background: "#111",
                    color: "white",
                    borderRadius: 999,
                    padding: "10px 24px",
                    fontWeight: 700,
                    fontSize: 13,
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                    transition: "background 0.2s ease",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#333" }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#111" }}
                >
                  Tout accepter
                </button>
                <button
                  onClick={() => setShowDetails(true)}
                  style={{
                    background: "none",
                    border: "1.5px solid #e5e7eb",
                    borderRadius: 999,
                    padding: "8px 20px",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: "pointer",
                    color: "#111",
                    fontFamily: "'DM Sans', sans-serif",
                    transition: "border-color 0.2s ease",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#111" }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e5e7eb" }}
                >
                  Personnaliser
                </button>
                <button
                  onClick={handleRefuseAll}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "8px 16px",
                    fontWeight: 500,
                    fontSize: 13,
                    cursor: "pointer",
                    color: "#9ca3af",
                    fontFamily: "'DM Sans', sans-serif",
                    textDecoration: "underline",
                    textUnderlineOffset: 2,
                    transition: "color 0.2s ease",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#6b7280" }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#9ca3af" }}
                >
                  Tout refuser
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleSavePreferences}
                  style={{
                    background: "#111",
                    color: "white",
                    borderRadius: 999,
                    padding: "10px 24px",
                    fontWeight: 700,
                    fontSize: 13,
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                    transition: "background 0.2s ease",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#333" }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#111" }}
                >
                  Enregistrer mes choix
                </button>
                <button
                  onClick={handleAcceptAll}
                  style={{
                    background: "none",
                    border: "1.5px solid #e5e7eb",
                    borderRadius: 999,
                    padding: "8px 20px",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: "pointer",
                    color: "#111",
                    fontFamily: "'DM Sans', sans-serif",
                    transition: "border-color 0.2s ease",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#111" }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e5e7eb" }}
                >
                  Tout accepter
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
