"use client"
import { useEffect, useState } from "react"
import { km } from "../../../components/ui/km"

type ConsoleEntry = { level: string; text: string; ts: number }
type NetworkEntry = { url: string; status: number; method: string }

type Bug = {
  id: string
  user_email: string | null
  user_role: string | null
  page_url: string
  description: string
  severity: string
  status: string
  screenshot_url: string | null
  console_log: ConsoleEntry[] | null
  network_log: NetworkEntry[] | null
  notes: string | null
  fixed_at: string | null
  created_at: string
}

type Stats = {
  by_severity: Record<string, number>
  by_status: Record<string, number>
  total: number
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#b91c1c",
  major: "#a16207",
  minor: "#6b6358",
  cosmetic: "#9ca3af",
}

const STATUS_COLOR: Record<string, string> = {
  open: "#b91c1c",
  investigating: "#a16207",
  fixed: "#15803d",
  wontfix: "#6b6358",
  duplicate: "#9ca3af",
}

export default function BugsAdminClient({ initialBugs, initialStats }: { initialBugs: Bug[]; initialStats: Stats }) {
  const [bugs, setBugs] = useState<Bug[]>(initialBugs)
  const [stats] = useState<Stats>(initialStats)
  const [filterStatus, setFilterStatus] = useState<string>("")
  const [filterSeverity, setFilterSeverity] = useState<string>("")
  const [search, setSearch] = useState<string>("")
  const [selected, setSelected] = useState<Bug | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  const refresh = async () => {
    const params = new URLSearchParams()
    if (filterStatus) params.set("status", filterStatus)
    if (filterSeverity) params.set("severity", filterSeverity)
    if (search) params.set("q", search)
    try {
      const res = await fetch(`/api/admin/bugs?${params.toString()}`, { cache: "no-store" })
      const j = await res.json()
      if (j.ok) setBugs(j.bugs)
    } catch { /* silent */ }
  }

  useEffect(() => { void refresh() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filterStatus, filterSeverity])

  const updateBug = async (id: string, patch: Partial<Bug>) => {
    setSavingId(id)
    try {
      const res = await fetch(`/api/admin/bugs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const j = await res.json()
      if (j.ok) {
        // Optimistic update
        setBugs(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b))
        if (selected?.id === id) setSelected({ ...selected, ...patch })
      }
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div>
      <header style={{ marginBottom: 22 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: 1.6, margin: 0 }}>
          Admin · Interne
        </p>
        <h1 style={{
          fontFamily: "var(--font-fraunces), 'Fraunces', serif",
          fontStyle: "italic", fontWeight: 500, fontSize: 40,
          margin: "4px 0 0", lineHeight: 1.1, color: km.ink,
        }}>
          Bug reports
        </h1>
        <p style={{ fontSize: 14, color: km.muted, marginTop: 8 }}>
          {stats.total} signalements au total · {stats.by_status.open || 0} ouverts · {stats.by_severity.critical || 0} critiques
        </p>
      </header>

      {/* Stats badges */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {Object.entries(stats.by_severity).map(([sev, count]) => (
          <span key={sev} style={{
            padding: "6px 12px", borderRadius: 999,
            background: "white", border: `1px solid ${km.line}`,
            fontSize: 11, fontWeight: 600,
            color: SEVERITY_COLOR[sev] || km.muted,
          }}>
            {sev.toUpperCase()} · <span style={{ fontVariantNumeric: "tabular-nums" }}>{count}</span>
          </span>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="">Tous status</option>
          <option value="open">Ouvert</option>
          <option value="investigating">En cours</option>
          <option value="fixed">Fixé</option>
          <option value="wontfix">Wontfix</option>
          <option value="duplicate">Duplicate</option>
        </select>
        <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} style={selectStyle}>
          <option value="">Toutes sévérités</option>
          <option value="critical">Critical</option>
          <option value="major">Major</option>
          <option value="minor">Minor</option>
          <option value="cosmetic">Cosmetic</option>
        </select>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") refresh() }}
          placeholder="Recherche dans la description…"
          style={{
            ...selectStyle, flex: 1, minWidth: 200,
            paddingRight: 14,
          }}
        />
        <button onClick={refresh} style={{ background: km.ink, color: km.white, border: "none", padding: "8px 16px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          Rafraîchir
        </button>
      </div>

      {/* Table */}
      <div style={{ background: "white", border: `1px solid ${km.line}`, borderRadius: 14, overflow: "hidden" }}>
        {bugs.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: km.muted, fontSize: 14 }}>
            Aucun bug avec ces filtres.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: km.beige, color: km.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>
                <th style={thStyle}>Sévérité</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Description</th>
                <th style={thStyle}>Page</th>
                <th style={thStyle}>Auteur</th>
                <th style={thStyle}>Quand</th>
              </tr>
            </thead>
            <tbody>
              {bugs.map(b => (
                <tr key={b.id} onClick={() => setSelected(b)} style={{ cursor: "pointer", borderTop: `1px solid ${km.line}` }}>
                  <td style={tdStyle}>
                    <span style={{ color: SEVERITY_COLOR[b.severity] || km.muted, fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6 }}>
                      {b.severity}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: STATUS_COLOR[b.status] || km.muted, fontWeight: 600, fontSize: 11 }}>{b.status}</span>
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {b.description}
                  </td>
                  <td style={{ ...tdStyle, fontSize: 11, color: km.muted, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {b.page_url}
                  </td>
                  <td style={{ ...tdStyle, fontSize: 11, color: km.muted }}>{b.user_email?.slice(0, 18) || "—"}</td>
                  <td style={{ ...tdStyle, fontSize: 11, color: km.muted, textAlign: "right" }}>
                    {new Date(b.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal détail */}
      {selected && (
        <DetailModal bug={selected} saving={savingId === selected.id} onUpdate={(patch) => updateBug(selected.id, patch)} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  padding: "8px 14px",
  border: `1px solid ${km.line}`,
  borderRadius: 10,
  fontSize: 13,
  fontFamily: "inherit",
  background: "white",
  color: km.ink,
  outline: "none",
}

const thStyle: React.CSSProperties = { padding: "10px 14px", textAlign: "left", fontWeight: 700 }
const tdStyle: React.CSSProperties = { padding: "10px 14px" }

function DetailModal({ bug, saving, onUpdate, onClose }: { bug: Bug; saving: boolean; onUpdate: (p: Partial<Bug>) => void; onClose: () => void }) {
  const [notes, setNotes] = useState(bug.notes || "")
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.55)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 18, width: "min(780px, 100%)", maxHeight: "90vh", overflowY: "auto", padding: 24, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <h3 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: 0 }}>
            Bug report
          </h3>
          <button onClick={onClose} style={{ background: km.beige, border: `1px solid ${km.line}`, borderRadius: 999, width: 36, height: 36, cursor: "pointer", fontSize: 16, fontFamily: "inherit" }}>×</button>
        </div>

        <div style={{ marginBottom: 16, padding: 12, background: km.beige, borderRadius: 10 }}>
          <p style={{ margin: 0, fontSize: 14, color: km.ink, lineHeight: 1.5 }}>{bug.description}</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 16, fontSize: 12 }}>
          <div>
            <div style={{ color: km.muted, marginBottom: 4 }}>Sévérité</div>
            <select value={bug.severity} onChange={e => onUpdate({ severity: e.target.value })} disabled={saving} style={selectStyle}>
              <option value="critical">Critical</option>
              <option value="major">Major</option>
              <option value="minor">Minor</option>
              <option value="cosmetic">Cosmetic</option>
            </select>
          </div>
          <div>
            <div style={{ color: km.muted, marginBottom: 4 }}>Status</div>
            <select value={bug.status} onChange={e => onUpdate({ status: e.target.value })} disabled={saving} style={selectStyle}>
              <option value="open">Ouvert</option>
              <option value="investigating">En cours</option>
              <option value="fixed">Fixé</option>
              <option value="wontfix">Wontfix</option>
              <option value="duplicate">Duplicate</option>
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{ color: km.muted, marginBottom: 4 }}>Page</div>
            <a href={bug.page_url} target="_blank" rel="noopener noreferrer" style={{ color: km.ink, textDecoration: "underline", fontSize: 12, wordBreak: "break-all" }}>{bug.page_url}</a>
          </div>
          <div>
            <div style={{ color: km.muted, marginBottom: 4 }}>Auteur</div>
            <div style={{ color: km.ink, fontSize: 12 }}>{bug.user_email || "—"} · {bug.user_role || "—"}</div>
          </div>
          <div>
            <div style={{ color: km.muted, marginBottom: 4 }}>Créé</div>
            <div style={{ color: km.ink, fontSize: 12 }}>{new Date(bug.created_at).toLocaleString("fr-FR")}</div>
          </div>
        </div>

        {bug.screenshot_url && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: km.muted, fontSize: 12, marginBottom: 6 }}>Screenshot</div>
            <a href={bug.screenshot_url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={bug.screenshot_url} alt="Bug screenshot" style={{ maxWidth: "100%", borderRadius: 8, border: `1px solid ${km.line}` }} />
            </a>
          </div>
        )}

        {/* V97.10 — Console log (50 dernières erreurs/warnings) */}
        {bug.console_log && bug.console_log.length > 0 && (
          <details style={{ marginBottom: 12, border: `1px solid ${km.line}`, borderRadius: 10, padding: 12, background: km.beige }}>
            <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: km.ink }}>
              Console ({bug.console_log.length} entrée{bug.console_log.length > 1 ? "s" : ""})
            </summary>
            <pre style={{ marginTop: 10, fontSize: 11, lineHeight: 1.5, color: km.ink, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", background: "white", padding: 10, borderRadius: 6, maxHeight: 280, overflowY: "auto" }}>
              {bug.console_log.map((c, i) => (
                <div key={i} style={{ color: c.level === "error" ? "#b91c1c" : "#a16207", marginBottom: 4 }}>
                  [{c.level.toUpperCase()}] {c.text}
                </div>
              ))}
            </pre>
          </details>
        )}

        {/* V97.10 — Network log (20 derniers 4xx/5xx) */}
        {bug.network_log && bug.network_log.length > 0 && (
          <details style={{ marginBottom: 12, border: `1px solid ${km.line}`, borderRadius: 10, padding: 12, background: km.beige }}>
            <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: km.ink }}>
              Network errors ({bug.network_log.length})
            </summary>
            <pre style={{ marginTop: 10, fontSize: 11, lineHeight: 1.5, color: km.ink, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", background: "white", padding: 10, borderRadius: 6, maxHeight: 200, overflowY: "auto" }}>
              {bug.network_log.map((n, i) => (
                <div key={i} style={{ color: n.status >= 500 ? "#b91c1c" : "#a16207", marginBottom: 4 }}>
                  [{n.status}] {n.method} {n.url}
                </div>
              ))}
            </pre>
          </details>
        )}

        <div style={{ marginBottom: 12 }}>
          <div style={{ color: km.muted, fontSize: 12, marginBottom: 4 }}>Notes admin</div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ ...selectStyle, width: "100%", resize: "vertical" }} />
          <button onClick={() => onUpdate({ notes })} disabled={saving} style={{ marginTop: 8, background: km.ink, color: km.white, border: "none", padding: "8px 16px", borderRadius: 999, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, cursor: saving ? "wait" : "pointer", fontFamily: "inherit" }}>
            {saving ? "Sauvegarde…" : "Sauvegarder notes"}
          </button>
        </div>
      </div>
    </div>
  )
}
