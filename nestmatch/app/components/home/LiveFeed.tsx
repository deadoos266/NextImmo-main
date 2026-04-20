"use client"
import { useEffect, useState } from "react"
import { getFavoris, toggleFavori } from "../../../lib/favoris"
import ListingCard from "./ListingCard"
import type { FeaturedListing } from "./useFeaturedListings"
import { useReducedMotion } from "./hooks"

/**
 * Section blanche "Sélection du moment" — grille des 8 annonces vedette.
 * Favoris branchés sur localStorage via lib/favoris.ts (source de vérité unique).
 * Tri local : Meilleur match / Prix croissant / Plus récentes.
 */
export default function LiveFeed({
  listings,
  loading,
  isMobile,
}: { listings: FeaturedListing[]; loading: boolean; isMobile: boolean; isTablet: boolean }) {
  const reduced = useReducedMotion()
  const [sort, setSort] = useState<"match" | "prix" | "recent">("match")
  const [favs, setFavs] = useState<Set<number>>(new Set())

  // Hydrate les favoris au mount depuis localStorage
  useEffect(() => {
    setFavs(new Set(getFavoris()))
  }, [])

  const onToggle = (id: number) => {
    toggleFavori(id)
    setFavs(new Set(getFavoris()))
  }

  const sorted = [...listings].sort((a, b) => {
    if (sort === "match") return (b._matchPct ?? 0) - (a._matchPct ?? 0)
    if (sort === "prix") return (a.prix ?? Infinity) - (b.prix ?? Infinity)
    // "recent" : par id desc (ids négatifs = placeholders en fin)
    return b.id - a.id
  })

  return (
    <section style={{ background: "#fff", padding: isMobile ? "56px 20px" : "100px 32px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: isMobile ? 28 : 40,
          borderBottom: "1px solid #EAE6DF",
          paddingBottom: 22,
          flexWrap: "wrap",
          gap: 16,
        }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span style={{
                width: 8, height: 8, background: "#DC2626", borderRadius: "50%",
                animation: reduced ? "none" : "km-pulse 2s ease-in-out infinite",
              }} />
              {!reduced && <style>{`@keyframes km-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }`}</style>}
              <span style={{ fontSize: 12, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "1.8px" }}>
                En direct — 3 nouvelles aujourd&apos;hui
              </span>
            </div>
            <h2 style={{
              fontSize: isMobile ? 30 : 42,
              fontWeight: 500,
              letterSpacing: "-1.2px",
              margin: 0,
              lineHeight: 1.1,
            }}>
              Sélection du moment
            </h2>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { key: "match",  label: "Meilleur match" },
              { key: "prix",   label: "Prix croissant" },
              { key: "recent", label: "Plus récentes" },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => setSort(opt.key as typeof sort)}
                style={{
                  padding: "10px 18px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 500,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  background: sort === opt.key ? "#111" : "#fff",
                  color: sort === opt.key ? "#fff" : "#111",
                  border: `1px solid ${sort === opt.key ? "#111" : "#EAE6DF"}`,
                  transition: "background 200ms ease, color 200ms ease, border-color 200ms ease",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 22 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{
                background: "#F7F4EF",
                borderRadius: 20,
                aspectRatio: "4 / 5.6",
                animation: reduced ? "none" : "km-skeleton 1.6s ease-in-out infinite",
              }} />
            ))}
            {!reduced && <style>{`@keyframes km-skeleton { 0%,100% { opacity: 0.6 } 50% { opacity: 0.9 } }`}</style>}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 22 }}>
            {sorted.map((a, i) => (
              <ListingCard
                key={a.id}
                a={a}
                fav={favs.has(a.id)}
                onToggleFav={() => onToggle(a.id)}
                animDelay={i * 80}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
