# Dockerfile production Next.js KeyMatch — Phase 6 plan migration OVH.
#
# Multi-stage build :
#  - deps    : npm ci (cache layer)
#  - builder : npm run build avec output: 'standalone'
#  - runner  : image minimaliste (node:22-slim + standalone)
#
# V97.39.30 — Migration node:22-alpine → node:22-slim (Debian) suite au bug
# fetch Supabase via SDK qui timeout 7s sur Alpine (musl libc + TLS keepalive
# incompatible avec @supabase/supabase-js).
# Image size : ~250 MB → ~400 MB (+150 MB acceptable pour stabilité réseau)
#
# Build local :
#   docker build -f tools/next-vps/Dockerfile -t keymatch-next:latest .
# Run :
#   docker run -p 3000:3000 --env-file nestmatch/.env.local keymatch-next:latest
#
# Build VPS :
#   cd /opt/keymatch/NextImmo-main && git pull
#   sudo docker compose -f tools/next-vps/docker-compose.yml build
#   sudo docker compose -f tools/next-vps/docker-compose.yml up -d

# ─── Stage 1 : deps ───────────────────────────────────────────────
FROM node:22-slim AS deps
WORKDIR /app

# Dépendances système nécessaires :
#  - python3 + make + g++ : node-gyp pour bcrypt et autres native deps
#  - openssl ca-certificates : TLS handshake fiable (Debian a déjà des certs OK)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copie package.json + lock pour cache Docker
COPY nestmatch/package.json nestmatch/package-lock.json* ./

# Install prod + dev deps (besoin de typescript pour build)
RUN npm ci --include=dev --no-audit --no-fund

# ─── Stage 2 : builder ─────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app

# Dépendances build
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Récupère node_modules du stage deps
COPY --from=deps /app/node_modules ./node_modules

# Copie tout le source
COPY nestmatch/ .

# Variables d'env nécessaires au build
# - NEXT_OUTPUT_STANDALONE=1 active output:'standalone' dans next.config.js
# - SKIP_ENV_VALIDATION=1 désactive le check des env vars manquantes (set à run-time)
# - NEXT_TELEMETRY_DISABLED=1 désactive l'envoi de stats vers Vercel
ENV NEXT_OUTPUT_STANDALONE=1
ENV SKIP_ENV_VALIDATION=1
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# V97.39.31 — CRITIQUE : Next.js bake les NEXT_PUBLIC_* AU BUILD time.
# Si on build avec des dummies, le SDK Supabase essaie de contacter
# `https://build-time-dummy.supabase.co` au RUNTIME (timeout 7s + fail).
# Les VRAIES URLs publiques DOIVENT être passées en build-args.
#
# Usage : docker build --build-arg NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co ...
# (ce ne sont pas des secrets — l'anon key est publique de toute façon)
ARG NEXT_PUBLIC_SUPABASE_URL=https://build-time-dummy.supabase.co
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy.dummy
ARG NEXT_PUBLIC_URL=https://keymatch-immo.fr
ARG NEXT_PUBLIC_SENTRY_DSN=
ARG NEXT_PUBLIC_REALTIME_PROVIDER=supabase
ARG NEXT_PUBLIC_REALTIME_URL=
ARG NEXT_PUBLIC_NOINDEX=false
ARG NEXT_PUBLIC_BETA=false
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_URL=$NEXT_PUBLIC_URL
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_REALTIME_PROVIDER=$NEXT_PUBLIC_REALTIME_PROVIDER
ENV NEXT_PUBLIC_REALTIME_URL=$NEXT_PUBLIC_REALTIME_URL
ENV NEXT_PUBLIC_NOINDEX=$NEXT_PUBLIC_NOINDEX
ENV NEXT_PUBLIC_BETA=$NEXT_PUBLIC_BETA

# Server-only vars (non baked, runtime via env_file). Dummies pour passer build.
ENV SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy.dummy
ENV NEXTAUTH_SECRET=build-time-dummy-secret-32-chars-min
ENV NEXTAUTH_URL=https://keymatch-immo.fr
ENV DOSSIER_LOG_SALT=build-time-dummy-salt-not-used-at-runtime

# Build production
RUN npm run build

# ─── Stage 3 : runner ──────────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# wget + openssl + ca-certs : healthcheck + TLS stack moderne
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# User non-root (sécurité)
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# Copie le bundle standalone (super léger : juste server.js + node_modules trim)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Copie le dossier public (assets statiques)
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Copie le dossier .next/static (CSS, JS chunks)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Healthcheck endpoint /api/health
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

USER nextjs

EXPOSE 3000

# server.js est généré par output:'standalone'
CMD ["node", "server.js"]
