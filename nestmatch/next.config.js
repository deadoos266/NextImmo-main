/** @type {import('next').NextConfig} */

const { withSentryConfig } = require("@sentry/nextjs")
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
})

// ─── CSP ─────────────────────────────────────────────────────────────────────
// Sources externes autorisées :
// - 'self'                       → assets app
// - *.supabase.co                → Storage images + API REST + Realtime (wss)
// - *.tile.openstreetmap.org     → Leaflet tiles
// - *.basemaps.cartocdn.com      → Leaflet tiles alternatives
// - lh3.googleusercontent.com    → Avatars Google (NextAuth)
// - fonts.gstatic.com            → fallback fonts (next/font cache normalement local)
// - *.ingest.sentry.io           → Sentry ingest (enabled quand Plan Sentry run)
// - *.upstash.io                 → Redis REST (enabled quand Plan rate-limit run)
// - api.anthropic.com            → côté serveur uniquement, pas de besoin CSP client
// Les styles inline du projet (pas de Tailwind runtime) → 'unsafe-inline' obligatoire.
const CSP_HEADER = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://lh3.googleusercontent.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io https://*.upstash.io",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ")

const nextConfig = {
  reactStrictMode: true,

  images: {
    remotePatterns: [
      // Supabase Storage (ajuster le hostname si le projet change)
      { protocol: "https", hostname: "wzzibgdupycysvtwsqxo.supabase.co" },
      // Avatars Google (NextAuth)
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [320, 480, 640, 768, 1024, 1280, 1536],
    imageSizes: [48, 64, 96, 128, 256, 384],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // CSP en report-only d'abord pour éviter de casser la prod. Passer en
          // enforcing (Content-Security-Policy) après 48h sans violation en Sentry.
          { key: "Content-Security-Policy-Report-Only", value: CSP_HEADER },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ]
  },
}

const sentryOpts = {
  // Silence les logs CLI Sentry sauf en CI
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Upload source maps (masqués côté client pour pas exposer le code)
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  // Tunnel Sentry ingest via /monitoring pour contourner les ad-blockers
  tunnelRoute: "/monitoring",
  // Désactive les integrations qui nécessitent une configuration avancée
  automaticVercelMonitors: false,
}

module.exports = withSentryConfig(withBundleAnalyzer(nextConfig), sentryOpts)
