"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { getFavoris, toggleFavori } from "../../../lib/favoris"
import ListingCard from "./ListingCard"
import type { FeaturedListing } from "./useFeaturedListings"
import { useReducedMotion } from "./hooks"

/**
 * Section blanche "Annonces récentes" — grille des annonces vedette.
 *
 * "No lies mode" : on ne montre pas de pulse rouge "3 nouvelles aujourd'hui"
 * si on n'a rien en DB. L'eyebrow est neutre. Si seuls des placeholders
 * sont renvoyés (aucune vraie annonce), empty state honnête + CTA "Publier".
 *
 * Favoris via localStorage lib/favoris.ts (source de vérité unique).
 * Tri local : Meilleur match / Prix croissant / Plus récentes.
 */
export default function LiveFeed({
  listings,
  loading,
  isMobile,
}: { listings: FeaturedListing[]; loading: boolean; isMobile: boolean; isTablet: boolean }) {
  const reduced = useReducedMotion()
  // Tri "match" retiré : nécessiterait calculerScore + profil utilisateur,
  // hors scope Home (la page est publique, pas toujours connectée).
  const [sort, setSort] = useState<"prix" | "recent">("recent")
  const [favs, setFavs] = useState<Set<number>>(new Set())

  // Hydrate les favoris au mount depuis localStorage
  useEffect(() => {
    setFavs(new Set(getFavoris()))
  }, [])

  const onToggle = (id: number) => {
    toggleFavori(id)
    setFavs(new Set(getFavoris()))
  }

  const hasReal = listings.length > 0

  const sorted = [...listings].sort((a, b) => {
    if (sort === "prix") return (a.prix ?? Infinity) - (b.prix ?? Infinity)
    // "recent" ou "match" → par id desc (les plus récents ont l'id le plus grand)
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
            <p style={{
              fontSize: 12, fontWeight: 700,
              color: "#666", textTransform: "uppercase", letterSpacing: "1.8px",
              margin: 0, marginBottom: 14,
            }}>
              {hasReal ? "Annonces récentes" : "Bientôt en ligne"}
            </p>
            <h2 style={{
              fontSize: isMobile ? 30 : 42,
              fontWeight: 500,
              letterSpacing: "-1.2px",
              margin: 0,
              lineHeight: 1.1,
            }}>
              {hasReal ? "Les dernières publications" : "Bientôt en ligne"}
            </h2>
          </div>
          {/* Tri visible uniquement si on a de vraies annonces à trier */}
          {hasReal && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { key: "recent", label: "Plus récentes" },
                { key: "prix",   label: "Prix croissant" },
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
          )}
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
        ) : hasReal ? (
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
        ) : (
          // Empty state : DB sans annonce dispo. Un seul CTA vers /dossier
          // pour capter le visiteur avant qu'il ne parte.
          <div style={{
            background: "#F7F4EF",
            borderRadius: 24,
            padding: isMobile ? "56px 24px" : "88px 48px",
            textAlign: "center",
            border: "1px solid #EAE6DF",
          }}>
            <p style={{
              fontSize: 15,
              color: "#555",
              lineHeight: 1.7,
              maxWidth: 520,
              margin: "0 auto 32px",
            }}>
              Les premières annonces arrivent. Soyez prévenu dès qu&apos;un logement match votre profil.
            </p>
            <Link href="/dossier" style={{
              display: "inline-block",
              background: "#111", color: "#fff",
              padding: "14px 30px", borderRadius: 999,
              fontSize: 14, fontWeight: 600,
              textDecoration: "none",
              letterSpacing: "0.3px",
              transition: "transform 200ms ease, box-shadow 200ms ease",
            }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = "translateY(-1px)"
                e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.18)"
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = "translateY(0)"
                e.currentTarget.style.boxShadow = "none"
              }}>
              Créer mon dossier
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
