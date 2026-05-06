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

/**
 * V70.6 — Wrapper handler pour route handler API. Auto-log entrée + sortie.
 *
 * Usage :
 *   export const POST = wrapHandler({ route: "/api/foo", method: "POST" },
 *     async (req, log) => {
 *       log.bind({ user_email: ... })
 *       log.info("processing", { ... })
 *       return NextResponse.json({ ok: true })
 *     }
 *   )
 *
 * Le wrapper :
 *   - Crée un logger avec request_id auto + route + method
 *   - Émet log.info("request received") au début
 *   - Si throw : émet log.error + done(500)
 *   - Sinon : émet log.done(response.status) à la fin
 */
// V75.1 — overload pour faire matcher la signature retournée à ce que
// Next.js 15 attend selon le type de route :
//   - Route NON-dynamic (/api/cron/foo)         → (req) => Response
//   - Route dynamic    (/api/users/[id])         → (req, ctx: { params: Promise<TParams> }) => Response
//
// Avant V75.1 : `wrapHandler` retournait toujours `(req, ctx?: {params:unknown})`
// → Next.js inspectait l'export GET, voyait `params: unknown`, jugeait
// invalide pour les 2 patterns, et faisait crasher le build avec :
//   "Type '{ params: unknown; }' is not a valid type for the function's
//    second argument."
// (cassé depuis V69.2b 5 mai → 25 h+ de prod figée).
//
// Maintenant : 2 overloads (sans params / avec params Promise) selon que
// le handler utilise ou non le 3e arg ctx.

type HandlerFnNoParams<TReq> = (req: TReq, log: Logger) => Promise<Response>
type HandlerFnWithParams<TReq, TParams> = (
  req: TReq,
  log: Logger,
  ctx: { params: Promise<TParams> },
) => Promise<Response>

// Overload 1 — handler sans ctx (cron, route plate). Retourne (req) → Response.
export function wrapHandler<TReq extends Request = Request>(
  meta: { route: string; method: string },
  handler: HandlerFnNoParams<TReq>,
): (req: TReq) => Promise<Response>

// Overload 2 — handler avec ctx params (route dynamic Next 15 = Promise).
export function wrapHandler<
  TReq extends Request = Request,
  TParams extends Record<string, string | string[]> = Record<string, string>,
>(
  meta: { route: string; method: string },
  handler: HandlerFnWithParams<TReq, TParams>,
): (req: TReq, ctx: { params: Promise<TParams> }) => Promise<Response>

// Implémentation unique
export function wrapHandler(
  meta: { route: string; method: string },
  handler: (req: Request, log: Logger, ctx?: { params: Promise<unknown> }) => Promise<Response>,
) {
  return async (req: Request, ctx?: { params: Promise<unknown> }): Promise<Response> => {
    const log = createLogger({ route: meta.route, method: meta.method })
    log.info("request received")
    try {
      const res = await handler(req, log, ctx)
      log.done(res.status)
      return res
    } catch (e) {
      log.error("handler threw", {
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      })
      log.done(500)
      throw e
    }
  }
}
