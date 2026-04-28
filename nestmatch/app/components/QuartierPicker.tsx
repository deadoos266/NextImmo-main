"use client"

// V7 chantier 2 (Paul 2026-04-28) — picker Leaflet pour que le candidat
// pose un marker sur SON quartier favori. Sauvegarde lat/lng + label
// auto-reverse-geocode (Nominatim free tier).
//
// Render lazy-loaded (Leaflet pese 40+ kB) : on monte juste au focus de
// la zone, sinon on affiche un placeholder collapsed.

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { getCityCoords } from "../../lib/cityCoords"

const MapContainer = dynamic(() => import("react-leaflet").then(m => m.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import("react-leaflet").then(m => m.TileLayer), { ssr: false })
const Marker = dynamic(() => import("react-leaflet").then(m => m.Marker), { ssr: false })

interface Props {
  ville?: string
  lat: number | null
  lng: number | null
  label: string | null
  onChange: (next: { lat: number; lng: number; label: string }) => void
  onClear: () => void
  isMobile: boolean
}

const PARIS_DEFAULT: [number, number] = [48.8566, 2.3522]

export default function QuartierPicker({ ville, lat, lng, label, onChange, onClear, isMobile }: Props) {
  const [open, setOpen] = useState(lat !== null && lng !== null)
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(label)

  // Centrage initial : marker existant > coords ville profil > Paris
  const center: [number, number] = (lat !== null && lng !== null)
    ? [lat, lng]
    : (ville ? getCityCoords(ville) ?? PARIS_DEFAULT : PARIS_DEFAULT)

  useEffect(() => { setResolvedLabel(label) }, [label])

  // Reverse-geocode minimaliste via Nominatim (free, rate-limit 1 req/s).
  // On debounce 600ms apres dragend pour ne pas spam.
  useEffect(() => {
    if (lat === null || lng === null) return
    if (resolvedLabel && resolvedLabel.length > 0) return
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`, {
          headers: { "Accept-Language": "fr" },
        })
        const data = await res.json()
        const addr = data.address || {}
        const quartier = addr.suburb || addr.neighbourhood || addr.city_district || addr.borough || addr.quarter
        const cityName = addr.city || addr.town || addr.village || ""
        const lbl = quartier ? `${quartier}${cityName ? `, ${cityName}` : ""}` : (data.display_name || "").split(",")[0]
        if (lbl) {
          setResolvedLabel(lbl)
          onChange({ lat, lng, label: lbl })
        }
      } catch { /* swallow — pas de label = degraded mode */ }
    }, 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng])

  if (!open) {
    return (
      <div style={{
        marginTop: 14, padding: "16px 18px",
        background: "#F7F4EF", border: "1px solid #EAE6DF", borderRadius: 14,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#111", margin: 0 }}>
              Quartier de prédilection
            </p>
            <p style={{ fontSize: 11, color: "#8a8477", margin: "4px 0 0", lineHeight: 1.5 }}>
              Pose un marker sur ton quartier favori pour scorer la proximité réelle.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{
              background: "#111", color: "#fff", border: "none",
              borderRadius: 999, padding: "8px 16px",
              fontSize: 11, fontWeight: 700, fontFamily: "inherit",
              textTransform: "uppercase" as const, letterSpacing: "0.4px",
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            Ouvrir la carte
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      marginTop: 14, padding: 14,
      background: "#F7F4EF", border: "1px solid #EAE6DF", borderRadius: 14,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>
          Quartier de prédilection
        </label>
        <span style={{ fontSize: 11, color: "#8a8477" }}>
          Glisse le marker. {resolvedLabel ? <strong style={{ color: "#111" }}>{resolvedLabel}</strong> : "Détection en cours…"}
        </span>
      </div>
      <div style={{
        height: isMobile ? 220 : 280,
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid #EAE6DF",
      }}>
        <MapContainer
          center={center}
          zoom={lat !== null ? 14 : 12}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
          />
          <Marker
            position={(lat !== null && lng !== null) ? [lat, lng] : center}
            draggable
            eventHandlers={{
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              dragend: (e: any) => {
                const ll = e.target.getLatLng()
                setResolvedLabel(null) // trigger reverse-geocode
                onChange({ lat: ll.lat, lng: ll.lng, label: "" })
              },
            }}
          />
        </MapContainer>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, gap: 8 }}>
        <button
          type="button"
          onClick={() => { onClear(); setResolvedLabel(null); setOpen(false) }}
          style={{
            background: "transparent", color: "#8a8477", border: "1px solid #EAE6DF",
            borderRadius: 999, padding: "6px 14px",
            fontSize: 11, fontWeight: 600, fontFamily: "inherit",
            cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          Effacer
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            background: "#111", color: "#fff", border: "none",
            borderRadius: 999, padding: "6px 14px",
            fontSize: 11, fontWeight: 700, fontFamily: "inherit",
            textTransform: "uppercase" as const, letterSpacing: "0.4px",
            cursor: "pointer",
          }}
        >
          Replier
        </button>
      </div>
    </div>
  )
}
