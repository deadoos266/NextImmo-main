"use client"

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react"
import Image from "next/image"
import Link from "next/link"
import type { MapAnnoncesProps } from "../MapAnnonces"
import { km } from "../ui/km"

/**
 * Pattern SeLoger mobile (Paul 2026-04-27 v3 — refactor du pattern Airbnb).
 *
 * User : "j'aime bien l'idee de SeLoger quand on est sur la carte tu peux
 * faire pareil, on est que sur la carte et quand on clique la fiche
 * apparait".
 *
 * Comportement :
 *   - Map fullscreen au repos. Aucune card visible.
 *   - Tap marker → card slide-up depuis le bottom (250ms cubic-bezier).
 *     Marker devient actif (style scale 1.08 + ink/blanc gere par
 *     MapAnnonces selon selectedId).
 *   - Swipe horizontal sur la card → navigue prev/next parmi les annonces
 *     filtrees (touch handlers, threshold 50px). Map flyTo sur le marker
 *     matchant via `FlyToSelected` interne au MapAnnonces.
 *   - Tap sur la card body (hors X et hors zone swipe) → navigation vers
 *     /annonces/[id] (Link wrap autour du contenu).
 *   - X close ou Esc → ferme la card, plus de marker actif.
 *
 * Note : tap "vide" sur la map ne ferme pas la card aujourd'hui (necessite
 * un onMapClick callback dans MapAnnonces, pas trivial avec react-leaflet).
 * Close via X est largement suffisant pour MVP.
 */
