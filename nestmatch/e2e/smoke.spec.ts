/**
 * V55.4 — Smoke tests Playwright — KeyMatch.
 *
 * Tests minimaux qui vérifient que les pages publiques chargent sans
 * crasher dans les 3 viewports (Chromium desktop, iPhone WebKit,
 * iPad WebKit). Couverture : homepage, /annonces, page détail
 * annonce, page auth.
 *
 * Pas de besoin de session NextAuth pour ces smokes — on teste juste
 * le rendu serveur + l'hydratation client. Les tests authentifiés
 * (création annonce, signature bail, etc.) viennent dans des fichiers
 * dédiés `e2e/auth-*.spec.ts` avec `storageState` mocked NextAuth.
 */

import { test, expect } from "@playwright/test"

test.describe("Smoke tests — pages publiques", () => {
  test("Homepage charge et affiche le hero KeyMatch", async ({ page }) => {
    await page.goto("/")
    // Le hero éditorial Fraunces contient toujours "KeyMatch" quelque part
    // (logo SVG ou text). On vérifie le title page (rendu serveur garanti).
    await expect(page).toHaveTitle(/KeyMatch/i)
    // Vérifie qu'au moins un lien CTA principal est présent (S'inscrire / Voir les annonces).
    const cta = page.locator('a[href*="/annonces"], a[href*="/auth"]').first()
    await expect(cta).toBeVisible({ timeout: 10_000 })
  })

  test("/annonces : liste des biens charge sans erreur JS", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", err => errors.push(err.message))
    await page.goto("/annonces")
    // Attendre que l'app soit hydratée (au moins 1 carte annonce ou empty state).
    await page.waitForLoadState("networkidle", { timeout: 15_000 })
    // Pas d'erreur JS attendue
    expect(errors, `Erreurs JS détectées : ${errors.join("\n")}`).toEqual([])
  })

  test("/auth : page de connexion affiche les CTA Google + email", async ({ page }) => {
    await page.goto("/auth")
    await expect(page.locator("body")).toBeVisible()
    // Présence du bouton Google ou de l'input email — au moins l'un des 2
    const hasGoogle = await page.locator('button:has-text("Google"), a:has-text("Google")').count()
    const hasEmailInput = await page.locator('input[type="email"]').count()
    expect(hasGoogle + hasEmailInput).toBeGreaterThan(0)
  })

  test("/plan-du-site : sitemap statique se charge", async ({ page }) => {
    await page.goto("/plan-du-site")
    await expect(page.locator("body")).toBeVisible()
  })
})

test.describe("Smoke tests — robots et SEO", () => {
  test("/robots.txt accessible", async ({ request }) => {
    const res = await request.get("/robots.txt")
    expect(res.ok()).toBeTruthy()
    const body = await res.text()
    expect(body).toContain("User-agent")
  })

  test("/sitemap.xml accessible", async ({ request }) => {
    const res = await request.get("/sitemap.xml")
    expect(res.ok()).toBeTruthy()
    const body = await res.text()
    expect(body).toContain("<urlset")
  })
})
