/**
 * V83.2 — Types partagés pour le QA Bot (lib/qa/*).
 */

export type ScenarioStep =
  | { goto: string }
  | { click: string }
  | { fill: { selector: string; value: string } }
  | { type: { selector: string; value: string } }
  | { expect_url: string }
  | { expect_url_pattern: string }
  | { expect_visible: string }
  | { expect_text: { selector: string; value: string } }
  | { expect_count: { selector: string; min?: number; max?: number; exact?: number } }
  | { expect_meta: { name?: string; property?: string; content_pattern: string } }
  | { expect_status: number }
  | { expect_content_type: string }
  | { screenshot: string }
  | { wait: number }
  | { wait_for: string }
  | { login_as: string }
  | { request: string }  // "GET /og-default.png"

export type Scenario = {
  name: string
  role?: "anonymous" | "locataire" | "proprietaire" | "admin"
  priority?: "P0" | "P1" | "P2"
  steps: ScenarioStep[]
}

export type StepResult = {
  step_index: number
  step: ScenarioStep
  status: "pass" | "fail"
  duration_ms: number
  error?: string
  screenshot_url?: string
}

export type RunResult = {
  scenario_name: string
  scenario_file: string
  status: "pass" | "fail" | "partial"
  started_at: string
  finished_at: string
  duration_ms: number
  steps_total: number
  steps_passed: number
  steps_failed: number
  step_results: StepResult[]
  screenshots: Array<{ name: string; url: string; step_index: number }>
  errors: Array<{ step_index: number; message: string }>
  network_log: Array<{ url: string; status: number; method: string }>
  console_log: Array<{ level: string; text: string }>
}
