import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,

  /**
   * Filtre PII — strip les clés sensibles des requêtes avant envoi à Sentry.
   * Sans ça, les mots de passe, tokens, clés secrètes peuvent être loggés.
   */
  beforeSend(event) {
    // Headers sensibles
    if (event.request?.headers) {
      const h = event.request.headers as Record<string, unknown>
      delete h.authorization
      delete h.cookie
      delete h["x-api-key"]
      delete h["x-auth-token"]
    }

    // Body JSON : remplace les valeurs sensibles par [Filtered]
    if (event.request?.data && typeof event.request.data === "object") {
      const sensitiveKeys = [
        "password", "currentPassword", "newPassword", "confirmPassword",
        "token", "access_token", "refresh_token",
        "secret", "api_key", "apiKey",
        "supabase_service_role_key",
        "email_verify_token", "reset_password_token",
      ]
      const data = event.request.data as Record<string, unknown>
      for (const k of Object.keys(data)) {
        if (sensitiveKeys.some(s => k.toLowerCase().includes(s.toLowerCase()))) {
          data[k] = "[Filtered]"
        }
      }
    }

    return event
  },
})
