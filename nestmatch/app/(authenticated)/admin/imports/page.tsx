"use client"
import { useEffect, useState } from "react"

/**
 * V97.36 P3-7 — /admin/imports
 *
 * Monitoring des imports URL annonce. Affiche :
 *  - Totaux 24h / 7j / 30j
 *  - Taux de succès par parser (sur 7j)
 *  - Alertes si un parser fail >50% (markup changé probablement)
 *  - 50 derniers imports avec status + error_code
 *
 * Lecture seule. Permet à Paul de voir si un parser doit être patché.
 */

interface SourceStat {
  success: number
  partial: number
  fail: number
  total: number
  rate_success: number
}

interface ImportLog {
  id: string
  user_email: string | null
  source: string | null
  source_url: string | null
  status: "success" | "fail" | "partial"
  fields_extracted: number | null
  fields_total: number | null
  duration_ms: number | null
  error_code: string | null
  error_message: string | null
  fetcher_used: string | null
  created_at: string
}

interface ApiResp {
  ok: boolean
  totals: { day_24h: number; day_7d: number; day_30d: number }
  source_stats_7d: Record<string, SourceStat>
  fetcher_stats_7d: Record<string, SourceStat>
  alerts: string[]
  recent_imports: ImportLog[]
}

interface FetcherHealth {
  ok: boolean
  worker_url: string | null
  configured: boolean
  enabled_hosts: string[]
  latency_ms: number
  http_status: number | null
  pool: { size: number; in_flight: number; total_fetches: number; fetches_per_slot: number[] } | null
  uptime_s: number | null
  error: string | null
  checked_at: string
}

function formatDateTimeFr(iso: string): string {
  try { return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) }
  catch { return iso }
}

function StatusBadge({ status }: { status: ImportLog["status"] }) {
  const config = {
    success: { bg: "#dcfce7", color: "#166534", label: "OK" },
    partial: { bg: "#fef3c7", color: "#92400e", label: "Partiel" },
    fail: { bg: "#fee2e2", color: "#991b1b", label: "Échec" },
  }[status]
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color: config.color, background: config.bg,
      padding: "2px 8px", borderRadius: 999,
      textTransform: "uppercase", letterSpacing: "0.5px",
    }}>{config.label}</span>
  )
}

