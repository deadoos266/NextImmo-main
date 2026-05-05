/**
 * V66.3 — Logger structuré pour les routes API (Vercel logs).
 *
 * Format JSON one-line par log → grep facile dans Vercel logs ET parsable
 * par des collecteurs externes (Datadog, BetterStack, Logflare, Sentry, etc.).
 *
 * Usage typique dans une route :
 *
 *   import { createLogger } from "@/lib/logger"
 *
 *   export async function POST(req: NextRequest) {
 *     const log = createLogger({ route: "/api/messages", method: "POST" })
 *     try {
 *       const session = await getServerSession(authOptions)
 *       log.bind({ user_email: session?.user?.email ?? null })
 *       // ... logique ...
 *       log.info("message inserted", { messageId: data.id })
 *       return NextResponse.json({ ok: true })
 *     } catch (e) {
 *       log.error("insert failed", { error: e instanceof Error ? e.message : String(e) })
 *       return NextResponse.json({ ok: false }, { status: 500 })
 *     } finally {
 *       log.done()
 *     }
 *   }
 *
 * Output (stdout, parsable JSON) :
 *   {"ts":"2026-05-04T15:30:00.123Z","level":"info","route":"/api/messages",
 *    "method":"POST","request_id":"a1b2c3d4-...","duration_ms":42,
 *    "user_email":"foo@bar.fr","msg":"message inserted","messageId":99}
 *
 * Pour activer Sentry plus tard, il suffira d'ajouter dans `error()` :
 *   if (typeof Sentry !== "undefined") Sentry.captureException(...)
 */

type Level = "debug" | "info" | "warn" | "error"

interface LogContext {
  route?: string
  method?: string
  user_email?: string | null
  request_id?: string
  [key: string]: unknown
}

interface Logger {
  /** Ajoute des champs au contexte de cette instance (mutating). */
  bind: (extra: Record<string, unknown>) => void
  debug: (msg: string, extra?: Record<string, unknown>) => void
  info: (msg: string, extra?: Record<string, unknown>) => void
  warn: (msg: string, extra?: Record<string, unknown>) => void
  error: (msg: string, extra?: Record<string, unknown>) => void
  /** Logue la durée totale depuis création + status_code optionnel. */
  done: (status_code?: number) => void
}

function uuid(): string {
  // crypto.randomUUID() est dispo dans tous les runtimes modernes
  // (Node 14.17+, Edge runtime). Fallback minimal sinon.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function emit(level: Level, ctx: LogContext, msg: string, extra?: Record<string, unknown>): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...ctx,
    ...(extra ?? {}),
  }
  // JSON.stringify en une ligne pour faciliter le parsing.
  // Catch erreurs sérialisation (références circulaires) — fallback msg simple.
  let line: string
  try {
    line = JSON.stringify(payload)
  } catch {
    line = JSON.stringify({ ts: payload.ts, level, msg, error: "serialization_failed" })
  }
  if (level === "error") {
    console.error(line)
  } else if (level === "warn") {
    console.warn(line)
  } else {
    console.log(line)
  }
}

export function createLogger(initial: LogContext = {}): Logger {
  const ctx: LogContext = {
    request_id: uuid(),
    ...initial,
  }
  const startedAt = Date.now()

  return {
    bind: (extra) => {
      Object.assign(ctx, extra)
    },
    debug: (msg, extra) => emit("debug", ctx, msg, extra),
    info: (msg, extra) => emit("info", ctx, msg, extra),
    warn: (msg, extra) => emit("warn", ctx, msg, extra),
    error: (msg, extra) => emit("error", ctx, msg, extra),
    done: (status_code) => {
      const duration_ms = Date.now() - startedAt
      emit("info", ctx, "request done", { duration_ms, status_code })
    },
  }
}
