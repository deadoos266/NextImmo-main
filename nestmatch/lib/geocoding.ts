/**
 * Géocodage de ville → [lat, lng] via Nominatim (OSM, gratuit, sans clé).
 *
 * Stratégie :
 *   1. Si l'annonce a `lat/lng` (BAN autocomplete à la publication) → utiliser
 *   2. Sinon, tenter le cache statique `cityCoords.ts` (52+ villes FR)
 *   3. Sinon, appeler Nominatim + cache localStorage 30 jours
 *
 * Nominatim est rate-limité (1 req/sec recommandé). On queue les requêtes.
 * Pas d'appel sur SSR (guard typeof window).
 */

import { getCityCoords } from "./cityCoords"

const CACHE_KEY = "geocoding_cache_v1"
const TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 jours
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

type CachedEntry = { lat: number; lng: number; at: number } | { miss: true; at: number }
type CacheMap = Record<string, CachedEntry>

function normalizeVille(ville: string): string {
  return ville.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

function readCache(): CacheMap {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as CacheMap
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function writeCache(cache: CacheMap): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Quota dépassé ou mode privé : on accepte de perdre le cache
  }
}

function cacheGet(key: string): [number, number] | null | undefined {
  const cache = readCache()
  const entry = cache[key]
  if (!entry) return undefined
  if (Date.now() - entry.at > TTL_MS) return undefined
  if ("miss" in entry) return null
  return [entry.lat, entry.lng]
}

function cacheSet(key: string, value: [number, number] | null): void {
  const cache = readCache()
  cache[key] = value
    ? { lat: value[0], lng: value[1], at: Date.now() }
    : { miss: true, at: Date.now() }
  writeCache(cache)
}

// ── Queue pour respecter le rate-limit Nominatim (1 req/sec) ────────────────
let queueTail: Promise<void> = Promise.resolve()

async function rateLimited<T>(fn: () => Promise<T>): Promise<T> {
  const slot = queueTail.then(() => new Promise<void>(r => setTimeout(r, 1100)))
  queueTail = slot.catch(() => void 0)
  await slot
  return fn()
}

async function queryNominatim(ville: string): Promise<[number, number] | null> {
  try {
    const url = `${NOMINATIM_URL}?q=${encodeURIComponent(ville)}&format=json&limit=1&addressdetails=0`
    const res = await fetch(url, {
      headers: {
        // Nominatim demande un User-Agent identifiable
        "Accept-Language": "fr,en",
      },
    })
    if (!res.ok) return null
    const data = (await res.json()) as Array<{ lat: string; lon: string }>
    if (!Array.isArray(data) || data.length === 0) return null
    const first = data[0]
    const lat = Number(first.lat)
    const lng = Number(first.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return [lat, lng]
  } catch {
    return null
  }
}

/**
 * Géocode une ville. Ordre de priorité :
 *   1. Cache statique `cityCoords.ts` (instantané)
 *   2. Cache localStorage (instantané)
 *   3. Nominatim en rate-limited queue (async, ~1s+)
 *
 * Retourne null si la ville n'existe nulle part.
 */
export async function geocodeCity(ville: string): Promise<[number, number] | null> {
  if (!ville || !ville.trim()) return null

  // 1. Cache statique
  const staticHit = getCityCoords(ville)
  if (staticHit) return staticHit

  // 2. Cache localStorage
  const key = normalizeVille(ville)
  const cached = cacheGet(key)
  if (cached !== undefined) return cached

  // 3. Nominatim (queue rate-limited)
  const result = await rateLimited(() => queryNominatim(ville))
  cacheSet(key, result)
  return result
}

/**
 * Résout la coord d'une annonce selon l'ordre :
 *   1. annonce.lat / annonce.lng (saisis via BAN autocomplete à la publication)
 *   2. geocodeCity(annonce.ville)
 *
 * Helper pur synchrone pour le cas "coords déjà en DB" — le fallback
 * geocoding doit être fait par le caller en background.
 */
export function resolveAnnonceCoordsSync(a: {
  lat?: number | null
  lng?: number | null
  ville?: string | null
}): [number, number] | null {
  if (typeof a.lat === "number" && typeof a.lng === "number") {
    return [a.lat, a.lng]
  }
  return getCityCoords(a.ville || "")
}
