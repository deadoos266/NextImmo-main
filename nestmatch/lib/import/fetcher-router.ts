/**
 * V97.39 P3-7 Phase 1 — Router fetcher local vs worker distant.
 *
 * Décide quelle voie d'extraction utiliser selon l'hôte :
 *  - Hosts dans `EXTERNAL_FETCHER_ENABLED_HOSTS` (leboncoin.fr, seloger.com,
 *    logic-immo.com) → worker Zendriver self-host.
 *  - Tous les autres hosts (PAP, 12 agences, generic) → fetcher local
 *    wreq-js (V97.37).
 *
 * Si le worker n'est pas configuré (env vars `EXTERNAL_FETCHER_URL` ou
 * `EXTERNAL_FETCHER_TOKEN` manquantes), on retombe sur fetcher local
 * (qui produira BOT_PROTECTION pour DataDome, message clair côté UI).
 *
 * En revanche, si le worker EST configuré mais down/timeout/auth fail,
 * on propage l'erreur directement (WORKER_UNAVAILABLE/WORKER_TIMEOUT)
 * pour ne pas masquer la panne. Pas de re-tentative silencieuse :
 * wreq-js échouera aussi sur DataDome, autant montrer l'erreur claire.
 *
 * V97.39.5 — Circuit breaker : si un host accumule >= QUARANTINE_THRESHOLD
 * échecs BOT_PROTECTION dans la dernière heure, on court-circuite le worker
 * (qui va échouer aussi en 25s) et on renvoie immédiatement BOT_PROTECTION.
 * Auto-réactivation après 1h (window glissante). Évite de faire attendre
 * l'user pour un échec garanti.
 */

import { fetchUrl, ImportFetchError, type FetchResult } from "./fetcher"
import { fetchUrlRemote } from "./fetcher-remote"
import { supabaseAdmin } from "../supabase-server"

export type FetcherUsed = "wreq-js" | "zendriver-worker" | "native-fetch"

export interface RoutedFetchResult extends FetchResult {
  fetcher_used: FetcherUsed
}

/** Liste des hosts qui doivent passer par le worker distant. */
function enabledRemoteHosts(): Set<string> {
  const raw = (process.env.EXTERNAL_FETCHER_ENABLED_HOSTS || "").trim()
  if (!raw) return new Set()
  return new Set(raw.split(",").map(h => h.trim().toLowerCase()).filter(Boolean))
}

/** True si cet URL doit transiter par le worker. */
export function shouldUseRemoteFetcher(url: string): boolean {
  const enabled = enabledRemoteHosts()
  if (enabled.size === 0) return false
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase().replace(/^www\./, "")
    for (const allowed of enabled) {
      if (host === allowed || host.endsWith("." + allowed)) return true
    }
  } catch {
    return false
  }
  return false
}

// ─── V97.39.5 Circuit breaker ──────────────────────────────────────────────

/** Seuil d'échecs BOT_PROTECTION/h avant quarantaine. */
const QUARANTINE_THRESHOLD = 5
/** Fenêtre glissante de surveillance (1h). */
const QUARANTINE_WINDOW_MS = 60 * 60 * 1000

/** Cache mémoire 5min pour éviter de hammer Supabase à chaque import. */
const quarantineCache = new Map<string, { quarantined: boolean; checkedAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000

/** Map hostname → parser name (utilisé pour query import_logs.source). */
function hostToParser(host: string): string | null {
  const bare = host.toLowerCase().replace(/^www\./, "")
  if (bare === "leboncoin.fr" || bare.endsWith(".leboncoin.fr")) return "leboncoin"
  if (bare === "seloger.com" || bare.endsWith(".seloger.com")) return "seloger"
  if (bare === "logic-immo.com" || bare.endsWith(".logic-immo.com")) return "logic-immo"
  return null
}

/**
 * Check si un parser doit être en quarantaine (worker court-circuité).
 *
 * Critère : >= 5 BOT_PROTECTION dans la dernière heure pour ce parser.
 * Cache 5min pour limiter les SELECT.
 *
 * Fail-open : si erreur Supabase ou env vars manquantes, retourne false
 * (on tente le worker normalement plutôt que bloquer l'utilisateur).
 */
export async function isParserQuarantined(parserName: string): Promise<boolean> {
  // Cache hit ?
  const cached = quarantineCache.get(parserName)
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
    return cached.quarantined
  }

  // Fail-open si Supabase pas configuré (tests, dev local)
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return false

  try {
    const since = new Date(Date.now() - QUARANTINE_WINDOW_MS).toISOString()
    const { count, error } = await supabaseAdmin
      .from("import_logs")
      .select("id", { count: "exact", head: true })
      .eq("source", parserName)
      .eq("status", "fail")
      .eq("error_code", "BOT_PROTECTION")
      .gte("created_at", since)

    if (error) {
      console.warn("[fetcher-router] quarantine check failed:", error.message)
      return false
    }

    const quarantined = (count || 0) >= QUARANTINE_THRESHOLD
    quarantineCache.set(parserName, { quarantined, checkedAt: Date.now() })
    return quarantined
  } catch (e) {
    console.warn("[fetcher-router] quarantine check threw:", (e as Error).message)
    return false
  }
}

/** Invalide le cache quarantine (utile en tests ou après un manual reset admin). */
export function clearQuarantineCache(): void {
  quarantineCache.clear()
}

/**
 * Récupère le HTML en choisissant automatiquement la voie d'extraction.
 *
 * Retourne le `FetchResult` + un `fetcher_used` pour traçabilité dans
 * `import_logs.fetcher_used`. Ne fait jamais de fallback silencieux du
 * worker vers wreq-js (sinon on perd 8s à retenter une voie qui va aussi
 * échouer pour DataDome — mieux afficher l'erreur claire à l'user).
 *
 * V97.39.5 — Si le parser est en quarantaine (5+ échecs BOT_PROTECTION
 * récents), court-circuit immédiat sans appeler le worker.
 */
export async function fetchUrlRouted(url: string): Promise<RoutedFetchResult> {
  if (shouldUseRemoteFetcher(url)) {
    // Check quarantaine avant de partir 25s dans le worker
    try {
      const u = new URL(url)
      const parserName = hostToParser(u.hostname)
      if (parserName && (await isParserQuarantined(parserName))) {
        throw new ImportFetchError(
          "BOT_PROTECTION",
          "Ce site bloque les imports depuis plus d'une heure (5+ échecs successifs). Copie-colle manuellement, ou réessaye plus tard si tu penses que la protection a été levée.",
        )
      }
    } catch (e) {
      if (e instanceof ImportFetchError) throw e
      // Erreur URL ou autre : on continue le routage normal
    }

    try {
      const res = await fetchUrlRemote(url)
      return { ...res, fetcher_used: "zendriver-worker" }
    } catch (e: unknown) {
      // Si le worker est non configuré, on a un signal clair → fallback wreq-js
      // (tant pis, on saura via BOT_PROTECTION qu'il faut activer le worker).
      // Sinon (worker configuré mais down/timeout/auth fail), propage l'erreur.
      if (e instanceof ImportFetchError && e.code === "WORKER_NOT_CONFIGURED") {
        const res = await fetchUrl(url)
        return { ...res, fetcher_used: "wreq-js" }
      }
      throw e
    }
  }
  // Voie classique : wreq-js → fallback fetch natif
  const res = await fetchUrl(url)
  return { ...res, fetcher_used: "wreq-js" }
}
