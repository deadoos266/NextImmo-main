"use client"
import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import CityAutocomplete from "../CityAutocomplete"
import GrainBackground from "./GrainBackground"
import { useTypewriter, useCountUp, useInterval, useReducedMotion } from "./hooks"
import type { FeaturedListing } from "./useFeaturedListings"

/**
 * Hero plein écran noir, 4 images ken-burns cross-fade, typewriter dans la
 * search pilule, FloatingMatchPill animée, LiveStats animés.
 * Stats hardcodées — TODO: brancher COUNT Supabase pour plus tard.
 */

const PROMPTS = [
  "Un 2 pièces à Paris",
  "Un logement avec balcon à Lyon",
  "Une maison avec jardin à Bordeaux",
  "Un studio meublé à Marseille",
]

export default function Hero({
  listings,
  isMobile,
  isTablet,
}: { listings: FeaturedListing[]; isMobile: boolean; isTablet: boolean }) {
  const router = useRouter()
  const reduced = useReducedMotion()
  const typed = useTypewriter(PROMPTS)
  const [bg, setBg] = useState(0)
  const [ville, setVille] = useState("")

  // 4 premières photos des listings pour le ken-burns (fallback sobre si vide)
  const heroPhotos = listings.filter(l => l.photos.length > 0).slice(0, 4).map(l => l.photos[0])

  // Cross-fade toutes les 4.5 s — désactivé si reduced-motion
  useInterval(!reduced && heroPhotos.length > 1, () => setBg(b => (b + 1) % heroPhotos.length), 4500)

  // TODO: brancher COUNT Supabase pour ces stats (annonces dispo, users, sat)
  const statA = useCountUp(1247, { duration: 2000 })
  const statB = useCountUp(3418, { duration: 2200, delay: 200 })
  const statC = useCountUp(96,   { duration: 1800, delay: 400 })

  function handleSearch(e?: FormEvent) {
    e?.preventDefault()
    const params = new URLSearchParams()
    if (ville.trim()) params.set("ville", ville.trim())
    const qs = params.toString()
    router.push(qs ? `/annonces?${qs}` : "/annonces")
  }

  // Featured pour la FloatingMatchPill (prend la 1ère annonce avec photo)
  const featured = listings.find(l => l.photos.length > 0)

  return (
    <section style={{
      position: "relative",
      overflow: "hidden",
      background: "#000",
      minHeight: isMobile ? "88vh" : "92vh",
      display: "flex",
      alignItems: "flex-end",
      padding: isMobile ? "0 20px 40px" : "0 32px 56px",
      color: "#fff",
    }}>
      {/* Ken-burns CSS — skip si reduced-motion */}
      {!reduced && (
        <style>{`
          @keyframes km-ken-a { 0% { transform: scale(1.08) translate(0%, 0%) } 100% { transform: scale(1.28) translate(-3%, -2%) } }
          @keyframes km-ken-b { 0% { transform: scale(1.15) translate(2%, 1%) }  100% { transform: scale(1.32) translate(-2%, -3%) } }
          @keyframes km-ken-c { 0% { transform: scale(1.10) translate(-1%, 2%) } 100% { transform: scale(1.26) translate(2%,  -2%) } }
          @keyframes km-ken-d { 0% { transform: scale(1.18) translate(1%, -1%) } 100% { transform: scale(1.32) translate(-3%, 2%) } }
        `}</style>
      )}

      {/* Images ken-burns */}
      {heroPhotos.length > 0 ? (
        heroPhotos.map((src, i) => {
          const anim = ["km-ken-a", "km-ken-b", "km-ken-c", "km-ken-d"][i % 4]
          return (
            <div key={`${src}-${i}`} style={{
              position: "absolute", inset: 0,
              opacity: i === bg ? 1 : 0,
              transition: "opacity 1600ms ease-in-out",
              animation: reduced ? "none" : `${anim} 18000ms ease-in-out infinite alternate`,
              willChange: reduced ? "auto" : "transform",
              overflow: "hidden",
            }}>
              <Image
                src={src}
                alt=""
                fill
                priority={i === 0}
                sizes="100vw"
                style={{ objectFit: "cover" }}
              />
            </div>
          )
        })
      ) : (
        /* Fallback : fond dégradé sobre noir → charbon si aucune photo dispo */
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse at top, #1a1a1a 0%, #000 70%)",
        }} />
      )}

      {/* Overlay gradient pour lisibilité texte en bas */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.85) 100%)",
      }} />
      <GrainBackground />

      {/* FloatingMatchPill — visible seulement en desktop */}
      {!isMobile && !isTablet && featured && (
        <FloatingMatchPill listing={featured} reduced={reduced} />
      )}

      {/* Contenu */}
      <div style={{
        position: "relative",
        zIndex: 2,
        maxWidth: 1200,
        margin: "0 auto",
        width: "100%",
      }}>
        {/* Pill "X logements, mis à jour…" */}
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          padding: "6px 14px 6px 6px",
          background: "rgba(255,255,255,0.15)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: "0.3px",
          marginBottom: isMobile ? 20 : 28,
          border: "1px solid rgba(255,255,255,0.18)",
        }}>
          <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#16A34A", display: "inline-flex", alignItems: "center", justifyContent: "center" }} aria-hidden>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </span>
          1 247 logements disponibles, mis à jour il y a 3 min
        </div>

        {/* Titre */}
        <h1 style={{
          fontSize: isMobile ? 44 : isTablet ? 64 : 84,
          fontWeight: 500,
          lineHeight: 0.98,
          letterSpacing: isMobile ? "-1.5px" : "-2.2px",
          margin: 0,
          marginBottom: isMobile ? 20 : 28,
          textShadow: "0 2px 30px rgba(0,0,0,0.3)",
        }}>
          La location,<br />sans intermédiaire.
        </h1>

        {/* Search pilule */}
        <SearchBox typed={typed} ville={ville} setVille={setVille} onSubmit={handleSearch} reduced={reduced} />

        {/* LiveStats */}
        {!isMobile && (
          <LiveStats a={statA} b={statB} c={statC} />
        )}
      </div>
    </section>
  )
}

