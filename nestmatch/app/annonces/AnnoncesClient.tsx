"use client"
import { useEffect, useState, useCallback, useRef, type ComponentType } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import type { MapAnnoncesProps } from "../components/MapAnnonces"
import { supabase } from "../../lib/supabase"
import { calculerScore, estExclu, labelScore } from "../../lib/matching"
import { calcRangsGlobal, shouldShowRank } from "../../lib/rangs"
import { useSession } from "next-auth/react"
import { useRole } from "../providers"
import { getCityCoords, normalizeCityKey, findNearbyCities } from "../../lib/cityCoords"
import { geocodeCity } from "../../lib/geocoding"
import { getFavoris, toggleFavori } from "../../lib/favoris"
import { calculerCompletudeProfil } from "../../lib/profilCompleteness"
import { useResponsive } from "../hooks/useResponsive"
import EmptyState from "../components/ui/EmptyState"
import AnnonceSkeleton from "../components/ui/AnnonceSkeleton"
import FiltersBar from "../components/annonces/FiltersBar"
import Link from "next/link"
import CityAutocomplete from "../components/CityAutocomplete"
import ListingCardSearch from "../components/annonces/ListingCardSearch"
import ListingCardCompact from "../components/annonces/ListingCardCompact"
import BandeauDossier from "../components/annonces/BandeauDossier"
import { km, KMButton, KMButtonOutline, KMEyebrow, KMHeading } from "../components/ui/km"

// Tous lazy : ouverts via interaction utilisateur (pas dans le rendu initial).
// Audit perf #6, #7 : SavedSearchesPopover (304 LoC), QuickViewModal (378 LoC,
// embarque Lightbox), CompareTray (135 LoC, visible uniquement quand ≥1 ajouté).
// FiltersModal : ouvert via bouton "Filtres". Gain combiné estimé ~10-15 kB
// sur le bundle initial /annonces.
const FiltersModal = dynamic(() => import("../components/annonces/FiltersModal"), { ssr: false })
const SavedSearchesPopover = dynamic(() => import("../components/annonces/SavedSearchesPopover"), { ssr: false })
const QuickViewModal = dynamic(() => import("../components/annonces/QuickViewModal"), { ssr: false })
const CompareTray = dynamic(() => import("../components/annonces/CompareTray"), { ssr: false })
// MobileMapCarousel : monte uniquement quand showMap=true ET viewport mobile.
// Lazy : on évite de payer le coût (Image, Leaflet props) sur desktop.
const MobileMapCarousel = dynamic(() => import("../components/annonces/MobileMapCarousel"), { ssr: false })

// R10.2 — max simultané d'annonces dans le comparateur.
const COMPARE_MAX = 3

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
    // requestIdleCallback : on charge MapAnnonces après que le navigateur ait
    // peint le contenu critique (LCP) et soit idle. Le toggle Liste/Carte
    // reste instantané pour les users qui le déclenchent. Fallback setTimeout
    // pour Safari qui n'a pas (encore) requestIdleCallback.
    const win = window as Window & { requestIdleCallback?: (cb: () => void) => number }
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const trigger = () => {
      import("../components/MapAnnonces").then((mod) => {
        if (alive) setComp(() => mod.default)
      })
    }
    if (typeof win.requestIdleCallback === "function") {
      win.requestIdleCallback(trigger)
    } else {
      // Stocker le timeout et l'annuler au unmount évite que `trigger`
      // ne s'exécute sur un composant démonté (audit silent-failure-hunter #13).
      timeoutId = setTimeout(trigger, 200)
    }
    return () => {
      alive = false
      if (timeoutId !== null) clearTimeout(timeoutId)
    }
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

// V14.1 (Paul 2026-04-28) — clés URL filtre considérées comme "critères
// du profil" pour l'auto-apply à l'arrivée et la détection de divergence.
const PROFIL_FILTER_KEYS = ["ville", "budget_max", "surface_min", "surface_max", "pieces_min", "dpe_min"] as const

/**
 * V14.1 — construit les URLSearchParams représentant les critères du profil
 * locataire. Utilisé pour l'auto-apply à l'arrivée et le bouton "Réinitialiser
 * mes préférences". Inclut uniquement les champs renseignés (skip null/empty).
 */
function buildProfilParams(profil: Record<string, unknown> | null | undefined): URLSearchParams {
  const p = new URLSearchParams()
  if (!profil) return p
  const ville = typeof profil.ville_souhaitee === "string" ? profil.ville_souhaitee.trim() : ""
  if (ville) p.set("ville", ville)
  const budget = Number(profil.budget_max ?? 0)
  if (Number.isFinite(budget) && budget > 0) p.set("budget_max", String(budget))
  const sMin = Number(profil.surface_min ?? 0)
  if (Number.isFinite(sMin) && sMin > 0) p.set("surface_min", String(sMin))
  const sMax = Number(profil.surface_max ?? 0)
  if (Number.isFinite(sMax) && sMax > 0) p.set("surface_max", String(sMax))
  const piecesMin = Number(profil.pieces_min ?? 0)
  if (Number.isFinite(piecesMin) && piecesMin > 0) p.set("pieces_min", String(piecesMin))
  // dpe_min uniquement si user a coche le filtre dur (dpe_min_actif)
  const dpe = typeof profil.dpe_min === "string" ? profil.dpe_min : ""
  if (dpe && profil.dpe_min_actif === true) p.set("dpe_min", dpe)
  return p
}

/**
 * V14.3 — détecte si les params URL actuels divergent des critères du profil
 * (= l'utilisateur a explicitement modifié un filtre depuis son arrivée).
 * Compare uniquement les keys du profil (PROFIL_FILTER_KEYS), ignore les
 * autres filtres (parking, balcon, type, q, etc.) qui sont transverses.
 */
