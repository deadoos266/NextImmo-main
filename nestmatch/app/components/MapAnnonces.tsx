"use client"
import { useEffect, useState, useRef } from "react"
import type { ReactNode } from "react"
import { MapContainer, TileLayer, Marker, Popup, Polygon, GeoJSON, useMap, useMapEvents } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { pointInPolygon, type LatLng as GeoLatLng } from "../../lib/geo"
// Clustering : regroupe les markers proches en bulles avec compteur. Au-delà
// d'un certain zoom, le cluster s'éclate en markers individuels. Style
// SeLoger / Idealista. La lib gère elle-même le CSS de leaflet.markercluster.
import MarkerClusterGroup from "react-leaflet-cluster"
import { asNumber } from "../../lib/asValue"

type MapType = "plan" | "satellite" | "standard"

// Tuiles par défaut = CartoDB Positron Light (Paul 2026-04-27 v5).
// User : "pour la carte faut que ça passe en carte épurée quand on est sur
// le site, c'est la 1ère qui doit apparaitre". Trade-off accepté : labels
// EN (London, Spain) en échange du style minimaliste blanc qui matche
// l'esthetique Airbnb/SeLoger premium.
//
// Détaillé = OSM France pour ceux qui veulent + de details ET labels FR.
// Satellite = Esri World Imagery.
// Choix mapType persiste en localStorage (`nestmatch_map_type`) pour que
// l'user qui prefere Détaillé garde son choix entre les visites.
const TILES: Record<MapType, { url: string; attribution: string; label: string; subdomains?: string; maxZoom?: number; soft?: boolean }> = {
  plan: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    label: "Plan",
    subdomains: "abcd",
    maxZoom: 19,
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "&copy; Esri",
    label: "Satellite",
  },
  standard: {
    url: "https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> France',
    label: "Détaillé",
    subdomains: "abc",
    maxZoom: 20,
  },
}

import { fixLeafletIcons } from "./leafletSetup"

// Locale FR pour Leaflet (prefixe d'attribution + zoom titles)
function useFrenchLeaflet() {
  const map = useMap()
  useEffect(() => {
    // Retire le préfixe "Leaflet" (anglais) de l'attribution
    map.attributionControl.setPrefix(false)

    // Titres des contrôles de zoom
    const zoom = (map as any).zoomControl
    if (zoom?._zoomInButton && zoom?._zoomOutButton) {
      zoom._zoomInButton.title = "Zoomer"
      zoom._zoomOutButton.title = "Dézoomer"
      zoom._zoomInButton.setAttribute("aria-label", "Zoomer")
      zoom._zoomOutButton.setAttribute("aria-label", "Dézoomer")
    }

    // Localiser les boutons de fermeture des popups (dynamique : run à chaque popup)
    const frenchifyPopupClose = () => {
      document.querySelectorAll(".leaflet-popup-close-button").forEach(el => {
        el.setAttribute("aria-label", "Fermer")
        el.setAttribute("title", "Fermer")
      })
    }
    frenchifyPopupClose()
    map.on("popupopen", frenchifyPopupClose)
    return () => { map.off("popupopen", frenchifyPopupClose) }
  }, [map])
  return null
}

// Pill prix style Claude Design handoff (app.jsx MapSplit l. 619-639) :
//   - Default : background blanc, border noir 1.5px, prix noir tabular-nums
//   - Active  : background noir, border noir 2px, prix blanc, scale 1.08
//               + arrow bottom-center (carr\u00e9 10\u00d710 rotated 45\u00b0)
//   - Dot vert "live" \u00e0 gauche du prix (annonce dispo)
//
// Le score n'est PLUS encod\u00e9 dans la couleur du marker (\u00e7a vit sur la card,
// pill match% top-left photo). Marker = info g\u00e9o + prix point d'ancrage.
// V19 (Paul 2026-04-29) \u2014 pin prix enrichi style SeLoger :
//   - prix CC (loyer + charges) au lieu du loyer brut
//   - tier color border selon match% (vert \u226575 / ambre 50-74 / rouge <50)
//   - badge "NOUV" ambre si annonce < 7 jours
//   - selected = bg noir comme avant
function priceMarker(
  prix: unknown,
  charges: unknown,
  selected: boolean,
  scorePct: number | null,
  isNew: boolean,
) {
  // V20 (Paul 2026-04-29) — asNumber pour robustesse string/number
  const loyer = asNumber(prix, 0) ?? 0
  const ch = asNumber(charges, 0) ?? 0
  const total = loyer + (ch > 0 ? ch : 0)
  const price = total > 0 ? total.toLocaleString("fr-FR") + "\u00a0\u20ac" : "\u2014"
  // Tier color : vert \u226575, ambre 50-74, rouge <50, gris si pas de score
  const borderColor = selected ? "#111"
    : scorePct === null ? "#111"
    : scorePct >= 75 ? "#15803d"
    : scorePct >= 50 ? "#a16207"
    : "#b91c1c"
  const dotColor = scorePct === null ? "#16A34A"
    : scorePct >= 75 ? "#15803d"
    : scorePct >= 50 ? "#a16207"
    : "#b91c1c"
  const bg = selected ? "#111" : "#fff"
  const text = selected ? "#fff" : "#111"
  const borderW = selected ? 2 : 1.5
  const scale = selected ? 1.08 : 1
  const arrow = selected
    ? `<span style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%) rotate(45deg);width:10px;height:10px;background:#111;"></span>`
    : ""
  // V19.3 \u2014 badge NOUV (annonce < 7 jours) en pastille ambre top-right du pin
  const newBadge = isNew && !selected
    ? `<span style="position:absolute;top:-7px;right:-4px;background:#a16207;color:#fff;font-size:8.5px;font-weight:800;letter-spacing:0.4px;padding:1px 5px;border-radius:999px;border:1.5px solid #fff;line-height:1.2;">NOUV</span>`
    : ""
  return L.divIcon({
    html: `<div style="
      position:relative;
      transform:scale(${scale});
      transform-origin:center bottom;
      background:${bg};
      color:${text};
      border:${borderW}px solid ${borderColor};
      padding:6px 10px;
      border-radius:999px;
      font-weight:700;
      font-size:12.5px;
      font-family:'DM Sans',sans-serif;
      font-variant-numeric:tabular-nums;
      white-space:nowrap;
      box-shadow:${selected ? "0 12px 28px rgba(0,0,0,0.28)" : "0 4px 12px rgba(0,0,0,0.14)"};
      cursor:pointer;
      display:inline-flex;
      align-items:center;
      gap:6px;
      transition:transform 180ms ease, background 180ms ease, color 180ms ease;
    ">
      <span style="width:6px;height:6px;border-radius:50%;background:${dotColor};flex-shrink:0;"></span>
      ${price}
      <span style="font-size:9px;font-weight:700;letter-spacing:0.3px;color:${selected ? "#a7f3d0" : "#15803d"};">CC</span>
      ${newBadge}
      ${arrow}
    </div>`,
    className: "",
    iconSize: [96, 30],
    iconAnchor: [48, 30],
  })
}

