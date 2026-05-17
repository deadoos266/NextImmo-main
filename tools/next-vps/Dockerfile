# Dockerfile production Next.js KeyMatch — Phase 6 plan migration OVH.
#
# Multi-stage build :
#  - deps    : npm ci (cache layer)
#  - builder : npm run build avec output: 'standalone'
#  - runner  : image minimaliste (node:22-alpine + standalone)
#
# Size cible : ~250 MB (vs 1.2 GB sans standalone).
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
FROM node:22-alpine AS deps
WORKDIR /app

# Dépendances système nécessaires :
#  - libc6-compat : compat glibc pour certains binaires natifs (sharp, wreq-js)
#  - python3 + make + g++ : node-gyp pour bcrypt et autres native deps
RUN apk add --no-cache libc6-compat python3 make g++

# Copie package.json + lock pour cache Docker
COPY nestmatch/package.json nestmatch/package-lock.json* ./

# Install prod + dev deps (besoin de typescript pour build)
RUN npm ci --include=dev --no-audit --no-fund

# ─── Stage 2 : builder ─────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Dépendances build
RUN apk add --no-cache libc6-compat

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

# Build production
RUN npm run build

# ─── Stage 3 : runner ──────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# User non-root (sécurité)
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Sharp doit être installé en runtime sur la même architecture que le runner
# (Vercel l'installait pour nous, on doit le faire manuellement)
RUN apk add --no-cache libc6-compat

# Copie le bundle standalone (super léger : juste server.js + node_modules trim)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Copie le dossier public (assets statiques)
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Copie le dossier .next/static (CSS, JS chunks)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Healthcheck endpoint /api/health
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

USER nextjs

EXPOSE 3000

# server.js est généré par output:'standalone'
CMD ["node", "server.js"]
