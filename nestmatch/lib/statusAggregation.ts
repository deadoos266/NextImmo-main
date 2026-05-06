// Helpers serveur — agrégations health_pings pour /status et /admin/health.
//
// Lecture via supabaseAdmin (service-role) car la table health_pings est
// REVOKE pour anon (Phase 5 RLS). Les helpers retournent des structures
// simples consommables par les RSC sans round-trip supplémentaire.

import { supabaseAdmin } from "./supabase-server"

export const SERVICES = ["database", "auth", "email", "storage", "crons", "app"] as const
export type ServiceName = (typeof SERVICES)[number]
export type PingStatus = "up" | "degraded" | "down"

export interface ServiceUptime {
  service: ServiceName
  lastStatus: PingStatus | "unknown"
  lastLatencyMs: number | null
  lastError: string | null
  lastCheckedAt: string | null
  uptime7d: number | null   // pourcentage 0-100, null si aucun ping 7j
  uptime30d: number | null
}

export interface DayCell {
  date: string             // YYYY-MM-DD
  status: PingStatus | "no-data"
  pingCount: number
}

export interface IncidentRow {
  id: string
  title: string
  description: string | null
  severity: "info" | "minor" | "major" | "critical"
  status: "investigating" | "identified" | "monitoring" | "resolved"
  service: ServiceName
  is_public: boolean
  started_at: string
  resolved_at: string | null
}

interface PingRow {
  service: string
  status: string
  latency_ms: number | null
  error_message: string | null
  checked_at: string
}

function pctUp(rows: PingRow[]): number | null {
  if (rows.length === 0) return null
  const upish = rows.filter(r => r.status === "up").length
  return Math.round((upish / rows.length) * 1000) / 10
}

/**
 * Charge l'état courant + uptime 7j/30j de chaque service. Retourne un
 * tableau ordonné par SERVICES. Si la table health_pings n'existe pas
 * encore (mig 063 non appliquée), retourne des entrées 'unknown' pour
 * que la page /status reste fonctionnelle.
 */
export async function fetchServicesUptime(): Promise<ServiceUptime[]> {
  const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()

  let pings: PingRow[] = []
  try {
    const { data } = await supabaseAdmin
      .from("health_pings")
      .select("service, status, latency_ms, error_message, checked_at")
      .gte("checked_at", since30d)
      .order("checked_at", { ascending: false })
      .limit(5000)
    pings = (data || []) as PingRow[]
  } catch {
    pings = []
  }

  const since7d = Date.now() - 7 * 24 * 3600 * 1000

  return SERVICES.map(service => {
    const ofService = pings.filter(p => p.service === service)
    const last = ofService[0] || null
    const last7d = ofService.filter(p => new Date(p.checked_at).getTime() >= since7d)

    return {
      service,
      lastStatus: (last ? last.status : "unknown") as ServiceUptime["lastStatus"],
      lastLatencyMs: last?.latency_ms ?? null,
      lastError: last?.error_message ?? null,
      lastCheckedAt: last?.checked_at ?? null,
      uptime7d: pctUp(last7d),
      uptime30d: pctUp(ofService),
    }
  })
}

/**
 * Pour chaque service, retourne 30 cellules (1 par jour, du plus ancien
 * au plus récent). Status = 'down' si au moins un ping down ce jour-là,
 * 'degraded' si au moins un degraded, 'up' sinon, 'no-data' si aucun ping.
 */
export async function fetchTimeline30d(): Promise<Record<ServiceName, DayCell[]>> {
  const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()

  let pings: PingRow[] = []
  try {
    const { data } = await supabaseAdmin
      .from("health_pings")
      .select("service, status, checked_at")
      .gte("checked_at", since30d)
      .limit(20000)
    pings = (data || []) as PingRow[]
  } catch {
    pings = []
  }

  const days: string[] = []
  const today = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 3600 * 1000)
    days.push(d.toISOString().slice(0, 10))
  }

  const out: Record<ServiceName, DayCell[]> = {} as Record<ServiceName, DayCell[]>
  for (const svc of SERVICES) {
    out[svc] = days.map(date => ({ date, status: "no-data" as const, pingCount: 0 }))
  }

  for (const p of pings) {
    const date = p.checked_at.slice(0, 10)
    const svc = p.service as ServiceName
    if (!SERVICES.includes(svc)) continue
    const cell = out[svc].find(c => c.date === date)
    if (!cell) continue
    cell.pingCount += 1
    if (p.status === "down") cell.status = "down"
    else if (p.status === "degraded" && cell.status !== "down") cell.status = "degraded"
    else if (cell.status === "no-data") cell.status = "up"
  }

  return out
}

/**
 * Incidents en cours (status != 'resolved') visibles publiquement
 * (is_public = true) ou tous selon le scope.
 */
export async function fetchIncidents({ scope }: { scope: "public" | "all" }): Promise<IncidentRow[]> {
  try {
    let q = supabaseAdmin
      .from("incidents")
      .select("id, title, description, severity, status, service, is_public, started_at, resolved_at")
      .neq("status", "resolved")
      .order("started_at", { ascending: false })
      .limit(50)
    if (scope === "public") {
      q = q.eq("is_public", true)
    }
    const { data } = await q
    return (data || []) as IncidentRow[]
  } catch {
    return []
  }
}
