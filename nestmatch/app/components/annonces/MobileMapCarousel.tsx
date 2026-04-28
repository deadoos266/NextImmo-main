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
  activeVille,
  onOpenFilters,
  activeFilterCount,
  onSaveSearch,
  canSaveSearch,
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
  /** Ville active (filtre URL ville=...). Affichee en chip cliquable
   *  qui ouvre FiltersModal pour modification (Paul 2026-04-27). */
  activeVille?: string
  /** Ouvre la modale de filtres complets (FiltersModal) — accessible depuis
   *  le header sticky en plus du FAB. User a demande l'acces direct depuis
   *  le mode carte. */
  onOpenFilters?: () => void
  /** Nombre de filtres actifs — affiche en badge sur le bouton Filtres si > 0. */
  activeFilterCount?: number
  /** V19.4 (Paul 2026-04-29) — handler pour le bouton "Sauvegarder" en
   *  bottom. Si non fourni, le bouton n'apparaît pas. Pattern SeLoger. */
  onSaveSearch?: () => void
  canSaveSearch?: boolean
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
        // top: 72 (Paul 2026-04-27) : laisse la Navbar visible au-dessus du
        // mode carte mobile. zIndex 5000 < Navbar 10000 < drawer 11000 :
        // assure que la Navbar (et son burger) restent au-dessus du modal
        // ET cliquables, et que le drawer mobile (au tap burger) s'ouvre
        // bien par-dessus tout. Bug user precedent : "le menu burger passe
        // en dessous donc on peut pas l'utiliser".
        position: "fixed",
        top: 72,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 5000,
        background: km.beige,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header sticky : back Liste + Ville + Filtres (Paul 2026-04-27 v2)
          User : "quand la carte est affiche faudrait qu'on puisse toujours
          avoir acces au choix de la ville et des filtres au dessus".
          Layout 3 colonnes : back arrow / Ville pill cliquable / Filtres
          + badge count. Click Ville ou Filtres → ouvre FiltersModal
          (le picker ville est dans la modale, evite un 2e dropdown). */}
      <div style={{
        flexShrink: 0,
        padding: "10px 12px",
        background: km.white,
        borderBottom: `1px solid ${km.line}`,
        display: "flex",
        alignItems: "center",
        gap: 8,
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
            borderRadius: "50%",
            width: 38,
            height: 38,
            fontFamily: "inherit",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* Ville pill — flex 1 pour prendre la place restante. Click ouvre
            FiltersModal (qui contient le picker ville complet avec
            autocomplete). Affiche la ville active ou "Toute la France". */}
        <button
          type="button"
          onClick={onOpenFilters}
          disabled={!onOpenFilters}
          aria-label={activeVille ? `Filtre ville actuel : ${activeVille}. Modifier` : "Choisir une ville"}
          style={{
            flex: 1,
            minWidth: 0,
            background: km.white,
            color: km.ink,
            border: `1px solid ${km.line}`,
            borderRadius: 999,
            padding: "0 14px",
            height: 38,
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 500,
            cursor: onOpenFilters ? "pointer" : "default",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, color: "#8a8477" }}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}>
            {activeVille || `Toute la France · ${cardAnnonces.length}`}
          </span>
        </button>

        {/* Filtres button — pill avec icone slider + badge count si actifs.
            Open FiltersModal direct. Position right pour pattern Airbnb. */}
        <button
          type="button"
          onClick={onOpenFilters}
          disabled={!onOpenFilters}
          aria-label={`Ouvrir les filtres${activeFilterCount && activeFilterCount > 0 ? ` (${activeFilterCount} actifs)` : ""}`}
          style={{
            position: "relative",
            background: km.white,
            color: km.ink,
            border: `1px solid ${km.line}`,
            borderRadius: 999,
            padding: "0 14px",
            height: 38,
            fontFamily: "inherit",
            fontSize: 12,
            fontWeight: 600,
            cursor: onOpenFilters ? "pointer" : "default",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
            <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
            <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
            <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
          </svg>
          Filtres
          {activeFilterCount !== undefined && activeFilterCount > 0 && (
            <span aria-hidden style={{ background: "#111", color: "#fff", borderRadius: 999, fontSize: 10, fontWeight: 800, minWidth: 18, height: 18, padding: "0 5px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              {activeFilterCount}
            </span>
          )}
        </button>
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
          onMapClick={() => { if (showCard) closeCard() }}
          disablePopup
        />

        {/* FAB "Voir la liste" sticky bottom-center (Paul 2026-04-27).
            Visible uniquement quand AUCUNE card n'est ouverte — disparait
            au tap d'un marker (la card prend le relais visuellement),
            revient au close de la card. Style pill blanc avec icone liste
            a gauche. Position bottom-center du viewport map. */}
        {/* V19.4 (Paul 2026-04-29) — bottom dock 2 boutons style SeLoger :
            "Voir la liste" + "Sauvegarder la recherche". Visible uniquement
            quand aucune card n'est ouverte. */}
        {!showCard && (
          <div style={{
            position: "absolute",
            bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
            left: 12,
            right: 12,
            zIndex: 999,
            display: "flex", gap: 8, justifyContent: "center",
          }}>
            <button
              type="button"
              onClick={onClose}
              aria-label="Voir la liste des annonces"
              style={{
                background: "#111", color: "#fff", border: "none",
                borderRadius: 999, padding: "12px 18px",
                fontSize: 12, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.6px",
                fontFamily: "inherit", cursor: "pointer",
                boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
                display: "inline-flex", alignItems: "center", gap: 8,
                WebkitTapHighlightColor: "transparent",
                flex: onSaveSearch && canSaveSearch !== false ? "1 1 auto" : "0 1 auto",
                minWidth: 0,
                whiteSpace: "nowrap",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
              Liste
            </button>
            {onSaveSearch && canSaveSearch !== false && (
              <button
                type="button"
                onClick={onSaveSearch}
                aria-label="Sauvegarder cette recherche"
                style={{
                  background: "#fff", color: "#111", border: "1px solid #111",
                  borderRadius: 999, padding: "12px 18px",
                  fontSize: 12, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.6px",
                  fontFamily: "inherit", cursor: "pointer",
                  boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
                  display: "inline-flex", alignItems: "center", gap: 8,
                  WebkitTapHighlightColor: "transparent",
                  flex: "1 1 auto",
                  minWidth: 0,
                  whiteSpace: "nowrap",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                </svg>
                Sauvegarder
              </button>
            )}
          </div>
        )}

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

// ─── CardContent : photo carousel + infos, wrap dans un Link pour naviguer.
// Photo carousel (Paul 2026-04-27 v3) : useState photoIdx avec touch swipe
// + fleches ◀ ▶ visibles. Reset a 0 quand l'annonce change (key prop dans
// caller suffit puisqu'on remount). Le swipe sur la PHOTO ne propage pas
// (stopPropagation) pour ne pas declencher le swipe d'annonce parent.
function CardContent({
  annonce,
  isFavori,
  onToggleFavori,
}: {
  annonce: any
  isFavori: boolean
  onToggleFavori: (id: number) => void
}) {
  const photos: string[] = Array.isArray(annonce.photos) ? annonce.photos.slice(0, 6) : []
  const totalPhotos = photos.length
  const [photoIdx, setPhotoIdx] = useState(0)
  const photoTouchStartX = useRef<number | null>(null)
  const photoTouchEndX = useRef<number | null>(null)

  const ville = (annonce.ville || "").toString().trim()
  const quartier = (annonce.quartier || "").toString().trim()
  const loc = ville && quartier ? `${ville} · ${quartier}` : ville
  const surface = annonce.surface != null ? `${annonce.surface} m²` : null
  const pieces = annonce.pieces != null ? `${annonce.pieces} p.` : null
  const specs = [surface, pieces].filter(Boolean).join(" · ")
  const currentPhoto = photos[photoIdx] || null

  function prevPhoto(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    if (totalPhotos <= 1) return
    setPhotoIdx(i => (i - 1 + totalPhotos) % totalPhotos)
  }
  function nextPhoto(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    if (totalPhotos <= 1) return
    setPhotoIdx(i => (i + 1) % totalPhotos)
  }
  function onPhotoTouchStart(e: React.TouchEvent) {
    e.stopPropagation()
    photoTouchStartX.current = e.touches[0].clientX
    photoTouchEndX.current = null
  }
  function onPhotoTouchMove(e: React.TouchEvent) {
    e.stopPropagation()
    photoTouchEndX.current = e.touches[0].clientX
  }
  function onPhotoTouchEnd(e: React.TouchEvent) {
    e.stopPropagation()
    if (photoTouchStartX.current === null || photoTouchEndX.current === null) return
    const diff = photoTouchStartX.current - photoTouchEndX.current
    if (Math.abs(diff) > 40 && totalPhotos > 1) {
      if (diff > 0) setPhotoIdx(i => (i + 1) % totalPhotos)
      else setPhotoIdx(i => (i - 1 + totalPhotos) % totalPhotos)
    }
    photoTouchStartX.current = null
    photoTouchEndX.current = null
  }

  const arrowBtnStyle: React.CSSProperties = {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: 28, height: 28,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.92)",
    color: km.ink,
    border: `1px solid ${km.line}`,
    cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    backdropFilter: "blur(6px)",
    WebkitTapHighlightColor: "transparent",
    zIndex: 2,
    boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
  }

  return (
    <Link
      href={`/annonces/${annonce.id}`}
      style={{
        display: "block",
        textDecoration: "none",
        color: km.ink,
        fontFamily: "inherit",
      }}
    >
      {/* Photo full-width en haut (pattern SeLoger, Paul 2026-04-27 v3).
          Aspect ratio 16/10 → ~225px hauteur sur mobile 360 width. La card
          totale fait ~330-360px (40% viewport iPhone). */}
      <div
        onTouchStart={onPhotoTouchStart}
        onTouchMove={onPhotoTouchMove}
        onTouchEnd={onPhotoTouchEnd}
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "16 / 10",
          background: "#000",
        }}>
        {currentPhoto ? (
          <Image
            src={currentPhoto}
            alt={annonce.titre || "Photo logement"}
            fill
            sizes="(max-width: 768px) 100vw, 360px"
            style={{ objectFit: "cover" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", background: km.beige }} />
        )}

        {/* Indicateur "1/N" top-right de la photo (au-dessus du favori) */}
        {totalPhotos > 1 && (
          <span style={{
            position: "absolute", top: 10, left: 12,
            background: "rgba(0,0,0,0.6)", color: "#fff",
            padding: "3px 10px", borderRadius: 999,
            fontSize: 11, fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            backdropFilter: "blur(6px)",
            zIndex: 2,
            pointerEvents: "none",
          }}>
            {photoIdx + 1} / {totalPhotos}
          </span>
        )}

        {/* Fleches navigation photos — visibles mobile + desktop */}
        {totalPhotos > 1 && (
          <>
            <button
              type="button"
              onClick={prevPhoto}
              aria-label="Photo précédente"
              style={{ ...arrowBtnStyle, left: 8, width: 36, height: 36 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={nextPhoto}
              aria-label="Photo suivante"
              style={{ ...arrowBtnStyle, right: 8, width: 36, height: 36 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>

            {/* Dots bottom photo */}
            <div style={{ position: "absolute", bottom: 10, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 4, pointerEvents: "none", zIndex: 1 }}>
              {photos.map((_, i) => (
                <span key={i} style={{
                  width: i === photoIdx ? 14 : 5,
                  height: 5,
                  background: i === photoIdx ? "#fff" : "rgba(255,255,255,0.55)",
                  borderRadius: 999,
                  transition: "all 200ms",
                }} />
              ))}
            </div>
          </>
        )}

        {/* Favori top-right */}
        <button
          type="button"
          onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleFavori(annonce.id) }}
          aria-label={isFavori ? "Retirer des favoris" : "Ajouter aux favoris"}
          style={{
            position: "absolute",
            top: 10,
            right: 12,
            width: 36,
            height: 36,
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
            zIndex: 2,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={isFavori ? "#fff" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      </div>

      {/* Contenu sous la photo : prix prominent + ville + titre + specs */}
      <div style={{ padding: "14px 16px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          {(() => {
            // V15c (Paul 2026-04-28) — CC = loyer + charges. Pas de HC.
            const loyer = Number(annonce.prix ?? 0)
            const ch = Number((annonce as { charges?: number | null }).charges ?? 0)
            const total = loyer + (ch > 0 ? ch : 0)
            return (
              <span style={{
                fontSize: 22,
                fontWeight: 800,
                color: km.ink,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.4px",
                lineHeight: 1.1,
              }}>
                {total > 0 ? total.toLocaleString("fr-FR") : "—"} €
                <span style={{ fontWeight: 700, fontSize: 11, color: "#15803d", marginLeft: 4, letterSpacing: "0.3px" }} title="Charges comprises (loyer + charges)">CC</span>
                <span style={{ fontWeight: 500, color: "#8a8477", fontSize: 12, marginLeft: 2 }}>/mois</span>
              </span>
            )
          })()}
          {loc && (
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#6B6B6B",
              textTransform: "uppercase",
              letterSpacing: "1px",
              flexShrink: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textAlign: "right",
            }}>
              {loc}
            </span>
          )}
        </div>
        <h3 style={{
          fontSize: 14,
          fontWeight: 600,
          margin: 0,
          lineHeight: 1.3,
          color: km.ink,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          paddingRight: 36 /* eviter overlap avec X close */,
        }}>
          {annonce.titre || "Sans titre"}
        </h3>
        {specs && (
          <p style={{
            fontSize: 12,
            color: "#8a8477",
            margin: 0,
            lineHeight: 1.4,
          }}>
            {specs}
          </p>
        )}
      </div>
    </Link>
  )
}
