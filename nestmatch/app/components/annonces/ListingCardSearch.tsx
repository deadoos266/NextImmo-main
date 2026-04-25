"use client"
import { useState, useRef, type ReactNode, type CSSProperties } from "react"
import Image from "next/image"
import { CARD_GRADIENTS as GRADIENTS } from "../../../lib/cardGradients"
import { dpeColorFor } from "../../../lib/dpeColors"
import { highlightMatch } from "./highlight"

/**
 * Card annonce pour la page /annonces — layout unique aligné Claude Design
 * handoff (`ListingCard` dans app.jsx ListingsScreen).
 *
 * Structure :
 *   - Photo aspect 4/5 portrait (handoff strict)
 *   - Top-left badges  : NOUVEAU (ink) si created_at < 7j + {n}% match (blur/white)
 *   - Top-right        : favori 38×38 (rouge si actif, blur sinon)
 *   - Footer           : eyebrow VILLE · QUARTIER (10.5px tracked 1.1px),
 *                        titre 14-15px weight 500 clamp 2, separator 1px,
 *                        surface m² · pièces p. · DPE  +  prix tabular
 *   - R10.2 inline     : Aperçu / Comparer (sous le récap)
 *
 * Photos :
 *   - PAS d'auto-rotation (retirée v4, feedback user explicite "trop agressif")
 *   - Flèches manuelles visibles au hover desktop
 *   - Touch swipe horizontal sur mobile
 *   - Dots cliquables + indicator "1/5" discret en bas
 *
 * Accessibilité :
 *   - Le wrapper est un <a> cliquable → href annonce
 *   - Boutons internes (favori, flèches, dots, R10.2) stoppent la propagation
 */

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
  /** R10.2 — handler aperçu rapide (modal). Si absent, bouton masqué. */
  onQuickView?: (annonceId: number) => void
  /** R10.2 — état « cochée pour comparaison ». Default false. */
  compared?: boolean
  /** R10.2 — toggle comparer. Si absent, case masquée. */
  onToggleCompare?: (annonceId: number) => void
  /** R10.2 — true quand la tray est pleine (≥ max) : empêche cocher en plus. */
  compareDisabled?: boolean
}

// ─── Helpers (hors composant : pas de re-render inutile, pas de perte focus) ─

