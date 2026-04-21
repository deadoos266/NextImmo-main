"use client"
import { useEffect, useState, useCallback, type ComponentType } from "react"
import { useRouter } from "next/navigation"
import type { MapAnnoncesProps } from "../components/MapAnnonces"
import { supabase } from "../../lib/supabase"
import { calculerScore, estExclu, labelScore } from "../../lib/matching"
import { useSession } from "next-auth/react"
import { useRole } from "../providers"
import { getCityCoords, normalizeCityKey } from "../../lib/cityCoords"
import { geocodeCity } from "../../lib/geocoding"
import { getFavoris, toggleFavori } from "../../lib/favoris"
import { calculerCompletudeProfil } from "../../lib/profilCompleteness"
import { useResponsive } from "../hooks/useResponsive"
import EmptyState from "../components/ui/EmptyState"
import AnnonceSkeleton from "../components/ui/AnnonceSkeleton"
import FiltersBar from "../components/annonces/FiltersBar"
import FiltersModal from "../components/annonces/FiltersModal"
import ListingCardSearch from "../components/annonces/ListingCardSearch"
import SavedSearchesPopover from "../components/annonces/SavedSearchesPopover"
import BandeauDossier from "../components/annonces/BandeauDossier"

// IMPORTANT : pas de `dynamic(..., { ssr: false })` au niveau module.
// Ça émet `<template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING">` au SSR,
// que React attrape à l'hydratation et lève comme minified error #418
// (hydration mismatch). À la place, on charge MapAnnonces via un
// `import()` runtime dans un useEffect post-mount (voir useLazyMap ci-dessous).
// MapAnnonces dépend de Leaflet qui accède à window → pas importable au SSR.
function useLazyMap() {
  const [Comp, setComp] = useState<ComponentType<MapAnnoncesProps> | null>(null)
  useEffect(() => {
    let alive = true
    import("../components/MapAnnonces").then((mod) => {
      if (alive) setComp(() => mod.default)
    })
    return () => { alive = false }
  }, [])
  return Comp
}

/**
 * Hook léger : mesure la largeur du viewport pour décider du layout.
 * - ratio 35/65 Liste/Carte, fallback variant grid si colonne liste < 380px
 * - < 1024 : stack vertical mobile/tablette (géré par useResponsive)
 *
 * SSR safe : la valeur initiale est 1440 pour éviter tout mismatch.
 */
function useViewportWidth() {
  const [w, setW] = useState(1440)
  useEffect(() => {
    function onResize() { setW(window.innerWidth) }
    setW(window.innerWidth)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])
  return w
}

/**
 * Tri-state bool pour filtres : retourne true UNIQUEMENT si la valeur est
 * explicitement fausse (false, 0, "false", "f", "0"). null/undefined =
 * information absente = neutre (ne doit PAS faire exclure l'annonce du
 * résultat). Aligné avec `toBool()` de lib/matching.ts.
 */
function isFalse(v: unknown): boolean {
  return v === false || v === 0 || v === "false" || v === "f" || v === "0"
}

/**
 * Migration du filtre meublé :
 *   - Legacy : `boolean` → true = "je veux meublé", false = "indifférent"
 *     (l'ancien code n'avait pas de "je veux du vide")
 *   - Nouveau : "oui" | "non" | null (null = indifférent)
 * Utilisé pour désérialiser les savedSearches stockés en localStorage avant
 * l'intro du tri-state. Empêche tout crash au chargement d'une ancienne
 * recherche sauvegardée.
 */
function migrateMeubleFilter(v: unknown): "oui" | "non" | null {
  if (v === true) return "oui"
  if (v === false) return null
  if (v === "oui" || v === "non") return v
  return null
}

type SP = Record<string, string | string[] | undefined>

// Helper pour extraire une valeur string d'un param qui peut être
// string | string[] | undefined (API Next 15 searchParams).
function spGet(sp: SP | undefined, key: string): string {
  const v = sp?.[key]
  if (Array.isArray(v)) return v[0] ?? ""
  return v ?? ""
}

// ═══════════════════════════════════════════════════════════════════════
// Types internes
// ═══════════════════════════════════════════════════════════════════════

type TriKey = "match" | "prix_asc" | "prix_desc" | "alpha" | "recent"
type ViewMode = "list" | "grid"
type MeubleTri = "oui" | "non" | null
type AnimauxChip = "oui" | "non" | null

interface SavedSearch {
  id: string
  name: string
  ville: string
  budgetMax: number | null
  surfaceMin: string
  surfaceMax: string
  piecesMin: number
  // Legacy (boolean) ou new (tri-state). migrateMeubleFilter() au chargement.
  meuble: MeubleTri | boolean
  parking: boolean
  // Legacy : exterieur aggregé. Si true au chargement, on active les 3.
  exterieur?: boolean
  balcon?: boolean
  terrasse?: boolean
  jardin?: boolean
  cave?: boolean
  fibre?: boolean
  ascenseur?: boolean
  dispo: boolean
  dpe?: string
  scoreMin?: number
  motCle?: string
  savedAt: string
}

