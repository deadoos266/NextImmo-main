/**
 * V97.39 P3-7 Phase 1 — Tests fetcher-remote.
 *
 * Vérifie l'appel HTTP au worker : Bearer header, timeout, mapping codes
 * erreur. On mock global fetch pour ne pas faire de vraies requêtes.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { fetchUrlRemote, pingFetcherWorker } from "../fetcher-remote"
import { ImportFetchError } from "../fetcher"

describe("fetcher-remote.fetchUrlRemote", () => {
  const ENV = { ...process.env }

  beforeEach(() => {
    process.env.EXTERNAL_FETCHER_URL = "https://fetcher.test.local"
    process.env.EXTERNAL_FETCHER_TOKEN = "test-token-secret"
  })

  afterEach(() => {
    process.env = { ...ENV }
    vi.restoreAllMocks()
  })

  it("lève WORKER_NOT_CONFIGURED si URL manquante", async () => {
    delete process.env.EXTERNAL_FETCHER_URL
    await expect(fetchUrlRemote("https://leboncoin.fr/ad/x")).rejects.toMatchObject({
      code: "WORKER_NOT_CONFIGURED",
    })
  })

  it("lève WORKER_NOT_CONFIGURED si TOKEN manquant", async () => {
    delete process.env.EXTERNAL_FETCHER_TOKEN
    await expect(fetchUrlRemote("https://leboncoin.fr/ad/x")).rejects.toMatchObject({
      code: "WORKER_NOT_CONFIGURED",
    })
  })

  it("envoie Bearer header + JSON body au worker", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        html: "<html>hello</html>",
        final_url: "https://www.leboncoin.fr/ad/x",
        status: 200,
        duration_ms: 4500,
        fetcher: "zendriver-worker",
      }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const result = await fetchUrlRemote("https://leboncoin.fr/ad/x")

    expect(mockFetch).toHaveBeenCalledOnce()
    const [calledUrl, calledOpts] = mockFetch.mock.calls[0]
    expect(calledUrl).toBe("https://fetcher.test.local/fetch")
    expect(calledOpts.method).toBe("POST")
    expect(calledOpts.headers["Authorization"]).toBe("Bearer test-token-secret")
    expect(calledOpts.headers["Content-Type"]).toBe("application/json")
    const body = JSON.parse(calledOpts.body)
    expect(body.url).toBe("https://leboncoin.fr/ad/x")
    expect(body.max_wait_ms).toBeGreaterThan(0)

    expect(result.html).toBe("<html>hello</html>")
    expect(result.final_url).toBe("https://www.leboncoin.fr/ad/x")
    expect(result.status).toBe(200)
  })

  it("mappe BOT_PROTECTION du worker", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ ok: false, code: "BOT_PROTECTION", error: "Challenge KO" }),
    }))

    await expect(fetchUrlRemote("https://leboncoin.fr/ad/x")).rejects.toMatchObject({
      code: "BOT_PROTECTION",
    })
  })

  it("mappe UNAUTHORIZED du worker", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ ok: false, code: "UNAUTHORIZED", error: "Bad token" }),
    }))

    await expect(fetchUrlRemote("https://leboncoin.fr/ad/x")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })
  })

  it("mappe RATE_LIMITED du worker", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ ok: false, code: "RATE_LIMITED", error: "Trop de req" }),
    }))

    await expect(fetchUrlRemote("https://leboncoin.fr/ad/x")).rejects.toMatchObject({
      code: "RATE_LIMITED",
    })
  })

  it("lève WORKER_UNAVAILABLE si réseau down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")))

    await expect(fetchUrlRemote("https://leboncoin.fr/ad/x")).rejects.toMatchObject({
      code: "WORKER_UNAVAILABLE",
    })
  })

  it("lève WORKER_TIMEOUT si AbortError", async () => {
    const abortErr = new Error("Aborted")
    abortErr.name = "AbortError"
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortErr))

    await expect(fetchUrlRemote("https://leboncoin.fr/ad/x")).rejects.toMatchObject({
      code: "WORKER_TIMEOUT",
    })
  })

  it("lève WORKER_UNAVAILABLE si JSON invalide", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new Error("Bad JSON") },
    }))

    await expect(fetchUrlRemote("https://leboncoin.fr/ad/x")).rejects.toBeInstanceOf(ImportFetchError)
  })
})

describe("fetcher-remote.pingFetcherWorker", () => {
  const ENV = { ...process.env }

  beforeEach(() => {
    process.env.EXTERNAL_FETCHER_URL = "https://fetcher.test.local"
    process.env.EXTERNAL_FETCHER_TOKEN = "test-token"
  })

  afterEach(() => {
    process.env = { ...ENV }
    vi.restoreAllMocks()
  })

  it("retourne ok:false si non configuré", async () => {
    delete process.env.EXTERNAL_FETCHER_URL
    const result = await pingFetcherWorker()
    expect(result.ok).toBe(false)
    expect(result.error).toContain("Worker non configuré")
  })

  it("retourne ok:true + body si 200", async () => {
    const body = { ok: true, uptime_s: 1234, pool: { size: 3, in_flight: 0, total_fetches: 0 } }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
    }))

    const result = await pingFetcherWorker()
    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
    expect(result.body).toEqual(body)
  })

  it("retourne ok:false si HTTP 5xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "down" }),
    }))

    const result = await pingFetcherWorker()
    expect(result.ok).toBe(false)
    expect(result.status).toBe(503)
  })
})
