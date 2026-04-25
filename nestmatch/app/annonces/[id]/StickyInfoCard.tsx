"use client"

/**
 * StickyInfoCard — R12 (flow normal, scroll classique)
 *
 * Décision finale : aucune fixation. La sidebar droite défile avec la page
 * exactement comme n'importe quelle page web normale. Plus de position:
 * fixed, plus de sticky, plus de portal, plus de rAF loop.
 *
 * Le composant garde son nom historique pour ne pas casser les imports,
 * mais il se contente de rendre ses enfants en flow normal dans une simple
 * colonne flex.
 */

export default function StickyInfoCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      id="r-sticky-card-target"
      data-nm-sticky-mode="flow"
      data-nm-sticky-version="R12"
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {children}
    </div>
  )
}
