/**
 * V97.39 P3-7 Phase 1 — Fetcher distant via worker Zendriver self-host.
 *
 * Appelle POST {EXTERNAL_FETCHER_URL}/fetch avec Bearer auth, récupère
 * le HTML déjà résolu par le worker (DataDome bypass). Retourne le même
 * `FetchResult` shape que fetcher.ts local, donc transparent pour le caller.
 *
 * Si le worker est down / timeout / 401 / 500, lève `ImportFetchError`
 * avec un code identifiable. Le caller (fetcher-router) décide alors
 * s'il faut fallback wreq-js ou propager l'erreur tel quel.
 *
 * Variables env requises :
 *   - EXTERNAL_FETCHER_URL    : ex `https://fetcher.keymatch-immo.fr`
 *   - EXTERNAL_FETCHER_TOKEN  : hex 64 chars, partagé avec le worker
 *   - EXTERNAL_FETCHER_TIMEOUT_MS : optionnel, défaut 25000
 */

import { ImportFetchError, type FetchResult } from "./fetcher"

const DEFAULT_TIMEOUT_MS = 25_000

interface WorkerSuccessResponse {
  ok: true
  html: string
  final_url: string
  status: number
  duration_ms: number
  fetcher: string
}

interface WorkerErrorResponse {
  ok: false
  code: string
  error: string
}

type WorkerResponse = WorkerSuccessResponse | WorkerErrorResponse

/**
 * Appelle le worker distant pour scraper une URL DataDome.
 *
 * @throws ImportFetchError avec code mappé depuis la réponse worker.
 */
export async function fetchUrlRemote(url: string): Promise<FetchResult> {
  const baseUrl = process.env.EXTERNAL_FETCHER_URL?.trim()
  const token = process.env.EXTERNAL_FETCHER_TOKEN?.trim()
  if (!baseUrl) {
    throw new ImportFetchError(
      "WORKER_NOT_CONFIGURED",
      "EXTERNAL_FETCHER_URL non configuré côté Vercel",
    )
  }
  if (!token) {
    throw new ImportFetchError(
      "WORKER_NOT_CONFIGURED",
      "EXTERNAL_FETCHER_TOKEN non configuré côté Vercel",
    )
  }

  const timeoutMs = Number(process.env.EXTERNAL_FETCHER_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, "")}/fetch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        url,
        max_wait_ms: Math.min(timeoutMs - 2000, 25_000),
      }),
      signal: controller.signal,
    })
  } catch (e: unknown) {
    clearTimeout(timer)
    if (e instanceof Error && e.name === "AbortError") {
      throw new ImportFetchError(
        "WORKER_TIMEOUT",
        "Le worker n'a pas répondu à temps. Le service est peut-être surchargé, réessaye dans quelques minutes.",
      )
    }
    throw new ImportFetchError(
      "WORKER_UNAVAILABLE",
      `Worker injoignable : ${e instanceof Error ? e.message : "erreur réseau"}`,
    )
  }
  clearTimeout(timer)

  let body: WorkerResponse
  try {
    body = (await res.json()) as WorkerResponse
  } catch {
    throw new ImportFetchError(
      "WORKER_UNAVAILABLE",
      `Worker a retourné une réponse invalide (HTTP ${res.status})`,
    )
  }

  if (!res.ok || body.ok === false) {
    // Map les codes worker → codes ImportFetchError lisibles
    const errBody = body as WorkerErrorResponse
    const code = errBody.code || "WORKER_ERROR"
    const messageMap: Record<string, string> = {
      UNAUTHORIZED: "Authentification worker invalide. Vérifie EXTERNAL_FETCHER_TOKEN.",
      RATE_LIMITED: "Trop d'imports en cours sur ce site, réessaye dans une heure.",
      BLOCKED_HOST: "Ce site n'est pas autorisé sur le worker.",
      BOT_PROTECTION: "Le site bloque l'extraction même avec navigateur stealth. Copie-colle manuellement.",
      TIMEOUT: "Le site est trop lent à répondre, réessaye plus tard.",
      TOO_LARGE: "La page est trop volumineuse à traiter.",
      INVALID_URL: "URL invalide pour le worker.",
      PRIVATE_IP: "URL refusée (SSRF guard).",
    }
    throw new ImportFetchError(
      code,
      messageMap[code] || errBody.error || "Erreur du worker distant",
    )
  }

  // Success : mappe la réponse worker au shape FetchResult
  const ok = body as WorkerSuccessResponse
  return {
    html: ok.html,
    final_url: ok.final_url,
    status: ok.status,
    content_type: "text/html; charset=utf-8",
  }
}

/**
 * Ping le worker pour vérifier qu'il est joignable (utilisé par
 * /api/admin/fetcher-health).
 */
export async function pingFetcherWorker(): Promise<{
  ok: boolean
  latency_ms: number
  status?: number
  body?: unknown
  error?: string
}> {
  const baseUrl = process.env.EXTERNAL_FETCHER_URL?.trim()
  const token = process.env.EXTERNAL_FETCHER_TOKEN?.trim()
  if (!baseUrl || !token) {
    return { ok: false, latency_ms: 0, error: "Worker non configuré (env vars manquantes)" }
  }
  const t0 = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5_000)
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/health`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
    clearTimeout(timer)
    const latency_ms = Date.now() - t0
    const body = await res.json().catch(() => null)
    return {
      ok: res.ok,
      latency_ms,
      status: res.status,
      body,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    }
  } catch (e: unknown) {
    clearTimeout(timer)
    return {
      ok: false,
      latency_ms: Date.now() - t0,
      error: e instanceof Error ? e.message : "Erreur réseau",
    }
  }
}
