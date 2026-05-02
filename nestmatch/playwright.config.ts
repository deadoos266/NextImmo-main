/**
 * V55.4 — Playwright E2E config — KeyMatch.
 *
 * 3 projets ciblant les viewports critiques du produit :
 *   - desktop-chromium  : 1280×720 Chromium
 *   - mobile-iphone     : iPhone 13 (390×844) WebKit
 *   - tablet-ipad       : iPad Mini (768×1024) WebKit
 *
 * Tests E2E répartis dans `e2e/*.spec.ts`. Pas de tests intégrés au
 * dossier `__tests__/` (réservé Vitest) ni à `tests/` (déjà utilisé pour
 * d'autres choses) — `e2e/` au top-level est dédié.
 *
 * Lancement :
 *   npx playwright test                 # tous les projets
 *   npx playwright test --project=desktop-chromium
 *   npx playwright test --ui            # UI mode (debug)
 *
 * Pré-requis : `npx playwright install chromium webkit` une fois.
 */

import { defineConfig, devices } from "@playwright/test"

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000"

export default defineConfig({
  testDir: "./e2e",
  // Pas de retry en local (on veut voir l'erreur vraie). 2 retries en CI
  // pour absorber les flakes inévitables (réseau, races).
  retries: process.env.CI ? 2 : 0,
  // Tests en parallèle sur 2 workers max (limite charge sur le dev server).
  workers: process.env.CI ? 4 : 2,
  // Timeout par test : 30s (généreux pour les pages lourdes /annonces /messages).
  timeout: 30_000,
  // Reporter console + HTML pour CI artefact + on-failure pour Sentry-style.
  reporter: process.env.CI
    ? [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : [["list"]],
  use: {
    baseURL: BASE_URL,
    // Trace = dump complet du test (DOM, screenshots, network) en cas d'échec.
    // Précieux pour diagnostiquer une régression sans devoir reproduire localement.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Locale FR pour cohérence avec dates/montants.
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } },
    },
    {
      name: "mobile-iphone",
      use: { ...devices["iPhone 13"] },
    },
    {
      name: "tablet-ipad",
      use: { ...devices["iPad Mini"] },
    },
  ],
  // Auto-spawn du dev server pour les tests locaux.
  // En CI, on suppose le serveur déjà lancé via le script CI.
  webServer: process.env.CI ? undefined : {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