function paramsDivergeFromProfil(current: SP | undefined, profil: Record<string, unknown> | null): boolean {
  if (!profil) return false
  const wanted = buildProfilParams(profil)
  for (const k of PROFIL_FILTER_KEYS) {
    const actual = spGet(current, k)
    const expected = wanted.get(k) ?? ""
    if (actual !== expected) return true
  }
  return false
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
// Largeur max mode Grille v5 : élargi 1440→1700 pour remplir mieux les
// grands écrans tout en gardant des marges latérales (pas edge-to-edge).
const GRID_MAX_WIDTH = 1700
// Mode Liste+Carte v6 : la colonne liste prend ~40% du viewport (60% carte).
// Plus de variant compact — single layout aligné Claude Design handoff.
const LIST_COLUMN_RATIO = 0.40
// Breakpoint mobile strict — modale carte + filtres plein écran.
const MOBILE_BREAKPOINT = 768

// ── Infinite scroll : chunk initial + incrément
//   16 cards initial = bon trade-off LCP/CLS (8 visibles above-the-fold sur
//   un viewport 1280×900 avec aspect 4/5). +12 par chunk (sentinel scroll).
//   sessionStorage : on persiste l'offset + scrollY par querystring pour que
//   le user qui clique sur une annonce + revient atterrisse à sa position.
const PAGE_INITIAL = 16
const PAGE_INCREMENT = 12

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
  // V7 chantier 1 — toggle qui retrograde les "indispensable" en "souhaite"
  // pour relacher le filtre dur si la liste est trop courte.
  const [disableIndispensable, setDisableIndispensable] = useState(false)
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

  // ── R10.2 — Comparateur (max 3, persist localStorage km_compare_ids)
  const [compareIds, setCompareIds] = useState<number[]>([])
  // ── R10.2 — Quick-view modal
  const [quickViewId, setQuickViewId] = useState<number | null>(null)

  // Drawer mobile state — ecoute le custom event dispatched par Navbar pour
  // cacher le FAB "Voir sur la carte" quand le drawer est ouvert (Paul
  // 2026-04-27). Solution defensive aux conflits de stacking context : on
  // unmount le FAB plutot que de jouer aux z-index.
  const [navDrawerOpen, setNavDrawerOpen] = useState(false)
  useEffect(() => {
    function handler(e: Event) {
      setNavDrawerOpen((e as CustomEvent).detail?.open === true)
    }
    window.addEventListener("km:drawer-state", handler)
    return () => window.removeEventListener("km:drawer-state", handler)
  }, [])

  const { data: session, status } = useSession()
  const { role } = useRole()
  const isProprietaire = role === "proprietaire"
  // V14.1 (Paul 2026-04-28) — auto-apply profil critères : flag persistant
  // pour ne pas re-déclencher l'auto-apply si user tape "Voir toutes les
  // annonces ↺" (cas où il vide manuellement l'URL).
  const autoAppliedRef = useRef(false)
  const [autoAppliedBannerOpen, setAutoAppliedBannerOpen] = useState(false)
  const { isMobile, isTablet } = useResponsive()
  // v5 : breakpoint mobile strict 768 (au-dessus de useResponsive isMobile=640).
  // Utilisé pour modale carte plein écran, header simplifié, FAB flottant.
  const isMobileV5 = viewportW < MOBILE_BREAKPOINT
  const isSmall = isMobile || isTablet

  // ── URL-derived filters (voir commentaire historique React #418 fix)
  const urlVille = spGet(initialSearchParams, "ville")
  const urlBudget = parseInt(spGet(initialSearchParams, "budget_max") || "0") || 0
  const urlType = spGet(initialSearchParams, "type")
  const urlSurfaceMin = spGet(initialSearchParams, "surface_min")
  const urlSurfaceMax = spGet(initialSearchParams, "surface_max")
  const urlPiecesMin = parseInt(spGet(initialSearchParams, "pieces_min") || "0") || 0
  const urlMotCle = spGet(initialSearchParams, "q")
  // V2.7 (Paul 2026-04-27) — matching v2 URL overrides
  const urlCompatMin = parseInt(spGet(initialSearchParams, "compatibilite_min") || "0") || 0
  const urlToleranceRaw = spGet(initialSearchParams, "tolerance")
  const urlTolerance = urlToleranceRaw === "" ? NaN : parseInt(urlToleranceRaw)
  const urlRayonRaw = spGet(initialSearchParams, "rayon")
  const urlRayon = urlRayonRaw === "" ? NaN : parseInt(urlRayonRaw)

  const activeVille = urlVille
  const activeBudget = urlBudget
  const activeType = urlType

  // Sync local state ↔ URL lorsque les params changent (navigation)
  useEffect(() => {
    if (urlSurfaceMin !== surfaceMin) setSurfaceMin(urlSurfaceMin)
    if (urlSurfaceMax !== surfaceMax) setSurfaceMax(urlSurfaceMax)
    if (urlPiecesMin !== piecesMin) setPiecesMin(urlPiecesMin)
    if (urlMotCle !== motCle) setMotCle(urlMotCle)
    // V2.7 — compatibilite_min URL → state local scoreMin (compat URL existante)
    if (urlCompatMin > 0 && urlCompatMin !== scoreMin) setScoreMin(urlCompatMin)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSurfaceMin, urlSurfaceMax, urlPiecesMin, urlMotCle, urlCompatMin])

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
    // V36.6 — Sync API Supabase fire-and-forget (cross-device).
    // Le filtres jsonb stocke tout sauf id/name (qui sont en colonnes).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, name: _name, savedAt: _sa, ...filtres } = search
    void fetch("/api/recherches-sauvegardees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: search.name, filtres }),
    }).catch(() => { /* offline OK, localStorage assure le fallback */ })
    // V30 — toast confirm (desktop SavedSearchesPopover ou MobileMapCarousel
    // qui a son propre toast déjà).
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("km:toast", {
        detail: {
          type: "success",
          title: "Recherche sauvegardée",
          body: `« ${search.name} » — retrouve-la dans Mes recherches`,
          href: "/recherches-sauvegardees",
        },
      }))
    }
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

  // ── R10.2 — Compare helpers (persist localStorage km_compare_ids)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("km_compare_ids")
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) setCompareIds(arr.filter((x: unknown) => typeof x === "number").slice(0, COMPARE_MAX))
      }
    } catch { /* noop */ }
  }, [])

  function persistCompare(list: number[]) {
    try { localStorage.setItem("km_compare_ids", JSON.stringify(list)) } catch { /* noop */ }
  }
  function handleToggleCompare(id: number) {
    setCompareIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id].slice(0, COMPARE_MAX)
      persistCompare(next)
      return next
    })
  }
  function handleClearCompare() {
    setCompareIds([])
    persistCompare([])
  }
  function handleLaunchCompare() {
    if (compareIds.length < 2) return
    router.push(`/annonces/comparer?ids=${compareIds.join(",")}`)
  }

  // ── Fetch annonces + profil
  useEffect(() => {
    async function fetchData() {
      const { data: a } = await supabase
        .from("annonces")
        .select("*")
        .or("statut.is.null,statut.neq.loué")
        .eq("is_test", false) // Modération : exclut les annonces flaguées en test (proprio les voit toujours dans /proprietaire)
      if (a) setAnnonces(a)
      if (session?.user?.email) {
        // V29.B — via /api/profil/me (server-side, RLS Phase 5)
        const meRes = await fetch("/api/profil/me", { cache: "no-store" })
        const meJson = await meRes.json().catch(() => ({}))
        const p = meJson.ok ? meJson.profil : null
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

            // V14.1 (Paul 2026-04-28) — auto-apply profil critères dans l'URL
            // si l'arrivée se fait SANS aucun filtre URL. router.replace pour
            // ne pas créer d'entrée history. Une seule fois par chargement
            // (le flag autoAppliedRef évite les re-déclenchements). User peut
            // toujours vider via "Voir toutes les annonces ↺".
            const urlEmpty = !initialSearchParams || Object.keys(initialSearchParams).every(k => {
              const v = initialSearchParams[k]
              return !v || (Array.isArray(v) && v.length === 0)
            })
            if (urlEmpty && !autoAppliedRef.current) {
              autoAppliedRef.current = true
              const params = buildProfilParams(p)
              const qs = params.toString()
              if (qs) {
                setAutoAppliedBannerOpen(true)
                router.replace(`/annonces?${qs}`, { scroll: false })
              }
            }
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

  // Variant sans event (pour MapAnnonces, qui gere lui-meme stopPropagation)
  function handleToggleFavoriId(id: number) {
    toggleFavori(id)
    setFavoris(getFavoris())
  }

  const handleBoundsChange = useCallback((bounds: any, userDriven: boolean) => {
    if (userDriven) setMapBounds(bounds)
  }, [])

  // Normalisation ville identique à lib/geocoding (pour lookup dans `geocoded`)
  const normalizeVille = normalizeCityKey

  // V2.7 — profil effectif : merge profil DB + overrides URL pour tolerance/rayon.
  // Permet aux liens partages (?tolerance=10&rayon=30) de surcharger le profil
  // sans muter ce qu'on persiste cote /profil.
  const profilEffectif = profil
    ? {
        ...profil,
        ...(Number.isFinite(urlTolerance) && urlTolerance >= 0 ? { tolerance_budget_pct: urlTolerance } : {}),
        ...(Number.isFinite(urlRayon) && urlRayon > 0 ? { rayon_recherche_km: urlRayon } : {}),
      }
    : null

  // V7 chantier 1 — count des Indispensables actifs sur le profil + escape
  // hatch pour les desactiver temporairement (bandeau "Voir toutes" en cas
  // de liste tres courte).
  const indispensableKeys = profilEffectif?.preferences_equipements
    ? Object.keys(profilEffectif.preferences_equipements).filter(
        k => profilEffectif.preferences_equipements?.[k] === "indispensable"
      )
    : []
  const profilForFilter = !disableIndispensable ? profilEffectif : profilEffectif ? {
    ...profilEffectif,
    // On retire les "indispensable" en les retrogradant en "souhaite" pour le filtre
    preferences_equipements: profilEffectif.preferences_equipements
      ? Object.fromEntries(Object.entries(profilEffectif.preferences_equipements).map(([k, v]) =>
          [k, v === "indispensable" ? "souhaite" : v]
        ))
      : null,
  } : null

  // Compte sans indispensable pour decider d'afficher le bandeau escape hatch
  const countWithIndisp = profilEffectif
    ? annonces.filter(a => !estExclu(a, profilEffectif)).length
    : annonces.length
  const countWithoutIndisp = profilEffectif && indispensableKeys.length > 0
    ? annonces.filter(a => {
        const fakeProfil = {
          ...profilEffectif,
          preferences_equipements: profilEffectif.preferences_equipements
            ? Object.fromEntries(Object.entries(profilEffectif.preferences_equipements).map(([k, v]) =>
                [k, v === "indispensable" ? "souhaite" : v]
              ))
            : null,
        }
        return !estExclu(a, fakeProfil)
      }).length
    : countWithIndisp
  const indispensableExcluding = countWithoutIndisp - countWithIndisp

  // ── Enrichissement coords
  const annoncesEnrichies = annonces
    .filter(a => !profilForFilter || !estExclu(a, profilForFilter))
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
      return { ...a, scoreMatching: profilEffectif ? calculerScore(a, profilEffectif) : null, _lat: lat, _lng: lng }
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
  // V16 (Paul 2026-04-28) — filtre ville effectif : si l'URL a `?ville=`,
  // on l'utilise. Sinon fallback sur `profil.ville_souhaitee` quand
  // user logged-in avec mode_localisation=strict (default). Garantit qu'un
  // user qui veut Paris ne voit jamais Marseille même si l'auto-apply
  // V14.1 n'a pas tourné (premier load, profil sans criteres, etc.).
  const profilVilleStrict = !isProprietaire && profil
    && (profil.mode_localisation !== "souple")
    && typeof profil.ville_souhaitee === "string"
    ? String(profil.ville_souhaitee).trim()
    : ""
  const villeFilter = activeVille.trim() || profilVilleStrict

  const annoncesForMap = annoncesEnrichies.filter(a => {
    // Ville : match accent-insensible + code postal dept fallback (75/69/13)
    if (villeFilter) {
      const q = villeFilter
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
    // Filter strict : si user demande ≤ 800 €, on ne laisse pas passer 950 €.
    // Avant : `* 1.20` (marge 20% pour matching tolérant) → contradiction
    // avec le label UI "≤ 800 €" qui affichait des biens à 960 € (audit
    // 2026-04-26). La tolérance de matching reste appliquée côté score
    // (lib/matching.ts), pas au filtre.
    if (activeBudget && a.prix && a.prix > activeBudget) return false
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

  // V17 (Paul 2026-04-28) — rang scopé sur la ZONE city, pas global.
  // User feedback : "le score sur 189 c'est trop large, scope sur la ville
  // + 50km serait plus parlant". On filtre annoncesEnrichies par le même
  // villeFilter que celui utilisé en V16 pour la liste affichée. Les
  // autres filtres UI (budget, équipements, etc.) ne réduisent PAS la zone
  // — on garde la stabilité V9.5 sur ces filtres-là.
  // Edge case : pas de villeFilter (anonyme + pas de profil) → fallback
  // global comme V9.5 (le rang reste utile pour signaler le marché total).
  const annoncesInZone = villeFilter
    ? annoncesEnrichies.filter(a => {
        const q = villeFilter
        const isCP = /^\d{5}$/.test(q)
        if (isCP) {
          const depart = q.slice(0, 2)
          const fallbackVille =
            depart === "75" ? "paris" :
            depart === "69" ? "lyon" :
            depart === "13" ? "marseille" : null
          if (!fallbackVille) return false
          const villeNorm = normalizeCityKey(a.ville || "")
          return villeNorm.includes(fallbackVille)
        }
        const vA = normalizeCityKey(a.ville || "")
        const vF = normalizeCityKey(q)
        if (!vA || !vF) return false
        return vA.includes(vF) || vF.includes(vA)
      })
    : annoncesEnrichies
  const rangs = calcRangsGlobal(annoncesInZone)
  const totalRangs = rangs.size
  const showRanks = shouldShowRank(totalRangs)

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

  // V45 — Liste détaillée des filtres actifs pour l'empty state explicite.
  // User flag : "j'ai mis tout et à Lyon … 0 résultat et je ne sais pas pourquoi".
  // Avant : pill "Filtres : 7" opaque sans détail. Maintenant : on liste
  // chaque filtre avec son label + son handler de désactivation pour
  // permettre à l'user d'identifier quel critère filtre dur.
  type FilterChip = { label: string; clear: () => void }
  const activeFiltersList: FilterChip[] = []
  if (activeVille) activeFiltersList.push({ label: `Ville : ${activeVille}`, clear: () => onChangeVille("") })
  if (budgetMaxFiltre) activeFiltersList.push({ label: `Budget ≤ ${budgetMaxFiltre.toLocaleString("fr-FR")} €`, clear: () => setBudgetMaxFiltre(null) })
  if (piecesMin > 0) activeFiltersList.push({ label: `${piecesMin}+ pièces`, clear: () => setPiecesMin(0) })
  if (surfaceMin) activeFiltersList.push({ label: `Surface ≥ ${surfaceMin} m²`, clear: () => setSurfaceMin("") })
  if (surfaceMax) activeFiltersList.push({ label: `Surface ≤ ${surfaceMax} m²`, clear: () => setSurfaceMax("") })
  if (filtreMeubleTri === "oui") activeFiltersList.push({ label: "Meublé", clear: () => setFiltreMeubleTri(null) })
  if (filtreMeubleTri === "non") activeFiltersList.push({ label: "Non meublé", clear: () => setFiltreMeubleTri(null) })
  if (scoreMin > 0) activeFiltersList.push({ label: `Match ≥ ${scoreMin}%`, clear: () => setScoreMin(0) })
  if (dispoImmediate) activeFiltersList.push({ label: "Dispo immédiate", clear: () => setDispoImmediate(false) })
  if (filtreParking) activeFiltersList.push({ label: "Parking", clear: () => setFiltreParking(false) })
  if (filtreBalcon) activeFiltersList.push({ label: "Balcon", clear: () => setFiltreBalcon(false) })
  if (filtreTerrasse) activeFiltersList.push({ label: "Terrasse", clear: () => setFiltreTerrasse(false) })
  if (filtreJardin) activeFiltersList.push({ label: "Jardin", clear: () => setFiltreJardin(false) })
  if (filtreCave) activeFiltersList.push({ label: "Cave", clear: () => setFiltreCave(false) })
  if (filtreFibre) activeFiltersList.push({ label: "Fibre", clear: () => setFiltreFibre(false) })
  if (filtreAscenseur) activeFiltersList.push({ label: "Ascenseur", clear: () => setFiltreAscenseur(false) })
  if (filtreDpeMax) activeFiltersList.push({ label: `DPE ≤ ${filtreDpeMax}`, clear: () => setFiltreDpeMax("") })
  if (motCle.trim()) activeFiltersList.push({ label: `Mot-clé : « ${motCle.trim()} »`, clear: () => setMotCle("") })

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

  // v6 : single-variant card aligné handoff Claude Design.
  // Plus besoin de variant compact/grid — la card unique aspect 4/5
  // s'adapte naturellement à toutes les largeurs (1 col mobile, 2 col tablette,
  // 2-4 cols desktop selon viewport).
  void LIST_COLUMN_RATIO

  // ── Infinite scroll state ─────────────────────────────────────────────
  //   displayCount : nombre d'annonces affichées (≤ annoncesTraitees.length).
  //   isAppending : true pendant qu'on incrémente (skeleton de fin).
  //   La pagination se fait CÔTÉ CLIENT sur annoncesTraitees (déjà fetché
  //   en bloc). Pour scaler à des milliers d'annonces, il faudra passer
  //   en cursor-based côté API — tracé dans /api/annonces. À ce stade,
  //   le filtrage côté client reste le bon trade-off (UX réactive).
  const [displayCount, setDisplayCount] = useState(PAGE_INITIAL)
  const [isAppending, setIsAppending] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // Reset du compteur quand la liste filtrée change radicalement (changement
  // de filtre/ville/tri). Sans ça, on resterait sur l'offset précédent et
  // l'infinite scroll croirait qu'il a déjà tout chargé.
  // On utilise length comme proxy : un filtre qui change la taille du résultat
  // déclenche un reset. Pour un changement qui garde la même taille (ex tri),
  // on accepte de garder le scroll position — UX fluide.
  const filteredLen = annoncesTraitees.length
  const lastFilteredLenRef = useRef(filteredLen)
  useEffect(() => {
    if (lastFilteredLenRef.current !== filteredLen) {
      lastFilteredLenRef.current = filteredLen
      setDisplayCount(PAGE_INITIAL)
    }
  }, [filteredLen])

  // IntersectionObserver — append +PAGE_INCREMENT quand le sentinel passe le viewport.
  // Threshold 0.1 + rootMargin 200px : on précharge avant que le user atteigne le bas.
  // Note : root par défaut = viewport. En mode liste+carte desktop le scroll est
  // isolé dans la colonne liste (overflow-y:auto) → on bind le root sur ce scroller
  // via ref ci-dessous.
  const listScrollerRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!sentinelRef.current) return
    if (displayCount >= filteredLen) return
    const target = sentinelRef.current
    // root = scroller de la liste si dispo (mode liste+carte desktop scroll isolé),
    // sinon viewport (mode grille document scroll).
    // gridMode déclaré ci-dessous mais on inline ici pour éviter une TDZ.
    const isGrid = view === "grid"
    const root = !isGrid && !isSmall ? listScrollerRef.current : null
    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[0]
        if (entry.isIntersecting) {
          setIsAppending(true)
          // setTimeout 100ms pour laisser le skeleton apparaître (UX feedback).
          // Sinon le bump est trop rapide à voir, l'user a l'impression que rien
          // ne charge même quand de nouvelles cards arrivent.
          setTimeout(() => {
            setDisplayCount(c => Math.min(c + PAGE_INCREMENT, filteredLen))
            setIsAppending(false)
          }, 100)
        }
      },
      { root, rootMargin: "200px", threshold: 0.1 }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [displayCount, filteredLen, view, isSmall])

  // sessionStorage : restaure scroll position quand le user revient depuis
  // une fiche annonce (back nav). Clé = querystring filtres pour ne pas
  // cross-pollute entre recherches différentes.
  const sessionKey = `km_annonces_state:${typeof window !== "undefined" ? window.location.search : ""}`
  useEffect(() => {
    if (typeof window === "undefined") return
    if (loading) return
    try {
      const raw = sessionStorage.getItem(sessionKey)
      if (!raw) return
      const saved = JSON.parse(raw) as { count?: number; scrollY?: number }
      if (typeof saved.count === "number" && saved.count > PAGE_INITIAL) {
        setDisplayCount(Math.min(saved.count, filteredLen))
      }
      if (typeof saved.scrollY === "number") {
        // Wait next paint pour que les cards soient render avant le scrollTo
        requestAnimationFrame(() => window.scrollTo(0, saved.scrollY!))
      }
      sessionStorage.removeItem(sessionKey)
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])
  // Persist au unmount (back nav vers /annonces/[id])
  useEffect(() => {
    if (typeof window === "undefined") return
    return () => {
      try {
        sessionStorage.setItem(sessionKey, JSON.stringify({
          count: displayCount,
          scrollY: window.scrollY,
        }))
      } catch { /* noop */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayCount])

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

  // v5.3 : la zone liste+carte prend flex:1 dans le flex column outer,
  // plus besoin de zoneLCHeight fixe (hauteur naturelle = viewport restant).
  const outerHeight = `calc(100vh - ${NAVBAR_HEIGHT}px)`

  // Mode grille : le scroll isolé est désactivé (toute la page scrolle)
  //   → carte masquée, grid max 4 cols centré, comportement "magazine".
  const gridMode = view === "grid"

  // ── Scroll isolé STRICT en mode Liste+Carte desktop ───────────────────
  //   body/html overflow:hidden pour que la zone liste+carte gère seule
  //   son scroll interne (évite double barre + pied de page parasite).
  //   En mode Grille OU mobile (<768) : scroll naturel du document.
  //   Cleanup au unmount ET sur changement de view → pas de fuite hors /annonces.
  useEffect(() => {
    if (gridMode || isSmall || isMobileV5) return
    const prevBody = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    // v5.4 : reset scroll à 0 AVANT lock — sinon le browser peut restaurer
    // une scroll position (ex. footer bas de page au refresh) puis lock →
    // l'user se retrouve bloqué en bas sans pouvoir scroller.
    window.scrollTo(0, 0)
    document.body.style.overflow = "hidden"
    document.documentElement.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prevBody
      document.documentElement.style.overflow = prevHtml
    }
  }, [gridMode, isSmall, isMobileV5])

  // ── Scroll lock dédié modale carte mobile (plein écran) ───────────────
  //   Évite le scroll du body derrière la modale sur mobile.
  //   Cleanup au close ET à l'unmount → safe navigation.
  useEffect(() => {
    if (!(isMobileV5 && showMap && !gridMode)) return
    const prevBody = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prevBody }
  }, [isMobileV5, showMap, gridMode])

  // ── Container conditionnel — full-width en Liste+Carte, max-1700 en Grille
  //   Liste+Carte desktop : edge-to-edge SANS padding latéral (la carte +
  //     aside prennent TOUTE la page horizontale, fidèle handoff (3) MapSplit
  //     qui occupe toute la largeur). Tous les bandeaux + headers + FiltersBar
  //     sont masqués au-dessus de la zone map (les QuickFilter chips de
  //     l'aside header les remplacent).
  //   Grille ou mobile    : max-width 1700 centré, padding padH normal.
  const useFullWidth = !gridMode && !isSmall
  const containerMaxWidth = useFullWidth ? "100%" : GRID_MAX_WIDTH
  const containerMargin = useFullWidth ? "0" : "0 auto"
  const containerPadH = useFullWidth ? 0 : padH

  // v5.3 : en mode Liste+Carte desktop, on utilise un layout FLEX COLUMN
  // pour que la zone liste+carte prenne exactement l'espace restant dans
  // le viewport (plus de scroll parasite, carte jamais hors écran).
  const isDesktopListCarte = !gridMode && !isSmall && !isMobileV5

  return (
    <div
      style={{
        background: km.beige,
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        // Mode Liste+Carte desktop : outer = flex column height viewport-navbar,
        // overflow hidden → la zone LC prend l'espace restant via flex:1.
        // Mode grid/tablette/mobile : scroll document naturel.
        height: isDesktopListCarte ? outerHeight : undefined,
        minHeight: !isDesktopListCarte ? outerHeight : undefined,
        overflow: isDesktopListCarte ? "hidden" : "visible",
        display: isDesktopListCarte ? "flex" : undefined,
        flexDirection: isDesktopListCarte ? "column" : undefined,
      }}
    >
      {/* H1 SEO visible uniquement pour les crawlers */}
      <h1 style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}>
        {activeVille
          ? `Logements à louer à ${activeVille} — annonces entre particuliers`
          : "Logements à louer — annonces entre particuliers en France"}
      </h1>

      {/* Container principal : full-width en Liste+Carte, max-1440 en Grille */}
      <div style={{
        maxWidth: containerMaxWidth,
        margin: containerMargin,
        paddingLeft: containerPadH,
        paddingRight: containerPadH,
        // Mode Liste+Carte desktop : flex column pour propager flex:1 à la zone LC
        flex: isDesktopListCarte ? 1 : undefined,
        minHeight: isDesktopListCarte ? 0 : undefined,
        display: isDesktopListCarte ? "flex" : undefined,
        flexDirection: isDesktopListCarte ? "column" : undefined,
        width: isDesktopListCarte ? "100%" : undefined,
      }}>

        {/* ── Bandeau dossier incitatif — REMONTÉ AVANT le header h2 pour que
             le user locataire voie immédiatement à l'arrivée s'il lui manque
             quelque chose dans son dossier. Visible dans tous les modes
             (grille + liste+carte) : en liste+carte desktop, il s'insère
             dans le flex column outer au-dessus de la zone LC qui prend
             flex:1. Avant : rendu APRÈS le header h2, et masqué en
             liste+carte → invisible alors que c'est l'incitation principale. */}
        {showBandeauDossier && completudeProfil !== null && (
          <div style={{
            padding: isMobile ? "10px 0" : "14px 0 6px",
            paddingLeft: isDesktopListCarte ? containerPadH : 0,
            paddingRight: isDesktopListCarte ? containerPadH : 0,
            flexShrink: 0,
          }}>
            <BandeauDossier completude={completudeProfil} isMobile={isMobile} />
          </div>
        )}

        {/* ── Header éditorial — scroll normal (pas sticky)
             En mode liste+carte desktop : MASQUÉ. La page est immersive
             (carte + aside edge-to-edge), l'aside a son propre h1 22px
             "X logements" + Live + QuickFilter chips.
             V18 (Paul 2026-04-28) — masqué AUSSI en mobile carte plein
             écran (`isMobileV5 && showMap`) : la map prend tout l'écran,
             le titre "22 logements à Paris / Tri par compatibilité" est
             redondant et bouffe de la verticale précieuse sur mobile. */}
        {!isDesktopListCarte && !(isMobileV5 && showMap) && (isMobileV5 ? (
          /* Mobile simplifié : h2 Fraunces italic 26 + sous-titre 12, sans popover */
          <div style={{ padding: "16px 0 4px" }}>
            <KMHeading as="h2" size={26}>
              {loading
                ? (activeVille ? `Logements à ${activeVille}` : "Logements à louer")
                : `${annoncesTraitees.length} logement${annoncesTraitees.length > 1 ? "s" : ""} ${activeVille ? `à ${activeVille}` : ""}`.trim()}
            </KMHeading>
            <p style={{ fontSize: 12, color: "#666", margin: "6px 0 0", letterSpacing: "0.2px" }}>
              {isProprietaire ? "Mode propriétaire" : "Tri par compatibilité"}
            </p>
          </div>
        ) : (
          /* v5.3 : header compact 1 ligne — h2 Fraunces italic à gauche, lien
             sauvegarde à droite. Eyebrow et sous-titre retirés pour gagner
             de la verticale (gain ~100px). */
          <div style={{
            padding: "10px 0 4px",
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}>
            <KMHeading as="h2" size={24}>
              {loading
                ? (activeVille ? `Logements à ${activeVille}` : "Logements à louer")
                : `${annoncesTraitees.length} logement${annoncesTraitees.length > 1 ? "s" : ""} ${activeVille ? `à ${activeVille}` : "disponible" + (annoncesTraitees.length > 1 ? "s" : "")}`}
            </KMHeading>
            {/* Lien de sauvegarde + accès aux recherches sauvegardées (V40.1+V40.2).
                Avant V40 : seul SavedSearchesPopover (action sauver). User a flag
                "il faudrait un bouton pour aller dans ses recherches sauvegardées" —
                ajout d'un lien direct prominent à côté du popover. */}
            {!isProprietaire && session?.user?.email && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <SavedSearchesPopover
                  savedSearches={savedSearches.map(s => ({ id: s.id, name: s.name, savedAt: s.savedAt }))}
                  onSave={sauverRecherche}
                  onApply={appliquerRecherche}
                  onDelete={supprimerRecherche}
                  defaultName={buildDefaultSearchName()}
                  label="Sauvegarder cette recherche"
                />
                <a
                  href="/recherches-sauvegardees"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "7px 14px",
                    background: "#fff",
                    border: `1px solid ${km.line}`,
                    borderRadius: 999,
                    fontSize: 11.5, fontWeight: 600,
                    color: km.ink, textDecoration: "none",
                    fontFamily: "inherit",
                    whiteSpace: "nowrap",
                  }}
                  title="Voir mes recherches sauvegardées"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                  Mes recherches{savedSearches.length > 0 ? ` (${savedSearches.length})` : ""}
                </a>
              </div>
            )}
          </div>
        ))}

        {/* Bandeau dossier — déplacé AU-DESSUS du header h2 (cf bloc plus haut). */}

        {/* ── Bandeau statut compact — MASQUÉ en mode liste+carte desktop ── */}
        {!isDesktopListCarte && (isProprietaire || status === "unauthenticated") && (
          <div style={{ padding: isMobile ? "10px 0" : "8px 0" }}>
            {isProprietaire ? (
              <div style={{ background: km.white, borderRadius: 16, padding: isMobile ? "10px 14px" : "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${km.line}`, gap: 10 }}>
                <span style={{ fontSize: isMobile ? 12 : 13, color: "#666" }}>
                  <KMEyebrow style={{ display: "inline", marginRight: 8 }}>Mode propriétaire</KMEyebrow>
                  {!isMobile && " — scores de compatibilité non applicables"}
                </span>
                <a href="/proprietaire" style={{ fontSize: 10, fontWeight: 700, color: km.ink, textDecoration: "none", padding: "6px 16px", border: `1px solid ${km.line}`, borderRadius: 999, whiteSpace: "nowrap", flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.6px" }}>Mes biens</a>
              </div>
            ) : (
              <div style={{ background: km.warnBg, border: `1px solid ${km.warnLine}`, borderRadius: 16, padding: isMobile ? "10px 14px" : "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: isMobile ? 12 : 13, fontWeight: 500, color: km.warnText }}>
                  {isMobile ? "Connectez-vous pour le matching" : "Connectez-vous pour activer le score de compatibilité"}
                </span>
                <a href="/auth" style={{ background: km.ink, color: km.white, padding: "7px 18px", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 10, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.6px" }}>Connexion</a>
              </div>
            )}
          </div>
        )}

        {/* ── Header éditorial handoff app.jsx:489-496 ──────────────────
            MASQUÉ en mode liste+carte desktop (l'aside a son propre h1
            22px + Live + QuickFilter chips). Sinon affiché en desktop. */}
        {!isSmall && !isDesktopListCarte && (
          <div style={{
            padding: "8px 0 14px",
            borderBottom: `1px solid ${km.line}`,
            marginBottom: gridMode ? 16 : 0,
          }}>
            <p style={{
              fontSize: 11, fontWeight: 700, color: km.muted,
              textTransform: "uppercase", letterSpacing: "1.6px",
              margin: 0, marginBottom: 4,
            }}>
              Annonces
            </p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <h1 style={{
                fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif",
                fontStyle: "italic",
                fontSize: 34, fontWeight: 500,
                letterSpacing: "-1px",
                margin: 0, color: km.ink, lineHeight: 1.05,
              }}>
                {loading
                  ? "Logements disponibles"
                  : `${annoncesTraitees.length} ${annoncesTraitees.length > 1 ? "logements disponibles" : "logement disponible"}`}
              </h1>
              {!loading && tri === "match" && annoncesTraitees.length > 0 && (
                <span style={{
                  fontSize: 13, color: km.muted, letterSpacing: "0.1px",
                }}>
                  Triés par compatibilité
                </span>
              )}
            </div>
          </div>
        )}

        {/* V7 chantier 1 — escape hatch pour les Indispensables. Si l'user
            a 1+ \"indispensable\" et que le filtre dur exclut au moins 3
            annonces, on lui propose de relacher le filtre. */}
        {!loading && profilEffectif && indispensableKeys.length > 0 && indispensableExcluding >= 3 && (
          <div style={{
            background: disableIndispensable ? "#FBF6EA" : "#F0FAEE",
            border: `1px solid ${disableIndispensable ? "#EADFC6" : "#C6E9C0"}`,
            borderRadius: 12,
            padding: "10px 14px",
            marginBottom: 12,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
            fontSize: 13,
          }}>
            <span style={{ color: disableIndispensable ? "#a16207" : "#15803d", lineHeight: 1.5 }}>
              {disableIndispensable
                ? <>Filtres « Indispensable » désactivés temporairement — <strong>{indispensableExcluding}</strong> annonces de plus visibles.</>
                : <><strong>{indispensableExcluding}</strong> annonces filtrées par tes critères Indispensable ({indispensableKeys.join(", ")}).</>}
            </span>
            <button
              type="button"
              onClick={() => setDisableIndispensable(v => !v)}
              style={{
                background: km.ink, color: km.white, border: "none",
                borderRadius: 999, padding: "6px 14px",
                fontSize: 11, fontWeight: 700, fontFamily: "inherit",
                textTransform: "uppercase", letterSpacing: "0.4px",
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {disableIndispensable ? "Réactiver" : "Voir toutes →"}
            </button>
          </div>
        )}

        {/* V14c bandeau retiré V15c (Paul 2026-04-28) — la pill morph
            "Mes critères ↔ Réinitialiser" dans la FiltersBar / QuickFiltersRow
            remplit ce rôle. User feedback : "qu'une seule pill qui morph". */}

        {/* V36.5 — Banner auto-apply confirmation (audit V35 R35.6) :
            avant ce banner, l'user débarquait sur /annonces avec ses critères
            profil appliqués silencieusement → ambiguïté "c'est mon filtre ou
            les vrais résultats ?" Maintenant : confirmation explicite +
            bouton "Voir tout" pour réinitialiser. Auto-dismiss 8s. */}
        {autoAppliedBannerOpen && (
          <div
            role="status"
            aria-live="polite"
            style={{
              background: "#EEF3FB",
              border: "1px solid #D7E3F4",
              borderRadius: 14,
              padding: "10px 16px",
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <span aria-hidden style={{ fontSize: 16 }}>✨</span>
            <p style={{ flex: 1, minWidth: 200, fontSize: 13, color: "#1d4ed8", margin: 0, lineHeight: 1.5 }}>
              On a appliqué tes critères profil pour gagner du temps.{" "}
              <a
                href="/annonces"
                onClick={() => setAutoAppliedBannerOpen(false)}
                style={{ color: "#1d4ed8", textDecoration: "underline", fontWeight: 600 }}
              >
                Voir toutes les annonces
              </a>
              .
            </p>
            <button
              type="button"
              onClick={() => setAutoAppliedBannerOpen(false)}
              aria-label="Fermer"
              style={{ background: "transparent", border: "none", color: "#1d4ed8", fontSize: 18, cursor: "pointer", padding: 4, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        )}

        {/* ── FiltersBar sticky — MASQUÉ en mode liste+carte desktop ET en
            mobile mode carte (Paul 2026-04-27 sur retour user — la barre
            apparaissait au milieu de l'ecran sur la map mobile, moche et
            inutile car le bouton Filtres + le picker Ville sont deja dans
            le header sticky de MobileMapCarousel). */}
        {!isDesktopListCarte && !(isMobileV5 && showMap) && <FiltersBar
          isMobile={isMobileV5}
          isTablet={isTablet && !isMobileV5}
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
          monProfilHref={!isProprietaire ? "/profil" : null}
          isDivergent={!isProprietaire && !!profil && paramsDivergeFromProfil(initialSearchParams, profil)}
          onResetToProfil={() => {
            if (!profil) return
            const qs = buildProfilParams(profil).toString()
            router.replace(qs ? `/annonces?${qs}` : "/annonces", { scroll: false })
          }}
        />}

        {/* ── Toggle Liste/Carte tablette (640-767) — mobile <768 utilise FAB */}
        {isSmall && !isMobileV5 && !gridMode && (
          <div style={{ display: "flex", gap: 8, padding: "12px 0 0", flexShrink: 0 }}>
            {!showMap ? (
              <>
                <KMButton size="sm" style={{ flex: 1 }}>Liste</KMButton>
                <KMButtonOutline size="sm" onClick={() => setShowMap(true)} style={{ flex: 1 }}>Carte</KMButtonOutline>
              </>
            ) : (
              <>
                <KMButtonOutline size="sm" onClick={() => setShowMap(false)} style={{ flex: 1 }}>Liste</KMButtonOutline>
                <KMButton size="sm" style={{ flex: 1 }}>Carte</KMButton>
              </>
            )}
          </div>
        )}

        {/* ═══ MODE GRILLE : carte masquée, grille max 4 cols centrée ═══ */}
        {gridMode ? (
          <div style={{ padding: isMobile ? "12px 0 24px" : "16px 0 32px" }}>
            {loading ? (
              <GridContainer>{[1, 2, 3, 4, 5, 6, 7, 8].map(i => <AnnonceSkeleton key={i} />)}</GridContainer>
            ) : annoncesTraitees.length === 0 ? (
              <>
                <EmptyState
                  title="Aucun logement trouvé"
                  description={activeVille
                    ? `Aucun résultat à ${activeVille} pour ces critères. Élargissez la recherche ou essayez une ville voisine.`
                    : "Ajustez vos filtres pour voir plus de résultats."}
                  ctaLabel={activeFilterCount > 0 ? "Réinitialiser les filtres" : undefined}
                  onCtaClick={activeFilterCount > 0 ? onResetAll : undefined}
                  secondaryCtaLabel={activeVille ? "Voir toutes les villes" : undefined}
                  onSecondaryCtaClick={activeVille ? () => onChangeVille("") : undefined}
                />
                {/* V45 — Liste explicite des filtres actifs + Indispensables.
                    L'EmptyState générique ne suffit pas : l'user veut comprendre
                    quel critère filtre dur. Ici on liste chaque chip avec X
                    pour désactiver individuellement + section Indispensables
                    séparée car ce sont des filtres durs venus du profil. */}
                {(activeFiltersList.length > 0 || (profilEffectif && indispensableKeys.length > 0)) && (
                  <div style={{ marginTop: 18, background: "#fff", border: "1px solid #EAE6DF", borderRadius: 16, padding: "20px 24px" }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 12px" }}>
                      Tes filtres actifs
                    </p>
                    {activeFiltersList.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                        {activeFiltersList.map((f, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={f.clear}
                            title={`Retirer ce filtre`}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 6,
                              background: "#F7F4EF", border: "1px solid #EAE6DF",
                              color: "#111", borderRadius: 999,
                              padding: "5px 10px 5px 12px", fontSize: 12, fontWeight: 600,
                              cursor: "pointer", fontFamily: "inherit",
                            }}
                          >
                            {f.label}
                            <span style={{ fontSize: 14, lineHeight: 1, color: "#8a8477" }}>×</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {profilEffectif && indispensableKeys.length > 0 && (
                      <div style={{ background: "#FBF6EA", border: "1px solid #EADFC6", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: "#9a3412", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 6px" }}>
                          Indispensables actifs (filtre dur)
                        </p>
                        <p style={{ fontSize: 13, color: "#a16207", margin: "0 0 10px", lineHeight: 1.55 }}>
                          {indispensableKeys.length} critère{indispensableKeys.length > 1 ? "s" : ""} marqué{indispensableKeys.length > 1 ? "s" : ""} <strong>Indispensable</strong> sur ton profil filtre les annonces sans aucune tolérance : <strong>{indispensableKeys.join(", ")}</strong>.
                        </p>
                        <button
                          type="button"
                          onClick={() => setDisableIndispensable(v => !v)}
                          style={{
                            background: disableIndispensable ? "#fff" : "#9a3412",
                            color: disableIndispensable ? "#9a3412" : "#fff",
                            border: disableIndispensable ? "1px solid #EADFC6" : "none",
                            borderRadius: 999, padding: "8px 16px",
                            fontSize: 11, fontWeight: 700, cursor: "pointer",
                            fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px",
                          }}
                        >
                          {disableIndispensable ? "← Réactiver mes Indispensables" : "Désactiver mes Indispensables temporairement"}
                        </button>
                      </div>
                    )}
                    <p style={{ fontSize: 12, color: "#8a8477", margin: 0, lineHeight: 1.55 }}>
                      Astuce : clique une chip pour la retirer, ou{" "}
                      <button type="button" onClick={onResetAll} style={{ background: "none", border: "none", padding: 0, color: "#111", textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600 }}>
                        réinitialise tous les filtres
                      </button>
                      .
                    </p>
                  </div>
                )}
                {/* Suggestions villes proches (Paul 2026-04-27) — uniquement si
                    la ville est connue dans CITY_COORDS. Click = onChangeVille
                    qui re-route avec la ville suggeree. */}
                {activeVille && (() => {
                  const nearby = findNearbyCities(activeVille, 5)
                  if (nearby.length === 0) return null
                  return (
                    <div style={{ marginTop: 18, background: "white", border: "1px solid #EAE6DF", borderRadius: 16, padding: "20px 24px" }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 12px" }}>
                        Villes proches de {activeVille}
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {nearby.map(c => (
                          <button
                            key={c.name}
                            type="button"
                            onClick={() => onChangeVille(c.name)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              background: "#F7F4EF",
                              border: "1px solid #EAE6DF",
                              color: "#111",
                              borderRadius: 999,
                              padding: "8px 14px",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                              fontFamily: "inherit",
                              transition: "background 160ms",
                              WebkitTapHighlightColor: "transparent",
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#EAE6DF")}
                            onMouseLeave={e => (e.currentTarget.style.background = "#F7F4EF")}
                          >
                            {c.name}
                            <span style={{ color: "#8a8477", fontWeight: 500 }}>· {c.distanceKm} km</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </>
            ) : (
              <>
                <GridContainer>
                  {annoncesTraitees.slice(0, displayCount).map(a => {
                    const score = a.scoreMatching
                    const info = !isProprietaire && score !== null ? labelScore(score) : null
                    const isOwn = isProprietaire && a.proprietaire_email === session?.user?.email
                    const isSelected = selectedId === a.id
                    const isCompared = compareIds.includes(a.id)
                    return (
                      <ListingCardSearch
                        key={a.id}
                        annonce={a}
                        score={score}
                        info={info}
                        rang={showRanks ? rangs.get(a.id) ?? null : null}
                        rangTotal={showRanks ? totalRangs : null}
                        isOwn={isOwn}
                        isSelected={isSelected}
                        favori={favoris.includes(a.id)}
                        onToggleFavori={e => handleToggleFavori(e, a.id)}
                        onMouseEnter={() => setSelectedId(a.id)}
                        onMouseLeave={() => setSelectedId(null)}
                        motCle={motCle}
                        onQuickView={() => setQuickViewId(a.id)}
                        compared={isCompared}
                        onToggleCompare={handleToggleCompare}
                        compareDisabled={compareIds.length >= COMPARE_MAX}
                      />
                    )
                  })}
                  {/* Skeletons d'append pendant le fetch infinite scroll */}
                  {isAppending && [1, 2, 3, 4].map(i => <AnnonceSkeleton key={`skel-append-${i}`} />)}
                </GridContainer>

                {/* Sentinel infinite scroll + message de fin éditorial */}
                {displayCount < annoncesTraitees.length ? (
                  <div ref={sentinelRef} aria-hidden="true" style={{ height: 1, marginTop: 24 }} />
                ) : annoncesTraitees.length > PAGE_INITIAL ? (
                  <p style={{
                    textAlign: "center",
                    margin: "40px 0 8px",
                    color: km.muted,
                    fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif",
                    fontStyle: "italic",
                    fontSize: 15,
                    fontWeight: 400,
                    letterSpacing: "-0.1px",
                  }}>
                    Vous avez vu toutes les annonces correspondant à votre recherche.
                  </p>
                ) : null}
              </>
            )}
          </div>
        ) : (
          /* ═══ MODE LISTE : scroll isolé, ratio 27/73 ═══ */
          <div
            style={{
              display: "flex",
              gap: isSmall ? 0 : 20,
              padding: isMobile ? "12px 0 24px" : "16px 0 0",
              flexDirection: isSmall ? "column" : "row",
              alignItems: "flex-start",
              // v5.3 : Desktop = flex:1 dans le flex column parent
              //   → prend exactement l'espace viewport restant, carte jamais hors écran.
              // Mobile/tablette : hauteur naturelle contenu.
              flex: isDesktopListCarte ? 1 : undefined,
              minHeight: isDesktopListCarte ? 0 : undefined,
              width: isDesktopListCarte ? "100%" : undefined,
            }}
          >
            {/* ── Colonne Aside — 600px desktop (user request), 100% mobile/tablet ──
                Layout grid `600px 1fr`. Header riche : eyebrow + h1 22px count
                + Live indicator + tri segmented (Compatibilité / Prix / Récent). */}
            <div
              ref={listScrollerRef}
              style={{
                flex: isSmall ? 1 : "0 0 600px",
                minWidth: 0,
                width: isSmall ? "100%" : undefined,
                // V39 (Paul 2026-04-29) — bug fix : avant ce fix, la liste
                // était `display: "block"` sur mobile MÊME en mode Carte
                // (isMobileV5 && showMap). Résultat : la 1ère ListingCardCompact
                // s'affichait DANS le DOM avant le MobileMapCarousel (rendu en
                // position fixed top:72). Sur iPhone, le scroll natif faisait
                // remonter la card visible AU-DESSUS du carousel header
                // "Search bar Paris + Filtres". User : "il y a toujours le
                // bug ou on voit au dessus et en même temps la map".
                // Fix : `display: none` quand mobile + carte. Le carousel est
                // alors le SEUL composant visible sous la navbar (vraiment
                // fullscreen).
                display: isMobileV5 && showMap ? "none" : (isMobileV5 ? "block" : (isSmall && showMap ? "none" : "flex")),
                flexDirection: "column",
                height: isSmall ? undefined : "100%",
                overflow: isSmall ? "visible" : "hidden",
                background: isSmall ? "transparent" : km.white,
                border: isSmall ? "none" : `1px solid ${km.line}`,
                borderRadius: isSmall ? 0 : 20,
                paddingBottom: isMobileV5 ? 80 : undefined,
              }}
            >
              {/* Header aside enrichi — handoff (3) MapSplit l. 631-679 */}
              {!isSmall && (
                <div style={{
                  padding: "18px 22px 14px",
                  borderBottom: `1px solid ${km.line}`,
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}>
                  {/* Ligne 1 : eyebrow + h1 + Live indicator + ViewToggle.
                      Pattern handoff (3) `app.jsx` l. 632-642 — flex
                      space-between : bloc gauche (eyebrow/h1/live) + bloc
                      droite (ViewToggle Grille/Carte). En mode liste+carte,
                      "Carte" est l'état actif. Click "Grille" → setView("grid")
                      → bascule en grille pleine page. Sans ce toggle, le mode
                      grille était inaccessible depuis ici (FiltersBar masqué). */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: "#6B6B6B",
                        textTransform: "uppercase" as const,
                        letterSpacing: "1.4px",
                        marginBottom: 4,
                      }}>
                        Annonces
                      </div>
                      <h2 style={{
                        fontSize: 22,
                        fontWeight: 600,
                        letterSpacing: "-0.6px",
                        margin: 0,
                        lineHeight: 1.2,
                        color: km.ink,
                      }}>
                        {loading ? "Chargement…" : `${annoncesTraitees.length} logement${annoncesTraitees.length > 1 ? "s" : ""}`}
                      </h2>
                      <div style={{
                        fontSize: 11.5,
                        color: "#6B6B6B",
                        marginTop: 3,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}>
                        <span style={{
                          width: 5,
                          height: 5,
                          background: "#16A34A",
                          borderRadius: "50%",
                          animation: "km-pulse 2s ease-in-out infinite",
                        }} />
                        Mis à jour à l&apos;instant
                      </div>
                    </div>
                    {/* V40.1+V40.2 — Sauvegarder + accès recherches sauvegardées
                        (audit user 2026-04-29 : "la sauvegarde c'est que sur tel
                        enfin sur pc ça apparaît pas" + "il faudrait un bouton
                        pour aller dans ses recherches sauvegardées"). Avant V40,
                        SavedSearchesPopover existait uniquement dans le header
                        h2 (modes mobile/grille) — invisible en desktop liste+carte. */}
                    {!isProprietaire && session?.user?.email && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <SavedSearchesPopover
                          savedSearches={savedSearches.map(s => ({ id: s.id, name: s.name, savedAt: s.savedAt }))}
                          onSave={sauverRecherche}
                          onApply={appliquerRecherche}
                          onDelete={supprimerRecherche}
                          defaultName={buildDefaultSearchName()}
                          label="Sauvegarder"
                        />
                        <a
                          href="/recherches-sauvegardees"
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            padding: "7px 14px",
                            background: "#fff",
                            border: `1px solid ${km.line}`,
                            borderRadius: 999,
                            fontSize: 11.5, fontWeight: 600,
                            color: km.ink, textDecoration: "none",
                            fontFamily: "inherit",
                            whiteSpace: "nowrap",
                          }}
                          title="Voir mes recherches sauvegardées"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                          </svg>
                          Mes recherches{savedSearches.length > 0 ? ` (${savedSearches.length})` : ""}
                        </a>
                      </div>
                    )}

                    {/* ViewToggle Grille/Carte — fidèle handoff (3) `app.jsx`
                        l. 586-605. Mode courant = "Carte" (split list+map),
                        click "Grille" bascule vers la grille pleine page. */}
                    <div style={{ display: "inline-flex", background: km.white, border: `1px solid ${km.line}`, borderRadius: 999, padding: 4, gap: 2, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => setView("grid")}
                        aria-label="Mode grille"
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          padding: "6px 12px", borderRadius: 999, border: "none", cursor: "pointer",
                          fontFamily: "inherit", fontSize: 11.5, fontWeight: 600,
                          background: "transparent", color: "#6B6B6B",
                          transition: "all 200ms",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = km.ink }}
                        onMouseLeave={e => { e.currentTarget.style.color = "#6B6B6B" }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                        Grille
                      </button>
                      <span
                        aria-current="page"
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          padding: "6px 12px", borderRadius: 999,
                          fontFamily: "inherit", fontSize: 11.5, fontWeight: 700,
                          background: km.ink, color: km.white,
                          cursor: "default",
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
                        Carte
                      </span>
                    </div>
                  </div>

                  {/* Ligne 2 : 3 QuickFilter chips fidèles handoff (3) l. 644-650.
                      Connectés aux vrais state existants (scoreMin / activeVille
                      / budgetMaxFiltre). Click = popover pour ajuster.
                      Pas dupliqué avec FiltersBar : ces 3 chips sont l'accès
                      rapide 1-tap aux filtres les plus utilisés. */}
                  <QuickFiltersRow
                    scoreMin={scoreMin}
                    setScoreMin={setScoreMin}
                    activeVille={activeVille}
                    onChangeVille={onChangeVille}
                    budgetMaxFiltre={budgetMaxFiltre}
                    setBudgetMaxFiltre={setBudgetMaxFiltre}
                    activeFilterCount={activeFilterCount}
                    onOpenAllFilters={() => setModalOpen(true)}
                    showMatchOption={showMatchOption}
                    monProfilHref={!isProprietaire ? "/profil" : null}
                    isDivergent={!isProprietaire && !!profil && paramsDivergeFromProfil(initialSearchParams, profil)}
                    onResetToProfil={() => {
                      if (!profil) return
                      const qs = buildProfilParams(profil).toString()
                      router.replace(qs ? `/annonces?${qs}` : "/annonces", { scroll: false })
                    }}
                  />

                  {/* Ligne 3 : Tri segmented control fidèle handoff (3) l. 666-678 */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11.5 }}>
                    <span style={{ color: "#6B6B6B", fontWeight: 600 }}>Trier par</span>
                    <div style={{ display: "inline-flex", gap: 0, background: km.beige, borderRadius: 8, padding: 2 }}>
                      {([
                        ["match", "Compatibilité"],
                        ["prix_asc", "Prix"],
                        ["recent", "Récent"],
                      ] as const).map(([k, l]) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setTri(k)}
                          style={{
                            padding: "5px 11px",
                            borderRadius: 6,
                            border: "none",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            fontSize: 11,
                            fontWeight: 600,
                            background: tri === k ? km.white : "transparent",
                            color: tri === k ? km.ink : "#6B6B6B",
                            boxShadow: tri === k ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                          }}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <style>{`@keyframes km-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }`}</style>

              {/* Scrollable inner — la aside elle-même est flex column, ce inner
                  gère le scroll des items. */}
              <div style={{
                flex: isSmall ? undefined : 1,
                minHeight: 0,
                overflowY: isSmall ? "visible" : "auto",
                padding: isSmall ? 0 : 10,
              }}>
                {loading ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: isSmall ? 0 : 0 }}>
                    {[1, 2, 3, 4, 5].map(i => <AnnonceSkeleton key={i} />)}
                  </div>
                ) : annoncesTraitees.length === 0 ? (
                  <>
                    <EmptyState
                      title="Aucun logement trouvé"
                      description={mapBounds
                        ? "Essayez d'élargir la zone de recherche sur la carte."
                        : activeVille
                          ? `Aucun résultat à ${activeVille} pour ces critères. Élargissez la recherche ou effacez la ville.`
                          : "Ajustez vos filtres pour voir plus de résultats."}
                      ctaLabel={mapBounds ? "Élargir la zone" : activeFilterCount > 0 ? "Réinitialiser les filtres" : undefined}
                      onCtaClick={mapBounds ? () => setMapBounds(null) : activeFilterCount > 0 ? onResetAll : undefined}
                      secondaryCtaLabel={activeVille && !mapBounds ? "Voir toutes les villes" : undefined}
                      onSecondaryCtaClick={activeVille && !mapBounds ? () => onChangeVille("") : undefined}
                    />
                    {/* V45 — Liste explicite filtres actifs (cf gridMode plus haut). */}
                    {(activeFiltersList.length > 0 || (profilEffectif && indispensableKeys.length > 0)) && (
                      <div style={{ marginTop: 14, background: "#fff", border: "1px solid #EAE6DF", borderRadius: 14, padding: "16px 18px" }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 10px" }}>
                          Tes filtres actifs
                        </p>
                        {activeFiltersList.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                            {activeFiltersList.map((f, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={f.clear}
                                title="Retirer ce filtre"
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: 6,
                                  background: "#F7F4EF", border: "1px solid #EAE6DF",
                                  color: "#111", borderRadius: 999,
                                  padding: "5px 10px 5px 12px", fontSize: 12, fontWeight: 600,
                                  cursor: "pointer", fontFamily: "inherit",
                                }}
                              >
                                {f.label}
                                <span style={{ fontSize: 14, lineHeight: 1, color: "#8a8477" }}>×</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {profilEffectif && indispensableKeys.length > 0 && (
                          <div style={{ background: "#FBF6EA", border: "1px solid #EADFC6", borderRadius: 10, padding: "10px 12px", marginTop: 6 }}>
                            <p style={{ fontSize: 10, fontWeight: 700, color: "#9a3412", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 4px" }}>
                              Indispensables (filtre dur)
                            </p>
                            <p style={{ fontSize: 12, color: "#a16207", margin: "0 0 8px", lineHeight: 1.5 }}>
                              <strong>{indispensableKeys.join(", ")}</strong> — aucune tolérance.
                            </p>
                            <button
                              type="button"
                              onClick={() => setDisableIndispensable(v => !v)}
                              style={{
                                background: disableIndispensable ? "#fff" : "#9a3412",
                                color: disableIndispensable ? "#9a3412" : "#fff",
                                border: disableIndispensable ? "1px solid #EADFC6" : "none",
                                borderRadius: 999, padding: "6px 12px",
                                fontSize: 10.5, fontWeight: 700, cursor: "pointer",
                                fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px",
                              }}
                            >
                              {disableIndispensable ? "← Réactiver" : "Désactiver temporairement"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {annoncesTraitees.slice(0, displayCount).map(a => {
                      const score = a.scoreMatching
                      const isOwn = isProprietaire && a.proprietaire_email === session?.user?.email
                      const matchPct = score !== null && !isOwn ? Math.round(score / 10) : null
                      return (
                        <ListingCardCompact
                          key={a.id}
                          annonce={a}
                          active={selectedId === a.id}
                          favori={favoris.includes(a.id)}
                          match={matchPct}
                          rang={showRanks ? rangs.get(a.id) ?? null : null}
                          rangTotal={showRanks ? totalRangs : null}
                          onMouseEnter={() => setSelectedId(a.id)}
                          onMouseLeave={() => setSelectedId(null)}
                          onToggleFavori={e => handleToggleFavori(e, a.id)}
                          onPreview={() => setQuickViewId(a.id)}
                          compared={compareIds.includes(a.id)}
                          onToggleCompare={handleToggleCompare}
                          compareDisabled={compareIds.length >= COMPARE_MAX}
                          isOwn={isOwn}
                        />
                      )
                    })}
                    {/* Skeletons d'append pendant le fetch infinite scroll */}
                    {isAppending && [1, 2, 3].map(i => <AnnonceSkeleton key={`skel-list-${i}`} />)}
                    {/* Sentinel + message de fin */}
                    {displayCount < annoncesTraitees.length ? (
                      <div ref={sentinelRef} aria-hidden="true" style={{ height: 1 }} />
                    ) : annoncesTraitees.length > PAGE_INITIAL ? (
                      <p style={{
                        textAlign: "center",
                        margin: "20px 0 8px",
                        color: km.muted,
                        fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif",
                        fontStyle: "italic",
                        fontSize: 14,
                        fontWeight: 400,
                      }}>
                        Vous avez vu toutes les annonces correspondant à votre recherche.
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            {/* ── Colonne Carte — 1fr desktop (handoff `420px 1fr`), 100% si showMap tablette ──
                Mobile v5 : carte absente inline (rendue en modale plein écran) */}
            {mounted && !isMobileV5 && (
              <div
                style={{
                  flex: isSmall ? 1 : 1,
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
                    border: isMobile ? "none" : `1px solid ${km.line}`,
                  }}
                >
                  {MapComp ? (
                    <MapComp
                      annonces={annoncesTraitees}
                      selectedId={selectedId}
                      onSelect={id => setSelectedId(id)}
                      onBoundsChange={handleBoundsChange}
                      centerHint={centerCity ? [centerCity[0], centerCity[1]] : null}
                      favoris={favoris}
                      onToggleFavori={handleToggleFavoriId}
                    />
                  ) : null}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Mobile FAB "Voir sur la carte" (<768, mode Liste, modale fermée).
          Hide quand le drawer mobile est ouvert pour eviter tout chevauchement
          visuel (z-index war). Cf custom event "km:drawer-state". */}
      {isMobileV5 && !gridMode && !showMap && !navDrawerOpen && (
        <button
          type="button"
          onClick={() => setShowMap(true)}
          aria-label="Voir les annonces sur la carte"
          style={{
            position: "fixed",
            // V5.3 (Paul 2026-04-28) — quand Comparer tray pill est visible (a droite,
            // bottom 20px), le FAB centre rentrait en collision sur viewports < 400px.
            // Solution : decaler le FAB en haut de 70px quand compareIds.length > 0
            // → la pill Comparer reste bottom-right libre, FAB juste au-dessus.
            bottom: compareIds.length > 0 ? "calc(20px + env(safe-area-inset-bottom, 0px) + 70px)" : "calc(20px + env(safe-area-inset-bottom, 0px))",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 7200,
            background: km.ink,
            color: km.white,
            border: "none",
            borderRadius: 999,
            padding: "12px 22px",
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.6px",
            fontFamily: "inherit",
            cursor: "pointer",
            boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            transition: "bottom 220ms ease",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
            <line x1="8" y1="2" x2="8" y2="18" />
            <line x1="16" y1="6" x2="16" y2="22" />
          </svg>
          Voir sur la carte
        </button>
      )}

      {/* ── Mobile Map Modal — pattern Airbnb/SeLoger (Paul 2026-04-27) ──
          Map ~60% top + carrousel horizontal cards ~40% bottom.
          Synchronisation map ↔ carrousel :
          - Click marker → setSelectedId → MapComp flyTo (FlyToSelected) +
            useEffect scroll la card matching dans le carrousel.
          - Swipe carrousel → IntersectionObserver détecte la card centrée
            → setSelectedId → flyTo automatique. */}
      {isMobileV5 && !gridMode && showMap && mounted && MapComp && (
        <MobileMapCarousel
          annonces={annoncesTraitees}
          selectedId={selectedId}
          onSelect={(id: number | null) => setSelectedId(id)}
          onClose={() => setShowMap(false)}
          onBoundsChange={handleBoundsChange}
          centerHint={centerCity ? [centerCity[0], centerCity[1]] : null}
          favoris={favoris}
          onToggleFavori={handleToggleFavoriId}
          MapComp={MapComp}
          activeVille={activeVille || ""}
          onOpenFilters={() => setModalOpen(true)}
          activeFilterCount={activeFilterCount}
          onSaveSearch={() => {
            // V19.4 — pré-rempli avec le buildDefaultSearchName + prompt simple.
            // V30 — toast confirm est dispatch par sauverRecherche directement.
            const name = window.prompt("Nom de la recherche", buildDefaultSearchName())
            if (name && name.trim()) sauverRecherche(name.trim())
          }}
          canSaveSearch={!!session?.user?.email && !isProprietaire}
        />
      )}

      {/* ── R10.2 — QuickView modal ───────────────────────────────────── */}
      <QuickViewModal
        open={quickViewId !== null}
        onClose={() => setQuickViewId(null)}
        annonce={quickViewId !== null ? annoncesEnrichies.find(a => a.id === quickViewId) ?? null : null}
        score={quickViewId !== null ? (annoncesEnrichies.find(a => a.id === quickViewId)?.scoreMatching ?? null) : null}
        favori={quickViewId !== null ? favoris.includes(quickViewId) : false}
        onToggleFavori={() => { if (quickViewId !== null) handleToggleFavoriId(quickViewId) }}
        userVille={activeVille || profil?.ville_souhaitee || null}
      />

      {/* ── R10.2 — Compare tray (sticky bas d'écran) ─────────────────── */}
      <CompareTray
        items={compareIds
          .map(id => annoncesEnrichies.find(a => a.id === id))
          .filter((a): a is NonNullable<typeof a> => !!a)
          .map(a => ({
            id: a.id,
            titre: a.titre ?? null,
            ville: a.ville ?? null,
            prix: a.prix ?? null,
            photo: Array.isArray(a.photos) && a.photos.length > 0 ? a.photos[0] : null,
          }))
        }
        max={COMPARE_MAX}
        onRemove={handleToggleCompare}
        onClear={handleClearCompare}
        onCompare={handleLaunchCompare}
      />

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
        isMobile={isMobileV5}
      />
    </div>
  )
}

/**
 * Container de la vue Grille v5.3 — scale -15% pour densite (2026-04-23).
 *  - Cards 442px FIXE rectangulaire (photo landscape 16/10). Etait 520.
 *  - Gap 20px, auto-fill (pas auto-fit -> zero stretch). Etait 24.
 * v7.1 — densité cible user "4 par ligne, 3 sur écran moyen" :
 *   `gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16`
 *
 * Math :
 *   - 1636px container → floor(1636/(300+16)) = 5 cards/row (~308px each)
 *   - 1280px container → floor(1280/(300+16)) = 4 cards/row (~308px each)
 *   - 980px container  → floor(980/(300+16))  = 3 cards/row (~316px each)
 *   - 760px container  → floor(760/(300+16))  = 2 cards/row (~370px each)
 *
 * Le handoff `app.jsx ListingsScreen` propose 240px (→ 6 cards à 1636px,
 * trop dense). Le user a explicité une cible plus aérée 4-5 cards desktop
 * avec retour à 3 sur écran moyen. 300px est le compromis qui matche cette
 * cible sans casser l'esprit éditorial mosaïque du handoff.
 *
 * `auto-fill` strict (pas auto-fit) : les tracks vides ne collapsent pas,
 * la 2e row d'une page peu remplie ne stretche pas en 2 cards immenses.
 */
function GridContainer({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gap: 16,
        width: "100%",
        margin: "0 auto",
      }}
    >
      {children}
    </div>
  )
}

// ─── QuickFiltersRow — header aside MapSplit handoff (3) l. 644-664 ─────────
// 3 chips d'accès rapide aux filtres les plus utilisés (compat / lieu / prix)
// + bouton "Tous les filtres" plein largeur avec count badge.
// Connectés aux vrais state existants — pas de duplication de logique métier.

type QuickKind = "match" | "lieu" | "prix" | null

function QuickFiltersRow({
  scoreMin,
  setScoreMin,
  activeVille,
  onChangeVille,
  budgetMaxFiltre,
  setBudgetMaxFiltre,
  activeFilterCount,
  onOpenAllFilters,
  showMatchOption,
  monProfilHref,
  isDivergent,
  onResetToProfil,
}: {
  scoreMin: number
  setScoreMin: (v: number) => void
  activeVille: string
  onChangeVille: (v: string) => void
  budgetMaxFiltre: number | null
  setBudgetMaxFiltre: (v: number | null) => void
  activeFilterCount: number
  onOpenAllFilters: () => void
  showMatchOption: boolean
  monProfilHref?: string | null
  isDivergent?: boolean
  onResetToProfil?: () => void
}) {
  const [active, setActive] = useState<QuickKind>(null)
  const matchValue = scoreMin > 0 ? `≥ ${scoreMin} %` : "Toutes"
  const lieuValue = activeVille.trim() ? activeVille.trim() : "Toute la France"
  const prixValue = budgetMaxFiltre ? `≤ ${budgetMaxFiltre.toLocaleString("fr-FR")} €` : "Tous"

  return (
    <div style={{ position: "relative" }}>
      {/* V15.3 + V15c (Paul 2026-04-28) — Pill morph "Mes critères" ↔
          "Réinitialiser mes critères" en haut des chips QuickFilter mobile. */}
      {monProfilHref && (
        isDivergent && onResetToProfil ? (
          <button
            type="button"
            onClick={onResetToProfil}
            aria-label="Réinitialiser les filtres à mes critères du profil"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "#a16207", color: "#fff",
              border: "1px solid #a16207",
              borderRadius: 999, padding: "8px 16px",
              fontSize: 12.5, fontWeight: 700,
              fontFamily: "inherit", cursor: "pointer",
              whiteSpace: "nowrap", marginBottom: 8,
              transition: "background 200ms",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
            Réinitialiser mes critères
          </button>
        ) : (
          <Link
            href={monProfilHref}
            aria-label="Mon profil locataire — éditer mes critères"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "#111", color: "#fff",
              borderRadius: 999, padding: "8px 16px",
              fontSize: 12.5, fontWeight: 700,
              textDecoration: "none", fontFamily: "inherit",
              whiteSpace: "nowrap", marginBottom: 8,
              transition: "background 200ms",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            Mes critères
          </Link>
        )
      )}
      <div style={{ display: "grid", gridTemplateColumns: showMatchOption ? "repeat(3, 1fr)" : "repeat(2, 1fr)", gap: 6, marginBottom: 6 }}>
        {showMatchOption && (
          <QuickFilterChip
            label="Compat."
            value={matchValue}
            iconKind="match"
            active={active === "match"}
            onClick={() => setActive(active === "match" ? null : "match")}
          />
        )}
        <QuickFilterChip
          label="Lieu"
          value={lieuValue}
          iconKind="pin"
          active={active === "lieu"}
          onClick={() => setActive(active === "lieu" ? null : "lieu")}
        />
        <QuickFilterChip
          label="Loyer"
          value={prixValue}
          iconKind="euro"
          active={active === "prix"}
          onClick={() => setActive(active === "prix" ? null : "prix")}
        />
      </div>

      <button
        type="button"
        onClick={onOpenAllFilters}
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: 10,
          border: `1px solid ${km.line}`,
          background: km.white,
          fontFamily: "inherit",
          fontSize: 12,
          fontWeight: 600,
          color: km.ink,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          transition: "all 160ms",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = km.beige
          e.currentTarget.style.borderColor = km.ink
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = km.white
          e.currentTarget.style.borderColor = km.line
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="4" y1="6" x2="20" y2="6"/>
          <line x1="7" y1="12" x2="17" y2="12"/>
          <line x1="10" y1="18" x2="14" y2="18"/>
        </svg>
        Tous les filtres
        {activeFilterCount > 0 && (
          <span style={{
            minWidth: 16, height: 16,
            background: km.ink, color: km.white,
            borderRadius: 999, fontSize: 10, fontWeight: 700,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            padding: "0 5px",
            fontVariantNumeric: "tabular-nums" as const,
          }}>{activeFilterCount}</span>
        )}
      </button>

      {active === "match" && (
        <QuickFilterPopover onClose={() => setActive(null)} title="Compatibilité minimum">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 10 }}>
            {[
              { v: 0, l: "Tous" },
              { v: 60, l: "60+" },
              { v: 70, l: "70+" },
              { v: 80, l: "80+" },
              { v: 90, l: "90+" },
              { v: 95, l: "95+" },
            ].map(opt => {
              const sel = scoreMin === opt.v
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => { setScoreMin(opt.v); setActive(null) }}
                  style={{
                    padding: "8px 4px",
                    borderRadius: 8,
                    border: sel ? "1.5px solid #111" : `1px solid ${km.line}`,
                    background: sel ? km.beige : km.white,
                    color: km.ink,
                    fontFamily: "inherit",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >{opt.l}</button>
              )
            })}
          </div>
          <div style={{ fontSize: 11, color: "#8a8477" }}>Les annonces sous le seuil sont masquées.</div>
        </QuickFilterPopover>
      )}

      {active === "lieu" && (
        <QuickFilterPopover onClose={() => setActive(null)} title="Cherche une ville">
          {/* V15c.1 (Paul 2026-04-28) — remplacement du plain input par
              CityAutocomplete (le mobile/carte popup proposait juste "Tape
              Entrée pour valider" sans aucune suggestion). Maintenant fetch
              geo.api.gouv.fr et propose les communes triées par population. */}
          <CityAutocomplete
            value={activeVille}
            onChange={(v) => {
              onChangeVille(v)
              setActive(null)
            }}
            placeholder="Ex. Paris, Lyon, Marseille…"
            style={{ background: km.beige }}
          />
        </QuickFilterPopover>
      )}

      {active === "prix" && (
        <QuickFilterPopover onClose={() => setActive(null)} title="Loyer maximum (charges comprises)">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 5 }}>
            {[
              { v: null, l: "Tous" },
              { v: 800, l: "≤ 800 €" },
              { v: 1000, l: "≤ 1 000 €" },
              { v: 1200, l: "≤ 1 200 €" },
              { v: 1500, l: "≤ 1 500 €" },
              { v: 2000, l: "≤ 2 000 €" },
            ].map(opt => {
              const sel = budgetMaxFiltre === opt.v
              return (
                <button
                  key={String(opt.v)}
                  type="button"
                  onClick={() => { setBudgetMaxFiltre(opt.v); setActive(null) }}
                  style={{
                    padding: "6px 4px",
                    borderRadius: 8,
                    border: sel ? "1.5px solid #111" : `1px solid ${km.line}`,
                    background: sel ? km.beige : km.white,
                    color: km.ink,
                    fontFamily: "inherit",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >{opt.l}</button>
              )
            })}
          </div>
        </QuickFilterPopover>
      )}
    </div>
  )
}

function QuickFilterChip({ label, value, iconKind, active, onClick }: {
  label: string
  value: string
  iconKind: "match" | "pin" | "euro"
  active: boolean
  onClick: () => void
}) {
  const icon = iconKind === "match" ? (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="9 11 12 14 22 4"/></svg>
  ) : iconKind === "pin" ? (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
  ) : (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10h12"/><path d="M4 14h9"/><path d="M19 6.5a8 8 0 1 0 0 11"/></svg>
  )
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "7px 8px",
        borderRadius: 10,
        border: active ? "1.5px solid #111" : `1px solid ${km.line}`,
        background: active ? km.ink : km.white,
        color: active ? km.white : km.ink,
        fontFamily: "inherit",
        cursor: "pointer",
        minWidth: 0,
        width: "100%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 4,
        transition: "all 160ms",
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.background = km.beige
          e.currentTarget.style.borderColor = km.ink
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.background = km.white
          e.currentTarget.style.borderColor = km.line
        }
      }}
    >
      <span aria-hidden="true" style={{ flexShrink: 0, opacity: 0.65 }}>{icon}</span>
      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.1, minWidth: 0, overflow: "hidden", flex: 1 }}>
        <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.65, letterSpacing: "0.4px", textTransform: "uppercase" as const, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{label}</span>
        <span style={{ fontSize: 11.5, fontWeight: 700, fontVariantNumeric: "tabular-nums" as const, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{value}</span>
      </span>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, flexShrink: 0 }} aria-hidden="true">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>
  )
}

function QuickFilterPopover({ title, onClose, children }: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <>
      {/* Backdrop pour fermer au clic extérieur */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 40 }} aria-hidden="true" />
      <div style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        left: 0,
        right: 0,
        zIndex: 50,
        background: km.white,
        border: `1px solid ${km.line}`,
        borderRadius: 14,
        boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
        padding: 14,
        fontFamily: "inherit",
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#6B6B6B", textTransform: "uppercase" as const, letterSpacing: "1.2px", marginBottom: 10 }}>{title}</div>
        {children}
        <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${km.line}` }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: 8, borderRadius: 8, border: "none", background: km.ink, color: km.white, fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Fermer
          </button>
        </div>
      </div>
    </>
  )
}
