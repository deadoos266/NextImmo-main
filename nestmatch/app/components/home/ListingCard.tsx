"use client"
import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { CARD_GRADIENTS } from "../../../lib/cardGradients"
import { useInterval, useReducedMotion } from "./hooks"
import type { FeaturedListing } from "./useFeaturedListings"

/**
 * Card annonce aspect 4/5.
 *
 * "No lies mode" : aucun badge "% match" ni "NOUVEAU" fake. Les données
 * affichées viennent toutes de la DB — titre, ville, prix, surface,
 * pièces, DPE. Si le bien est loué, badge discret "Loué" overlay (état
 * réel, pas de bluff).
 *
 * Hover : rotation des photos (1.2 s) si la card a plusieurs photos.
 * Reduced-motion : pas de rotation, 1ère photo seulement.
 */
export default function ListingCard({
  a,
  fav,
  onToggleFav,
  animDelay = 0,
}: {
  a: FeaturedListing
  fav: boolean
  onToggleFav: () => void
  animDelay?: number
}) {
  const reduced = useReducedMotion()
  const [idx, setIdx] = useState(0)
  const [hover, setHover] = useState(false)
  const hasMultiplePhotos = a.photos.length > 1
  const hasPhoto = a.photos.length > 0
  const isLoue = a.statut === "loué"

  useInterval(hover && hasMultiplePhotos && !reduced, () => setIdx(i => (i + 1) % a.photos.length), 1200)
  useEffect(() => { if (!hover) setIdx(0) }, [hover])

  // Gradient fallback stable (basé sur id) quand pas de photo
  const gradient = CARD_GRADIENTS[((a.id < 0 ? -a.id : a.id) % CARD_GRADIENTS.length)]
  const titre = a.titre ?? "Logement"
  const ville = a.ville ?? "—"

  return (
    <Link
      href={`/annonces/${a.id}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "block",
        background: "#fff",
        borderRadius: 20,
        overflow: "hidden",
        textDecoration: "none",
        color: "#111",
        border: "1px solid #EAE6DF",
        transition: "transform 300ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 300ms cubic-bezier(0.4, 0, 0.2, 1)",
        transform: hover && !reduced ? "translateY(-4px)" : "translateY(0)",
        boxShadow: hover && !reduced ? "0 20px 40px rgba(0,0,0,0.12)" : "0 1px 3px rgba(0,0,0,0.04)",
        animation: reduced ? "none" : `km-fade-in 600ms ease-out ${animDelay}ms both`,
        fontFamily: "inherit",
        opacity: isLoue ? 0.78 : 1,
      }}
    >
      {!reduced && <style>{`@keyframes km-fade-in { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }`}</style>}

      <div style={{ position: "relative", aspectRatio: "4 / 5", overflow: "hidden", background: gradient }}>
        {hasPhoto ? (
          a.photos.map((p, i) => (
            <div key={p} style={{
              position: "absolute", inset: 0,
              opacity: i === idx ? 1 : 0,
              transition: "opacity 600ms ease",
            }}>
              <Image
                src={p}
                alt={i === 0 ? titre : ""}
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                style={{ objectFit: "cover", transform: hover && i === idx && !reduced ? "scale(1.05)" : "scale(1)", transition: "transform 600ms ease" }}
              />
            </div>
          ))
        ) : (
          <span style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "rgba(17,17,17,0.3)", fontSize: 12, fontWeight: 500,
            letterSpacing: "1px", textTransform: "uppercase",
          }}>
            Photos à venir
          </span>
        )}

        {/* Badges top : favori + éventuel badge "Loué" basé sur DB */}
        <div style={{
          position: "absolute", top: 14, left: 14, right: 14,
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          pointerEvents: "none",
        }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {isLoue && (
              <span style={{ padding: "5px 10px", background: "rgba(17,17,17,0.9)", color: "#fff", borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase" }}>
                Loué
              </span>
            )}
          </div>
          {/* Favori */}
          <button
            onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleFav() }}
            aria-label={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
            style={{
              width: 38, height: 38, borderRadius: "50%",
              background: fav ? "#DC2626" : "rgba(255,255,255,0.94)",
              color: fav ? "#fff" : "#111",
              border: "none",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              pointerEvents: "auto",
              transition: "transform 200ms ease",
              fontFamily: "inherit",
            }}
            onMouseEnter={e => { if (!reduced) e.currentTarget.style.transform = "scale(1.1)" }}
            onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill={fav ? "#fff" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        </div>

        {/* Photo dots */}
        {hasMultiplePhotos && (
          <div style={{
            position: "absolute", bottom: 12, left: 14, right: 14,
            display: "flex", gap: 4,
            pointerEvents: "none",
          }}>
            {a.photos.map((_, i) => (
              <div key={i} style={{
                flex: 1, height: 2, borderRadius: 999,
                background: i === idx ? "#fff" : "rgba(255,255,255,0.4)",
                transition: "background 200ms ease",
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Meta */}
      <div style={{ padding: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#666", textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: 6 }}>
          {ville}
        </div>
        <h3 style={{
          fontSize: 16, fontWeight: 500, margin: 0, marginBottom: 14,
          lineHeight: 1.3, letterSpacing: "-0.2px",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {titre}
        </h3>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          paddingTop: 12, borderTop: "1px solid #EAE6DF",
          fontSize: 12, color: "#555",
        }}>
          <span>
            {a.surface ? `${a.surface} m²` : ""}
            {a.surface && a.pieces ? " · " : ""}
            {a.pieces ? `${a.pieces} p.` : ""}
            {(a.surface || a.pieces) && a.dpe ? " · " : ""}
            {a.dpe ? `DPE ${a.dpe}` : ""}
          </span>
          {a.prix != null && (
            <span style={{ fontWeight: 700, color: "#111", fontSize: 15 }}>
              {a.prix.toLocaleString("fr-FR")} €<span style={{ fontWeight: 400, color: "#888", fontSize: 11 }}>/mois</span>
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
