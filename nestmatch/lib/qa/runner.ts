/**
 * V83.2 — QA Bot runner Playwright.
 *
 * Lance un scénario YAML via Playwright headless (chromium).
 * Capture screenshots + network + console errors.
 *
 * USAGE serveur :
 *   const result = await runScenario(yamlContent, fileName, { baseUrl })
 *
 * NOTE Vercel : Playwright n'est pas dispo dans Vercel serverless runtime
 * (binaire Chromium ~150MB). Pour exécuter sur Vercel :
 *  - Soit utiliser @sparticuz/chromium + playwright-core (lambda-friendly)
 *  - Soit déléguer à un service externe (BrowserStack, Browserless)
 *  - Soit run en local/cron sur un autre serveur qui POST le résultat
 *
 * Pour V83 MVP, on assume run LOCAL (CLI `pnpm qa:run`) ou via cron
 * GitHub Actions qui POST les résultats vers /api/qa/run. La ROUTE
 * /api/qa/run (V83.3) stocke en DB mais ne LANCE PAS Playwright.
 */

import { chromium, type Browser, type Page, type ConsoleMessage } from "@playwright/test"
import type { Scenario, ScenarioStep, StepResult, RunResult } from "./types"
import { getStepType, getStepValue } from "./parser"

export type RunnerOptions = {
  baseUrl: string  // ex: "https://keymatch-immo.fr" ou "http://localhost:3000"
  storageBucket?: string  // "qa-screenshots"
  uploadScreenshot?: (name: string, buffer: Buffer) => Promise<string>  // returns URL
}

const DEFAULT_TIMEOUT = 10_000

export async function runScenario(
  scenario: Scenario,
  fileName: string,
  opts: RunnerOptions
): Promise<RunResult> {
  const started_at = new Date().toISOString()
  const t0 = Date.now()
  const step_results: StepResult[] = []
  const screenshots: RunResult["screenshots"] = []
  const errors: RunResult["errors"] = []
  const network_log: RunResult["network_log"] = []
  const console_log: RunResult["console_log"] = []

  let browser: Browser | null = null
  let page: Page | null = null

  try {
    browser = await chromium.launch({ headless: true })
    const ctx = await browser.newContext({
      baseURL: opts.baseUrl,
      locale: "fr-FR",
      timezoneId: "Europe/Paris",
      viewport: { width: 1280, height: 800 },
    })
    page = await ctx.newPage()

    // Capture console + network
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        console_log.push({ level: msg.type(), text: msg.text().slice(0, 500) })
      }
    })
    page.on("response", res => {
      const status = res.status()
      // Log only 4xx/5xx + assets clés
      if (status >= 400) {
        network_log.push({ url: res.url(), status, method: res.request().method() })
      }
    })

    // Execute steps
    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i]
      const stepT0 = Date.now()
      try {
        await executeStep(page, step, opts, i, screenshots)
        step_results.push({
          step_index: i,
          step,
          status: "pass",
          duration_ms: Date.now() - stepT0,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        errors.push({ step_index: i, message: message.slice(0, 500) })
        // Screenshot auto on fail
        try {
          const failName = `step-${i}-fail`
          const buf = await page.screenshot({ fullPage: false })
          let url = ""
          if (opts.uploadScreenshot) {
            url = await opts.uploadScreenshot(failName, buf)
            screenshots.push({ name: failName, url, step_index: i })
          }
          step_results.push({
            step_index: i,
            step,
            status: "fail",
            duration_ms: Date.now() - stepT0,
            error: message.slice(0, 500),
            screenshot_url: url || undefined,
          })
        } catch {
          step_results.push({
            step_index: i,
            step,
            status: "fail",
            duration_ms: Date.now() - stepT0,
            error: message.slice(0, 500),
          })
        }
        // Continue les steps suivants même après fail (mode "partial")
      }
    }
  } finally {
    if (page) await page.close().catch(() => {})
    if (browser) await browser.close().catch(() => {})
  }

  const steps_passed = step_results.filter(r => r.status === "pass").length
  const steps_failed = step_results.filter(r => r.status === "fail").length
  const finished_at = new Date().toISOString()
  const duration_ms = Date.now() - t0

  let status: RunResult["status"]
  if (steps_failed === 0) status = "pass"
  else if (steps_passed === 0) status = "fail"
  else status = "partial"

  return {
    scenario_name: scenario.name,
    scenario_file: fileName,
    status,
    started_at,
    finished_at,
    duration_ms,
    steps_total: scenario.steps.length,
    steps_passed,
    steps_failed,
    step_results,
    screenshots,
    errors,
    network_log,
    console_log,
  }
}

