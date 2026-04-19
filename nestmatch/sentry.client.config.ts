import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Tracing : 10% des requêtes samplées. Augmenter si debug actif, diminuer si quota atteint.
  tracesSampleRate: 0.1,

  // Session replay : désactivé (consomme des events, activable si besoin debug).
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  environment: process.env.NODE_ENV,

  // Erreurs non-utiles à filtrer (bruit navigateur).
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    "Network request failed",
    "NetworkError when attempting to fetch resource",
    "The request was aborted",
    "AbortError: The user aborted a request",
    /Non-Error promise rejection captured/,
    /Load failed/,
  ],
})
