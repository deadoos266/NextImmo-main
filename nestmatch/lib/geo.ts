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
