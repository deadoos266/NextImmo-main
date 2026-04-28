"use client"
import { useState, useRef, type CSSProperties } from "react"
import Image from "next/image"
import { CARD_GRADIENTS as GRADIENTS } from "../../../lib/cardGradients"
import DpeBadge from "./DpeBadge"

/**
 * Card annonce pour la grille `/annonces` — fidélité Claude Design handoff
 * (`app.jsx` ListingCard lignes 234-288).
 *
 * Structure :
 *   - Photo aspect 4/5 portrait
 *   - Top-left : badge NOUVEAU (#111/#fff) + pill match% (white blur)
 *   - Top-right : favori 38×38 rond (#DC2626 si actif, white blur sinon)
 *   - **Photo indicator = barre segmentée** (handoff l. 273-277) — N segments
 *     hauteur 2px qui se partagent la largeur (flex:1), actif #fff opaque,
 *     autres rgba(255,255,255,0.4). Style Stories/YouTube Shorts.
 *   - Footer padding 14 :
 *       · Eyebrow VILLE · QUARTIER 10.5px/600/letterSpacing 1.1px uppercase
 *       · Titre h3 14px/500 clamp 2 lignes letterSpacing -0.15px
 *       · Separator 1px + UNE SEULE LIGNE inline :
 *         `surface m² · pieces p. · DPE C` (gauche, 11.5px muted)
 *         `1180 €/mois` (droite, 13.5px/700 + /mois 10px soft)
 *   - Hover : translateY(-4px) + boxShadow 0 20px 40px
 *   - Stagger entrance : animDelay = i * 50, animation km-fade 600ms
 *
 * Photos :
 *   - PAS d'auto-rotation (feedback user historique)
 *   - Flèches manuelles visibles au hover desktop
 *   - Touch swipe horizontal mobile (threshold 50px)
 *   - Limite 6 photos (perf)
 *
 * R10.2 (QuickView/Compare) : props conservées dans l'API pour ne pas casser
 * AnnoncesClient, mais pas rendues dans la UI (handoff strict — pas de
 * boutons Aperçu/Comparer dans la card du grid). Si on veut les remettre
 * plus tard, ajouter un slot footer optionnel.
 */

interface Props {
  annonce: any
  score: number | null
  info: { label: string; color: string; bg: string } | null
  /** V7.3 — rang dans la liste filtree (1..N). null si liste < 10 ou exclu. */
  rang?: number | null
  /** V7.3 — total annonces classees. */
  rangTotal?: number | null
  isOwn: boolean
  isSelected: boolean
  favori: boolean
  onToggleFavori: (e: React.MouseEvent) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  motCle: string
  /** Index dans la liste rendue — pilote l'animation km-fade stagger. */
  index?: number
  /** R10.2 — props gardées pour compat appel mais non rendues côté handoff strict. */
  onQuickView?: (annonceId: number) => void
  compared?: boolean
  onToggleCompare?: (annonceId: number) => void
  compareDisabled?: boolean
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

// ─── CardPhoto : carousel + barre segmentée style handoff ────────────────────
function CardPhoto({ annonce }: { annonce: any }) {
  const [idx, setIdx] = useState(0)
  const realPhotos: string[] = Array.isArray(annonce.photos) && annonce.photos.length > 0 ? annonce.photos : []
  const photos = realPhotos.slice(0, 6)
  const total = photos.length > 0 ? photos.length : 1
  const base = GRADIENTS[annonce.id % GRADIENTS.length]
  const touchStartX = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)

