"use client"
import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useResponsive } from "../hooks/useResponsive"
import OngletProfil from "./OngletProfil"
import OngletApparence from "./OngletApparence"
import OngletSecurite from "./OngletSecurite"
import OngletCompte from "./OngletCompte"

type Tab = "profil" | "apparence" | "securite" | "compte"

// 5e onglet "Préférences" = lien navigationnel vers /profil (qui contient
// les critères matching, 900 LoC). Donne l'illusion d'une page tabbée
// unifiée 5 onglets sans refactor 900 LoC. Symétrique côté /profil qui
// renvoie aux 4 onglets de /parametres.
const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  {
    key: "profil",
    label: "Profil",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
  {
    key: "apparence",
    label: "Apparence",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
      </svg>
    ),
  },
  {
    key: "securite",
    label: "Sécurité",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
  },
  {
    key: "compte",
    label: "Compte",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
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
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: isMobile ? "24px 16px 40px" : "40px 48px 60px" }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 10px" }}>Réglages</p>
        <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: isMobile ? 28 : 40, letterSpacing: "-0.5px", color: "#111", margin: "0 0 8px" }}>Paramètres</h1>
        <p style={{ fontSize: isMobile ? 13 : 14, color: "#8a8477", margin: "0 0 28px", lineHeight: 1.6 }}>
          Gérez votre compte, votre apparence et vos préférences de notifications.
        </p>

        <div style={{ display: "flex", gap: isMobile ? 0 : 24, flexDirection: isMobile ? "column" : "row", alignItems: "flex-start" }}>
          {/* Sidebar onglets desktop / tabs horizontaux mobile */}
          <nav
            aria-label="Catégories des paramètres"
            style={{
              flexShrink: 0,
              width: isMobile ? "100%" : 220,
              display: "flex",
              flexDirection: isMobile ? "row" : "column",
              gap: 4,
              marginBottom: isMobile ? 16 : 0,
              overflowX: isMobile ? "auto" : "visible",
              paddingBottom: isMobile ? 2 : 0,
            }}
          >
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
                    alignItems: "center",
                    gap: 10,
                    padding: isMobile ? "10px 14px" : "11px 14px",
                    background: active ? "#111" : "white",
                    color: active ? "white" : "#111",
                    border: `1px solid ${active ? "#111" : "#EAE6DF"}`,
                    borderRadius: 12,
                    fontSize: 13,
                    fontWeight: active ? 700 : 500,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    textAlign: "left",
                    width: isMobile ? "auto" : "100%",
                    transition: "all 0.15s",
                    boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  }}
                >
                  {t.icon}
                  {t.label}
                </button>
              )
            })}
            {/* 5e onglet "Préférences" = navigation vers /profil (critères matching) */}
            <Link
              href="/profil"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: isMobile ? "10px 14px" : "11px 14px",
                background: "white",
                color: "#111",
                border: "1px solid #EAE6DF",
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
                flexShrink: 0,
                textAlign: "left",
                width: isMobile ? "auto" : "100%",
                textDecoration: "none",
                transition: "all 0.15s",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
                <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
                <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>
              </svg>
              Préférences
            </Link>
          </nav>

          <div style={{ flex: 1, minWidth: 0, width: isMobile ? "100%" : undefined }}>
            {onglet === "profil" && <OngletProfil />}
            {onglet === "apparence" && <OngletApparence />}
            {onglet === "securite" && <OngletSecurite />}
            {onglet === "compte" && <OngletCompte />}
          </div>
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
