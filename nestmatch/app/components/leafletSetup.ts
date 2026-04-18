"use client"
import L from "leaflet"

/**
 * Fix des icônes par défaut de Leaflet (bug connu avec webpack/Next.js).
 * Utilise les assets CDN officiels au lieu du relative path cassé.
 *
 * À appeler UNE FOIS dans chaque composant utilisant Leaflet
 * (via `useEffect(() => { fixLeafletIcons() }, [])`).
 *
 * Auparavant dupliqué dans MapBien.tsx et MapAnnonces.tsx — centralisé ici.
 */
export function fixLeafletIcons(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  })
}
