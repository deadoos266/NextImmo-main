export default function Footer() {
  const col: any = { display: "flex", flexDirection: "column", gap: 8 }
  const link: any = { color: "#6b7280", textDecoration: "none", fontSize: 13, fontWeight: 400, lineHeight: 1.5 }
  const head: any = { fontSize: 12, fontWeight: 800, color: "#111", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }

  return (
    <footer style={{ background: "white", borderTop: "1px solid #e5e7eb", fontFamily: "'DM Sans', sans-serif", marginTop: 80 }}>

      {/* Bloc principal */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "52px 48px 40px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 40 }}>

          {/* Par localités */}
          <div style={col}>
            <p style={head}>Par localités</p>
            {["Par types de bien", "Appartements", "Maisons", "Studios", "Colocations", "Logements meublés"].map(l => (
              <a key={l} href="#" style={link}>{l}</a>
            ))}
            <div style={{ marginTop: 8 }} />
            <p style={head}>Par commodités</p>
            {["Avec parking", "Avec balcon", "Animaux acceptés", "Fibre optique", "Ascenseur"].map(l => (
              <a key={l} href="#" style={link}>{l}</a>
            ))}
          </div>

          {/* L'immobilier */}
          <div style={col}>
            <p style={head}>L'immobilier</p>
            {[
              "Estimation & prix",
              "Toutes les villes",
              "Tous les départements",
              "Toutes les régions",
            ].map(l => (
              <a key={l} href="#" style={link}>{l}</a>
            ))}
            <div style={{ marginTop: 8 }} />
            <p style={head}>Par régions</p>
            {["Île-de-France", "Auvergne-Rhône-Alpes", "Provence-Alpes-Côte d'Azur", "Nouvelle-Aquitaine", "Occitanie"].map(l => (
              <a key={l} href="#" style={link}>{l}</a>
            ))}
          </div>

          {/* Par villes */}
          <div style={col}>
            <p style={head}>Immobilier par villes</p>
            {["Paris", "Lyon", "Marseille", "Toulouse", "Bordeaux", "Nantes", "Lille", "Strasbourg", "Montpellier", "Nice"].map(l => (
              <a key={l} href={`/annonces?ville=${encodeURIComponent(l)}`} style={link}>{l}</a>
            ))}
          </div>

          {/* Aide & Entreprise */}
          <div style={col}>
            <p style={head}>Aide & FAQ</p>
            {["Comment fonctionne NestMatch ?", "Je suis locataire", "Je suis propriétaire", "Sécurité et vérifications", "Dossier locataire", "Contact"].map(l => (
              <a key={l} href="#" style={link}>{l}</a>
            ))}
            <div style={{ marginTop: 8 }} />
            <p style={head}>L'entreprise</p>
            {["Qui sommes-nous ?", "Nous recrutons", "Notre espace presse", "Mentions légales", "CGU"].map(l => (
              <a key={l} href="#" style={link}>{l}</a>
            ))}
          </div>

          {/* Services pro */}
          <div style={col}>
            <p style={head}>Services pro</p>
            {["Tous nos services pro", "Accès client", "Annuaire des professionnels", "Diffuser une annonce", "Solutions agences"].map(l => (
              <a key={l} href="#" style={link}>{l}</a>
            ))}
            <div style={{ marginTop: 8 }} />
            <p style={head}>À découvrir</p>
            {["Guide du locataire", "Guide du propriétaire", "Bail en ligne", "Quittances PDF", "Estimation gratuite"].map(l => (
              <a key={l} href="#" style={link}>{l}</a>
            ))}

            {/* App badge */}
            <div style={{ marginTop: 16, background: "#111", borderRadius: 12, padding: "12px 14px", display: "inline-flex", alignItems: "center", gap: 10 }}>
              <div>
                <p style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600 }}>Decouvrir</p>
                <p style={{ fontSize: 13, color: "white", fontWeight: 700 }}>L'app NestMatch</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Barre basse */}
      <div style={{ borderTop: "1px solid #f3f4f6", padding: "20px 48px", maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.5px" }}>NestMatch</span>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>© {new Date().getFullYear()} NestMatch — Location entre particuliers</span>
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          {["Confidentialité", "Cookies", "CGU", "Mentions légales"].map(l => (
            <a key={l} href="#" style={{ fontSize: 12, color: "#9ca3af", textDecoration: "none" }}>{l}</a>
          ))}
        </div>
      </div>
    </footer>
  )
}
