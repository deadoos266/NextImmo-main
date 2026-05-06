import { fetchIncidents, fetchServicesUptime, fetchTimeline30d, SERVICES, type ServiceName } from "../../../lib/statusAggregation"
import { supabaseAdmin } from "../../../lib/supabase-server"
import HealthAdminClient from "./HealthAdminClient"

/**
 * V71.6 — /admin/health (interne, admin only).
 *
 * Layout admin (app/admin/layout.tsx) gère déjà l'auth — redirect /auth si
 * pas de session, redirect / si pas admin. Pas besoin de re-checker ici.
 *
 * Sections :
 *  1. Services en détail — pour chaque service, latency live + last 10 pings
 *  2. Tous incidents (publics + privés) avec bouton resolve
 *  3. Métriques live (nb users, annonces, messages 24h, crons 24h)
 *  4. Bouton "Re-check now" qui POST /api/health/full?force=true
 *  5. Bouton "Créer incident manuel" qui POST /api/admin/incidents/create
 *
 * RSC fetche les données initiales, HealthAdminClient gère interactions.
 */

export const metadata = {
  title: "Health admin — KeyMatch",
  description: "Tableau de bord interne — état des services, incidents, métriques live.",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

const SERVICE_LABEL: Record<ServiceName, string> = {
  database: "Base de données",
  auth: "Authentification",
  email: "Emails (Resend)",
  storage: "Stockage fichiers",
  crons: "Tâches automatiques",
  app: "Application",
}

interface PingRow {
  id: number
  service: string
  status: string
  latency_ms: number | null
  error_message: string | null
  checked_at: string
}

async function fetchRecentPings(): Promise<Record<ServiceName, PingRow[]>> {
  const out: Record<ServiceName, PingRow[]> = {} as Record<ServiceName, PingRow[]>
  for (const svc of SERVICES) out[svc] = []
  try {
    const { data } = await supabaseAdmin
      .from("health_pings")
      .select("id, service, status, latency_ms, error_message, checked_at")
      .order("checked_at", { ascending: false })
      .limit(60)
    for (const p of (data || []) as PingRow[]) {
      const svc = p.service as ServiceName
      if (!SERVICES.includes(svc)) continue
      if (out[svc].length < 10) out[svc].push(p)
    }
  } catch {
    // Tables absentes : on retourne des arrays vides.
  }
  return out
}

async function fetchLiveMetrics(): Promise<{
  users: number | null
  annoncesActives: number | null
  messages24h: number | null
}> {
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  try {
    const [usersRes, annoncesRes, messagesRes] = await Promise.all([
      supabaseAdmin.from("users").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("annonces")
        .select("id", { count: "exact", head: true })
        .or("statut.is.null,statut.eq.disponible")
        .eq("is_test", false),
      supabaseAdmin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since24h),
    ])
    return {
      users: usersRes.count ?? null,
      annoncesActives: annoncesRes.count ?? null,
      messages24h: messagesRes.count ?? null,
    }
  } catch {
    return { users: null, annoncesActives: null, messages24h: null }
  }
}

export default async function HealthAdminPage() {
  const [services, allIncidents, recentPings, timeline, metrics] = await Promise.all([
    fetchServicesUptime(),
    fetchIncidents({ scope: "all" }),
    fetchRecentPings(),
    fetchTimeline30d(),
    fetchLiveMetrics(),
  ])

  return (
    <main style={{ background: "#F7F4EF", minHeight: "100vh", padding: "32px 16px 96px", fontFamily: "'DM Sans', sans-serif", color: "#111" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, color: "#8a8477", margin: "0 0 8px", textTransform: "uppercase" }}>
            Admin · Interne
          </p>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 44, lineHeight: 1.1, margin: 0 }}>
            Health admin
          </h1>
          <p style={{ fontSize: 14, color: "#5a5247", marginTop: 8 }}>
            Vue interne tous services. Voir <a href="/status" style={{ color: "#111", textDecoration: "underline", textUnderlineOffset: 2 }}>/status</a> pour la version publique.
          </p>
        </header>

        <HealthAdminClient
          services={services}
          incidents={allIncidents}
          recentPings={recentPings}
          timeline={timeline}
          metrics={metrics}
          serviceLabels={SERVICE_LABEL}
        />
      </div>
    </main>
  )
}
