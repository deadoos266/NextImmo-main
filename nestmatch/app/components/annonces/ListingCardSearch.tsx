"use client"
import { useEffect, useState, type ReactNode } from "react"
import Image from "next/image"
import { CARD_GRADIENTS as GRADIENTS } from "../../../lib/cardGradients"
import { useInterval, useReducedMotion } from "../home/hooks"
import { highlightMatch } from "./highlight"

/**
 * Card annonce pour la page /annonces avec 2 variantes :
 *  - variant="grid" : aspect 4/5 vertical, parité home/ListingCard.
 *  - variant="horizontal" : image à gauche (aspect 4/5 fixée 220px),
 *    meta à droite, utilisée en mode liste sur desktop.
 *
 * Photos :
 *  - Rotation auto au hover (1.2 s) si plusieurs photos + pas reduced-motion.
 *  - Flèches manuelles visibles au hover (parité avec fiche détail).
 *  - Reset à l'idx 0 quand on quitte la card.
 *
 * Accessibilité :
 *  - Le wrapper est un <a> cliquable → href annonce.
 *  - Boutons internes (favori, flèches) stoppent la propagation.
 *  - Rotation désactivée si prefers-reduced-motion.
 */

type Variant = "grid" | "horizontal"

interface Props {
  annonce: any
  score: number | null
  info: { label: string; color: string; bg: string } | null
  isOwn: boolean
  isSelected: boolean
  favori: boolean
  onToggleFavori: (e: React.MouseEvent) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  motCle: string
  variant: Variant
}

