"use client"
import { useEffect, useState, useRef } from "react"
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

type MapType = "plan" | "satellite" | "standard"

// Tuiles OSM France = labels 100% FR. On adoucit le rendu via un filtre CSS
// appliqué sur le TileLayer (voir prop `className`). Style SeLoger = soft mais FR.
const TILES: Record<MapType, { url: string; attribution: string; label: string; soft?: boolean }> = {
  plan: {
    url: "https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.fr/">OpenStreetMap France</a>',
    label: "Plan",
    soft: true,
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "&copy; Esri",
    label: "Satellite",
  },
  standard: {
    url: "https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.fr/">OpenStreetMap France</a>',
    label: "Détaillé",
  },
}

// Fix des icones par defaut de Leaflet (probleme courant avec webpack)
function fixLeafletIcons() {
  delete (L.Icon.Default.prototype as any)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  })
}

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

// Couleur du marqueur = degrade selon score (vert -> orange -> rouge)
function scoreToMarkerColor(score: number | null): { bg: string; border: string; text: string } {
  if (score === null) return { bg: "#111", border: "#111", text: "white" }
  const pct = Math.round(score / 10)
  if (pct >= 80) return { bg: "#16a34a", border: "#15803d", text: "white" }
  if (pct >= 65) return { bg: "#65a30d", border: "#4d7c0f", text: "white" }
  if (pct >= 50) return { bg: "#ca8a04", border: "#a16207", text: "white" }
  if (pct >= 30) return { bg: "#ea580c", border: "#c2410c", text: "white" }
  return { bg: "#dc2626", border: "#b91c1c", text: "white" }
}

function priceMarker(prix: number, selected: boolean, score: number | null) {
  const c = selected
    ? { bg: "#111", border: "#111", text: "white" }
    : scoreToMarkerColor(score)
  const price = prix ? prix.toLocaleString("fr-FR") + " \u20ac" : "\u2014"
  return L.divIcon({
    html: `<div style="
      background:${c.bg};
      color:${c.text};
      border:2px solid ${c.border};
      padding:4px 10px;
      border-radius:999px;
      font-weight:700;
      font-size:12px;
      font-family:'DM Sans',sans-serif;
      white-space:nowrap;
      box-shadow:0 2px 8px rgba(0,0,0,0.25);
      cursor:pointer;
    ">${price}</div>`,
    className: "",
    iconSize: [72, 26],
    iconAnchor: [36, 26],
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

export default function MapAnnonces({
  annonces,
  selectedId,
  onSelect,
  onBoundsChange,
  centerHint,
}: {
  annonces: any[]
  selectedId: number | null
  onSelect: (id: number) => void
  // userDriven=true quand l'user clique "Rechercher dans cette zone"
  // userDriven=false au moveend initial (ne doit pas clear les filtres URL)
  onBoundsChange: (bounds: L.LatLngBounds, userDriven: boolean) => void
  centerHint?: [number, number] | null
}) {
  useEffect(() => { fixLeafletIcons() }, [])
  const [mapType, setMapType] = useState<MapType>("plan")
  const [pendingBounds, setPendingBounds] = useState<L.LatLngBounds | null>(null)
  const [searchHere, setSearchHere] = useState(false)
  const initialBoundsSet = useRef(false)

  const withCoords = spreadOverlappingMarkers(annonces.filter(a => a._lat && a._lng))

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

  if (withCoords.length === 0 && !centerHint) return (
    <div style={{ width: "100%", height: "100%", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <p style={{ color: "#9ca3af", fontSize: 14, textAlign: "center" }}>Aucune annonce avec coordonnées disponibles pour cette recherche</p>
    </div>
  )
  const tile = TILES[mapType]

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
      {/* Filtre CSS doux appliqué à la couche de tuiles OSM France pour un rendu
          moins chargé visuellement (style SeLoger). Le filtre s'applique via
          une classe CSS injectée ci-dessous. */}
      <style>{`.leaflet-tile-soft { filter: saturate(0.72) brightness(1.04) contrast(0.94); }`}</style>
      <MapContainer
        center={center}
        zoom={initialZoom}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={true}
      >
        <TileLayer
          key={mapType}
          attribution={tile.attribution}
          url={tile.url}
          className={tile.soft ? "leaflet-tile-soft" : undefined}
        />
        <BoundsWatcher onMoved={handleMoved} />
        <FrenchLeafletLocale />
        <CenterOnHint centerHint={centerHint} />
        {withCoords.map(a => {
          const firstPhoto = Array.isArray(a.photos) && a.photos.length > 0 ? a.photos[0] : null
          return (
            <Marker
              key={a.id}
              position={[a._lat, a._lng]}
              icon={priceMarker(a.prix, selectedId === a.id, a.scoreMatching ?? null)}
              eventHandlers={{ click: () => onSelect(a.id) }}
            >
              <Popup>
                <div style={{ fontFamily: "'DM Sans',sans-serif", minWidth: 180 }}>
                  {firstPhoto && (
                    <div style={{ margin: "-8px -12px 10px", height: 110, overflow: "hidden", borderRadius: "8px 8px 0 0" }}>
                      <img src={firstPhoto} alt={a.titre} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  )}
                  <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{a.titre}</p>
                  <p style={{ color: "#6b7280", fontSize: 12 }}>{a.surface} m&sup2; &middot; {a.pieces} p. &middot; {a.ville}</p>
                  <p style={{ fontWeight: 800, fontSize: 14, margin: "6px 0" }}>{a.prix} &euro;/mois</p>
                  <a href={`/annonces/${a.id}`} style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>Voir l'annonce &rarr;</a>
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>

      {/* Bouton "Rechercher dans cette zone" — apparait apres deplacement */}
      {searchHere && (
        <button
          onClick={applySearch}
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
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

      {/* Legende compatibilite */}
      <div style={{ position: "absolute", bottom: 24, left: 12, zIndex: 1000, background: "white", borderRadius: 10, boxShadow: "0 2px 12px rgba(0,0,0,0.15)", padding: "8px 12px", border: "1px solid #e5e7eb", display: "flex", flexDirection: "column", gap: 4 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: "#111", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.5px" }}>Compatibilit&eacute;</p>
        {[
          { color: "#16a34a", label: "80% +" },
          { color: "#65a30d", label: "65\u201379%" },
          { color: "#ca8a04", label: "50\u201364%" },
          { color: "#ea580c", label: "30\u201349%" },
          { color: "#dc2626", label: "< 30%" },
        ].map(l => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: 999, background: l.color, border: `2px solid ${l.color}` }} />
            <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "'DM Sans',sans-serif" }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* Selecteur de type de carte */}
      <div style={{
        position: "absolute", bottom: 24, right: 12, zIndex: 1000,
        background: "white", borderRadius: 10, boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
        display: "flex", overflow: "hidden", border: "1px solid #e5e7eb"
      }}>
        {(Object.keys(TILES) as MapType[]).map((t, i) => (
          <button key={t} onClick={() => setMapType(t)}
            style={{
              padding: "7px 12px", border: "none", cursor: "pointer",
              fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600,
              background: mapType === t ? "#111" : "white",
              color: mapType === t ? "white" : "#374151",
              borderRight: i < 2 ? "1px solid #e5e7eb" : "none",
              transition: "all 0.15s",
            }}>
            {TILES[t].label}
          </button>
        ))}
      </div>
    </div>
  )
}

// Composant interne : doit etre enfant de MapContainer pour utiliser useMap
function FrenchLeafletLocale() {
  return useFrenchLeaflet()
}
