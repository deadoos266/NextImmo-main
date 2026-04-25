"use client"
import Image from "next/image"
import { CARD_GRADIENTS as GRADIENTS } from "../../../lib/cardGradients"

/**
 * Card listing horizontale compacte — variant pour l'aside list du mode
 * map split (handoff Claude Design `app.jsx` MapSplit lignes 578-612).
 *
 * Structure :
 *   - Layout grid `100px 1fr`, gap 14, padding 10, margin 4 vertical
 *   - Photo aspect 1/1 borderRadius 10, NEW badge top-left (#111/#fff)
 *   - Eyebrow VILLE · QUARTIER 10.5px/700/letterSpacing 1.2px uppercase
 *   - Titre 14px weight 600 lineClamp 2
 *   - Ligne baseline : specs 11px muted + prix 15px/700 tabular-nums
 *   - Chip match #DCFCE7/#16A34A 10.5px/700 (pastille 5×5 + "{n} % match")
 *   - Hover (active) : background beige + border ink, transition 160ms
 *   - Favori abs top-right 30×30 rond, visible si active OR isFav
 *
 * Sync hover : `active` prop pilotée depuis AnnoncesClient (selectedId).
 * Hover row → marker active sur la map (réciproque déjà en place via
 * mouseover sur Marker → onSelect).
 */

interface Props {
  annonce: any
  active: boolean
  favori: boolean
  match: number | null
  onMouseEnter: () => void
  onMouseLeave: () => void
  onToggleFavori: (e: React.MouseEvent) => void
}

function isNewAnnonce(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false
  const t = new Date(createdAt).getTime()
  if (Number.isNaN(t)) return false
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
  return Date.now() - t < SEVEN_DAYS
}

export default function ListingCardCompact({
  annonce,
  active,
  favori,
  match,
  onMouseEnter,
  onMouseLeave,
  onToggleFavori,
}: Props) {
  const showNew = isNewAnnonce(annonce.created_at)
  const photo = Array.isArray(annonce.photos) && annonce.photos.length > 0 ? annonce.photos[0] : null
  const gradient = GRADIENTS[annonce.id % GRADIENTS.length]
  const ville = (annonce.ville || "").toString().trim()
  const quartier = (annonce.quartier || "").toString().trim()
  const loc = ville && quartier ? `${ville} · ${quartier}` : ville
  const showFavori = active || favori

  return (
    <a
      href={`/annonces/${annonce.id}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        display: "grid",
        gridTemplateColumns: "100px 1fr",
        gap: 14,
        padding: 10,
        margin: "4px 0",
        textDecoration: "none",
        color: "#111",
        borderRadius: 14,
        background: active ? "#F7F4EF" : "transparent",
        border: active ? "1px solid #111" : "1px solid transparent",
        transition: "all 160ms",
        position: "relative",
      }}
    >
      {/* ── Photo carrée 100×100 ── */}
      <div
        style={{
          aspectRatio: "1 / 1",
          borderRadius: 10,
          background: photo ? "#000" : gradient,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {photo ? (
          <Image
            src={photo}
            alt={annonce.titre || "Photo logement"}
            fill
            sizes="100px"
            style={{ objectFit: "cover", display: "block" }}
          />
        ) : null}
        {showNew && (
          <span
            style={{
              position: "absolute",
              top: 6,
              left: 6,
              background: "#111",
              color: "#fff",
              fontSize: 9,
              fontWeight: 700,
              padding: "2px 6px",
              borderRadius: 999,
              letterSpacing: "0.5px",
            }}
          >
            NEW
          </span>
        )}
      </div>

      {/* ── Favori abs top-right 30×30, visible si active ou isFav ── */}
      <button
        type="button"
        onClick={onToggleFavori}
        aria-label={favori ? "Retirer des favoris" : "Ajouter aux favoris"}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 30,
          height: 30,
          borderRadius: "50%",
          background: favori ? "#DC2626" : "rgba(255,255,255,0.96)",
          color: favori ? "#fff" : "#111",
          border: `1px solid ${favori ? "#DC2626" : "#EAE6DF"}`,
          cursor: "pointer",
          display: showFavori ? "inline-flex" : "none",
          alignItems: "center",
          justifyContent: "center",
          transition: "opacity 160ms, transform 160ms",
          zIndex: 3,
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill={favori ? "#fff" : "none"}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>

      {/* ── Body droite ── */}
      <div style={{ minWidth: 0 }}>
        {loc && (
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: "#6B6B6B",
              textTransform: "uppercase",
              letterSpacing: "1.2px",
              marginBottom: 4,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {loc}
          </div>
        )}

        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.25,
            marginBottom: 6,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            color: "#111",
          }}
        >
          {annonce.titre || "Sans titre"}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 11, color: "#8a8477", whiteSpace: "nowrap" }}>
            {annonce.surface != null && `${annonce.surface} m² · `}
            {annonce.pieces != null && `${annonce.pieces} p.`}
          </span>
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#111",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.2px",
              flexShrink: 0,
            }}
          >
            {annonce.prix?.toLocaleString("fr-FR") ?? "—"} €
          </span>
        </div>

        {match !== null && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              marginTop: 6,
              padding: "2px 8px",
              background: "#DCFCE7",
              color: "#16A34A",
              borderRadius: 999,
              fontSize: 10.5,
              fontWeight: 700,
            }}
          >
            <span
              aria-hidden="true"
              style={{ width: 5, height: 5, background: "#16A34A", borderRadius: "50%" }}
            />
            {match} % match
          </div>
        )}
      </div>
    </a>
  )
}
