"use client"
import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { geocodeCity } from "../../../lib/geocoding"

// Wrapper client qui charge Leaflet uniquement cote navigateur
// (Leaflet referencie window au chargement du module, incompatible SSR)
const MapBien = dynamic(() => import("../../components/MapBien"), {
  ssr: false,
  loading: () => (
    <div style={{ width: "100%", height: 320, borderRadius: 16, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "#9ca3af", fontSize: 13 }}>Chargement de la carte&hellip;</p>
    </div>
  ),
})

/**
 * Accepte des lat/lng optionnels. Si absents, géocode la ville côté client
 * via Nominatim (avec cache localStorage). Couvre les annonces dans des
 * villes hors `cityCoords.ts` (ex : Vannes, Quimper) et l'international.
 */
export default function MapBienWrapper(props: {
  lat: number | null
  lng: number | null
  ville: string
  exact?: boolean
}) {
  const [resolved, setResolved] = useState<[number, number] | null>(
    typeof props.lat === "number" && typeof props.lng === "number"
      ? [props.lat, props.lng]
      : null
  )
  const [geocoding, setGeocoding] = useState(false)

  useEffect(() => {
    if (resolved) return
    if (!props.ville) return
    let cancelled = false
    setGeocoding(true)
    ;(async () => {
      const c = await geocodeCity(props.ville)
      if (cancelled) return
      if (c) setResolved(c)
      setGeocoding(false)
    })()
    return () => { cancelled = true }
  }, [props.ville, resolved])

  if (!resolved) {
    return (
      <div style={{ width: "100%", height: 320, borderRadius: 16, background: "#f9fafb", border: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#9ca3af", fontSize: 13 }}>
          {geocoding ? "Chargement de la carte\u2026" : "Localisation indisponible"}
        </p>
      </div>
    )
  }

  return <MapBien lat={resolved[0]} lng={resolved[1]} ville={props.ville} exact={props.exact} />
}
