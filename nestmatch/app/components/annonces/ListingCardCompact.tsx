"use client"
import { useState, useRef } from "react"
import Image from "next/image"
import { CARD_GRADIENTS as GRADIENTS } from "../../../lib/cardGradients"
import DpeBadge from "./DpeBadge"

/**
 * MapListCard fidèle handoff (3) app.jsx l. 768-892.
 *
 * Layout horizontal `grid 150px 1fr` :
 *  - Photo gauche 150px (aspect carré ~180px de hauteur)
 *      · Badge NOUVEAU pill ink top-left (si created_at < 7j)
 *      · Pill match% pill blanc translucide top-left (sous NOUVEAU)
 *      · Favori top-right 28×28 rond
 *      · Compteur photos pill noir 55% bottom-right
 *      · Barre segmentée photos bottom (style Stories)
 *  - Contenu droit :
 *      · Eyebrow VILLE · QUARTIER 9.5px tracked
 *      · Titre h3 14/600 clamp 2 lignes
 *      · Prix gros top-right 16/700 + sub charges 9.5px
 *      · Specs row 11px : `28 m² · 1 p. · DPE C · Meublé`
 *      · Disponibilité 10.5px italic avec icône clock
 *      · Action bar (border-top) : Aperçu / Comparer / Voir →
 *
 * Hover/active : background + border ink, shadow lift.
 * Card cliquable globale → ouvre la fiche annonce.
 */

interface Props {
  annonce: any
  active: boolean
  favori: boolean
  match: number | null
  onMouseEnter: () => void
  onMouseLeave: () => void
  onToggleFavori: (e: React.MouseEvent) => void
  /** R10.2 — onClick aperçu rapide. Si absent, bouton masqué. */
  onPreview?: (annonceId: number) => void
  /** R10.2 — état comparaison */
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

function formatDispo(annonce: any): string {
  const dispo = annonce.dispo
  if (typeof dispo === "string" && dispo.trim()) return dispo
  if (annonce.date_debut_bail) {
    try {
      return `Libre ${new Date(annonce.date_debut_bail).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`
    } catch { /* ignore */ }
  }
  return ""
}

export default function ListingCardCompact({
  annonce,
  active,
  favori,
  match,
  onMouseEnter,
  onMouseLeave,
  onToggleFavori,
  onPreview,
  compared = false,
  onToggleCompare,
  compareDisabled = false,
}: Props) {
  const [idx, setIdx] = useState(0)
  const realPhotos: string[] = Array.isArray(annonce.photos) && annonce.photos.length > 0 ? annonce.photos : []
  const photos = realPhotos.slice(0, 6)
  const total = photos.length > 0 ? photos.length : 1
  const base = GRADIENTS[annonce.id % GRADIENTS.length]
  const touchStartX = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)

  const showNew = isNewAnnonce(annonce.created_at)
  const ville = (annonce.ville || "").toString().trim()
  const quartier = (annonce.quartier || "").toString().trim()
  const loc = ville && quartier ? `${ville} · ${quartier}` : ville
  const dispoLabel = formatDispo(annonce)
  const charges = typeof annonce.charges === "number" && annonce.charges > 0 ? annonce.charges : null
  const currentPhoto = photos[idx]

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

