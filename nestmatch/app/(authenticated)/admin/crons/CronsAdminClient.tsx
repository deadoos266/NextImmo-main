"use client"
import { useState } from "react"
import { km } from "../../../components/ui/km"

type KnownCron = { path: string; name: string; schedule: string; description: string }
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

function statusColor(s: string): string {
  if (s === "success") return "#15803d"
  if (s === "failure" || s === "timeout") return "#b91c1c"
  if (s === "started") return "#a16207"
  return km.muted
}

export default function CronsAdminClient({ knownCrons, logs }: { knownCrons: KnownCron[]; logs: CronLog[] }) {
  const [running, setRunning] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  // Last run par cron_name
  const lastRunByName = new Map<string, CronLog>()
  for (const l of logs) {
    if (!lastRunByName.has(l.cron_name)) lastRunByName.set(l.cron_name, l)
  }

  const triggerCron = async (path: string, name: string) => {
    if (!window.confirm(`Lancer maintenant le cron "${name}" ?`)) return
    setRunning(name)
    setMsg(null)
    try {
      // Proxy admin server-side qui ajoute le header Bearer CRON_SECRET.
      const res = await fetch("/api/admin/cron/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ path }),
      })
      const j = await res.json().catch(() => ({}))
      if (j?.ok) {
        const summary = typeof j.result === "object" ? JSON.stringify(j.result).slice(0, 200) : String(j.result).slice(0, 200)
        setMsg(`${name} : OK (${j.duration_ms}ms) · ${summary}`)
      } else {
        setMsg(`${name} : ÉCHEC (HTTP ${j.status || res.status}) · ${j.error || JSON.stringify(j.result || "").slice(0, 200)}`)
      }
    } catch (e) {
      setMsg(`${name} : erreur ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setRunning(null)
    }
  }

  return (
    <>
      {/* Liste des crons définis */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "var(--font-fraunces), 'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: "0 0 14px" }}>
          Crons définis ({knownCrons.length})
        </h2>
        <div style={{ background: km.white, border: `1px solid ${km.line}`, borderRadius: 14, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: km.beige, color: km.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>Cron</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>Schedule</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>Dernier run</th>
                <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {knownCrons.map(c => {
                const last = lastRunByName.get(c.name)
                return (
                  <tr key={c.path} style={{ borderTop: `1px solid ${km.line}` }}>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ color: km.ink, fontWeight: 600, fontFamily: "monospace", fontSize: 12 }}>{c.name}</div>
                      <div style={{ color: km.muted, fontSize: 11, marginTop: 2 }}>{c.description}</div>
                    </td>
                    <td style={{ padding: "10px 14px", color: km.muted, fontFamily: "monospace", fontSize: 11 }}>{c.schedule}</td>
                    <td style={{ padding: "10px 14px" }}>
                      {last ? (
                        <>
                          <span style={{ color: statusColor(last.status), fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{last.status}</span>
                          <span style={{ color: km.muted, fontSize: 11, marginLeft: 8 }}>
                            {new Date(last.started_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                          </span>
                          {last.duration_ms && <span style={{ color: km.muted, fontSize: 11, marginLeft: 6 }}>· {last.duration_ms}ms</span>}
                        </>
                      ) : (
                        <span style={{ color: km.muted, fontSize: 11 }}>Jamais exécuté (ou pas wrappé)</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right" }}>
                      <button
                        onClick={() => triggerCron(c.path, c.name)}
                        disabled={running === c.name}
                        style={{
                          background: km.white, color: km.ink,
                          border: `1px solid ${km.line}`,
                          padding: "5px 12px",
                          borderRadius: 999,
                          fontSize: 11, fontWeight: 600,
                          cursor: running === c.name ? "wait" : "pointer",
                          opacity: running === c.name ? 0.6 : 1,
                          fontFamily: "inherit",
                        }}
                      >
                        {running === c.name ? "…" : "Run"}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {msg && (
          <div style={{ marginTop: 14, padding: "10px 14px", background: "#EEF3FB", border: "1px solid #D7E3F4", borderRadius: 10, fontSize: 12, color: "#1d4ed8", fontFamily: "monospace" }}>
            {msg}
          </div>
        )}
      </section>

      {/* Logs récents */}
      <section>
        <h2 style={{ fontFamily: "var(--font-fraunces), 'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: "0 0 14px" }}>
          100 derniers logs
        </h2>
        <div style={{ background: km.white, border: `1px solid ${km.line}`, borderRadius: 14, overflow: "hidden" }}>
          {logs.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: km.muted, fontSize: 13 }}>
              Aucun log. Les crons sont wrappés progressivement avec <code>withCronLogging</code> (V84.10).
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: km.beige, color: km.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>
                  <th style={{ padding: "8px 14px", textAlign: "left", fontWeight: 700 }}>Status</th>
                  <th style={{ padding: "8px 14px", textAlign: "left", fontWeight: 700 }}>Cron</th>
                  <th style={{ padding: "8px 14px", textAlign: "right", fontWeight: 700 }}>Durée</th>
                  <th style={{ padding: "8px 14px", textAlign: "left", fontWeight: 700 }}>Erreur</th>
                  <th style={{ padding: "8px 14px", textAlign: "right", fontWeight: 700 }}>Quand</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id} style={{ borderTop: `1px solid ${km.line}` }}>
                    <td style={{ padding: "8px 14px" }}>
                      <span style={{ color: statusColor(l.status), fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6 }}>{l.status}</span>
                    </td>
                    <td style={{ padding: "8px 14px", color: km.ink, fontFamily: "monospace", fontSize: 11 }}>{l.cron_name}</td>
                    <td style={{ padding: "8px 14px", textAlign: "right", color: km.muted, fontVariantNumeric: "tabular-nums" }}>{l.duration_ms ? `${l.duration_ms}ms` : "—"}</td>
                    <td style={{ padding: "8px 14px", color: "#b91c1c", fontSize: 11, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.error_message || ""}>
                      {l.error_message?.slice(0, 60) || ""}
                    </td>
                    <td style={{ padding: "8px 14px", textAlign: "right", color: km.muted, fontSize: 11 }}>
                      {new Date(l.started_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  )
}
