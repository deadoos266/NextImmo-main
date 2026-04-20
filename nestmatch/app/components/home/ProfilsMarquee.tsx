"use client"
import { CARD_GRADIENTS } from "../../../lib/cardGradients"
import { useReducedMotion } from "./hooks"

/**
 * Défilement infini de 12 profils de locataires fictifs — illustre la
 * diversité des candidats sur la plateforme (métiers / villes / scores de
 * compatibilité). Paul a validé les 12 personas hardcodés en spec.
 *
 * Note transparence : ces profils sont fictifs et servent à illustrer le
 * concept de matching. Ils ne correspondent à aucun utilisateur réel.
 *
 * Style : pilule blanche bordure #EAE6DF, avatar gradient #cardGradients,
 * initiale #111 weight 600, score vert #16A34A letter-spacing 1px.
 * Défilement 50s linear infinite. Reduced-motion : arrêt net, reste lisible.
 */

type Profil = {
  initiale: string
  nom: string
  metier: string
  ville: string
  score: number
}

const PROFILS: Profil[] = [
  { initiale: "CM", nom: "Camille M.", metier: "UX Designer",         ville: "Paris 11e",    score: 94 },
  { initiale: "TR", nom: "Théo R.",    metier: "Ingénieur logiciel",  ville: "Lyon 2e",      score: 88 },
  { initiale: "JD", nom: "Julien D.",  metier: "Architecte",          ville: "Bordeaux",     score: 91 },
  { initiale: "NB", nom: "Nora B.",    metier: "Médecin généraliste", ville: "Marseille 7e", score: 85 },
  { initiale: "AL", nom: "Alice L.",   metier: "Photographe",         ville: "Nantes",       score: 79 },
  { initiale: "MK", nom: "Marc K.",    metier: "Consultant",          ville: "Toulouse",     score: 87 },
  { initiale: "SP", nom: "Sophie P.",  metier: "Enseignante",         ville: "Strasbourg",   score: 90 },
  { initiale: "HG", nom: "Hugo G.",    metier: "Data analyst",        ville: "Paris 18e",    score: 82 },
  { initiale: "EM", nom: "Emma M.",    metier: "Chargée de projet",   ville: "Lille",        score: 93 },
  { initiale: "LV", nom: "Lucas V.",   metier: "Avocat",              ville: "Lyon 6e",      score: 86 },
  { initiale: "CD", nom: "Chloé D.",   metier: "Kinésithérapeute",    ville: "Rennes",       score: 81 },
  { initiale: "YS", nom: "Yanis S.",   metier: "Étudiant en master",  ville: "Montpellier",  score: 78 },
]

export default function ProfilsMarquee() {
  const reduced = useReducedMotion()
  // Duplique ×3 pour une boucle invisible
  const row = [...PROFILS, ...PROFILS, ...PROFILS]

  return (
    <section style={{
      background: "#F7F4EF",
      padding: "40px 0",
      borderTop: "1px solid #EAE6DF",
      borderBottom: "1px solid #EAE6DF",
      overflow: "hidden",
    }}>
      {!reduced && (
        <style>{`@keyframes km-profils-marquee { from { transform: translateX(0) } to { transform: translateX(-33.333%) } }`}</style>
      )}
      <div style={{
        display: "flex",
        gap: 14,
        width: "fit-content",
        animation: reduced ? "none" : "km-profils-marquee 50s linear infinite",
      }}>
        {row.map((p, i) => {
          const gradient = CARD_GRADIENTS[i % CARD_GRADIENTS.length]
          return (
            <div
              key={`${p.nom}-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 18px 10px 10px",
                background: "#fff",
                border: "1px solid #EAE6DF",
                borderRadius: 999,
                flexShrink: 0,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              <div style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: gradient,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#111",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "-0.2px",
                flexShrink: 0,
              }}>
                {p.initiale}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{p.nom}</div>
              <div style={{ width: 1, height: 16, background: "#EAE6DF" }} />
              <div style={{ fontSize: 12, color: "#666" }}>{p.metier}</div>
              <div style={{ width: 1, height: 16, background: "#EAE6DF" }} />
              <div style={{ fontSize: 12, color: "#666" }}>
                cherche à <span style={{ color: "#111", fontWeight: 500 }}>{p.ville}</span>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#16A34A", letterSpacing: "1px" }}>
                {p.score}&nbsp;% compat
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
