/**
 * V64 — GET /api/health
 *
 * Endpoint de healthcheck public pour monitoring uptime externe
 * (UptimeRobot, BetterStack, Pingdom). Pas d'auth, pas de body.
 *
 * Vérifie en parallèle :
 *   1. Supabase (ping SELECT 1 sur la table `annonces` head-only)
 *   2. Variables d'environnement critiques présentes
 *
 * Retour :
 *   - 200 OK avec { status: "ok", services: { supabase: "ok", env: "ok" } }
 *   - 503 si un service est down avec { status: "degraded", services: {...} }
 *
 * On NE met PAS Resend dans le check actif : un ping vers leur API
 * coûterait des credits emails. Si Resend est down, les emails échouent
 * silencieusement côté Sentry (déjà loggé).
 *
 * Pas de rate-limit : c'est un healthcheck, design pour être pingé toutes
 * les 1-5 minutes par un service externe.
 *
 * NB Vercel : pas besoin d'ajouter ce path dans `vercel.json` crons (ce
 * n'est pas un cron Vercel). UptimeRobot ping directement la route publique.
 */

import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
// Pas de cache — on veut un check live à chaque ping.
export const dynamic = "force-dynamic"

interface ServiceStatus {
  status: "ok" | "down"
  latency_ms?: number
  error?: string
}

interface HealthReport {
  status: "ok" | "degraded"
  timestamp: string
  uptime_check: true
  services: Record<string, ServiceStatus>
}

async function checkSupabase(): Promise<ServiceStatus> {
  const t0 = performance.now()
  try {
    const { error } = await supabaseAdmin
      .from("annonces")
      .select("id", { count: "exact", head: true })
      .limit(1)
    const latency = Math.round(performance.now() - t0)
    if (error) {
      return { status: "down", latency_ms: latency, error: error.message }
    }
    return { status: "ok", latency_ms: latency }
  } catch (e) {
    return {
      status: "down",
      latency_ms: Math.round(performance.now() - t0),
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

function checkEnv(): ServiceStatus {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXTAUTH_SECRET",
  ]
  const missing = required.filter(k => !process.env[k])
  if (missing.length > 0) {
    return { status: "down", error: `Variables manquantes : ${missing.join(", ")}` }
  }
  return { status: "ok" }
}

export async function GET() {
  const [supabase, env] = await Promise.all([
    checkSupabase(),
    Promise.resolve(checkEnv()),
  ])

  const services = { supabase, env }
  const allOk = Object.values(services).every(s => s.status === "ok")

  const report: HealthReport = {
    status: allOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    uptime_check: true,
    services,
  }

  return NextResponse.json(report, {
    status: allOk ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  })
}
