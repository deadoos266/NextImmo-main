"use client"

import { useState } from "react"

/**
 * Bandeau incitatif premium pour compléter son dossier locataire.
 *
 * Rendu :
 *  - Card horizontale desktop, stack vertical mobile
 *  - Dégradé très subtil #FFF → #F9F6F0
 *  - Icône SVG document 40px à gauche
 *  - Titre + sous-titre au centre
 *  - Bouton CTA noir « Compléter mon dossier » à droite
 *  - Progress bar discrète 4px sous le contenu
 *  - X close top-right (Paul 2026-04-27 sur retour user) — ephemere :
 *    state local React, PAS de localStorage. Au reload/navigation,
 *    le bandeau revient. Le user peut juste l'ecarter pendant qu'il
 *    explore /annonces sans pression visuelle constante.
 *
 * Affichage conditionnel géré par le parent : le composant assume que
 * si on le rend, c'est qu'on doit l'afficher. Masquer = ne pas rendre.
 */

export default function BandeauDossier({
  completude,
  isMobile,
}: {
  completude: number
  isMobile: boolean
}) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <div
      style={{
        position: "relative",
        background: "linear-gradient(135deg, #FFFFFF 0%, #F9F6F0 100%)",
        border: "1px solid #EAE6DF",
        borderRadius: 16,
        padding: isMobile ? "16px 18px 16px 18px" : "20px 60px 20px 24px",
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "stretch" : "center",
        gap: isMobile ? 12 : 20,
        animation: "km-banner-fadein 0.22s ease-out",
      }}
    >
      <style>{`
        @keyframes km-banner-fadein { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>

      {/* X close top-right — zone tactile 36x36 mobile (>= 44 avec padding),
          32x32 desktop. Ne casse pas le layout flex (position absolute). */}
      <button
        type="button"
        aria-label="Masquer ce rappel"
        onClick={() => setDismissed(true)}
        style={{
          position: "absolute",
          top: isMobile ? 8 : 10,
          right: isMobile ? 8 : 10,
          width: isMobile ? 36 : 32,
          height: isMobile ? 36 : 32,
          borderRadius: "50%",
          background: "transparent",
          border: "none",
          color: "#8a8477",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "inherit",
          WebkitTapHighlightColor: "transparent",
          transition: "background 150ms, color 150ms",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "#F7F4EF"; e.currentTarget.style.color = "#111" }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#8a8477" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Icône document + % */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: "#111",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          alignSelf: isMobile ? "flex-start" : "center",
        }}
        aria-hidden="true"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="13" y2="17" />
        </svg>
      </div>

      <div style={{ flex: 1, minWidth: 0, paddingRight: isMobile ? 36 /* eviter overlap avec X */ : 0 }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: "#111", margin: 0, lineHeight: 1.3 }}>
          Votre dossier est à {completude}%
        </p>
        <p style={{ fontSize: 13, color: "#666", margin: "3px 0 0", lineHeight: 1.4 }}>
          Complétez-le pour augmenter vos chances de décrocher un logement de&nbsp;<strong style={{ color: "#111" }}>4&times;</strong>.
        </p>
        {/* Progress bar discrète */}
        <div
          style={{
            marginTop: 10,
            height: 4,
            width: "100%",
            background: "#EAE6DF",
            borderRadius: 999,
            overflow: "hidden",
          }}
          role="progressbar"
          aria-valuenow={completude}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Dossier complété à ${completude}%`}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.max(0, Math.min(100, completude))}%`,
              background: "#111",
              borderRadius: 999,
              transition: "width 300ms ease-out",
            }}
          />
        </div>
      </div>

      <a
        href="/profil"
        style={{
          background: "#111",
          color: "white",
          padding: "10px 20px",
          borderRadius: 999,
          textDecoration: "none",
          fontSize: 13,
          fontWeight: 600,
          fontFamily: "inherit",
          whiteSpace: "nowrap",
          flexShrink: 0,
          alignSelf: isMobile ? "stretch" : "center",
          textAlign: "center",
        }}
      >
        Compléter mon dossier
      </a>
    </div>
  )
}