function DpeBadge({ letter }: { letter: string | null | undefined }) {
  if (!letter) return null
  return (
    <span
      title={`DPE ${letter.toUpperCase()}`}
      style={{
        minWidth: 20,
        height: 20,
        padding: "0 6px",
        borderRadius: 4,
        background: dpeColorFor(letter),
        color: "white",
        fontSize: 11,
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {letter.toUpperCase()}
    </span>
  )
}

function isNewAnnonce(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false
  const t = new Date(createdAt).getTime()
  if (Number.isNaN(t)) return false
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
  return Date.now() - t < SEVEN_DAYS
}

function formatLocalisationFull(annonce: any): string {
  const ville = (annonce.ville || "").toString().trim()
  const quartier = (annonce.quartier || "").toString().trim()
  if (ville && quartier) return `${ville.toUpperCase()} · ${quartier}`
  if (ville) return ville.toUpperCase()
  return ""
}

// ─── CardPhoto : carousel photos in-card (handoff fidèle) ────────────────────
//   - desktop : flèches visibles au hover du conteneur
//   - mobile  : touch swipe horizontal (threshold 50px)
//   - dots cliquables + indicator "i/N" en bas-droit (apparait au hover/touch)
//   - lazy loading natif <Image> Next.js (priority sur la 1ère card via prop si besoin)
function CardPhoto({
  annonce,
  priority,
}: {
  annonce: any
  priority?: boolean
}) {
  const [idx, setIdx] = useState(0)
  const realPhotos: string[] = Array.isArray(annonce.photos) && annonce.photos.length > 0 ? annonce.photos : []
  // Limite à 6 photos visibles (perf + spec user "4-6 photos max").
  const photos = realPhotos.slice(0, 6)
  const total = photos.length > 0 ? photos.length : 1
  const base = GRADIENTS[annonce.id % GRADIENTS.length]
  const touchStartX = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)

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
  function goto(e: React.MouseEvent, i: number) {
    e.preventDefault()
    e.stopPropagation()
    setIdx(i)
  }
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    touchEndX.current = null
  }
  function onTouchMove(e: React.TouchEvent) {
    touchEndX.current = e.touches[0].clientX
  }
  function onTouchEnd() {
    if (touchStartX.current === null || touchEndX.current === null) return
    const diff = touchStartX.current - touchEndX.current
    if (Math.abs(diff) > 50 && total > 1) {
      if (diff > 0) setIdx(i => (i + 1) % total)
      else setIdx(i => (i - 1 + total) % total)
    }
    touchStartX.current = null
    touchEndX.current = null
  }

  const currentPhoto = photos[idx]

  return (
    <div
      style={{
        position: "relative",
        aspectRatio: "4 / 5",
        width: "100%",
        background: currentPhoto ? "#000" : base,
        overflow: "hidden",
        flexShrink: 0,
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseEnter={e => {
        const ctrls = e.currentTarget.querySelectorAll<HTMLElement>(".card-photo-ctrl")
        ctrls.forEach(b => (b.style.opacity = "1"))
      }}
      onMouseLeave={e => {
        const ctrls = e.currentTarget.querySelectorAll<HTMLElement>(".card-photo-ctrl")
        ctrls.forEach(b => (b.style.opacity = "0"))
      }}
    >
      {currentPhoto ? (
        <Image
          src={currentPhoto}
          alt={annonce.titre || "Photo logement"}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 440px"
          style={{ objectFit: "cover", display: "block" }}
          priority={priority}
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
            fontSize: 13,
            fontWeight: 500,
            fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif",
            fontStyle: "italic",
          }}
        >
          Pas de photo
        </span>
      )}

      {photos.length > 1 && (
        <>
          <button
            className="card-photo-ctrl"
            onClick={prev}
            aria-label="Photo précédente"
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              background: "rgba(255,255,255,0.94)",
              border: "none",
              borderRadius: "50%",
              width: 30,
              height: 30,
              cursor: "pointer",
              fontSize: 15,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0,
              transition: "opacity 0.15s",
              zIndex: 3,
              fontWeight: 700,
              color: "#111",
              boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
              backdropFilter: "blur(6px)",
            }}
          >
            ‹
          </button>
          <button
            className="card-photo-ctrl"
            onClick={next}
            aria-label="Photo suivante"
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              background: "rgba(255,255,255,0.94)",
              border: "none",
              borderRadius: "50%",
              width: 30,
              height: 30,
              cursor: "pointer",
              fontSize: 15,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0,
              transition: "opacity 0.15s",
              zIndex: 3,
              fontWeight: 700,
              color: "#111",
              boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
              backdropFilter: "blur(6px)",
            }}
          >
            ›
          </button>

          {/* Dots + counter */}
          <div
            style={{
              position: "absolute",
              bottom: 12,
              left: 0,
              right: 0,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 4,
              zIndex: 2,
            }}
          >
            {photos.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={e => goto(e, i)}
                aria-label={`Photo ${i + 1} sur ${total}`}
                style={{
                  width: i === idx ? 16 : 6,
                  height: 6,
                  borderRadius: 999,
                  background: i === idx ? "white" : "rgba(255,255,255,0.5)",
                  transition: "all 0.2s",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            ))}
          </div>

          {/* Indicator "i/N" — toujours visible en bas-droit */}
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              bottom: 10,
              right: 12,
              background: "rgba(0,0,0,0.55)",
              color: "white",
              padding: "2px 8px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "0.3px",
              backdropFilter: "blur(4px)",
              zIndex: 2,
              pointerEvents: "none",
            }}
          >
            {idx + 1}/{total}
          </span>
        </>
      )}
    </div>
  )
}

