"use client"
import { useEffect, useState, useRef } from "react"
import type { ReactNode } from "react"
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
// Clustering : regroupe les markers proches en bulles avec compteur. Au-delà
// d'un certain zoom, le cluster s'éclate en markers individuels. Style
// SeLoger / Idealista. La lib gère elle-même le CSS de leaflet.markercluster.
import MarkerClusterGroup from "react-leaflet-cluster"

type MapType = "plan" | "satellite" | "standard"

// Tuiles par défaut = CARTO Positron Light (Paul 2026-04-27 — switch depuis
// Voyager pour maximiser le contraste avec les pills prix noires style Airbnb).
// Positron : fond très clair quasi-blanc, labels gris fins, axes routiers
// gris pâle. Markers ressortent franchement, lecture rapide des prix.
// GRATUIT sans clé API, subdomains {a,b,c,d}, maxZoom 19, retina @2x via {r}.
// https://github.com/CartoDB/basemap-styles
// Mode "Détaillé" = OSM France (labels FR, plus dense au zoom street-level).
// Satellite = Esri World Imagery (pas d'alternative française gratuite
// équivalente sans clé API).
const TILES: Record<MapType, { url: string; attribution: string; label: string; subdomains?: string; maxZoom?: number; soft?: boolean }> = {
  plan: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
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

// HoverableMarker — wrapper React qui ouvre le popup au survol du marker
// (et le ferme avec un délai de 250ms au mouseout, le temps pour l'user de
// glisser vers le popup pour cliquer dedans). Le click déclenche aussi
// onSelect comme avant. Pattern handoff app.jsx:642-663 (MapSplit).
function HoverableMarker({
  position,
  icon,
  onSelect,
  popupContent,
}: {
  position: [number, number]
  icon: L.DivIcon
  onSelect: () => void
  popupContent: ReactNode
}) {
  const markerRef = useRef<L.Marker | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  return (
    <Marker
      ref={(ref) => { markerRef.current = ref }}
      position={position}
      icon={icon}
      eventHandlers={{
        click: () => onSelect(),
        mouseover: () => {
          if (closeTimer.current) {
            clearTimeout(closeTimer.current)
            closeTimer.current = null
          }
          onSelect()
          markerRef.current?.openPopup()
        },
        mouseout: () => {
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
    </Marker>
  )
}

// Boutons zoom custom +/- : pill blanc bottom-right (Paul 2026-04-27 — passe
// de top-right a bottom-right sur demande user pour pattern SeLoger/Airbnb
// mobile, plus accessible au pouce). 32x32, bordure beige, shadow douce.
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
      position: "absolute", bottom: 16, right: 16, zIndex: 1000,
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

export default function MapAnnonces({
  annonces,
  selectedId,
  onSelect,
  onBoundsChange,
  centerHint,
  favoris,
  onToggleFavori,
  onMapClick,
}: MapAnnoncesProps) {
  useEffect(() => { fixLeafletIcons() }, [])
  const [mapType, setMapType] = useState<MapType>("plan")
  const [pendingBounds, setPendingBounds] = useState<L.LatLngBounds | null>(null)
  const [searchHere, setSearchHere] = useState(false)
  const initialBoundsSet = useRef(false)
  // Popup ouvert top-right : 'layers' (selecteur de fond), 'legend'
  // (legende compatibilite couleur), null (rien ouvert).
  // Paul 2026-04-27 : remplace les 3 boutons inline Plan/Sat/Detaille par
  // un bouton icone Layers + un bouton (i) info — moins encombrant.
  const [panelOpen, setPanelOpen] = useState<"layers" | "legend" | null>(null)

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
        <BoundsWatcher onMoved={handleMoved} />
        <FrenchLeafletLocale />
        <MapClickListener onMapClick={onMapClick} />
        <CenterOnHint centerHint={centerHint} />
        <FlyToSelected annonces={withCoords} selectedId={selectedId} />
        <ZoomControls />
        <MarkerClusterGroup
          chunkedLoading
          showCoverageOnHover={false}
          spiderfyOnMaxZoom={true}
          maxClusterRadius={60}
          iconCreateFunction={(cluster: L.MarkerCluster) => {
            const count = cluster.getChildCount()
            // Tailles graduées selon densité (palette KeyMatch noir/beige)
            const size = count >= 100 ? 56 : count >= 25 ? 48 : 40
            return L.divIcon({
              html: `<div style="
                width:${size}px;height:${size}px;
                border-radius:50%;
                background:#111;
                color:#fff;
                font-family:'DM Sans',sans-serif;
                font-weight:700;
                font-size:${count >= 100 ? 14 : 13}px;
                display:flex;align-items:center;justify-content:center;
                border:3px solid rgba(255,255,255,0.92);
                box-shadow:0 6px 16px rgba(0,0,0,0.32);
                cursor:pointer;
              ">${count}</div>`,
              className: "",
              iconSize: [size, size],
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
          return (
            <HoverableMarker
              key={a.id}
              position={[a._lat, a._lng]}
              icon={priceMarker(a.prix, selectedId === a.id, a.scoreMatching ?? null)}
              onSelect={() => onSelect(a.id)}
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

      {/* Top-right : stack 2 boutons icones (Layers + Legend info).
          Paul 2026-04-27 : remplace les 3 boutons inline qui prenaient toute
          la barre top-right. Click ouvre un popup contextuel sous le bouton. */}
      <div style={{ position: "absolute", top: 16, right: 12, zIndex: 1000, display: "flex", flexDirection: "column", gap: 8 }}>
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
              <button key={t} type="button" onClick={() => { setMapType(t); setPanelOpen(null) }}
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
            {/* Layers premium "Bientot" — placeholder pour rassurer sur la roadmap */}
            <div style={{ height: 1, background: "#F7F4EF", margin: "6px 12px" }} />
            {[
              { key: "prix", label: "Carte des prix" },
              { key: "ecoles", label: "Carte des écoles" },
            ].map(item => (
              <div key={item.key} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                padding: "10px 12px", borderRadius: 8,
                fontSize: 13, fontWeight: 500, color: "#8a8477", fontFamily: "inherit",
              }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 16, height: 16, borderRadius: 4, border: "2px solid #EAE6DF", flexShrink: 0 }} />
                  {item.label}
                </span>
                <span style={{ fontSize: 9, fontWeight: 700, color: "#a16207", background: "#FBF6EA", border: "1px solid #EADFC6", padding: "2px 7px", borderRadius: 999, textTransform: "uppercase", letterSpacing: "0.6px" }}>Bientôt</span>
              </div>
            ))}
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
