"use client"
import { useState, useEffect } from "react"
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
  const [stats, setStats] = useState<Record<string, number>>(initialStats)
  const [filterStatus, setFilterStatus] = useState<string>("")
  const [selected, setSelected] = useState<ReleaseRow | null>(null)

  const visible = releases.filter(r => filterStatus ? r.status === filterStatus : true)

  function patchReleaseLocal(updated: ReleaseRow) {
    setReleases(prev => {
      const next = prev.map(r => r.id === updated.id ? updated : r)
      // Recalcule stats
      const newStats: Record<string, number> = { pending: 0, in_progress: 0, validated: 0, blocked: 0 }
      for (const r of next) {
        if (r.status in newStats) newStats[r.status] = (newStats[r.status] || 0) + 1
      }
      setStats(newStats)
      return next
    })
    setSelected(updated)
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
          Validations release
        </h1>
        <p style={{ fontSize: 14, color: km.muted, marginTop: 8, maxWidth: 720 }}>
          À chaque commit important, une checklist apparaît ici. <strong style={{ color: km.ink }}>Clique sur une ligne</strong> pour voir le détail des checks à valider en prod (avec actions ✓ valider / ✗ signaler un bug + photo).
        </p>
        <div style={{
          marginTop: 12, padding: "10px 14px", background: "#EEF3FB",
          border: "1px solid #BFD8F7", borderRadius: 10,
          fontSize: 12, color: "#1d4ed8", lineHeight: 1.5,
        }}>
          <strong>Mode d&apos;emploi :</strong> 1) Clique une ligne <strong>À VALIDER</strong>. 2) Lis chaque check (étape de test concrète). 3) Vas tester en prod sur keymatch-immo.fr. 4) Coche ✓ ou ✗ avec note. 5) Si tout ✓ → la release passe en <strong>Validé</strong>.
        </div>
      </header>

      {/* V97.28 — Actions d'export pour Claude */}
      <BlockersExportActions />

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

      <div style={{ background: "white", border: `1px solid ${km.line}`, borderRadius: 14, overflow: "hidden" }}>
        {visible.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: km.muted, fontSize: 14 }}>
            {releases.length === 0
              ? "Aucune release à valider pour le moment."
              : "Aucune release avec ce filtre."}
          </div>
        ) : (
          <div>
            {/* V97.39.11 — Cards verticales au lieu de table, avec preview des checks visible */}
            {visible.map((r, idx) => {
              const checksOk = r.checks.filter(c => c.status === "ok").length
              const checksBlocked = r.checks.filter(c => c.status === "blocked").length
              const checksPending = r.checks.filter(c => c.status !== "ok" && c.status !== "blocked").length
              const checksTotal = r.checks.length
              const isFirst = idx === 0
              return (
                <div
                  key={r.id}
                  onClick={() => setSelected(r)}
                  style={{
                    cursor: "pointer",
                    borderTop: isFirst ? "none" : `1px solid ${km.line}`,
                    padding: "16px 20px",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = km.beige)}
                  onMouseLeave={e => (e.currentTarget.style.background = "white")}
                >
                  {/* Header line : status + commit + date */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                    <span style={{
                      color: STATUS_COLOR[r.status] || km.muted,
                      fontWeight: 700, fontSize: 10,
                      textTransform: "uppercase", letterSpacing: 0.6,
                      padding: "3px 8px", borderRadius: 4,
                      background: r.status === "pending" ? "#FEF3C7" : r.status === "blocked" ? "#FEECEC" : r.status === "validated" ? "#F0FAEE" : "#EEF3FB",
                    }}>
                      {STATUS_LABEL[r.status] || r.status}
                    </span>
                    <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 11, color: km.muted }}>
                      {r.commit_short || r.commit_sha.slice(0, 8)}
                    </span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: km.muted }}>
                      {new Date(r.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                    <span style={{ fontSize: 11, color: "#1d4ed8", fontWeight: 600 }}>
                      Voir détail →
                    </span>
                  </div>

                  {/* Titre commit */}
                  <p style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600, color: km.ink, lineHeight: 1.3 }}>
                    {r.commit_title}
                  </p>

                  {/* Compteur de checks visible */}
                  <p style={{ margin: "0 0 10px", fontSize: 12, color: km.muted, fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ color: "#15803d", fontWeight: 700 }}>{checksOk}</span>
                    <span> validés · </span>
                    <span style={{ color: "#a16207", fontWeight: 700 }}>{checksPending}</span>
                    <span> à tester</span>
                    {checksBlocked > 0 && (
                      <span style={{ color: "#b91c1c", marginLeft: 6, fontWeight: 700 }}>
                        · {checksBlocked} bloqué{checksBlocked > 1 ? "s" : ""}
                      </span>
                    )}
                    <span style={{ marginLeft: 6 }}>(total {checksTotal})</span>
                  </p>

                  {/* V97.39.11 — Preview des checks (3 premiers non-ok pour aider à choisir vite) */}
                  {checksTotal > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginLeft: 4 }}>
                      {r.checks
                        .filter(c => c.status !== "ok") // affiche d'abord les non validés
                        .slice(0, 3)
                        .map(c => (
                          <div key={c.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: km.ink, lineHeight: 1.45 }}>
                            <span style={{
                              fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1,
                              color: c.status === "blocked" ? "#b91c1c" : c.status === "coded" ? "#1d4ed8" : km.muted,
                            }}>
                              {c.status === "blocked" ? "✗" : c.status === "coded" ? "✦" : "○"}
                            </span>
                            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {c.label}
                            </span>
                          </div>
                        ))}
                      {r.checks.filter(c => c.status !== "ok").length > 3 && (
                        <p style={{ margin: "2px 0 0 18px", fontSize: 11, color: km.muted, fontStyle: "italic" }}>
                          + {r.checks.filter(c => c.status !== "ok").length - 3} autres checks…
                        </p>
                      )}
                      {r.checks.filter(c => c.status !== "ok").length === 0 && (
                        <p style={{ margin: 0, fontSize: 11, color: "#15803d", fontStyle: "italic" }}>
                          ✓ Tous les checks validés
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selected && (
        <DetailModal
          release={selected}
          onClose={() => setSelected(null)}
          onUpdate={patchReleaseLocal}
        />
      )}
    </div>
  )
}