async function executeStep(
  page: Page,
  step: ScenarioStep,
  opts: RunnerOptions,
  stepIndex: number,
  screenshots: RunResult["screenshots"]
): Promise<void> {
  const type = getStepType(step)
  const value = getStepValue(step)

  switch (type) {
    case "goto": {
      const path = String(value)
      await page.goto(path, { timeout: DEFAULT_TIMEOUT, waitUntil: "domcontentloaded" })
      break
    }
    case "click": {
      await page.click(String(value), { timeout: DEFAULT_TIMEOUT })
      break
    }
    case "fill": {
      const { selector, value: val } = value as { selector: string; value: string }
      await page.fill(selector, val, { timeout: DEFAULT_TIMEOUT })
      break
    }
    case "type": {
      const { selector, value: val } = value as { selector: string; value: string }
      await page.type(selector, val, { timeout: DEFAULT_TIMEOUT })
      break
    }
    case "expect_url": {
      const expected = String(value)
      const current = new URL(page.url()).pathname
      if (current !== expected) {
        throw new Error(`URL attendue ${expected}, reçue ${current}`)
      }
      break
    }
    case "expect_url_pattern": {
      const pattern = new RegExp(String(value))
      const current = new URL(page.url()).pathname
      if (!pattern.test(current)) {
        throw new Error(`URL ${current} ne match pas ${pattern}`)
      }
      break
    }
    case "expect_visible": {
      const el = page.locator(String(value)).first()
      await el.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT })
      break
    }
    case "expect_text": {
      const { selector, value: val } = value as { selector: string; value: string }
      const text = await page.locator(selector).first().textContent({ timeout: DEFAULT_TIMEOUT })
      if (!text || !text.includes(val)) {
        throw new Error(`Texte attendu "${val}" non trouvé dans "${text?.slice(0, 100)}"`)
      }
      break
    }
    case "expect_count": {
      const { selector, min, max, exact } = value as { selector: string; min?: number; max?: number; exact?: number }
      const count = await page.locator(selector).count()
      if (exact !== undefined && count !== exact) {
        throw new Error(`Count attendu ${exact}, reçu ${count} pour ${selector}`)
      }
      if (min !== undefined && count < min) {
        throw new Error(`Count ≥${min} attendu, reçu ${count}`)
      }
      if (max !== undefined && count > max) {
        throw new Error(`Count ≤${max} attendu, reçu ${count}`)
      }
      break
    }
    case "expect_meta": {
      const { name, property, content_pattern } = value as { name?: string; property?: string; content_pattern: string }
      const selector = name ? `meta[name="${name}"]` : `meta[property="${property}"]`
      const content = await page.locator(selector).first().getAttribute("content")
      if (!content) throw new Error(`Meta ${selector} non trouvé`)
      const pattern = new RegExp(content_pattern)
      if (!pattern.test(content)) {
        throw new Error(`Meta ${selector}=${content} ne match pas ${pattern}`)
      }
      break
    }
    case "screenshot": {
      const name = String(value)
      const buf = await page.screenshot({ fullPage: false })
      if (opts.uploadScreenshot) {
        const url = await opts.uploadScreenshot(name, buf)
        screenshots.push({ name, url, step_index: stepIndex })
      } else {
        screenshots.push({ name, url: "", step_index: stepIndex })
      }
      break
    }
    case "wait": {
      await page.waitForTimeout(Number(value))
      break
    }
    case "wait_for": {
      await page.locator(String(value)).first().waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT })
      break
    }
    case "request": {
      // "GET /og-default.png" → fetch
      const [method, path] = String(value).split(" ")
      const url = path.startsWith("http") ? path : opts.baseUrl + path
      const res = await page.request.fetch(url, { method: method || "GET" })
      // Store for next expect_status / expect_content_type
      ;(page as unknown as { __lastResponse?: { status: number; headers: Record<string, string> } }).__lastResponse = {
        status: res.status(),
        headers: res.headers(),
      }
      break
    }
    case "expect_status": {
      const last = (page as unknown as { __lastResponse?: { status: number } }).__lastResponse
      if (!last) throw new Error("expect_status sans request préalable")
      if (last.status !== Number(value)) {
        throw new Error(`Status attendu ${value}, reçu ${last.status}`)
      }
      break
    }
    case "expect_content_type": {
      const last = (page as unknown as { __lastResponse?: { headers: Record<string, string> } }).__lastResponse
      if (!last) throw new Error("expect_content_type sans request préalable")
      const ct = last.headers["content-type"] || ""
      if (!ct.includes(String(value))) {
        throw new Error(`Content-Type attendu "${value}", reçu "${ct}"`)
      }
      break
    }
    case "login_as": {
      // Placeholder pour V83+ — nécessite test users seedés en DB
      // + cookie session NextAuth. Pour l'instant, fail explicite.
      throw new Error(`login_as non implémenté en V83.2 (nécessite fixtures NextAuth, V83.5+)`)
    }
    default:
      throw new Error(`Step type inconnu : ${type}`)
  }
}
