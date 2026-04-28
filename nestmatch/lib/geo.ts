// V26.1 (Paul 2026-04-29) — utilities geo : point-in-polygon ray-casting.
//
// Pas de dépendance externe (turf.js = 50KB, overkill pour 1 fonction).
// Ray-casting classique : compte les intersections entre une ligne
// horizontale partant du point et chaque arête du polygone. Impair = inside.
//
// Tolère les polygones convexes ET concaves. Pas optimisé pour > 10k points
// (utilise spatial index alors), mais OK pour les ~50-200 vertices d'un
// polygone dessiné à la main.

export interface LatLng {
  lat: number
  lng: number
}

/**
 * V27.2 (Paul 2026-04-29) — étend (buffer) un polygone radialement depuis
 * son centroïde de N mètres. Approximation simple :
 *   - Centroïde = moyenne des vertices
 *   - Pour chaque vertex, pousse vers l'extérieur depuis le centroïde
 *     d'une distance de N mètres
 * Ne préserve pas exactement la forme pour les polygones concaves (les
 * concavités s'arrondissent), mais suffisant pour des zones rough
 * dessinées à la main par l'utilisateur.
 *
 * Conversion mètres ↔ degrés : 1° lat ≈ 111km, 1° lng ≈ 111km × cos(lat).
 */
export function expandPolygon(polygon: LatLng[], meters: number): LatLng[] {
  if (!polygon || polygon.length < 3 || meters <= 0) return polygon
  // Centroïde
  let cLat = 0, cLng = 0
  for (const v of polygon) { cLat += v.lat; cLng += v.lng }
  cLat /= polygon.length
  cLng /= polygon.length
  const cosLat = Math.cos((cLat * Math.PI) / 180)
  const dLatPerMeter = 1 / 111_000
  const dLngPerMeter = 1 / (111_000 * Math.max(0.01, cosLat))
  return polygon.map(v => {
    const dx = v.lng - cLng
    const dy = v.lat - cLat
    const dist = Math.hypot(dx, dy)
    if (dist === 0) return v
    // Direction normalisée + offset proportionnel
    const offsetLng = (dx / dist) * meters * dLngPerMeter
    const offsetLat = (dy / dist) * meters * dLatPerMeter
    return { lat: v.lat + offsetLat, lng: v.lng + offsetLng }
  })
}

/**
 * Point-in-polygon ray-casting algorithm.
 * Polygon = array of LatLng vertices (closed = first==last optional).
 * Returns true if (lat, lng) is strictly inside the polygon.
 */
export function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  if (!polygon || polygon.length < 3) return false
  const x = point.lng
  const y = point.lat
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng
    const yi = polygon[i].lat
    const xj = polygon[j].lng
    const yj = polygon[j].lat
    const intersect = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}
