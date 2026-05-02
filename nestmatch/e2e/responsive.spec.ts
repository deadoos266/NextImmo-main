/**
 * V55.4 — Tests responsive multi-viewports.
 *
 * Vérifie que la navbar, le footer et les blocs principaux ne overflow
 * pas dans les viewports mobile/tablet/desktop. Les bugs responsive
 * (boutons cassés sur iPhone SE, scroll horizontal indésirable) seraient
 * captés ici.
 */

import { test, expect } from "@playwright/test"

test.describe("Responsive — viewports critiques", () => {
  test("Homepage : pas de scroll horizontal indésirable", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle", { timeout: 10_000 })
    // body.scrollWidth ne doit pas dépasser le viewport (sinon = scroll horizontal)
    const overflowX = await page.evaluate(() => {
      return document.documentElement.scrollWidth - document.documentElement.clientWidth
    })
    // Tolérance 4px (scrollbar mobile/desktop variable)
    expect(overflowX, `Page overflow horizontal de ${overflowX}px`).toBeLessThanOrEqual(4)
  })

  test("/annonces : pas de scroll horizontal indésirable", async ({ page }) => {
    await page.goto("/annonces")
    await page.waitForLoadState("networkidle", { timeout: 15_000 })
    const overflowX = await page.evaluate(() => {
      return document.documentElement.scrollWidth - document.documentElement.clientWidth
    })
    expect(overflowX, `Page overflow horizontal de ${overflowX}px`).toBeLessThanOrEqual(4)
  })

  test("Navbar accessible sur tous les viewports", async ({ page }) => {
    await page.goto("/")
    // Le header de navigation doit être visible quel que soit le viewport.
    // Sur mobile, c'est souvent un burger ; sur desktop, des liens directs.
    const navbar = page.locator("header, nav, [role='navigation']").first()
    await expect(navbar).toBeVisible({ timeout: 5_000 })
  })
})