  function handlePhotoTap(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (total > 1) setIdx(i => (i + 1) % total)
  }
  function handlePreview(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (onPreview) onPreview(annonce.id)
  }
  function handleCompareToggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (onToggleCompare && (compared || !compareDisabled)) onToggleCompare(annonce.id)
  }

  return (
    <a
      href={`/annonces/${annonce.id}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        display: "grid",
        gridTemplateColumns: "180px 1fr",
        gap: 0,
        marginBottom: 12,
        background: "#fff",
        borderRadius: 14,
        overflow: "hidden",
        border: active ? "1.5px solid #111" : "1px solid #EAE6DF",
        boxShadow: active ? "0 12px 28px rgba(0,0,0,0.10)" : "0 1px 2px rgba(0,0,0,0.03)",
        transition: "all 200ms cubic-bezier(.2,.8,.2,1)",
        position: "relative",
        textDecoration: "none",
        color: "#111",
      }}
    >
      {/* ── PHOTO gauche ── */}
      <div
        onClick={handlePhotoTap}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          position: "relative",
          overflow: "hidden",
          background: currentPhoto ? "#000" : base,
          minHeight: 210,
        }}
      >
        {currentPhoto ? (
          <Image
            src={currentPhoto}
            alt={annonce.titre || "Photo logement"}
            fill
            sizes="180px"
            style={{ objectFit: "cover", display: "block" }}
          />
        ) : null}

        {/* Badges top-left : NOUVEAU + match% */}
        <div style={{ position: "absolute", top: 8, left: 8, display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start", pointerEvents: "none", zIndex: 2 }}>
          {showNew && (
            <span style={{ padding: "3px 8px", background: "#111", color: "#fff", borderRadius: 999, fontSize: 9, fontWeight: 700, letterSpacing: "1px" }}>
              NOUVEAU
            </span>
          )}
          {match !== null && (
            <span style={{ padding: "3px 8px", background: "rgba(255,255,255,0.96)", color: "#111", borderRadius: 999, fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 4, height: 4, background: "#16A34A", borderRadius: "50%" }} />
              {match}%
            </span>
          )}
        </div>

        {/* Top-right : favori uniquement (Paul 2026-04-27 — Aperçu + Comparer
            deplaces dans la barre d'actions du footer pour ne plus bloquer
            la photo, a gauche du CTA "Voir l'annonce"). */}
        <div style={{ position: "absolute", top: 8, right: 8, zIndex: 3 }}>
          <button
            type="button"
            onClick={onToggleFavori}
            aria-label={favori ? "Retirer des favoris" : "Ajouter aux favoris"}
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: favori ? "#DC2626" : "rgba(255,255,255,0.95)",
              color: favori ? "#fff" : "#111",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "transform 200ms",
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.10)")}
            onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill={favori ? "#fff" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        </div>

        {/* Photo dots segmented bar bottom */}
        {photos.length > 1 && (
          <div style={{ position: "absolute", bottom: 8, left: 10, right: 10, display: "flex", gap: 3, zIndex: 2 }} aria-hidden="true">
            {photos.map((_, i) => (
              <div key={i} style={{
                flex: 1,
                height: 2,
                background: i === idx ? "#fff" : "rgba(255,255,255,0.4)",
                borderRadius: 999,
                transition: "background 200ms",
              }} />
            ))}
          </div>
        )}

        {/* Compteur photos bottom-right */}
        {photos.length > 1 && (
          <div style={{ position: "absolute", bottom: 14, right: 8, padding: "2px 7px", background: "rgba(0,0,0,0.55)", color: "#fff", borderRadius: 999, fontSize: 9.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 3, zIndex: 2 }} aria-hidden="true">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            {photos.length}
          </div>
        )}
      </div>

      {/* ── CONTENU droit ── */}
      <div style={{ padding: "12px 14px 10px", display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            {loc && (
              <div style={{ fontSize: 9.5, fontWeight: 700, color: "#6B6B6B", textTransform: "uppercase" as const, letterSpacing: "1.1px", marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {loc}
              </div>
            )}
            <h3 style={{
              fontSize: 14,
              fontWeight: 600,
              margin: 0,
              lineHeight: 1.25,
              letterSpacing: "-0.2px",
              color: "#111",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}>
              {annonce.titre || "Sans titre"}
            </h3>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#111", fontVariantNumeric: "tabular-nums" as const, letterSpacing: "-0.3px", lineHeight: 1 }}>
              {annonce.prix?.toLocaleString("fr-FR") ?? "—"}<span style={{ fontWeight: 500, fontSize: 13 }}> €</span>
            </div>
            {charges !== null && (
              <div style={{ fontSize: 9.5, color: "#8a8477", marginTop: 2 }}>+{charges} € ch.</div>
            )}
          </div>
        </div>

        {/* Specs row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, fontSize: 11, color: "#6B6B6B", fontWeight: 500, flexWrap: "wrap" }}>
          {annonce.surface != null && <span>{annonce.surface} m²</span>}
          {annonce.surface != null && annonce.pieces != null && <span style={{ width: 2, height: 2, background: "#EAE6DF", borderRadius: "50%" }} />}
          {annonce.pieces != null && <span>{annonce.pieces} p.</span>}
          {annonce.dpe && (
            <>
              <span style={{ width: 2, height: 2, background: "#EAE6DF", borderRadius: "50%" }} />
              <DpeBadge letter={annonce.dpe} surfaceM2={Number(annonce.surface) || null} />
            </>
          )}
          {annonce.meuble === true && (
            <>
              <span style={{ width: 2, height: 2, background: "#EAE6DF", borderRadius: "50%" }} />
              <span>Meublé</span>
            </>
          )}
        </div>

        {/* Disponibilité */}
        {dispoLabel && (
          <div style={{ fontSize: 10.5, color: "#8a8477", marginTop: 4, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            {dispoLabel}
          </div>
        )}

        {/* Action bar (Paul 2026-04-27) : Aperçu + Comparer ghost a gauche,
            CTA "Voir l'annonce" a droite. stopPropagation pour ne pas
            declencher la navigation vers /annonces/[id] sur les actions
            secondaires. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: "auto", paddingTop: 10, borderTop: "1px solid #EAE6DF", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 1, minWidth: 0 }}>
            {onPreview && (
              <button
                type="button"
                onClick={handlePreview}
                aria-label="Aperçu rapide de l'annonce"
                title="Aperçu rapide — voir le détail sans quitter la liste"
                onMouseEnter={e => { e.currentTarget.style.background = "#F7F4EF"; e.currentTarget.style.color = "#111" }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#6B6B6B" }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  background: "transparent", border: "none",
                  color: "#6B6B6B", padding: "5px 8px", borderRadius: 999,
                  fontSize: 11.5, fontWeight: 600, fontFamily: "inherit",
                  cursor: "pointer", transition: "background 150ms, color 150ms",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
                disabled={!compared && compareDisabled}
                aria-label={compared ? "Retirer du comparateur" : "Ajouter au comparateur"}
                aria-pressed={compared}
                title={compared ? "Retirer de la comparaison" : (compareDisabled ? "Maximum atteint" : "Comparer cette annonce")}
                onMouseEnter={e => { if (compared) return; if (compareDisabled) return; e.currentTarget.style.background = "#F7F4EF"; e.currentTarget.style.color = "#111" }}
                onMouseLeave={e => { if (compared) return; e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#6B6B6B" }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  background: compared ? "#111" : "transparent",
                  border: "none",
                  color: compared ? "#fff" : "#6B6B6B",
                  padding: "5px 8px", borderRadius: 999,
                  fontSize: 11.5, fontWeight: 600, fontFamily: "inherit",
                  cursor: !compared && compareDisabled ? "not-allowed" : "pointer",
                  opacity: !compared && compareDisabled ? 0.55 : 1,
                  transition: "background 150ms, color 150ms",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {compared ? (
                    <polyline points="20 6 9 17 4 12" />
                  ) : (
                    <>
                      <line x1="12" y1="3" x2="12" y2="21" />
                      <line x1="3" y1="9" x2="21" y2="9" />
                      <path d="M3 9 6 15 9 9" />
                      <path d="M15 9 18 15 21 9" />
                    </>
                  )}
                </svg>
                {compared ? "Comparé" : "Comparer"}
              </button>
            )}
          </div>
          <span style={{
            padding: "7px 14px",
            borderRadius: 999,
            background: "#111",
            color: "#fff",
            fontFamily: "inherit",
            fontSize: 11.5,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            whiteSpace: "nowrap",
            letterSpacing: "0.3px",
            flexShrink: 0,
          }}>
            Voir l&apos;annonce
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </span>
        </div>
      </div>
    </a>
  )
}
