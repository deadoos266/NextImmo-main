"use client"
import { useEffect, useState } from "react"

/**
 * V83.5 — Client component pour /admin/qa.
 *
 * - Affichage stats + table runs (server-rendered via props)
 * - Bouton "Run scenario X" → POST /api/qa/run (mode B : déclencheur seul,
 *   nécessite ensuite un runner externe pour exécuter Playwright)
 * - Click ligne → fetch GET /api/qa/runs/[id] + affiche modal détail
 */

type Run = {
  id: string
  scenario_name: string
  scenario_file: string
  status: string
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  steps_total: number
  steps_passed: number
  steps_failed: number
  trigger: string
  triggered_by: string | null
}

type Scenario = {
  file: string
  name: string
  role: string
  priority: string
  steps_count: number
}

type Stats = {
  total: number
  passed: number
  failed: number
  partial: number
  passRate: number
}

type RunDetail = Run & {
  screenshots: Array<{ name: string; url: string; step_index: number }>
  errors: Array<{ step_index: number; message: string }>
  network_log: Array<{ url: string; status: number; method: string }> | null
  console_log: Array<{ level: string; text: string }> | null
}

const BEIGE = "#F7F4EF"
const INK = "#111"
const MUTED = "#6b6358"
const LINE = "#EAE6DF"

function statusColor(status: string): string {
  if (status === "pass") return "#15803d"
  if (status === "fail") return "#b91c1c"
  if (status === "partial") return "#a16207"
  return "#6b6358"
}

function statusIcon(status: string): string {
  if (status === "pass") return "✓"
  if (status === "fail") return "✗"
  if (status === "partial") return "⚠"
  return "•"
}

export default function QaAdminClient({
  runs: initialRuns,
  stats,
  scenarios,
}: {
  runs: Run[]
  stats: Stats
  scenarios: Scenario[]
}) {
  const [runs, setRuns] = useState<Run[]>(initialRuns)
  const [running, setRunning] = useState<string | null>(null)
  const [selected, setSelected] = useState<RunDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const triggerScenario = async (scenarioFile: string) => {
    setRunning(scenarioFile)
    setMsg(null)
    try {
      const res = await fetch("/api/qa/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: scenarioFile }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error || "Échec")
      setMsg(`Scénario "${scenarioFile}" déclenché (run ${j.run_id?.slice(0, 8)}). En attente du runner externe.`)
      // Refresh runs list après 1s
      setTimeout(refresh, 1000)
    } catch (e) {
      setMsg(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setRunning(null)
    }
  }

  const refresh = async () => {
    try {
      const res = await fetch("/api/qa/runs?limit=50", { cache: "no-store" })
      const j = await res.json()
      if (j.ok && Array.isArray(j.runs)) setRuns(j.runs)
    } catch { /* silent */ }
  }

  const openDetail = async (id: string) => {
    setLoadingDetail(true)
    setSelected(null)
    try {
      const res = await fetch(`/api/qa/runs/${id}`, { cache: "no-store" })
      const j = await res.json()
      if (j.ok) setSelected(j.run)
    } finally {
      setLoadingDetail(false)
    }
  }

  // Auto-refresh 30s
  useEffect(() => {
    const t = setInterval(refresh, 30_000)
    return () => clearInterval(t)
  }, [])

  return (
    <>
      {/* Stats */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 28 }}>
        <StatCard label="Runs 7 jours" value={stats.total} />
        <StatCard label="Pass" value={stats.passed} accent="#15803d" />
        <StatCard label="Partial" value={stats.partial} accent="#a16207" />
        <StatCard label="Fail" value={stats.failed} accent="#b91c1c" />
        <StatCard label="Pass rate" value={`${stats.passRate}%`} accent={stats.passRate >= 90 ? "#15803d" : stats.passRate >= 70 ? "#a16207" : "#b91c1c"} />
      </section>

      {/* Scenarios disponibles */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: "0 0 14px" }}>
          Scénarios disponibles ({scenarios.length})
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          {scenarios.map(s => (
            <div key={s.file} style={{ background: "white", border: `1px solid ${LINE}`, borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 }}>
                {s.priority} · {s.role}
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, color: INK, marginBottom: 4 }}>{s.name}</div>
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 12 }}>{s.file} · {s.steps_count} steps</div>
              <button
                type="button"
                disabled={running === s.file}
                onClick={() => triggerScenario(s.file)}
                style={{
                  background: INK, color: "white", border: "none",
                  padding: "8px 16px", borderRadius: 999, fontSize: 11,
                  fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
                  cursor: running === s.file ? "wait" : "pointer",
                  opacity: running === s.file ? 0.6 : 1,
                  fontFamily: "inherit",
                }}
              >
                {running === s.file ? "Lancement…" : "Run"}
              </button>
            </div>
          ))}
        </div>
        {msg && (
          <div style={{ marginTop: 14, padding: "10px 14px", background: "#EEF3FB", border: "1px solid #D7E3F4", borderRadius: 10, fontSize: 13, color: "#1d4ed8" }}>
            {msg}
          </div>
        )}
      </section>

      {/* Table runs */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: 0 }}>
            Derniers runs ({runs.length})
          </h2>
          <button onClick={refresh} style={{ background: "transparent", border: `1px solid ${LINE}`, padding: "6px 14px", borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: "pointer", color: INK, fontFamily: "inherit" }}>
            ↻ Refresh
          </button>
        </div>

        <div style={{ background: "white", border: `1px solid ${LINE}`, borderRadius: 14, overflow: "hidden" }}>
          {runs.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center", color: MUTED, fontSize: 14 }}>
              Aucun run pour l&apos;instant. Lance un scénario ci-dessus.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: BEIGE, color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 }}>
                  <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>Status</th>
                  <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>Scénario</th>
                  <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700 }}>Steps</th>
                  <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700 }}>Durée</th>
                  <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>Trigger</th>
                  <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700 }}>Quand</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(r => (
                  <tr
                    key={r.id}
                    onClick={() => openDetail(r.id)}
                    style={{ cursor: "pointer", borderTop: `1px solid ${LINE}` }}
                    onMouseEnter={e => e.currentTarget.style.background = BEIGE}
                    onMouseLeave={e => e.currentTarget.style.background = "white"}
                  >
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: statusColor(r.status), fontWeight: 700 }}>
                        {statusIcon(r.status)} <span style={{ textTransform: "uppercase", fontSize: 10, letterSpacing: 0.6 }}>{r.status}</span>
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", color: INK }}>{r.scenario_name}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: MUTED }}>
                      {r.steps_passed}/{r.steps_total}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: MUTED }}>
                      {r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : "—"}
                    </td>
                    <td style={{ padding: "10px 14px", color: MUTED, fontSize: 11 }}>
                      {r.trigger} · {r.triggered_by?.slice(0, 20) || "—"}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: MUTED, fontSize: 11 }}>
                      {new Date(r.started_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Detail modal */}
      {(selected || loadingDetail) && (
        <DetailModal run={selected} loading={loadingDetail} onClose={() => setSelected(null)} />
      )}
    </>
  )
}

