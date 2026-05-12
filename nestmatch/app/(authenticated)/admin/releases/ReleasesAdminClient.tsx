"use client"
import { useState } from "react"
import { km } from "../../../components/ui/km"
import type { ReleaseRow } from "./page"

const STATUS_COLOR: Record<string, string> = {
  pending: "#a16207",
  in_progress: "#1d4ed8",
  validated: "#15803d",
  blocked: "#b91c1c",
}

const STATUS_LABEL: Record<string, string> = {
  pending: "À valider",
  in_progress: "En cours",
  validated: "Validé",
  blocked: "Bloqué",
}

export default function ReleasesAdminClient({
  initialReleases,
  initialStats,
}: {
  initialReleases: ReleaseRow[]
  initialStats: Record<string, number>
}) {
  const [releases, setReleases] = useState<ReleaseRow[]>(initialReleases)
  const [stats] = useState<Record<string, number>>(initialStats)
  const [filterStatus, setFilterStatus] = useState<string>("")
  const [selected, setSelected] = useState<ReleaseRow | null>(null)

  const visible = releases.filter(r => filterStatus ? r.status === filterStatus : true)

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
          Validations release
        </h1>
        <p style={{ fontSize: 14, color: km.muted, marginTop: 8 }}>
          À chaque commit important, une checklist apparaît ici. Coche les checks au fur et à mesure, signale les blocages avec photo si besoin.
        </p>
      </header>

      {/* Stats badges */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {Object.entries(stats).map(([s, count]) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilterStatus(filterStatus === s ? "" : s)}
            style={{
              padding: "6px 14px", borderRadius: 999,
              background: filterStatus === s ? STATUS_COLOR[s] : "white",
              border: `1px solid ${filterStatus === s ? STATUS_COLOR[s] : km.line}`,
              fontSize: 11, fontWeight: 700, fontFamily: "inherit",
              color: filterStatus === s ? "white" : (STATUS_COLOR[s] || km.muted),
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {STATUS_LABEL[s] || s} · <span style={{ fontVariantNumeric: "tabular-nums" }}>{count}</span>
          </button>
        ))}
        {filterStatus && (
          <button
            type="button"
            onClick={() => setFilterStatus("")}
            style={{ padding: "6px 14px", borderRadius: 999, background: "none", border: `1px solid ${km.line}`, fontSize: 11, fontWeight: 600, fontFamily: "inherit", color: km.muted, cursor: "pointer" }}
          >
            × Filtre
          </button>
        )}
      </div>

      {/* Liste des releases */}
      <div style={{ background: "white", border: `1px solid ${km.line}`, borderRadius: 14, overflow: "hidden" }}>
        {visible.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: km.muted, fontSize: 14 }}>
            {releases.length === 0
              ? "Aucune release à valider pour le moment."
              : "Aucune release avec ce filtre."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: km.beige, color: km.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Commit</th>
                <th style={thStyle}>Titre</th>
                <th style={thStyle}>Checks</th>
                <th style={thStyle}>Créé</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(r => {
                const checksOk = r.checks.filter(c => c.status === "ok").length
                const checksBlocked = r.checks.filter(c => c.status === "blocked").length
                const checksTotal = r.checks.length
                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    style={{ cursor: "pointer", borderTop: `1px solid ${km.line}` }}
                  >
                    <td style={tdStyle}>
                      <span style={{ color: STATUS_COLOR[r.status] || km.muted, fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6 }}>
                        {STATUS_LABEL[r.status] || r.status}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 11, color: km.muted }}>
                      {r.commit_short || r.commit_sha.slice(0, 8)}
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.commit_title}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 11, color: km.muted, fontVariantNumeric: "tabular-nums" }}>
                        {checksOk}/{checksTotal}
                        {checksBlocked > 0 && (
                          <span style={{ color: "#b91c1c", marginLeft: 6 }}>· {checksBlocked} bloqué{checksBlocked > 1 ? "s" : ""}</span>
                        )}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontSize: 11, color: km.muted, textAlign: "right" }}>
                      {new Date(r.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modale détail — batch 2 implémentera workflow check + screenshot.
          Pour le batch 1 on affiche juste la liste read-only des checks. */}
      {selected && (
        <DetailModal release={selected} onClose={() => setSelected(null)} onUpdate={(r) => setReleases(prev => prev.map(x => x.id === r.id ? r : x))} />
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = { padding: "10px 14px", textAlign: "left", fontWeight: 700 }
const tdStyle: React.CSSProperties = { padding: "10px 14px" }

function DetailModal({
  release,
  onClose,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onUpdate,
}: {
  release: ReleaseRow
  onClose: () => void
  onUpdate: (r: ReleaseRow) => void
}) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.55)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: "white", borderRadius: 18, width: "min(720px, 100%)", maxHeight: "90vh", overflowY: "auto", padding: 24, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: 1.2, margin: 0 }}>
              {release.commit_short || release.commit_sha.slice(0, 8)}
            </p>
            <h3 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: "4px 0 0", color: km.ink, lineHeight: 1.2 }}>
              {release.commit_title}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{ background: km.beige, border: `1px solid ${km.line}`, borderRadius: 999, width: 36, height: 36, cursor: "pointer", fontSize: 16, fontFamily: "inherit", flexShrink: 0 }}
          >
            ×
          </button>
        </div>

        {release.commit_body && (
          <details style={{ marginBottom: 16, border: `1px solid ${km.line}`, borderRadius: 10, padding: 12, background: km.beige }}>
            <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: km.ink }}>
              Description du commit
            </summary>
            <pre style={{ marginTop: 10, fontSize: 11, lineHeight: 1.5, color: km.ink, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", background: "white", padding: 10, borderRadius: 6, maxHeight: 240, overflowY: "auto" }}>
              {release.commit_body}
            </pre>
          </details>
        )}

        <h4 style={{ fontSize: 12, fontWeight: 700, color: km.ink, textTransform: "uppercase", letterSpacing: 1.2, margin: "0 0 12px" }}>
          Checklist ({release.checks.length})
        </h4>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {release.checks.map(c => (
            <div key={c.id} style={{ padding: "10px 12px", border: `1px solid ${km.line}`, borderRadius: 10, background: c.status === "ok" ? "#F0FAEE" : c.status === "blocked" ? "#FEECEC" : "white" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ fontSize: 14, color: c.status === "ok" ? "#15803d" : c.status === "blocked" ? "#b91c1c" : km.muted, fontWeight: 700, flexShrink: 0 }}>
                  {c.status === "ok" ? "✓" : c.status === "blocked" ? "✗" : "○"}
                </span>
                <span style={{ fontSize: 13, color: km.ink, flex: 1, lineHeight: 1.5 }}>
                  {c.label}
                </span>
              </div>
              {c.note && (
                <p style={{ marginTop: 6, marginLeft: 24, fontSize: 12, color: "#b91c1c", fontStyle: "italic" }}>
                  &laquo; {c.note} &raquo;
                </p>
              )}
            </div>
          ))}
        </div>

        {/* TODO batch 2 : actions par check (valider / bloquer + screenshot)
            + actions globales (Valider tout / Bloquer tout). Pour V97.24 batch 1
            on affiche read-only la checklist. */}
        <div style={{ padding: "12px 14px", background: "#FBF6EA", border: "1px solid #EADFC6", borderRadius: 10, fontSize: 12, color: "#a16207", lineHeight: 1.5 }}>
          <strong>Batch 2 à venir</strong> : actions par check (valider ✓ / bloquer ✗ avec photo), validation globale en 1 clic. Pour l&apos;instant cette modale affiche la checklist en lecture seule.
        </div>
      </div>
    </div>
  )
}
