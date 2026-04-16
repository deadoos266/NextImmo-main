"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useResponsive } from "./hooks/useResponsive"

export default function Home() {
  const { isMobile, isTablet } = useResponsive()
  const isSmall = isMobile || isTablet
  const router = useRouter()
  const [searchVille, setSearchVille] = useState("")
  const [searchBudget, setSearchBudget] = useState("")
  const [searchType, setSearchType] = useState("")

  function handleSearch(e?: React.FormEvent) {
    e?.preventDefault()
    const params = new URLSearchParams()
    if (searchVille.trim()) params.set("ville", searchVille.trim())
    const budget = searchBudget.replace(/[^0-9]/g, "")
    if (budget) params.set("budget_max", budget)
    if (searchType && searchType !== "Tous") params.set("type", searchType)
    const qs = params.toString()
    router.push(qs ? `/annonces?${qs}` : "/annonces")
  }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>

      {/* Hero */}
      <section style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: isMobile ? "48px 20px 40px" : isTablet ? "64px 32px 48px" : "80px 24px 60px" }}>
        <div style={{ background: "#111", color: "white", padding: "6px 16px", borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: "1px", marginBottom: 20, textTransform: "uppercase" }}>
          Location entre particuliers · Zéro agence
        </div>
        <h1 style={{ fontSize: isMobile ? 36 : isTablet ? 52 : 68, fontWeight: 800, lineHeight: 1.08, maxWidth: 700, marginBottom: 16, letterSpacing: isMobile ? "-1px" : "-2px" }}>
          Trouvez votre logement.<br />
          <span style={{ color: "#6b7280" }}>Sans agence.</span>
        </h1>
        <p style={{ fontSize: isMobile ? 15 : 18, color: "#6b7280", maxWidth: 520, marginBottom: isMobile ? 32 : 48, lineHeight: 1.6, padding: isMobile ? "0 4px" : 0 }}>
          NestMatch connecte directement propriétaires et locataires. Dossier certifié, gestion des loyers, score de matching — tout au même endroit.
        </p>

        {/* Barre de recherche */}
        {isMobile ? (
          <form onSubmit={handleSearch} style={{ display: "flex", flexDirection: "column", background: "white", borderRadius: 20, boxShadow: "0 4px 24px rgba(0,0,0,0.10)", width: "100%", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #f3f4f6" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Ville</span>
              <input
                type="text"
                placeholder="Paris, Lyon, Bordeaux..."
                value={searchVille}
                onChange={e => setSearchVille(e.target.value)}
                style={{ display: "block", width: "100%", outline: "none", fontSize: 15, background: "transparent", marginTop: 4, border: "none", color: "#111", boxSizing: "border-box" }} />
            </div>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #f3f4f6" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Budget max</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="1200"
                value={searchBudget}
                onChange={e => setSearchBudget(e.target.value)}
                style={{ display: "block", width: "100%", outline: "none", fontSize: 15, background: "transparent", marginTop: 4, border: "none", color: "#111", boxSizing: "border-box" }} />
            </div>
            <button type="submit" style={{ background: "#111", color: "white", padding: "16px 24px", fontWeight: 700, fontSize: 15, display: "block", border: "none", textAlign: "center", cursor: "pointer", fontFamily: "inherit", width: "100%" }}>
              Rechercher
            </button>
          </form>
        ) : (
          <form onSubmit={handleSearch} style={{ display: "flex", alignItems: "stretch", background: "white", borderRadius: 999, boxShadow: "0 4px 32px rgba(0,0,0,0.10)", width: "100%", maxWidth: 720, overflow: "hidden" }}>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, textAlign: "left", padding: "16px 24px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Ville</span>
              <input
                type="text"
                placeholder="Paris, Lyon, Bordeaux..."
                value={searchVille}
                onChange={e => setSearchVille(e.target.value)}
                style={{ outline: "none", fontSize: 15, background: "transparent", marginTop: 4, border: "none", color: "#111" }} />
            </div>
            <div style={{ width: 1, background: "#e5e7eb", margin: "12px 0" }} />
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, textAlign: "left", padding: "16px 24px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Budget max</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="1200 &euro;/mois"
                value={searchBudget}
                onChange={e => setSearchBudget(e.target.value)}
                style={{ outline: "none", fontSize: 15, background: "transparent", marginTop: 4, border: "none", color: "#111" }} />
            </div>
            <div style={{ width: 1, background: "#e5e7eb", margin: "12px 0" }} />
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, textAlign: "left", padding: "16px 24px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Type</span>
              <select
                value={searchType}
                onChange={e => setSearchType(e.target.value)}
                style={{ outline: "none", fontSize: 15, background: "transparent", marginTop: 4, border: "none", color: "#111" }}>
                <option value="">Tous</option><option value="Studio">Studio</option><option value="T2">T2</option><option value="T3">T3</option><option value="T4+">T4+</option>
              </select>
            </div>
            <button type="submit" style={{ background: "#111", color: "white", padding: "0 32px", fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", border: "none", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
              Rechercher
            </button>
          </form>
        )}
      </section>

      {/* Stats */}
      <section style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? "24px 16px" : 0, justifyItems: "center", padding: isMobile ? "32px 24px" : "40px 48px", borderTop: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb", background: "white" }}>
        {[
          { val: "2 400+", label: "Annonces actives" },
          { val: "0 €",    label: "De frais d'agence" },
          { val: "87%",    label: "Taux de matching moyen" },
          { val: "48h",    label: "Délai moyen de réponse" },
        ].map((s) => (
          <div key={s.label} style={{ textAlign: "center" }}>
            <p style={{ fontSize: isMobile ? 28 : 36, fontWeight: 800, letterSpacing: "-1px" }}>{s.val}</p>
            <p style={{ color: "#6b7280", marginTop: 4, fontSize: 13 }}>{s.label}</p>
          </div>
        ))}
      </section>

      {/* Features */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "48px 20px" : isTablet ? "60px 32px" : "80px 48px" }}>
        <h2 style={{ fontSize: isMobile ? 28 : isTablet ? 34 : 40, fontWeight: 800, textAlign: "center", marginBottom: isMobile ? 28 : 48, letterSpacing: "-1px" }}>Pourquoi NestMatch ?</h2>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "1fr 1fr 1fr", gap: 20 }}>
          {[
            { titre: "Score de matching", desc: "Notre algorithme analyse votre profil et vous propose les biens les plus compatibles avec votre style de vie." },
            { titre: "Dossier certifié",  desc: "Constituez votre dossier une seule fois. Il est vérifié et validé pour toutes vos candidatures." },
            { titre: "Gestion complète",  desc: "Bail, EDL, quittances de loyer — tous vos documents générés automatiquement en quelques clics." },
          ].map((f) => (
            <div key={f.titre} style={{ background: "white", borderRadius: 20, padding: isMobile ? 24 : 32 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{f.titre}</h3>
              <p style={{ color: "#6b7280", lineHeight: 1.6, fontSize: 14 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: "#111", color: "white", padding: isMobile ? "48px 24px" : "80px 48px", textAlign: "center" }}>
        <h2 style={{ fontSize: isMobile ? 28 : isTablet ? 36 : 44, fontWeight: 800, marginBottom: 14, letterSpacing: "-1px" }}>Prêt à trouver votre logement ?</h2>
        <p style={{ color: "#9ca3af", fontSize: isMobile ? 15 : 18, marginBottom: 32 }}>Rejoignez des milliers de locataires et propriétaires qui nous font confiance.</p>
        <a href="/auth" style={{ background: "white", color: "#111", padding: isMobile ? "14px 32px" : "16px 40px", borderRadius: 999, fontWeight: 700, fontSize: 15, textDecoration: "none", display: "inline-block" }}>
          Commencer gratuitement
        </a>
      </section>

    </main>
  )
}
