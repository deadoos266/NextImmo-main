"use client"
import { useResponsive } from "../hooks/useResponsive"
import { useRole } from "../providers"
import Logo from "./Logo"

export default function Footer() {
  const { isMobile, isTablet } = useResponsive()
  const { proprietaireActive } = useRole()
  const col: any = { display: "flex", flexDirection: "column", gap: 8 }
  const link: any = { color: "#6b7280", textDecoration: "none", fontSize: 13, fontWeight: 400, lineHeight: 1.5 }
  const head: any = { fontSize: 12, fontWeight: 800, color: "#111", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }

  return (
    <footer style={{ background: "white", borderTop: "1px solid #e5e7eb", fontFamily: "'DM Sans', sans-serif", marginTop: isMobile ? 40 : 80 }}>

      {/* Bloc principal */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: isMobile ? "32px 20px 28px" : "52px 48px 40px" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? 28 : 40 }}>

          {/* Par villes */}
          <div style={col}>
            <p style={head}>Par villes</p>
            {["Paris", "Lyon", "Marseille", "Toulouse", "Bordeaux", "Nantes", "Lille", "Strasbourg", "Montpellier", "Nice"].map(l => (
              <a key={l} href={`/annonces?ville=${encodeURIComponent(l)}`} style={link}>{l}</a>
            ))}
          </div>

          {/* Navigation principale */}
          <div style={col}>
            <p style={head}>Explorer</p>
            <a href="/" style={link}>Accueil</a>
            <a href="/annonces" style={link}>Toutes les annonces</a>
            <a href="/favoris" style={link}>Mes favoris</a>
            <a href="/auth" style={link}>Se connecter</a>
            <a href="/auth?mode=inscription" style={link}>Créer un compte</a>
          </div>

          {/* Mon espace — adapté au rôle. Le locataire ne voit PAS les
              raccourcis "Publier un bien / Mon espace proprio" (hors scope).
              Le proprio voit ses actions de gestion. */}
          <div style={col}>
            {proprietaireActive ? (
              <>
                <p style={head}>Mon espace propriétaire</p>
                <a href="/proprietaire" style={link}>Mes biens</a>
                <a href="/proprietaire/ajouter" style={link}>Publier un bien</a>
                <a href="/carnet" style={link}>Carnet d&apos;entretien</a>
                <a href="/proprietaire/stats" style={link}>Statistiques</a>
              </>
            ) : (
              <>
                <p style={head}>Mon espace</p>
                <a href="/dossier" style={link}>Mon dossier</a>
                <a href="/mes-candidatures" style={link}>Mes candidatures</a>
                <a href="/visites" style={link}>Mes visites</a>
                <a href="/mon-logement" style={link}>Mon logement</a>
              </>
            )}
          </div>

          {/* Légal & aide */}
          <div style={col}>
            <p style={head}>Informations</p>
            <a href="/contact" style={link}>Nous contacter</a>
            <a href="/cgu" style={link}>CGU</a>
            <a href="/mentions-legales" style={link}>Mentions légales</a>
            <a href="/confidentialite" style={link}>Politique de confidentialité</a>
            <a href="/cookies" style={link}>Cookies</a>
            <a href="/plan-du-site" style={link}>Plan du site</a>
          </div>
        </div>
      </div>

      {/* Barre basse */}
      <div style={{ borderTop: "1px solid #f3f4f6", padding: isMobile ? "16px 20px" : "20px 48px", maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", flexWrap: "wrap", gap: 12, flexDirection: isMobile ? "column" : "row" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Logo variant="footer" asLink={false} />
          <span style={{ fontSize: 12, color: "#9ca3af" }}>© {new Date().getFullYear()} — Location entre particuliers</span>
        </div>
        <div style={{ display: "flex", gap: isMobile ? 12 : 20, flexWrap: "wrap" }}>
          {[
            { label: "Confidentialité", href: "/confidentialite" },
            { label: "Cookies", href: "/cookies" },
            { label: "CGU", href: "/cgu" },
            { label: "Mentions légales", href: "/mentions-legales" },
          ].map(l => (
            <a key={l.label} href={l.href} style={{ fontSize: 12, color: "#9ca3af", textDecoration: "none" }}>{l.label}</a>
          ))}
        </div>
      </div>
    </footer>
  )
}