// V97.39.11 — thStyle/tdStyle retirés (table remplacée par cards verticales)

// ─── Detail Modal avec workflow check + upload screenshot ───────────────────

function DetailModal({
  release,
  onClose,
  onUpdate,
}: {
  release: ReleaseRow
  onClose: () => void
  onUpdate: (r: ReleaseRow) => void
}) {
  const [busyCheckId, setBusyCheckId] = useState<string | null>(null)
  const [busyGlobal, setBusyGlobal] = useState(false)
  const [blockingCheckId, setBlockingCheckId] = useState<string | null>(null)
  const [blockNote, setBlockNote] = useState("")

  async function updateCheck(checkId: string, payload: { status?: "ok" | "blocked" | "pending" | "coded"; note?: string | null; screenshot_path?: string | null }) {
    setBusyCheckId(checkId)
    try {
      const res = await fetch(`/api/admin/releases/${release.id}/check/${checkId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!json.ok) {
        alert(json.error || "Erreur update check")
        return
      }
      onUpdate({ ...release, checks: json.checks, status: json.status })
    } finally {
      setBusyCheckId(null)
    }
  }

  async function uploadScreenshot(checkId: string, file: File): Promise<string | null> {
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch(`/api/admin/releases/${release.id}/screenshot`, {
      method: "POST",
      body: fd,
    })
    const json = await res.json()
    if (!json.ok) {
      alert(json.error || "Upload échoué")
      return null
    }
    return json.path
  }

  async function blockWithNote(checkId: string) {
    if (!blockNote.trim()) {
      alert("Décris brièvement le problème.")
      return
    }
    await updateCheck(checkId, { status: "blocked", note: blockNote.trim() })
    setBlockingCheckId(null)
    setBlockNote("")
  }

  async function blockWithPhoto(checkId: string, file: File) {
    setBusyCheckId(checkId)
    try {
      const path = await uploadScreenshot(checkId, file)
      if (!path) return
      await updateCheck(checkId, {
        status: "blocked",
        note: blockNote.trim() || null,
        screenshot_path: path,
      })
      setBlockingCheckId(null)
      setBlockNote("")
    } finally {
      setBusyCheckId(null)
    }
  }

  async function validateAll() {
    if (!confirm("Marquer TOUS les checks pending comme validés ?")) return
    setBusyGlobal(true)
    try {
      const res = await fetch(`/api/admin/releases/${release.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "validate_all" }),
      })
      const json = await res.json()
      if (!json.ok) {
        alert(json.error || "Erreur validation globale")
        return
      }
      onUpdate({ ...release, checks: json.checks, status: json.status, validated_at: json.validated_at, validated_by: json.validated_by })
    } finally {
      setBusyGlobal(false)
    }
  }

  async function resetRelease() {
    if (!confirm("Remettre tous les checks à pending (efface les notes et screenshots) ?")) return
    setBusyGlobal(true)
    try {
      const res = await fetch(`/api/admin/releases/${release.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      })
      const json = await res.json()
      if (!json.ok) {
        alert(json.error || "Erreur reset")
        return
      }
      onUpdate({ ...release, checks: json.checks, status: json.status, validated_at: null, validated_by: null, blocker_description: null })
    } finally {
      setBusyGlobal(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.55)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: "white", borderRadius: 18, width: "min(720px, 100%)", maxHeight: "min(90vh, 90dvh)", overflowY: "auto", padding: 24, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: 1.2, margin: 0 }}>
              {release.commit_short || release.commit_sha.slice(0, 8)} ·{" "}
              <span style={{ color: STATUS_COLOR[release.status] || km.muted }}>{STATUS_LABEL[release.status]}</span>
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

        {/* Actions globales */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <button
            onClick={validateAll}
            disabled={busyGlobal || release.status === "validated"}
            style={{ background: "#15803d", color: "white", border: "none", borderRadius: 999, padding: "8px 18px", fontSize: 12, fontWeight: 700, cursor: busyGlobal ? "wait" : "pointer", fontFamily: "inherit", opacity: release.status === "validated" ? 0.5 : 1 }}
          >
            {busyGlobal ? "…" : "✓ Tout valider"}
          </button>
          <button
            onClick={resetRelease}
            disabled={busyGlobal}
            style={{ background: "white", color: km.muted, border: `1px solid ${km.line}`, borderRadius: 999, padding: "8px 18px", fontSize: 12, fontWeight: 600, cursor: busyGlobal ? "wait" : "pointer", fontFamily: "inherit" }}
          >
            Reset
          </button>
        </div>

        <h4 style={{ fontSize: 12, fontWeight: 700, color: km.ink, textTransform: "uppercase", letterSpacing: 1.2, margin: "0 0 12px" }}>
          Checklist ({release.checks.length})
        </h4>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {release.checks.map(c => {
            const isBusy = busyCheckId === c.id
            const isBlocking = blockingCheckId === c.id
            return (
              <div
                key={c.id}
                style={{
                  padding: "10px 12px",
                  border: `1px solid ${km.line}`,
                  borderRadius: 10,
                  background: c.status === "ok" ? "#F0FAEE" : c.status === "blocked" ? "#FEECEC" : c.status === "coded" ? "#EEF3FB" : "white",
                  opacity: isBusy ? 0.6 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <span
                    style={{ fontSize: 14, color: c.status === "ok" ? "#15803d" : c.status === "blocked" ? "#b91c1c" : c.status === "coded" ? "#1d4ed8" : km.muted, fontWeight: 700, flexShrink: 0, marginTop: 1 }}
                    title={c.status === "coded" ? "Fait par Claude — à tester" : c.status === "ok" ? "Validé par Paul" : c.status === "blocked" ? "Bloqué — bug trouvé" : "Pas démarré"}
                  >
                    {c.status === "ok" ? "✓" : c.status === "blocked" ? "✗" : c.status === "coded" ? "✦" : "○"}
                  </span>
                  <span style={{ fontSize: 13, color: km.ink, flex: 1, lineHeight: 1.5 }}>
                    {c.label}
                  </span>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => updateCheck(c.id, { status: "ok", note: null, screenshot_path: null })}
                      disabled={isBusy || c.status === "ok"}
                      title="Valider ce check"
                      style={{ width: 32, height: 32, borderRadius: 999, background: c.status === "ok" ? "#15803d" : "white", color: c.status === "ok" ? "white" : "#15803d", border: `1px solid ${c.status === "ok" ? "#15803d" : "#86efac"}`, cursor: isBusy ? "wait" : "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => { setBlockingCheckId(isBlocking ? null : c.id); setBlockNote(c.note || "") }}
                      disabled={isBusy}
                      title="Signaler un problème"
                      style={{ width: 32, height: 32, borderRadius: 999, background: c.status === "blocked" ? "#b91c1c" : "white", color: c.status === "blocked" ? "white" : "#b91c1c", border: `1px solid ${c.status === "blocked" ? "#b91c1c" : "#fca5a5"}`, cursor: isBusy ? "wait" : "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}
                    >
                      ✗
                    </button>
                  </div>
                </div>

                {/* Note existante (statut blocked) */}
                {c.note && !isBlocking && (
                  <p style={{ marginTop: 8, marginLeft: 24, fontSize: 12, color: "#b91c1c", fontStyle: "italic" }}>
                    « {c.note} »
                  </p>
                )}

                {/* Screenshot existant (lazy fetch signed URL au mount) */}
                {c.screenshot_path && !isBlocking && (
                  <ScreenshotPreview path={c.screenshot_path} releaseId={release.id} />
                )}

                {/* Form blocage : note + upload photo */}
                {isBlocking && (
                  <div style={{ marginTop: 10, marginLeft: 24, padding: 10, background: "white", border: `1px solid ${km.line}`, borderRadius: 8 }}>
                    <textarea
                      value={blockNote}
                      onChange={e => setBlockNote(e.target.value)}
                      placeholder="Décris brièvement le problème…"
                      rows={3}
                      style={{ width: "100%", padding: 8, border: `1px solid ${km.line}`, borderRadius: 6, fontSize: 13, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box", color: km.ink }}
                    />
                    <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <button
                        onClick={() => blockWithNote(c.id)}
                        disabled={isBusy || blockNote.trim().length < 3}
                        style={{ background: "#b91c1c", color: "white", border: "none", borderRadius: 999, padding: "7px 14px", fontSize: 11, fontWeight: 700, cursor: isBusy || blockNote.trim().length < 3 ? "not-allowed" : "pointer", opacity: blockNote.trim().length < 3 ? 0.5 : 1, fontFamily: "inherit" }}
                      >
                        Signaler bloqué
                      </button>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: km.muted, cursor: "pointer", padding: "7px 14px", border: `1px dashed ${km.line}`, borderRadius: 999, fontFamily: "inherit" }}>
                        📷 + photo
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          style={{ display: "none" }}
                          onChange={e => {
                            const f = e.target.files?.[0]
                            if (f) void blockWithPhoto(c.id, f)
                          }}
                        />
                      </label>
                      <button
                        onClick={() => { setBlockingCheckId(null); setBlockNote("") }}
                        style={{ background: "none", color: km.muted, border: "none", padding: "7px 14px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {release.validated_at && (
          <p style={{ fontSize: 11, color: "#15803d", margin: 0 }}>
            ✓ Validé le {new Date(release.validated_at).toLocaleString("fr-FR")}
            {release.validated_by && <> par {release.validated_by}</>}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Screenshot preview avec signed URL ─────────────────────────────────────

function ScreenshotPreview({ path, releaseId }: { path: string; releaseId: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/admin/releases/${releaseId}/screenshot?path=${encodeURIComponent(path)}`, { cache: "no-store" })
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        if (json?.ok && json.url) setUrl(json.url)
        else setError(json?.error || "Image indisponible")
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erreur réseau")
      }
    })()
    return () => { cancelled = true }
  }, [path, releaseId])

  if (error) {
    return (
      <p style={{ marginTop: 8, marginLeft: 24, fontSize: 11, color: km.muted, fontStyle: "italic" }}>
        Screenshot : {error}
      </p>
    )
  }
  if (!url) {
    return (
      <p style={{ marginTop: 8, marginLeft: 24, fontSize: 11, color: km.muted, fontStyle: "italic" }}>
        Screenshot : chargement…
      </p>
    )
  }
  return (
    <div style={{ marginTop: 8, marginLeft: 24 }}>
      <a href={url} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Capture du problème" style={{ maxWidth: 220, maxHeight: 160, borderRadius: 6, border: `1px solid ${km.line}`, display: "block" }} />
      </a>
    </div>
  )
}

