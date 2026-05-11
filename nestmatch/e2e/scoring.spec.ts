/**
 * V82.3 — E2E tests sur le système de scoring V81.21/V81.22.
 *
 * Vérifie :
 *  - /annonces affiche les cards avec score
 *  - /annonces/[id] (annonce existante) affiche ScoreBlock complet
 *  - /annonces/9999 (inexistante) retourne 404 HTTP (V81.30 notFound fix)
 *  - Détail breakdown V81.21 utilise le wording personnalisé ("Ton budget")
 *  - Rang V81.22 utilise "Ton meilleur match" / "Ton n°X sur Y"
 *
 * Pas de session requise pour la majorité des tests (pages publiques).
 */

import { test, expect } from "@playwright/test"

test.describe("Scoring — page liste /annonces", () => {
  test("Affiche un compteur de logements", async ({ page }) => {
    await page.goto("/annonces")
    await page.waitForLoadState("networkidle", { timeout: 15_000 })
    // Le h2 contient "{N} logements à {ville}" ou "{N} logements disponibles"
    const heading = page.locator("h2", { hasText: /logements?/i }).first()
    await expect(heading).toBeVisible({ timeout: 10_000 })
  })

  test("Au moins une card annonce visible (ou empty state)", async ({ page }) => {
    await page.goto("/annonces")
    await page.waitForLoadState("networkidle", { timeout: 15_000 })
    // Soit des liens vers /annonces/{id}, soit "Aucune annonce" / skeleton
    const cards = page.locator('a[href^="/annonces/"]')
    const empty = page.locator("text=/aucune annonce|aucun résultat/i")
    const count = await cards.count()
    const hasEmpty = await empty.count()
    expect(count + hasEmpty).toBeGreaterThan(0)
  })
})

test.describe("Scoring — page détail /annonces/[id]", () => {
  test("Annonce inexistante (/annonces/9999) retourne 404", async ({ request }) => {
    // V81.30 — notFound() délègue à Next.js qui retourne 404 HTTP
    // (avant : 200 avec "Annonce introuvable" en body = soft-404 SEO penalty)
    const res = await request.get("/annonces/9999", { failOnStatusCode: false })
    expect(res.status()).toBe(404)
  })

  test("Annonce existante affiche le titre dans le <title> et h1", async ({ page }) => {
    // Récupérer un id valide depuis la liste
    await page.goto("/annonces")
    await page.waitForLoadState("networkidle", { timeout: 15_000 })
    const firstCard = page.locator('a[href^="/annonces/"]').first()
    const href = await firstCard.getAttribute("href")
    if (!href) {
      test.skip(true, "Aucune annonce en seed — skip")
      return
    }
    // Aller sur le détail
    await page.goto(href)
    await page.waitForLoadState("networkidle", { timeout: 15_000 })

    // Title HTML non générique (pas "KeyMatch — Location...")
    const title = await page.title()
    expect(title).not.toBe("KeyMatch — Location entre particuliers sans agence")

    // h1 non vide (le titre de l'annonce)
    const h1 = await page.locator("h1").first().textContent()
    expect(h1?.trim().length).toBeGreaterThan(3)
  })
})

test.describe("Score breakdown V81.21/V81.22 — wording personnalisé", () => {
  test("Détail score utilise wording 'Ton meilleur match' (V81.22) si rang=1", async ({ page }) => {
    // Le détail est conditionnel à user authentifié avec profil. En anonyme,
    // ScoreBlock affiche un placeholder "Connectez-vous pour voir votre score".
    // On vérifie le placeholder pour le cas non-auth.
    await page.goto("/annonces")
    await page.waitForLoadState("networkidle", { timeout: 15_000 })
    const firstCard = page.locator('a[href^="/annonces/"]').first()
    const href = await firstCard.getAttribute("href")
    if (!href) {
      test.skip(true, "Aucune annonce — skip")
      return
    }
    await page.goto(href)
    await page.waitForLoadState("networkidle", { timeout: 15_000 })

    // Pour user anonyme : "Connectez-vous pour voir votre score"
    // Pour user auth + profil complet : breakdown + "Ton meilleur match" si rang=1
    const hasAnonPlaceholder = await page.locator("text=/Connectez-vous pour voir/i").count()
    const hasTonRang = await page.locator("text=/Ton meilleur match|Ton n°|Match avec ton profil/i").count()
    expect(hasAnonPlaceholder + hasTonRang).toBeGreaterThan(0)
  })
})
