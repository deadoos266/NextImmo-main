"use client"
import L from "leaflet"

/**
 * Fix des icônes par défaut de Leaflet (bug connu avec webpack/Next.js).
 * Utilise les assets CDN officiels au lieu du relative path cassé.
 *
 * V97.8 — Exécution top-level au lieu de fonction appelée dans useEffect :
 * avant, `useEffect` tournait APRÈS le premier render de `<Marker>` →
 * Leaflet utilisait déjà les default URLs et faisait des GET sur
 * `/marker-icon-2x.png` et `/marker-shadow.png` (404 dans la console).
 * Le merge arrivait trop tard. En faisant le merge au moment de l'import
 * du module (côté client uniquement grâce à "use client"), le fix est
 * appliqué AVANT que Marker render.
 *
 * `fixLeafletIcons()` reste exporté en no-op pour la rétro-compat des
 * composants existants — l'appeler dans useEffect ne casse rien et permet
 * de garder une référence explicite (pour qu'un grep "fixLeafletIcons"
 * trouve toujours les sites d'usage).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
})

/**
 * No-op après V97.8 (le fix est exécuté à l'import). Conservé pour
 * compat avec les composants qui l'appellent dans useEffect.
 */
export function fixLeafletIcons(): void {
  // no-op intentionnel — voir commentaire du module
}
