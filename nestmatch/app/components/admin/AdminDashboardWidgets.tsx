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
    </section>
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
