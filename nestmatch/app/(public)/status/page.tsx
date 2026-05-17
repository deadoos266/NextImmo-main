import { fetchIncidents, fetchServicesUptime, fetchTimeline30d, SERVICES, type ServiceName } from "../../../lib/statusAggregation"
import StatusAutoRefresh from "./StatusAutoRefresh"

/**
 * V71.5 — /status (publique).
 *
 * Page d'état des services KeyMatch, accessible sans login. Affiche :
 *   1. Cards par service (DB, Auth, Email, Storage, Crons) avec ✅/⚠️/❌
 *      + uptime 7j et 30j calculés depuis health_pings.
 *   2. Incidents en cours visibles publiquement.
 *   3. Timeline 30 jours grid 30×N (1 case par jour par service).
 *   4. Liens utiles (status URL, contact incident, sous-pages /status — V72).
 *
 * RSC pour SEO + first paint rapide. Sous-composant StatusAutoRefresh
 * (client) recharge la page toutes les 60s.
 *
 * Cohérent avec V71.0 — tant que SITE_INDEXABLE=false la page reçoit
 * automatiquement noindex via app/layout.tsx.
 */

export const metadata = {
  title: "État des services — KeyMatch",
  description: "Disponibilité en temps réel des services KeyMatch (base de données, authentification, emails, stockage, tâches automatiques).",
  alternates: { canonical: "/status" },
}

export const revalidate = 60

const SERVICE_LABEL: Record<ServiceName, string> = {
  database: "Base de données",
  auth: "Authentification",
  email: "Emails (Resend)",
  storage: "Stockage fichiers",
  crons: "Tâches automatiques",
  app: "Application",
  fetcher: "Service d'extraction",
}

const SEVERITY_LABEL: Record<string, string> = {
  info: "Info",
  minor: "Mineur",
  major: "Majeur",
  critical: "Critique",
}

const STATUS_LABEL: Record<string, string> = {
  investigating: "Investigation",
  identified: "Identifié",
  monitoring: "Surveillance",
  resolved: "Résolu",
}

function pillFor(status: "up" | "degraded" | "down" | "unknown"): { bg: string; fg: string; label: string } {
  if (status === "up") return { bg: "#E5F4EB", fg: "#0A6B3F", label: "✅ Opérationnel" }
  if (status === "degraded") return { bg: "#FCEFD7", fg: "#7A4A00", label: "⚠️ Dégradé" }
  if (status === "down") return { bg: "#F7DEDA", fg: "#84190E", label: "❌ Indisponible" }
  return { bg: "#EAE6DF", fg: "#5a5247", label: "— Aucune donnée" }
}

function dayCellColor(status: "up" | "degraded" | "down" | "no-data"): string {
  if (status === "up") return "#9DD8B6"
  if (status === "degraded") return "#F7C77A"
  if (status === "down") return "#E59487"
  return "#EAE6DF"
}

