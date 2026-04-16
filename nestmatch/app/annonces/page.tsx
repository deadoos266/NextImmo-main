"use client"
import { Suspense, useEffect, useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { useSearchParams, useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import { calculerScore, estExclu, labelScore } from "../../lib/matching"
import { useSession } from "next-auth/react"
import { useRole } from "../providers"
import { getCityCoords } from "../../lib/cityCoords"
import { getFavoris, toggleFavori } from "../../lib/favoris"
import { useResponsive } from "../hooks/useResponsive"

const MapAnnonces = dynamic(() => import("../components/MapAnnonces"), { ssr: false })

// Carousel photo défini hors du composant principal (évite perte de focus)
const GRADIENTS = [
  "linear-gradient(135deg, #e8e0f0, #d4c5e8)",
  "linear-gradient(135deg, #d4e8e0, #b8d4c8)",
  "linear-gradient(135deg, #e8d4c5, #d4b89a)",
  "linear-gradient(135deg, #c5d4e8, #a0b8d4)",
  "linear-gradient(135deg, #e8e8c5, #d4d4a0)",
  "linear-gradient(135deg, #e8c5d4, #d4a0b8)",
]

function CardPhoto({ annonce, height = 170 }: { annonce: any; height?: number }) {
  const [idx, setIdx] = useState(0)
  const realPhotos: string[] = Array.isArray(annonce.photos) && annonce.photos.length > 0 ? annonce.photos : []
  const total = realPhotos.length > 0 ? realPhotos.length : 1
  const base = GRADIENTS[annonce.id % GRADIENTS.length]

  function prev(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIdx(i => (i - 1 + total) % total)
  }
  function next(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIdx(i => (i + 1) % total)
  }

  const currentPhoto = realPhotos[idx]

  return (
    <div style={{ position: "relative", height, background: currentPhoto ? "#000" : base, overflow: "hidden", flexShrink: 0 }}
      onMouseEnter={e => {
        const btns = e.currentTarget.querySelectorAll<HTMLButtonElement>(".photo-nav")
        btns.forEach(b => (b.style.opacity = "1"))
      }}
      onMouseLeave={e => {
        const btns = e.currentTarget.querySelectorAll<HTMLButtonElement>(".photo-nav")
        btns.forEach(b => (b.style.opacity = "0"))
      }}
    >
      {/* Photo réelle ou gradient */}
      {currentPhoto ? (
        <img src={currentPhoto} alt={annonce.titre} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(0,0,0,0.25)", fontSize: 12, fontWeight: 500 }}>
          Pas de photo
        </span>
      )}

      {/* Dispo badge */}
      <span style={{ position: "absolute", top: 10, left: 10, background: annonce.dispo === "Disponible maintenant" ? "#16a34a" : "#ea580c", color: "white", padding: "3px 9px", borderRadius: 999, fontSize: 10, fontWeight: 700, zIndex: 2 }}>
        {annonce.dispo}
      </span>

      {/* Fleches nav (seulement si plusieurs photos) */}
      {realPhotos.length > 1 && (
        <>
          <button className="photo-nav" onClick={prev}
            style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.85)", border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity 0.15s", zIndex: 3, fontWeight: 700, color: "#111" }}>
            ‹
          </button>
          <button className="photo-nav" onClick={next}
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.85)", border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity 0.15s", zIndex: 3, fontWeight: 700, color: "#111" }}>
            ›
          </button>
        </>
      )}

      {/* Dots (seulement si plusieurs photos) */}
      {realPhotos.length > 1 && (
        <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 4, zIndex: 2 }}>
          {realPhotos.map((_, i) => (
            <div key={i} style={{ width: i === idx ? 14 : 5, height: 5, borderRadius: 999, background: i === idx ? "white" : "rgba(255,255,255,0.5)", transition: "all 0.2s" }} />
          ))}
        </div>
      )}

      {/* Compteur photos (si plusieurs) */}
      {realPhotos.length > 1 && (
        <span style={{ position: "absolute", bottom: 8, right: 10, background: "rgba(0,0,0,0.5)", color: "white", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, zIndex: 2 }}>
          {idx + 1}/{total}
        </span>
      )}
    </div>
  )
}

