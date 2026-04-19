/**
 * Hook Next.js 15 — init des instrumentations serveur/edge.
 * Sentry SDK utilise ce fichier pour brancher la capture d'erreurs côté
 * API routes, Server Components et Middleware.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config")
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config")
  }
}

export async function onRequestError(
  err: unknown,
  request: {
    path: string
    method: string
    headers: Record<string, string | string[] | undefined>
  },
  context: {
    routerKind: "Pages Router" | "App Router"
    routePath: string
    routeType: "render" | "route" | "action" | "middleware"
  }
) {
  // Délègue à Sentry pour capter les erreurs de request (App Router spécifique)
  const Sentry = await import("@sentry/nextjs")
  Sentry.captureRequestError(err, request, context)
}
