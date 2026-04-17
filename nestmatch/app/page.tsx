"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useResponsive } from "./hooks/useResponsive"
import CityAutocomplete from "./components/CityAutocomplete"

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
          Location entre particuliers · Sans agence
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
          <form onSubmit={handleSearch} style={{ display: "flex", flexDirection: "column", background: "white", borderRadius: 20, boxShadow: "0 4px 24px rgba(0,0,0,0.10)", width: "100%", position: "relative" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #f3f4f6" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 4 }}>Ville</span>
              <CityAutocomplete
                value={searchVille}
                onChange={setSearchVille}
                placeholder="Paris, Lyon, Bordeaux..."
                style={{ border: "none", padding: 0, fontSize: 15, background: "transparent" }}
              />
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
            <button type="submit" style={{ background: "#111", color: "white", padding: "16px 24px", fontWeight: 700, fontSize: 15, display: "block", border: "none", textAlign: "center", cursor: "pointer", fontFamily: "inherit", width: "100%", borderRadius: "0 0 20px 20px" }}>
              Rechercher
            </button>
          </form>
        ) : (
          <form onSubmit={handleSearch} style={{ display: "flex", alignItems: "stretch", background: "white", borderRadius: 999, boxShadow: "0 4px 32px rgba(0,0,0,0.10)", width: "100%", maxWidth: 720, position: "relative" }}>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, textAlign: "left", padding: "16px 24px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Ville</span>
              <CityAutocomplete
                value={searchVille}
                onChange={setSearchVille}
                placeholder="Paris, Lyon, Bordeaux..."
                style={{ border: "none", padding: 0, fontSize: 15, background: "transparent" }}
              />
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
            <button type="submit" style={{ background: "#111", color: "white", padding: "0 32px", fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", border: "none", cursor: "pointer", fontFamily: "inherit", flexShrink: 0, borderRadius: "0 999px 999px 0" }}>
              Rechercher
            </button>
          </form>
        )}
      </section>

      {/* Bandeau valeurs (sans stats inventees) */}
      <section style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? "24px 16px" : 0, justifyItems: "center", padding: isMobile ? "32px 24px" : "40px 48px", borderTop: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb", background: "white" }}>
        {[
          { val: "0 €", label: "De frais d'agence" },
          { val: "P2P", label: "Proprietaire direct" },
          { val: "ALUR", label: "Dossier conforme" },
          { val: "100%", label: "En ligne" },
        ].map((s) => (
          <div key={s.label} style={{ textAlign: "center" }}>
            <p style={{ fontSize: isMobile ? 28 : 36, fontWeight: 800, letterSpacing: "-1px" }}>{s.val}</p>
            <p style={{ color: "#6b7280", marginTop: 4, fontSize: 13 }}>{s.label}</p>
          </div>
        ))}
      </section>

      {/* Comment ca marche — 3 etapes */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "56px 20px 24px" : isTablet ? "72px 32px 32px" : "96px 48px 40px" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "1.5px", textAlign: "center", marginBottom: 14 }}>Comment ça marche</p>
        <h2 style={{ fontSize: isMobile ? 28 : isTablet ? 34 : 42, fontWeight: 800, textAlign: "center", marginBottom: isMobile ? 36 : 56, letterSpacing: "-1px" }}>
          Trois étapes<br /><span style={{ color: "#6b7280" }}>et vous signez.</span>
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: isMobile ? 16 : 24 }}>
          {[
            { n: "01", titre: "Créez votre profil", desc: "Budget, critères, situation pro, garant. Une fois rempli, votre dossier est prêt pour toutes vos candidatures." },
            { n: "02", titre: "Explorez avec un score personnalisé", desc: "Chaque annonce est notée selon votre compatibilité : budget, surface, équipements, localisation. Filtres carte inclus." },
            { n: "03", titre: "Contactez, visitez, signez", desc: "Messagerie intégrée, demande de visite en un clic, bail et état des lieux générés automatiquement." },
          ].map((f) => (
            <div key={f.n} style={{ background: "white", borderRadius: 20, padding: isMobile ? 24 : 32, position: "relative" }}>
              <p style={{ fontSize: 52, fontWeight: 800, color: "#f3f4f6", letterSpacing: "-2px", lineHeight: 1, marginBottom: 12 }}>{f.n}</p>
              <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{f.titre}</h3>
              <p style={{ color: "#6b7280", lineHeight: 1.6, fontSize: 14 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Benefices locataire */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "48px 20px" : "72px 48px" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1.2fr", gap: isMobile ? 24 : 48, alignItems: "center" }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 14 }}>Pour les locataires</p>
            <h2 style={{ fontSize: isMobile ? 26 : 36, fontWeight: 800, marginBottom: 16, letterSpacing: "-1px", lineHeight: 1.15 }}>
              Un dossier. Toutes vos candidatures.
            </h2>
            <p style={{ color: "#6b7280", fontSize: 15, lineHeight: 1.7, marginBottom: 24 }}>
              Plus besoin d&apos;envoyer 30 fois les mêmes documents. Votre dossier NestMatch est prêt, conforme ALUR, et partageable en un clic avec chaque propriétaire.
            </p>
            <a href="/auth?mode=inscription" style={{ background: "#111", color: "white", padding: "14px 28px", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 14, display: "inline-block" }}>
              Créer mon dossier
            </a>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { titre: "Score de compatibilité", desc: "Les bonnes annonces, triées pour vous." },
              { titre: "Messagerie directe", desc: "Discutez sans intermédiaire avec le propriétaire." },
              { titre: "Visites organisées", desc: "Créneaux proposés, confirmation en un clic." },
              { titre: "Dossier certifié", desc: "Justificatifs prêts, partagés en sécurité." },
            ].map(b => (
              <div key={b.titre} style={{ background: "white", borderRadius: 14, padding: "18px 20px", borderLeft: "4px solid #16a34a" }}>
                <p style={{ fontSize: 14, fontWeight: 800, marginBottom: 3 }}>{b.titre}</p>
                <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefices proprietaire */}
      <section style={{ background: "white", padding: isMobile ? "48px 20px" : "72px 48px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1fr", gap: isMobile ? 24 : 48, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, order: isMobile ? 2 : 1 }}>
            {[
              { titre: "Candidats qualifiés", desc: "Score de qualité dossier, revenus, situation pro visibles d'emblée." },
              { titre: "Publier en 5 min", desc: "Photos, description, DPE. Annonce en ligne immédiatement." },
              { titre: "Baux & EDL générés", desc: "Documents conformes, prêts à signer, PDF téléchargeables." },
              { titre: "Suivi des loyers", desc: "Quittances automatiques, tableau de bord clair." },
            ].map(b => (
              <div key={b.titre} style={{ background: "#F7F4EF", borderRadius: 14, padding: "18px 20px", borderLeft: "4px solid #111" }}>
                <p style={{ fontSize: 14, fontWeight: 800, marginBottom: 3 }}>{b.titre}</p>
                <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>{b.desc}</p>
              </div>
            ))}
          </div>
          <div style={{ order: isMobile ? 1 : 2 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#111", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 14 }}>Pour les propriétaires</p>
            <h2 style={{ fontSize: isMobile ? 26 : 36, fontWeight: 800, marginBottom: 16, letterSpacing: "-1px", lineHeight: 1.15 }}>
              Louez plus vite. Gérez plus simplement.
            </h2>
            <p style={{ color: "#6b7280", fontSize: 15, lineHeight: 1.7, marginBottom: 24 }}>
              Recevez des candidatures déjà préparées, avec dossier complet. Signez, encaissez, gérez — tout depuis un seul tableau de bord.
            </p>
            <a href="/auth?mode=inscription" style={{ background: "#111", color: "white", padding: "14px 28px", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 14, display: "inline-block" }}>
              Publier un bien
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 800, margin: "0 auto", padding: isMobile ? "48px 20px" : "72px 48px" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "1.5px", textAlign: "center", marginBottom: 14 }}>Questions fréquentes</p>
        <h2 style={{ fontSize: isMobile ? 26 : 36, fontWeight: 800, textAlign: "center", marginBottom: isMobile ? 28 : 40, letterSpacing: "-1px" }}>
          Tout ce que vous vous demandez.
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { q: "NestMatch est-il vraiment gratuit ?", r: "Oui, l'inscription et l'utilisation sont 100% gratuites pour les locataires et les propriétaires. Aucune commission n'est prélevée sur les loyers." },
            { q: "Comment fonctionne le score de compatibilité ?", r: "Notre algorithme compare vos critères (budget, surface, localisation, équipements, DPE) aux caractéristiques de chaque annonce. Le score va de 0 à 100% et prend en compte 7 dimensions." },
            { q: "Mon dossier est-il sécurisé ?", r: "Vos documents sont stockés de manière chiffrée. Ils ne sont partagés qu'avec les propriétaires que vous contactez, et uniquement après votre accord explicite." },
            { q: "Les annonces sont-elles vérifiées ?", r: "Chaque bien est publié par un propriétaire vérifié par email. Les annonces frauduleuses sont signalables en un clic et examinées manuellement." },
            { q: "Puis-je générer un bail depuis NestMatch ?", r: "Oui, une fois la candidature acceptée, le bail est généré automatiquement au format PDF, conforme à la loi ALUR. L'état des lieux peut également être réalisé en ligne." },
            { q: "Que se passe-t-il si j'ai un problème avec mon logement ?", r: "Le carnet d'entretien intégré permet au locataire et au propriétaire de documenter les incidents et travaux. En cas de litige sérieux, nous recommandons la commission départementale de conciliation." },
          ].map((f) => (
            <details key={f.q} style={{ background: "white", borderRadius: 14, padding: "18px 20px", border: "1px solid #f3f4f6" }}>
              <summary style={{ fontSize: 15, fontWeight: 700, cursor: "pointer", listStyle: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {f.q}
                <span style={{ color: "#6b7280", fontSize: 18, fontWeight: 400 }}>+</span>
              </summary>
              <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.7, marginTop: 12 }}>{f.r}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Features (conserve la section existante) */}
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
      <section style={{ background: "#111", color: "white", padding: isMobile ? "56px 24px" : "96px 48px", textAlign: "center" }}>
        <h2 style={{ fontSize: isMobile ? 28 : isTablet ? 36 : 46, fontWeight: 800, marginBottom: 14, letterSpacing: "-1px" }}>Prêt à trouver votre logement ?</h2>
        <p style={{ color: "#9ca3af", fontSize: isMobile ? 15 : 18, marginBottom: 32, maxWidth: 560, margin: isMobile ? "0 auto 24px" : "0 auto 36px" }}>
          Créez votre profil en 2 minutes. Gratuit, sans engagement, conforme ALUR.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/auth?mode=inscription" style={{ background: "white", color: "#111", padding: isMobile ? "14px 28px" : "16px 36px", borderRadius: 999, fontWeight: 700, fontSize: 15, textDecoration: "none", display: "inline-block" }}>
            Commencer gratuitement
          </a>
          <a href="/annonces" style={{ background: "transparent", color: "white", padding: isMobile ? "14px 28px" : "16px 36px", borderRadius: 999, fontWeight: 700, fontSize: 15, textDecoration: "none", display: "inline-block", border: "1.5px solid rgba(255,255,255,0.3)" }}>
            Voir les annonces
          </a>
        </div>
      </section>

    </main>
  )
}
