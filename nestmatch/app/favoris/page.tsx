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
import { km, KMPageHeader, KMToggle, KMBadge } from "../components/ui/km"
import { CARD_GRADIENTS as GRADIENTS } from "../../lib/cardGradients"

const MapAnnonces = dynamic(() => import("../components/MapAnnonces"), { ssr: false })

/**
 * /favoris — historique des annonces sauvegardées par le locataire.
 * Aligné Claude Design handoff : KMPageHeader + KMToggle + cards radius 20
 * + palette km. Toggle Liste/Carte uniquement quand ≥1 favori géolocalisé.
 */
export default function Favoris() {
  const [annonces, setAnnonces] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [favoris, setFavoris] = useState<number[]>([])
  const [vue, setVue] = useState<"liste" | "carte">("liste")
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const { isMobile } = useResponsive()

  useEffect(() => {
    const ids = getFavoris()
    setFavoris(ids)
    if (ids.length === 0) {
      setLoading(false)
      return
    }
    supabase.from("annonces").select("*").in("id", ids).then(({ data, error }) => {
      // Fail loud — avant : silent setLoading(false) avec liste vide trompeuse
      // ("Aucun favori" même si la DB est down).
      if (error) {
        console.error("[favoris] load failed", error)
      } else if (data) {
        setAnnonces(data)
      }
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

  // Variant sans event (pour MapAnnonces, qui gère lui-même stopPropagation)
  function handleToggleFavoriId(id: number) {
    toggleFavori(id)
    const newFavoris = getFavoris()
    setFavoris(newFavoris)
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

  const subtitle = favoris.length === 0
    ? "Aucun favori pour l'instant"
    : `${favoris.length} logement${favoris.length > 1 ? "s" : ""} sauvegardé${favoris.length > 1 ? "s" : ""}`

  return (
    <main style={{ minHeight: "100vh", background: km.beige, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", padding: isMobile ? "24px 16px" : "40px 48px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>

        <KMPageHeader
          eyebrow="Locataire"
          title="Mes favoris"
          subtitle={subtitle}
          isMobile={isMobile}
          right={annoncesAvecGeo.length > 0 ? (
            <KMToggle
              ariaLabel="Vue favoris"
              value={vue}
              onChange={(v) => setVue(v)}
              options={[
                { value: "liste", label: "Liste" },
                { value: "carte", label: "Carte" },
              ]}
            />
          ) : null}
        />

        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 17 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ background: km.white, border: `1px solid ${km.line}`, borderRadius: 20, height: 240, opacity: 0.4 }} />
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
        ) : vue === "carte" ? (
          <div style={{ background: km.white, borderRadius: 20, overflow: "hidden", height: "70vh", minHeight: 480, border: `1px solid ${km.line}`, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
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
                <p style={{ fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, color: km.ink, marginBottom: 8 }}>Aucune localisation disponible</p>
                <p style={{ fontSize: 13, color: km.muted }}>Les villes de vos favoris ne sont pas dans notre référentiel géographique.</p>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 17 }}>
            {annonces.map(a => {
              const photo = Array.isArray(a.photos) && a.photos.length > 0 ? a.photos[0] : null
              const gradient = GRADIENTS[a.id % GRADIENTS.length]
              const dispoIsNow = a.dispo === "Disponible maintenant"
              return (
                <Link key={a.id} href={`/annonces/${a.id}`}
                  style={{ textDecoration: "none", color: km.ink, display: "block", background: km.white, border: `1px solid ${km.line}`, borderRadius: 20, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.02)", transition: "box-shadow 0.2s, transform 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 10px 30px rgba(17,17,17,0.08)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)" }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 2px rgba(0,0,0,0.02)"; (e.currentTarget as HTMLElement).style.transform = "none" }}>

                  {/* Photo */}
                  <div style={{ position: "relative", height: 154, background: photo ? "#000" : gradient, overflow: "hidden" }}>
                    {photo
                      ? <Image src={photo} alt={a.titre} fill sizes="(max-width: 768px) 100vw, 240px" style={{ objectFit: "cover" }} />
                      : <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(17,17,17,0.3)", fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif", fontStyle: "italic", fontSize: 16 }}>Pas de photo</span>
                    }
                    {a.dispo && (
                      <span style={{ position: "absolute", top: 10, left: 10 }}>
                        <KMBadge variant={dispoIsNow ? "success" : "warn"}>{a.dispo}</KMBadge>
                      </span>
                    )}
                    <button
                      onClick={e => handleRetirer(e, a.id)}
                      title="Retirer des favoris"
                      aria-label="Retirer des favoris"
                      style={{ position: "absolute", top: 10, right: 10, background: km.white, border: `1px solid ${km.line}`, borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 1px 2px rgba(0,0,0,0.04)", color: km.errText }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.5-7-11a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 6.5-7 11-7 11z"/></svg>
                    </button>
                  </div>

                  {/* Infos */}
                  <div style={{ padding: "16px 18px 18px" }}>
                    <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 3, lineHeight: 1.3, color: km.ink, letterSpacing: "-0.2px" }}>{a.titre}</p>
                    <p style={{ color: km.muted, fontSize: 13, marginBottom: 12 }}>{a.ville}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", gap: 8, fontSize: 12, color: km.muted }}>
                        <span>{a.surface} m²</span>
                        <span style={{ color: km.line }}>·</span>
                        <span>{a.pieces} p.</span>
                        {a.meuble && <><span style={{ color: km.line }}>·</span><span>Meublé</span></>}
                      </div>
                      <span style={{ fontSize: 17, fontWeight: 700, color: km.ink, letterSpacing: "-0.3px" }}>
                        {a.prix} €<span style={{ fontSize: 11, fontWeight: 400, color: km.muted }}>/mois</span>
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
