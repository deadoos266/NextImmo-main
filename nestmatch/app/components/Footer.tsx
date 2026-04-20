"use client"
import { useResponsive } from "../hooks/useResponsive"
import { useRole } from "../providers"
import Logo from "./Logo"

/**
 * Footer Keymatch-immo — restyle éditorial 2026-04-20.
 *
 * ⚠️ Restyle uniquement (Paul : "modifier le footer uniquement sur le style,
 * pas la structure ni les liens"). Structure + liens inchangés. Seuls les
 * tokens visuels (couleurs, typo, espacements, séparateurs) ont été ajustés
 * pour coller à la charte éditoriale (#F7F4EF / #111 / #EAE6DF, weight 300-500).
 * Mention copyright passe de "Location entre particuliers" à "Key Match"
 * conformément à la spec.
 */
export default function Footer() {
  const { isMobile } = useResponsive()
  const { proprietaireActive } = useRole()
  const col: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 10 }
  const link: React.CSSProperties = {
    color: "#666",
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 400,
    lineHeight: 1.6,
    transition: "color 200ms ease",
  }
  const head: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: "#111",
    textTransform: "uppercase",
    letterSpacing: "1.4px",
    marginBottom: 4,
  }

  return (
    <footer style={{
      background: "#F7F4EF",
      borderTop: "1px solid #EAE6DF",
      fontFamily: "'DM Sans', sans-serif",
      marginTop: isMobile ? 40 : 80,
    }}>

      {/* Bloc principal */}
      <div style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: isMobile ? "48px 20px 32px" : "72px 48px 48px",
      }}>
        {/* Logo + baseline en haut */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: isMobile ? 32 : 48,
          paddingBottom: isMobile ? 24 : 32,
          borderBottom: "1px solid #EAE6DF",
        }}>
          <Logo variant="footer" asLink={false} />
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
          gap: isMobile ? 32 : 48,
        }}>

          {/* Par villes */}
          <div style={col}>
            <p style={head}>Par villes</p>
            {["Paris", "Lyon", "Marseille", "Toulouse", "Bordeaux", "Nantes", "Lille", "Strasbourg", "Montpellier", "Nice"].map(l => (
              <a key={l} href={`/annonces?ville=${encodeURIComponent(l)}`} style={link}
                onMouseEnter={e => { e.currentTarget.style.color = "#111" }}
                onMouseLeave={e => { e.currentTarget.style.color = "#666" }}>
                {l}
              </a>
            ))}
          </div>

          {/* Navigation principale */}
          <div style={col}>
            <p style={head}>Explorer</p>
            <a href="/" style={link} onMouseEnter={e => { e.currentTarget.style.color = "#111" }} onMouseLeave={e => { e.currentTarget.style.color = "#666" }}>Accueil</a>
            <a href="/annonces" style={link} onMouseEnter={e => { e.currentTarget.style.color = "#111" }} onMouseLeave={e => { e.currentTarget.style.color = "#666" }}>Toutes les annonces</a>
            <a href="/favoris" style={link} onMouseEnter={e => { e.currentTarget.style.color = "#111" }} onMouseLeave={e => { e.currentTarget.style.color = "#666" }}>Mes favoris</a>
            <a href="/auth" style={link} onMouseEnter={e => { e.currentTarget.style.color = "#111" }} onMouseLeave={e => { e.currentTarget.style.color = "#666" }}>Se connecter</a>
            <a href="/auth?mode=inscription" style={link} onMouseEnter={e => { e.currentTarget.style.color = "#111" }} onMouseLeave={e => { e.currentTarget.style.color = "#666" }}>Créer un compte</a>
          </div>

          {/* Mon espace — adapté au rôle */}
          <div style={col}>
            {proprietaireActive ? (
              <>
                <p style={head}>Mon espace propriétaire</p>
                <a href="/proprietaire" style={link} onMouseEnter={e => { e.currentTarget.style.color = "#111" }} onMouseLeave={e => { e.currentTarget.style.color = "#666" }}>Mes biens</a>
                <a href="/proprietaire/ajouter" style={link} onMouseEnter={e => { e.currentTarget.style.color = "#111" }} onMouseLeave={e => { e.currentTarget.style.color = "#666" }}>Publier un bien</a>
                <a href="/carnet" style={link} onMouseEnter={e => { e.currentTarget.style.color = "#111" }} onMouseLeave={e => { e.currentTarget.style.color = "#666" }}>Carnet d&apos;entretien</a>
                <a href="/proprietaire/stats" style={link} onMouseEnter={e => { e.currentTarget.style.color = "#111" }} onMouseLeave={e => { e.currentTarget.style.color = "#666" }}>Statistiques</a>
              </>
            ) : (
              <>
                <p style={head}>Mon espace</p>
                <a href="/dossier" style={link} onMouseEnter={e => { e.currentTarget.style.color = "#111" }} onMouseLeave={e => { e.currentTarget.style.color = "#666" }}>Mon dossier</a>
                <a href="/mes-candidatures" style={link} onMouseEnter={e => { e.currentTarget.style.color = "#111" }} onMouseLeave={e => { e.currentTarget.style.color = "#666" }}>Mes candidatures</a>
                <a href="/visites" style={link} onMouseEnter={e => { e.currentTarget.style.color = "#111" }} onMouseLeave={e => { e.currentTarget.style.color = "#666" }}>Mes visites</a>
                <a href="/mon-logement" style={link} onMouseEnter={e => { e.currentTarget.style.color = "#111" }} onMouseLeave={e => { e.currentTarget.style.color = "#666" }}>Mon logement</a>
              </>
            )}
          </div>

          {/* Légal & aide */}
          <div style={col}>
            <p style={head}>Informations</p>
            <a href="/contact" style={link} onMouseEnter={e => { e.currentTarget.style.color = "#111" }} onMouseLeave={e => { e.currentTarget.style.color = "#666" }}>Nous contacter</a>
            <a href="/cgu" style={link} onMouseEnter={e => { e.currentTarget.style.color = "#111" }} onMouseLeave={e => { e.currentTarget.style.color = "#666" }}>CGU</a>
            <a href="/mentions-legales" style={link} onMouseEnter={e => { e.currentTarget.style.color = "#111" }} onMouseLeave={e => { e.currentTarget.style.color = "#666" }}>Mentions légales</a>
            <a href="/confidentialite" style={link} onMouseEnter={e => { e.currentTarget.style.color = "#111" }} onMouseLeave={e => { e.currentTarget.style.color = "#666" }}>Politique de confidentialité</a>
            <a href="/cookies" style={link} onMouseEnter={e => { e.currentTarget.style.color = "#111" }} onMouseLeave={e => { e.currentTarget.style.color = "#666" }}>Cookies</a>
            <a href="/plan-du-site" style={link} onMouseEnter={e => { e.currentTarget.style.color = "#111" }} onMouseLeave={e => { e.currentTarget.style.color = "#666" }}>Plan du site</a>
          </div>
        </div>
      </div>

      {/* Barre basse */}
      <div style={{
        borderTop: "1px solid #EAE6DF",
        padding: isMobile ? "20px 20px" : "24px 48px",
        maxWidth: 1200,
        margin: "0 auto",
        display: "flex",
        justifyContent: "space-between",
        alignItems: isMobile ? "flex-start" : "center",
        flexWrap: "wrap",
        gap: 12,
        flexDirection: isMobile ? "column" : "row",
      }}>
        <span suppressHydrationWarning style={{ fontSize: 12, color: "#888", letterSpacing: "0.3px" }}>
          © {new Date().getFullYear()} Key Match — Location directe entre particuliers
        </span>
        <div style={{ display: "flex", gap: isMobile ? 14 : 22, flexWrap: "wrap" }}>
          {[
            { label: "Confidentialité", href: "/confidentialite" },
            { label: "Cookies", href: "/cookies" },
            { label: "CGU", href: "/cgu" },
            { label: "Mentions légales", href: "/mentions-legales" },
          ].map(l => (
            <a key={l.label} href={l.href}
              style={{ fontSize: 12, color: "#888", textDecoration: "none", transition: "color 200ms ease" }}
              onMouseEnter={e => { e.currentTarget.style.color = "#111" }}
              onMouseLeave={e => { e.currentTarget.style.color = "#888" }}>
              {l.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  )
}
