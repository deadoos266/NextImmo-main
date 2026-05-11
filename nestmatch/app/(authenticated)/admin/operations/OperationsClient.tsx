"use client"
import { useState } from "react"
import Link from "next/link"
import { km } from "../../../components/ui/km"

type CronLog = {
  id: number
  cron_name: string
  cron_path: string
  status: string
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  error_message: string | null
  result_summary: unknown
}

type Incident = {
  id: number
  title: string
  description: string | null
  severity: string
  service: string
  status: string
  scope: string
  started_at: string
}

type QaRun = {
  id: string
  scenario_name: string
  status: string
  started_at: string
  duration_ms: number | null
  steps_passed: number
  steps_total: number
}

type Bug = {
  id: string
  description: string
  severity: string
  status: string
  page_url: string
  user_email: string | null
  created_at: string
}

function statusColor(s: string): string {
  if (s === "pass" || s === "success" || s === "resolved" || s === "fixed") return "#15803d"
  if (s === "fail" || s === "failure" || s === "timeout" || s === "critical") return "#b91c1c"
  if (s === "partial" || s === "warning" || s === "major" || s === "open" || s === "investigating") return "#a16207"
  return "#6b6358"
}

function CollapsibleSection({ title, count, defaultOpen = true, children }: {
  title: string
  count?: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section style={{ background: "white", border: `1px solid ${km.line}`, borderRadius: 16, marginBottom: 16, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          padding: "14px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
        aria-expanded={open}
      >
        <span style={{
          fontFamily: "var(--font-fraunces), 'Fraunces', serif",
          fontStyle: "italic", fontWeight: 500, fontSize: 20, color: km.ink,
        }}>
          {title} {count !== undefined && <span style={{ color: km.muted, fontSize: 14, fontStyle: "normal" }}>· {count}</span>}
        </span>
        <span style={{ color: km.muted, fontSize: 18 }}>{open ? "−" : "+"}</span>
      </button>
      {open && <div style={{ borderTop: `1px solid ${km.line}`, padding: "12px 20px 18px" }}>{children}</div>}
    </section>
  )
}

export default function OperationsClient({
  cronLogs, incidents, qaRuns, bugs,
}: {
  cronLogs: CronLog[]
  incidents: Incident[]
  qaRuns: QaRun[]
  bugs: Bug[]
}) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const recheckHealth = async () => {
    setBusy(true)
    setMsg(null)
    try {
      await fetch("/api/health/full?force=true", { cache: "no-store" })
      setMsg("Health re-check déclenché. Rafraîchis la page pour voir les pings.")
    } catch (e) {
      setMsg(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: 1.6, margin: 0 }}>
          Admin · Interne
        </p>
        <h1 style={{
          fontFamily: "var(--font-fraunces), 'Fraunces', serif",
          fontStyle: "italic", fontWeight: 500, fontSize: 40,
          margin: "4px 0 0", lineHeight: 1.1, color: km.ink,
        }}>
          Opérations
        </h1>
        <p style={{ fontSize: 14, color: km.muted, marginTop: 8, lineHeight: 1.5 }}>
          Hub observabilité : santé services, exécution crons, incidents, runs QA, bugs reports — en 1 page.
        </p>
      </header>

      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <button onClick={recheckHealth} disabled={busy} style={{ background: km.ink, color: km.white, border: "none", padding: "8px 18px", borderRadius: 999, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1, fontFamily: "inherit" }}>
          🔄 Re-check health
        </button>
        <Link href="/admin/health" style={{ background: "white", color: km.ink, border: `1px solid ${km.line}`, padding: "8px 18px", borderRadius: 999, fontSize: 12, fontWeight: 600, textDecoration: "none", fontFamily: "inherit" }}>
          Voir santé détaillée →
        </Link>
        <Link href="/admin/qa" style={{ background: "white", color: km.ink, border: `1px solid ${km.line}`, padding: "8px 18px", borderRadius: 999, fontSize: 12, fontWeight: 600, textDecoration: "none", fontFamily: "inherit" }}>
          Voir QA Bot →
        </Link>
        <Link href="/admin/bugs" style={{ background: "white", color: km.ink, border: `1px solid ${km.line}`, padding: "8px 18px", borderRadius: 999, fontSize: 12, fontWeight: 600, textDecoration: "none", fontFamily: "inherit" }}>
          Voir bugs →
        </Link>
      </div>

      {msg && (
        <div style={{ marginBottom: 18, padding: "10px 14px", background: "#EEF3FB", border: "1px solid #D7E3F4", borderRadius: 10, fontSize: 13, color: "#1d4ed8" }}>
          {msg}
        </div>
      )}

      {/* Incidents ouverts */}
      <CollapsibleSection title="Incidents ouverts" count={incidents.length} defaultOpen={incidents.length > 0}>
        {incidents.length === 0 ? (
          <p style={{ color: km.muted, fontSize: 13, margin: 0 }}>Aucun incident ouvert.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {incidents.map(inc => (
              <div key={inc.id} style={{ padding: 12, background: km.beige, border: `1px solid ${km.line}`, borderRadius: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: km.ink }}>{inc.title}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: statusColor(inc.severity), textTransform: "uppercase", letterSpacing: 0.6 }}>
                    {inc.severity} · {inc.service}
                  </span>
                </div>
                {inc.description && <p style={{ fontSize: 12, color: km.muted, margin: "4px 0 6px", lineHeight: 1.4 }}>{inc.description}</p>}
                <p style={{ fontSize: 11, color: km.muted, margin: 0 }}>
                  {new Date(inc.started_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} · scope {inc.scope}
                </p>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* Crons */}
      <CollapsibleSection title="Crons — 50 derniers runs" count={cronLogs.length}>
        {cronLogs.length === 0 ? (
          <p style={{ color: km.muted, fontSize: 13, margin: 0 }}>
            Aucun log cron — les crons n&apos;ont pas encore été wrappés par <code>withCronLogging</code> (V84.10).
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: km.beige, color: km.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>
                <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, fontSize: 10 }}>Status</th>
                <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, fontSize: 10 }}>Cron</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, fontSize: 10 }}>Durée</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, fontSize: 10 }}>Quand</th>
              </tr>
            </thead>
            <tbody>
              {cronLogs.map(c => (
                <tr key={c.id} style={{ borderTop: `1px solid ${km.line}` }}>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{ color: statusColor(c.status), fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6 }}>
                      {c.status}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px", color: km.ink, fontFamily: "monospace", fontSize: 11 }}>{c.cron_name}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", color: km.muted, fontVariantNumeric: "tabular-nums" }}>
                    {c.duration_ms ? `${c.duration_ms}ms` : "—"}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", color: km.muted, fontSize: 11 }}>
                    {new Date(c.started_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CollapsibleSection>

      {/* QA Runs */}
      <CollapsibleSection title="QA Bot — 5 derniers runs" count={qaRuns.length}>
        {qaRuns.length === 0 ? (
          <p style={{ color: km.muted, fontSize: 13, margin: 0 }}>
            Aucun run QA. Lance un scénario depuis <Link href="/admin/qa" style={{ color: km.ink }}>/admin/qa</Link>.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {qaRuns.map(r => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: km.beige, borderRadius: 10, fontSize: 13 }}>
                <span style={{ color: km.ink, fontWeight: 600 }}>{r.scenario_name}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11, color: km.muted }}>
                  <span style={{ color: statusColor(r.status), fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{r.status}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{r.steps_passed}/{r.steps_total}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : "—"}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* Bugs récents */}
      <CollapsibleSection title="Bug reports ouverts" count={bugs.length} defaultOpen={bugs.length > 0}>
        {bugs.length === 0 ? (
          <p style={{ color: km.muted, fontSize: 13, margin: 0 }}>Aucun bug ouvert.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {bugs.slice(0, 5).map(b => (
              <div key={b.id} style={{ padding: 12, background: km.beige, border: `1px solid ${km.line}`, borderRadius: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: statusColor(b.severity), textTransform: "uppercase", letterSpacing: 0.6 }}>
                    {b.severity}
                  </span>
                  <span style={{ fontSize: 11, color: km.muted }}>
                    {new Date(b.created_at).toLocaleString("fr-FR", { dateStyle: "short" })}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: km.ink, margin: 0, lineHeight: 1.4 }}>{b.description.slice(0, 140)}{b.description.length > 140 && "…"}</p>
                <p style={{ fontSize: 11, color: km.muted, margin: "6px 0 0" }}>
                  {b.page_url.slice(0, 60)}{b.user_email && ` · ${b.user_email}`}
                </p>
              </div>
            ))}
            <Link href="/admin/bugs" style={{ display: "inline-block", marginTop: 4, fontSize: 12, fontWeight: 700, color: km.ink, textDecoration: "underline" }}>
              Voir tous les bugs →
            </Link>
          </div>
        )}
      </CollapsibleSection>
    </div>
  )
}
