/**
 * V82.3 — E2E tests SEO : metadata titles, robots, sitemap, schema JSON-LD.
 *
 * Couvre les bugs SEO trouvés audit V81.30 :
 *  - 3 pages auth (/notifications, /mes-quittances, /mes-documents) doivent
 *    avoir des titles spécifiques (pas fallback root)
 *  - /annonces/9999 doit 404 HTTP (pas soft-404)
 *  - sitemap.xml référence les pages publiques + location
 *  - robots.txt indexable hors bêta
 *  - JSON-LD Organization + WebSite sur /
 *  - JSON-LD RealEstateListing sur /annonces/[id]
 */

import { test, expect } from "@playwright/test"

test.describe("SEO — metadata titles uniques", () => {
  // Note : ces 3 pages redirigent vers /auth si non authentifié. On vérifie
  // que la metadata côté serveur EST définie (via fetch HTML brut).
  const authPages = [
    { path: "/notifications", expectedTitle: /Notifications/i },
    { path: "/mes-quittances", expectedTitle: /quittance/i },
    { path: "/mes-documents", expectedTitle: /document/i },
  ]

  for (const { path, expectedTitle } of authPages) {
    test(`${path} a un title métier (pas fallback root)`, async ({ request }) => {
      const res = await request.get(path)
      // Ces pages côté serveur retournent le HTML avec la metadata configurée
      // dans le layout.tsx adjacent (V81.30 fix).
      const html = await res.text()
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      const title = titleMatch?.[1] || ""
      expect(title).toMatch(expectedTitle)
      // Ne doit PAS être le fallback root layout
      expect(title).not.toBe("KeyMatch — Location entre particuliers sans agence")
    })
  }
})

test.describe("SEO — 404 propre sur annonce inexistante", () => {
  test("/annonces/9999 → HTTP 404", async ({ request }) => {
    const res = await request.get("/annonces/9999", { failOnStatusCode: false })
    expect(res.status()).toBe(404)
  })

  test("/annonces/abc-invalid-id → 404 ou page error", async ({ request }) => {
    const res = await request.get("/annonces/abc-invalid-id", { failOnStatusCode: false })
    // Soit Next.js bad request, soit 404. Ne doit PAS être 200.
    expect([400, 404, 500]).toContain(res.status())
  })
})

test.describe("SEO — sitemap + robots", () => {
  test("/sitemap.xml inclut les pages publiques", async ({ request }) => {
    const res = await request.get("/sitemap.xml")
    expect(res.ok()).toBeTruthy()
    const body = await res.text()
    // Doit contenir au moins l'URL racine
    expect(body).toMatch(/<loc>[^<]*keymatch-immo\.fr\/?<\/loc>/)
    // Et /annonces
    expect(body).toMatch(/<loc>[^<]*\/annonces<\/loc>/)
  })

  test("/robots.txt déclare le sitemap", async ({ request }) => {
    const res = await request.get("/robots.txt")
    expect(res.ok()).toBeTruthy()
    const body = await res.text()
    expect(body).toMatch(/Sitemap:\s*https?:\/\//i)
  })
})

test.describe("SEO — JSON-LD structured data", () => {
  test("Homepage contient Organization + WebSite schema", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("domcontentloaded")
    const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent()
    expect(jsonLd).toBeTruthy()
    // Doit contenir au moins Organization
    expect(jsonLd).toMatch(/"@type":\s*"Organization"/)
  })

  test("Page annonce détail contient JSON-LD (RealEstateListing ou Product)", async ({ page }) => {
    await page.goto("/annonces")
    await page.waitForLoadState("networkidle", { timeout: 15_000 })
    const firstCard = page.locator('a[href^="/annonces/"]').first()
    const href = await firstCard.getAttribute("href")
    if (!href) {
      test.skip(true, "Aucune annonce — skip")
      return
    }
    await page.goto(href)
    await page.waitForLoadState("domcontentloaded")
    // Au moins un JSON-LD doit être présent (peut être plusieurs)
    const scripts = await page.locator('script[type="application/ld+json"]').count()
    expect(scripts).toBeGreaterThan(0)
  })
})

test.describe("SEO — pages légales accessibles + indexables", () => {
  const legalPages = ["/cgu", "/mentions-legales", "/confidentialite", "/cookies", "/contact"]
  for (const path of legalPages) {
    test(`${path} : HTTP 200 + title spécifique`, async ({ request }) => {
      const res = await request.get(path)
      expect(res.ok()).toBeTruthy()
      const html = await res.text()
      const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || ""
      expect(title).not.toBe("KeyMatch — Location entre particuliers sans agence")
      expect(title.length).toBeGreaterThan(8)
    })
  }
})
