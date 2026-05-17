# Service Realtime socket.io KeyMatch — Phase 4 plan migration OVH.
#
# Image légère ~80 MB. Tourne en parallèle de keymatch-next sur le VPS.
#
# Build : docker build -t keymatch-realtime:latest tools/realtime-vps/
# Run : docker run -p 3001:3001 --env-file .env keymatch-realtime:latest

FROM node:22-alpine

WORKDIR /app

# Install deps (cache layer)
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copie source
COPY src ./src

# User non-root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 realtime && \
    chown -R realtime:nodejs /app
USER realtime

EXPOSE 3001

# Healthcheck
# V97.39.22 — utilise 127.0.0.1 explicite car alpine résout `localhost` vers
# ::1 (IPv6) mais notre service écoute sur 0.0.0.0 (IPv4) → "Connection refused"
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1

ENV PORT=3001
ENV HOST=0.0.0.0

CMD ["node", "src/server.js"]
