"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { km } from "../ui/km"

/**
 * V84.6 — Widgets dashboard /admin moderne.
 *
 * Fetch /api/admin/dashboard-v84 (V84.6) qui agrège toutes les stats.
 * Grid responsive 4 cols → 2 cols → 1 col selon viewport.
 * Quick actions row tout en haut.
 */

type Stats = {
  users: { total: number; new_24h: number }
  annonces: { total: number; new_24h: number }
  baux: { actifs: number; signed_month: number }
  incidents: { total: number; by_severity: Record<string, number> }
  qa: { runs_7d: number; pass_rate_pct: number; passed_7d: number }
  bugs: { open_total: number; by_severity: Record<string, number> }
  crons: { runs_24h: number; success: number; failure: number }
}

export default function AdminDashboardWidgets() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch("/api/admin/dashboard-v84", { cache: "no-store" })
      .then(r => r.json())
      .then(j => { if (alive && j.ok) { setStats(j.stats); setLoading(false) } })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const action = async (kind: string) => {
    setActionMsg(null)
    try {
      if (kind === "health") {
        await fetch("/api/health/full?force=true", { cache: "no-store" })
        setActionMsg("Health re-check déclenché.")
      } else if (kind === "qa") {
        const list = await fetch("/api/qa/scenarios", { cache: "no-store" }).then(r => r.json())
        if (list.ok) {
          for (const s of list.scenarios) {
            await fetch("/api/qa/run", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ scenario: s.file }),
            })
          }
          setActionMsg(`${list.scenarios.length} runs QA déclenchés (status='running').`)
        }
      } else if (kind === "incident") {
        const title = window.prompt("Titre incident manuel :")
        if (!title) return
        const res = await fetch("/api/admin/incidents/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description: "Incident créé manuellement depuis dashboard /admin",
            severity: "minor",   // API: info | minor | major | critical
            status: "investigating",
            service: "app",
            is_public: false,    // visible /admin/health uniquement
          }),
        })
        const j = await res.json()
        setActionMsg(j.success ? `Incident #${j.id} créé.` : `Erreur : ${j.error || "inconnue"}`)
      }
    } catch (e) {
      setActionMsg(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <section style={{ marginBottom: 32 }}>
      <header style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: 1.6, margin: 0 }}>
          Vue d&apos;ensemble · Live
        </p>
        <h1 style={{
          fontFamily: "var(--font-fraunces), 'Fraunces', serif",
          fontStyle: "italic", fontWeight: 500, fontSize: 40,
          margin: "4px 0 0", lineHeight: 1.1, color: km.ink,
        }}>
          Dashboard admin
        </h1>
      </header>

      {/* Quick actions */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 22 }}>
        <ActionButton label="🔄 Re-check health" onClick={() => action("health")} />
        <ActionButton label="▶ Run QA all" onClick={() => action("qa")} />
        <ActionButton label="🆘 Créer incident" onClick={() => action("incident")} />
        <Link href="/admin/operations" style={{ ...actionStyle }}>
          ⚡ Voir Opérations
        </Link>
      </div>
      {actionMsg && (
        <div style={{ marginBottom: 16, padding: "10px 14px", background: "#EEF3FB", border: "1px solid #D7E3F4", borderRadius: 10, fontSize: 13, color: "#1d4ed8" }}>
          {actionMsg}
        </div>
      )}

      {/* Widgets grid */}
      {loading ? (
        <div style={{ padding: 32, textAlign: "center", color: km.muted, fontSize: 14 }}>Chargement…</div>
      ) : stats ? (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}>
          <Widget
            label="Santé services"
            value={stats.incidents.total === 0 ? "OK" : `${stats.incidents.total} ouvert${stats.incidents.total > 1 ? "s" : ""}`}
            tone={stats.incidents.total === 0 ? "success" : "warn"}
            detail={Object.entries(stats.incidents.by_severity).map(([k, v]) => `${v} ${k}`).join(" · ") || "Aucun incident"}
            link="/admin/health"
          />
          <Widget
            label="QA Bot 7j"
            value={`${stats.qa.pass_rate_pct}% pass`}
            tone={stats.qa.pass_rate_pct >= 90 ? "success" : stats.qa.pass_rate_pct >= 70 ? "warn" : "err"}
            detail={`${stats.qa.passed_7d}/${stats.qa.runs_7d} runs`}
            link="/admin/qa"
          />
          <Widget
            label="Utilisateurs"
            value={stats.users.total}
            detail={`+${stats.users.new_24h} sur 24h`}
            link="/admin#users"
          />
          <Widget
            label="Annonces"
            value={stats.annonces.total}
            detail={`+${stats.annonces.new_24h} sur 24h`}
            link="/admin#annonces"
          />
          <Widget
            label="Baux actifs"
            value={stats.baux.actifs}
            detail={`+${stats.baux.signed_month} ce mois`}
            link="/admin#baux"
          />
          <Widget
            label="Bug reports"
            value={stats.bugs.open_total}
            tone={(stats.bugs.by_severity.critical || 0) > 0 ? "err" : (stats.bugs.by_severity.major || 0) > 0 ? "warn" : "neutral"}
            detail={Object.entries(stats.bugs.by_severity).map(([k, v]) => `${v} ${k}`).join(" · ") || "Aucun bug ouvert"}
            link="/admin/bugs"
          />
          <Widget
            label="Crons 24h"
            value={`${stats.crons.success}/${stats.crons.runs_24h}`}
            tone={stats.crons.failure === 0 ? "success" : "warn"}
            detail={stats.crons.failure > 0 ? `${stats.crons.failure} fails` : "Tous OK"}
            link="/admin/operations#crons"
          />
          <Widget
            label="Incidents ouverts"
            value={stats.incidents.total}
            tone={stats.incidents.total === 0 ? "success" : "warn"}
            detail={stats.incidents.total === 0 ? "Aucun" : "À traiter"}
            link="/admin/health"
          />
        </div>
      ) : (
        <div style={{ padding: 32, textAlign: "center", color: "#b91c1c", fontSize: 14 }}>Échec chargement stats.</div>
      )}

      {/* V97.27 P3-5.B.1 — Funnel de conversion locataires */}
      <FunnelChart />

      {/* V97.29 P3-5.B.2 — Inscriptions par jour 30 jours */}
      <SignupsChart />
    </section>
  )
}