// ─── ListingCardSearch (export principal) ────────────────────────────────────
export default function ListingCardSearch({
  annonce,
  score,
  info: _info,
  isOwn,
  isSelected,
  favori,
  onToggleFavori,
  onMouseEnter,
  onMouseLeave,
  motCle,
  onQuickView,
  compared = false,
  onToggleCompare,
  compareDisabled = false,
}: Props) {
  const showNew = isNewAnnonce(annonce.created_at)
  const matchPct = score !== null && !isOwn ? Math.round(score / 10) : null
  const loc = formatLocalisationFull(annonce)
  const locHighlighted: ReactNode = motCle.trim() ? highlightMatch(loc, motCle) : loc
  const titre: ReactNode = motCle.trim() ? highlightMatch(annonce.titre || "", motCle) : annonce.titre

  function handleQuickView(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (onQuickView) onQuickView(annonce.id)
  }
  function handleCompareToggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (onToggleCompare && (compared || !compareDisabled)) onToggleCompare(annonce.id)
  }

  const baseStyle: CSSProperties = {
    display: "block",
    textDecoration: "none",
    color: "#111",
    background: "white",
    borderRadius: 20,
    border: `1px solid ${isSelected ? "#111" : "#EAE6DF"}`,
    overflow: "hidden",
    boxShadow: isSelected ? "0 14px 32px rgba(0,0,0,0.10)" : "0 1px 3px rgba(0,0,0,0.04)",
    transition: "transform 300ms cubic-bezier(.2,.8,.2,1), box-shadow 300ms, border-color 200ms",
  }

  return (
    <a
      href={`/annonces/${annonce.id}`}
      onMouseEnter={e => {
        onMouseEnter()
        e.currentTarget.style.transform = "translateY(-4px)"
        e.currentTarget.style.boxShadow = "0 20px 40px rgba(0,0,0,0.12)"
      }}
      onMouseLeave={e => {
        onMouseLeave()
        e.currentTarget.style.transform = "translateY(0)"
        e.currentTarget.style.boxShadow = isSelected
          ? "0 14px 32px rgba(0,0,0,0.10)"
          : "0 1px 3px rgba(0,0,0,0.04)"
      }}
      style={baseStyle}
    >
      {/* ═══ Photo + badges + favori ═══ */}
      <div style={{ position: "relative" }}>
        <CardPhoto annonce={annonce} />

        {/* Top-left : NOUVEAU + match% (handoff fidèle) */}
        <div
          style={{
            position: "absolute",
            top: 14,
            left: 14,
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            pointerEvents: "none",
            zIndex: 4,
          }}
        >
          {showNew && (
            <span
              style={{
                padding: "5px 10px",
                background: "#111",
                color: "white",
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "1px",
              }}
            >
              NOUVEAU
            </span>
          )}
          {matchPct !== null && (
            <span
              style={{
                padding: "5px 10px",
                background: "rgba(255,255,255,0.94)",
                color: "#111",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                backdropFilter: "blur(6px)",
              }}
            >
              {matchPct}% match
            </span>
          )}
          {isOwn && (
            <span
              style={{
                padding: "5px 10px",
                background: "#F1EEE8",
                color: "#111",
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.6px",
              }}
            >
              VOTRE BIEN
            </span>
          )}
        </div>

        {/* Top-right : favori (Airbnb-like) */}
        <button
          onClick={onToggleFavori}
          aria-label={favori ? "Retirer des favoris" : "Ajouter aux favoris"}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 5,
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: favori ? "#DC2626" : "rgba(255,255,255,0.94)",
            color: favori ? "white" : "#111",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(6px)",
            transition: "transform 200ms",
          }}
          onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.10)")}
          onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill={favori ? "white" : "none"}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>

        {/* Statut "Disponible maintenant" — chip discret bottom-left, hors zone dots */}
        {annonce.dispo === "Disponible maintenant" && (
          <span
            style={{
              position: "absolute",
              bottom: 14,
              left: 14,
              padding: "4px 9px",
              background: "rgba(21,128,61,0.94)",
              color: "white",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.6px",
              backdropFilter: "blur(6px)",
              zIndex: 2,
              pointerEvents: "none",
            }}
          >
            DISPONIBLE
          </span>
        )}
      </div>

      {/* ═══ Footer infos ═══ */}
      <div style={{ padding: "16px 18px 18px" }}>
        {loc && (
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: "#6B6B6B",
              textTransform: "uppercase",
              letterSpacing: "1.1px",
              marginBottom: 6,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {locHighlighted}
          </div>
        )}

        <h3
          style={{
            fontSize: 15,
            fontWeight: 500,
            margin: "0 0 12px",
            lineHeight: 1.3,
            letterSpacing: "-0.15px",
            color: "#111",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            // Réserve 2 lignes pour stabiliser la hauteur même quand le titre est court.
            minHeight: "2.6em",
          }}
        >
          {titre}
        </h3>

        {/* Separator + ligne specs/prix tabular */}
        <div
          style={{
            borderTop: "1px solid #EAE6DF",
            paddingTop: 11,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 10,
            fontSize: 12,
            color: "#8a8477",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {annonce.surface != null && <span>{annonce.surface} m²</span>}
            {annonce.surface != null && annonce.pieces != null && <span style={{ color: "#EAE6DF" }}>·</span>}
            {annonce.pieces != null && <span>{annonce.pieces} p.</span>}
            {annonce.dpe && (
              <>
                <span style={{ color: "#EAE6DF" }}>·</span>
                <DpeBadge letter={annonce.dpe} />
              </>
            )}
          </span>
          <span
            style={{
              fontWeight: 700,
              color: "#111",
              fontSize: 17,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.3px",
              flexShrink: 0,
            }}
          >
            {annonce.prix?.toLocaleString("fr-FR") ?? "—"} €
            <span style={{ fontWeight: 400, color: "#8a8477", fontSize: 11 }}>/mois</span>
          </span>
        </div>

        {/* R10.2 — Aperçu / Comparer (sous le récap) */}
        {(onQuickView || onToggleCompare) && (
          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {onQuickView && (
              <button
                type="button"
                onClick={handleQuickView}
                aria-label="Aperçu rapide"
                style={{
                  background: "white",
                  color: "#111",
                  border: "1px solid #EAE6DF",
                  padding: "6px 12px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "#F7F4EF" }}
                onMouseLeave={e => { e.currentTarget.style.background = "white" }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Aperçu
              </button>
            )}
            {onToggleCompare && (
              <button
                type="button"
                onClick={handleCompareToggle}
                aria-label={compared ? "Retirer du comparateur" : "Ajouter au comparateur"}
                aria-pressed={compared}
                disabled={!compared && compareDisabled}
                title={!compared && compareDisabled ? "Maximum atteint — retirez une annonce pour en ajouter une autre" : undefined}
                style={{
                  background: compared ? "#111" : "white",
                  color: compared ? "white" : "#111",
                  border: compared ? "1px solid #111" : "1px solid #EAE6DF",
                  padding: "6px 12px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  cursor: !compared && compareDisabled ? "not-allowed" : "pointer",
                  opacity: !compared && compareDisabled ? 0.5 : 1,
                  fontFamily: "inherit",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  transition: "background 0.15s",
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {compared ? (
                    <polyline points="20 6 9 17 4 12" />
                  ) : (
                    <>
                      <rect x="3" y="3" width="7" height="7" />
                      <rect x="14" y="3" width="7" height="7" />
                      <rect x="3" y="14" width="7" height="7" />
                      <rect x="14" y="14" width="7" height="7" />
                    </>
                  )}
                </svg>
                {compared ? "Ajouté" : "Comparer"}
              </button>
            )}
          </div>
        )}
      </div>
    </a>
  )
}
