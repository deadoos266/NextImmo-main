/**
 * Rate limit simple en mémoire (process-local).
 * Suffisant pour un MVP Vercel — pour du multi-instance sérieux,
 * remplacer par Upstash Redis ou Supabase.
 *
 * Usage :
 *   const rl = checkRateLimit(`register:${ip}`, { max: 10, windowMs: 60 * 60 * 1000 })
 *   if (!rl.allowed) return 429
 */

type RateLimitConfig = { max: number; windowMs: number }
type RateLimitResult = { allowed: boolean; retryAfterSec?: number; remaining: number }

const hits = new Map<string, number[]>()

export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now()
  const windowStart = now - config.windowMs
  const prev = hits.get(key) ?? []
  const kept = prev.filter(t => t > windowStart)

  if (kept.length >= config.max) {
    const oldest = kept[0]
    const retryAfterSec = Math.max(1, Math.ceil((config.windowMs - (now - oldest)) / 1000))
    hits.set(key, kept)
    return { allowed: false, retryAfterSec, remaining: 0 }
  }

  kept.push(now)
  hits.set(key, kept)
  return { allowed: true, remaining: config.max - kept.length }
}

/**
 * Lit l'IP client depuis les headers (Vercel / Next.js 15).
 * Fallback "unknown" — on hash jamais, on concat directement dans la clé.
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
 * GC périodique : purge les clés qui n'ont plus aucun hit dans la fenêtre la plus large.
 * À appeler occasionnellement, pas critique (Map reste petite en MVP).
 */
export function gcRateLimit(maxWindowMs = 60 * 60 * 1000): void {
  const cutoff = Date.now() - maxWindowMs
  for (const [key, arr] of hits.entries()) {
    const kept = arr.filter(t => t > cutoff)
    if (kept.length === 0) hits.delete(key)
    else if (kept.length !== arr.length) hits.set(key, kept)
  }
}
