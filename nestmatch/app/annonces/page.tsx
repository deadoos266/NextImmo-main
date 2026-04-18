"use client"
import { Suspense, useEffect, useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { useSearchParams, useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import { calculerScore, estExclu, labelScore } from "../../lib/matching"
import { useSession } from "next-auth/react"
import { useRole } from "../providers"
import { getCityCoords, normalizeCityKey } from "../../lib/cityCoords"
import { geocodeCity } from "../../lib/geocoding"
import { getFavoris, toggleFavori } from "../../lib/favoris"
import { calculerCompletudeProfil } from "../../lib/profilCompleteness"
import { useResponsive } from "../hooks/useResponsive"
import CityAutocomplete from "../components/CityAutocomplete"

const MapAnnonces = dynamic(() => import("../components/MapAnnonces"), { ssr: false })

// Gradients placeholder partagés dans lib/cardGradients.ts
import { CARD_GRADIENTS as GRADIENTS } from "../../lib/cardGradients"

/**
 * Highlight d'un terme dans un texte. Retourne un fragment JSX avec
 * les matchs entourés de <mark>. Case-insensitive, accents-insensitive
 * (normalisation NFD sur les 2 côtés pour matcher "ecole" vs "école").
 */
function highlightMatch(text: string, query: string): React.ReactNode {
  const q = query.trim()
  if (!q || !text) return text
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  const haystack = norm(text)
  const needle = norm(q)
  if (needle.length === 0 || !haystack.includes(needle)) return text
  const parts: React.ReactNode[] = []
  let cursor = 0
  let idx = haystack.indexOf(needle, cursor)
  let keyN = 0
  while (idx !== -1) {
    if (idx > cursor) parts.push(text.slice(cursor, idx))
    parts.push(
      <mark key={keyN++} style={{ background: "#fef08a", color: "#111", padding: "0 2px", borderRadius: 3 }}>
        {text.slice(idx, idx + needle.length)}
      </mark>
    )
    cursor = idx + needle.length
    idx = haystack.indexOf(needle, cursor)
  }
  if (cursor < text.length) parts.push(text.slice(cursor))
  return <>{parts}</>
}

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
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100vh - 72px)", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", color: "#6b7280" }}>
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
  const [filtreMeuble, setFiltreMeuble] = useState(false)
  // Budget max effectif pour le filtre. Vient soit de profil.budget_max
  // (source de vérité du locataire), soit d'un override manuel local via chip.
  const [budgetMaxFiltre, setBudgetMaxFiltre] = useState<number | null>(null)
  // HARD LOCK animaux : par défaut si profil.animaux=true on exclut les
  // annonces sans animaux. L'user peut ponctuellement lever le lock pour la
  // session en cours via un bouton dédié (pas de modification du profil).
  const [filtreAnimauxLock, setFiltreAnimauxLock] = useState(false)
  const [animauxOverride, setAnimauxOverride] = useState(false)
  const [filtreDpeMax, setFiltreDpeMax] = useState<string>("")  // "A" | "B" | ... | "G" — max toléré
  const [criteresHydrated, setCriteresHydrated] = useState(false)
  // Snapshot des valeurs initiales venues du profil. Permet de détecter les
  // divergences et proposer un bouton « Resynchroniser avec mon profil ».
  const [profilSnapshot, setProfilSnapshot] = useState<{
    budget: number | null
    meuble: boolean
    parking: boolean
    exterieur: boolean
    dpe: string
    animaux: boolean
  } | null>(null)
  // Recherches sauvegardées (locataire seulement) : filtres nommés stockés en
  // localStorage. Permet de retrouver ses critères en 1 clic.
  type SavedSearch = {
    id: string
    name: string
    ville: string
    budgetMax: number | null
    surfaceMin: string
    surfaceMax: string
    piecesMin: number
    meuble: boolean
    parking: boolean
    exterieur: boolean
    dispo: boolean
    savedAt: string
  }
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [showSaved, setShowSaved] = useState(false)
  const [surfaceMin, setSurfaceMin] = useState<string>("")
  const [surfaceMax, setSurfaceMax] = useState<string>("")
  const [piecesMin, setPiecesMin] = useState<number>(0)
  const [mapBounds, setMapBounds] = useState<any>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [favoris, setFavoris] = useState<number[]>([])
  // Map ville-normalisée → coords, rempli en background par Nominatim
  // pour les annonces sans lat/lng et sans ville dans cityCoords.ts
  const [geocoded, setGeocoded] = useState<Record<string, [number, number]>>({})
  const [showFilters, setShowFilters] = useState(false)
  const [motCle, setMotCle] = useState("")
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
  // Nouveaux filtres persistés en URL (batch 34)
  const urlSurfaceMin = searchParams?.get("surface_min") || ""
  const urlSurfaceMax = searchParams?.get("surface_max") || ""
  const urlPiecesMin = parseInt(searchParams?.get("pieces_min") || "0") || 0
  const urlMotCle = searchParams?.get("q") || ""

  // Si l'URL ne specifie rien, on retombe sur les valeurs du profil locataire
  const activeVille = urlVille || (!isProprietaire && profil?.ville_souhaitee) || ""
  const activeBudget = urlBudget || (!isProprietaire && profil?.budget_max) || 0
  const activeType = urlType

  function clearUrlFilters() {
    router.replace("/annonces")
  }

  // Sync local state ↔ URL lorsque les params changent (navigation)
  useEffect(() => {
    if (urlSurfaceMin !== surfaceMin) setSurfaceMin(urlSurfaceMin)
    if (urlSurfaceMax !== surfaceMax) setSurfaceMax(urlSurfaceMax)
    if (urlPiecesMin !== piecesMin) setPiecesMin(urlPiecesMin)
    if (urlMotCle !== motCle) setMotCle(urlMotCle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSurfaceMin, urlSurfaceMax, urlPiecesMin, urlMotCle])

  useEffect(() => {
    setFavoris(getFavoris())
  }, [])

  // Hydrate les recherches sauvegardées depuis localStorage (keyed par email)
  useEffect(() => {
    const email = session?.user?.email?.toLowerCase()
    if (!email) return
    try {
      const raw = localStorage.getItem(`nestmatch:savedSearches:${email}`)
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) setSavedSearches(arr)
      }
    } catch { /* noop */ }
  }, [session?.user?.email])

  function persistSavedSearches(list: SavedSearch[]) {
    const email = session?.user?.email?.toLowerCase()
    if (!email) return
    try { localStorage.setItem(`nestmatch:savedSearches:${email}`, JSON.stringify(list)) } catch { /* noop */ }
  }

  function sauverRecherche() {
    const parts: string[] = []
    if (activeVille) parts.push(activeVille)
    if (budgetMaxFiltre) parts.push(`< ${budgetMaxFiltre} €`)
    else if (activeBudget) parts.push(`< ${activeBudget} €`)
    if (piecesMin) parts.push(`${piecesMin}+ pièces`)
    if (filtreMeuble) parts.push("Meublé")
    if (filtreParking) parts.push("Parking")
    const nameAuto = parts.length > 0 ? parts.join(" · ") : "Toutes les annonces"
    const name = window.prompt("Nom de la recherche :", nameAuto)
    if (!name || !name.trim()) return
    const search: SavedSearch = {
      id: Date.now().toString(36),
      name: name.trim().slice(0, 60),
      ville: activeVille || "",
      budgetMax: budgetMaxFiltre ?? activeBudget ?? null,
      surfaceMin,
      surfaceMax,
      piecesMin,
      meuble: filtreMeuble,
      parking: filtreParking,
      exterieur: filtreExterieur,
      dispo: dispoImmediate,
      savedAt: new Date().toISOString(),
    }
    const next = [search, ...savedSearches].slice(0, 10)
    setSavedSearches(next)
    persistSavedSearches(next)
    setShowSaved(true)
  }

  function appliquerRecherche(s: SavedSearch) {
    setBudgetMaxFiltre(s.budgetMax ?? null)
    setSurfaceMin(s.surfaceMin)
    setSurfaceMax(s.surfaceMax)
    setPiecesMin(s.piecesMin)
    setFiltreMeuble(s.meuble)
    setFiltreParking(s.parking)
    setFiltreExterieur(s.exterieur)
    setDispoImmediate(s.dispo)
    // La ville passe par l'URL car activeVille est dérivé d'urlVille
    const params = new URLSearchParams()
    if (s.ville) params.set("ville", s.ville)
    if (s.budgetMax) params.set("budget_max", String(s.budgetMax))
    if (s.surfaceMin) params.set("surface_min", s.surfaceMin)
    if (s.surfaceMax) params.set("surface_max", s.surfaceMax)
    if (s.piecesMin) params.set("pieces_min", String(s.piecesMin))
    const qs = params.toString()
    router.replace(qs ? `/annonces?${qs}` : "/annonces")
    setShowSaved(false)
  }

  function supprimerRecherche(id: string) {
    const next = savedSearches.filter(s => s.id !== id)
    setSavedSearches(next)
    persistSavedSearches(next)
  }

  useEffect(() => {
    async function fetchData() {
      // N'affiche pas les biens marqués "loué" dans la recherche publique —
      // le proprio les garde pour stats/historique mais ils ne doivent plus
      // apparaître aux locataires.
      const { data: a } = await supabase
        .from("annonces")
        .select("*")
        .or("statut.is.null,statut.neq.loué")
      if (a) setAnnonces(a)
      if (session?.user?.email) {
        const { data: p } = await supabase.from("profils").select("*").eq("email", session.user.email).single()
        if (p) {
          setProfil(p)
          // Pré-remplir la sidebar depuis le profil — UNIQUEMENT si les
          // champs locaux n'ont pas été explicitement modifiés (valeurs
          // par défaut vides / 0). Sinon on respecte le choix user.
          if (!isProprietaire) {
            if (p.surface_min && !surfaceMin) setSurfaceMin(String(p.surface_min))
            if (p.surface_max && !surfaceMax) setSurfaceMax(String(p.surface_max))
            if (p.pieces_min && piecesMin === 0) setPiecesMin(Number(p.pieces_min))
            if (p.parking && !filtreParking) setFiltreParking(true)
            if ((p.balcon || p.terrasse || p.jardin) && !filtreExterieur) setFiltreExterieur(true)
            if (p.meuble && !filtreMeuble) setFiltreMeuble(true)
            if (p.budget_max && budgetMaxFiltre === null) setBudgetMaxFiltre(Number(p.budget_max))
            if (p.dpe_min && !filtreDpeMax) setFiltreDpeMax(String(p.dpe_min))
            if (p.animaux === true) setFiltreAnimauxLock(true)
            // Snapshot des valeurs initiales du profil pour pouvoir détecter
            // les divergences et proposer un bouton "Resynchroniser".
            setProfilSnapshot({
              budget: p.budget_max ? Number(p.budget_max) : null,
              meuble: !!p.meuble,
              parking: !!p.parking,
              exterieur: !!(p.balcon || p.terrasse || p.jardin),
              dpe: p.dpe_min || "",
              animaux: !!p.animaux,
            })
          }
          setCriteresHydrated(true)
        }
      }
      setLoading(false)
    }
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  function handleToggleFavori(e: React.MouseEvent, id: number) {
    e.preventDefault()
    e.stopPropagation()
    toggleFavori(id)
    setFavoris(getFavoris())
  }

  const handleBoundsChange = useCallback((bounds: any, userDriven: boolean) => {
    // Appliquer la zone uniquement sur action user ("Rechercher dans cette zone").
    // On NE TOUCHE PAS aux filtres URL — l'utilisateur peut vouloir raffiner
    // dans sa ville actuelle, effacer la ville serait contre-intuitif. Un
    // bouton dédié "Voir toute la France" permet de reset la zone explicitement.
    if (userDriven) setMapBounds(bounds)
  }, [])

  // Normalisation ville identique à lib/geocoding (pour lookup dans `geocoded`)
  const normalizeVille = normalizeCityKey

  const annoncesEnrichies = annonces
    .filter(a => !profil || !estExclu(a, profil))
    .map(a => {
      // Priorité :
      //   1. lat/lng DB (BAN autocomplete) UNIQUEMENT si localisation_exacte=true
      //      — si proprio ne veut pas dévoiler, on ne les utilise pas
      //   2. cityCoords statique (centre ville)
      //   3. geocoded async (Nominatim en background)
      const canUseDbCoords = !!a.localisation_exacte && typeof a.lat === "number" && typeof a.lng === "number"
      let lat: number | null = null
      let lng: number | null = null
      if (canUseDbCoords) {
        lat = a.lat
        lng = a.lng
      } else {
        const staticCoords = getCityCoords(a.ville || "")
        if (staticCoords) {
          lat = staticCoords[0]
          lng = staticCoords[1]
        } else if (a.ville) {
          const g = geocoded[normalizeVille(a.ville)]
          if (g) { lat = g[0]; lng = g[1] }
        }
      }
      return {
        ...a,
        scoreMatching: profil ? calculerScore(a, profil) : null,
        _lat: lat,
        _lng: lng,
      }
    })

  // Background geocoding pour les villes pas dans cityCoords + pas en DB
  useEffect(() => {
    const missing = annonces
      .filter(a => typeof a.lat !== "number" && typeof a.lng !== "number")
      .filter(a => a.ville && !getCityCoords(a.ville))
      .map(a => a.ville as string)
    const uniques = Array.from(new Set(missing.map(normalizeVille).filter(v => !geocoded[v])))
    if (uniques.length === 0) return
    let cancelled = false
    ;(async () => {
      for (const norm of uniques) {
        if (cancelled) return
        const orig = missing.find(v => normalizeVille(v) === norm) ?? norm
        const coords = await geocodeCity(orig)
        if (cancelled) return
        if (coords) {
          setGeocoded(prev => prev[norm] ? prev : { ...prev, [norm]: coords })
        }
      }
    })()
    return () => { cancelled = true }
  }, [annonces, geocoded])

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
      if (filtreMeuble && !a.meuble) return false
      if (budgetMaxFiltre && a.prix && a.prix > budgetMaxFiltre) return false
      // HARD LOCK animaux — sauf si l'user a demandé explicitement à voir
      // aussi les autres annonces pour cette session (animauxOverride).
      if (filtreAnimauxLock && !animauxOverride && !a.animaux) return false
      // DPE : A est meilleur que G. On filtre si dpe > filtreDpeMax.
      if (filtreDpeMax && a.dpe && a.dpe.localeCompare(filtreDpeMax) > 0) return false
      // Surface min/max (m²)
      const surfMinN = surfaceMin ? parseInt(surfaceMin, 10) : 0
      const surfMaxN = surfaceMax ? parseInt(surfaceMax, 10) : 0
      if (surfMinN > 0 && (!a.surface || a.surface < surfMinN)) return false
      if (surfMaxN > 0 && (!a.surface || a.surface > surfMaxN)) return false
      // Nombre de pièces minimum
      if (piecesMin > 0 && (!a.pieces || a.pieces < piecesMin)) return false
      // Recherche full-text : titre + description + ville + adresse
      if (motCle.trim()) {
        const q = motCle.toLowerCase().trim()
        const haystack = `${a.titre || ""} ${a.description || ""} ${a.ville || ""} ${a.adresse || ""}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
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
  // 1. cityCoords statique (instantané, ~100 villes)
  // 2. geocoded[normalizeVille] (Nominatim en background, cache localStorage)
  const centerCity = activeVille
    ? (getCityCoords(activeVille) ?? geocoded[normalizeVille(activeVille)] ?? null)
    : null

  // Déclenche un geocoding background pour la ville active si pas dans cityCoords
  useEffect(() => {
    if (!activeVille) return
    if (getCityCoords(activeVille)) return
    const key = normalizeVille(activeVille)
    if (geocoded[key]) return
    let cancelled = false
    ;(async () => {
      const { geocodeCity } = await import("../../lib/geocoding")
      const coords = await geocodeCity(activeVille)
      if (cancelled) return
      if (coords) setGeocoded(prev => prev[key] ? prev : { ...prev, [key]: coords })
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVille])

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 72px)", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", overflow: "hidden" }}>

      {/* H1 SEO visible pour les crawlers — masqué visuellement mais lu par Google */}
      <h1 style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}>
        {activeVille
          ? `Logements à louer à ${activeVille} — annonces entre particuliers`
          : "Logements à louer — annonces entre particuliers en France"}
      </h1>

      {/* Bandeau compact */}
      <div style={{ flexShrink: 0, padding: isMobile ? "10px 16px" : "10px 32px" }}>
        {isProprietaire ? (
          <div style={{ background: "white", borderRadius: 12, padding: isMobile ? "8px 14px" : "10px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #e5e7eb", gap: 10 }}>
            <span style={{ fontSize: isMobile ? 12 : 13, color: "#6b7280" }}>
              <strong style={{ color: "#111" }}>Mode proprio</strong>{!isMobile && " — scores non applicables"}
            </span>
            <a href="/proprietaire" style={{ fontSize: 12, fontWeight: 700, color: "#111", textDecoration: "none", padding: "4px 12px", border: "1.5px solid #e5e7eb", borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0 }}>Mes biens</a>
          </div>
        ) : status === "authenticated" && profil ? (() => {
          const { score: completude } = calculerCompletudeProfil(profil)
          const completudeColor = completude >= 80 ? "#16a34a" : completude >= 50 ? "#ea580c" : "#dc2626"
          return (
          <div style={{ background: "white", borderRadius: 12, padding: isMobile ? "8px 14px" : "10px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #e5e7eb", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: isMobile ? 11 : 13, fontWeight: 700, color: "#16a34a" }}>
                {urlVille || urlBudget || urlType ? "Recherche" : "Personnalisé"}
              </span>
              {activeVille && <span style={{ background: "#f3f4f6", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600 }}>{activeVille}</span>}
              {!isMobile && activeBudget > 0 && <span style={{ background: "#f3f4f6", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600 }}>Max {activeBudget} &euro;</span>}
              {!isMobile && activeType && <span style={{ background: "#f3f4f6", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600 }}>{activeType}</span>}
              {(urlVille || urlBudget || urlType) && (
                <button onClick={clearUrlFilters} style={{ background: "none", border: "none", fontSize: 11, fontWeight: 600, color: "#6b7280", cursor: "pointer", textDecoration: "underline", padding: 0, fontFamily: "inherit" }}>Effacer</button>
              )}
              {/* Badge complétude dossier : visible si < 100 */}
              {!isProprietaire && completude < 100 && (
                <a href="/profil" style={{ background: "#fff7ed", border: `1px solid ${completudeColor}33`, color: completudeColor, padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  Dossier {completude}% <span style={{ opacity: 0.8 }}>— compléter</span>
                </a>
              )}
            </div>
            <a href="/profil" style={{ fontSize: 11, fontWeight: 700, color: "#111", textDecoration: "none", padding: "4px 10px", border: "1.5px solid #e5e7eb", borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0 }}>Profil</a>
          </div>
          )
        })() : status === "unauthenticated" ? (
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

      {/* Barre filtres + carte affichée aussi en tablette (iPad portrait trop étroit
          pour sidebar 200 + liste 360 + carte simultanées) */}
      {isSmall && (
        <div style={{ display: "flex", gap: 8, padding: "0 16px 10px", flexShrink: 0 }}>
          <button onClick={() => setShowFilters(!showFilters)}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 14px", background: showFilters ? "#111" : "white", color: showFilters ? "white" : "#374151", border: "1.5px solid #e5e7eb", borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            Filtres
          </button>
          <button onClick={() => setShowMap(!showMap)}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 14px", background: showMap ? "#111" : "white", color: showMap ? "white" : "#374151", border: "1.5px solid #e5e7eb", borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            Carte
          </button>
        </div>
      )}

      {/* Corps principal — stack vertical en mobile/tablette, horizontal desktop */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", padding: isMobile ? "0 16px 16px" : "0 12px 12px 24px", gap: 12, flexDirection: isSmall ? "column" : "row" }}>

        {/* Sidebar filtres — masquée en mobile/tablette sauf toggle on */}
        <div style={{ width: isSmall ? "100%" : 200, flexShrink: 0, overflowY: "auto", display: isSmall && !showFilters ? "none" : "block", maxHeight: isSmall ? 300 : undefined }}>
          <div style={{ background: "white", borderRadius: 18, padding: 18 }}>
            <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 14, color: "#111" }}>Affiner</p>

            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Ville</p>
              <CityAutocomplete
                value={activeVille || ""}
                onChange={v => {
                  // Met à jour l'URL → active la recherche sur cette ville
                  const sp = new URLSearchParams(searchParams?.toString() || "")
                  if (v.trim()) sp.set("ville", v.trim())
                  else sp.delete("ville")
                  // Reset la zone carte pour voir la nouvelle ville
                  setMapBounds(null)
                  const qs = sp.toString()
                  router.replace(qs ? `/annonces?${qs}` : "/annonces", { scroll: false })
                }}
                placeholder="Ville ou code postal"
                style={{ fontSize: 12, padding: "8px 12px" }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Rechercher</p>
              <input
                value={motCle}
                onChange={e => setMotCle(e.target.value)}
                placeholder="Mot-clé, quartier..."
                style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 12, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
              />
            </div>

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

            {/* Surface m² */}
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Surface (m²)</p>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="number" min={0} placeholder="Min" value={surfaceMin} onChange={e => setSurfaceMin(e.target.value)}
                  style={{ width: "50%", padding: "7px 10px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                <input type="number" min={0} placeholder="Max" value={surfaceMax} onChange={e => setSurfaceMax(e.target.value)}
                  style={{ width: "50%", padding: "7px 10px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
            </div>

            {/* Nombre de pièces minimum */}
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Pièces minimum</p>
              <div style={{ display: "flex", gap: 6 }}>
                {[0, 1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setPiecesMin(n)}
                    style={{
                      flex: 1,
                      padding: "7px 0",
                      background: piecesMin === n ? "#111" : "white",
                      color: piecesMin === n ? "white" : "#374151",
                      border: `1.5px solid ${piecesMin === n ? "#111" : "#e5e7eb"}`,
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: piecesMin === n ? 800 : 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {n === 0 ? "Tous" : `${n}+`}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>Options</p>
              {[
                { label: "Dispo immédiate", val: dispoImmediate, set: setDispoImmediate },
                { label: "Parking", val: filtreParking, set: setFiltreParking },
                { label: "Extérieur", val: filtreExterieur, set: setFiltreExterieur },
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
        <div style={{ width: isSmall ? "100%" : 360, flex: isSmall && !showMap ? 1 : undefined, flexShrink: 0, overflowY: "auto", display: isSmall && showMap ? "none" : "flex", flexDirection: "column", gap: 0 }}>
          {/* Recherches sauvegardées (locataire) */}
          {!isProprietaire && session?.user?.email && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10, flexWrap: "wrap", position: "relative" }}>
              <button
                type="button"
                onClick={sauverRecherche}
                title="Sauvegarder ces filtres"
                style={{ background: "white", color: "#111", border: "1.5px solid #e5e7eb", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                Sauvegarder
              </button>
              {savedSearches.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowSaved(v => !v)}
                    style={{ background: showSaved ? "#111" : "white", color: showSaved ? "white" : "#111", border: `1.5px solid ${showSaved ? "#111" : "#e5e7eb"}`, borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    Mes recherches ({savedSearches.length})
                  </button>
                  {showSaved && (
                    <>
                      <div onClick={() => setShowSaved(false)} style={{ position: "fixed", inset: 0, zIndex: 990 }} />
                      <div style={{ position: "absolute", top: 36, left: 0, background: "white", border: "1px solid #e5e7eb", borderRadius: 14, boxShadow: "0 8px 28px rgba(0,0,0,0.12)", zIndex: 991, minWidth: 280, maxWidth: 340, padding: 6 }}>
                        {savedSearches.map(s => (
                          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8 }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                            <button type="button" onClick={() => appliquerRecherche(s)}
                              style={{ flex: 1, background: "none", border: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
                              <p style={{ fontSize: 13, fontWeight: 700, color: "#111", margin: 0 }}>{s.name}</p>
                              <p style={{ fontSize: 11, color: "#9ca3af", margin: "2px 0 0" }}>
                                Sauvegardé {new Date(s.savedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                              </p>
                            </button>
                            <button type="button" onClick={() => supprimerRecherche(s.id)}
                              aria-label="Supprimer"
                              style={{ background: "none", border: "none", color: "#dc2626", fontSize: 14, cursor: "pointer", padding: 4, fontFamily: "inherit" }}>
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Chips filtres rapides + indicateurs "issus du profil" */}
          {!isProprietaire && (() => {
            // Détection divergence vs snapshot profil (budget, meuble, parking, exterieur, dpe, animaux)
            const divergesBudget = profilSnapshot && profilSnapshot.budget !== budgetMaxFiltre
            const divergesMeuble = profilSnapshot && profilSnapshot.meuble !== filtreMeuble
            const divergesParking = profilSnapshot && profilSnapshot.parking !== filtreParking
            const divergesExterieur = profilSnapshot && profilSnapshot.exterieur !== filtreExterieur
            const divergesDpe = profilSnapshot && profilSnapshot.dpe !== filtreDpeMax
            const divergesAnimaux = animauxOverride // override local = divergence
            const anyDiverge = divergesBudget || divergesMeuble || divergesParking || divergesExterieur || divergesDpe || divergesAnimaux
            const fromProfil = (isFromProfil: boolean | null | undefined) =>
              isFromProfil ? (
                <span title="Issu de votre profil" style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b", display: "inline-block", marginLeft: 4 }} />
              ) : null

            const resync = () => {
              if (!profilSnapshot) return
              setBudgetMaxFiltre(profilSnapshot.budget)
              setFiltreMeuble(profilSnapshot.meuble)
              setFiltreParking(profilSnapshot.parking)
              setFiltreExterieur(profilSnapshot.exterieur)
              setFiltreDpeMax(profilSnapshot.dpe)
              setAnimauxOverride(false)
            }

            return (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
                {/* Budget perso : valeur exacte du profil, pas chip fixe */}
                {budgetMaxFiltre !== null && (
                  <button
                    type="button"
                    onClick={() => setBudgetMaxFiltre(null)}
                    title="Cliquez pour retirer ce filtre"
                    style={{ background: "#111", color: "white", border: "1.5px solid #111", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center" }}>
                    Budget ≤ {budgetMaxFiltre.toLocaleString("fr-FR")} €
                    {!divergesBudget && profilSnapshot?.budget === budgetMaxFiltre && fromProfil(true)}
                    <span style={{ marginLeft: 6, opacity: 0.7 }}>✕</span>
                  </button>
                )}
                {/* Pas de budget pré-rempli : proposer 3 seuils rapides */}
                {budgetMaxFiltre === null && (
                  <>
                    {[800, 1000, 1500, 2000].map(v => (
                      <button key={v} type="button" onClick={() => setBudgetMaxFiltre(v)}
                        style={{ background: "white", color: "#374151", border: "1.5px solid #e5e7eb", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                        ≤ {v.toLocaleString("fr-FR")} €
                      </button>
                    ))}
                  </>
                )}

                {[
                  { label: "Meublé", active: filtreMeuble, toggle: () => setFiltreMeuble(v => !v), fromP: profilSnapshot?.meuble && filtreMeuble },
                  { label: "Parking", active: filtreParking, toggle: () => setFiltreParking(v => !v), fromP: profilSnapshot?.parking && filtreParking },
                  { label: "Extérieur", active: filtreExterieur, toggle: () => setFiltreExterieur(v => !v), fromP: profilSnapshot?.exterieur && filtreExterieur },
                  { label: "Dispo maintenant", active: dispoImmediate, toggle: () => setDispoImmediate(v => !v), fromP: false },
                ].map(chip => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={chip.toggle}
                    style={{ background: chip.active ? "#111" : "white", color: chip.active ? "white" : "#374151", border: `1.5px solid ${chip.active ? "#111" : "#e5e7eb"}`, borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center" }}>
                    {chip.label}
                    {fromProfil(chip.fromP)}
                  </button>
                ))}

                {/* HARD LOCK animaux avec override session : bouton cadenas informatif
                   + bouton secondaire pour voir aussi les autres annonces sans toucher au profil. */}
                {filtreAnimauxLock && !animauxOverride && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <a
                      href="/profil"
                      title="Vous avez des animaux dans votre profil — les annonces qui ne les acceptent pas sont masquées."
                      style={{ background: "#fef3c7", color: "#92400e", border: "1.5px solid #fde68a", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      🔒 Animaux OK (profil)
                    </a>
                    <button
                      type="button"
                      onClick={() => setAnimauxOverride(true)}
                      title="Voir aussi les annonces qui n'acceptent pas les animaux (session uniquement, votre profil reste inchangé)"
                      style={{ background: "white", color: "#92400e", border: "1.5px solid #fde68a", borderRadius: 999, padding: "5px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                      Voir toutes
                    </button>
                  </span>
                )}
                {filtreAnimauxLock && animauxOverride && (
                  <button
                    type="button"
                    onClick={() => setAnimauxOverride(false)}
                    title="Réactiver le filtre animaux"
                    style={{ background: "white", color: "#92400e", border: "1.5px dashed #fde68a", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                    🔓 Animaux désactivé — réactiver
                  </button>
                )}

                {/* Bouton Resync visible si au moins un filtre diverge du profil */}
                {profilSnapshot && anyDiverge && (
                  <button
                    type="button"
                    onClick={resync}
                    title="Remettre les filtres aux valeurs de votre profil"
                    style={{ background: "white", color: "#1d4ed8", border: "1.5px solid #bfdbfe", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                    Resynchroniser profil
                  </button>
                )}

                {/* Lien discret vers /profil pour modifier son budget */}
                {profilSnapshot?.budget && budgetMaxFiltre === profilSnapshot.budget && (
                  <a href="/profil" style={{ fontSize: 11, color: "#6b7280", textDecoration: "underline", marginLeft: 4 }}>
                    Modifier mon budget
                  </a>
                )}
              </div>
            )
          })()}

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
                        aria-label={favoris.includes(a.id) ? "Retirer des favoris" : "Ajouter aux favoris"}
                        style={{ position: "absolute", top: 10, right: 10, zIndex: 4, background: "white", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.15)", transition: "transform 0.15s" }}
                        onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.15)")}
                        onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill={favoris.includes(a.id) ? "#dc2626" : "none"} stroke={favoris.includes(a.id) ? "#dc2626" : "#6b7280"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                        </svg>
                      </button>
                    </div>

                    {/* Infos */}
                    <div style={{ padding: "12px 14px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 3 }}>
                        <p style={{ fontWeight: 700, fontSize: 14, flex: 1, marginRight: 8, lineHeight: 1.3 }}>{motCle.trim() ? highlightMatch(a.titre || "", motCle) : a.titre}</p>
                        {info && (
                          <span style={{ background: info.bg, color: info.color, padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>
                            {Math.round(score / 10)}%
                          </span>
                        )}
                        {isOwn && (
                          <span style={{ background: "#f3f4f6", color: "#374151", padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>Votre bien</span>
                        )}
                      </div>
                      <p style={{ color: "#9ca3af", fontSize: 12, marginBottom: 8 }}>{motCle.trim() ? highlightMatch(a.ville || "", motCle) : a.ville}</p>
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
        <div style={{ flex: 1, position: "relative", isolation: "isolate", borderRadius: isMobile ? 0 : 18, overflow: "hidden", display: isSmall && !showMap ? "none" : "block" }}>
          <MapAnnonces
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
