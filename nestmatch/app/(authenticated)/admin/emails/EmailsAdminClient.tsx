"use client"
import { useState } from "react"
import { km } from "../../../components/ui/km"

type Log = {
  id: number
  resend_id: string | null
  to_email: string
  from_email: string | null
  subject: string | null
  template_name: string | null
  status: string
  sent_at: string | null
  delivered_at: string | null
  opened_at: string | null
  bounced_at: string | null
  complained_at: string | null
  bounce_type: string | null
  error_message: string | null
}

type Stats = {
  total_7d: number
  by_status: Record<string, number>
  by_template: Record<string, number>
  delivery_rate_pct: number
  bounce_rate_pct: number
  suppress_count: number
}

type Suppressed = {
  email: string
  reason: string
  reason_detail: string | null
  added_at: string
  added_by: string | null
}

const STATUS_COLOR: Record<string, string> = {
  sent: "#a16207",
  delivered: "#15803d",
  opened: "#15803d",
  clicked: "#15803d",
  bounced: "#b91c1c",
  complained: "#b91c1c",
  failed: "#b91c1c",
  pending: "#6b6358",
}

export default function EmailsAdminClient({ logs: initialLogs, stats, suppressed: initialSup }: { logs: Log[]; stats: Stats; suppressed: Suppressed[] }) {
  const [logs, setLogs] = useState<Log[]>(initialLogs)
  const [suppressed, setSuppressed] = useState<Suppressed[]>(initialSup)
  const [filterStatus, setFilterStatus] = useState("")
  const [filterTemplate, setFilterTemplate] = useState("")
  const [search, setSearch] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const refresh = async () => {
    const params = new URLSearchParams()
    if (filterStatus) params.set("status", filterStatus)
    if (filterTemplate) params.set("template", filterTemplate)
    if (search) params.set("q", search)
    const res = await fetch(`/api/admin/emails?${params.toString()}`, { cache: "no-store" })
    const j = await res.json()
    if (j.ok) setLogs(j.logs)
  }

  const sendTest = async () => {
    setBusy("test")
    setMsg(null)
    try {
      const res = await fetch("/api/admin/emails/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
      const j = await res.json()
      if (j.ok) setMsg(`✓ Test envoyé à ${j.to} (id ${j.id?.slice(0, 12)}…). Check ta boîte.`)
      else setMsg(`✗ Erreur : ${j.error}${j.skipped ? " (skipped)" : ""}`)
      setTimeout(refresh, 2000)
    } finally {
      setBusy(null)
    }
  }

  const removeSuppress = async (email: string) => {
    if (!confirm(`Retirer "${email}" de la suppress list ?\nL'email pourra à nouveau recevoir des messages KeyMatch.`)) return
    setBusy(`remove-${email}`)
    try {
      const res = await fetch(`/api/admin/emails/suppress?email=${encodeURIComponent(email)}`, { method: "DELETE" })
      const j = await res.json()
      if (j.ok) {
        setSuppressed(prev => prev.filter(s => s.email !== email))
        setMsg(`✓ "${email}" retiré de la suppress list.`)
      } else {
        setMsg(`✗ Erreur : ${j.error}`)
      }
    } finally {
      setBusy(null)
    }
  }

  const addSuppress = async () => {
    const email = window.prompt("Email à ajouter à la suppress list :")
    if (!email) return
    const reason_detail = window.prompt("Raison (optionnel) :", "Ajouté manuellement") || ""
    setBusy("add-suppress")
    try {
      const res = await fetch("/api/admin/emails/suppress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, reason_detail }) })
      const j = await res.json()
      setMsg(j.ok ? `✓ ${email} ajouté à la suppress list.` : `✗ Erreur : ${j.error}`)
      if (j.ok) {
        setSuppressed(prev => [{ email, reason: "manual", reason_detail, added_at: new Date().toISOString(), added_by: "admin" }, ...prev])
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      {/* Stats row */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 28 }}>
        <StatCard label="Emails 7j" value={stats.total_7d} />
        <StatCard label="Delivery rate" value={`${stats.delivery_rate_pct}%`} accent={stats.delivery_rate_pct >= 95 ? "#15803d" : stats.delivery_rate_pct >= 80 ? "#a16207" : "#b91c1c"} />
        <StatCard label="Bounce rate" value={`${stats.bounce_rate_pct}%`} accent={stats.bounce_rate_pct <= 2 ? "#15803d" : stats.bounce_rate_pct <= 5 ? "#a16207" : "#b91c1c"} />
        <StatCard label="Suppress list" value={stats.suppress_count} />
        <StatCard label="Delivered" value={stats.by_status.delivered || 0} accent="#15803d" />
        <StatCard label="Bounced" value={stats.by_status.bounced || 0} accent="#b91c1c" />
      </section>

      {/* Actions */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: "var(--font-fraunces), 'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: "0 0 12px", color: km.ink }}>Actions</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={sendTest} disabled={busy === "test"} style={ctaPrimary}>
            {busy === "test" ? "Envoi…" : "📧 Envoyer test email"}
          </button>
          <button onClick={addSuppress} disabled={busy === "add-suppress"} style={ctaSecondary}>
            🚫 Ajouter à suppress list
          </button>
          <a href="https://resend.com/emails" target="_blank" rel="noopener noreferrer" style={ctaSecondary}>
            Resend dashboard ↗
          </a>
          <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" style={ctaSecondary}>
            SPF/DKIM/DMARC ↗
          </a>
        </div>
        {msg && (
          <div style={{ marginTop: 14, padding: "10px 14px", background: msg.startsWith("✓") ? "#F0FAEE" : "#FEECEC", border: `1px solid ${msg.startsWith("✓") ? "#C6E9C0" : "#F4C9C9"}`, borderRadius: 10, fontSize: 13, color: msg.startsWith("✓") ? "#15803d" : "#b91c1c" }}>{msg}</div>
        )}
      </section>

      {/* Filters */}
      <section style={{ marginBottom: 14 }}>
        <h2 style={{ fontFamily: "var(--font-fraunces), 'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: "0 0 12px", color: km.ink }}>Logs récents ({logs.length})</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setTimeout(refresh, 0) }} style={selectStyle}>
            <option value="">Tous status</option>
            <option value="sent">Sent</option>
            <option value="delivered">Delivered</option>
            <option value="opened">Opened</option>
            <option value="clicked">Clicked</option>
            <option value="bounced">Bounced</option>
            <option value="complained">Complained</option>
            <option value="failed">Failed</option>
          </select>
          <select value={filterTemplate} onChange={e => { setFilterTemplate(e.target.value); setTimeout(refresh, 0) }} style={selectStyle}>
            <option value="">Tous templates</option>
            {Object.keys(stats.by_template).sort().map(t => (
              <option key={t} value={t}>{t} ({stats.by_template[t]})</option>
            ))}
          </select>
          <input
            type="search" value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") refresh() }}
            placeholder="Recherche subject…"
            style={{ ...selectStyle, flex: 1, minWidth: 200 }}
          />
          <button onClick={refresh} style={{ ...ctaSecondary, fontSize: 11 }}>Rafraîchir</button>
        </div>
      </section>

      {/* Logs table */}
      <section style={{ background: km.white, border: `1px solid ${km.line}`, borderRadius: 14, overflow: "hidden", marginBottom: 28 }}>
        {logs.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: km.muted, fontSize: 13 }}>
            Aucun log. Les emails ne sont loggés qu&apos;à partir de V87.3 (sendEmail enrichi).
            <br />Configure le webhook Resend pour avoir les events delivered/bounced/opened.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
            <thead>
              <tr style={{ background: km.beige, color: km.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Destinataire</th>
                <th style={thStyle}>Sujet</th>
                <th style={thStyle}>Template</th>
                <th style={thStyle}>Envoyé</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} style={{ borderTop: `1px solid ${km.line}` }}>
                  <td style={tdStyle}>
                    <span style={{ color: STATUS_COLOR[l.status] || km.muted, fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6 }}>
                      {l.status}
                    </span>
                    {l.bounce_type && <span style={{ marginLeft: 6, color: km.muted, fontSize: 10 }}>({l.bounce_type})</span>}
                  </td>
                  <td style={{ ...tdStyle, color: km.ink, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.to_email}</td>
                  <td style={{ ...tdStyle, color: km.muted, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.subject}</td>
                  <td style={{ ...tdStyle, color: km.muted, fontSize: 11 }}>{l.template_name || "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: km.muted, fontSize: 11 }}>
                    {l.sent_at ? new Date(l.sent_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Suppress list */}
      <section>
        <h2 style={{ fontFamily: "var(--font-fraunces), 'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: "0 0 12px", color: km.ink }}>
          Suppress list ({suppressed.length})
        </h2>
        <div style={{ background: km.white, border: `1px solid ${km.line}`, borderRadius: 14, overflow: "hidden" }}>
          {suppressed.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: km.muted, fontSize: 13 }}>
              Aucun email suppressed. Les hard bounces / complaints y seront ajoutés automatiquement via webhook.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: km.beige, color: km.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Raison</th>
                  <th style={thStyle}>Détail</th>
                  <th style={thStyle}>Ajouté</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {suppressed.map(s => (
                  <tr key={s.email} style={{ borderTop: `1px solid ${km.line}` }}>
                    <td style={{ ...tdStyle, color: km.ink, fontWeight: 600 }}>{s.email}</td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: s.reason === "manual" ? km.muted : "#b91c1c", textTransform: "uppercase", letterSpacing: 0.6 }}>{s.reason}</span>
                    </td>
                    <td style={{ ...tdStyle, color: km.muted, fontSize: 11, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.reason_detail || "—"}</td>
                    <td style={{ ...tdStyle, color: km.muted, fontSize: 11 }}>{new Date(s.added_at).toLocaleDateString("fr-FR")} · {s.added_by}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <button onClick={() => removeSuppress(s.email)} disabled={busy === `remove-${s.email}`} style={{ background: "transparent", border: `1px solid ${km.line}`, padding: "4px 10px", borderRadius: 999, fontSize: 10, fontWeight: 600, cursor: "pointer", color: km.ink, fontFamily: "inherit" }}>
                        Retirer
                      </button>
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

function StatCard({ label, value, accent = "#111" }: { label: string; value: string | number; accent?: string }) {
  return (
    <div style={{ background: "white", border: `1px solid ${km.line}`, borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent, lineHeight: 1, fontFamily: "var(--font-fraunces), 'Fraunces', serif", fontStyle: "italic", fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  )
}

const ctaPrimary: React.CSSProperties = { background: "#111", color: "white", border: "none", padding: "10px 18px", borderRadius: 999, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, cursor: "pointer", fontFamily: "inherit" }
const ctaSecondary: React.CSSProperties = { background: "white", color: "#111", border: `1px solid ${km.line}`, padding: "10px 18px", borderRadius: 999, fontSize: 12, fontWeight: 600, textDecoration: "none", cursor: "pointer", fontFamily: "inherit", display: "inline-block" }
const selectStyle: React.CSSProperties = { padding: "8px 14px", border: `1px solid ${km.line}`, borderRadius: 10, fontSize: 13, fontFamily: "inherit", background: "white", color: km.ink, outline: "none" }
const thStyle: React.CSSProperties = { padding: "10px 14px", textAlign: "left", fontWeight: 700 }
const tdStyle: React.CSSProperties = { padding: "10px 14px" }
