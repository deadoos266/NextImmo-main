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
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: isMobile ? "24px 16px" : "40px 48px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>

        <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px" }}>Mes favoris</h1>
            <p style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>
              {favoris.length === 0 ? "Aucun favori pour l'instant" : `${favoris.length} logement${favoris.length > 1 ? "s" : ""} sauvegardé${favoris.length > 1 ? "s" : ""}`}
            </p>
          </div>

          {/* Toggle Liste / Carte, visible seulement s'il y a des favoris géolocalisés */}
          {annoncesAvecGeo.length > 0 && (
            <div style={{ display: "flex", background: "white", borderRadius: 12, padding: 4, gap: 2, border: "1px solid #e5e7eb" }}>
              <button onClick={() => setShowMap(false)}
                style={{ padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                  background: !showMap ? "#111" : "transparent", color: !showMap ? "white" : "#6b7280" }}>
                Liste
              </button>
              <button onClick={() => setShowMap(true)}
                style={{ padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                  background: showMap ? "#111" : "transparent", color: showMap ? "white" : "#6b7280" }}>
                Carte
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ background: "white", borderRadius: 20, height: 280, opacity: 0.4 }} />
            ))}
          </div>
        ) : annonces.length === 0 ? (
          <EmptyState
            title="Aucun favori"
            description="Cliquez sur le cœur d'une annonce pour la sauvegarder ici."
            ctaLabel="Voir les annonces"
            ctaHref="/annonces"
          />
        ) : showMap ? (
          // Vue carte : seulement les favoris
          <div style={{ background: "white", borderRadius: 20, overflow: "hidden", height: "70vh", minHeight: 480, border: "1px solid #e5e7eb" }}>
            {annoncesAvecGeo.length > 0 ? (
              <MapAnnonces
                annonces={annoncesAvecCoords}
                selectedId={selectedId}
                onSelect={id => setSelectedId(id)}
                onBoundsChange={() => { /* pas de filtre bbox sur les favoris */ }}
                centerHint={null}
              />
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", padding: 40, textAlign: "center" }}>
                <p style={{ fontSize: 15, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Aucune localisation disponible</p>
                <p style={{ fontSize: 13, color: "#9ca3af" }}>Les villes de vos favoris ne sont pas dans notre référentiel géographique.</p>
              </div>
            )}
          </div>
        ) : (
          // Vue liste
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
            {annonces.map(a => {
              const photo = Array.isArray(a.photos) && a.photos.length > 0 ? a.photos[0] : null
              const gradient = GRADIENTS[a.id % GRADIENTS.length]
              return (
                <Link key={a.id} href={`/annonces/${a.id}`} style={{ textDecoration: "none", color: "#111", display: "block", background: "white", borderRadius: 20, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", transition: "box-shadow 0.2s, transform 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 24px rgba(0,0,0,0.10)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)" }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)"; (e.currentTarget as HTMLElement).style.transform = "none" }}>

                  {/* Photo */}
                  <div style={{ position: "relative", height: 180, background: photo ? "#000" : gradient, overflow: "hidden" }}>
                    {photo
                      ? <Image src={photo} alt={a.titre} fill sizes="(max-width: 768px) 100vw, 280px" style={{ objectFit: "cover" }} />
                      : <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(0,0,0,0.25)", fontSize: 12 }}>Pas de photo</span>
                    }
                    <span style={{ position: "absolute", top: 10, left: 10, background: a.dispo === "Disponible maintenant" ? "#16a34a" : "#ea580c", color: "white", padding: "3px 9px", borderRadius: 999, fontSize: 10, fontWeight: 700 }}>
                      {a.dispo}
                    </span>
                    {/* Bouton retirer */}
                    <button
                      onClick={e => handleRetirer(e, a.id)}
                      title="Retirer des favoris"
                      aria-label="Retirer des favoris"
                      style={{ position: "absolute", top: 10, right: 10, background: "white", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.15)", color: "#dc2626" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.5-7-11a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 6.5-7 11-7 11z"/></svg>
                    </button>
                  </div>

                  {/* Infos */}
                  <div style={{ padding: "14px 16px 16px" }}>
                    <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 3, lineHeight: 1.3 }}>{a.titre}</p>
                    <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 10 }}>{a.ville}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", gap: 10, fontSize: 12, color: "#6b7280" }}>
                        <span>{a.surface} m²</span>
                        <span style={{ color: "#d1d5db" }}>·</span>
                        <span>{a.pieces} p.</span>
                        {a.meuble && <><span style={{ color: "#d1d5db" }}>·</span><span>Meublé</span></>}
                      </div>
                      <span style={{ fontSize: 17, fontWeight: 800 }}>
                        {a.prix} €<span style={{ fontSize: 11, fontWeight: 400, color: "#9ca3af" }}>/mois</span>
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