// ─── V97.27 P3-5.B.1 — Funnel de conversion ─────────────────────────────────

interface FunnelStep {
  key: string
  label: string
  count: number
  pct_of_total: number
  pct_of_prev: number | null
}

function FunnelChart() {
  const [steps, setSteps] = useState<FunnelStep[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetch("/api/admin/funnel", { cache: "no-store" })
      .then(r => r.json())
      .then(j => {
        if (alive && j.ok) {
          setSteps(j.steps as FunnelStep[])
          setLoading(false)
        }
      })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const maxCount = steps ? Math.max(...steps.map(s => s.count), 1) : 1

  return (
    <div style={{ marginTop: 28 }}>
      <header style={{ marginBottom: 14 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: 1.4, margin: 0 }}>
          Funnel de conversion · Locataires
        </p>
        <h2 style={{ fontFamily: "var(--font-fraunces), 'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: "4px 0 0", color: km.ink }}>
          De l&apos;inscription au bail signé
        </h2>
      </header>

      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: km.muted, fontSize: 13 }}>Calcul du funnel…</div>
      ) : !steps ? (
        <div style={{ padding: 24, textAlign: "center", color: "#b91c1c", fontSize: 13 }}>Échec chargement funnel.</div>
      ) : (
        <div style={{ background: "white", border: `1px solid ${km.line}`, borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          {steps.map((step, idx) => {
            const widthPct = (step.count / maxCount) * 100
            const isFirst = idx === 0
            return (
              <div key={step.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: km.ink, fontFamily: "inherit" }}>
                    {idx + 1}. {step.label}
                  </span>
                  <span style={{ fontSize: 11, color: km.muted, fontVariantNumeric: "tabular-nums" }}>
                    <strong style={{ color: km.ink, fontWeight: 700, fontSize: 14 }}>{step.count.toLocaleString("fr-FR")}</strong>
                    <span style={{ marginLeft: 8 }}>· {step.pct_of_total}% du total</span>
                    {!isFirst && step.pct_of_prev !== null && (
                      <span style={{ marginLeft: 8, color: step.pct_of_prev >= 50 ? "#15803d" : step.pct_of_prev >= 25 ? "#a16207" : "#b91c1c" }}>
                        · {step.pct_of_prev}% de l&apos;étape précédente
                      </span>
                    )}
                  </span>
                </div>
                <div style={{ width: "100%", height: 28, background: km.beige, borderRadius: 6, overflow: "hidden", position: "relative" }}>
                  <div style={{
                    height: "100%",
                    width: `${widthPct}%`,
                    background: km.ink,
                    transition: "width 320ms ease-out",
                    minWidth: step.count > 0 ? 2 : 0,
                  }} />
                </div>
              </div>
            )
          })}
          <p style={{ fontSize: 11, color: km.muted, marginTop: 8, marginBottom: 0, lineHeight: 1.5 }}>
            Funnel calculé en temps réel. Les visiteurs anonymes (non inscrits) ne sont pas trackés — pour les inclure, brancher Plausible ou Umami.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── V97.29 P3-5.B.2 — Inscriptions par jour 30 jours ───────────────────────

interface SignupDay {
  date: string
  count: number
  dow: number
}

function SignupsChart() {
  const [days, setDays] = useState<SignupDay[] | null>(null)
  const [total, setTotal] = useState(0)
  const [peak, setPeak] = useState(0)
  const [avg, setAvg] = useState(0)
  const [loading, setLoading] = useState(true)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    fetch("/api/admin/signups-trend", { cache: "no-store" })
      .then(r => r.json())
      .then(j => {
        if (!alive || !j.ok) { if (alive) setLoading(false); return }
        setDays(j.days)
        setTotal(j.total)
        setPeak(j.peak)
        setAvg(j.avg_per_day)
        setLoading(false)
      })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return (
    <div style={{ marginTop: 28 }}>
      <header style={{ marginBottom: 14 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: 1.4, margin: 0 }}>
          Inscriptions · 30 derniers jours
        </p>
        <h2 style={{ fontFamily: "var(--font-fraunces), 'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: "4px 0 0", color: km.ink }}>
          Croissance utilisateurs
        </h2>
      </header>

      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: km.muted, fontSize: 13 }}>Chargement…</div>
      ) : !days ? (
        <div style={{ padding: 24, textAlign: "center", color: "#b91c1c", fontSize: 13 }}>Échec chargement</div>
      ) : (
        <div style={{ background: "white", border: `1px solid ${km.line}`, borderRadius: 16, padding: 18 }}>
          {/* Stats top */}
          <div style={{ display: "flex", gap: 24, marginBottom: 16, flexWrap: "wrap", fontVariantNumeric: "tabular-nums" }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: 1.2 }}>Total 30j</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: km.ink, fontFamily: "var(--font-fraunces), 'Fraunces', serif", fontStyle: "italic", lineHeight: 1, marginTop: 4 }}>{total}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: 1.2 }}>Moy/jour</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: km.ink, fontFamily: "var(--font-fraunces), 'Fraunces', serif", fontStyle: "italic", lineHeight: 1, marginTop: 4 }}>{avg}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: 1.2 }}>Pic / jour</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: km.ink, fontFamily: "var(--font-fraunces), 'Fraunces', serif", fontStyle: "italic", lineHeight: 1, marginTop: 4 }}>{peak}</div>
            </div>
          </div>

          {/* Bar chart */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120, position: "relative" }}>
            {days.map((d, i) => {
              const isWeekend = d.dow === 0 || d.dow === 6
              const h = peak > 0 ? (d.count / peak) * 100 : 0
              const isHovered = hoverIdx === i
              return (
                <div
                  key={d.date}
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                  style={{
                    flex: 1,
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    cursor: "pointer",
                    position: "relative",
                  }}
                >
                  <div style={{
                    height: `${Math.max(h, d.count > 0 ? 2 : 0)}%`,
                    background: isHovered ? km.ink : (isWeekend ? "#8a8477" : "#111"),
                    opacity: isHovered ? 1 : (d.count === 0 ? 0.15 : (isWeekend ? 0.5 : 0.85)),
                    borderRadius: "3px 3px 0 0",
                    transition: "background 140ms, opacity 140ms",
                    minHeight: d.count > 0 ? 2 : 0,
                  }} />
                  {/* Tooltip */}
                  {isHovered && (
                    <div style={{
                      position: "absolute",
                      bottom: "calc(100% + 6px)",
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: km.ink,
                      color: "white",
                      padding: "5px 10px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      zIndex: 10,
                      pointerEvents: "none",
                    }}>
                      {new Date(d.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} · {d.count}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Axis dates : J-30, J-15, today */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10, color: km.muted, fontVariantNumeric: "tabular-nums" }}>
            <span>{new Date(days[0].date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
            <span>{new Date(days[Math.floor(days.length / 2)].date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
            <span>{new Date(days[days.length - 1].date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
          </div>

          <p style={{ fontSize: 11, color: km.muted, marginTop: 14, marginBottom: 0, lineHeight: 1.5 }}>
            Barres plus claires = week-end. Hover pour voir la valeur exacte par jour.
          </p>
        </div>
      )}
    </div>
  )
}

const actionStyle: React.CSSProperties = {
  background: "white",
  border: `1px solid ${km.line}`,
  color: km.ink,
  padding: "8px 16px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  textDecoration: "none",
  cursor: "pointer",
  fontFamily: "inherit",
  display: "inline-flex", alignItems: "center", gap: 6,
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button onClick={onClick} style={actionStyle}>{label}</button>
}

function Widget({ label, value, detail, tone = "neutral", link }: {
  label: string
  value: string | number
  detail?: string
  tone?: "neutral" | "success" | "warn" | "err"
  link?: string
}) {
  const toneColor = tone === "success" ? "#15803d" : tone === "warn" ? "#a16207" : tone === "err" ? "#b91c1c" : km.ink
  const content = (
    <div style={{
      background: "white",
      border: `1px solid ${km.line}`,
      borderRadius: 16,
      padding: 16,
      transition: "border-color 140ms, transform 140ms",
      cursor: link ? "pointer" : "default",
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = km.ink }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = km.line }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: 1.4, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{
        fontSize: 30, fontWeight: 700, color: toneColor, lineHeight: 1,
        fontFamily: "var(--font-fraunces), 'Fraunces', serif", fontStyle: "italic",
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
      {detail && (
        <div style={{ fontSize: 11.5, color: km.muted, marginTop: 8, lineHeight: 1.4 }}>
          {detail}
        </div>
      )}
    </div>
  )
  if (link) return <Link href={link} style={{ textDecoration: "none" }}>{content}</Link>
  return content
}
