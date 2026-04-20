"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useResponsive } from "./hooks/useResponsive"
import CityAutocomplete from "./components/CityAutocomplete"
import { BRAND } from "../lib/brand"

export default function Home() {
  const { isMobile, isTablet } = useResponsive()
  const router = useRouter()
  const [searchVille, setSearchVille] = useState("")
  const [searchBudget, setSearchBudget] = useState("")

  function handleSearch(e?: React.FormEvent) {
    e?.preventDefault()
    const params = new URLSearchParams()
    if (searchVille.trim()) params.set("ville", searchVille.trim())
    const budget = searchBudget.replace(/[^0-9]/g, "")
    if (budget) params.set("budget_max", budget)
    const qs = params.toString()
    router.push(qs ? `/annonces?${qs}` : "/annonces")
  }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>

      {/* ═══ Hero ═══ */}
      <section style={{ position: "relative", overflow: "hidden", padding: isMobile ? "56px 20px 48px" : isTablet ? "80px 32px 64px" : "120px 48px 96px" }}>
        <div aria-hidden style={{ position: "absolute", top: "-20%", right: "-10%", width: 480, height: 480, background: "radial-gradient(circle, rgba(22,163,74,0.12) 0%, transparent 70%)", filter: "blur(40px)", pointerEvents: "none" }} />
        <div aria-hidden style={{ position: "absolute", bottom: "-20%", left: "-15%", width: 560, height: 560, background: "radial-gradient(circle, rgba(29,78,216,0.08) 0%, transparent 70%)", filter: "blur(40px)", pointerEvents: "none" }} />

        <div style={{ maxWidth: 1180, margin: "0 auto", position: "relative", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.05fr 0.95fr", gap: isMobile ? 40 : 56, alignItems: "center" }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "white", border: "1px solid #e5e7eb", padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, marginBottom: 24, color: "#111" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#16a34a" }} />
              100 % particuliers · 0 frais d&apos;agence
            </div>
            <h1 style={{ fontSize: isMobile ? 40 : isTablet ? 56 : 72, fontWeight: 800, lineHeight: 1.02, marginBottom: 20, letterSpacing: isMobile ? "-1.5px" : "-3px" }}>
              Votre logement.<br />
              <span style={{ background: "linear-gradient(135deg, #16a34a 0%, #1d4ed8 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Sans intermédiaire.</span>
            </h1>
            <p style={{ fontSize: isMobile ? 16 : 19, color: "#4b5563", maxWidth: 540, marginBottom: isMobile ? 28 : 36, lineHeight: 1.65 }}>
              {BRAND.name} connecte directement propriétaires et locataires. Dossier certifié, matching intelligent, bail électronique, état des lieux digital — tout au même endroit.
            </p>

            {isMobile ? (
              <form onSubmit={handleSearch} style={{ background: "white", borderRadius: 20, boxShadow: "0 8px 32px rgba(0,0,0,0.08)", width: "100%" }}>
                <div style={{ padding: "14px 18px", borderBottom: "1px solid #f3f4f6" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 4 }}>Ville</span>
                  <CityAutocomplete value={searchVille} onChange={setSearchVille} placeholder="Paris, Lyon, Bordeaux…" style={{ border: "none", padding: 0, fontSize: 15, background: "transparent" }} />
                </div>
                <div style={{ padding: "14px 18px", borderBottom: "1px solid #f3f4f6" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Budget max</span>
                  <input type="text" inputMode="numeric" placeholder="1200 €/mois" value={searchBudget} onChange={e => setSearchBudget(e.target.value)} style={{ display: "block", width: "100%", outline: "none", fontSize: 15, background: "transparent", marginTop: 4, border: "none", color: "#111", boxSizing: "border-box", fontFamily: "inherit" }} />
                </div>
                <button type="submit" style={{ background: "#111", color: "white", padding: "16px 24px", fontWeight: 700, fontSize: 15, display: "block", border: "none", textAlign: "center", cursor: "pointer", fontFamily: "inherit", width: "100%", borderRadius: "0 0 20px 20px" }}>
                  Rechercher →
                </button>
              </form>
            ) : (
              <form onSubmit={handleSearch} style={{ display: "flex", alignItems: "stretch", background: "white", borderRadius: 999, boxShadow: "0 8px 32px rgba(0,0,0,0.10)", width: "100%", maxWidth: 620 }}>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, textAlign: "left", padding: "14px 24px" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>Ville</span>
                  <CityAutocomplete value={searchVille} onChange={setSearchVille} placeholder="Paris, Lyon…" style={{ border: "none", padding: 0, fontSize: 14, background: "transparent" }} />
                </div>
                <div style={{ width: 1, background: "#e5e7eb", margin: "14px 0" }} />
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, textAlign: "left", padding: "14px 24px" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Budget max</span>
                  <input type="text" inputMode="numeric" placeholder="1200 €" value={searchBudget} onChange={e => setSearchBudget(e.target.value)} style={{ outline: "none", fontSize: 14, background: "transparent", marginTop: 2, border: "none", color: "#111", fontFamily: "inherit", width: "100%" }} />
                </div>
                <button type="submit" style={{ background: "#111", color: "white", padding: "0 28px", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", border: "none", cursor: "pointer", fontFamily: "inherit", flexShrink: 0, borderRadius: "0 999px 999px 0" }}>
                  Rechercher →
                </button>
              </form>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: isMobile ? 16 : 24, marginTop: 28, fontSize: 12, color: "#6b7280" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>🔒 Données chiffrées</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>⚖ Conforme ALUR</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>🇫🇷 Hébergé en France</span>
            </div>
          </div>

          {!isMobile && (
            <div style={{ position: "relative", minHeight: 500 }}>
              <div style={{ position: "absolute", top: 40, right: 40, width: 280, background: "white", borderRadius: 20, boxShadow: "0 16px 48px rgba(0,0,0,0.12)", overflow: "hidden", transform: "rotate(-3deg)" }}>
                <div style={{ height: 140, background: "linear-gradient(135deg, #fde68a 0%, #fbbf24 100%)", display: "flex", alignItems: "flex-end", padding: 14 }}>
                  <span style={{ background: "rgba(255,255,255,0.95)", padding: "4px 10px", borderRadius: 999, fontSize: 10, fontWeight: 700, color: "#111" }}>Appartement · Lyon 3e</span>
                </div>
                <div style={{ padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <p style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>T2 lumineux, balcon</p>
                    <span style={{ background: "#dcfce7", color: "#15803d", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>92%</span>
                  </div>
                  <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>42 m² · 850 €/mois · DPE C</p>
                </div>
              </div>
              <div style={{ position: "absolute", top: 180, left: 20, width: 300, background: "white", borderRadius: 20, boxShadow: "0 16px 48px rgba(0,0,0,0.12)", padding: 18, transform: "rotate(2deg)" }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>Score matching</p>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{ flex: 1, height: 8, background: "#f3f4f6", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: "87%", height: "100%", background: "linear-gradient(90deg, #16a34a, #22c55e)", borderRadius: 999 }} />
                  </div>
                  <span style={{ fontSize: 18, fontWeight: 800 }}>87%</span>
                </div>
                {[
                  { label: "Budget", v: "Excellent", color: "#15803d" },
                  { label: "Surface", v: "Idéal", color: "#15803d" },
                  { label: "DPE", v: "Bon", color: "#1d4ed8" },
                ].map(r => (
                  <div key={r.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0" }}>
                    <span style={{ color: "#6b7280" }}>{r.label}</span>
                    <span style={{ fontWeight: 700, color: r.color }}>{r.v}</span>
                  </div>
                ))}
              </div>
              <div style={{ position: "absolute", bottom: 40, right: 60, width: 260, background: "white", borderRadius: 20, boxShadow: "0 16px 48px rgba(0,0,0,0.12)", padding: 16, transform: "rotate(-2deg)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ background: "#dcfce7", color: "#15803d", width: 28, height: 28, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>✓</span>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 800, margin: 0 }}>Bail signé</p>
                    <p style={{ fontSize: 10, color: "#9ca3af", margin: 0 }}>Électroniquement · eIDAS</p>
                  </div>
                </div>
                <div style={{ height: 1, background: "#f3f4f6", margin: "10px 0" }} />
                <p style={{ fontSize: 11, color: "#6b7280", margin: 0, lineHeight: 1.5 }}>Bail + EDL + quittances générés automatiquement.</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ═══ Stats ═══ */}
      <section style={{ background: "white", borderTop: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb", padding: isMobile ? "28px 20px" : "36px 48px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? 20 : 24 }}>
          {[
            { icon: "🏠", val: "0 €", label: "De frais d'agence" },
            { icon: "⚡", val: "5 min", label: "Pour publier un bien" },
            { icon: "📄", val: "ALUR", label: "Baux conformes" },
            { icon: "🔐", val: "eIDAS", label: "Signatures légales" },
          ].map((s) => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>{s.icon}</div>
              <p style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, letterSpacing: "-0.5px", margin: 0 }}>{s.val}</p>
              <p style={{ color: "#6b7280", marginTop: 4, fontSize: 12 }}>{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ Comment ça marche ═══ */}
      <section style={{ maxWidth: 1180, margin: "0 auto", padding: isMobile ? "64px 20px 32px" : "112px 48px 48px" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: "1.5px", textAlign: "center", marginBottom: 14 }}>Comment ça marche</p>
        <h2 style={{ fontSize: isMobile ? 30 : 48, fontWeight: 800, textAlign: "center", marginBottom: isMobile ? 12 : 20, letterSpacing: "-1.5px", lineHeight: 1.1 }}>
          3 étapes. Aucune paperasse.
        </h2>
        <p style={{ textAlign: "center", color: "#6b7280", fontSize: isMobile ? 15 : 17, maxWidth: 560, margin: "0 auto 48px", lineHeight: 1.6 }}>
          Conçu pour que la location soit rapide, sécurisée et sans agence.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: isMobile ? 16 : 20 }}>
          {[
            { n: "01", color: "#16a34a", titre: "Créez votre profil", desc: "Budget, critères, situation pro, garant. Dossier ALUR prêt pour toutes vos candidatures en 3 minutes." },
            { n: "02", color: "#1d4ed8", titre: "Explorez avec matching", desc: "Chaque annonce notée de 0 à 100% selon votre compatibilité. Filtres carte, tri intelligent, favoris." },
            { n: "03", color: "#111", titre: "Contactez, visitez, signez", desc: "Messagerie directe, visites en un clic, bail électronique + EDL digital avec signatures eIDAS." },
          ].map((f) => (
            <div key={f.n} style={{ background: "white", borderRadius: 24, padding: isMobile ? 28 : 36, border: "1px solid #f3f4f6" }}>
              <div style={{ width: 44, height: 44, background: f.color, color: "white", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, marginBottom: 16 }}>{f.n}</div>
              <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 10, letterSpacing: "-0.3px" }}>{f.titre}</h3>
              <p style={{ color: "#6b7280", lineHeight: 1.65, fontSize: 14 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ Locataires ═══ */}
      <section style={{ maxWidth: 1180, margin: "0 auto", padding: isMobile ? "48px 20px" : "80px 48px" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 32 : 64, alignItems: "center" }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 14 }}>✨ Pour les locataires</p>
            <h2 style={{ fontSize: isMobile ? 28 : 40, fontWeight: 800, marginBottom: 18, letterSpacing: "-1px", lineHeight: 1.15 }}>
              Un dossier complet.<br />Toutes vos candidatures.
            </h2>
            <p style={{ color: "#6b7280", fontSize: isMobile ? 15 : 16, lineHeight: 1.7, marginBottom: 28 }}>
              Plus besoin d&apos;envoyer 30 fois les mêmes documents. Votre dossier est prêt, conforme ALUR, partagé en 1 clic. Le score de matching sélectionne les bonnes annonces pour vous.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 28 }}>
              {[
                { k: "🎯", t: "Score de compatibilité", d: "Les annonces triées par pertinence — budget, surface, équipements, DPE." },
                { k: "💬", t: "Messagerie directe", d: "Discutez sans intermédiaire. Visite, dossier, bail : tout dans la conv." },
                { k: "📄", t: "Dossier certifié", d: "Revenus, garant, pièces d'identité — vérifiés une fois, partagés à tous." },
                { k: "✍", t: "Signature électronique", d: "Bail + EDL signés en ligne, valeur légale (eIDAS niveau 1)." },
              ].map(b => (
                <div key={b.t} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={{ width: 40, height: 40, background: "#f0fdf4", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{b.k}</div>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 800, margin: 0, marginBottom: 2 }}>{b.t}</p>
                    <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.55, margin: 0 }}>{b.d}</p>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/auth?mode=inscription" style={{ background: "#16a34a", color: "white", padding: "14px 28px", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 14, display: "inline-block" }}>
              Créer mon dossier gratuitement →
            </Link>
          </div>
          <div style={{ background: "white", borderRadius: 24, padding: 20, boxShadow: "0 16px 48px rgba(0,0,0,0.08)", border: "1px solid #f3f4f6" }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {["#ef4444", "#fbbf24", "#22c55e"].map(c => <span key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />)}
            </div>
            <div style={{ background: "#F7F4EF", borderRadius: 14, padding: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>Mon dossier</p>
              {[
                { l: "Pièce d'identité", s: "Validée", c: "#15803d" },
                { l: "Dernier avis d'imposition", s: "Validé", c: "#15803d" },
                { l: "3 derniers bulletins de salaire", s: "Validés", c: "#15803d" },
                { l: "Contrat de travail (CDI)", s: "Validé", c: "#15803d" },
                { l: "Garant (parent)", s: "Vérifié", c: "#1d4ed8" },
              ].map(r => (
                <div key={r.l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "white", borderRadius: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "#111" }}>{r.l}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: r.c }}>✓ {r.s}</span>
                </div>
              ))}
              <div style={{ marginTop: 12, padding: "10px 12px", background: "#dcfce7", border: "1.5px solid #86efac", borderRadius: 10, fontSize: 11, color: "#15803d", fontWeight: 700, textAlign: "center" }}>
                Dossier 100% complet — partageable
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Propriétaires ═══ */}
      <section style={{ background: "#111", color: "white", padding: isMobile ? "48px 20px" : "80px 48px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 32 : 64, alignItems: "center" }}>
          <div style={{ order: isMobile ? 2 : 1, background: "#1a1a1a", borderRadius: 24, padding: 20, border: "1px solid #333" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <p style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>Dashboard propriétaire</p>
              <span style={{ background: "#dcfce7", color: "#15803d", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>Live</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              {[
                { val: "3", label: "Biens loués", color: "#22c55e" },
                { val: "7", label: "Candidatures", color: "#fbbf24" },
                { val: "2100€", label: "Loyers mensuels", color: "white" },
                { val: "3", label: "Quittances envoyées", color: "#60a5fa" },
              ].map(s => (
                <div key={s.label} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 12 }}>
                  <p style={{ fontSize: 18, fontWeight: 800, color: s.color, margin: 0 }}>{s.val}</p>
                  <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 2, margin: 0 }}>{s.label}</p>
                </div>
              ))}
            </div>
            <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Revenus 6 derniers mois</p>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 60 }}>
                {[40, 55, 50, 70, 65, 85].map((h, i) => (
                  <div key={i} style={{ flex: 1, height: `${h}%`, background: "linear-gradient(180deg, #22c55e 0%, #15803d 100%)", borderRadius: "4px 4px 0 0" }} />
                ))}
              </div>
            </div>
          </div>

          <div style={{ order: isMobile ? 1 : 2 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 14 }}>🏡 Pour les propriétaires</p>
            <h2 style={{ fontSize: isMobile ? 28 : 40, fontWeight: 800, marginBottom: 18, letterSpacing: "-1px", lineHeight: 1.15 }}>
              Louez plus vite.<br />Gérez plus simplement.
            </h2>
            <p style={{ color: "#9ca3af", fontSize: isMobile ? 15 : 16, lineHeight: 1.7, marginBottom: 28 }}>
              Recevez des candidatures préparées. Signez le bail, faites l&apos;EDL, encaissez les loyers — tout depuis un tableau de bord unique.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 28 }}>
              {[
                { t: "Candidats qualifiés", d: "Score dossier + revenus + situation pro visibles d'emblée." },
                { t: "Publier en 5 minutes", d: "Photos, description, DPE — ton annonce en ligne immédiatement." },
                { t: "Bail + EDL électroniques", d: "PDF générés, signatures légales, audit trail complet." },
                { t: "Suivi des loyers", d: "Auto-paiement mensuel, quittances automatiques, relances." },
              ].map(b => (
                <div key={b.t} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={{ width: 36, height: 36, background: "rgba(251,191,36,0.15)", color: "#fbbf24", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 }}>✓</div>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 800, margin: 0, marginBottom: 2, color: "white" }}>{b.t}</p>
                    <p style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.55, margin: 0 }}>{b.d}</p>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/auth?mode=inscription" style={{ background: "white", color: "#111", padding: "14px 28px", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 14, display: "inline-block" }}>
              Publier un bien gratuitement →
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <FAQSection isMobile={isMobile} />

      {/* ═══ CTA final ═══ */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "56px 20px 80px" : "96px 48px 120px" }}>
        <div style={{ background: "linear-gradient(135deg, #16a34a 0%, #1d4ed8 100%)", borderRadius: 32, padding: isMobile ? "40px 24px" : "64px 48px", textAlign: "center", color: "white" }}>
          <h2 style={{ fontSize: isMobile ? 28 : isTablet ? 36 : 46, fontWeight: 800, marginBottom: 14, letterSpacing: "-1px", lineHeight: 1.15 }}>
            Prêt à changer de logement ?
          </h2>
          <p style={{ color: "rgba(255,255,255,0.9)", fontSize: isMobile ? 15 : 18, marginBottom: 32, maxWidth: 560, margin: isMobile ? "0 auto 24px" : "0 auto 36px", lineHeight: 1.6 }}>
            Inscription en 2 minutes. Gratuit, sans engagement, conforme ALUR.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/auth?mode=inscription" style={{ background: "white", color: "#111", padding: isMobile ? "14px 28px" : "16px 36px", borderRadius: 999, fontWeight: 700, fontSize: 15, textDecoration: "none", display: "inline-block" }}>
              Commencer gratuitement
            </Link>
            <Link href="/annonces" style={{ background: "transparent", color: "white", padding: isMobile ? "14px 28px" : "16px 36px", borderRadius: 999, fontWeight: 700, fontSize: 15, textDecoration: "none", display: "inline-block", border: "1.5px solid rgba(255,255,255,0.4)" }}>
              Voir les annonces
            </Link>
          </div>
        </div>
      </section>

    </main>
  )
}

const FAQ_ITEMS = [
  { q: "KeyMatch est-il vraiment gratuit ?", r: "Oui, l'inscription et l'utilisation sont 100% gratuites pour les locataires et les propriétaires. Aucune commission n'est prélevée sur les loyers." },
  { q: "Comment fonctionne le score de compatibilité ?", r: "Notre algorithme compare vos critères (budget, surface, localisation, équipements, DPE) aux caractéristiques de chaque annonce. Le score va de 0 à 100% et prend en compte 7 dimensions." },
  { q: "Mon dossier est-il sécurisé ?", r: "Vos documents sont stockés de manière chiffrée. Ils ne sont partagés qu'avec les propriétaires que vous contactez, et uniquement après votre accord explicite." },
  { q: "Les annonces sont-elles vérifiées ?", r: "Chaque bien est publié par un propriétaire vérifié par email. Les annonces frauduleuses sont signalables en un clic et examinées manuellement." },
  { q: "Le bail électronique a-t-il une valeur légale ?", r: "Oui, la signature électronique simple (eIDAS niveau 1) est parfaitement légale pour un bail d'habitation civil (article 1366 du Code civil)." },
  { q: "Que se passe-t-il en cas de litige ?", r: "Le carnet d'entretien intégré permet de documenter les incidents. En cas de litige sérieux, nous recommandons la commission départementale de conciliation." },
]

function FAQSection({ isMobile }: { isMobile: boolean }) {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map(f => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.r },
    })),
  }
  return (
    <section style={{ maxWidth: 840, margin: "0 auto", padding: isMobile ? "64px 20px 32px" : "96px 48px 48px" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, "\\u003c") }} />
      <p style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "1.5px", textAlign: "center", marginBottom: 14 }}>Questions fréquentes</p>
      <h2 style={{ fontSize: isMobile ? 28 : 42, fontWeight: 800, textAlign: "center", marginBottom: isMobile ? 28 : 40, letterSpacing: "-1px", lineHeight: 1.1 }}>
        Tout ce que vous vous demandez.
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {FAQ_ITEMS.map(f => (
          <details key={f.q} style={{ background: "white", borderRadius: 16, padding: "18px 24px", border: "1px solid #f3f4f6" }}>
            <summary style={{ fontSize: 15, fontWeight: 700, cursor: "pointer", listStyle: "none", display: "flex", justifyContent: "space-between", alignItems: "center", color: "#111" }}>
              {f.q}
              <span style={{ color: "#6b7280", fontSize: 20, fontWeight: 400 }}>+</span>
            </summary>
            <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.7, marginTop: 14 }}>{f.r}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
