"use client"

import { forwardRef, useEffect, useRef, type ComponentType } from "react"
import Image from "next/image"
import Link from "next/link"
import type { MapAnnoncesProps } from "../MapAnnonces"
import { km } from "../ui/km"

/**
 * Pattern Airbnb mobile (Paul 2026-04-27 — refactor depuis carrousel
 * horizontal vers scroll vertical sur retour user).
 *
 * Mobile uniquement (<768px) :
 *   - Top ~45vh : carte Leaflet sticky-feeling (ne scrolle pas avec la liste)
 *   - Bottom : liste verticale de cards scrollable au doigt en scroll natif
 *
 * Synchronisation map ↔ liste :
 *   - Click marker carte → onSelect(id) → useEffect scroll la card matching
 *     en haut du conteneur (block: "start" smooth).
 *   - Scroll vertical de la liste → IntersectionObserver détecte la card
 *     "principale" (la première qui touche le top du scroller via rootMargin
 *     négatif top) → debounced 250ms → onSelect(id) → MapComp `FlyToSelected`
 *     recentre la carte. Le debounce evite de spam flyTo pendant le scroll.
 *
 * Cards : format portrait inspire de la grille /annonces (photo top + footer
 * specs/prix), version compacte pour fit ~2.5 cards visibles dans la zone
 * liste (~55vh). Photo aspect 16/10 (au lieu de 4/5) pour reduire la hauteur,
 * footer ramassé sur 2 lignes.
 *
 * Anti-feedback-loop : programmaticScrolling ref ignore les ticks observer
 * pendant un scroll programmatique (click marker → scroll list).
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
  const listRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef<Map<number, HTMLAnchorElement>>(new Map())
  // Anti-feedback-loop : quand on scroll programmatiquement la liste pour
  // suivre selectedId (depuis click marker), l'IntersectionObserver
  // triggererait setSelectedId(id) sur chaque card traversee — boucle.
  const programmaticScrolling = useRef(false)
  // Debounce pour la sync scroll list -> map flyTo : on n'appelle onSelect
  // qu'apres 250ms de "pause" du scroll, pour ne pas spammer pendant le
  // mouvement fluide.
  const flyToDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cardAnnonces = annonces.filter(a => a._lat && a._lng)

  // ─── Scroll vertical → setSelectedId sur la card "principale" (top) ───
  useEffect(() => {
    const scroller = listRef.current
    if (!scroller) return

    // rootMargin negatif top + bottom = la "fenetre active" est dans le
    // tiers superieur du scroller. Une card y entre quand elle commence a
    // dominer la vue → on la considere comme "principale".
    const obs = new IntersectionObserver(
      entries => {
        if (programmaticScrolling.current) return
        // On garde l'entree la plus visible parmi celles qui intersectent
        // dans la fenetre active.
        let best: IntersectionObserverEntry | null = null
        for (const e of entries) {
          if (!e.isIntersecting) continue
          if (!best || e.intersectionRatio > best.intersectionRatio) best = e
        }
        if (!best) return
        const idAttr = (best.target as HTMLElement).dataset.annonceId
        const id = idAttr ? Number(idAttr) : NaN
        if (!Number.isFinite(id) || id === selectedId) return

        // Debounce 250ms : evite les flyTo en rafale pendant le scroll.
        if (flyToDebounce.current) clearTimeout(flyToDebounce.current)
        flyToDebounce.current = setTimeout(() => {
          onSelect(id)
        }, 250)
      },
      {
        root: scroller,
        // Active zone = top 35% du scroller. La card qui domine ce ruban
        // est consideree "principale". Equivalent au pattern Airbnb mobile.
        rootMargin: "0px 0px -65% 0px",
        threshold: [0, 0.25, 0.5],
      }
    )

    cardRefs.current.forEach(el => obs.observe(el))
    return () => {
      obs.disconnect()
      if (flyToDebounce.current) clearTimeout(flyToDebounce.current)
    }
    // selectedId dans deps : on veut une closure fraiche pour le test
    // `id === selectedId` (eviter de re-set la meme valeur).
  }, [onSelect, selectedId])

  // ─── selectedId change (via click marker) → scroll la card en haut ───
  useEffect(() => {
    if (selectedId === null) return
    const scroller = listRef.current
    if (!scroller) return
    const card = cardRefs.current.get(selectedId)
    if (!card) return

    // Test : la card est-elle deja dans la "fenetre active" (top 35%) ?
    const sRect = scroller.getBoundingClientRect()
    const cRect = card.getBoundingClientRect()
    const cardTopRel = cRect.top - sRect.top
    // Si la card est deja entre 0 et 35% du scroller, pas besoin de scroller.
    if (cardTopRel >= 0 && cardTopRel < sRect.height * 0.35) return

    programmaticScrolling.current = true
    card.scrollIntoView({ behavior: "smooth", block: "start" })
    // Relache le lock apres l'animation. Tweak si besoin selon perf devices.
    setTimeout(() => { programmaticScrolling.current = false }, 700)
  }, [selectedId])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Carte des annonces avec liste"
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

      {/* Carte sticky-feeling — flex-basis 45vh, ne scrolle pas avec la liste */}
      <div style={{
        flex: "0 0 45vh",
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
      </div>

      {/* Liste verticale scrollable — flex 1, prend le reste */}
      {cardAnnonces.length > 0 ? (
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            background: km.beige,
            padding: "12px 12px calc(12px + env(safe-area-inset-bottom, 0px))",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
            borderTop: `1px solid ${km.line}`,
          }}
        >
          <style>{`
            .km-mobile-list-scroller::-webkit-scrollbar { display: none }
          `}</style>
          {cardAnnonces.map(ann => (
            <ScrollListCard
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
      ) : (
        <div style={{
          flex: 1,
          background: km.beige,
          padding: "16px 20px calc(20px + env(safe-area-inset-bottom, 0px))",
          textAlign: "center",
          borderTop: `1px solid ${km.line}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
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

// ─── ScrollListCard : card mobile compacte landscape (Paul 2026-04-27 v2) ─
// User feedback : "les cartes sont trop grosses je trouve il faudrait que ce
// soit en long". Refonte : layout `120px 1fr` (photo carree gauche + content
// droite), card height ~140-150px. Avec gap 12 : 2 cards completes + ~50%
// de la 3eme = ~360-400px de contenu visible dans la zone scroll (~55vh).
//
// Inspire de ListingCardCompact (mode aside list desktop) — meme grammaire
// visuelle mais adaptee au touch mobile.
interface ScrollListCardProps {
  annonce: any
  selected: boolean
  isFavori: boolean
  onToggleFavori: (id: number) => void
}

const ScrollListCard = forwardRef<HTMLAnchorElement, ScrollListCardProps>(
  function ScrollListCard({ annonce, selected, isFavori, onToggleFavori }, ref) {
    const photo = Array.isArray(annonce.photos) && annonce.photos.length > 0 ? annonce.photos[0] : null
    const ville = (annonce.ville || "").toString().trim()
    const quartier = (annonce.quartier || "").toString().trim()
    const loc = ville && quartier ? `${ville} · ${quartier}` : ville
    const surface = annonce.surface != null ? `${annonce.surface} m²` : null
    const pieces = annonce.pieces != null ? `${annonce.pieces} p.` : null
    const specs = [surface, pieces].filter(Boolean).join(" · ")

    return (
      <Link
        ref={ref}
        href={`/annonces/${annonce.id}`}
        data-annonce-id={annonce.id}
        style={{
          display: "grid",
          gridTemplateColumns: "120px 1fr",
          gap: 0,
          textDecoration: "none",
          color: km.ink,
          background: km.white,
          border: `1px solid ${selected ? km.ink : km.line}`,
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: selected ? "0 6px 16px rgba(0,0,0,0.10)" : "0 1px 2px rgba(0,0,0,0.03)",
          transition: "border-color 200ms, box-shadow 200ms",
          fontFamily: "inherit",
          flexShrink: 0,
        }}
      >
        {/* Photo carree gauche 120x120 */}
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
              width: 30,
              height: 30,
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
            <svg width="13" height="13" viewBox="0 0 24 24" fill={isFavori ? "#fff" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        </div>

        {/* Contenu droite : eyebrow / titre / specs+prix */}
        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
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
)
ScrollListCard.displayName = "ScrollListCard"