// ─── CardPhoto (interne) ───────────────────────────────────────────────
function CardPhoto({
  annonce,
  aspect = "4 / 5",
  fixedWidth,
}: {
  annonce: any
  aspect?: string
  fixedWidth?: number
}) {
  const [idx, setIdx] = useState(0)
  const [hover, setHover] = useState(false)
  const reduced = useReducedMotion()
  const realPhotos: string[] = Array.isArray(annonce.photos) && annonce.photos.length > 0 ? annonce.photos : []
  const total = realPhotos.length > 0 ? realPhotos.length : 1
  const base = GRADIENTS[annonce.id % GRADIENTS.length]

  useInterval(hover && realPhotos.length > 1 && !reduced, () => setIdx(i => (i + 1) % total), 1200)
  useEffect(() => {
    if (!hover) setIdx(0)
  }, [hover])

  function prev(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIdx(i => (i - 1 + total) % total)
  }
  function next(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIdx(i => (i + 1) % total)
  }

  const currentPhoto = realPhotos[idx]

  return (
    <div
      style={{
        position: "relative",
        aspectRatio: fixedWidth ? undefined : aspect,
        width: fixedWidth ? fixedWidth : "100%",
        height: fixedWidth ? "100%" : undefined,
        background: currentPhoto ? "#000" : base,
        overflow: "hidden",
        flexShrink: 0,
      }}
      onMouseEnter={e => {
        setHover(true)
        const btns = e.currentTarget.querySelectorAll<HTMLButtonElement>(".photo-nav")
        btns.forEach(b => (b.style.opacity = "1"))
      }}
      onMouseLeave={e => {
        setHover(false)
        const btns = e.currentTarget.querySelectorAll<HTMLButtonElement>(".photo-nav")
        btns.forEach(b => (b.style.opacity = "0"))
      }}
    >
      {currentPhoto ? (
        <Image
          src={currentPhoto}
          alt={annonce.titre || "Photo logement"}
          fill
          sizes="(max-width: 768px) 100vw, 320px"
          style={{ objectFit: "cover", display: "block" }}
        />
      ) : (
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(0,0,0,0.25)",
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          Pas de photo
        </span>
      )}

      <span
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          background: annonce.dispo === "Disponible maintenant" ? "#16a34a" : "#ea580c",
          color: "white",
          padding: "3px 9px",
          borderRadius: 999,
          fontSize: 10,
          fontWeight: 700,
          zIndex: 2,
        }}
      >
        {annonce.dispo}
      </span>

      {realPhotos.length > 1 && (
        <>
          <button
            className="photo-nav"
            onClick={prev}
            aria-label="Photo précédente"
            style={{
              position: "absolute",
              left: 8,
              top: "50%",
              transform: "translateY(-50%)",
              background: "rgba(255,255,255,0.85)",
              border: "none",
              borderRadius: "50%",
              width: 28,
              height: 28,
              cursor: "pointer",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0,
              transition: "opacity 0.15s",
              zIndex: 3,
              fontWeight: 700,
              color: "#111",
            }}
          >
            ‹
          </button>
          <button
            className="photo-nav"
            onClick={next}
            aria-label="Photo suivante"
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              background: "rgba(255,255,255,0.85)",
              border: "none",
              borderRadius: "50%",
              width: 28,
              height: 28,
              cursor: "pointer",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0,
              transition: "opacity 0.15s",
              zIndex: 3,
              fontWeight: 700,
              color: "#111",
            }}
          >
            ›
          </button>
        </>
      )}

      {realPhotos.length > 1 && (
        <div
          style={{
            position: "absolute",
            bottom: 10,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            gap: 4,
            zIndex: 2,
          }}
        >
          {realPhotos.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === idx ? 14 : 5,
                height: 5,
                borderRadius: 999,
                background: i === idx ? "white" : "rgba(255,255,255,0.5)",
                transition: "all 0.2s",
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── FavoriButton (interne) ────────────────────────────────────────────
function FavoriButton({ favori, onClick }: { favori: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={favori ? "Retirer des favoris" : "Ajouter aux favoris"}
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        zIndex: 4,
        background: "white",
        border: "none",
        borderRadius: "50%",
        width: 34,
        height: 34,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
        transition: "transform 0.15s",
      }}
      onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.12)")}
      onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill={favori ? "#dc2626" : "none"}
        stroke={favori ? "#dc2626" : "#6b7280"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  )
}

// ─── Meta block (interne) ──────────────────────────────────────────────
function MetaBlock({
  annonce,
  score,
  info,
  isOwn,
  motCle,
}: Pick<Props, "annonce" | "score" | "info" | "isOwn" | "motCle"> & { padding?: string }) {
  const titre: ReactNode = motCle.trim() ? highlightMatch(annonce.titre || "", motCle) : annonce.titre
  const ville: ReactNode = motCle.trim() ? highlightMatch(annonce.ville || "", motCle) : annonce.ville

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#6B6B6B",
            textTransform: "uppercase",
            letterSpacing: "1.2px",
            margin: 0,
          }}
        >
          {ville}
        </p>
        {info && score !== null && (
          <span
            style={{
              background: info.bg,
              color: info.color,
              padding: "2px 9px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {Math.round(score / 10)}%
          </span>
        )}
        {isOwn && (
          <span
            style={{
              background: "#F1EEE8",
              color: "#374151",
              padding: "2px 9px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            Votre bien
          </span>
        )}
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.3, margin: "0 0 10px", color: "#111" }}>
        {titre}
      </h3>
      <div style={{ display: "flex", gap: 10, fontSize: 12, color: "#6b7280", marginBottom: 10, flexWrap: "wrap" }}>
        {annonce.surface != null && <span>{annonce.surface} m²</span>}
        {annonce.surface != null && annonce.pieces != null && <span style={{ color: "#d1d5db" }}>·</span>}
        {annonce.pieces != null && <span>{annonce.pieces} p.</span>}
        {annonce.meuble === true && (
          <>
            <span style={{ color: "#d1d5db" }}>·</span>
            <span>Meublé</span>
          </>
        )}
      </div>
      <div
        style={{
          borderTop: "1px solid #EAE6DF",
          paddingTop: 10,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#6B6B6B",
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}
        >
          Loyer
        </span>
        <span style={{ fontSize: 18, fontWeight: 500, color: "#111" }}>
          {annonce.prix} €
          <span style={{ fontSize: 11, fontWeight: 400, color: "#9ca3af" }}>/mois</span>
        </span>
      </div>
    </>
  )
}

// ─── ListingCardSearch (export principal) ──────────────────────────────
export default function ListingCardSearch({
  annonce,
  score,
  info,
  isOwn,
  isSelected,
  favori,
  onToggleFavori,
  onMouseEnter,
  onMouseLeave,
  motCle,
  variant,
}: Props) {
  const baseStyle: React.CSSProperties = {
    display: variant === "horizontal" ? "flex" : "block",
    textDecoration: "none",
    color: "#111",
    background: "white",
    borderRadius: 20,
    border: `1px solid ${isSelected ? "#111" : "#EAE6DF"}`,
    overflow: "hidden",
    boxShadow: isSelected ? "0 6px 24px rgba(0,0,0,0.08)" : "0 1px 2px rgba(0,0,0,0.02)",
    transition: "box-shadow 0.25s ease, transform 0.25s ease, border-color 0.2s",
  }

  if (variant === "horizontal") {
    return (
      <a
        href={`/annonces/${annonce.id}`}
        onMouseEnter={e => {
          onMouseEnter()
          e.currentTarget.style.transform = "translateY(-2px)"
          e.currentTarget.style.boxShadow = "0 10px 28px rgba(0,0,0,0.08)"
        }}
        onMouseLeave={e => {
          onMouseLeave()
          e.currentTarget.style.transform = "none"
          e.currentTarget.style.boxShadow = isSelected
            ? "0 6px 24px rgba(0,0,0,0.08)"
            : "0 1px 2px rgba(0,0,0,0.02)"
        }}
        style={baseStyle}
      >
        <div style={{ position: "relative", width: 220, flexShrink: 0 }}>
          <CardPhoto annonce={annonce} fixedWidth={220} />
          <FavoriButton favori={favori} onClick={onToggleFavori} />
        </div>
        <div
          style={{
            flex: 1,
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            minWidth: 0,
          }}
        >
          <MetaBlock annonce={annonce} score={score} info={info} isOwn={isOwn} motCle={motCle} />
        </div>
      </a>
    )
  }

  // variant="grid"
  return (
    <a
      href={`/annonces/${annonce.id}`}
      onMouseEnter={e => {
        onMouseEnter()
        e.currentTarget.style.transform = "translateY(-2px)"
        e.currentTarget.style.boxShadow = "0 10px 28px rgba(0,0,0,0.08)"
      }}
      onMouseLeave={e => {
        onMouseLeave()
        e.currentTarget.style.transform = "none"
        e.currentTarget.style.boxShadow = isSelected
          ? "0 6px 24px rgba(0,0,0,0.08)"
          : "0 1px 2px rgba(0,0,0,0.02)"
      }}
      style={baseStyle}
    >
      <div style={{ position: "relative" }}>
        <CardPhoto annonce={annonce} aspect="4 / 5" />
        <FavoriButton favori={favori} onClick={onToggleFavori} />
      </div>
      <div style={{ padding: "16px 18px 18px" }}>
        <MetaBlock annonce={annonce} score={score} info={info} isOwn={isOwn} motCle={motCle} />
      </div>
    </a>
  )
}