// Ecarte les marqueurs qui se superposent en les disposant en cercle
function spreadOverlappingMarkers(annonces: any[]): any[] {
  const groups = new Map<string, any[]>()
  annonces.forEach(a => {
    const key = `${Number(a._lat).toFixed(3)},${Number(a._lng).toFixed(3)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(a)
  })
  return annonces.map(a => {
    const key = `${Number(a._lat).toFixed(3)},${Number(a._lng).toFixed(3)}`
    const group = groups.get(key)!
    const idx = group.indexOf(a)
    if (group.length === 1) return a
    const angle = (idx / group.length) * 2 * Math.PI
    const radius = 0.004 + group.length * 0.0005
    return { ...a, _lat: a._lat + Math.cos(angle) * radius, _lng: a._lng + Math.sin(angle) * radius }
  })
}

// Surveille les bounds : notifie le parent que la carte a bouge (bouton "Rechercher ici")
function BoundsWatcher({ onMoved }: { onMoved: (bounds: L.LatLngBounds) => void }) {
  const map = useMapEvents({
    moveend: () => onMoved(map.getBounds()),
    zoomend: () => onMoved(map.getBounds()),
  })
  return null
}

// HoverableMarker — wrapper React qui ouvre le popup au survol du marker
// (et le ferme avec un délai de 250ms au mouseout, le temps pour l'user de
// glisser vers le popup pour cliquer dedans). Le click déclenche aussi
// onSelect comme avant. Pattern handoff app.jsx:642-663 (MapSplit).
function HoverableMarker({
  position,
  icon,
  onSelect,
  popupContent,
  disablePopup,
  priceTotal,
}: {
  position: [number, number]
  icon: L.DivIcon
  onSelect: () => void
  popupContent: ReactNode
  /** Si true, ne pas rendre le popup hover (desactive mouseover/popup).
   *  Utilise sur mobile mode carte ou la card slide-up SeLoger remplace
   *  le popup — sinon doublon visuel au tap marker. Paul 2026-04-27. */
  disablePopup?: boolean
  /** V19 — prix total CC (loyer + charges) injecté dans Marker.title pour
   *  permettre à iconCreateFunction du cluster de calculer "dès X €". */
  priceTotal?: number
}) {
  const markerRef = useRef<L.Marker | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  return (
    <Marker
      ref={(ref) => { markerRef.current = ref }}
      position={position}
      icon={icon}
      title={priceTotal != null && priceTotal > 0 ? String(priceTotal) : undefined}
      eventHandlers={{
        click: () => onSelect(),
        mouseover: () => {
          if (disablePopup) return
          if (closeTimer.current) {
            clearTimeout(closeTimer.current)
            closeTimer.current = null
          }
          // Paul 2026-04-27 : on n'appelle PLUS onSelect au mouseover.
          // User : "quand on passe notre souris sur les bulles d'annonces
          // affichées sur la carte la carte bouge automatiquement". Cause :
          // onSelect changeait selectedId → FlyToSelected appelait flyTo →
          // la carte se deplacait. La sync card↔marker ne se fait que sur
          // CLICK explicite maintenant. Le hover ouvre juste le popup
          // preview (et highlight visuel via le selectedId === a.id check
          // dans priceMarker → mais comme on n'appelle plus onSelect, le
          // marker reste visuellement "non actif" au hover, ce qui est OK
          // car c'est juste un preview). Pour rendre le marker subtilement
          // hover-active, on pourrait ajouter un state local mais ce serait
          // de la decoration — pas demande par l'user.
          markerRef.current?.openPopup()
        },
        mouseout: () => {
          if (disablePopup) return
          // Délai pour permettre à l'user de glisser sur le popup sans
          // qu'il se ferme. Si le pointeur ne revient pas, ferme à 250ms.
          if (closeTimer.current) clearTimeout(closeTimer.current)
          closeTimer.current = setTimeout(() => {
            markerRef.current?.closePopup()
            closeTimer.current = null
          }, 250)
        },
      }}
    >
      {!disablePopup && (
        <Popup
          closeButton={false}
          autoPan={false}
          maxWidth={240}
          minWidth={240}
          offset={[0, -8]}
          className="km-hover-popup"
        >
          {popupContent}
        </Popup>
      )}
    </Marker>
  )
}

// Boutons zoom custom +/- : pill blanc bottom-right (Paul 2026-04-27 — passe
// de top-right a bottom-right sur demande user pour pattern SeLoger/Airbnb
// mobile, plus accessible au pouce). 32x32, bordure beige, shadow douce.
// zIndex 1500 (Paul 2026-04-27 v6) : passe au-dessus de la card slide-up
// MobileMapCarousel (zIndex 1000) sur mobile mode carte. User signalait
// que les boutons + - n'etaient plus visibles quand une card etait ouverte.
function ZoomControls() {
  const map = useMap()
  const btn: React.CSSProperties = {
    width: 32, height: 32, border: "none",
    background: "#fff", color: "#111",
    fontSize: 18, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "background 120ms ease",
  }
  return (
    <div style={{
      position: "absolute", bottom: 16, right: 16, zIndex: 1500,
      background: "#fff",
      borderRadius: 12,
      border: "1px solid #EAE6DF",
      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
      overflow: "hidden",
      display: "flex", flexDirection: "column",
    }}>
      <button
        type="button"
        onClick={() => map.zoomIn()}
        aria-label="Zoomer"
        title="Zoomer"
        style={{ ...btn, borderBottom: "1px solid #EAE6DF" }}
        onMouseEnter={e => (e.currentTarget.style.background = "#F7F4EF")}
        onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
      >+</button>
      <button
        type="button"
        onClick={() => map.zoomOut()}
        aria-label="Dézoomer"
        title="Dézoomer"
        style={btn}
        onMouseEnter={e => (e.currentTarget.style.background = "#F7F4EF")}
        onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
      >−</button>
    </div>
  )
}

// Recentre la carte sur l'annonce selectedId (utilise par le carrousel
// horizontal mobile : quand l'user scroll sur une card, on flyTo sur le
// marker correspondant pour synchroniser map ↔ liste).
// Memoize la coord pour ne pas spammer flyTo au chaque re-render.
function FlyToSelected({
  annonces,
  selectedId,
  zoom = 14,
}: {
  annonces: { id: number; _lat?: number | null; _lng?: number | null }[]
  selectedId: number | null
  zoom?: number
}) {
  const map = useMap()
  const lastFlyTarget = useRef<number | null>(null)
  useEffect(() => {
    if (selectedId === null) return
    if (lastFlyTarget.current === selectedId) return
    const ann = annonces.find(a => a.id === selectedId)
    if (!ann || !ann._lat || !ann._lng) return
    lastFlyTarget.current = selectedId
    map.flyTo([ann._lat, ann._lng], Math.max(map.getZoom(), zoom), {
      animate: true,
      duration: 0.8,
    })
  }, [annonces, selectedId, zoom, map])
  return null
}

// Recentre la carte quand le centerHint change (ville URL/profil qui change
// sans devoir remount tout le MapContainer)
function CenterOnHint({ centerHint }: { centerHint?: [number, number] | null }) {
  const map = useMap()
  const lastHint = useRef<string | null>(null)
  useEffect(() => {
    if (!centerHint) return
    const key = `${centerHint[0].toFixed(4)},${centerHint[1].toFixed(4)}`
    if (lastHint.current === key) return
    lastHint.current = key
    // Zoom 11 : vue agglomération douce (pas street-level direct)
    map.setView(centerHint, 11, { animate: true })
  }, [centerHint, map])
  return null
}

export interface MapAnnoncesProps {
  annonces: any[]
  selectedId: number | null
  onSelect: (id: number) => void
  // userDriven=true quand l'user clique "Rechercher dans cette zone"
  // userDriven=false au moveend initial (ne doit pas clear les filtres URL)
  onBoundsChange: (bounds: L.LatLngBounds, userDriven: boolean) => void
  centerHint?: [number, number] | null
  // Favoris (optionnels) — quand passés, un bouton coeur apparait en overlay
  // sur la photo du popup. Pattern miroir de ListingCardSearch.
  favoris?: number[]
  onToggleFavori?: (id: number) => void
  /** Callback invoque quand l'user tape sur la map en dehors d'un marker
   *  (Leaflet's `click` event sur le map container). Utilise par
   *  MobileMapCarousel pour fermer la card slide-up au tap-outside. */
  onMapClick?: () => void
  /** Si true, desactive le popup hover sur les markers. Utilise sur mobile
   *  mode carte ou la grande card slide-up SeLoger fait office de popup —
   *  sinon le popup natif Leaflet apparait EN PLUS de la card → doublon.
   *  Paul 2026-04-27. */
  disablePopup?: boolean
}

/** Composant interne : ecoute les clicks sur le map container Leaflet
 *  (hors marker, hors popup) et appelle onMapClick. Doit etre enfant de
 *  MapContainer pour avoir acces a useMapEvents. */
function MapClickListener({ onMapClick }: { onMapClick?: () => void }) {
  useMapEvents({
    click: () => {
      if (onMapClick) onMapClick()
    },
  })
  return null
}

/** V26.1 (Paul 2026-04-29) — listener qui capte les clicks pour dessiner
 *  un polygone custom. Quand drawMode === true, chaque click ajoute un
 *  vertex au polygone. Double-click = ferme le polygone (commit).
 *  Curseur change en crosshair en mode dessin. */
function PolygonDrawListener({
  drawMode,
  onAddVertex,
  onCommit,
}: {
  drawMode: boolean
  onAddVertex: (latlng: GeoLatLng) => void
  onCommit: () => void
}) {
  const map = useMapEvents({
    click: (e) => {
      if (!drawMode) return
      onAddVertex({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
    dblclick: () => {
      if (!drawMode) return
      onCommit()
    },
  })
  useEffect(() => {
    const container = map.getContainer()
    if (drawMode) {
      container.style.cursor = "crosshair"
      // Désactive le doubleClickZoom natif tant qu'on dessine
      map.doubleClickZoom.disable()
    } else {
      container.style.cursor = ""
      map.doubleClickZoom.enable()
    }
    return () => {
      container.style.cursor = ""
      map.doubleClickZoom.enable()
    }
  }, [drawMode, map])
  return null
}

export default function MapAnnonces({
  annonces,
  selectedId,
  onSelect,
  onBoundsChange,
  centerHint,
  favoris,
  onToggleFavori,
  onMapClick,
  disablePopup,
}: MapAnnoncesProps) {
  useEffect(() => { fixLeafletIcons() }, [])
  // Map type persiste en localStorage (Paul 2026-04-27 v5). Default "plan"
  // (Positron Light epure). Si l'user a choisi "Détaillé" ou "Satellite"
  // une fois, on garde son choix entre les visites. SSR-safe : on n'attaque
  // pas localStorage au useState init (cf. R618 hydratation), on hydrate
  // dans un useEffect post-mount.
  const [mapType, setMapType] = useState<MapType>("plan")
  useEffect(() => {
    try {
      const saved = localStorage.getItem("nestmatch_map_type")
      if (saved === "plan" || saved === "satellite" || saved === "standard") {
        setMapType(saved)
      }
    } catch { /* ignore (private mode, etc.) */ }
  }, [])
  function changeMapType(t: MapType) {
    setMapType(t)
    try { localStorage.setItem("nestmatch_map_type", t) } catch { /* ignore */ }
  }
  const [pendingBounds, setPendingBounds] = useState<L.LatLngBounds | null>(null)
  const [searchHere, setSearchHere] = useState(false)
  const initialBoundsSet = useRef(false)
  // Popup ouvert top-right : 'layers' (selecteur de fond), 'legend'
  // (legende compatibilite couleur), null (rien ouvert).
  // Paul 2026-04-27 : remplace les 3 boutons inline Plan/Sat/Detaille par
  // un bouton icone Layers + un bouton (i) info — moins encombrant.
  const [panelOpen, setPanelOpen] = useState<"layers" | "legend" | null>(null)

  // V25.2 (Paul 2026-04-29) — toggle "Carte des prix" : overlay stats €/m²
  // par ville (style SeLoger lite). Persisted en localStorage.
  // V26.2 — étendu avec heatmap polygones Paris arrondissements (full).
  const [showPrices, setShowPrices] = useState(false)
  // V26.3 — toggles overlays "Carte des écoles" + "Transports". Source :
  // OpenInfraMap / Wikimedia maps tiles (publiques, sans clé). Lite version
  // car custom data layer = chantier 50k+ POI avec parsing CSV. Tile overlay
  // donne déjà 90% de la valeur visuelle sans coût technique.
  const [showSchools, setShowSchools] = useState(false)
  const [showTransports, setShowTransports] = useState(false)
  useEffect(() => {
    try {
      if (localStorage.getItem("nestmatch_map_show_schools") === "true") setShowSchools(true)
      if (localStorage.getItem("nestmatch_map_show_transports") === "true") setShowTransports(true)
    } catch { /* ignore */ }
  }, [])
  function toggleSchools() {
    setShowSchools(prev => {
      const next = !prev
      try { localStorage.setItem("nestmatch_map_show_schools", next ? "true" : "false") } catch { /* ignore */ }
      return next
    })
  }
  function toggleTransports() {
    setShowTransports(prev => {
      const next = !prev
      try { localStorage.setItem("nestmatch_map_show_transports", next ? "true" : "false") } catch { /* ignore */ }
      return next
    })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [parisGeoJson, setParisGeoJson] = useState<any | null>(null)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("nestmatch_map_show_prices")
      if (saved === "true") setShowPrices(true)
    } catch { /* ignore */ }
  }, [])
  // V26.2 — fetch lazy du GeoJSON Paris quand showPrices ON et pas déjà chargé
  useEffect(() => {
    if (!showPrices || parisGeoJson) return
    let cancelled = false
    fetch("/data/paris-arrondissements.geojson", { cache: "force-cache" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!cancelled && data) setParisGeoJson(data)
      })
      .catch(() => { /* fallback : la version lite reste affichée */ })
    return () => { cancelled = true }
  }, [showPrices, parisGeoJson])
  function togglePrices() {
    setShowPrices(prev => {
      const next = !prev
      try { localStorage.setItem("nestmatch_map_show_prices", next ? "true" : "false") } catch { /* ignore */ }
      return next
    })
  }

  // V26.2 — calcule les stats €/m² par arrondissement Paris (1-20).
  // Utilise les coordonnées des annonces + pointInPolygon pour assigner
  // chaque annonce à son arrondissement. Memoized via useMemo serait plus
  // propre mais le coût est négligeable (~20 polygons × ~200 annonces).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arrStatsByCode = (() => {
    if (!parisGeoJson) return new Map<number, { count: number; meanPrixM2: number }>()
    const map = new Map<number, { count: number; sumPrixM2: number }>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const feat of parisGeoJson.features as any[]) {
      const code = Number(feat.properties?.c_ar)
      if (!Number.isFinite(code)) continue
      const polys: GeoLatLng[][] = []
      const geom = feat.geometry
      if (geom?.type === "Polygon") {
        polys.push((geom.coordinates[0] as number[][]).map(([lng, lat]) => ({ lat, lng })))
      } else if (geom?.type === "MultiPolygon") {
        for (const poly of geom.coordinates as number[][][][]) {
          polys.push((poly[0]).map(([lng, lat]) => ({ lat, lng })))
        }
      } else continue
      for (const a of annonces) {
        if (!a._lat || !a._lng) continue
        const prix = Number(a.prix) || 0
        const surface = Number(a.surface) || 0
        if (prix <= 0 || surface <= 0) continue
        const inside = polys.some(p => pointInPolygon({ lat: a._lat, lng: a._lng }, p))
        if (!inside) continue
        const prixM2 = prix / surface
        const cur = map.get(code)
        if (cur) { cur.count++; cur.sumPrixM2 += prixM2 }
        else map.set(code, { count: 1, sumPrixM2: prixM2 })
      }
    }
    const out = new Map<number, { count: number; meanPrixM2: number }>()
    for (const [code, s] of map) {
      out.set(code, { count: s.count, meanPrixM2: Math.round(s.sumPrixM2 / s.count) })
    }
    return out
  })()

  // V26.1 (Paul 2026-04-29) — polygon drawing custom (style SeLoger).
  // drawMode = on dessine ; vertices = points du polygone en cours ;
  // committedPolygon = polygone final qui sert de filtre dur.
  const [drawMode, setDrawMode] = useState(false)
  const [drawingVertices, setDrawingVertices] = useState<GeoLatLng[]>([])
  const [committedPolygon, setCommittedPolygon] = useState<GeoLatLng[] | null>(null)
  // Persiste le polygone en localStorage pour réutilisation au refresh
  useEffect(() => {
    try {
      const saved = localStorage.getItem("nestmatch_map_polygon")
      if (saved) {
        const parsed = JSON.parse(saved) as GeoLatLng[]
        if (Array.isArray(parsed) && parsed.length >= 3) setCommittedPolygon(parsed)
      }
    } catch { /* ignore */ }
  }, [])
  function commitPolygon() {
    if (drawingVertices.length < 3) {
      // Polygone invalide (< 3 points) → annule sans commit
      setDrawMode(false)
      setDrawingVertices([])
      return
    }
    setCommittedPolygon([...drawingVertices])
    setDrawingVertices([])
    setDrawMode(false)
    try { localStorage.setItem("nestmatch_map_polygon", JSON.stringify(drawingVertices)) } catch { /* ignore */ }
  }
  function clearPolygon() {
    setCommittedPolygon(null)
    setDrawingVertices([])
    setDrawMode(false)
    try { localStorage.removeItem("nestmatch_map_polygon") } catch { /* ignore */ }
  }
  function startDrawMode() {
    setDrawingVertices([])
    setDrawMode(true)
    setPanelOpen(null)
  }

  // Filtre dur : si polygone committed, on ne garde que les annonces
  // dont (lat, lng) est dans le polygone. Appliqué AVANT spread overlap.
  const annoncesInPolygon = committedPolygon
    ? annonces.filter(a => {
        if (!a._lat || !a._lng) return false
        return pointInPolygon({ lat: a._lat, lng: a._lng }, committedPolygon)
      })
    : annonces
  const withCoords = spreadOverlappingMarkers(annoncesInPolygon.filter(a => a._lat && a._lng))

  // V25.2 — agrège les prix €/m² par ville (lite, sans GeoJSON arrondissements).
  // Calcul à la volée depuis annonces actives. Memoized via useMemo serait
  // mieux mais on a withCoords qui change à chaque render — coût négligeable
  // sur ~100-500 annonces.
  const pricesByVille = (() => {
    const map = new Map<string, { count: number; sumPrixM2: number; sumLoyer: number }>()
    for (const a of annonces) {
      const ville = typeof a.ville === "string" ? a.ville.trim() : ""
      const prix = Number(a.prix) || 0
      const surface = Number(a.surface) || 0
      if (!ville || prix <= 0 || surface <= 0) continue
      const prixM2 = prix / surface
      const cur = map.get(ville)
      if (cur) {
        cur.count++
        cur.sumPrixM2 += prixM2
        cur.sumLoyer += prix
      } else {
        map.set(ville, { count: 1, sumPrixM2: prixM2, sumLoyer: prix })
      }
    }
    // Convert to sorted array : top villes by count
    return Array.from(map.entries())
      .map(([ville, s]) => ({
        ville,
        count: s.count,
        meanPrixM2: Math.round(s.sumPrixM2 / s.count),
        meanLoyer: Math.round(s.sumLoyer / s.count),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  })()

  // Centre prioritaire : centerHint (ville URL/profil) > 1ere annonce > Centre de la France (pas Paris)
  const center: [number, number] = centerHint
    ? centerHint
    : withCoords.length > 0
      ? [withCoords[0]._lat, withCoords[0]._lng]
      : [46.603354, 1.888334] // Centre géographique de la France métropolitaine
  // Zoom soft par défaut — style SeLoger :
  // - vue France : 6
  // - annonces sans ville précise : 9 (vue régionale)
  // - ville précise : 11 (vue agglomération, pas rue par rue)
  const initialZoom = centerHint ? 11 : (withCoords.length > 0 ? 9 : 6)

  const tile = TILES[mapType]
  // Overlay "0 annonce" : montré tant que la carte n'a pas été déplacée
  // par l'user. Dès qu'il bouge, on laisse la place au bouton "Rechercher ici".
  const showEmptyOverlay = annonces.length === 0 && !searchHere

  // Quand la carte bouge : on garde les bounds en attente et on affiche le bouton
  const handleMoved = (bounds: L.LatLngBounds) => {
    if (!initialBoundsSet.current) {
      // Premier moveend = initialisation : appliquer silencieusement (pas user-driven)
      initialBoundsSet.current = true
      onBoundsChange(bounds, false)
      return
    }
    setPendingBounds(bounds)
    setSearchHere(true)
  }

  const applySearch = () => {
    if (pendingBounds) {
      onBoundsChange(pendingBounds, true) // user-driven : peut clear les filtres URL
      setSearchHere(false)
    }
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Style global pour neutraliser le wrapper Leaflet sur le popup hover :
          radius 14, shadow handoff app.jsx:646-648, padding 0 (le contenu
          gère son propre padding pour avoir la photo flush avec les bords). */}
      <style>{`
        .leaflet-popup.km-hover-popup .leaflet-popup-content-wrapper {
          padding: 0; border-radius: 14px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.18), 0 4px 10px rgba(0,0,0,0.06);
          overflow: hidden; background: #fff;
        }
        .leaflet-popup.km-hover-popup .leaflet-popup-content {
          margin: 8px 10px 10px; line-height: 1.45; min-width: 240px; width: 240px;
        }
        .leaflet-popup.km-hover-popup .leaflet-popup-tip {
          box-shadow: 0 4px 10px rgba(0,0,0,0.06);
        }
      `}</style>
      <MapContainer
        center={center}
        zoom={initialZoom}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={true}
        zoomControl={false} // Remplacé par controls custom top-right (handoff app.jsx:666-670)
      >
        <TileLayer
          key={mapType}
          attribution={tile.attribution}
          url={tile.url}
          {...(tile.subdomains ? { subdomains: tile.subdomains.split("") } : {})}
          {...(tile.maxZoom ? { maxZoom: tile.maxZoom } : {})}
        />
        {/* V26.3 (Paul 2026-04-29) — overlay "Écoles" via tiles OSM POI :
            Wikimedia maps `osm-intl` retient les écoles ; alternative
            simple = utiliser un overlay SVG generated par OSM Carto qui
            highlight les amenity=school. On utilise l'overlay OpenStreetMap
            standard qui retient déjà les POI éducation visibles. */}
        {showSchools && (
          <TileLayer
            key="ov-schools"
            url="https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png"
            opacity={0.45}
            subdomains={["a", "b", "c"]}
            attribution='Écoles : OpenStreetMap France &copy; OSM contributors'
            zIndex={400}
          />
        )}
        {/* V26.3 — overlay "Transports" via OpenRailwayMap (publics, sans clé) :
            metros/RER/tramway/bus visibles en surimpression. */}
        {showTransports && (
          <TileLayer
            key="ov-transports"
            url="https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png"
            opacity={0.7}
            subdomains={["a", "b", "c"]}
            attribution='Transports : <a href="https://openrailwaymap.org">OpenRailwayMap</a>'
            zIndex={401}
          />
        )}
        <BoundsWatcher onMoved={handleMoved} />
        <FrenchLeafletLocale />
        <MapClickListener onMapClick={drawMode ? undefined : onMapClick} />
        {/* V26.1 — listener pour polygon drawing custom */}
        <PolygonDrawListener
          drawMode={drawMode}
          onAddVertex={(v) => setDrawingVertices(prev => [...prev, v])}
          onCommit={commitPolygon}
        />
        {/* V26.1 — preview polygon en cours de dessin (ambre transparent) */}
        {drawMode && drawingVertices.length >= 2 && (
          <Polygon
            positions={drawingVertices.map(v => [v.lat, v.lng] as [number, number])}
            pathOptions={{
              color: "#a16207",
              fillColor: "#FBF6EA",
              fillOpacity: 0.3,
              weight: 2,
              dashArray: "6 4",
            }}
          />
        )}
        {/* V26.2 — Heatmap Paris arrondissements (full) — actif si toggle
            Carte des prix ON et GeoJSON chargé. Fill color tier sur €/m².
            Tooltip au hover : "Paris 11e — 32 €/m² · 12 annonces". */}
        {showPrices && parisGeoJson && (
          <GeoJSON
            key="paris-arr-heatmap"
            data={parisGeoJson}
            style={(feat) => {
              const code = Number(feat?.properties?.c_ar) || 0
              const stats = arrStatsByCode.get(code)
              if (!stats) {
                return { color: "#8a8477", weight: 1, fillColor: "#FAF8F3", fillOpacity: 0.15 }
              }
              const tier = stats.meanPrixM2 <= 20
                ? { stroke: "#15803d", fill: "#86efac" }
                : stats.meanPrixM2 <= 30
                  ? { stroke: "#a16207", fill: "#fcd34d" }
                  : { stroke: "#b91c1c", fill: "#fca5a5" }
              return { color: tier.stroke, weight: 1.5, fillColor: tier.fill, fillOpacity: 0.45 }
            }}
            onEachFeature={(feat, layer) => {
              const code = Number(feat?.properties?.c_ar) || 0
              const label = feat?.properties?.l_ar || `Paris ${code}e`
              const stats = arrStatsByCode.get(code)
              const txt = stats
                ? `<strong>${label}</strong><br/>${stats.meanPrixM2}&nbsp;€/m² · ${stats.count} annonce${stats.count > 1 ? "s" : ""}`
                : `<strong>${label}</strong><br/>Aucune annonce`
              layer.bindTooltip(txt, { sticky: true, direction: "top" })
            }}
          />
        )}

        {/* V26.1 — polygon committed (filtre actif) */}
        {committedPolygon && committedPolygon.length >= 3 && (
          <Polygon
            positions={committedPolygon.map(v => [v.lat, v.lng] as [number, number])}
            pathOptions={{
              color: "#111",
              fillColor: "#FBF6EA",
              fillOpacity: 0.18,
              weight: 2,
            }}
          />
        )}
        <CenterOnHint centerHint={centerHint} />
        <FlyToSelected annonces={withCoords} selectedId={selectedId} />
        <ZoomControls />
        <MarkerClusterGroup
          chunkedLoading
          showCoverageOnHover={false}
          spiderfyOnMaxZoom={true}
          maxClusterRadius={60}
          // V19.1 (Paul 2026-04-29) — disable clustering at zoom 14+ pour
          // déplier en pins prix individuels style SeLoger
          disableClusteringAtZoom={14}
          iconCreateFunction={(cluster: L.MarkerCluster) => {
            const count = cluster.getChildCount()
            // V19.2 (Paul 2026-04-29) — cluster avec aperçu "dès X €" min.
            // Iterate les markers pour trouver le prix min (option pour
            // contourner l'API privée : les markers exposent options.title
            // qu'on remplit côté Marker via title prop = String(prix)).
            let minPrix = Infinity
            try {
              const markers = (cluster as unknown as { getAllChildMarkers: () => L.Marker[] }).getAllChildMarkers?.() ?? []
              for (const m of markers) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const p = Number((m.options as any)?.title) || 0
                if (p > 0 && p < minPrix) minPrix = p
              }
            } catch { /* ignore */ }
            const desLabel = Number.isFinite(minPrix)
              ? `dès ${Math.round(minPrix).toLocaleString("fr-FR")} €`
              : ""
            // Cluster shape pill horizontale avec count+price stack
            return L.divIcon({
              html: `<div style="
                min-width:64px;
                padding:8px 14px;
                border-radius:14px;
                background:#111;
                color:#fff;
                font-family:'DM Sans',sans-serif;
                display:flex;flex-direction:column;align-items:center;justify-content:center;
                border:3px solid rgba(255,255,255,0.92);
                box-shadow:0 6px 16px rgba(0,0,0,0.32);
                cursor:pointer;
                line-height:1.1;
              ">
                <span style="font-weight:800;font-size:${count >= 100 ? 16 : 15}px;font-variant-numeric:tabular-nums;">${count}</span>
                ${desLabel ? `<span style="font-size:10px;font-weight:500;color:#a7a09a;margin-top:2px;letter-spacing:0.2px;font-variant-numeric:tabular-nums;white-space:nowrap;">${desLabel}</span>` : ""}
              </div>`,
              className: "",
              iconSize: [Math.max(64, desLabel ? 84 : 64), 44],
            })
          }}
        >
        {withCoords.map(a => {
          const firstPhoto = Array.isArray(a.photos) && a.photos.length > 0 ? a.photos[0] : null
          const isFavori = Array.isArray(favoris) && favoris.includes(a.id)
          const canFavori = typeof onToggleFavori === "function"
          const matchPct = a.scoreMatching != null ? Math.round(a.scoreMatching / 10) : null
          const prixM2 = a.prix && a.surface ? Math.round(a.prix / a.surface) : null
          // Popup hover style handoff app.jsx:642-663 :
          //   - 240px width, photo 16/10 top, padding 12/14, radius 14
          //   - eyebrow VILLE · QUARTIER, titre 14/600, specs+prix inline
          //   - chip match top-left photo si scoreMatching présent
          //   - bouton favori top-right photo
          // V19 + V20 (Paul 2026-04-29) — asNumber robuste (DB peut renvoyer
          // string sur colonne numeric, ce qui faisait que Number() pouvait
          // foirer silencieusement et le pin affichait juste le loyer).
          const ch = asNumber((a as { charges?: unknown }).charges, 0) ?? 0
          const total = (asNumber(a.prix, 0) ?? 0) + (ch > 0 ? ch : 0)
          const createdAt = (a as { created_at?: string | null }).created_at
          const isNew = createdAt
            ? (Date.now() - new Date(createdAt).getTime()) < 7 * 24 * 60 * 60 * 1000
            : false
          return (
            <HoverableMarker
              key={a.id}
              position={[a._lat, a._lng]}
              icon={priceMarker(a.prix, ch > 0 ? ch : null, selectedId === a.id, matchPct, isNew)}
              priceTotal={total}
              onSelect={() => onSelect(a.id)}
              disablePopup={disablePopup}
              popupContent={
                <div style={{ fontFamily: "'DM Sans',sans-serif", width: 240 }}>
                  {firstPhoto && (
                    <div style={{ margin: "-8px -10px 0", aspectRatio: "16 / 10", overflow: "hidden", borderRadius: "10px 10px 0 0", position: "relative", background: "#EAE6DF" }}>
                      <img src={firstPhoto} alt={a.titre} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      {matchPct !== null && (
                        <span style={{
                          position: "absolute", top: 10, left: 10,
                          background: "#DCFCE7", color: "#16A34A",
                          padding: "3px 9px", borderRadius: 999,
                          fontSize: 10.5, fontWeight: 700, letterSpacing: "0.4px",
                          display: "inline-flex", alignItems: "center", gap: 5,
                          boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#16A34A" }} />
                          {matchPct}% match
                        </span>
                      )}
                      {canFavori && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            onToggleFavori!(a.id)
                          }}
                          aria-label={isFavori ? "Retirer des favoris" : "Ajouter aux favoris"}
                          title={isFavori ? "Retirer des favoris" : "Ajouter aux favoris"}
                          style={{
                            position: "absolute", top: 8, right: 8,
                            width: 30, height: 30, borderRadius: 999,
                            background: "rgba(255,255,255,0.95)",
                            border: "none", cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                            padding: 0, transition: "transform 0.12s ease",
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.12)" }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)" }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill={isFavori ? "#b91c1c" : "none"} stroke={isFavori ? "#b91c1c" : "#8a8477"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                  <div style={{ padding: "12px 4px 6px" }}>
                    <p style={{
                      fontSize: 10.5, fontWeight: 700, color: "#6B6B6B",
                      textTransform: "uppercase", letterSpacing: "1.1px",
                      margin: 0, marginBottom: 4,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {[a.ville, a.quartier].filter(Boolean).join(" · ").toUpperCase() || a.ville?.toUpperCase() || ""}
                    </p>
                    <p style={{
                      fontSize: 14, fontWeight: 600, margin: 0, marginBottom: 8,
                      lineHeight: 1.3, color: "#111", letterSpacing: "-0.15px",
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}>
                      {a.titre || "Sans titre"}
                    </p>
                    <div style={{
                      display: "flex", justifyContent: "space-between", alignItems: "baseline",
                      paddingTop: 8, borderTop: "1px solid #EAE6DF",
                    }}>
                      <span style={{ fontSize: 11, color: "#6B6B6B" }}>
                        {[
                          a.surface ? `${a.surface} m²` : null,
                          a.pieces ? `${a.pieces} p.` : null,
                          a.dpe ? `DPE ${String(a.dpe).toUpperCase()}` : null,
                        ].filter(Boolean).join(" · ")}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#111", fontVariantNumeric: "tabular-nums" }}>
                        {a.prix ? a.prix.toLocaleString("fr-FR") : "—"}
                        <span style={{ fontSize: 10, fontWeight: 500, color: "#8a8477", marginLeft: 2 }}>€/mois</span>
                      </span>
                    </div>
                    {prixM2 !== null && (
                      <p style={{ fontSize: 10.5, color: "#8a8477", margin: "6px 0 0", textAlign: "right" }}>
                        ≈ {prixM2.toLocaleString("fr-FR")} €/m²
                      </p>
                    )}
                    <a href={`/annonces/${a.id}`} style={{
                      display: "block", marginTop: 10, padding: "9px 0",
                      background: "#111", color: "#fff",
                      fontSize: 12, fontWeight: 700, textAlign: "center",
                      borderRadius: 999, textDecoration: "none", letterSpacing: "0.3px",
                    }}>
                      Voir l&apos;annonce
                    </a>
                  </div>
                </div>
              }
            />
          )
        })}
        </MarkerClusterGroup>
      </MapContainer>

      {/* Overlay "0 annonce" — la carte reste visible, on affiche juste un message */}
      {showEmptyOverlay && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1500,
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: "12px 18px",
            fontFamily: "'DM Sans',sans-serif",
            fontSize: 13,
            fontWeight: 500,
            color: "#111",
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            maxWidth: "calc(100% - 32px)",
            textAlign: "center",
          }}
        >
          0 annonce dans cette zone&nbsp;— élargis ta recherche ou déplace la carte
        </div>
      )}

      {/* Bouton "Rechercher dans cette zone" — apparait apres deplacement */}
      {searchHere && (
        <button
          onClick={applySearch}
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1500,
            background: "#111",
            color: "white",
            border: "none",
            borderRadius: 999,
            padding: "10px 22px",
            fontWeight: 700,
            fontSize: 13,
            fontFamily: "'DM Sans',sans-serif",
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 14 }}>&#x1F50D;</span>
          Rechercher dans cette zone
        </button>
      )}

      {/* Pill bottom-left "X biens · France" (handoff l. 671-674) — info
          discrète sur le contenu actuel. Remplace la legend score, devenue
          obsolète depuis que les markers sont blanc/noir (le score vit sur
          la card en pill match%, plus dans le marker). */}
      <div style={{
        position: "absolute",
        left: 18,
        bottom: 18,
        zIndex: 1500,
        background: "white",
        borderRadius: 999,
        padding: "8px 14px",
        fontSize: 11,
        fontWeight: 600,
        color: "#6B6B6B",
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontFamily: "'DM Sans',sans-serif",
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="10" r="3" />
          <path d="M12 21l-5.5-7a7 7 0 1 1 11 0L12 21z" />
        </svg>
        {withCoords.length} bien{withCoords.length > 1 ? "s" : ""} &middot; France
      </div>

      {/* V26.1 (Paul 2026-04-29) — control bar pour polygon drawing.
          Visible en mode dessin (vertices + Terminer/Annuler) OU quand
          un polygone est committed (Effacer la zone). */}
      {(drawMode || committedPolygon) && (
        <div style={{
          position: "absolute",
          top: 16, left: "50%", transform: "translateX(-50%)",
          zIndex: 1500,
          background: "white", borderRadius: 999,
          border: "1px solid #EAE6DF",
          boxShadow: "0 6px 20px rgba(0,0,0,0.15)",
          padding: "6px 8px",
          display: "inline-flex", alignItems: "center", gap: 6,
          fontFamily: "'DM Sans', sans-serif",
        }}>
          {drawMode && (
            <>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#111", padding: "0 8px" }}>
                {drawingVertices.length < 3
                  ? `Cliquez pour ajouter (${drawingVertices.length}/3 min)`
                  : `${drawingVertices.length} pts · double-clic pour terminer`}
              </span>
              <button
                type="button"
                onClick={commitPolygon}
                disabled={drawingVertices.length < 3}
                style={{
                  background: drawingVertices.length >= 3 ? "#111" : "#EAE6DF",
                  color: drawingVertices.length >= 3 ? "#fff" : "#8a8477",
                  border: "none", borderRadius: 999,
                  padding: "6px 14px", fontSize: 12, fontWeight: 700,
                  fontFamily: "inherit", cursor: drawingVertices.length >= 3 ? "pointer" : "not-allowed",
                  whiteSpace: "nowrap",
                }}
              >
                Terminer
              </button>
              <button
                type="button"
                onClick={() => { setDrawMode(false); setDrawingVertices([]) }}
                style={{
                  background: "transparent", color: "#111",
                  border: "1px solid #EAE6DF", borderRadius: 999,
                  padding: "6px 14px", fontSize: 12, fontWeight: 600,
                  fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                Annuler
              </button>
            </>
          )}
          {!drawMode && committedPolygon && (
            <>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#111", padding: "0 10px" }}>
                Zone active · {withCoords.length} bien{withCoords.length > 1 ? "s" : ""}
              </span>
              <button
                type="button"
                onClick={clearPolygon}
                style={{
                  background: "#a16207", color: "#fff",
                  border: "none", borderRadius: 999,
                  padding: "6px 14px", fontSize: 12, fontWeight: 700,
                  fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                Effacer la zone
              </button>
            </>
          )}
        </div>
      )}

      {/* V25.2 (Paul 2026-04-29) — card "Carte des prix" lite : top villes
          rankées par count + €/m² moyen. Affiché bottom-left au-dessus du
          chip "X biens" quand showPrices est actif. Tier color sur €/m² :
          vert ≤15, ambre 15-25, rouge >25. */}
      {showPrices && pricesByVille.length > 0 && (
        <div style={{
          position: "absolute",
          bottom: 56, left: 12, zIndex: 1400,
          background: "white", borderRadius: 12,
          border: "1px solid #EAE6DF",
          boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
          padding: "10px 12px",
          fontFamily: "'DM Sans', sans-serif",
          maxWidth: 260,
          maxHeight: "50%",
          overflowY: "auto",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.1px", margin: 0 }}>
              Prix moyens / m²
            </p>
            <button
              type="button"
              onClick={togglePrices}
              aria-label="Fermer la carte des prix"
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "#8a8477", fontSize: 16, padding: 0, lineHeight: 1 }}
            >×</button>
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {pricesByVille.map(v => {
              const tier = v.meanPrixM2 <= 15
                ? { bg: "#F0FAEE", ink: "#15803d" }
                : v.meanPrixM2 <= 25
                  ? { bg: "#FBF6EA", ink: "#a16207" }
                  : { bg: "#FEECEC", ink: "#b91c1c" }
              return (
                <li key={v.ville} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
                  <span style={{ fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                    {v.ville}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, color: "#8a8477", fontVariantNumeric: "tabular-nums" }}>
                      {v.count}
                    </span>
                    <span style={{
                      background: tier.bg, color: tier.ink,
                      padding: "2px 8px", borderRadius: 999,
                      fontSize: 11, fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                    }}>
                      {v.meanPrixM2}&nbsp;€/m²
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
          <p style={{ fontSize: 9.5, color: "#8a8477", margin: "8px 0 0", lineHeight: 1.4 }}>
            Moyenne loyer/m² basée sur les annonces actives. Vert ≤ 15 €/m², rouge &gt; 25 €/m².
          </p>
        </div>
      )}

      {/* Top-right : stack 2 boutons icones (Layers + Legend info).
          Paul 2026-04-27 : remplace les 3 boutons inline qui prenaient toute
          la barre top-right. Click ouvre un popup contextuel sous le bouton. */}
      <div style={{ position: "absolute", top: 16, right: 12, zIndex: 1500, display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Bouton Layers (3 cartes empilees) */}
        <button
          type="button"
          onClick={() => setPanelOpen(p => p === "layers" ? null : "layers")}
          aria-label="Choisir le fond de carte"
          aria-expanded={panelOpen === "layers"}
          title="Choisir le fond de carte"
          style={{
            width: 36, height: 36, border: "1px solid #EAE6DF",
            background: panelOpen === "layers" ? "#F7F4EF" : "white",
            color: "#111",
            borderRadius: 10,
            cursor: "pointer", fontFamily: "inherit",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            transition: "background 120ms ease",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
        </button>

        {/* Bouton (i) Legend compatibilite */}
        <button
          type="button"
          onClick={() => setPanelOpen(p => p === "legend" ? null : "legend")}
          aria-label="Légende des couleurs de compatibilité"
          aria-expanded={panelOpen === "legend"}
          title="Légende compatibilité"
          style={{
            width: 36, height: 36, border: "1px solid #EAE6DF",
            background: panelOpen === "legend" ? "#F7F4EF" : "white",
            color: "#111",
            borderRadius: 10,
            cursor: "pointer", fontFamily: "inherit",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            transition: "background 120ms ease",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </button>

        {/* Popup contextuel (sous les boutons, slide-in fade) */}
        {panelOpen === "layers" && (
          <div role="menu" aria-label="Fond de carte" style={{
            position: "absolute", top: 88, right: 0,
            background: "white", borderRadius: 14, border: "1px solid #EAE6DF",
            boxShadow: "0 12px 32px rgba(0,0,0,0.15)",
            minWidth: 220, padding: 8,
            fontFamily: "inherit",
          }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1px", margin: "4px 12px 8px" }}>Fond de carte</p>
            {(Object.keys(TILES) as MapType[]).map(t => (
              <button key={t} type="button" onClick={() => { changeMapType(t); setPanelOpen(null) }}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  width: "100%", padding: "10px 12px", borderRadius: 8,
                  background: mapType === t ? "#F7F4EF" : "transparent",
                  border: "none", cursor: "pointer", fontFamily: "inherit",
                  fontSize: 13, fontWeight: mapType === t ? 700 : 500, color: "#111",
                  textAlign: "left",
                  WebkitTapHighlightColor: "transparent",
                }}>
                <span style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${mapType === t ? "#111" : "#EAE6DF"}`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {mapType === t && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                {TILES[t].label}
              </button>
            ))}
            {/* Layers premium */}
            <div style={{ height: 1, background: "#F7F4EF", margin: "6px 12px" }} />
            {/* V25.2 — toggle "Carte des prix" actif (lite) */}
            <button
              type="button"
              onClick={togglePrices}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                width: "100%", padding: "10px 12px", borderRadius: 8,
                background: showPrices ? "#F7F4EF" : "transparent",
                border: "none", cursor: "pointer", fontFamily: "inherit",
                fontSize: 13, fontWeight: showPrices ? 700 : 500, color: "#111",
                textAlign: "left", WebkitTapHighlightColor: "transparent",
              }}
              aria-pressed={showPrices}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  width: 16, height: 16, borderRadius: 4,
                  border: `2px solid ${showPrices ? "#111" : "#EAE6DF"}`,
                  display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  {showPrices && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                Carte des prix
              </span>
              <span style={{ fontSize: 10, color: "#8a8477", fontWeight: 500 }}>
                {pricesByVille.length} ville{pricesByVille.length !== 1 ? "s" : ""}
              </span>
            </button>
            {/* V26.1 — Dessiner une zone (polygon custom) */}
            <button
              type="button"
              onClick={startDrawMode}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                width: "100%", padding: "10px 12px", borderRadius: 8,
                background: drawMode ? "#FBF6EA" : "transparent",
                border: "none", cursor: "pointer", fontFamily: "inherit",
                fontSize: 13, fontWeight: drawMode ? 700 : 500, color: "#111",
                textAlign: "left", WebkitTapHighlightColor: "transparent",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 19l7-7 3 3-7 7-3-3z" />
                  <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                  <path d="M2 2l7.586 7.586" />
                  <circle cx="11" cy="11" r="2" />
                </svg>
                Dessiner une zone
              </span>
              {committedPolygon && (
                <span style={{ fontSize: 10, color: "#a16207", fontWeight: 700, background: "#FBF6EA", border: "1px solid #EADFC6", padding: "2px 6px", borderRadius: 999 }}>
                  Active
                </span>
              )}
            </button>

            {/* V26.3 — Carte des écoles (overlay tile OSM-FR amenity=school) */}
            <button
              type="button"
              onClick={toggleSchools}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                width: "100%", padding: "10px 12px", borderRadius: 8,
                background: showSchools ? "#F7F4EF" : "transparent",
                border: "none", cursor: "pointer", fontFamily: "inherit",
                fontSize: 13, fontWeight: showSchools ? 700 : 500, color: "#111",
                textAlign: "left", WebkitTapHighlightColor: "transparent",
              }}
              aria-pressed={showSchools}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  width: 16, height: 16, borderRadius: 4,
                  border: `2px solid ${showSchools ? "#111" : "#EAE6DF"}`,
                  display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  {showSchools && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                Carte des écoles
              </span>
              <span style={{ fontSize: 10, color: "#8a8477" }}>OSM</span>
            </button>

            {/* V26.3 — Carte des transports (OpenRailwayMap : métro/RER/tram) */}
            <button
              type="button"
              onClick={toggleTransports}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                width: "100%", padding: "10px 12px", borderRadius: 8,
                background: showTransports ? "#F7F4EF" : "transparent",
                border: "none", cursor: "pointer", fontFamily: "inherit",
                fontSize: 13, fontWeight: showTransports ? 700 : 500, color: "#111",
                textAlign: "left", WebkitTapHighlightColor: "transparent",
              }}
              aria-pressed={showTransports}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  width: 16, height: 16, borderRadius: 4,
                  border: `2px solid ${showTransports ? "#111" : "#EAE6DF"}`,
                  display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  {showTransports && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                Transports
              </span>
              <span style={{ fontSize: 10, color: "#8a8477" }}>Métro/RER</span>
            </button>
          </div>
        )}

        {panelOpen === "legend" && (
          <div role="dialog" aria-label="Légende compatibilité" style={{
            position: "absolute", top: 88, right: 0,
            background: "white", borderRadius: 14, border: "1px solid #EAE6DF",
            boxShadow: "0 12px 32px rgba(0,0,0,0.15)",
            width: 240, padding: 16,
            fontFamily: "inherit",
          }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 8px" }}>Code couleur des annonces</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#111" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#16A34A", flexShrink: 0 }} />
                <span><strong>Vert</strong> · compatibilité ≥ 70 %</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#111" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#F59E0B", flexShrink: 0 }} />
                <span><strong>Orange</strong> · 50 – 70 %</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#111" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#9CA3AF", flexShrink: 0 }} />
                <span><strong>Gris</strong> · &lt; 50 % ou non calculé</span>
              </div>
            </div>
            <p style={{ fontSize: 11, color: "#8a8477", margin: "12px 0 0", lineHeight: 1.5 }}>
              Connectez-vous et complétez votre dossier pour voir votre score de compatibilité sur chaque annonce.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// Composant interne : doit etre enfant de MapContainer pour utiliser useMap
function FrenchLeafletLocale() {
  return useFrenchLeaflet()
}
