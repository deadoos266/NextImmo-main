/**
 * V97.39 P3-7 Phase 1 — Tests fetcher-router.
 *
 * Vérifie le routing par hostname : leboncoin.fr/seloger.com/logic-immo.com
 * doivent passer par le worker si EXTERNAL_FETCHER_ENABLED_HOSTS est configuré,
 * sinon retour fetcher local.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { shouldUseRemoteFetcher } from "../fetcher-router"

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
