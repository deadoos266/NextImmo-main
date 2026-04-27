"use client"

import { forwardRef, useEffect, useRef, type ComponentType } from "react"
import Image from "next/image"
import Link from "next/link"
import type { MapAnnoncesProps } from "../MapAnnonces"
import { km } from "../ui/km"

/**
 * Pattern Airbnb / SeLoger mobile (Paul 2026-04-27).
 *
 * Mobile uniquement : la carte plein-écran cachait les annonces. Maintenant :
 *   - Top ~60% du viewport : carte Leaflet (toujours visible)
 *   - Bottom ~40% : carrousel horizontal de cards swipable au doigt
 *
 * Synchronisation :
 *   - Click marker carte → onSelect(id) → useEffect scroll la card matching
 *     au centre du carrousel.
 *   - Swipe carrousel → IntersectionObserver détecte la card la plus visible
 *     → onSelect(id) → MapComp `FlyToSelected` recentre la carte.
 *
 * Décisions :
 *   - Cards mode "horizontal compact" (photo gauche 110×110, contenu droit) —
 *     le format portrait (4/5) prendrait trop de hauteur sur 40vh.
 *   - scroll-snap-type: x mandatory + scroll-snap-align: center — bounded swipe.
 *   - Largeur card 88vw : laisse voir un peu de la card suivante (affordance
 *     "il y en a d'autres").
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
  const carouselRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef<Map<number, HTMLAnchorElement>>(new Map())
  // Anti-feedback-loop : quand on scroll programmatiquement le carrousel pour
  // suivre selectedId, l'IntersectionObserver triggerait setSelectedId(id) sur
  // la card visible — créant une boucle. On ignore les ticks observer pendant
  // le scroll programmatique.
  const programmaticScrolling = useRef(false)

  // Filtre : seules les annonces avec coords sont rendues dans le carrousel
  // — les autres ne peuvent pas être centrées sur la carte. Évite la
  // confusion "je swipe et la map ne bouge pas".
  const cardAnnonces = annonces.filter(a => a._lat && a._lng)

  // Au scroll horizontal de l'user : trouve la card la plus visible (centerée)
  // et la sélectionne dans la map.
  useEffect(() => {
    const scroller = carouselRef.current
    if (!scroller) return

    // IntersectionObserver dont la "viewport" est le scroller lui-même.
    // threshold 0.6 : la card doit occuper 60%+ de la viewport pour
    // déclencher selection — évite les triggers parasites au début/fin
    // du swipe.
    const obs = new IntersectionObserver(
      entries => {
        if (programmaticScrolling.current) return
        // On choisit l'entrée la plus visible (intersectionRatio max).
        let best: IntersectionObserverEntry | null = null
        for (const e of entries) {
          if (!e.isIntersecting) continue
          if (!best || e.intersectionRatio > best.intersectionRatio) best = e
        }
        if (!best) return
        const idAttr = (best.target as HTMLElement).dataset.annonceId
        const id = idAttr ? Number(idAttr) : NaN
        if (Number.isFinite(id) && id !== selectedId) {
          onSelect(id)
        }
      },
      { root: scroller, threshold: [0.6, 0.7, 0.8, 0.9] }
    )

    cardRefs.current.forEach(el => obs.observe(el))
    return () => obs.disconnect()
    // selectedId dans deps pour éviter la stale closure. On ne re-mount pas
    // l'observer pour autant, on s'appuie sur le ref Map qui ne change pas.
  }, [onSelect, selectedId])

  // Au selectedId qui change (depuis un click marker) : scroll la card
  // matching au centre. Si le selectedId vient déjà d'un swipe, le card est
  // déjà bien centré — pas de scroll redondant car on test inViewport d'abord.
  useEffect(() => {
    if (selectedId === null) return
    const scroller = carouselRef.current
    if (!scroller) return
    const card = cardRefs.current.get(selectedId)
    if (!card) return
    // Test : la card est-elle déjà visible (>50% dans le scroller) ?
    const sRect = scroller.getBoundingClientRect()
    const cRect = card.getBoundingClientRect()
    const overlap = Math.max(0, Math.min(sRect.right, cRect.right) - Math.max(sRect.left, cRect.left))
    const ratio = overlap / Math.max(1, cRect.width)
    if (ratio > 0.7) return  // Déjà bien visible, on ne scrolle pas.

    programmaticScrolling.current = true
    card.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" })
    // Relâche le lock après l'animation (typique 350ms scroll smooth).
    setTimeout(() => { programmaticScrolling.current = false }, 600)
  }, [selectedId])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Carte des annonces avec carrousel"
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

      {/* Carte (flex 0.6 ~60% du viewport) */}
      <div style={{ flex: "1 1 60%", position: "relative", isolation: "isolate", overflow: "hidden", minHeight: 0 }}>
        <MapComp
          annonces={annonces}
          selectedId={selectedId}
          onSelect={id => onSelect(id)}
          onBoundsChange={onBoundsChange}
          centerHint={centerHint}
          favoris={favoris}
          onToggleFavori={onToggleFavori}
        />
      </div>

      {/* Carrousel horizontal — flex 0.4 ~40% */}
      {cardAnnonces.length > 0 ? (
        <div style={{
          flex: "0 0 auto",
          background: km.beige,
          paddingTop: 10,
          paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
          borderTop: `1px solid ${km.line}`,
        }}>
          <div
            ref={carouselRef}
            style={{
              display: "flex",
              gap: 12,
              overflowX: "auto",
              overflowY: "hidden",
              scrollSnapType: "x mandatory",
              scrollPadding: "0 16px",
              padding: "0 16px 4px",
              WebkitOverflowScrolling: "touch",
              // Cache scrollbar visuelle (mobile uniquement de toute facon)
              scrollbarWidth: "none",
            }}
          >
            <style>{`
              .km-mobile-carousel-scroller::-webkit-scrollbar { display: none }
            `}</style>
            {cardAnnonces.map(ann => (
              <CarouselCard
                key={ann.id}
                ref={el => {
                  if (el) cardRefs.current.set(ann.id, el)
                  else cardRefs.current.delete(ann.id)
                }}
                annonce={ann}
                selected={selectedId === ann.id}
                isFavori={favoris.includes(ann.id)}
                onToggleFavori={onToggleFavori}
              />
            ))}
          </div>
        </div>
      ) : (
        <div style={{
          flex: "0 0 auto",
          background: km.beige,
          padding: "16px 20px calc(20px + env(safe-area-inset-bottom, 0px))",
          textAlign: "center",
          borderTop: `1px solid ${km.line}`,
        }}>
          <p style={{ fontSize: 13, color: "#666", margin: 0, lineHeight: 1.5 }}>
            Aucune annonce géolocalisée dans cette zone.
            <br />
            <span style={{ fontSize: 12, color: "#999" }}>
              Déplacez la carte ou ajustez vos filtres.
            </span>
          </p>
        </div>
      )}
    </div>
  )
}

