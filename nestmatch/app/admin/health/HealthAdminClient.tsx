"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { DayCell, IncidentRow, ServiceName, ServiceUptime } from "../../../lib/statusAggregation"

interface PingRow {
  id: number
  service: string
  status: string
  latency_ms: number | null
  error_message: string | null
  checked_at: string
}

interface Props {
  services: ServiceUptime[]
  incidents: IncidentRow[]
  recentPings: Record<ServiceName, PingRow[]>
  timeline: Record<ServiceName, DayCell[]>
  metrics: { users: number | null; annoncesActives: number | null; messages24h: number | null }
  serviceLabels: Record<ServiceName, string>
}

const SEVERITY_COLOR: Record<string, { bg: string; fg: string }> = {
  info: { bg: "#EAE6DF", fg: "#5a5247" },
  minor: { bg: "#FCEFD7", fg: "#7A4A00" },
  major: { bg: "#F7DEDA", fg: "#84190E" },
  critical: { bg: "#84190E", fg: "white" },
}

const ALLOWED_SERVICES: ServiceName[] = ["database", "auth", "email", "storage", "crons", "app"]
const ALLOWED_SEVERITY = ["info", "minor", "major", "critical"]

function pillFor(status: "up" | "degraded" | "down" | "unknown") {
  if (status === "up") return { bg: "#E5F4EB", fg: "#0A6B3F", label: "✅ UP" }
  if (status === "degraded") return { bg: "#FCEFD7", fg: "#7A4A00", label: "⚠️ DEGRADED" }
  if (status === "down") return { bg: "#F7DEDA", fg: "#84190E", label: "❌ DOWN" }
  return { bg: "#EAE6DF", fg: "#5a5247", label: "— UNKNOWN" }
}

function dayCellColor(status: "up" | "degraded" | "down" | "no-data"): string {
  if (status === "up") return "#9DD8B6"
  if (status === "degraded") return "#F7C77A"
  if (status === "down") return "#E59487"
  return "#EAE6DF"
}

const cardStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 16,
  border: "1px solid #EAE6DF",
  padding: 20,
}

