"use client"
import FadeIn from "./FadeIn"

/**
 * Bande de confiance sobre sous le Hero.
 * Typo 14px, letter-spacing 0.5px, couleur #666, séparateurs " · ".
 * Fond blanc pour contraste avec le #F7F4EF du hero.
 *
 * Les chiffres sont statiques pour le rendu éditorial — ils ne doivent PAS
 * être dynamiques (pas de requête Supabase) pour garder la page rapide et
 * eviter de montrer "0 logements" pendant le premier render cote client.
 */
export default function TrustBar({ isMobile }: { isMobile: boolean }) {
  const items = [
    "1 200 logements",
    "3 400 locataires vérifiés",
    "Mise en relation directe propriétaire-locataire",
  ]
  return (
    <section style={{
      background: "white",
      borderTop: "1px solid #EAE6DF",
      borderBottom: "1px solid #EAE6DF",
      padding: isMobile ? "24px 20px" : "28px 48px",
    }}>
      <FadeIn>
        <div style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: isMobile ? "8px 14px" : "8px 20px",
          fontSize: isMobile ? 12 : 14,
          fontWeight: 500,
          color: "#666",
          letterSpacing: "0.5px",
          textAlign: "center",
        }}>
          {items.map((it, i) => (
            <span key={it} style={{ display: "inline-flex", alignItems: "center", gap: isMobile ? 10 : 20 }}>
              <span>{it}</span>
              {i < items.length - 1 && <span style={{ color: "#CCC", fontSize: 16, lineHeight: 1 }}>·</span>}
            </span>
          ))}
        </div>
      </FadeIn>
    </section>
  )
}
