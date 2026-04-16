"use client"

export default function Home() {
  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>

      {/* Hero */}
      <section style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "80px 24px 60px" }}>
        <div style={{ background: "#111", color: "white", padding: "6px 16px", borderRadius: 999, fontSize: 12, fontWeight: 700, letterSpacing: "1px", marginBottom: 24, textTransform: "uppercase" }}>
          Location entre particuliers · Zéro agence
        </div>
        <h1 style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, maxWidth: 700, marginBottom: 20, letterSpacing: "-2px" }}>
          Trouvez votre logement.<br />
          <span style={{ color: "#6b7280" }}>Sans agence.</span>
        </h1>
        <p style={{ fontSize: 20, color: "#6b7280", maxWidth: 520, marginBottom: 48, lineHeight: 1.6 }}>
          NestMatch connecte directement propriétaires et locataires. Dossier certifié, gestion des loyers, score de matching — tout au même endroit.
        </p>

        {/* Barre de recherche */}
        <div style={{ display: "flex", alignItems: "stretch", background: "white", borderRadius: 999, boxShadow: "0 4px 32px rgba(0,0,0,0.10)", width: "100%", maxWidth: 720, overflow: "hidden" }}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, textAlign: "left", padding: "16px 24px" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Ville</span>
            <input type="text" placeholder="Paris, Lyon, Bordeaux..." style={{ outline: "none", fontSize: 15, background: "transparent", marginTop: 4, border: "none", color: "#111" }} />
          </div>
          <div style={{ width: 1, background: "#e5e7eb", margin: "12px 0" }} />
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, textAlign: "left", padding: "16px 24px" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Budget max</span>
            <input type="text" placeholder="1 200 €/mois" style={{ outline: "none", fontSize: 15, background: "transparent", marginTop: 4, border: "none", color: "#111" }} />
          </div>
          <div style={{ width: 1, background: "#e5e7eb", margin: "12px 0" }} />
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, textAlign: "left", padding: "16px 24px" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Type</span>
            <select style={{ outline: "none", fontSize: 15, background: "transparent", marginTop: 4, border: "none", color: "#111" }}>
              <option>Tous</option>
              <option>Studio</option>
              <option>T2</option>
              <option>T3</option>
              <option>T4+</option>
            </select>
          </div>
          <a href="/annonces" style={{ background: "#111", color: "white", padding: "0 32px", fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", textDecoration: "none", flexShrink: 0 }}>
            Rechercher
          </a>
        </div>
      </section>

      {/* Stats */}
      <section style={{ display: "flex", justifyContent: "center", gap: 64, padding: "40px 48px", borderTop: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb", background: "white" }}>
        {[
          { val: "2 400+", label: "Annonces actives" },
          { val: "0 €", label: "De frais d'agence" },
          { val: "87%", label: "Taux de matching moyen" },
          { val: "48h", label: "Délai moyen de réponse" },
        ].map((s) => (
          <div key={s.label} style={{ textAlign: "center" }}>
            <p style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-1px" }}>{s.val}</p>
            <p style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>{s.label}</p>
          </div>
        ))}
      </section>

      {/* Features */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 48px" }}>
        <h2 style={{ fontSize: 40, fontWeight: 800, textAlign: "center", marginBottom: 48, letterSpacing: "-1px" }}>Pourquoi NestMatch ?</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
          {[
            { titre: "Score de matching", desc: "Notre algorithme analyse votre profil et vous propose les biens les plus compatibles avec votre style de vie." },
            { titre: "Dossier certifié", desc: "Constituez votre dossier une seule fois. Il est vérifié et validé pour toutes vos candidatures." },
            { titre: "Gestion complète", desc: "Bail, EDL, quittances de loyer — tous vos documents générés automatiquement en quelques clics." },
          ].map((f) => (
            <div key={f.titre} style={{ background: "white", borderRadius: 20, padding: 32 }}>
              <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>{f.titre}</h3>
              <p style={{ color: "#6b7280", lineHeight: 1.6, fontSize: 15 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: "#111", color: "white", padding: "80px 48px", textAlign: "center" }}>
        <h2 style={{ fontSize: 44, fontWeight: 800, marginBottom: 16, letterSpacing: "-1px" }}>Prêt à trouver votre logement ?</h2>
        <p style={{ color: "#9ca3af", fontSize: 18, marginBottom: 36 }}>Rejoignez des milliers de locataires et propriétaires qui nous font confiance.</p>
        <a href="/auth" style={{ background: "white", color: "#111", padding: "16px 40px", borderRadius: 999, fontWeight: 700, fontSize: 16, textDecoration: "none", display: "inline-block" }}>
          Commencer gratuitement
        </a>
      </section>

    </main>
  )
}