export default function HealthAdminClient({ services, incidents, recentPings, timeline, metrics, serviceLabels }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [recheckMessage, setRecheckMessage] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    severity: "minor",
    service: "app" as ServiceName,
    is_public: true,
  })
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  async function handleRecheck() {
    setRecheckMessage("Re-check en cours…")
    try {
      const res = await fetch("/api/health/full?force=true", { method: "GET", cache: "no-store" })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setRecheckMessage(`❌ ${res.status} ${data?.error || "Erreur"}`)
      } else {
        setRecheckMessage(`✅ Re-check terminé (status: ${data?.status})`)
      }
      startTransition(() => router.refresh())
    } catch (e) {
      setRecheckMessage(`❌ ${e instanceof Error ? e.message : "Erreur réseau"}`)
    }
  }

  async function handleResolve(id: string) {
    setResolvingId(id)
    try {
      const res = await fetch(`/api/admin/incidents/${id}/resolve`, { method: "POST" })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert(`Erreur : ${j.error || res.status}`)
        return
      }
      startTransition(() => router.refresh())
    } finally {
      setResolvingId(null)
    }
  }

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    setCreating(true)
    try {
      const res = await fetch("/api/admin/incidents/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: createForm.title.trim(),
          description: createForm.description.trim() || undefined,
          severity: createForm.severity,
          service: createForm.service,
          is_public: createForm.is_public,
          status: "investigating",
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCreateError(j.error || `HTTP ${res.status}`)
        return
      }
      setShowCreateModal(false)
      setCreateForm({ title: "", description: "", severity: "minor", service: "app", is_public: true })
      startTransition(() => router.refresh())
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 24 }}>
        <button
          type="button"
          onClick={handleRecheck}
          disabled={pending}
          style={{ padding: "10px 20px", borderRadius: 999, background: "#111", color: "white", border: "1px solid #111", fontWeight: 700, fontSize: 13, cursor: pending ? "wait" : "pointer", fontFamily: "inherit" }}
        >
          🔄 Re-check now
        </button>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          style={{ padding: "10px 20px", borderRadius: 999, background: "white", color: "#111", border: "1px solid #111", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
        >
          ➕ Créer incident manuel
        </button>
        {recheckMessage && (
          <span style={{ fontSize: 13, color: "#5a5247" }}>{recheckMessage}</span>
        )}
      </div>

      {/* Métriques live */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 12px" }}>Métriques live</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          {[
            { label: "Utilisateurs total", value: metrics.users },
            { label: "Annonces actives", value: metrics.annoncesActives },
            { label: "Messages (24h)", value: metrics.messages24h },
          ].map(m => (
            <div key={m.label} style={cardStyle}>
              <div style={{ fontSize: 11, color: "#8a8477", textTransform: "uppercase", letterSpacing: 0.5 }}>{m.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{m.value == null ? "—" : m.value.toLocaleString("fr-FR")}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Services */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 12px" }}>Services</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {services.map(s => {
            const pill = pillFor(s.lastStatus)
            const pings = recentPings[s.service] || []
            return (
              <article key={s.service} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{serviceLabels[s.service]}</span>
                    <span style={{ marginLeft: 12, fontSize: 11, fontWeight: 700, color: pill.fg, background: pill.bg, padding: "2px 8px", borderRadius: 999 }}>
                      {pill.label}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#5a5247" }}>
                    <span>7j : <strong>{s.uptime7d == null ? "—" : `${s.uptime7d.toFixed(1)} %`}</strong></span>
                    <span>30j : <strong>{s.uptime30d == null ? "—" : `${s.uptime30d.toFixed(1)} %`}</strong></span>
                    {s.lastLatencyMs != null && <span>Latency : <strong>{s.lastLatencyMs} ms</strong></span>}
                  </div>
                </div>
                {s.lastError && (
                  <p style={{ fontSize: 12, color: "#84190E", margin: "0 0 12px", fontFamily: "monospace" }}>⚠ {s.lastError}</p>
                )}
                <div>
                  <div style={{ fontSize: 11, color: "#8a8477", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>10 derniers pings</div>
                  {pings.length === 0 ? (
                    <p style={{ fontSize: 12, color: "#8a8477", margin: 0 }}>Aucun ping enregistré.</p>
                  ) : (
                    <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ textAlign: "left", color: "#8a8477", borderBottom: "1px solid #EAE6DF" }}>
                          <th style={{ padding: "4px 8px", fontWeight: 600 }}>Date</th>
                          <th style={{ padding: "4px 8px", fontWeight: 600 }}>Status</th>
                          <th style={{ padding: "4px 8px", fontWeight: 600 }}>Latency</th>
                          <th style={{ padding: "4px 8px", fontWeight: 600 }}>Erreur</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pings.map(p => (
                          <tr key={p.id} style={{ borderBottom: "1px solid #F7F4EF" }}>
                            <td style={{ padding: "4px 8px", fontFamily: "monospace" }}>{new Date(p.checked_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" })}</td>
                            <td style={{ padding: "4px 8px", fontWeight: 600 }}>{p.status}</td>
                            <td style={{ padding: "4px 8px" }}>{p.latency_ms == null ? "—" : `${p.latency_ms} ms`}</td>
                            <td style={{ padding: "4px 8px", color: "#84190E", fontFamily: "monospace", fontSize: 11 }}>{p.error_message || ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {/* Timeline 30j */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 12px" }}>30 derniers jours</h2>
        <div style={cardStyle}>
          {ALLOWED_SERVICES.map(svc => {
            const cells = timeline[svc] || []
            return (
              <div key={svc} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{serviceLabels[svc]}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(30, 1fr)", gap: 2 }}>
                  {cells.map(cell => (
                    <div
                      key={`${svc}-${cell.date}`}
                      title={`${cell.date} — ${cell.status}${cell.pingCount ? ` (${cell.pingCount} ping)` : ""}`}
                      style={{ height: 18, borderRadius: 3, background: dayCellColor(cell.status), opacity: cell.status === "no-data" ? 0.5 : 1 }}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Incidents (tous, publics + privés) */}
      <section>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 12px" }}>Incidents en cours ({incidents.length})</h2>
        {incidents.length === 0 ? (
          <p style={{ fontSize: 14, color: "#5a5247" }}>Aucun incident ouvert. 🎉</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {incidents.map(inc => {
              const sev = SEVERITY_COLOR[inc.severity] || SEVERITY_COLOR.info
              return (
                <article key={inc.id} style={cardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 260 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                        <span style={{ padding: "2px 8px", borderRadius: 999, background: sev.bg, color: sev.fg, fontSize: 11, fontWeight: 700 }}>{inc.severity}</span>
                        <span style={{ padding: "2px 8px", borderRadius: 999, background: "#F7F4EF", color: "#5a5247", fontSize: 11, fontWeight: 600 }}>{serviceLabels[inc.service]}</span>
                        <span style={{ padding: "2px 8px", borderRadius: 999, background: "#F7F4EF", color: "#5a5247", fontSize: 11, fontWeight: 600 }}>{inc.status}</span>
                        <span style={{ padding: "2px 8px", borderRadius: 999, background: inc.is_public ? "#E5F4EB" : "#EAE6DF", color: "#5a5247", fontSize: 11, fontWeight: 600 }}>
                          {inc.is_public ? "Public" : "Interne"}
                        </span>
                      </div>
                      <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 4px" }}>{inc.title}</p>
                      {inc.description && <p style={{ fontSize: 12, color: "#5a5247", margin: "0 0 4px" }}>{inc.description}</p>}
                      <p style={{ fontSize: 11, color: "#8a8477", margin: 0, fontFamily: "monospace" }}>
                        Démarré : {new Date(inc.started_at).toLocaleString("fr-FR")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleResolve(inc.id)}
                      disabled={resolvingId === inc.id}
                      style={{ padding: "6px 14px", borderRadius: 999, background: "white", color: "#111", border: "1px solid #111", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                    >
                      {resolvingId === inc.id ? "..." : "✓ Résoudre"}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {/* Modal créer incident */}
      {showCreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 12000 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false) }}
        >
          <form
            onSubmit={handleCreateSubmit}
            style={{ background: "white", borderRadius: 20, maxWidth: 520, width: "100%", padding: 28, fontFamily: "inherit" }}
          >
            <h3 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 16px" }}>Créer un incident</h3>

            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#5a5247", display: "block", marginBottom: 4 }}>Titre</span>
              <input
                type="text"
                value={createForm.title}
                onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
                required
                maxLength={200}
                placeholder="Ex. Maintenance planifiée — base de données"
                style={{ width: "100%", padding: "8px 12px", borderRadius: 10, border: "1px solid #EAE6DF", fontSize: 14, fontFamily: "inherit" }}
              />
            </label>

            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#5a5247", display: "block", marginBottom: 4 }}>Description (optionnel)</span>
              <textarea
                value={createForm.description}
                onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="Détails techniques ou message utilisateur."
                style={{ width: "100%", padding: "8px 12px", borderRadius: 10, border: "1px solid #EAE6DF", fontSize: 14, fontFamily: "inherit", resize: "vertical" }}
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <label style={{ display: "block" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#5a5247", display: "block", marginBottom: 4 }}>Service</span>
                <select
                  value={createForm.service}
                  onChange={e => setCreateForm(f => ({ ...f, service: e.target.value as ServiceName }))}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 10, border: "1px solid #EAE6DF", fontSize: 14, fontFamily: "inherit", background: "white" }}
                >
                  {ALLOWED_SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>

              <label style={{ display: "block" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#5a5247", display: "block", marginBottom: 4 }}>Sévérité</span>
                <select
                  value={createForm.severity}
                  onChange={e => setCreateForm(f => ({ ...f, severity: e.target.value }))}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 10, border: "1px solid #EAE6DF", fontSize: 14, fontFamily: "inherit", background: "white" }}
                >
                  {ALLOWED_SEVERITY.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>

            <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
              <input
                type="checkbox"
                checked={createForm.is_public}
                onChange={e => setCreateForm(f => ({ ...f, is_public: e.target.checked }))}
              />
              <span style={{ fontSize: 13 }}>Visible sur la page publique /status</span>
            </label>

            {createError && (
              <p style={{ fontSize: 13, color: "#84190E", margin: "0 0 12px" }}>❌ {createError}</p>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{ padding: "8px 18px", borderRadius: 999, background: "white", color: "#111", border: "1px solid #EAE6DF", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={creating}
                style={{ padding: "8px 18px", borderRadius: 999, background: "#111", color: "white", border: "1px solid #111", fontWeight: 700, fontSize: 13, cursor: creating ? "wait" : "pointer", fontFamily: "inherit" }}
              >
                {creating ? "Création…" : "Créer"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