// ═══════════════════════════════════════════════════════════════════════
// Constantes layout (centralisées pour le scroll isolé)
// ═══════════════════════════════════════════════════════════════════════
const NAVBAR_HEIGHT = 72
const FILTERS_BAR_HEIGHT = 64
// Largeur max mode Grille (SeLoger-like : mise en page magazine centrée)
const CONTAINER_MAX_WIDTH = 1440
// Mode Liste+Carte : la colonne liste prend ~35% du viewport (65% carte).
// Si cette largeur tombe sous 380px → fallback variant="grid" car l'anatomie
// compact SeLoger (prix + specs + titre + ville) devient illisible.
const LIST_COLUMN_RATIO = 0.35
const COMPACT_LIST_MIN_COL = 380

// ═══════════════════════════════════════════════════════════════════════
// Entry — délégation server→client sans Suspense (prop initialSearchParams)
// ═══════════════════════════════════════════════════════════════════════

export default function AnnoncesClient({
  initialSearchParams,
}: { initialSearchParams?: SP } = {}) {
  return <AnnoncesContent initialSearchParams={initialSearchParams} />
}

function AnnoncesContent({ initialSearchParams }: { initialSearchParams?: SP }) {
  const router = useRouter()
  const MapComp = useLazyMap()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const viewportW = useViewportWidth()

  const [annonces, setAnnonces] = useState<any[]>([])
  const [profil, setProfil] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // ── Tri + vue
  const [tri, setTri] = useState<TriKey>("match")
  const [view, setView] = useState<ViewMode>("list")

  // ── Filtres : numériques
  const [scoreMin, setScoreMin] = useState(0)
  const [budgetMaxFiltre, setBudgetMaxFiltre] = useState<number | null>(null)
  const [surfaceMin, setSurfaceMin] = useState("")
  const [surfaceMax, setSurfaceMax] = useState("")
  const [piecesMin, setPiecesMin] = useState(0)
  const [filtreDpeMax, setFiltreDpeMax] = useState("")

  // ── Filtres : tri-state
  const [filtreMeubleTri, setFiltreMeubleTri] = useState<MeubleTri>(null)
  const [filtreAnimauxChip, setFiltreAnimauxChip] = useState<AnimauxChip>(null)

  // ── Filtres : booléens équipements
  const [dispoImmediate, setDispoImmediate] = useState(false)
  const [filtreParking, setFiltreParking] = useState(false)
  const [filtreBalcon, setFiltreBalcon] = useState(false)
  const [filtreTerrasse, setFiltreTerrasse] = useState(false)
  const [filtreJardin, setFiltreJardin] = useState(false)
  const [filtreCave, setFiltreCave] = useState(false)
  const [filtreFibre, setFiltreFibre] = useState(false)
  const [filtreAscenseur, setFiltreAscenseur] = useState(false)

  // ── Hard-lock animaux (profil.animaux=true) + override session
  const [filtreAnimauxLock, setFiltreAnimauxLock] = useState(false)
  const [animauxOverride, setAnimauxOverride] = useState(false)

  // ── Autre state
  const [mapBounds, setMapBounds] = useState<any>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [favoris, setFavoris] = useState<number[]>([])
  const [geocoded, setGeocoded] = useState<Record<string, [number, number]>>({})
  const [motCle, setMotCle] = useState("")
  const [showMap, setShowMap] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  // ── Recherches sauvegardées
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])

  const { data: session, status } = useSession()
  const { role } = useRole()
  const isProprietaire = role === "proprietaire"
  const { isMobile, isTablet } = useResponsive()
  const isSmall = isMobile || isTablet

  // ── URL-derived filters (voir commentaire historique React #418 fix)
  const urlVille = spGet(initialSearchParams, "ville")
  const urlBudget = parseInt(spGet(initialSearchParams, "budget_max") || "0") || 0
  const urlType = spGet(initialSearchParams, "type")
  const urlSurfaceMin = spGet(initialSearchParams, "surface_min")
  const urlSurfaceMax = spGet(initialSearchParams, "surface_max")
  const urlPiecesMin = parseInt(spGet(initialSearchParams, "pieces_min") || "0") || 0
  const urlMotCle = spGet(initialSearchParams, "q")

  const activeVille = urlVille
  const activeBudget = urlBudget
  const activeType = urlType

  // Sync local state ↔ URL lorsque les params changent (navigation)
  useEffect(() => {
    if (urlSurfaceMin !== surfaceMin) setSurfaceMin(urlSurfaceMin)
    if (urlSurfaceMax !== surfaceMax) setSurfaceMax(urlSurfaceMax)
    if (urlPiecesMin !== piecesMin) setPiecesMin(urlPiecesMin)
    if (urlMotCle !== motCle) setMotCle(urlMotCle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSurfaceMin, urlSurfaceMax, urlPiecesMin, urlMotCle])

  // ── Persist view en localStorage (clé km_annonces_view)
  useEffect(() => {
    try {
      const v = localStorage.getItem("km_annonces_view")
      if (v === "list" || v === "grid") setView(v)
    } catch { /* noop */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem("km_annonces_view", view) } catch { /* noop */ }
  }, [view])

  // Favoris hydrate
  useEffect(() => { setFavoris(getFavoris()) }, [])

  // Recherches sauvegardées hydrate (migration meuble boolean → tri-state)
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

  // Nom auto-proposé dans le SavedSearchesPopover (résumé des filtres)
  function buildDefaultSearchName(): string {
    const parts: string[] = []
    if (activeVille) parts.push(activeVille)
    if (budgetMaxFiltre) parts.push(`≤ ${budgetMaxFiltre} €`)
    else if (activeBudget) parts.push(`≤ ${activeBudget} €`)
    if (piecesMin) parts.push(`${piecesMin}+ pièces`)
    if (filtreMeubleTri === "oui") parts.push("Meublé")
    if (filtreMeubleTri === "non") parts.push("Vide")
    if (filtreParking) parts.push("Parking")
    return parts.length > 0 ? parts.join(" · ") : "Toutes les annonces"
  }

  function sauverRecherche(name: string) {
    const search: SavedSearch = {
      id: Date.now().toString(36),
      name: name.trim().slice(0, 60),
      ville: activeVille || "",
      budgetMax: budgetMaxFiltre ?? activeBudget ?? null,
      surfaceMin,
      surfaceMax,
      piecesMin,
      meuble: filtreMeubleTri,
      parking: filtreParking,
      balcon: filtreBalcon,
      terrasse: filtreTerrasse,
      jardin: filtreJardin,
      cave: filtreCave,
      fibre: filtreFibre,
      ascenseur: filtreAscenseur,
      dispo: dispoImmediate,
      dpe: filtreDpeMax,
      scoreMin,
      motCle,
      savedAt: new Date().toISOString(),
    }
    const next = [search, ...savedSearches].slice(0, 10)
    setSavedSearches(next)
    persistSavedSearches(next)
  }

  function appliquerRecherche(id: string) {
    const s = savedSearches.find(x => x.id === id)
    if (!s) return
    setBudgetMaxFiltre(s.budgetMax ?? null)
    setSurfaceMin(s.surfaceMin)
    setSurfaceMax(s.surfaceMax)
    setPiecesMin(s.piecesMin)

    // Migration meuble boolean legacy → tri-state nouveau
    setFiltreMeubleTri(migrateMeubleFilter(s.meuble))

    setFiltreParking(!!s.parking)
    // Migration exterieur agrégé → 3 filtres séparés
    if (s.exterieur) {
      setFiltreBalcon(true)
      setFiltreTerrasse(true)
      setFiltreJardin(true)
    } else {
      setFiltreBalcon(!!s.balcon)
      setFiltreTerrasse(!!s.terrasse)
      setFiltreJardin(!!s.jardin)
    }
    setFiltreCave(!!s.cave)
    setFiltreFibre(!!s.fibre)
    setFiltreAscenseur(!!s.ascenseur)
    setDispoImmediate(!!s.dispo)
    setFiltreDpeMax(s.dpe || "")
    setScoreMin(typeof s.scoreMin === "number" ? s.scoreMin : 0)
    setMotCle(s.motCle || "")

    // La ville passe par l'URL car activeVille est dérivé d'urlVille
    const params = new URLSearchParams()
    if (s.ville) params.set("ville", s.ville)
    if (s.budgetMax) params.set("budget_max", String(s.budgetMax))
    if (s.surfaceMin) params.set("surface_min", s.surfaceMin)
    if (s.surfaceMax) params.set("surface_max", s.surfaceMax)
    if (s.piecesMin) params.set("pieces_min", String(s.piecesMin))
    const qs = params.toString()
    router.replace(qs ? `/annonces?${qs}` : "/annonces")
  }

  function supprimerRecherche(id: string) {
    const next = savedSearches.filter(s => s.id !== id)
    setSavedSearches(next)
    persistSavedSearches(next)
  }

  // ── Fetch annonces + profil
  useEffect(() => {
    async function fetchData() {
      const { data: a } = await supabase
        .from("annonces")
        .select("*")
        .or("statut.is.null,statut.neq.loué")
      if (a) setAnnonces(a)
      if (session?.user?.email) {
        const { data: p } = await supabase.from("profils").select("*").eq("email", session.user.email).single()
        if (p) {
          setProfil(p)
          if (!isProprietaire) {
            if (p.surface_min && !surfaceMin) setSurfaceMin(String(p.surface_min))
            if (p.surface_max && !surfaceMax) setSurfaceMax(String(p.surface_max))
            if (p.pieces_min && piecesMin === 0) setPiecesMin(Number(p.pieces_min))
            if (p.parking && !filtreParking) setFiltreParking(true)
            if (p.balcon && !filtreBalcon) setFiltreBalcon(true)
            if (p.terrasse && !filtreTerrasse) setFiltreTerrasse(true)
            if (p.jardin && !filtreJardin) setFiltreJardin(true)
            if (p.meuble && filtreMeubleTri === null) setFiltreMeubleTri("oui")
            if (p.budget_max && budgetMaxFiltre === null) setBudgetMaxFiltre(Number(p.budget_max))
            if (p.dpe_min && !filtreDpeMax) setFiltreDpeMax(String(p.dpe_min))
            if (p.animaux === true) setFiltreAnimauxLock(true)
          }
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
    if (userDriven) setMapBounds(bounds)
  }, [])

  // Normalisation ville identique à lib/geocoding (pour lookup dans `geocoded`)
  const normalizeVille = normalizeCityKey

  // ── Enrichissement coords
  const annoncesEnrichies = annonces
    .filter(a => !profil || !estExclu(a, profil))
    .map(a => {
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
      return { ...a, scoreMatching: profil ? calculerScore(a, profil) : null, _lat: lat, _lng: lng }
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

  // ── Filtre global (sans mapBounds) — partagé avec les markers carte
  const annoncesForMap = annoncesEnrichies.filter(a => {
    // Ville : match accent-insensible + code postal dept fallback (75/69/13)
    if (activeVille) {
      const q = activeVille.trim()
      const isCP = /^\d{5}$/.test(q)
      if (isCP) {
        const depart = q.slice(0, 2)
        const fallbackVille =
          depart === "75" ? "paris" :
          depart === "69" ? "lyon" :
          depart === "13" ? "marseille" : null
        if (!fallbackVille) return false
        const villeNorm = normalizeCityKey(a.ville || "")
        if (!villeNorm.includes(fallbackVille)) return false
      } else {
        const vA = normalizeCityKey(a.ville || "")
        const vF = normalizeCityKey(q)
        if (!vA || !vF) return false
        if (!vA.includes(vF) && !vF.includes(vA)) return false
      }
    }
    if (activeBudget && a.prix && a.prix > activeBudget * 1.20) return false
    if (activeType && a.type_bien) {
      if (!a.type_bien.toLowerCase().includes(activeType.toLowerCase())) return false
    }
    if (!isProprietaire && scoreMin > 0 && a.scoreMatching !== null && Math.round(a.scoreMatching / 10) < scoreMin) return false

    if (dispoImmediate && a.dispo !== "Disponible maintenant") return false

    // Équipements booléens — null = neutre (cf commit b79fba2)
    if (filtreParking   && isFalse(a.parking))    return false
    if (filtreBalcon    && isFalse(a.balcon))     return false
    if (filtreTerrasse  && isFalse(a.terrasse))   return false
    if (filtreJardin    && isFalse(a.jardin))     return false
    if (filtreCave      && isFalse(a.cave))       return false
    if (filtreFibre     && isFalse(a.fibre))      return false
    if (filtreAscenseur && isFalse(a.ascenseur))  return false

    // Meublé tri-state : "oui" exige meublé, "non" exige non-meublé, null = indifférent
    if (filtreMeubleTri === "oui" && isFalse(a.meuble)) return false
    if (filtreMeubleTri === "non" && a.meuble === true) return false

    if (budgetMaxFiltre && a.prix && a.prix > budgetMaxFiltre) return false

    // Animaux tri-state + hard-lock profil
    if (filtreAnimauxChip === "oui" && a.animaux !== true) return false
    if (filtreAnimauxChip === "non" && a.animaux === true) return false
    if (filtreAnimauxChip === null && filtreAnimauxLock && !animauxOverride && isFalse(a.animaux)) return false

    // DPE : A est meilleur que G. On filtre si dpe > filtreDpeMax.
    if (filtreDpeMax && a.dpe && a.dpe.localeCompare(filtreDpeMax) > 0) return false

    // Surface min/max (m²) — null = info absente = neutre (pas d'exclusion)
    const surfMinN = surfaceMin ? parseInt(surfaceMin, 10) : 0
    const surfMaxN = surfaceMax ? parseInt(surfaceMax, 10) : 0
    if (surfMinN > 0 && a.surface != null && a.surface < surfMinN) return false
    if (surfMaxN > 0 && a.surface != null && a.surface > surfMaxN) return false

    // Pièces min — null = neutre
    if (piecesMin > 0 && a.pieces != null && a.pieces < piecesMin) return false

    // Recherche full-text : titre + description + ville + adresse
    if (motCle.trim()) {
      const q = motCle.toLowerCase().trim()
      const haystack = `${a.titre || ""} ${a.description || ""} ${a.ville || ""} ${a.adresse || ""}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

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
      if (tri === "alpha") return (a.titre || "").localeCompare(b.titre || "", "fr", { sensitivity: "base" })
      if (tri === "recent") {
        const dA = a.created_at ? new Date(a.created_at).getTime() : 0
        const dB = b.created_at ? new Date(b.created_at).getTime() : 0
        return dB - dA
      }
      return 0
    })

  // Coordonnees de centrage de la carte : ville URL > ville profil > aucune
  const centerCity = activeVille
    ? (getCityCoords(activeVille) ?? geocoded[normalizeVille(activeVille)] ?? null)
    : null

  // Déclenche un geocoding background pour la ville active
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

  // ── Callbacks filtres rapides FiltersBar
  const onChangeVille = useCallback((v: string) => {
    const sp = new URLSearchParams()
    for (const [k, val] of Object.entries(initialSearchParams || {})) {
      if (typeof val === "string") sp.set(k, val)
      else if (Array.isArray(val) && val[0]) sp.set(k, val[0])
    }
    if (v.trim()) sp.set("ville", v.trim())
    else sp.delete("ville")
    setMapBounds(null)
    const qs = sp.toString()
    router.replace(qs ? `/annonces?${qs}` : "/annonces", { scroll: false })
  }, [initialSearchParams, router])

  // ── Reset global
  function onResetAll() {
    setScoreMin(0)
    setBudgetMaxFiltre(null)
    setSurfaceMin("")
    setSurfaceMax("")
    setPiecesMin(0)
    setFiltreDpeMax("")
    setFiltreMeubleTri(null)
    setFiltreAnimauxChip(null)
    setDispoImmediate(false)
    setFiltreParking(false)
    setFiltreBalcon(false)
    setFiltreTerrasse(false)
    setFiltreJardin(false)
    setFiltreCave(false)
    setFiltreFibre(false)
    setFiltreAscenseur(false)
    setAnimauxOverride(false)
    setMotCle("")
    setMapBounds(null)
    // URL reset (ville + budget_max + type)
    router.replace("/annonces", { scroll: false })
  }

  // ── Count filtres actifs (tous confondus — badge sur bouton "Filtres")
  const activeFilterCount =
    (activeVille ? 1 : 0) +
    (budgetMaxFiltre ? 1 : 0) +
    (piecesMin > 0 ? 1 : 0) +
    (surfaceMin ? 1 : 0) +
    (surfaceMax ? 1 : 0) +
    (filtreMeubleTri !== null ? 1 : 0) +
    (scoreMin > 0 ? 1 : 0) +
    (dispoImmediate ? 1 : 0) +
    (filtreParking ? 1 : 0) +
    (filtreBalcon ? 1 : 0) +
    (filtreTerrasse ? 1 : 0) +
    (filtreJardin ? 1 : 0) +
    (filtreCave ? 1 : 0) +
    (filtreFibre ? 1 : 0) +
    (filtreAscenseur ? 1 : 0) +
    (filtreAnimauxChip !== null ? 1 : 0) +
    (animauxOverride ? 1 : 0) +
    (filtreDpeMax ? 1 : 0) +
    (motCle.trim() ? 1 : 0)

  const showMatchOption = !isProprietaire && profil !== null

  // ── Layout paddings latéraux (mobile 16, tablette 24, desktop 32)
  const padH = isMobile ? 16 : isTablet ? 24 : 32

  // ── Completude profil (pour bandeau incitatif)
  const completudeProfil =
    !isProprietaire && status === "authenticated" && profil
      ? calculerCompletudeProfil(profil).score
      : null
  const showBandeauDossier =
    completudeProfil !== null && completudeProfil < 80

  // ── Card variant auto selon largeur viewport (mode Liste desktop)
  //   colonne liste = viewportW × 0.35
  //   si colonne ≥ 380px → cards verticales compactes (SeLoger-style)
  //   sinon (viewport < ~1086) → fallback variant="grid" (trop étroit)
  const listColumnWidth = viewportW * LIST_COLUMN_RATIO
  const listCardVariant: "compact" | "grid" =
    isSmall ? "grid" : listColumnWidth >= COMPACT_LIST_MIN_COL ? "compact" : "grid"

  // ═══════════════════════════════════════════════════════════════════════
  // Render — Scroll isolé :
  //   outer : overflow:auto + height calc(100vh - NAVBAR)
  //   ↳ header éditorial : scrolle avec la page (non sticky)
  //   ↳ bandeau dossier  : scrolle avec la page (non sticky)
  //   ↳ FiltersBar        : sticky top:0 (DANS l'outer scrollable)
  //   ↳ zone liste+carte  : height = calc(100vh - NAVBAR - FILTERS_BAR)
  //       ↳ liste  : overflow-y:auto (scroll interne)
  //       ↳ carte  : height:100% (reste fixe, jamais hors écran)
  //
  //   En mode grid : carte masquée, liste pleine largeur, grid 4 cols max,
  //                  scroll unifié (la grille scrolle avec la page).
  // ═══════════════════════════════════════════════════════════════════════

  // Hauteur zone liste+carte (desktop uniquement ; mobile = contenu fluide)
  const zoneLCHeight = `calc(100vh - ${NAVBAR_HEIGHT + FILTERS_BAR_HEIGHT}px)`
  const outerHeight = `calc(100vh - ${NAVBAR_HEIGHT}px)`

  // Mode grille : le scroll isolé est désactivé (toute la page scrolle)
  //   → carte masquée, grid max 4 cols centré, comportement "magazine".
  const gridMode = view === "grid"

  // ── Scroll isolé STRICT en mode Liste+Carte desktop ───────────────────
  //   body/html overflow:hidden pour que la zone liste+carte gère seule
  //   son scroll interne (évite double barre + pied de page parasite).
  //   En mode Grille ou mobile : scroll naturel du document.
  //   Cleanup au unmount ET sur changement de view → pas de fuite hors /annonces.
  useEffect(() => {
    if (gridMode || isSmall) return
    const prevBody = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    document.body.style.overflow = "hidden"
    document.documentElement.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prevBody
      document.documentElement.style.overflow = prevHtml
    }
  }, [gridMode, isSmall])

  // ── Container conditionnel — full-width en Liste+Carte, max-1440 en Grille
  //   Liste+Carte desktop : edge-to-edge (padding 16) pour donner un max
  //     d'espace à la carte (immersif SeLoger-style).
  //   Grille ou mobile    : max-width 1440 centré, padding padH normal.
  const useFullWidth = !gridMode && !isSmall
  const containerMaxWidth = useFullWidth ? "100%" : CONTAINER_MAX_WIDTH
  const containerMargin = useFullWidth ? "0" : "0 auto"
  const containerPadH = useFullWidth ? 16 : padH

  return (
    <div
      style={{
        background: "#F7F4EF",
        fontFamily: "'DM Sans', sans-serif",
        // Outer viewport pour scroll isolé (mode liste desktop)
        // En mode grid ou mobile : on laisse scroller naturellement.
        height: !gridMode && !isSmall ? outerHeight : undefined,
        minHeight: gridMode || isSmall ? outerHeight : undefined,
        overflowY: !gridMode && !isSmall ? "auto" : "visible",
      }}
    >
      {/* H1 SEO visible uniquement pour les crawlers */}
      <h1 style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}>
        {activeVille
          ? `Logements à louer à ${activeVille} — annonces entre particuliers`
          : "Logements à louer — annonces entre particuliers en France"}
      </h1>

      {/* Container principal : full-width en Liste+Carte, max-1440 en Grille */}
      <div style={{ maxWidth: containerMaxWidth, margin: containerMargin, paddingLeft: containerPadH, paddingRight: containerPadH }}>

        {/* ── Header éditorial — scroll normal (pas sticky) ────────────── */}
        {!isMobile && (
          <div style={{ padding: "24px 0 6px" }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "#666", textTransform: "uppercase", letterSpacing: "1.6px", margin: 0 }}>
              Annonces
            </p>
            <h2 style={{ fontSize: 40, fontWeight: 500, lineHeight: 1.08, margin: "6px 0 4px", color: "#111", letterSpacing: "-0.5px" }}>
              {loading
                ? (activeVille ? `Logements à ${activeVille}` : "Logements à louer")
                : `${annoncesTraitees.length} logement${annoncesTraitees.length > 1 ? "s" : ""} ${activeVille ? `à ${activeVille}` : "disponible" + (annoncesTraitees.length > 1 ? "s" : "")}`}
            </h2>
            <p style={{ fontSize: 13, color: "#666", margin: 0 }}>
              {isProprietaire
                ? "Mode propriétaire — tri chronologique"
                : "Mis à jour en direct · tri par compatibilité"}
            </p>

            {/* Lien de sauvegarde — popover attaché */}
            {!isProprietaire && session?.user?.email && (
              <div style={{ marginTop: 10 }}>
                <SavedSearchesPopover
                  savedSearches={savedSearches.map(s => ({ id: s.id, name: s.name, savedAt: s.savedAt }))}
                  onSave={sauverRecherche}
                  onApply={appliquerRecherche}
                  onDelete={supprimerRecherche}
                  defaultName={buildDefaultSearchName()}
                  label="Sauvegarder cette recherche"
                />
              </div>
            )}
          </div>
        )}

        {/* ── Bandeau dossier incitatif (card premium) ─────────────────── */}
        {showBandeauDossier && completudeProfil !== null && (
          <div style={{ padding: isMobile ? "10px 0" : "14px 0 6px" }}>
            <BandeauDossier completude={completudeProfil} isMobile={isMobile} />
          </div>
        )}

        {/* ── Bandeau statut compact (connexion / proprio) ─────────────── */}
        {(isProprietaire || status === "unauthenticated") && (
          <div style={{ padding: isMobile ? "10px 0" : "8px 0" }}>
            {isProprietaire ? (
              <div style={{ background: "white", borderRadius: 16, padding: isMobile ? "10px 14px" : "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #EAE6DF", gap: 10 }}>
                <span style={{ fontSize: isMobile ? 12 : 13, color: "#666" }}>
                  <strong style={{ color: "#111" }}>Mode propriétaire</strong>{!isMobile && " — scores de compatibilité non applicables"}
                </span>
                <a href="/proprietaire" style={{ fontSize: 12, fontWeight: 700, color: "#111", textDecoration: "none", padding: "5px 14px", border: "1px solid #EAE6DF", borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0 }}>Mes biens</a>
              </div>
            ) : (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 16, padding: isMobile ? "10px 14px" : "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: isMobile ? 12 : 13, fontWeight: 500, color: "#92400e" }}>
                  {isMobile ? "Connectez-vous pour le matching" : "Connectez-vous pour activer le score de compatibilité"}
                </span>
                <a href="/auth" style={{ background: "#111", color: "white", padding: "6px 16px", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>Connexion</a>
              </div>
            )}
          </div>
        )}

        {/* ── FiltersBar sticky — top dynamique selon mode scroll ─────
            Mode liste desktop : scroll isolé dans outer (overflow:auto),
              sticky top:0 → colle au top de l'outer (qui est sous Navbar).
            Mode grille / mobile : scroll document,
              sticky top:NAVBAR_HEIGHT → colle sous la Navbar du viewport. */}
        <FiltersBar
          isMobile={isMobile}
          isTablet={isTablet}
          activeVille={activeVille}
          onChangeVille={onChangeVille}
          budgetMaxFiltre={budgetMaxFiltre}
          setBudgetMaxFiltre={setBudgetMaxFiltre}
          scoreMin={scoreMin}
          setScoreMin={setScoreMin}
          showScoreMin={showMatchOption}
          onOpenModal={() => setModalOpen(true)}
          activeFilterCount={activeFilterCount}
          tri={tri}
          setTri={setTri}
          showMatchOption={showMatchOption}
          view={view}
          setView={setView}
          resultCount={annoncesTraitees.length}
          loading={loading}
          stickyTop={!gridMode && !isSmall ? 0 : NAVBAR_HEIGHT}
        />

        {/* ── Toggle Liste/Carte mobile+tablette ──────────────────────── */}
        {isSmall && !gridMode && (
          <div style={{ display: "flex", gap: 8, padding: "12px 0 0", flexShrink: 0 }}>
            <button onClick={() => setShowMap(false)}
              style={{ flex: 1, padding: "9px 14px", background: !showMap ? "#111" : "white", color: !showMap ? "white" : "#666", border: `1px solid ${!showMap ? "#111" : "#EAE6DF"}`, borderRadius: 999, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Liste
            </button>
            <button onClick={() => setShowMap(true)}
              style={{ flex: 1, padding: "9px 14px", background: showMap ? "#111" : "white", color: showMap ? "white" : "#666", border: `1px solid ${showMap ? "#111" : "#EAE6DF"}`, borderRadius: 999, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Carte
            </button>
          </div>
        )}

        {/* ═══ MODE GRILLE : carte masquée, grille max 4 cols centrée ═══ */}
        {gridMode ? (
          <div style={{ padding: isMobile ? "12px 0 24px" : "16px 0 32px" }}>
            {loading ? (
              <GridContainer>{[1, 2, 3, 4, 5, 6, 7, 8].map(i => <AnnonceSkeleton key={i} />)}</GridContainer>
            ) : annoncesTraitees.length === 0 ? (
              <EmptyState
                title="Aucun logement trouvé"
                description="Ajustez vos filtres pour voir plus de résultats."
                ctaLabel={activeFilterCount > 0 ? "Réinitialiser les filtres" : undefined}
                onCtaClick={activeFilterCount > 0 ? onResetAll : undefined}
              />
            ) : (
              <GridContainer>
                {annoncesTraitees.map(a => {
                  const score = a.scoreMatching
                  const info = !isProprietaire && score !== null ? labelScore(score) : null
                  const isOwn = isProprietaire && a.proprietaire_email === session?.user?.email
                  const isSelected = selectedId === a.id
                  return (
                    <ListingCardSearch
                      key={a.id}
                      annonce={a}
                      score={score}
                      info={info}
                      isOwn={isOwn}
                      isSelected={isSelected}
                      favori={favoris.includes(a.id)}
                      onToggleFavori={e => handleToggleFavori(e, a.id)}
                      onMouseEnter={() => setSelectedId(a.id)}
                      onMouseLeave={() => setSelectedId(null)}
                      motCle={motCle}
                      variant="grid"
                    />
                  )
                })}
              </GridContainer>
            )}
          </div>
        ) : (
          /* ═══ MODE LISTE : scroll isolé, ratio 27/73 ═══ */
          <div
            style={{
              display: "flex",
              gap: isSmall ? 0 : 16,
              padding: isMobile ? "12px 0 24px" : "16px 0 0",
              flexDirection: isSmall ? "column" : "row",
              alignItems: "flex-start",
              // Desktop : hauteur fixe = viewport - navbar - filtersbar
              // pour permettre le scroll isolé à l'intérieur.
              height: isSmall ? undefined : zoneLCHeight,
            }}
          >
            {/* ── Colonne Liste — 35% desktop, 100% mobile/tablet ──────── */}
            <div
              style={{
                flex: isSmall ? 1 : "0 0 calc(35% - 8px)",
                minWidth: 0,
                width: isSmall ? "100%" : undefined,
                display: isSmall && showMap ? "none" : "block",
                // Scroll interne uniquement sur desktop
                height: isSmall ? undefined : "100%",
                overflowY: isSmall ? "visible" : "auto",
                // Padding pour éviter que le scroll mange les bords des cards
                paddingRight: isSmall ? 0 : 4,
              }}
            >
              {loading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {[1, 2, 3, 4, 5].map(i => <AnnonceSkeleton key={i} />)}
                </div>
              ) : annoncesTraitees.length === 0 ? (
                <EmptyState
                  title="Aucun logement trouvé"
                  description={mapBounds ? "Essayez d'élargir la zone de recherche sur la carte." : "Ajustez vos filtres pour voir plus de résultats."}
                  ctaLabel={mapBounds ? "Élargir la zone" : activeFilterCount > 0 ? "Réinitialiser les filtres" : undefined}
                  onCtaClick={mapBounds ? () => setMapBounds(null) : activeFilterCount > 0 ? onResetAll : undefined}
                />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {annoncesTraitees.map(a => {
                    const score = a.scoreMatching
                    const info = !isProprietaire && score !== null ? labelScore(score) : null
                    const isOwn = isProprietaire && a.proprietaire_email === session?.user?.email
                    const isSelected = selectedId === a.id
                    return (
                      <ListingCardSearch
                        key={a.id}
                        annonce={a}
                        score={score}
                        info={info}
                        isOwn={isOwn}
                        isSelected={isSelected}
                        favori={favoris.includes(a.id)}
                        onToggleFavori={e => handleToggleFavori(e, a.id)}
                        onMouseEnter={() => setSelectedId(a.id)}
                        onMouseLeave={() => setSelectedId(null)}
                        motCle={motCle}
                        variant={listCardVariant}
                      />
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── Colonne Carte — 65% desktop, 100% si showMap mobile ──── */}
            {mounted && (
              <div
                style={{
                  flex: isSmall ? 1 : "0 0 calc(65% - 8px)",
                  width: isSmall ? "100%" : undefined,
                  display: isSmall && !showMap ? "none" : "block",
                  height: isSmall ? "calc(100vh - 200px)" : "100%",
                }}
              >
                {/* Wrap Leaflet — PROTOCOLE STRICT :
                    - position:relative + isolation:isolate + overflow:hidden
                    - Pas de z-index ni transform sur parent (stacking tiles intact)
                    - Radius 20 + border #EAE6DF (desktop uniquement) */}
                <div
                  style={{
                    position: "relative",
                    isolation: "isolate",
                    height: "100%",
                    width: "100%",
                    borderRadius: isMobile ? 0 : 20,
                    overflow: "hidden",
                    border: isMobile ? "none" : "1px solid #EAE6DF",
                  }}
                >
                  {MapComp ? (
                    <MapComp
                      annonces={annoncesTraitees}
                      selectedId={selectedId}
                      onSelect={id => setSelectedId(id)}
                      onBoundsChange={handleBoundsChange}
                      centerHint={centerCity ? [centerCity[0], centerCity[1]] : null}
                    />
                  ) : null}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modal filtres ─────────────────────────────────────────────── */}
      <FiltersModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        resultCount={annoncesTraitees.length}
        motCle={motCle}
        setMotCle={setMotCle}
        activeVille={activeVille}
        onChangeVille={onChangeVille}
        budgetMaxFiltre={budgetMaxFiltre}
        setBudgetMaxFiltre={setBudgetMaxFiltre}
        piecesMin={piecesMin}
        setPiecesMin={setPiecesMin}
        surfaceMin={surfaceMin}
        setSurfaceMin={setSurfaceMin}
        surfaceMax={surfaceMax}
        setSurfaceMax={setSurfaceMax}
        filtreMeubleTri={filtreMeubleTri}
        setFiltreMeubleTri={setFiltreMeubleTri}
        showScoreMin={showMatchOption}
        scoreMin={scoreMin}
        setScoreMin={setScoreMin}
        filtreParking={filtreParking}
        setFiltreParking={setFiltreParking}
        filtreBalcon={filtreBalcon}
        setFiltreBalcon={setFiltreBalcon}
        filtreTerrasse={filtreTerrasse}
        setFiltreTerrasse={setFiltreTerrasse}
        filtreJardin={filtreJardin}
        setFiltreJardin={setFiltreJardin}
        filtreCave={filtreCave}
        setFiltreCave={setFiltreCave}
        filtreFibre={filtreFibre}
        setFiltreFibre={setFiltreFibre}
        filtreAscenseur={filtreAscenseur}
        setFiltreAscenseur={setFiltreAscenseur}
        dispoImmediate={dispoImmediate}
        setDispoImmediate={setDispoImmediate}
        filtreAnimauxChip={filtreAnimauxChip}
        setFiltreAnimauxChip={setFiltreAnimauxChip}
        filtreAnimauxLock={filtreAnimauxLock}
        animauxOverride={animauxOverride}
        setAnimauxOverride={setAnimauxOverride}
        filtreDpeMax={filtreDpeMax}
        setFiltreDpeMax={setFiltreDpeMax}
        onResetAll={onResetAll}
        isMobile={isMobile}
      />
    </div>
  )
}

/**
 * Container de la vue Grille.
 *  - grid `auto-fill` 280px FIXE (pas `auto-fit` qui stretcherait).
 *    Cards gardent taille constante quel que soit le nombre d'annonces :
 *    2 cards = 2×280 centré, 8 cards = 4×280 par rangée centré.
 *  - `justify-content: center` pour centrer dans le container parent.
 *  - Max 4 cols à 1440 (4 × 280 + 3 × 20 gap = 1180 → tient largement).
 *  - Responsive : 4 cols ≥1200, 3 cols 900-1199, 2 cols 600-899, 1 col <600.
 */
function GridContainer({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, 280px)",
        justifyContent: "center",
        gap: 20,
        width: "100%",
        margin: "0 auto",
      }}
    >
      {children}
    </div>
  )
}
