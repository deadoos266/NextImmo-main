/**
 * Rate-limit multi-instance via Upstash Redis (free tier 10 k cmd/jour).
 * Fallback in-memory si l'env Upstash n'est pas configurée (tests, dev offline,
 * ou Upstash temporairement down).
 *
 * Usage (asynchrone, recommandé — partagé entre toutes les instances Vercel) :
 *   const rl = await checkRateLimitAsync(`register:${ip}`, { max: 10, windowMs: 3600_000 })
 *   if (!rl.allowed) return NextResponse.json({ error: "trop de requêtes" }, { status: 429 })
 *
 * Usage (sync, rétrocompat — limite par instance Vercel, best-effort seulement) :
 *   const rl = checkRateLimit(`register:${ip}`, { max: 10, windowMs: 3600_000 })
 */

import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

type RateLimitConfig = { max: number; windowMs: number }
type RateLimitResult = { allowed: boolean; retryAfterSec?: number; remaining: number }

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const UPSTASH_ENABLED = !!(UPSTASH_URL && UPSTASH_TOKEN)

const redis: Redis | null = UPSTASH_ENABLED
  ? new Redis({ url: UPSTASH_URL as string, token: UPSTASH_TOKEN as string })
  : null

// Cache par `max:windowMs` pour éviter de recréer un Ratelimit à chaque appel.
const rlCache = new Map<string, Ratelimit>()

function getRatelimit(config: RateLimitConfig): Ratelimit | null {
  if (!redis) return null
  const cacheKey = `${config.max}:${config.windowMs}`
  const cached = rlCache.get(cacheKey)
  if (cached) return cached
  const rl = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.max, `${config.windowMs} ms`),
    prefix: "nm:rl",
    analytics: false,
  })
  rlCache.set(cacheKey, rl)
  return rl
}

// ─── Fallback in-memory (déterministe, utilisé en test + si Upstash indispo) ─
const memHits = new Map<string, number[]>()

function checkRateLimitMemory(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now()
  const windowStart = now - config.windowMs
  const prev = memHits.get(key) ?? []
  const kept = prev.filter(t => t > windowStart)
  if (kept.length >= config.max) {
    const oldest = kept[0]
    const retryAfterSec = Math.max(1, Math.ceil((config.windowMs - (now - oldest)) / 1000))
    memHits.set(key, kept)
    return { allowed: false, retryAfterSec, remaining: 0 }
  }
  kept.push(now)
  memHits.set(key, kept)
  return { allowed: true, remaining: config.max - kept.length }
}

/**
 * Variante asynchrone — interroge Upstash si dispo, fallback mémoire sinon.
 * C'est la version à utiliser dans les API routes App Router (déjà async).
 */
export async function checkRateLimitAsync(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const rl = getRatelimit(config)
  if (!rl) return checkRateLimitMemory(key, config)
  try {
    const { success, remaining, reset } = await rl.limit(key)
    if (!success) {
      const retryAfterSec = Math.max(1, Math.ceil((reset - Date.now()) / 1000))
      return { allowed: false, retryAfterSec, remaining: 0 }
    }
    return { allowed: true, remaining }
  } catch (err) {
    // Si Upstash down, fallback mémoire pour ne pas bloquer l'app
    // eslint-disable-next-line no-console
    console.error("[rateLimit] Upstash error, fallback memory:", err)
    return checkRateLimitMemory(key, config)
  }
}

/**
 * Wrapper synchrone — rétrocompat avec les API routes qui n'ont pas été
 * migrées. Retourne le résultat mémoire immédiat et fire-and-forget Upstash
 * en arrière-plan pour que le compteur distribué continue de se mettre à jour.
 *
 * À migrer progressivement vers `checkRateLimitAsync` (plus cohérent multi-instance).
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const mem = checkRateLimitMemory(key, config)
  const rl = getRatelimit(config)
  if (rl) rl.limit(key).catch(() => { /* silent fail */ })
  return mem
}

/**
 * Lit l'IP client depuis les headers (Vercel / Next.js 15).
 * Fallback "unknown" si aucun header dispo.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  const real = headers.get("x-real-ip")
  if (real) return real.trim()
  return "unknown"
}

/**
 * GC périodique du cache mémoire — purge les clés sans hit récent.
 * Non critique : la Map reste petite et les tests créent des clés uniques.
 */
export function gcRateLimit(maxWindowMs = 60 * 60 * 1000): void {
  const cutoff = Date.now() - maxWindowMs
  for (const [key, arr] of memHits.entries()) {
    const kept = arr.filter(t => t > cutoff)
    if (kept.length === 0) memHits.delete(key)
    else if (kept.length !== arr.length) memHits.set(key, kept)
  }
}
