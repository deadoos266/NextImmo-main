"use client"
import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useResponsive } from "../../hooks/useResponsive"
import OngletProfil from "./OngletProfil"
import OngletApparence from "./OngletApparence"
import OngletSecurite from "./OngletSecurite"
import OngletCompte from "./OngletCompte"

type Tab = "profil" | "apparence" | "securite" | "compte"

/**
 * V93.2 — Refonte /parametres :
 * - Hero éditorial (eyebrow Fraunces italic + titre + sous-titre clair)
 * - Sidebar groupée par sections logiques avec descriptions
 * - Cards droite plus aérées (padding, ombre douce, hiérarchie visuelle)
 * - Layout 2 colonnes desktop, stack mobile
 *
 * Pas de changement de fonctionnalité : juste polish UI.
 */

type TabDef = {
  key: Tab
  label: string
  description: string
  icon: React.ReactNode
}

const TABS: TabDef[] = [
  {
    key: "profil",
    label: "Profil",
    description: "Photo, bio, coordonnées",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
  {
    key: "apparence",
    label: "Apparence",
    description: "Thème clair, sombre, auto",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
      </svg>
    ),
  },
  {
    key: "securite",
    label: "Sécurité",
    description: "Mot de passe, sessions",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
  },
  {
    key: "compte",
    label: "Compte",
    description: "Données, suppression",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 19.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 19.5v-15A2.5 2.5 0 0 1 5.5 2h13A2.5 2.5 0 0 1 21 4.5z"/>
        <path d="M3 9h18M9 3v6"/>
      </svg>
    ),
  },
]

function isValidTab(v: string | null): v is Tab {
  return v === "profil" || v === "apparence" || v === "securite" || v === "compte"
}

function ParametresInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isMobile } = useResponsive()
  const initial = searchParams.get("tab")
  const [onglet, setOnglet] = useState<Tab>(isValidTab(initial) ? initial : "profil")

  // Sync URL <- state (replace pour éviter de polluer l'historique)
  useEffect(() => {
    const current = searchParams.get("tab")
    if (current !== onglet) {
      const qs = new URLSearchParams(searchParams?.toString() || "")
      qs.set("tab", onglet)
      router.replace(`/parametres?${qs.toString()}`, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onglet])

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500&display=swap');`}</style>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: isMobile ? "32px 16px 60px" : "56px 48px 80px" }}>

        {/* ─── Hero éditorial ────────────────────────────────────────── */}
        <header style={{ marginBottom: isMobile ? 32 : 48, maxWidth: 720 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.6px", margin: 0 }}>
            Espace personnel
          </p>
          <h1 style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: isMobile ? 38 : 56,
            letterSpacing: "-0.8px",
            color: "#111",
            margin: "10px 0 14px",
            lineHeight: 1.05,
          }}>
            Paramètres
          </h1>
          <p style={{
            fontSize: isMobile ? 14 : 16,
            color: "#5b5547",
            margin: 0,
            lineHeight: 1.55,
            maxWidth: 600,
          }}>
            Gérez votre identité, votre apparence et la sécurité de votre compte KeyMatch.
            Les modifications sont appliquées instantanément.
          </p>
        </header>

        {/* ─── Layout 2 colonnes ─────────────────────────────────────── */}
        <div style={{
          display: "flex",
          gap: isMobile ? 0 : 32,
          flexDirection: isMobile ? "column" : "row",
          alignItems: "flex-start",
        }}>

          {/* ── Sidebar onglets ── */}
          <nav
            aria-label="Catégories des paramètres"
            style={{
              flexShrink: 0,
              width: isMobile ? "100%" : 260,
              marginBottom: isMobile ? 24 : 0,
              position: isMobile ? "static" : "sticky",
              top: isMobile ? "auto" : 28,
            }}
          >
            {/* Label section (desktop seulement) */}
            {!isMobile && (
              <p style={{
                fontSize: 10, fontWeight: 700, color: "#8a8477",
                textTransform: "uppercase", letterSpacing: "1.4px",
                margin: "0 0 12px 4px",
              }}>
                Réglages
              </p>
            )}
            <div style={{
              display: "flex",
              flexDirection: isMobile ? "row" : "column",
              gap: isMobile ? 6 : 4,
              overflowX: isMobile ? "auto" : "visible",
              paddingBottom: isMobile ? 4 : 0,
              WebkitOverflowScrolling: "touch",
            }}>
              {TABS.map(t => {
                const active = onglet === t.key
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setOnglet(t.key)}
                    aria-current={active ? "page" : undefined}
                    style={{
                      display: "flex",
                      alignItems: isMobile ? "center" : "flex-start",
                      gap: 12,
                      padding: isMobile ? "10px 14px" : "12px 14px",
                      background: active ? "#111" : "transparent",
                      color: active ? "#fff" : "#111",
                      border: active ? "1px solid #111" : "1px solid transparent",
                      borderRadius: 14,
                      fontSize: isMobile ? 13 : 14,
                      fontWeight: active ? 600 : 500,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                      textAlign: "left",
                      width: isMobile ? "auto" : "100%",
                      transition: "all 180ms cubic-bezier(.2,.8,.2,1)",
                      boxShadow: active ? "0 4px 12px rgba(0,0,0,0.10)" : "none",
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(0,0,0,0.04)" }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent" }}
                  >
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 28, height: 28,
                      borderRadius: 8,
                      background: active ? "rgba(255,255,255,0.12)" : "transparent",
                      color: active ? "#fff" : "#5b5547",
                      flexShrink: 0,
                    }}>
                      {t.icon}
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                      <span style={{ letterSpacing: "-0.1px" }}>{t.label}</span>
                      {!isMobile && (
                        <span style={{
                          fontSize: 11,
                          fontWeight: 400,
                          color: active ? "rgba(255,255,255,0.65)" : "#8a8477",
                          letterSpacing: "0.1px",
                        }}>
                          {t.description}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}

              {/* 5e onglet "Préférences" = lien vers /profil (critères matching) */}
              <Link
                href="/profil"
                style={{
                  display: "flex",
                  alignItems: isMobile ? "center" : "flex-start",
                  gap: 12,
                  padding: isMobile ? "10px 14px" : "12px 14px",
                  background: "transparent",
                  color: "#111",
                  border: "1px solid transparent",
                  borderRadius: 14,
                  fontSize: isMobile ? 13 : 14,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  textAlign: "left",
                  width: isMobile ? "auto" : "100%",
                  textDecoration: "none",
                  transition: "all 180ms cubic-bezier(.2,.8,.2,1)",
                  marginTop: isMobile ? 0 : 8,
                  borderTop: isMobile ? "none" : "1px solid #EAE6DF",
                  paddingTop: isMobile ? "10px" : "16px",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.04)" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
              >
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28, height: 28,
                  borderRadius: 8,
                  background: "transparent",
                  color: "#5b5547",
                  flexShrink: 0,
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
                    <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
                    <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
                    <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>
                  </svg>
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                  <span style={{ letterSpacing: "-0.1px" }}>Préférences <span style={{ fontSize: 11, color: "#8a8477", fontWeight: 400 }}>↗</span></span>
                  {!isMobile && (
                    <span style={{ fontSize: 11, fontWeight: 400, color: "#8a8477" }}>
                      Critères de matching & notifications
                    </span>
                  )}
                </span>
              </Link>
            </div>
          </nav>

          {/* ── Contenu de l'onglet sélectionné ── */}
          <section style={{
            flex: 1,
            minWidth: 0,
            width: isMobile ? "100%" : undefined,
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}>
            {onglet === "profil" && <OngletProfil />}
            {onglet === "apparence" && <OngletApparence />}
            {onglet === "securite" && <OngletSecurite />}
            {onglet === "compte" && <OngletCompte />}
          </section>
        </div>
      </div>
    </main>
  )
}

export default function ParametresPage() {
  return (
    <Suspense fallback={
      <main style={{ minHeight: "100vh", background: "#F7F4EF", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", color: "#8a8477" }}>Chargement…</main>
    }>
      <ParametresInner />
    </Suspense>
  )
}