export default async function StatusPage() {
  const [services, incidents, timeline] = await Promise.all([
    fetchServicesUptime(),
    fetchIncidents({ scope: "public" }),
    fetchTimeline30d(),
  ])

  const globalStatus = (() => {
    if (services.some(s => s.lastStatus === "down")) return "down" as const
    if (services.some(s => s.lastStatus === "degraded")) return "degraded" as const
    if (services.every(s => s.lastStatus === "unknown")) return "unknown" as const
    return "up" as const
  })()

  const globalPill = pillFor(globalStatus)
  const lastUpdated = services
    .map(s => s.lastCheckedAt)
    .filter((s): s is string => Boolean(s))
    .sort()
    .reverse()[0] || null

  const cardStyle: React.CSSProperties = {
    background: "white",
    borderRadius: 20,
    border: "1px solid #EAE6DF",
    padding: 24,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  }

  return (
    <main style={{ background: "#F7F4EF", minHeight: "100vh", padding: "48px 16px 96px", fontFamily: "'DM Sans', sans-serif", color: "#111" }}>
      <StatusAutoRefresh intervalMs={60000} />

      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        {/* En-tête */}
        <header style={{ marginBottom: 32 }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, color: "#8a8477", margin: "0 0 8px", textTransform: "uppercase" }}>
            État des services
          </p>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 56, lineHeight: 1.05, margin: "0 0 16px" }}>
            {globalStatus === "up" ? "Tout va bien." : globalStatus === "down" ? "Incident en cours." : globalStatus === "degraded" ? "Service partiellement dégradé." : "Données non disponibles."}
          </h1>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 12, padding: "8px 16px", borderRadius: 999, background: globalPill.bg, color: globalPill.fg, fontWeight: 700, fontSize: 14 }}>
            {globalPill.label}
          </div>
          {lastUpdated && (
            <p style={{ marginTop: 12, fontSize: 13, color: "#8a8477" }}>
              Dernière vérification : {new Date(lastUpdated).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })} · auto-refresh toutes les 60 s
            </p>
          )}
        </header>

        {/* Section incidents en cours */}
        {incidents.length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 16px" }}>Incidents en cours</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {incidents.map(inc => (
                <article key={inc.id} style={{ ...cardStyle, padding: 20 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                    <span style={{ padding: "2px 10px", borderRadius: 999, background: inc.severity === "critical" ? "#F7DEDA" : inc.severity === "major" ? "#FCEFD7" : "#EAE6DF", color: "#111", fontSize: 12, fontWeight: 700 }}>
                      {SEVERITY_LABEL[inc.severity] || inc.severity}
                    </span>
                    <span style={{ padding: "2px 10px", borderRadius: 999, background: "#F7F4EF", color: "#5a5247", fontSize: 12, fontWeight: 600 }}>
                      {SERVICE_LABEL[inc.service]} · {STATUS_LABEL[inc.status] || inc.status}
                    </span>
                  </div>
                  <p style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>{inc.title}</p>
                  {inc.description && <p style={{ fontSize: 14, color: "#5a5247", margin: "0 0 8px", lineHeight: 1.5 }}>{inc.description}</p>}
                  <p style={{ fontSize: 12, color: "#8a8477", margin: 0 }}>
                    Détecté le {new Date(inc.started_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Cards services */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 16px" }}>Services</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
            {services.map(s => {
              const pill = pillFor(s.lastStatus)
              return (
                <article key={s.service} style={cardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{SERVICE_LABEL[s.service]}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: pill.fg, background: pill.bg, padding: "2px 8px", borderRadius: 999 }}>
                      {pill.label}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#8a8477", textTransform: "uppercase", letterSpacing: 0.5 }}>Uptime 7j</div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{s.uptime7d == null ? "—" : `${s.uptime7d.toFixed(1)} %`}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#8a8477", textTransform: "uppercase", letterSpacing: 0.5 }}>Uptime 30j</div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{s.uptime30d == null ? "—" : `${s.uptime30d.toFixed(1)} %`}</div>
                    </div>
                  </div>
                  {s.lastLatencyMs != null && (
                    <p style={{ fontSize: 12, color: "#8a8477", margin: 0 }}>Dernière latence : {s.lastLatencyMs} ms</p>
                  )}
                </article>
              )
            })}
          </div>
        </section>

        {/* Timeline 30j */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 16px" }}>30 derniers jours</h2>
          <div style={cardStyle}>
            {SERVICES.map(svc => {
              const cells = timeline[svc] || []
              return (
                <div key={svc} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{SERVICE_LABEL[svc]}</span>
                    <span style={{ fontSize: 11, color: "#8a8477" }}>30j ← {cells[0]?.date} · aujourd&apos;hui →</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(30, 1fr)", gap: 3 }}>
                    {cells.map(cell => (
                      <div
                        key={`${svc}-${cell.date}`}
                        title={`${cell.date} — ${cell.status === "no-data" ? "Aucune donnée" : cell.status}${cell.pingCount > 0 ? ` (${cell.pingCount} ping)` : ""}`}
                        style={{
                          height: 22,
                          borderRadius: 4,
                          background: dayCellColor(cell.status),
                          opacity: cell.status === "no-data" ? 0.5 : 1,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
            <div style={{ display: "flex", gap: 12, marginTop: 12, fontSize: 11, color: "#8a8477", flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: dayCellColor("up") }} /> Opérationnel</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: dayCellColor("degraded") }} /> Dégradé</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: dayCellColor("down") }} /> Indisponible</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: dayCellColor("no-data"), opacity: 0.5 }} /> Aucune donnée</span>
            </div>
          </div>
        </section>

        {/* Liens utiles */}
        <section>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 16px" }}>Liens utiles</h2>
          <div style={{ ...cardStyle, padding: 20 }}>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
              <li>📡 Cette page : <a href="/status" style={{ color: "#111", textDecoration: "underline", textUnderlineOffset: 2 }}>keymatch-immo.fr/status</a></li>
              <li>📨 Signaler un incident : <a href="mailto:contact@keymatch-immo.fr" style={{ color: "#111", textDecoration: "underline", textUnderlineOffset: 2 }}>contact@keymatch-immo.fr</a></li>
              <li>🩺 API healthcheck JSON : <a href="/api/health" style={{ color: "#111", textDecoration: "underline", textUnderlineOffset: 2 }}>/api/health</a></li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  )
}
