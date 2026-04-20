"use client"
import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import CityAutocomplete from "../CityAutocomplete"
import GrainBackground from "./GrainBackground"
import { useTypewriter, useInterval, useReducedMotion } from "./hooks"
import type { FeaturedListing } from "./useFeaturedListings"

/**
 * Hero plein écran noir — ken-burns cross-fade + typewriter dans la search.
 *
 * Principes "no lies" (demande Paul explicite) :
 *  - Pas de stats chiffrées fake (X logements, X locataires, X % satisfaction)
 *  - Pas de FloatingMatchPill qui invente un score sur une annonce qui n'existe pas
 *  - Pas de pill "1 247 logements mis à jour il y a 3 min" si la DB est vide
 *  - Le texte pill reste honnête : "Beta publique · Inscription gratuite"
 *
 * Sources images (priorité descendante) :
 *  1. Vraies annonces en DB via useFeaturedListings (photos[] non vide)
 *  2. Fallback : 3 photos d'intérieurs Unsplash dans /public/hero/*.jpg
 *     (servis depuis 'self', CSP respecté)
 *
 * ─── Crédits photos hero (Unsplash, licence libre) ───────────────────────
 *   /public/hero/1.jpg  photo-1560448204-e02f11c3d0e2  (salon clair)
 *   /public/hero/2.jpg  photo-1502672260266-1c1ef2d93688 (studio canal)
 *   /public/hero/3.jpg  photo-1522708323590-d24dbb6b0267 (appart lumineux)
 * ─────────────────────────────────────────────────────────────────────────
 */

const PROMPTS = [
  "Un 2 pièces à Paris",
  "Un logement avec balcon à Lyon",
  "Une maison avec jardin à Bordeaux",
  "Un studio meublé à Marseille",
]

const HERO_FALLBACK_PHOTOS = ["/hero/1.jpg", "/hero/2.jpg", "/hero/3.jpg"]

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

  // Photos hero : d'abord les vraies annonces, sinon fallback /public/hero/*
  const realPhotos = listings.filter(l => l.photos.length > 0).slice(0, 4).map(l => l.photos[0])
  const heroPhotos = realPhotos.length > 0 ? realPhotos : HERO_FALLBACK_PHOTOS
  const usingFallback = realPhotos.length === 0

  // Cross-fade toutes les 4.5 s — désactivé si reduced-motion
  useInterval(!reduced && heroPhotos.length > 1, () => setBg(b => (b + 1) % heroPhotos.length), 4500)

  function handleSearch(e?: FormEvent) {
    e?.preventDefault()
    const params = new URLSearchParams()
    if (ville.trim()) params.set("ville", ville.trim())
    const qs = params.toString()
    router.push(qs ? `/annonces?${qs}` : "/annonces")
  }

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
      {!reduced && (
        <style>{`
          @keyframes km-ken-a { 0% { transform: scale(1.08) translate(0%, 0%) } 100% { transform: scale(1.28) translate(-3%, -2%) } }
          @keyframes km-ken-b { 0% { transform: scale(1.15) translate(2%, 1%) }  100% { transform: scale(1.32) translate(-2%, -3%) } }
          @keyframes km-ken-c { 0% { transform: scale(1.10) translate(-1%, 2%) } 100% { transform: scale(1.26) translate(2%,  -2%) } }
          @keyframes km-ken-d { 0% { transform: scale(1.18) translate(1%, -1%) } 100% { transform: scale(1.32) translate(-3%, 2%) } }
        `}</style>
      )}

      {/* Images ken-burns (vraies photos ou fallback) */}
      {heroPhotos.map((src, i) => {
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
      })}

      {/* Overlay gradient pour lisibilité texte */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.85) 100%)",
      }} />
      <GrainBackground />

      {/* Contenu */}
      <div style={{
        position: "relative",
        zIndex: 2,
        maxWidth: 1200,
        margin: "0 auto",
        width: "100%",
      }}>
        {/* Pill premium : 3 promesses marque verifiables — pas de stats
            inventées mais un positionnement accrocheur. */}
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
          Zéro agence · Bail signé en ligne · Dossier ALUR
        </div>

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

        <SearchBox typed={typed} ville={ville} setVille={setVille} onSubmit={handleSearch} reduced={reduced} />

        {/* Baseline premium — appel à l'action doux */}
        <p style={{
          fontSize: isMobile ? 14 : 16,
          color: "rgba(255,255,255,0.82)",
          margin: 0,
          marginTop: isMobile ? 2 : 8,
          fontWeight: 400,
          letterSpacing: "0.2px",
          maxWidth: 560,
          lineHeight: 1.55,
        }}>
          Propriétaires et locataires se rencontrent directement. Dossier
          ALUR en 10 minutes, bail électronique à valeur légale, état des
          lieux digital. Le tout, gratuit.
        </p>
        {usingFallback && (
          <p aria-hidden style={{
            fontSize: 9,
            color: "rgba(255,255,255,0.35)",
            margin: 0,
            marginTop: isMobile ? 24 : 40,
            letterSpacing: "0.6px",
            textTransform: "uppercase",
          }}>
            Visuels d&apos;illustration
          </p>
        )}
      </div>
    </section>
  )
}

function SearchBox({
  typed, ville, setVille, onSubmit, reduced,
}: {
  typed: string; ville: string; setVille: (v: string) => void; onSubmit: (e?: FormEvent) => void; reduced: boolean
}) {
  // CityAutocomplete fait `placeholder || "Ville ou code postal"` donc si on
  // passe "" il revient au fallback gris qui se superpose au typewriter.
  // On passe un espace insécable pour neutraliser son placeholder natif
  // et garder notre overlay typewriter propre.
  const showTypewriter = ville === ""
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
      marginBottom: 20,
      position: "relative",
    }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>

      <div style={{ flex: 1, position: "relative", minHeight: 24 }}>
        {showTypewriter && (
          <div aria-hidden style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            fontSize: 17,
            fontWeight: 500,
            color: "#111",
            pointerEvents: "none",
            background: "#fff", // cache un éventuel placeholder résiduel
          }}>
            {typed}
            {!reduced && (
              <span style={{ display: "inline-block", width: 2, height: "1em", background: "#111", marginLeft: 2, animation: "km-cur 1s steps(1) infinite" }} />
            )}
            {!reduced && <style>{`@keyframes km-cur { 0%,49% { opacity: 1 } 50%,100% { opacity: 0 } }`}</style>}
          </div>
        )}
        <CityAutocomplete
          value={ville}
          onChange={setVille}
          placeholder={"\u00A0"}
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