function FloatingMatchPill({ listing, reduced }: { listing: FeaturedListing; reduced: boolean }) {
  const ville = listing.ville || "Ville"
  const titre = listing.titre || "Logement"
  const pct = listing._matchPct ?? 92
  return (
    <>
      {!reduced && <style>{`@keyframes km-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }`}</style>}
      <div style={{
        position: "absolute",
        top: 110,
        right: 40,
        zIndex: 3,
        background: "rgba(255,255,255,0.96)",
        color: "#111",
        borderRadius: 18,
        padding: 14,
        display: "flex",
        alignItems: "center",
        gap: 12,
        boxShadow: "0 20px 48px rgba(0,0,0,0.3)",
        maxWidth: 280,
        animation: reduced ? "none" : "km-float 6s ease-in-out infinite",
      }}>
        <div style={{ position: "relative", width: 44, height: 44, borderRadius: 12, overflow: "hidden", flexShrink: 0, background: listing._gradient || "#eee" }}>
          {listing.photos[0] && (
            <Image src={listing.photos[0]} alt="" fill sizes="44px" style={{ objectFit: "cover" }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#16A34A", letterSpacing: "1px" }}>{pct}&nbsp;% MATCH</div>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-0.2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titre}</div>
          <div style={{ fontSize: 11, color: "#666" }}>
            {listing.prix != null ? `${listing.prix.toLocaleString("fr-FR")} €` : "—"}
            {listing.surface ? ` · ${listing.surface} m²` : ""}
            {ville ? ` · ${ville}` : ""}
          </div>
        </div>
      </div>
    </>
  )
}

function SearchBox({
  typed, ville, setVille, onSubmit, reduced,
}: {
  typed: string; ville: string; setVille: (v: string) => void; onSubmit: (e?: FormEvent) => void; reduced: boolean
}) {
  // Le typewriter fait office de placeholder animé tant que l'user n'a pas
  // écrit. Dès qu'il tape un caractère, CityAutocomplete prend la main
  // (ses suggestions BAN s'affichent en dropdown natif du composant).
  const showPlaceholder = ville === ""
  return (
    <form onSubmit={onSubmit} style={{
      display: "flex",
      alignItems: "center",
      background: "#fff",
      borderRadius: 999,
      padding: "8px 8px 8px 28px",
      boxShadow: "0 20px 48px rgba(0,0,0,0.2)",
      maxWidth: 640,
      gap: 18,
      marginBottom: 44,
      position: "relative",
    }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>

      <div style={{ flex: 1, position: "relative", minHeight: 24 }}>
        {/* Typewriter placeholder — se cache dès que l'user écrit ou focus */}
        {showPlaceholder && (
          <div aria-hidden style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            fontSize: 17,
            fontWeight: 500,
            color: "#111",
            pointerEvents: "none",
          }}>
            {typed}
            {!reduced && (
              <span style={{ display: "inline-block", width: 2, height: "1em", background: "#111", marginLeft: 2, animation: "km-cur 1s steps(1) infinite" }} />
            )}
            {!reduced && <style>{`@keyframes km-cur { 0%,49% { opacity: 1 } 50%,100% { opacity: 0 } }`}</style>}
          </div>
        )}
        {/* Vrai input BAN — stylé pour se fondre dans la pilule */}
        <CityAutocomplete
          value={ville}
          onChange={setVille}
          placeholder=""
          style={{
            border: "none",
            outline: "none",
            padding: 0,
            background: "transparent",
            fontSize: 17,
            fontWeight: 500,
            color: "#111",
            fontFamily: "inherit",
            width: "100%",
          }}
        />
      </div>

      <button
        type="submit"
        aria-label="Rechercher"
        style={{
          width: 56, height: 56,
          borderRadius: "50%",
          background: "#111",
          color: "#fff",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "transform 200ms ease, box-shadow 200ms ease",
          flexShrink: 0,
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.06)"; e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.35)" }}
        onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none" }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </button>
    </form>
  )
}

function LiveStats({ a, b, c }: { a: number; b: number; c: number }) {
  const stat = (n: number, label: string) => (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontSize: 36, fontWeight: 500, letterSpacing: "-1.5px", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
        {n.toLocaleString("fr-FR")}
      </span>
      <span style={{ fontSize: 11, opacity: 0.7, textTransform: "uppercase", letterSpacing: "1.2px", marginTop: 6, fontWeight: 600 }}>
        {label}
      </span>
    </div>
  )
  return (
    <div style={{ display: "flex", gap: 56, paddingTop: 26, borderTop: "1px solid rgba(255,255,255,0.2)" }}>
      {stat(a, "Logements disponibles")}
      {stat(b, "Locataires vérifiés")}
      {stat(c, "Satisfaction client %")}
    </div>
  )
}
