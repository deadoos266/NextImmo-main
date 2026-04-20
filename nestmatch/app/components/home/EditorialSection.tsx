"use client"
import FadeIn from "./FadeIn"

/**
 * Section éditoriale "Pourquoi Keymatch-immo" — asymétrie 60/40.
 * Gauche : manifeste long, typo posée.
 * Droite : 4 points avec tirets fins "—" au lieu de bullets.
 *
 * L'asymétrie 60/40 donne le rythme magazine : texte respire à gauche,
 * liste dense à droite, pas de symétrie banale.
 */

const POINTS = [
  {
    t: "Zéro commission",
    d: "Pas d'agence, pas de frais d'intermédiaire. Le prix affiché est le prix payé.",
  },
  {
    t: "Dossier ALUR conforme",
    d: "Un dossier complet, vérifié, partagé en un clic à chaque candidature.",
  },
  {
    t: "Bail électronique",
    d: "Signature à valeur légale (eIDAS), sans impression ni déplacement.",
  },
  {
    t: "Protection des données",
    d: "Hébergement en France, chiffrement en transit, conformité RGPD.",
  },
]

export default function EditorialSection({ isMobile, isTablet }: { isMobile: boolean; isTablet: boolean }) {
  return (
    <section style={{
      background: "#F7F4EF",
      padding: isMobile ? "72px 20px" : "140px 48px",
    }}>
      <div style={{
        maxWidth: 1200,
        margin: "0 auto",
        display: "grid",
        gridTemplateColumns: isMobile || isTablet ? "1fr" : "60fr 40fr",
        gap: isMobile ? 44 : 80,
        alignItems: "flex-start",
      }}>
        {/* Colonne gauche — manifeste */}
        <FadeIn>
          <div>
            <p style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#666",
              textTransform: "uppercase",
              letterSpacing: "1.8px",
              margin: 0,
              marginBottom: 20,
            }}>
              Pourquoi Keymatch-immo
            </p>
            <h2 style={{
              fontSize: isMobile ? 32 : 48,
              fontWeight: 500,
              lineHeight: 1.08,
              letterSpacing: isMobile ? "-0.8px" : "-1.5px",
              color: "#111",
              margin: 0,
              marginBottom: 28,
            }}>
              Une plateforme pensée pour<br />
              ceux qui cherchent sérieusement.
            </h2>
            <div style={{
              fontSize: isMobile ? 15 : 17,
              lineHeight: 1.7,
              color: "#444",
              fontWeight: 400,
              maxWidth: 560,
            }}>
              <p style={{ margin: 0, marginBottom: 16 }}>
                La location entre particuliers est le moyen le plus simple de louer un logement à son
                juste prix — et pourtant, l&apos;expérience reste fragmentée entre petites annonces
                douteuses, plateformes d&apos;agences et paperasse administrative.
              </p>
              <p style={{ margin: 0, marginBottom: 16 }}>
                Keymatch-immo rassemble tout ce qu&apos;une location mérite aujourd&apos;hui : une mise
                en relation directe, un dossier qui s&apos;envoie sans effort, un bail signé en ligne,
                un état des lieux digital. Le tout conforme ALUR, sans un centime de commission.
              </p>
              <p style={{ margin: 0 }}>
                C&apos;est l&apos;outil qu&apos;on aurait voulu avoir la dernière fois qu&apos;on a
                cherché un appartement.
              </p>
            </div>
          </div>
        </FadeIn>

        {/* Colonne droite — points clés */}
        <FadeIn delay={120}>
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: isMobile ? 22 : 28,
            paddingTop: isMobile ? 0 : 60,
          }}>
            {POINTS.map((p, i) => (
              <div key={p.t} style={{
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
                paddingBottom: i < POINTS.length - 1 ? 20 : 0,
                borderBottom: i < POINTS.length - 1 ? "1px solid #EAE6DF" : "none",
              }}>
                <span aria-hidden style={{
                  flexShrink: 0,
                  display: "inline-block",
                  width: 28,
                  height: 1,
                  background: "#111",
                  marginTop: 14,
                }} />
                <div>
                  <h3 style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#111",
                    margin: 0,
                    marginBottom: 6,
                    letterSpacing: "-0.2px",
                  }}>
                    {p.t}
                  </h3>
                  <p style={{
                    fontSize: 14,
                    fontWeight: 400,
                    color: "#555",
                    lineHeight: 1.6,
                    margin: 0,
                  }}>
                    {p.d}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  )
}
