"use client"
import { useEffect } from "react"
import { MapContainer, TileLayer, Marker, Circle, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

function fixLeafletIcons() {
  delete (L.Icon.Default.prototype as any)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  })
}

function FrenchLocale() {
  const map = useMap()
  useEffect(() => {
    map.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>')
    const zoom = (map as any).zoomControl
    if (zoom?._zoomInButton) zoom._zoomInButton.title = "Zoomer"
    if (zoom?._zoomOutButton) zoom._zoomOutButton.title = "Dezoomer"
  }, [map])
  return null
}

export default function MapBien({
  lat,
  lng,
  ville,
  exact = false,
}: {
  lat: number
  lng: number
  ville: string
  exact?: boolean
}) {
  useEffect(() => { fixLeafletIcons() }, [])

  // Par defaut on ne montre pas l'adresse exacte : cercle de 400m autour du point
  // pour proteger la vie privee du proprietaire.
  return (
    <div style={{ width: "100%", height: 320, borderRadius: 16, overflow: "hidden", border: "1px solid #e5e7eb" }}>
      <MapContainer
        center={[lat, lng]}
        zoom={14}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a> &middot; &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <FrenchLocale />
        {exact ? (
          <Marker position={[lat, lng]} />
        ) : (
          <Circle
            center={[lat, lng]}
            radius={400}
            pathOptions={{ color: "#111", fillColor: "#111", fillOpacity: 0.12, weight: 2 }}
          />
        )}
      </MapContainer>
    </div>
  )
}
