"use client"
import FadeIn from "./FadeIn"

/**
 * Section "Comment ca marche" — 3 étapes éditoriales.
 * Aucune icône, aucune illustration. Seule la typographie porte le propos.
 *
 * Chaque colonne :
 * - Numéro 01/02/03 en 48px weight 300, couleur #CCC (discret, donne le
 *   rythme sans voler la vedette au titre)
 * - Titre 18px weight 600 #111
 * - Paragraphe 14px weight 400 #555, line-height 1.6
 */

const STEPS = [
  {
    n: "01",
    t: "Créez votre dossier",
    d: "Revenus, garant, situation pro, pièces d'identité : un dossier conforme ALUR rempli une fois, partagé en un clic.",
  },
  {
    n: "02",
    t: "Matchez avec un logement",
    d: "Des annonces notées de 0 à 100% selon votre compatibilité : budget, surface, équipements, DPE. Fini les candidatures à l'aveugle.",
  },
  {
    n: "03",
    t: "Signez en ligne",
    d: "Messagerie directe, visite en un clic, bail électronique et état des lieux digital avec signatures à valeur légale.",
  },
]

export default function HowItWorks({ isMobile }: { isMobile: boolean }) {
  return (
    <section style={{
      background: "#F7F4EF",
      padding: isMobile ? "72px 20px" : "140px 48px",
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <FadeIn>
          <p style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#666",
            textTransform: "uppercase",
            letterSpacing: "1.8px",
            margin: 0,
            marginBottom: 20,
          }}>
            Comment ça marche
          </p>
          <h2 style={{
            fontSize: isMobile ? 32 : 48,
            fontWeight: 500,
            lineHeight: 1.05,
            letterSpacing: isMobile ? "-0.8px" : "-1.4px",
            color: "#111",
            margin: 0,
            marginBottom: isMobile ? 48 : 80,
            maxWidth: 720,
          }}>
            Trois étapes pour passer de la recherche<br />
            à la signature du bail.
          </h2>
        </FadeIn>

        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
          gap: isMobile ? 44 : 56,
        }}>
          {STEPS.map((s, i) => (
            <FadeIn key={s.n} delay={i * 80}>
              <div style={{ borderTop: "1px solid #111", paddingTop: 22 }}>
                <p style={{
                  fontSize: 48,
                  fontWeight: 300,
                  color: "#111",
                  letterSpacing: "-1.5px",
                  margin: 0,
                  marginBottom: 14,
                  lineHeight: 1,
                }}>
                  {s.n}
                </p>
                <h3 style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: "#111",
                  margin: 0,
                  marginBottom: 10,
                  letterSpacing: "-0.2px",
                }}>
                  {s.t}
                </h3>
                <p style={{
                  fontSize: 14,
                  fontWeight: 400,
                  color: "#555",
                  lineHeight: 1.6,
                  margin: 0,
                  maxWidth: 320,
                }}>
                  {s.d}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}
