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
 */

import { fetchUrl, ImportFetchError, type FetchResult } from "./fetcher"
import { fetchUrlRemote } from "./fetcher-remote"

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

/**
 * Récupère le HTML en choisissant automatiquement la voie d'extraction.
 *
 * Retourne le `FetchResult` + un `fetcher_used` pour traçabilité dans
 * `import_logs.fetcher_used`. Ne fait jamais de fallback silencieux du
 * worker vers wreq-js (sinon on perd 8s à retenter une voie qui va aussi
 * échouer pour DataDome — mieux afficher l'erreur claire à l'user).
 */
export async function fetchUrlRouted(url: string): Promise<RoutedFetchResult> {
  if (shouldUseRemoteFetcher(url)) {
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
