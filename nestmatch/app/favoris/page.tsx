"use client"
import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { supabase } from "../../lib/supabase"
import { getFavoris, toggleFavori } from "../../lib/favoris"
import { getCityCoords } from "../../lib/cityCoords"
import { useResponsive } from "../hooks/useResponsive"
import Link from "next/link"
import Image from "next/image"
import EmptyState from "../components/ui/EmptyState"

const MapAnnonces = dynamic(() => import("../components/MapAnnonces"), { ssr: false })

import { CARD_GRADIENTS as GRADIENTS } from "../../lib/cardGradients"

export default function Favoris() {
  const [annonces, setAnnonces] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [favoris, setFavoris] = useState<number[]>([])
  const [showMap, setShowMap] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const { isMobile } = useResponsive()

  useEffect(() => {
    const ids = getFavoris()
    setFavoris(ids)
    if (ids.length === 0) {
      setLoading(false)
      return
    }
    supabase.from("annonces").select("*").in("id", ids).then(({ data }) => {
      if (data) setAnnonces(data)
      setLoading(false)
    })
  }, [])

  function handleRetirer(e: React.MouseEvent, id: number) {
    e.preventDefault()
    toggleFavori(id)
    const newFavoris = getFavoris()
    setFavoris(newFavoris)
    setAnnonces(prev => prev.filter(a => a.id !== id))
  }

  // Variant sans event (pour MapAnnonces, qui gere lui-meme stopPropagation)
  function handleToggleFavoriId(id: number) {
    toggleFavori(id)
    const newFavoris = getFavoris()
    setFavoris(newFavoris)
    // Sur la page /favoris, un retrait doit aussi disparaitre de la liste
    if (!newFavoris.includes(id)) {
      setAnnonces(prev => prev.filter(a => a.id !== id))
    }
  }

  // Enrichir avec coords pour la carte
  const annoncesAvecCoords = annonces.map(a => {
    const coords = getCityCoords(a.ville || "")
    return {
      ...a,
      scoreMatching: null, // pas de score sur favoris
      _lat: coords ? coords[0] : null,
      _lng: coords ? coords[1] : null,
    }
  })

  const annoncesAvecGeo = annoncesAvecCoords.filter(a => a._lat && a._lng)

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", padding: isMobile ? "24px 16px" : "40px 48px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>

        <div style={{ marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 10px" }}>
              Locataire
            </p>
            <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: isMobile ? 32 : 40, lineHeight: 1.1, letterSpacing: "-0.6px", color: "#111", margin: 0 }}>
              Mes favoris
            </h1>
            <p style={{ color: "#8a8477", marginTop: 8, fontSize: 14 }}>
              {favoris.length === 0 ? "Aucun favori pour l'instant" : `${favoris.length} logement${favoris.length > 1 ? "s" : ""} sauvegardé${favoris.length > 1 ? "s" : ""}`}
            </p>
          </div>

          {/* Toggle Liste / Carte, visible seulement s'il y a des favoris géolocalisés */}
          {annoncesAvecGeo.length > 0 && (
            <div style={{ display: "flex", background: "#fff", borderRadius: 999, padding: 4, gap: 2, border: "1px solid #EAE6DF", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
              <button onClick={() => setShowMap(false)}
                style={{ padding: "8px 18px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px",
                  background: !showMap ? "#111" : "transparent", color: !showMap ? "#fff" : "#8a8477" }}>
                Liste
              </button>
              <button onClick={() => setShowMap(true)}
                style={{ padding: "8px 18px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px",
                  background: showMap ? "#111" : "transparent", color: showMap ? "#fff" : "#8a8477" }}>
                Carte
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 17 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ background: "#fff", border: "1px solid #EAE6DF", borderRadius: 20, height: 240, opacity: 0.4 }} />
            ))}
          </div>
        ) : annonces.length === 0 ? (
          <EmptyState
            icon={
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            }
            title="Aucun favori pour le moment"
            description="Cliquez sur le cœur d'une annonce pour la sauvegarder ici. Vos favoris sont visibles uniquement par vous."
            ctaLabel="Parcourir les annonces"
            ctaHref="/annonces"
          />
        ) : showMap ? (
          // Vue carte : seulement les favoris
          <div style={{ background: "#fff", borderRadius: 20, overflow: "hidden", height: "70vh", minHeight: 480, border: "1px solid #EAE6DF", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
            {annoncesAvecGeo.length > 0 ? (
              <MapAnnonces
                annonces={annoncesAvecCoords}
                selectedId={selectedId}
                onSelect={id => setSelectedId(id)}
                onBoundsChange={() => { /* pas de filtre bbox sur les favoris */ }}
                centerHint={null}
                favoris={favoris}
                onToggleFavori={handleToggleFavoriId}
              />
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", padding: 40, textAlign: "center" }}>
                <p style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, color: "#111", marginBottom: 8 }}>Aucune localisation disponible</p>
                <p style={{ fontSize: 13, color: "#8a8477" }}>Les villes de vos favoris ne sont pas dans notre référentiel géographique.</p>
              </div>
            )}
          </div>
        ) : (
          // Vue liste
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 17 }}>
            {annonces.map(a => {
              const photo = Array.isArray(a.photos) && a.photos.length > 0 ? a.photos[0] : null
              const gradient = GRADIENTS[a.id % GRADIENTS.length]
              const dispoIsNow = a.dispo === "Disponible maintenant"
              return (
                <Link key={a.id} href={`/annonces/${a.id}`} style={{ textDecoration: "none", color: "#111", display: "block", background: "#fff", border: "1px solid #EAE6DF", borderRadius: 20, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.02)", transition: "box-shadow 0.2s, transform 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 10px 30px rgba(17,17,17,0.08)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)" }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 2px rgba(0,0,0,0.02)"; (e.currentTarget as HTMLElement).style.transform = "none" }}>

                  {/* Photo */}
                  <div style={{ position: "relative", height: 154, background: photo ? "#000" : gradient, overflow: "hidden" }}>
                    {photo
                      ? <Image src={photo} alt={a.titre} fill sizes="(max-width: 768px) 100vw, 240px" style={{ objectFit: "cover" }} />
                      : <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(17,17,17,0.3)", fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontSize: 16 }}>Pas de photo</span>
                    }
                    <span style={{ position: "absolute", top: 10, left: 10, background: dispoIsNow ? "#F0FAEE" : "#FBF6EA", color: dispoIsNow ? "#15803d" : "#a16207", border: `1px solid ${dispoIsNow ? "#C6E9C0" : "#EADFC6"}`, padding: "4px 10px", borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px" }}>
                      {a.dispo}
                    </span>
                    {/* Bouton retirer */}
                    <button
                      onClick={e => handleRetirer(e, a.id)}
                      title="Retirer des favoris"
                      aria-label="Retirer des favoris"
                      style={{ position: "absolute", top: 10, right: 10, background: "#fff", border: "1px solid #EAE6DF", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 1px 2px rgba(0,0,0,0.04)", color: "#b91c1c" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.5-7-11a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 6.5-7 11-7 11z"/></svg>
                    </button>
                  </div>

                  {/* Infos */}
                  <div style={{ padding: "16px 18px 18px" }}>
                    <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 3, lineHeight: 1.3, color: "#111", letterSpacing: "-0.2px" }}>{a.titre}</p>
                    <p style={{ color: "#8a8477", fontSize: 13, marginBottom: 12 }}>{a.ville}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", gap: 8, fontSize: 12, color: "#8a8477" }}>
                        <span>{a.surface} m²</span>
                        <span style={{ color: "#EAE6DF" }}>·</span>
                        <span>{a.pieces} p.</span>
                        {a.meuble && <><span style={{ color: "#EAE6DF" }}>·</span><span>Meublé</span></>}
                      </div>
                      <span style={{ fontSize: 17, fontWeight: 700, color: "#111", letterSpacing: "-0.3px" }}>
                        {a.prix} €<span style={{ fontSize: 11, fontWeight: 400, color: "#8a8477" }}>/mois</span>
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
