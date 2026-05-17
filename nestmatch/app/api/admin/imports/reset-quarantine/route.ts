/**
 * V97.39.7 — POST /api/admin/imports/reset-quarantine
 *
 * Force le reset du cache mémoire de quarantaine côté fetcher-router.
 *
 * Utile si DataDome a assoupli sa politique et que tu veux re-tester
 * le worker tout de suite sans attendre l'expiration naturelle (1h
 * de fenêtre glissante + 5min de cache).
 *
 * Note : ce reset ne supprime PAS les logs `import_logs`. Il invalide
 * juste le cache mémoire. Au prochain import, `isParserQuarantined` re-query
 * Supabase et reverra peut-être 5+ échecs récents → re-quarantine.
 * Pour une "vraie" levée de quarantaine, faut soit attendre 1h, soit
 * faire un fetch réussi qui contredit les échecs.
 *
 * Auth : admin requis (NextAuth session avec user.isAdmin).
 */

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { clearQuarantineCache } from "@/lib/import/fetcher-router"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST() {
  const session = await getServerSession(authOptions)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!session || !(session as any).user?.isAdmin) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }

  clearQuarantineCache()

  return NextResponse.json({
    ok: true,
    message: "Cache quarantaine vidé. Au prochain import, le worker sera retenté.",
    timestamp: new Date().toISOString(),
  })
}
