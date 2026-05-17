/**
 * V97.39 P3-7 Phase 1 — Tests fetcher-router.
 *
 * Vérifie le routing par hostname : leboncoin.fr/seloger.com/logic-immo.com
 * doivent passer par le worker si EXTERNAL_FETCHER_ENABLED_HOSTS est configuré,
 * sinon retour fetcher local.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { shouldUseRemoteFetcher, isParserQuarantined, clearQuarantineCache } from "../fetcher-router"

describe("fetcher-router.shouldUseRemoteFetcher", () => {
  const ORIGINAL_HOSTS = process.env.EXTERNAL_FETCHER_ENABLED_HOSTS

  beforeEach(() => {
    delete process.env.EXTERNAL_FETCHER_ENABLED_HOSTS
  })

  afterEach(() => {
    if (ORIGINAL_HOSTS === undefined) delete process.env.EXTERNAL_FETCHER_ENABLED_HOSTS
    else process.env.EXTERNAL_FETCHER_ENABLED_HOSTS = ORIGINAL_HOSTS
  })

  it("retourne false quand aucun host n'est activé", () => {
    process.env.EXTERNAL_FETCHER_ENABLED_HOSTS = ""
    expect(shouldUseRemoteFetcher("https://leboncoin.fr/ad/locations/123")).toBe(false)
  })

  it("retourne false quand env var pas définie", () => {
    expect(shouldUseRemoteFetcher("https://leboncoin.fr/ad/locations/123")).toBe(false)
  })

  it("retourne true pour host exact dans allowlist", () => {
    process.env.EXTERNAL_FETCHER_ENABLED_HOSTS = "leboncoin.fr,seloger.com"
    expect(shouldUseRemoteFetcher("https://leboncoin.fr/ad/locations/123")).toBe(true)
    expect(shouldUseRemoteFetcher("https://seloger.com/annonces/456")).toBe(true)
  })

  it("retourne true pour www. subdomain", () => {
    process.env.EXTERNAL_FETCHER_ENABLED_HOSTS = "leboncoin.fr"
    expect(shouldUseRemoteFetcher("https://www.leboncoin.fr/ad/locations/123")).toBe(true)
  })

  it("retourne true pour subdomain non-www", () => {
    process.env.EXTERNAL_FETCHER_ENABLED_HOSTS = "leboncoin.fr"
    expect(shouldUseRemoteFetcher("https://api.leboncoin.fr/path")).toBe(true)
  })

  it("retourne false pour host pas dans allowlist", () => {
    process.env.EXTERNAL_FETCHER_ENABLED_HOSTS = "leboncoin.fr"
    expect(shouldUseRemoteFetcher("https://pap.fr/annonces/123")).toBe(false)
    expect(shouldUseRemoteFetcher("https://google.com/")).toBe(false)
  })

  it("retourne false pour URL invalide", () => {
    process.env.EXTERNAL_FETCHER_ENABLED_HOSTS = "leboncoin.fr"
    expect(shouldUseRemoteFetcher("not-a-url")).toBe(false)
    expect(shouldUseRemoteFetcher("")).toBe(false)
  })

  it("ignore espaces et casse dans la liste", () => {
    process.env.EXTERNAL_FETCHER_ENABLED_HOSTS = " LEBONCOIN.FR , SeLoger.com "
    expect(shouldUseRemoteFetcher("https://leboncoin.fr/")).toBe(true)
    expect(shouldUseRemoteFetcher("https://www.seloger.com/")).toBe(true)
  })

  it("ne match pas un host qui contient juste le nom (anti-spoofing)", () => {
    process.env.EXTERNAL_FETCHER_ENABLED_HOSTS = "leboncoin.fr"
    expect(shouldUseRemoteFetcher("https://fake-leboncoin.fr/")).toBe(false)
    expect(shouldUseRemoteFetcher("https://leboncoin.fr.attacker.com/")).toBe(false)
  })
})

// V97.39.5 — Circuit breaker (quarantaine après N échecs BOT_PROTECTION)
describe("fetcher-router.isParserQuarantined (circuit breaker)", () => {
  const ORIGINAL_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  beforeEach(() => {
    clearQuarantineCache()
  })

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_KEY
    vi.restoreAllMocks()
  })

  it("retourne false (fail-open) si SUPABASE_SERVICE_ROLE_KEY pas défini", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const result = await isParserQuarantined("leboncoin")
    expect(result).toBe(false)
  })

  it("retourne false si Supabase configuré mais pas d'échecs (count=0)", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key"
    const supaMod = await import("../../supabase-server")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      gte: () => Promise.resolve({ count: 0, error: null }),
    }
    vi.spyOn(supaMod.supabaseAdmin, "from").mockReturnValue(chain)

    const result = await isParserQuarantined("leboncoin")
    expect(result).toBe(false)
  })

  it("retourne true si >= 5 BOT_PROTECTION sur la dernière heure", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key"
    const supaMod = await import("../../supabase-server")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      gte: () => Promise.resolve({ count: 7, error: null }),
    }
    vi.spyOn(supaMod.supabaseAdmin, "from").mockReturnValue(chain)

    const result = await isParserQuarantined("leboncoin")
    expect(result).toBe(true)
  })

  it("retourne false si exactement 4 échecs (seuil = 5, strictement)", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key"
    const supaMod = await import("../../supabase-server")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      gte: () => Promise.resolve({ count: 4, error: null }),
    }
    vi.spyOn(supaMod.supabaseAdmin, "from").mockReturnValue(chain)

    const result = await isParserQuarantined("leboncoin")
    expect(result).toBe(false)
  })

  it("retourne false (fail-open) si Supabase renvoie une erreur", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key"
    const supaMod = await import("../../supabase-server")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      gte: () => Promise.resolve({ count: null, error: { message: "RLS denied" } }),
    }
    vi.spyOn(supaMod.supabaseAdmin, "from").mockReturnValue(chain)

    const result = await isParserQuarantined("leboncoin")
    expect(result).toBe(false)
  })

  it("met en cache 5min : 2e appel ne re-query pas Supabase", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key"
    const supaMod = await import("../../supabase-server")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      gte: () => Promise.resolve({ count: 10, error: null }),
    }
    const fromSpy = vi.spyOn(supaMod.supabaseAdmin, "from").mockReturnValue(chain)

    await isParserQuarantined("leboncoin")
    await isParserQuarantined("leboncoin")
    await isParserQuarantined("leboncoin")

    expect(fromSpy).toHaveBeenCalledTimes(1)
  })

  it("cache séparé par parser", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key"
    const supaMod = await import("../../supabase-server")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      gte: () => Promise.resolve({ count: 10, error: null }),
    }
    const fromSpy = vi.spyOn(supaMod.supabaseAdmin, "from").mockReturnValue(chain)

    await isParserQuarantined("leboncoin")
    await isParserQuarantined("seloger")
    await isParserQuarantined("logic-immo")

    expect(fromSpy).toHaveBeenCalledTimes(3)
  })
})
