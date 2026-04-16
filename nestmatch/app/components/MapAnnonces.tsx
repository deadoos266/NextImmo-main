"use client"
import { useEffect, useState } from "react"
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

type MapType = "plan" | "satellite" | "standard"

const TILES: Record<MapType, { url: string; attribution: string; label: string }> = {
  plan: {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    label: "Plan",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "&copy; Esri",
    label: "Satellite",
  },
  standard: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    label: "Detaille",
  },
}

// Fix des icônes par défaut de Leaflet (problème courant avec webpack)
function fixLeafletIcons() {
  delete (L.Icon.Default.prototype as any)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  })
}

function scoreToColor(score: number | null): { bg: string; border: string; text: string } {
  if (score === null) return { bg: "white", border: "#111", text: "#111" }
  const pct = Math.round(score / 10)
  if (pct >= 70) return { bg: "#dcfce7", border: "#16a34a", text: "#15803d" }
  if (pct >= 40) return { bg: "#fff7ed", border: "#f97316", text: "#c2410c" }
  return { bg: "#fee2e2", border: "#ef4444", text: "#b91c1c" }
}

function priceMarker(prix: number, selected: boolean, score: number | null) {
  const c = selected
    ? { bg: "#111", border: "#111", text: "white" }
    : scoreToColor(score)
  const pct = score !== null ? Math.round(score / 10) : null
  return L.divIcon({
    html: `<div style="
      background:${c.bg};
      color:${c.text};
      border:2px solid ${c.border};
      padding:4px 8px;
      border-radius:6px;
      font-weight:700;
      font-size:12px;
      font-family:'DM Sans',sans-serif;
      white-space:nowrap;
      box-shadow:0 2px 8px rgba(0,0,0,0.15);
      cursor:pointer;
      display:flex;
      align-items:center;
      gap:4px;
    ">${pct !== null ? `<span style="font-size:10px;opacity:0.8">${pct}%</span>` : ""}${prix ? prix.toLocaleString("fr-FR") + " €" : "—"}</div>`,
    className: "",
    iconSize: [85, 28],
    iconAnchor: [42, 28],
  })
}

// Écarte les marqueurs qui se superposent en les disposant en cercle
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

function BoundsWatcher({ onBoundsChange }: { onBoundsChange: (bounds: L.LatLngBounds) => void }) {
  const map = useMapEvents({
    moveend: () => onBoundsChange(map.getBounds()),
    zoomend: () => onBoundsChange(map.getBounds()),
  })
  return null
}

export default function MapAnnonces({
  annonces,
  selectedId,
  onSelect,
  onBoundsChange,
}: {
  annonces: any[]
  selectedId: number | null
  onSelect: (id: number) => void
  onBoundsChange: (bounds: L.LatLngBounds) => void
}) {
  useEffect(() => { fixLeafletIcons() }, [])
  const [mapType, setMapType] = useState<MapType>("plan")

  const withCoords = spreadOverlappingMarkers(annonces.filter(a => a._lat && a._lng))
  if (withCoords.length === 0) return (
    <div style={{ width: "100%", height: "100%", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "#9ca3af", fontSize: 14 }}>Aucune coordonnee disponible pour ces annonces</p>
    </div>
  )

  const center: [number, number] = [withCoords[0]._lat, withCoords[0]._lng]
  const tile = TILES[mapType]

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <MapContainer
        center={center}
        zoom={12}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={true}
      >
        <TileLayer key={mapType} attribution={tile.attribution} url={tile.url} />
        <BoundsWatcher onBoundsChange={onBoundsChange} />
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
                  <p style={{ color: "#6b7280", fontSize: 12 }}>{a.surface} m² · {a.pieces} p. · {a.ville}</p>
                  <p style={{ fontWeight: 800, fontSize: 14, margin: "6px 0" }}>{a.prix} €/mois</p>
                  <a href={`/annonces/${a.id}`} style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>Voir l'annonce →</a>
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>

      {/* Légende compatibilité */}
      <div style={{ position: "absolute", bottom: 24, left: 12, zIndex: 1000, background: "white", borderRadius: 10, boxShadow: "0 2px 12px rgba(0,0,0,0.15)", padding: "8px 12px", border: "1px solid #e5e7eb", display: "flex", flexDirection: "column", gap: 4 }}>
        {[
          { color: "#16a34a", bg: "#dcfce7", label: "≥ 70% compatible" },
          { color: "#f97316", bg: "#fff7ed", label: "40–69%" },
          { color: "#ef4444", bg: "#fee2e2", label: "< 40%" },
        ].map(l => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: l.bg, border: `2px solid ${l.color}` }} />
            <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "'DM Sans',sans-serif" }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* Selecteur de type de carte — bas droite style SeLoger */}
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