export default function AdminImportsPage() {
  const [data, setData] = useState<ApiResp | null>(null)
  const [fetcherHealth, setFetcherHealth] = useState<FetcherHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [imports, health] = await Promise.all([
          fetch("/api/admin/imports", { cache: "no-store" }).then(r => r.json()),
          fetch("/api/admin/fetcher-health", { cache: "no-store" }).then(r => r.json()).catch(() => null),
        ])
        if (!cancelled) {
          if (imports.ok) setData(imports)
          else setError(imports.error || "Erreur de chargement")
          if (health) setFetcherHealth(health as FetcherHealth)
          setLoading(false)
        }
      } catch {
        if (!cancelled) { setError("Erreur réseau"); setLoading(false) }
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  return (
    <div style={{ maxWidth: 1100, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500&display=swap');`}</style>

      <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 8px" }}>
        Outils admin
      </p>
      <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 36, color: "#111", margin: "0 0 8px", lineHeight: 1.1 }}>
        Imports URL annonce
      </h1>
      <p style={{ fontSize: 14, color: "#666", margin: "0 0 24px", lineHeight: 1.55, maxWidth: 640 }}>
        Statistiques d&apos;utilisation et qualité des parsers (Leboncoin, SeLoger, PAP, Bien&apos;ici, Logic-immo, générique).
        Surveille les taux d&apos;échec — si un parser dégrade, c&apos;est probablement parce que le site source a changé son HTML.
      </p>

      {loading && <p style={{ fontSize: 13, color: "#8a8477" }}>Chargement…</p>}
      {error && <p style={{ fontSize: 13, color: "#b91c1c" }}>{error}</p>}

      {data && (
        <>
          {/* Totaux */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
            {[
              { label: "Derniers 24h", value: data.totals.day_24h },
              { label: "Derniers 7 jours", value: data.totals.day_7d },
              { label: "Derniers 30 jours", value: data.totals.day_30d },
            ].map(c => (
              <div key={c.label} style={{ background: "#fff", border: "1px solid #EAE6DF", borderRadius: 14, padding: "16px 18px" }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0 }}>
                  {c.label}
                </p>
                <p style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 32, color: "#111", margin: "6px 0 0", lineHeight: 1 }}>
                  {c.value}
                </p>
              </div>
            ))}
          </div>

          {/* V97.39 — Santé worker Zendriver self-host (DataDome bypass) */}
          {fetcherHealth && (
            <div style={{
              background: "#fff",
              border: `1px solid ${fetcherHealth.ok ? "#86efac" : fetcherHealth.configured ? "#fca5a5" : "#EAE6DF"}`,
              borderLeftWidth: 4,
              borderLeftColor: fetcherHealth.ok ? "#15803d" : fetcherHealth.configured ? "#dc2626" : "#8a8477",
              borderRadius: 14,
              padding: "14px 18px",
              marginBottom: 20,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0 }}>
                    Worker Zendriver (DataDome bypass)
                  </p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: "4px 0 0" }}>
                    {fetcherHealth.ok ? "✓ Opérationnel" :
                     !fetcherHealth.configured ? "⚙ Non configuré (EXTERNAL_FETCHER_URL/TOKEN à set sur Vercel)" :
                     `✗ Injoignable (${fetcherHealth.error || "erreur inconnue"})`}
                  </p>
                  {fetcherHealth.worker_url && (
                    <p style={{ fontSize: 11, color: "#666", margin: "4px 0 0" }}>
                      {fetcherHealth.worker_url} — latence {fetcherHealth.latency_ms} ms
                      {fetcherHealth.http_status ? ` — HTTP ${fetcherHealth.http_status}` : ""}
                    </p>
                  )}
                  {fetcherHealth.enabled_hosts.length > 0 && (
                    <p style={{ fontSize: 11, color: "#666", margin: "4px 0 0" }}>
                      Hosts routés via worker : {fetcherHealth.enabled_hosts.join(", ")}
                    </p>
                  )}
                </div>
                {fetcherHealth.pool && (
                  <div style={{ textAlign: "right", fontSize: 11, color: "#3f3c37", lineHeight: 1.5 }}>
                    <div>Pool : <strong>{fetcherHealth.pool.size}</strong> slots</div>
                    <div>In-flight : <strong>{fetcherHealth.pool.in_flight}</strong></div>
                    <div>Total fetches : <strong>{fetcherHealth.pool.total_fetches}</strong></div>
                    {fetcherHealth.uptime_s != null && (
                      <div>Uptime : <strong>{Math.floor(fetcherHealth.uptime_s / 3600)}h {Math.floor((fetcherHealth.uptime_s % 3600) / 60)}m</strong></div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Alertes */}
          {data.alerts.length > 0 && (
            <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 14, padding: "14px 18px", marginBottom: 20 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#92400e", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Alertes parsers
              </p>
              {data.alerts.map((a, i) => (
                <p key={i} style={{ fontSize: 13, color: "#a16207", margin: i === 0 ? "0" : "4px 0 0", lineHeight: 1.5 }}>{a}</p>
              ))}
            </div>
          )}

          {/* Stats par source (7j) */}
          <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, color: "#111", margin: "8px 0 12px" }}>
            Par source (7 derniers jours)
          </h2>
          {Object.keys(data.source_stats_7d).length === 0 ? (
            <p style={{ fontSize: 13, color: "#8a8477" }}>Aucun import sur 7 jours.</p>
          ) : (
            <div style={{ background: "#fff", border: "1px solid #EAE6DF", borderRadius: 14, padding: "16px 18px", marginBottom: 24 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #EAE6DF" }}>
                    <th style={{ textAlign: "left", padding: "8px 12px 12px", fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.8px" }}>Source</th>
                    <th style={{ textAlign: "right", padding: "8px 12px 12px", fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.8px" }}>OK</th>
                    <th style={{ textAlign: "right", padding: "8px 12px 12px", fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.8px" }}>Partiel</th>
                    <th style={{ textAlign: "right", padding: "8px 12px 12px", fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.8px" }}>Échec</th>
                    <th style={{ textAlign: "right", padding: "8px 12px 12px", fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.8px" }}>Taux</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.source_stats_7d)
                    .sort((a, b) => b[1].total - a[1].total)
                    .map(([src, s]) => (
                      <tr key={src} style={{ borderBottom: "1px solid #F8F5F0" }}>
                        <td style={{ padding: "10px 12px", fontSize: 13, color: "#111", fontWeight: 600 }}>{src}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 13, color: "#15803d", fontWeight: 600 }}>{s.success}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 13, color: "#a16207", fontWeight: 600 }}>{s.partial}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 13, color: "#b91c1c", fontWeight: 600 }}>{s.fail}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 13, color: s.rate_success >= 80 ? "#15803d" : s.rate_success >= 50 ? "#a16207" : "#b91c1c", fontWeight: 700 }}>{s.rate_success}%</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* V97.39 — Stats par fetcher (wreq-js / zendriver-worker / native-fetch) */}
          {Object.keys(data.fetcher_stats_7d || {}).length > 0 && (
            <>
              <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, color: "#111", margin: "8px 0 12px" }}>
                Par voie d&apos;extraction (7 derniers jours)
              </h2>
              <div style={{ background: "#fff", border: "1px solid #EAE6DF", borderRadius: 14, padding: "16px 18px", marginBottom: 24 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #EAE6DF" }}>
                      <th style={{ textAlign: "left", padding: "8px 12px 12px", fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.8px" }}>Voie</th>
                      <th style={{ textAlign: "right", padding: "8px 12px 12px", fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.8px" }}>OK</th>
                      <th style={{ textAlign: "right", padding: "8px 12px 12px", fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.8px" }}>Partiel</th>
                      <th style={{ textAlign: "right", padding: "8px 12px 12px", fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.8px" }}>Échec</th>
                      <th style={{ textAlign: "right", padding: "8px 12px 12px", fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.8px" }}>Taux</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.fetcher_stats_7d)
                      .sort((a, b) => b[1].total - a[1].total)
                      .map(([fetcher, s]) => (
                        <tr key={fetcher} style={{ borderBottom: "1px solid #F8F5F0" }}>
                          <td style={{ padding: "10px 12px", fontSize: 13, color: "#111", fontWeight: 600 }}>{fetcher}</td>
                          <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 13, color: "#15803d", fontWeight: 600 }}>{s.success}</td>
                          <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 13, color: "#a16207", fontWeight: 600 }}>{s.partial}</td>
                          <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 13, color: "#b91c1c", fontWeight: 600 }}>{s.fail}</td>
                          <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 13, color: s.rate_success >= 80 ? "#15803d" : s.rate_success >= 50 ? "#a16207" : "#b91c1c", fontWeight: 700 }}>{s.rate_success}%</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Derniers imports */}
          <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, color: "#111", margin: "8px 0 12px" }}>
            50 derniers imports
          </h2>
          {data.recent_imports.length === 0 ? (
            <p style={{ fontSize: 13, color: "#8a8477" }}>Aucun import.</p>
          ) : (
            <div style={{ background: "#fff", border: "1px solid #EAE6DF", borderRadius: 14, padding: "16px 18px", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #EAE6DF" }}>
                    <th style={{ textAlign: "left", padding: "8px 8px 12px", fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.6px" }}>Date</th>
                    <th style={{ textAlign: "left", padding: "8px 8px 12px", fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.6px" }}>Status</th>
                    <th style={{ textAlign: "left", padding: "8px 8px 12px", fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.6px" }}>Source</th>
                    <th style={{ textAlign: "left", padding: "8px 8px 12px", fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.6px" }}>Voie</th>
                    <th style={{ textAlign: "left", padding: "8px 8px 12px", fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.6px" }}>User</th>
                    <th style={{ textAlign: "right", padding: "8px 8px 12px", fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.6px" }}>Champs</th>
                    <th style={{ textAlign: "right", padding: "8px 8px 12px", fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.6px" }}>Durée</th>
                    <th style={{ textAlign: "left", padding: "8px 8px 12px", fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.6px" }}>Erreur</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_imports.map(l => (
                    <tr key={l.id} style={{ borderBottom: "1px solid #F8F5F0" }}>
                      <td style={{ padding: "8px", fontSize: 11, color: "#3f3c37", whiteSpace: "nowrap" }}>{formatDateTimeFr(l.created_at)}</td>
                      <td style={{ padding: "8px" }}><StatusBadge status={l.status} /></td>
                      <td style={{ padding: "8px", fontSize: 12, color: "#111", fontWeight: 600 }}>{l.source || "—"}</td>
                      <td style={{ padding: "8px", fontSize: 11, color: l.fetcher_used === "zendriver-worker" ? "#1d4ed8" : "#3f3c37", fontWeight: l.fetcher_used === "zendriver-worker" ? 600 : 400 }}>{l.fetcher_used || "—"}</td>
                      <td style={{ padding: "8px", fontSize: 11, color: "#3f3c37" }}>{l.user_email || "—"}</td>
                      <td style={{ padding: "8px", textAlign: "right", fontSize: 11, color: "#3f3c37" }}>
                        {l.fields_extracted != null && l.fields_total != null ? `${l.fields_extracted}/${l.fields_total}` : "—"}
                      </td>
                      <td style={{ padding: "8px", textAlign: "right", fontSize: 11, color: "#3f3c37" }}>{l.duration_ms ? `${l.duration_ms} ms` : "—"}</td>
                      <td style={{ padding: "8px", fontSize: 11, color: "#b91c1c", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.error_message || ""}>
                        {l.error_code || ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