const Toggle = ({ val, set }: { val: boolean; set: (v: boolean) => void }) => (
  <div onClick={() => set(!val)} style={{ width: 38, height: 20, borderRadius: 999, background: val ? "#111" : "#d1d5db", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
    <div style={{ width: 14, height: 14, borderRadius: "50%", background: "white", position: "absolute", top: 3, left: val ? 21 : 3, transition: "left 0.2s" }} />
  </div>
)

export default function Annonces() {
  return (
    <Suspense fallback={<AnnoncesFallback />}>
      <AnnoncesContent />
    </Suspense>
  )
}

function AnnoncesFallback() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100vh - 64px)", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", color: "#6b7280" }}>
      Chargement des annonces...
    </div>
  )
}

function AnnoncesContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [annonces, setAnnonces] = useState<any[]>([])
  const [profil, setProfil] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tri, setTri] = useState<"match" | "prix_asc" | "prix_desc">("match")
  const [scoreMin, setScoreMin] = useState(0)
  const [dispoImmediate, setDispoImmediate] = useState(false)
  const [filtreParking, setFiltreParking] = useState(false)
  const [filtreExterieur, setFiltreExterieur] = useState(false)
  const [mapBounds, setMapBounds] = useState<any>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [favoris, setFavoris] = useState<number[]>([])
  const [showFilters, setShowFilters] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const { data: session, status } = useSession()
  const { role } = useRole()
  const isProprietaire = role === "proprietaire"
  const { isMobile, isTablet } = useResponsive()
  const isSmall = isMobile || isTablet

  // Filtres pre-remplis depuis l'URL (barre de recherche home) ou depuis le profil locataire
  const urlVille = searchParams?.get("ville") || ""
  const urlBudget = parseInt(searchParams?.get("budget_max") || "0") || 0
  const urlType = searchParams?.get("type") || ""

  // Si l'URL ne specifie rien, on retombe sur les valeurs du profil locataire
  const activeVille = urlVille || (!isProprietaire && profil?.ville_souhaitee) || ""
  const activeBudget = urlBudget || (!isProprietaire && profil?.budget_max) || 0
  const activeType = urlType

  function clearUrlFilters() {
    router.replace("/annonces")
  }

  useEffect(() => {
    setFavoris(getFavoris())
  }, [])

  useEffect(() => {
    async function fetchData() {
      const { data: a } = await supabase.from("annonces").select("*")
      if (a) setAnnonces(a)
      if (session?.user?.email) {
        const { data: p } = await supabase.from("profils").select("*").eq("email", session.user.email).single()
        if (p) setProfil(p)
      }
      setLoading(false)
    }
    fetchData()
  }, [session])

  function handleToggleFavori(e: React.MouseEvent, id: number) {
    e.preventDefault()
    e.stopPropagation()
    toggleFavori(id)
    setFavoris(getFavoris())
  }

  const handleBoundsChange = useCallback((bounds: any) => {
    // Priorité à la zone : quand l'user clique "Rechercher dans cette zone",
    // on efface les filtres URL (ville/budget/type) pour éviter qu'ils
    // éliminent tous les biens de la zone nouvellement sélectionnée
    if (typeof window !== "undefined") {
      const hasFilters = new URL(window.location.href).searchParams.has("ville")
        || new URL(window.location.href).searchParams.has("budget_max")
        || new URL(window.location.href).searchParams.has("type")
      if (hasFilters) {
        router.replace("/annonces", { scroll: false })
      }
    }
    setMapBounds(bounds)
  }, [router])

  const annoncesEnrichies = annonces
    .filter(a => !profil || !estExclu(a, profil))
    .map(a => {
      const coords = getCityCoords(a.ville || "")
      return {
        ...a,
        scoreMatching: profil ? calculerScore(a, profil) : null,
        _lat: coords ? coords[0] : null,
        _lng: coords ? coords[1] : null,
      }
    })

  // Filtres URL/profil + options de filtre (sans le mapBounds) —
  // ce qui sera passe comme markers a la carte
  const annoncesForMap = annoncesEnrichies
    .filter(a => {
      if (activeVille && a.ville) {
        const vA = a.ville.toLowerCase()
        const vF = activeVille.toLowerCase()
        if (!vA.includes(vF) && !vF.includes(vA)) return false
      }
      if (activeBudget && a.prix && a.prix > activeBudget * 1.20) return false
      if (activeType && a.type_bien) {
        if (!a.type_bien.toLowerCase().includes(activeType.toLowerCase())) return false
      }
      if (!isProprietaire && scoreMin > 0 && a.scoreMatching !== null && Math.round(a.scoreMatching / 10) < scoreMin) return false
      if (dispoImmediate && a.dispo !== "Disponible maintenant") return false
      if (filtreParking && !a.parking) return false
      if (filtreExterieur && !a.balcon && !a.terrasse && !a.jardin) return false
      return true
    })

  // Pour la liste : memes filtres + filtre par zone carte
  const annoncesTraitees = annoncesForMap
    .filter(a => {
      if (mapBounds && a._lat && a._lng) {
        if (!mapBounds.contains([a._lat, a._lng])) return false
      }
      return true
    })
    .sort((a, b) => {
      if (tri === "match") return (b.scoreMatching ?? 0) - (a.scoreMatching ?? 0)
      if (tri === "prix_asc") return (a.prix ?? 0) - (b.prix ?? 0)
      if (tri === "prix_desc") return (b.prix ?? 0) - (a.prix ?? 0)
      return 0
    })

  // Coordonnees de centrage de la carte : ville URL > ville profil > aucune
  const centerCity = activeVille ? getCityCoords(activeVille) : null

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 64px)", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", overflow: "hidden" }}>

      {/* Bandeau compact */}
      <div style={{ flexShrink: 0, padding: isMobile ? "10px 16px" : "10px 32px" }}>
        {isProprietaire ? (
          <div style={{ background: "white", borderRadius: 12, padding: isMobile ? "8px 14px" : "10px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #e5e7eb", gap: 10 }}>
            <span style={{ fontSize: isMobile ? 12 : 13, color: "#6b7280" }}>
              <strong style={{ color: "#111" }}>Mode proprio</strong>{!isMobile && " — scores non applicables"}
            </span>
            <a href="/proprietaire" style={{ fontSize: 12, fontWeight: 700, color: "#111", textDecoration: "none", padding: "4px 12px", border: "1.5px solid #e5e7eb", borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0 }}>Mes biens</a>
          </div>
        ) : status === "authenticated" && profil ? (
          <div style={{ background: "white", borderRadius: 12, padding: isMobile ? "8px 14px" : "10px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #e5e7eb", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: isMobile ? 11 : 13, fontWeight: 700, color: "#16a34a" }}>
                {urlVille || urlBudget || urlType ? "Recherche" : "Personnalise"}
              </span>
              {activeVille && <span style={{ background: "#f3f4f6", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600 }}>{activeVille}</span>}
              {!isMobile && activeBudget > 0 && <span style={{ background: "#f3f4f6", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600 }}>Max {activeBudget} &euro;</span>}
              {!isMobile && activeType && <span style={{ background: "#f3f4f6", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600 }}>{activeType}</span>}
              {(urlVille || urlBudget || urlType) && (
                <button onClick={clearUrlFilters} style={{ background: "none", border: "none", fontSize: 11, fontWeight: 600, color: "#6b7280", cursor: "pointer", textDecoration: "underline", padding: 0, fontFamily: "inherit" }}>Effacer</button>
              )}
            </div>
            <a href="/profil" style={{ fontSize: 11, fontWeight: 700, color: "#111", textDecoration: "none", padding: "4px 10px", border: "1.5px solid #e5e7eb", borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0 }}>Profil</a>
          </div>
        ) : status === "unauthenticated" ? (
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: isMobile ? "8px 14px" : "10px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: isMobile ? 11 : 13, fontWeight: 600, color: "#92400e" }}>{isMobile ? "Connectez-vous pour le matching" : "Connectez-vous pour le score de compatibilite"}</span>
              {activeVille && <span style={{ background: "white", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, color: "#92400e", border: "1px solid #fde68a" }}>{activeVille}</span>}
              {!isMobile && activeBudget > 0 && <span style={{ background: "white", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, color: "#92400e", border: "1px solid #fde68a" }}>Max {activeBudget} &euro;</span>}
            </div>
            <a href="/auth" style={{ background: "#111", color: "white", padding: "5px 14px", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>Connexion</a>
          </div>
        ) : null}
      </div>

      {/* Barre mobile filtres + carte */}
      {isMobile && (
        <div style={{ display: "flex", gap: 8, padding: "0 16px 10px", flexShrink: 0 }}>
          <button onClick={() => setShowFilters(!showFilters)}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 14px", background: showFilters ? "#111" : "white", color: showFilters ? "white" : "#374151", border: "1.5px solid #e5e7eb", borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            ⚙ Filtres
          </button>
          <button onClick={() => setShowMap(!showMap)}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 14px", background: showMap ? "#111" : "white", color: showMap ? "white" : "#374151", border: "1.5px solid #e5e7eb", borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            📍 Carte
          </button>
        </div>
      )}

      {/* Corps principal */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", padding: isMobile ? "0 16px 16px" : "0 12px 12px 24px", gap: 12, flexDirection: isMobile ? "column" : "row" }}>

        {/* Sidebar filtres */}
        <div style={{ width: isMobile ? "100%" : 200, flexShrink: 0, overflowY: "auto", display: isMobile && !showFilters ? "none" : "block", maxHeight: isMobile ? 300 : undefined }}>
          <div style={{ background: "white", borderRadius: 18, padding: 18 }}>
            <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 14, color: "#111" }}>Affiner</p>

            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Trier par</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {[
                  { val: "match", label: "Meilleur match" },
                  { val: "prix_asc", label: "Prix croissant" },
                  { val: "prix_desc", label: "Prix decroissant" },
                ].map(t => (
                  <button key={t.val} onClick={() => setTri(t.val as any)}
                    style={{ padding: "7px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 12, textAlign: "left", fontFamily: "inherit", background: tri === t.val ? "#111" : "#f9fafb", color: tri === t.val ? "white" : "#374151" }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {profil && !isProprietaire && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Score minimum</p>
                <input type="range" min={0} max={90} step={10} value={scoreMin} onChange={e => setScoreMin(Number(e.target.value))} style={{ width: "100%", accentColor: "#111" }} />
                <p style={{ fontSize: 12, fontWeight: 700, marginTop: 4, color: "#111" }}>{scoreMin > 0 ? `>= ${scoreMin}%` : "Tous"}</p>
              </div>
            )}

            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>Options</p>
              {[
                { label: "Dispo immediate", val: dispoImmediate, set: setDispoImmediate },
                { label: "Parking", val: filtreParking, set: setFiltreParking },
                { label: "Exterieur", val: filtreExterieur, set: setFiltreExterieur },
              ].map(opt => (
                <div key={opt.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: "#374151" }}>{opt.label}</span>
                  <Toggle val={opt.val} set={opt.set} />
                </div>
              ))}
            </div>

            {mapBounds && (
              <button onClick={() => setMapBounds(null)}
                style={{ width: "100%", marginTop: 8, padding: "7px 0", background: "#f3f4f6", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#374151" }}>
                Voir toute la France
              </button>
            )}
          </div>
        </div>

        {/* Liste */}
        <div style={{ width: isMobile ? "100%" : 360, flex: isMobile && !showMap ? 1 : undefined, flexShrink: 0, overflowY: "auto", display: isMobile && showMap ? "none" : "flex", flexDirection: "column", gap: 0 }}>
          {/* Compteur */}
          <div style={{ padding: "2px 0 10px", flexShrink: 0 }}>
            <p style={{ fontSize: 13, color: "#6b7280" }}>
              {loading ? "Chargement..." : <><strong style={{ color: "#111" }}>{annoncesTraitees.length}</strong> logement{annoncesTraitees.length > 1 ? "s" : ""}</>}
              {mapBounds && <span style={{ marginLeft: 6, fontSize: 11, color: "#9ca3af" }}>dans la zone</span>}
            </p>
          </div>

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[1, 2, 3].map(i => <div key={i} style={{ background: "white", borderRadius: 16, height: 110, opacity: 0.4 }} />)}
            </div>
          ) : annoncesTraitees.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: "#374151", marginBottom: 12 }}>Aucun logement trouve</p>
              {mapBounds && <button onClick={() => setMapBounds(null)} style={{ background: "#111", color: "white", padding: "8px 20px", borderRadius: 999, border: "none", fontFamily: "inherit", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Elargir la zone</button>}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {annoncesTraitees.map(a => {
                const score = a.scoreMatching
                const info = !isProprietaire && score !== null ? labelScore(score) : null
                const isOwn = isProprietaire && a.proprietaire_email === session?.user?.email
                const isSelected = selectedId === a.id
                return (
                  <a key={a.id} href={`/annonces/${a.id}`}
                    onMouseEnter={() => setSelectedId(a.id)}
                    onMouseLeave={() => setSelectedId(null)}
                    style={{
                      display: "block", textDecoration: "none", color: "#111",
                      background: "white",
                      borderRadius: 16,
                      overflow: "hidden",
                      boxShadow: isSelected
                        ? "0 6px 24px rgba(0,0,0,0.10)"
                        : "0 1px 6px rgba(0,0,0,0.05)",
                      transition: "box-shadow 0.2s, transform 0.15s",
                      transform: isSelected ? "translateY(-1px)" : "none",
                      outline: isSelected ? "2px solid #111" : "2px solid transparent",
                    }}>
                    {/* Photo carousel */}
                    <div style={{ position: "relative" }}>
                      <CardPhoto annonce={a} height={150} />
                      <button
                        onClick={e => handleToggleFavori(e, a.id)}
                        style={{ position: "absolute", top: 10, right: 10, zIndex: 4, background: "white", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.15)", fontSize: 16, transition: "transform 0.15s" }}
                        onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.15)")}
                        onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}>
                        {favoris.includes(a.id) ? "❤️" : "🤍"}
                      </button>
                    </div>

                    {/* Infos */}
                    <div style={{ padding: "12px 14px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 3 }}>
                        <p style={{ fontWeight: 700, fontSize: 14, flex: 1, marginRight: 8, lineHeight: 1.3 }}>{a.titre}</p>
                        {info && (
                          <span style={{ background: info.bg, color: info.color, padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>
                            {Math.round(score / 10)}%
                          </span>
                        )}
                        {isOwn && (
                          <span style={{ background: "#f3f4f6", color: "#374151", padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>Votre bien</span>
                        )}
                      </div>
                      <p style={{ color: "#9ca3af", fontSize: 12, marginBottom: 8 }}>{a.ville}</p>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", gap: 10, fontSize: 12, color: "#6b7280" }}>
                          <span>{a.surface} m²</span>
                          <span style={{ color: "#d1d5db" }}>·</span>
                          <span>{a.pieces} p.</span>
                          {a.meuble && <><span style={{ color: "#d1d5db" }}>·</span><span>Meuble</span></>}
                        </div>
                        <span style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>
                          {a.prix} €<span style={{ fontSize: 11, fontWeight: 400, color: "#9ca3af" }}>/mois</span>
                        </span>
                      </div>
                    </div>
                  </a>
                )
              })}
            </div>
          )}
        </div>

        {/* Carte — isolation: isolate pour que Leaflet reste sous la navbar */}
        <div style={{ flex: 1, position: "relative", isolation: "isolate", borderRadius: isMobile ? 0 : 18, overflow: "hidden", display: isMobile && !showMap ? "none" : "block" }}>
          <MapAnnonces
            key={activeVille || "all"}
            annonces={annoncesForMap}
            selectedId={selectedId}
            onSelect={id => setSelectedId(id)}
            onBoundsChange={handleBoundsChange}
            centerHint={centerCity ? [centerCity[0], centerCity[1]] : null}
          />
        </div>
      </div>
    </div>
  )
}