// ─── V97.28 — Actions d'export blocages pour Claude ─────────────────────────

function BlockersExportActions() {
  const [copying, setCopying] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  async function copyMarkdown() {
    setCopying(true)
    setFeedback(null)
    try {
      const res = await fetch("/api/admin/releases/blockers-export?format=markdown", { cache: "no-store" })
      if (!res.ok) {
        setFeedback("Échec récupération")
        return
      }
      const md = await res.text()
      await navigator.clipboard.writeText(md)
      setFeedback("Markdown copié — colle-le dans une session Claude")
      window.setTimeout(() => setFeedback(null), 4000)
    } catch (e) {
      setFeedback("Erreur : " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setCopying(false)
    }
  }

  async function copyClaudeLink() {
    const token = window.prompt(
      "Colle le CLAUDE_BRIEF_TOKEN configuré côté Vercel env vars.\n\n" +
      "Si non configuré : crée-le dans Vercel Settings → Environment Variables " +
      "avec une chaîne aléatoire longue, puis redeploy.",
    )
    if (!token || token.trim().length < 16) {
      setFeedback("Token absent ou trop court (min 16 chars)")
      window.setTimeout(() => setFeedback(null), 4000)
      return
    }
    const base = window.location.origin
    const url = `${base}/api/admin/releases/blockers-export?format=markdown&token=${encodeURIComponent(token.trim())}`
    try {
      await navigator.clipboard.writeText(url)
      setFeedback("Lien Claude copié — donne-le à Claude qui fera WebFetch")
      window.setTimeout(() => setFeedback(null), 5000)
    } catch {
      setFeedback("Impossible de copier dans le presse-papier (manuel : " + url + ")")
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
      <button
        type="button"
        onClick={copyMarkdown}
        disabled={copying}
        style={{
          background: "#111",
          color: "white",
          border: "none",
          borderRadius: 999,
          padding: "8px 18px",
          fontSize: 12,
          fontWeight: 700,
          cursor: copying ? "wait" : "pointer",
          fontFamily: "inherit",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {copying ? "Génération…" : "📋 Copier markdown blocages"}
      </button>
      <button
        type="button"
        onClick={copyClaudeLink}
        style={{
          background: "white",
          color: km.ink,
          border: `1px solid ${km.line}`,
          borderRadius: 999,
          padding: "8px 18px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
        title="URL persistante que Claude peut WebFetch directement dans n'importe quelle session"
      >
        🔗 Copier lien Claude WebFetch
      </button>
      {feedback && (
        <span style={{ fontSize: 12, color: km.muted, fontStyle: "italic" }}>
          {feedback}
        </span>
      )}
    </div>
  )
}
