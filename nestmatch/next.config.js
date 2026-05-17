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
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://*.supabase.co https://media.keymatch-immo.fr https://*.tile.openstreetmap.org https://*.tile.openstreetmap.fr https://*.basemaps.cartocdn.com https://server.arcgisonline.com https://tiles.stadiamaps.com https://lh3.googleusercontent.com https://images.unsplash.com https://unpkg.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://media.keymatch-immo.fr wss://ws.keymatch-immo.fr https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io https://*.upstash.io https://geo.api.gouv.fr https://nominatim.openstreetmap.org",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ")

const nextConfig = {
  reactStrictMode: true,

  // V97.39.20 P3 Phase 6 — output: 'standalone' uniquement pour build Docker
  // self-host (VPS OVH). Vercel n'aime pas cette option (peut casser ISR),
  // donc on l'active conditionnellement via NEXT_OUTPUT_STANDALONE=1 dans
  // le Dockerfile. Comportement Vercel inchangé.
  ...(process.env.NEXT_OUTPUT_STANDALONE === "1" ? { output: "standalone" } : {}),

  // V86.1 — Inclut les fichiers YAML scenarios QA Bot dans le bundle des
  // routes API qui les lit (qa/scenarios/*.yaml). Sans ça, en serverless
  // Vercel, process.cwd() ne contient pas qa/scenarios → API retourne
  // 0 scenarios (test bug détecté au run global V86).
  outputFileTracingIncludes: {
    "/api/qa/scenarios": ["./qa/scenarios/**"],
    "/api/cron/qa-daily-run": ["./qa/scenarios/**"],
    "/admin/qa": ["./qa/scenarios/**"],
    // V97.37 — wreq-js (TLS fingerprint impersonation pour bypasser
    // Cloudflare type PAP) embarque un binary natif Rust .node. Sans
    // outputFileTracingIncludes, Vercel ne le bundle pas et l'import
    // échoue runtime. On force l'inclusion uniquement sur la route qui
    // l'utilise pour ne pas alourdir les autres fonctions serverless.
    // ATTENTION : le fichier réel s'appelle `wreq-js.linux-x64-gnu.node`
    // (point après wreq-js, pas tiret). Le glob précédent `*-linux-x64-gnu.node`
    // ne matchait pas → binary absent du bundle → fallback silencieux sur
    // fetch natif → bypass PAP cassé en prod. Maintenant on liste les
    // 2 variantes Linux x64 (glibc + musl) pour couvrir tous les runtimes.
    "/api/proprio/annonce/import": [
      "./node_modules/wreq-js/rust/wreq-js.linux-x64-gnu.node",
      "./node_modules/wreq-js/rust/wreq-js.linux-x64-musl.node",
    ],
  },
  // V97.37 — wreq-js doit être marqué comme external sinon webpack tente
  // de le bundler et casse le require() du binary natif.
  serverExternalPackages: ["wreq-js"],

  images: {
    remotePatterns: [
      // Supabase Storage — wildcard couvre prod + staging
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
      // V97.39.20 — MinIO self-host (Phase 3 plan migration OVH)
      { protocol: "https", hostname: "media.keymatch-immo.fr" },
      // Avatars Google (NextAuth)
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      // Unsplash — utilisé pour les photos des annonces de démo (seed data).
      // Sans ce pattern, /_next/image renvoie 400 sur toutes les URLs
      // images.unsplash.com et les annonces apparaissent sans visuel.
      { protocol: "https", hostname: "images.unsplash.com" },
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
          // V97.33 T6 — CSP passé en enforcing (était Report-Only depuis V71.x).
          // Header `Content-Security-Policy` bloque pour de vrai les ressources
          // non whitelistées. Si une feature casse (ex: chargement script tiers
          // oublié), il faudra ajouter le domaine au CSP_HEADER ci-dessus.
          { key: "Content-Security-Policy", value: CSP_HEADER },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // V71.0 — pre-launch indexing lock : ceinture + bretelles avec
          // robots.txt + meta robots. Retirer ce header au moment du lancement
          // officiel (toggle SITE_INDEXABLE=true dans lib/featureFlags.ts).
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
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