function StatCard({ label, value, accent = INK }: { label: string; value: string | number; accent?: string }) {
  return (
    <div style={{ background: "white", border: `1px solid ${LINE}`, borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent, fontFamily: "'Fraunces', serif", fontStyle: "italic", lineHeight: 1 }}>
        {value}
      </div>
    </div>
  )
}

function DetailModal({ run, loading, onClose }: { run: RunDetail | null; loading: boolean; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.55)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: "white", borderRadius: 18, width: "min(900px, 100%)", maxHeight: "90vh", overflowY: "auto", padding: 24, fontFamily: "'DM Sans', sans-serif" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: 0 }}>
            Détail run
          </h3>
          <button onClick={onClose} style={{ background: BEIGE, border: `1px solid ${LINE}`, borderRadius: 999, width: 36, height: 36, cursor: "pointer", fontSize: 16, fontFamily: "inherit" }}>×</button>
        </div>

        {loading && <p style={{ color: MUTED }}>Chargement…</p>}

        {run && (
          <>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{run.scenario_name}</div>
              <div style={{ fontSize: 12, color: MUTED }}>
                {run.scenario_file} · <span style={{ color: statusColor(run.status), fontWeight: 700 }}>{statusIcon(run.status)} {run.status}</span> · {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : "—"} · {run.steps_passed}/{run.steps_total} steps OK
              </div>
            </div>

            {run.errors && run.errors.length > 0 && (
              <div style={{ marginBottom: 14, padding: 12, background: "#FEECEC", border: "1px solid #F4C9C9", borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#b91c1c", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Erreurs ({run.errors.length})</div>
                {run.errors.map((e, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#7f1d1d", marginBottom: 6, fontFamily: "monospace" }}>
                    Step {e.step_index}: {e.message}
                  </div>
                ))}
              </div>
            )}

            {run.screenshots && run.screenshots.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                  Screenshots ({run.screenshots.length})
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
                  {run.screenshots.map((s, i) => (
                    <a key={i} href={s.url} target="_blank" rel="noopener" style={{ display: "block", border: `1px solid ${LINE}`, borderRadius: 8, overflow: "hidden", textDecoration: "none" }}>
                      {s.url ? (
                        <img src={s.url} alt={s.name} style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />
                      ) : (
                        <div style={{ height: 120, background: BEIGE, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: MUTED }}>
                          {s.name}
                        </div>
                      )}
                      <div style={{ padding: 6, fontSize: 10, color: MUTED, textAlign: "center" }}>
                        Step {s.step_index} · {s.name}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {run.network_log && Array.isArray(run.network_log) && run.network_log.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                  Network errors ({run.network_log.length})
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 11, background: BEIGE, padding: 10, borderRadius: 8, maxHeight: 200, overflowY: "auto" }}>
                  {run.network_log.map((n, i) => (
                    <div key={i} style={{ color: n.status >= 500 ? "#b91c1c" : "#a16207" }}>
                      {n.method} {n.status} {n.url.slice(0, 80)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {run.console_log && Array.isArray(run.console_log) && run.console_log.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                  Console errors ({run.console_log.length})
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 11, background: BEIGE, padding: 10, borderRadius: 8, maxHeight: 200, overflowY: "auto" }}>
                  {run.console_log.map((c, i) => (
                    <div key={i} style={{ color: c.level === "error" ? "#b91c1c" : "#a16207" }}>
                      [{c.level}] {c.text.slice(0, 200)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