  function prev(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    setIdx(i => (i - 1 + total) % total)
  }
  function next(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    setIdx(i => (i + 1) % total)
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
        const ctrls = e.currentTarget.querySelectorAll<HTMLElement>(".card-photo-arrow")
        ctrls.forEach(b => (b.style.opacity = "1"))
      }}
      onMouseLeave={e => {
        const ctrls = e.currentTarget.querySelectorAll<HTMLElement>(".card-photo-arrow")
        ctrls.forEach(b => (b.style.opacity = "0"))
      }}
    >
      {currentPhoto ? (
        <Image
          src={currentPhoto}
          alt={annonce.titre || "Photo logement"}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 33vw, 320px"
          style={{ objectFit: "cover", display: "block" }}
        />
      ) : null}

      {photos.length > 1 && (
        <>
          <button
            className="card-photo-arrow"
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
              width: 28,
              height: 28,
              cursor: "pointer",
              fontSize: 14,
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
            className="card-photo-arrow"
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
              width: 28,
              height: 28,
              cursor: "pointer",
              fontSize: 14,
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

          {/* ── Barre segmentée handoff (l. 273-277) ── */}
          <div
            style={{
              position: "absolute",
              bottom: 12,
              left: 14,
              right: 14,
              display: "flex",
              gap: 4,
              pointerEvents: "none",
              zIndex: 2,
            }}
          >
            {photos.map((_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 2,
                  background: i === idx ? "#fff" : "rgba(255,255,255,0.4)",
                  borderRadius: 999,
                  transition: "background 200ms",
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Export principal ───────────────────────────────────────────────────────
export default function ListingCardSearch({
  annonce,
  score,
  info: _info,
  rang,
  rangTotal,
  isOwn,
  isSelected,
  favori,
  onToggleFavori,
  onMouseEnter,
  onMouseLeave,
  motCle: _motCle,
  index = 0,
  // Aperçu (QuickView) + Comparer : restaurés sur demande Paul (avril 2026)
  onQuickView,
  compared,
  onToggleCompare,
  compareDisabled,
}: Props) {
  void _info; void _motCle

  const showNew = isNewAnnonce(annonce.created_at)
  const matchPct = score !== null && !isOwn ? Math.round(score / 10) : null
  const loc = formatLocalisationFull(annonce)
  const animDelay = index * 50

  // Specs ligne inline : "54 m² · 2 p." + chip DPE coloré séparé.
  // La lettre DPE n'est plus en texte plat : pastille colorée selon la
  // palette officielle ADEME (vert A → rouge G), cf `lib/dpeColors.ts`.
  const specsParts: string[] = []
  if (annonce.surface != null) specsParts.push(`${annonce.surface} m²`)
  if (annonce.pieces != null) specsParts.push(`${annonce.pieces} p.`)
  const specsLine = specsParts.join(" · ")
  const dpeLetter = annonce.dpe ? String(annonce.dpe).toUpperCase() : null

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
    animation: `km-fade 600ms ease-out ${animDelay}ms both`,
    fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
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
      {/* Style global keyframes — injecté une fois par card mais le browser
          dédupe par nom (km-fade), pas de duplication CSS effective. */}
      <style>{`@keyframes km-fade { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }`}</style>

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
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {matchPct}% match
              {/* V7.3 — rang relatif si liste >= 10 */}
              {rang !== null && rang !== undefined && rangTotal !== null && rangTotal !== undefined && (
                <span style={{ fontSize: 10, fontWeight: 500, color: "#8a8477", letterSpacing: "0.1px" }}>
                  · #{rang}/{rangTotal}
                </span>
              )}
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

        {/* Top-right : favori uniquement — masque si isOwn (Paul 2026-04-27,
            user : "si c'est mon annonce je suis pas censé pouvoir contacter
            le proprio"; idem favori/comparer = no-op sur sa propre annonce). */}
        {!isOwn && (
          <div style={{ position: "absolute", top: 12, right: 12, zIndex: 5 }}>
            <button
              onClick={onToggleFavori}
              aria-label={favori ? "Retirer des favoris" : "Ajouter aux favoris"}
              style={{
                width: 38, height: 38, borderRadius: "50%",
                background: favori ? "#DC2626" : "rgba(255,255,255,0.94)",
                color: favori ? "white" : "#111",
                border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                backdropFilter: "blur(6px)", transition: "transform 200ms",
              }}
              onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.10)")}
              onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill={favori ? "white" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* ═══ Footer infos — handoff strict (eyebrow + titre + separator + 1 ligne) ═══ */}
      <div style={{ padding: 14 }}>
        {loc && (
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: "#6B6B6B",
              textTransform: "uppercase",
              letterSpacing: "1.1px",
              marginBottom: 4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {loc}
          </div>
        )}

        <h3
          style={{
            fontSize: 14,
            fontWeight: 500,
            margin: "0 0 10px",
            lineHeight: 1.25,
            letterSpacing: "-0.15px",
            color: "#111",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            minHeight: "2.5em",
          }}
        >
          {annonce.titre || "Sans titre"}
        </h3>

        {/* Separator + UNE SEULE LIGNE inline (handoff strict l. 281-284) */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            paddingTop: 9,
            borderTop: "1px solid #EAE6DF",
            fontSize: 11.5,
            color: "#8a8477",
            gap: 8,
          }}
        >
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {specsLine}
            <DpeBadge letter={dpeLetter} surfaceM2={Number(annonce.surface) || null} />
            {/* V9.1 — pill discrete loi Climat 2028 si DPE F/G */}
            {(dpeLetter === "F" || dpeLetter === "G") && (
              <span title="Loi Climat & Résilience : interdiction de location à partir de 2028 (G déjà interdits depuis 2025)" style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                padding: "1px 7px", borderRadius: 999,
                background: "#FEECEC", color: "#b91c1c",
                border: "1px solid #F4C9C9",
                fontSize: 9.5, fontWeight: 700, letterSpacing: "0.3px",
                whiteSpace: "nowrap",
              }}>
                ⚠ Interdiction 2028
              </span>
            )}
          </span>
          <span
            style={{
              fontWeight: 700,
              color: "#111",
              fontSize: 13.5,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.2px",
              flexShrink: 0,
            }}
          >
            {annonce.prix?.toLocaleString("fr-FR") ?? "—"} €
            <span style={{ fontWeight: 400, color: "#8a8477", fontSize: 10 }}>/mois</span>
          </span>
        </div>

        {/* Actions ghost (Aperçu + Comparer) — Paul 2026-04-27 : deplaces de
            l'overlay photo top-right vers le footer card pour ne plus bloquer
            la photo. Style ghost (transparent + hover beige) pour rester
            secondaire vs la card cliquable. stopPropagation pour ne pas
            declencher la navigation vers /annonces/[id]. Masque si isOwn —
            no sense de comparer sa propre annonce avec d'autres. */}
        {!isOwn && (onQuickView || onToggleCompare) && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, paddingTop: 9, borderTop: "1px solid #EAE6DF" }}>
            {onQuickView && (
              <button
                type="button"
                onClick={e => { e.preventDefault(); e.stopPropagation(); onQuickView(annonce.id) }}
                aria-label="Aperçu rapide de l'annonce"
                title="Aperçu rapide — voir le détail sans quitter la liste"
                onMouseEnter={e => { e.currentTarget.style.background = "#F7F4EF"; e.currentTarget.style.color = "#111" }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#6B6B6B" }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: "transparent", border: "none",
                  color: "#6B6B6B", padding: "6px 10px", borderRadius: 999,
                  fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                  cursor: "pointer", transition: "background 150ms, color 150ms",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Aperçu
              </button>
            )}
            {onToggleCompare && (
              <button
                type="button"
                onClick={e => { e.preventDefault(); e.stopPropagation(); if (!compareDisabled || compared) onToggleCompare(annonce.id) }}
                disabled={!compared && compareDisabled}
                aria-label={compared ? "Retirer de la comparaison" : "Ajouter à la comparaison"}
                aria-pressed={compared}
                title={compared ? "Retirer de la comparaison" : (compareDisabled ? "Maximum atteint" : "Comparer cette annonce")}
                onMouseEnter={e => { if (compared) return; if (compareDisabled) return; e.currentTarget.style.background = "#F7F4EF"; e.currentTarget.style.color = "#111" }}
                onMouseLeave={e => { if (compared) return; e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#6B6B6B" }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: compared ? "#111" : "transparent",
                  border: "none",
                  color: compared ? "#fff" : "#6B6B6B",
                  padding: "6px 10px", borderRadius: 999,
                  fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                  cursor: !compared && compareDisabled ? "not-allowed" : "pointer",
                  opacity: !compared && compareDisabled ? 0.55 : 1,
                  transition: "background 150ms, color 150ms",
                }}
              >
                {compared ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="12" y1="3" x2="12" y2="21" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <path d="M3 9 6 15 9 9" />
                    <path d="M15 9 18 15 21 9" />
                  </svg>
                )}
                {compared ? "Comparé" : "Comparer"}
              </button>
            )}
          </div>
        )}
      </div>
    </a>
  )
}
