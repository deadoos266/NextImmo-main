"use client"
import { useResponsive } from "../hooks/useResponsive"
import { useRole } from "../providers"
import Logo from "./Logo"

/**
 * Footer — restyle éditorial issu du design system handoff (2026-04-20).
 * Styling uniquement. Structure + liens + logique role-conditionnelle intacts.
 *
 * À ne JAMAIS toucher ici :
 *  - les 15 liens et leurs routes (Paris…Nice, Explorer, Mon espace, Informations)
 *  - la condition `proprietaireActive` colonne 3
 *  - le composant <Logo variant="footer" asLink={false} />
 *  - `suppressHydrationWarning` sur le year (évite mismatch SSR/CSR)
 */
export default function Footer() {
  const { isMobile, isTablet } = useResponsive()
  const { proprietaireActive } = useRole()
  // isTablet destructuré mais non utilisé — volontairement laissé pour stabilité
  // (évite un churn si on ajoute un comportement tablette plus tard).
  void isTablet

  const col: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 10 }
  const linkBase: React.CSSProperties = {
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
  // Handlers hover partagés — évite de dupliquer 20× inline.
  const hoverInk = (e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = "#111" }
  const hoverMeta = (e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = "#666" }
  const hoverSoft = (e: React.MouseEvent<HTMLAnchorElement>) => { e.currentTarget.style.color = "#888" }

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

        {/* Logo en tête avec séparateur hairline */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          paddingBottom: isMobile ? 24 : 32,
          marginBottom: isMobile ? 32 : 48,
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
              <a key={l} href={`/annonces?ville=${encodeURIComponent(l)}`} style={linkBase} onMouseEnter={hoverInk} onMouseLeave={hoverMeta}>{l}</a>
            ))}
          </div>

          {/* Navigation principale */}
          <div style={col}>
            <p style={head}>Explorer</p>
            <a href="/" style={linkBase} onMouseEnter={hoverInk} onMouseLeave={hoverMeta}>Accueil</a>
            <a href="/annonces" style={linkBase} onMouseEnter={hoverInk} onMouseLeave={hoverMeta}>Toutes les annonces</a>
            <a href="/favoris" style={linkBase} onMouseEnter={hoverInk} onMouseLeave={hoverMeta}>Mes favoris</a>
            <a href="/auth" style={linkBase} onMouseEnter={hoverInk} onMouseLeave={hoverMeta}>Se connecter</a>
            <a href="/auth?mode=inscription" style={linkBase} onMouseEnter={hoverInk} onMouseLeave={hoverMeta}>Créer un compte</a>
          </div>

          {/* Mon espace — adapté au rôle. Le locataire ne voit PAS les
              raccourcis "Publier un bien / Mon espace proprio" (hors scope).
              Le proprio voit ses actions de gestion. */}
          <div style={col}>
            {proprietaireActive ? (
              <>
                <p style={head}>Mon espace propriétaire</p>
                <a href="/proprietaire" style={linkBase} onMouseEnter={hoverInk} onMouseLeave={hoverMeta}>Mes biens</a>
                <a href="/proprietaire/ajouter" style={linkBase} onMouseEnter={hoverInk} onMouseLeave={hoverMeta}>Publier un bien</a>
                <a href="/carnet" style={linkBase} onMouseEnter={hoverInk} onMouseLeave={hoverMeta}>Carnet d&apos;entretien</a>
                <a href="/proprietaire/stats" style={linkBase} onMouseEnter={hoverInk} onMouseLeave={hoverMeta}>Statistiques</a>
              </>
            ) : (
              <>
                <p style={head}>Mon espace</p>
                <a href="/dossier" style={linkBase} onMouseEnter={hoverInk} onMouseLeave={hoverMeta}>Mon dossier</a>
                <a href="/mes-candidatures" style={linkBase} onMouseEnter={hoverInk} onMouseLeave={hoverMeta}>Mes candidatures</a>
                <a href="/visites" style={linkBase} onMouseEnter={hoverInk} onMouseLeave={hoverMeta}>Mes visites</a>
                <a href="/mon-logement" style={linkBase} onMouseEnter={hoverInk} onMouseLeave={hoverMeta}>Mon logement</a>
              </>
            )}
          </div>

          {/* Légal & aide */}
          <div style={col}>
            <p style={head}>Informations</p>
            <a href="/contact" style={linkBase} onMouseEnter={hoverInk} onMouseLeave={hoverMeta}>Nous contacter</a>
            <a href="/cgu" style={linkBase} onMouseEnter={hoverInk} onMouseLeave={hoverMeta}>CGU</a>
            <a href="/mentions-legales" style={linkBase} onMouseEnter={hoverInk} onMouseLeave={hoverMeta}>Mentions légales</a>
            <a href="/confidentialite" style={linkBase} onMouseEnter={hoverInk} onMouseLeave={hoverMeta}>Politique de confidentialité</a>
            <a href="/cookies" style={linkBase} onMouseEnter={hoverInk} onMouseLeave={hoverMeta}>Cookies</a>
            <a href="/plan-du-site" style={linkBase} onMouseEnter={hoverInk} onMouseLeave={hoverMeta}>Plan du site</a>
          </div>
        </div>
      </div>

      {/* Barre basse : copyright + liens légaux (Logo retiré — il est en tête) */}
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
              onMouseEnter={hoverInk} onMouseLeave={hoverSoft}>
              {l.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  )
}