export default function MobileMapCarousel({
  annonces,
  selectedId,
  onSelect,
  onClose,
  onBoundsChange,
  centerHint,
  favoris,
  onToggleFavori,
  MapComp,
}: {
  annonces: any[]
  selectedId: number | null
  onSelect: (id: number | null) => void
  onClose: () => void
  onBoundsChange: MapAnnoncesProps["onBoundsChange"]
  centerHint: [number, number] | null
  favoris: number[]
  onToggleFavori: (id: number) => void
  MapComp: ComponentType<MapAnnoncesProps>
}) {
  const cardAnnonces = useMemo(() => annonces.filter(a => a._lat && a._lng), [annonces])

  // Index de la card actuellement affichee, ou null si aucune.
  // Derive de `selectedId` mais peut etre clear independamment (X close).
  const [showCard, setShowCard] = useState(false)
  const currentIndex = useMemo(() => {
    if (selectedId === null) return -1
    return cardAnnonces.findIndex(a => a.id === selectedId)
  }, [cardAnnonces, selectedId])

  // Au tap d'un marker (selectedId change non-null) : show card.
  // Au close (selectedId redevient null) : hide card.
  useEffect(() => {
    if (selectedId === null) {
      setShowCard(false)
    } else {
      setShowCard(true)
    }
  }, [selectedId])

  // Esc ferme la card (en plus du onClose modal global gere par AnnoncesClient).
  useEffect(() => {
    if (!showCard) return
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation()
        closeCard()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCard])

  function closeCard() {
    setShowCard(false)
    onSelect(null)
  }
  function showAt(index: number) {
    if (index < 0 || index >= cardAnnonces.length) return
    onSelect(cardAnnonces[index].id)
  }
  function prev() { showAt(currentIndex - 1) }
  function next() { showAt(currentIndex + 1) }

  // Touch swipe horizontal sur la card pour navigate prev/next
  const touchStartX = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)
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
    if (Math.abs(diff) > 50) {
      if (diff > 0) next()
      else prev()
    }
    touchStartX.current = null
    touchEndX.current = null
  }

  const current = currentIndex >= 0 ? cardAnnonces[currentIndex] : null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Carte des annonces"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 7400,
        background: km.beige,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header sticky : Liste + count */}
      <div style={{
        flexShrink: 0,
        padding: "12px 16px",
        background: km.white,
        borderBottom: `1px solid ${km.line}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        zIndex: 2,
      }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Retour à la liste"
          style={{
            background: km.white,
            color: km.ink,
            border: `1px solid ${km.line}`,
            borderRadius: 999,
            padding: "8px 16px",
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.6px",
            fontFamily: "inherit",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Liste
        </button>
        <span style={{ fontSize: 12, color: "#666", fontWeight: 500 }}>
          {annonces.length} annonce{annonces.length > 1 ? "s" : ""}
          {cardAnnonces.length < annonces.length && (
            <span style={{ color: "#999", marginLeft: 4 }}>
              · {cardAnnonces.length} géolocalisée{cardAnnonces.length > 1 ? "s" : ""}
            </span>
          )}
        </span>
      </div>

      {/* Map fullscreen — prend tout l'espace restant. */}
      <div style={{
        flex: 1,
        position: "relative",
        isolation: "isolate",
        overflow: "hidden",
        minHeight: 0,
      }}>
        <MapComp
          annonces={annonces}
          selectedId={selectedId}
          onSelect={id => onSelect(id)}
          onBoundsChange={onBoundsChange}
          centerHint={centerHint}
          favoris={favoris}
          onToggleFavori={onToggleFavori}
        />

        {/* Card overlay slide-up — pattern SeLoger.
            Animation : translateY(100% → 0) sur 250ms cubic-bezier.
            Toujours rendered (pour permettre l'animation), visibilite via
            transform + pointer-events. Quand caché : pointer-events none
            pour ne pas bloquer les taps sur la map. */}
        <div
          aria-hidden={!showCard}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "0 12px calc(12px + env(safe-area-inset-bottom, 0px))",
            transform: showCard ? "translateY(0)" : "translateY(110%)",
            transition: "transform 250ms cubic-bezier(0.4, 0, 0.2, 1)",
            pointerEvents: showCard ? "auto" : "none",
            zIndex: 1000,
          }}
        >
          {current && (
            <div
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              style={{
                position: "relative",
                background: km.white,
                borderRadius: 16,
                boxShadow: "0 -8px 28px rgba(0,0,0,0.18)",
                border: `1px solid ${km.line}`,
                overflow: "hidden",
              }}
            >
              {/* X close (top-right) — au-dessus du Link wrap pour ne pas
                  declencher la navigation par accident. zIndex: 2. */}
              <button
                type="button"
                onClick={closeCard}
                aria-label="Fermer la fiche"
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  zIndex: 2,
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.94)",
                  color: km.ink,
                  border: `1px solid ${km.line}`,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "inherit",
                  WebkitTapHighlightColor: "transparent",
                  backdropFilter: "blur(6px)",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>

              {/* Le contenu cliquable (hors X) navigue vers la fiche. */}
              <CardContent
                annonce={current}
                isFavori={favoris.includes(current.id)}
                onToggleFavori={onToggleFavori}
              />

              {/* Pagination dots si plus d'1 annonce — affordance "swipe pour
                  voir les autres". Style discret bottom-center. */}
              {cardAnnonces.length > 1 && (
                <div style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 5,
                  padding: "0 0 8px",
                  pointerEvents: "none",
                }}>
                  {/* Visualise la position avec 7 dots max (currentIndex
                      centre). Pas besoin d'une dot par annonce — si 200
                      annonces, ca devient illisible. */}
                  {(() => {
                    const total = cardAnnonces.length
                    const window = 7
                    let start = Math.max(0, currentIndex - Math.floor(window / 2))
                    const end = Math.min(total, start + window)
                    if (end - start < window) start = Math.max(0, end - window)
                    const dots = []
                    for (let i = start; i < end; i++) {
                      dots.push(
                        <span key={i} style={{
                          width: i === currentIndex ? 16 : 5,
                          height: 5,
                          background: i === currentIndex ? km.ink : km.line,
                          borderRadius: 999,
                          transition: "all 200ms",
                        }} />
                      )
                    }
                    return dots
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── CardContent : photo + infos, wrap dans un Link pour naviguer ────
// Format inspire de ListingCardCompact (horizontal landscape) — le tap
// sur le contenu navigue vers /annonces/[id].
function CardContent({
  annonce,
  isFavori,
  onToggleFavori,
}: {
  annonce: any
  isFavori: boolean
  onToggleFavori: (id: number) => void
}) {
  const photo = Array.isArray(annonce.photos) && annonce.photos.length > 0 ? annonce.photos[0] : null
  const ville = (annonce.ville || "").toString().trim()
  const quartier = (annonce.quartier || "").toString().trim()
  const loc = ville && quartier ? `${ville} · ${quartier}` : ville
  const surface = annonce.surface != null ? `${annonce.surface} m²` : null
  const pieces = annonce.pieces != null ? `${annonce.pieces} p.` : null
  const specs = [surface, pieces].filter(Boolean).join(" · ")

  return (
    <Link
      href={`/annonces/${annonce.id}`}
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr",
        gap: 0,
        textDecoration: "none",
        color: km.ink,
        fontFamily: "inherit",
      }}
    >
      <div style={{
        position: "relative",
        width: 120,
        aspectRatio: "1 / 1",
        background: "#000",
      }}>
        {photo ? (
          <Image
            src={photo}
            alt={annonce.titre || "Photo logement"}
            fill
            sizes="120px"
            style={{ objectFit: "cover" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", background: km.beige }} />
        )}
        <button
          type="button"
          onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleFavori(annonce.id) }}
          aria-label={isFavori ? "Retirer des favoris" : "Ajouter aux favoris"}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: isFavori ? "#DC2626" : "rgba(255,255,255,0.94)",
            color: isFavori ? "#fff" : km.ink,
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(6px)",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill={isFavori ? "#fff" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      </div>

      <div style={{ padding: "12px 14px 8px", display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 0 }}>
        <div style={{ minWidth: 0, paddingRight: 36 /* eviter overlap avec X close */ }}>
          {loc && (
            <p style={{
              fontSize: 9.5,
              fontWeight: 700,
              color: "#6B6B6B",
              textTransform: "uppercase",
              letterSpacing: "1px",
              margin: "0 0 3px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {loc}
            </p>
          )}
          <h3 style={{
            fontSize: 14,
            fontWeight: 600,
            margin: 0,
            lineHeight: 1.25,
            color: km.ink,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}>
            {annonce.titre || "Sans titre"}
          </h3>
        </div>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
          marginTop: 6,
        }}>
          <span style={{
            fontSize: 11,
            color: "#8a8477",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {specs}
          </span>
          <span style={{
            fontSize: 14,
            fontWeight: 800,
            color: km.ink,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.2px",
            flexShrink: 0,
          }}>
            {annonce.prix?.toLocaleString("fr-FR") ?? "—"} €
            <span style={{ fontWeight: 400, color: "#8a8477", fontSize: 9.5, marginLeft: 1 }}>/mois</span>
          </span>
        </div>
      </div>
    </Link>
  )
}
