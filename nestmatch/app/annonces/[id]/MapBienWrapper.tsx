"use client"
import dynamic from "next/dynamic"

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

export default function MapBienWrapper(props: { lat: number; lng: number; ville: string; exact?: boolean }) {
  return <MapBien {...props} />
}
