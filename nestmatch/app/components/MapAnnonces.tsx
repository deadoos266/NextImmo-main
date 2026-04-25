"use client"
import { useEffect, useState, useRef } from "react"
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

type MapType = "plan" | "satellite" | "standard"

// Tuiles par défaut = CARTO Voyager (rendu sobre gris clair premium, style
// proche SeLoger/Airbnb, GRATUIT sans clé API, subdomains {a,b,c,d}, labels
// OSM en français pour les villes FR). Remplace Stadia (qui retourne 401
// sans token malgré la doc "free tier").
// https://carto.com/basemaps/
// Mode "Détaillé" = OSM France (labels FR, plus dense au zoom street-level).
// Satellite = Esri World Imagery (pas d'alternative française gratuite
// équivalente sans clé API).
const TILES: Record<MapType, { url: string; attribution: string; label: string; soft?: boolean }> = {
  plan: {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &middot; &copy; <a href="https://carto.com/">CARTO</a>',
    label: "Plan",
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
function priceMarker(prix: number, selected: boolean, _score: number | null) {
  void _score
  const price = prix ? prix.toLocaleString("fr-FR") + " \u20ac" : "\u2014"
  const bg = selected ? "#111" : "#fff"
  const text = selected ? "#fff" : "#111"
  const borderW = selected ? 2 : 1.5
  const scale = selected ? 1.08 : 1
  const dotColor = "#16A34A"
  // Arrow bottom-center : div 10\u00d710 rotated 45deg en absolute, juste sous le pill
  const arrow = selected
    ? `<span style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%) rotate(45deg);width:10px;height:10px;background:#111;"></span>`
    : ""
  return L.divIcon({
    html: `<div style="
      position:relative;
      transform:scale(${scale});
      transform-origin:center bottom;
      background:${bg};
      color:${text};
      border:${borderW}px solid #111;
      padding:6px 12px 6px 10px;
      border-radius:999px;
      font-weight:700;
      font-size:13px;
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
      ${arrow}
    </div>`,
    className: "",
    iconSize: [80, 30],
    iconAnchor: [40, 30],
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
}

export default function MapAnnonces({
  annonces,
  selectedId,
  onSelect,
  onBoundsChange,
  centerHint,
  favoris,
  onToggleFavori,
}: MapAnnoncesProps) {
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
        />
        <BoundsWatcher onMoved={handleMoved} />
        <FrenchLeafletLocale />
        <CenterOnHint centerHint={centerHint} />
        {withCoords.map(a => {
          const firstPhoto = Array.isArray(a.photos) && a.photos.length > 0 ? a.photos[0] : null
          const isFavori = Array.isArray(favoris) && favoris.includes(a.id)
          const canFavori = typeof onToggleFavori === "function"
          return (
            <Marker
              key={a.id}
              position={[a._lat, a._lng]}
              icon={priceMarker(a.prix, selectedId === a.id, a.scoreMatching ?? null)}
              eventHandlers={{
                click: () => onSelect(a.id),
                mouseover: () => onSelect(a.id),
              }}
            >
              <Popup>
                <div style={{ fontFamily: "'DM Sans',sans-serif", minWidth: 180 }}>
                  {firstPhoto && (
                    <div style={{ margin: "-8px -12px 10px", height: 110, overflow: "hidden", borderRadius: "8px 8px 0 0", position: "relative" }}>
                      <img src={firstPhoto} alt={a.titre} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
                            position: "absolute",
                            top: 8,
                            right: 8,
                            width: 30,
                            height: 30,
                            borderRadius: 999,
                            background: "rgba(255,255,255,0.95)",
                            border: "none",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                            padding: 0,
                            transition: "transform 0.12s ease",
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.12)" }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)" }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill={isFavori ? "#b91c1c" : "none"} stroke={isFavori ? "#b91c1c" : "#8a8477"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                  <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{a.titre}</p>
                  <p style={{ color: "#8a8477", fontSize: 12 }}>{a.surface} m&sup2; &middot; {a.pieces} p. &middot; {a.ville}</p>
                  <p style={{ fontWeight: 800, fontSize: 14, margin: "6px 0" }}>{a.prix} &euro;/mois</p>
                  <a href={`/annonces/${a.id}`} style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>Voir l'annonce &rarr;</a>
                </div>
              </Popup>
            </Marker>
          )
        })}
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
            zIndex: 1000,
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

      {/* Pill bottom-left "X biens · France" (handoff l. 671-674) — info
          discrète sur le contenu actuel. Remplace la legend score, devenue
          obsolète depuis que les markers sont blanc/noir (le score vit sur
          la card en pill match%, plus dans le marker). */}
      <div style={{
        position: "absolute",
        left: 18,
        bottom: 18,
        zIndex: 1000,
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

      {/* v5.4 : Sélecteur Plan/Satellite/Détaillé déplacé en haut (top-right).
          Le bouton "Rechercher dans cette zone" reste top-center quand actif. */}
      <div style={{
        position: "absolute", top: 16, right: 12, zIndex: 1000,
        background: "white", borderRadius: 10, boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
        display: "flex", overflow: "hidden", border: "1px solid #EAE6DF"
      }}>
        {(Object.keys(TILES) as MapType[]).map((t, i) => (
          <button key={t} onClick={() => setMapType(t)}
            style={{
              padding: "7px 12px", border: "none", cursor: "pointer",
              fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600,
              background: mapType === t ? "#111" : "white",
              color: mapType === t ? "white" : "#111",
              borderRight: i < 2 ? "1px solid #EAE6DF" : "none",
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