// ─── CarouselCard : mini-card horizontale optimisée pour scroll-snap ───
interface CarouselCardProps {
  annonce: any
  selected: boolean
  isFavori: boolean
  onToggleFavori: (id: number) => void
}

const CarouselCard = forwardRef<HTMLAnchorElement, CarouselCardProps>(
  function CarouselCard({ annonce, selected, isFavori, onToggleFavori }, ref) {
    const photo = Array.isArray(annonce.photos) && annonce.photos.length > 0 ? annonce.photos[0] : null
    const ville = (annonce.ville || "").toString().trim()
    const surface = annonce.surface != null ? `${annonce.surface} m²` : null
    const pieces = annonce.pieces != null ? `${annonce.pieces} p.` : null
    const specs = [surface, pieces].filter(Boolean).join(" · ")

    return (
      <Link
        ref={ref}
        href={`/annonces/${annonce.id}`}
        data-annonce-id={annonce.id}
        style={{
          flex: "0 0 88vw",
          maxWidth: 360,
          scrollSnapAlign: "center",
          display: "flex",
          gap: 12,
          padding: 10,
          background: km.white,
          border: `1px solid ${selected ? km.ink : km.line}`,
          borderRadius: 16,
          textDecoration: "none",
          color: km.ink,
          boxShadow: selected ? "0 8px 20px rgba(0,0,0,0.10)" : "0 1px 3px rgba(0,0,0,0.04)",
          transition: "border-color 200ms, box-shadow 200ms",
          fontFamily: "inherit",
          alignItems: "stretch",
        }}
      >
        {/* Photo */}
        <div style={{
          position: "relative",
          flexShrink: 0,
          width: 110,
          aspectRatio: "1 / 1",
          background: "#000",
          borderRadius: 12,
          overflow: "hidden",
        }}>
          {photo ? (
            <Image
              src={photo}
              alt={annonce.titre || "Photo logement"}
              fill
              sizes="110px"
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
              top: 6,
              right: 6,
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: isFavori ? "#DC2626" : "rgba(255,255,255,0.94)",
              color: isFavori ? "#fff" : km.ink,
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(6px)",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill={isFavori ? "#fff" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        </div>

        {/* Contenu */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ minWidth: 0 }}>
            {ville && (
              <p style={{
                fontSize: 9.5,
                fontWeight: 700,
                color: "#6B6B6B",
                textTransform: "uppercase",
                letterSpacing: "1px",
                margin: "0 0 2px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {ville}
              </p>
            )}
            <h3 style={{
              fontSize: 14,
              fontWeight: 600,
              margin: "0 0 4px",
              lineHeight: 1.25,
              color: km.ink,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}>
              {annonce.titre || "Sans titre"}
            </h3>
            {specs && (
              <p style={{ fontSize: 11, color: "#8a8477", margin: 0 }}>{specs}</p>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <span style={{
              fontSize: 15,
              fontWeight: 800,
              color: km.ink,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.2px",
            }}>
              {annonce.prix?.toLocaleString("fr-FR") ?? "—"} €
              <span style={{ fontWeight: 400, color: "#8a8477", fontSize: 10, marginLeft: 2 }}>/mois</span>
            </span>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              color: km.ink,
              textTransform: "uppercase",
              letterSpacing: "0.4px",
              opacity: 0.7,
            }}>
              Voir →
            </span>
          </div>
        </div>
      </Link>
    )
  }
)
CarouselCard.displayName = "CarouselCard"
