/**
 * V97.39.21 P3 Phase 4 — Service socket.io self-host KeyMatch.
 *
 * Remplace Supabase Realtime via :
 *   1. Postgres LISTEN sur les channels keymatch_<table>
 *   2. Triggers SQL pg_notify() qui fire à chaque INSERT/UPDATE/DELETE
 *   3. socket.io broadcast aux clients authentifiés JWT NextAuth
 *
 * Auth : le client envoie son JWT NextAuth dans le handshake. On vérifie
 * la signature avec NEXTAUTH_SECRET. On filtre les events par user_email
 * (extrait du JWT).
 *
 * Tables suivies (V97.39.21) :
 *   - messages       (chat + visites embed)
 *   - notifications  (badge cloche)
 *   - visites        (status updates)
 *   - annonces       (mon-logement updates)
 *
 * À ajouter plus tard si besoin : edl_pieces, candidatures, incidents.
 *
 * Run :
 *   node server.js
 * Or via systemd : tools/realtime-vps/systemd/keymatch-realtime.service
 */

const { Server } = require("socket.io")
const { Client } = require("pg")
const http = require("http")
const jwt = require("jsonwebtoken")

const PORT = parseInt(process.env.PORT || "3001", 10)
const HOST = process.env.HOST || "0.0.0.0"
const DATABASE_URL = process.env.DATABASE_URL
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://keymatch-immo.fr,https://staging.keymatch-immo.fr,http://localhost:3000").split(",")

if (!DATABASE_URL || !NEXTAUTH_SECRET) {
  console.error("[realtime] DATABASE_URL et NEXTAUTH_SECRET requis")
  process.exit(1)
}

// Channels Postgres à LISTEN. Chaque trigger SQL doit fire pg_notify('<channel>', payload).
const CHANNELS = [
  "keymatch_messages",
  "keymatch_notifications",
  "keymatch_visites",
  "keymatch_annonces",
]

// V97.39.21 verifier fix : whitelist explicite des channels acceptés côté
// socket.subscribe. Sans ce check, un user pouvait join une room arbitraire.
// En pratique pas exploitable (shouldDeliver default=false), mais design plus
// sûr d'avoir un double check au handshake.
const ALLOWED_SUBSCRIBE_CHANNELS = new Set([
  "messages",
  "notifications",
  "visites",
  "annonces",
])

// ─── HTTP + socket.io ─────────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({
      ok: true,
      pg: pgConnected,
      channels: CHANNELS,
      sockets: io ? io.sockets.sockets.size : 0,
      uptime: process.uptime(),
    }))
    return
  }
  res.writeHead(404)
  res.end()
})

const io = new Server(httpServer, {
  cors: {
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) cb(null, true)
      else cb(new Error("CORS denied"))
    },
    credentials: true,
  },
  // Path par défaut socket.io
  path: "/socket.io/",
  // Privilégier websocket, fallback polling
  transports: ["websocket", "polling"],
})

// ─── Auth handshake JWT NextAuth ──────────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace(/^Bearer /, "")
  if (!token) return next(new Error("auth_missing"))
  try {
    // ⚠ NB : NextAuth v4 utilise JWE chiffré (A256GCM, 5 segments), PAS HS256.
    // Le JWT qu'on vérifie ici est émis spécifiquement par notre endpoint
    // nestmatch/app/api/auth/realtime-token/route.ts en HS256 avec NEXTAUTH_SECRET.
    // Le format JWT NextAuth natif (`__Secure-next-auth.session-token` cookie)
    // ne marchera PAS ici — il faut l'endpoint custom intermédiaire.
    const payload = jwt.verify(token, NEXTAUTH_SECRET, { algorithms: ["HS256"] })
    if (!payload || typeof payload !== "object" || !payload.email) {
      return next(new Error("auth_invalid"))
    }
    socket.data.email = String(payload.email).toLowerCase()
    socket.data.isAdmin = !!payload.isAdmin
    next()
  } catch (e) {
    next(new Error("auth_failed"))
  }
})

io.on("connection", socket => {
  console.log(`[realtime] connected ${socket.data.email} (sockets: ${io.sockets.sockets.size})`)

  // Le client doit s'abonner explicitement aux channels qu'il veut.
  // ex: socket.emit('subscribe', { channel: 'messages', filter: { conv_id: 123 } })
  socket.on("subscribe", ({ channel, filter }) => {
    if (typeof channel !== "string" || !channel.match(/^[a-z_]+$/)) {
      socket.emit("error", { code: "bad_channel" })
      return
    }
    // V97.39.21 verifier fix : whitelist explicite (défense en profondeur,
    // shouldDeliver fait déjà le default=false).
    if (!ALLOWED_SUBSCRIBE_CHANNELS.has(channel)) {
      socket.emit("error", { code: "channel_not_allowed" })
      return
    }
    socket.join(`channel:${channel}`)
    socket.data.filters = socket.data.filters || {}
    socket.data.filters[channel] = filter || {}
  })

  socket.on("unsubscribe", ({ channel }) => {
    socket.leave(`channel:${channel}`)
    if (socket.data.filters?.[channel]) delete socket.data.filters[channel]
  })

  socket.on("disconnect", reason => {
    console.log(`[realtime] disconnect ${socket.data.email} reason=${reason} (sockets: ${io.sockets.sockets.size})`)
  })
})

// ─── Postgres LISTEN ──────────────────────────────────────────────
let pgConnected = false
const pg = new Client({ connectionString: DATABASE_URL })

async function startPg() {
  await pg.connect()
  pgConnected = true
  console.log("[realtime] postgres connected")

  pg.on("notification", msg => {
    if (!msg.channel || !msg.payload) return
    let payload
    try { payload = JSON.parse(msg.payload) } catch {
      console.warn("[realtime] payload JSON parse fail", msg.channel)
      return
    }
    // Format attendu du trigger SQL :
    //   { event: 'INSERT' | 'UPDATE' | 'DELETE', table: 'messages', row: { ... } }
    // On broadcast aux sockets abonnés au channel correspondant + filter user.
    const channelName = msg.channel.replace(/^keymatch_/, "")
    const room = `channel:${channelName}`

    io.in(room).fetchSockets().then(sockets => {
      for (const sock of sockets) {
        if (!shouldDeliver(sock.data, channelName, payload)) continue
        sock.emit("event", { channel: channelName, ...payload })
      }
    }).catch(err => console.error("[realtime] broadcast fail", err))
  })

  for (const ch of CHANNELS) {
    await pg.query(`LISTEN ${ch}`)
  }
  console.log(`[realtime] listening on ${CHANNELS.length} pg channels`)
}

/**
 * Filtre côté server : un user ne doit recevoir QUE les events qui le concernent.
 * Sinon un attaquant pourrait s'abonner au channel 'notifications' et recevoir
 * les notifs de tous les users.
 *
 * Pour chaque channel KeyMatch, on définit ici la règle de filtrage :
 *   - notifications : payload.row.user_email === socket.email
 *   - messages : payload.row.from_email === socket.email OR to_email === socket.email
 *   - visites : payload.row.locataire_email === socket.email OR proprio_email === socket.email
 *   - annonces : payload.row.proprietaire_email === socket.email
 */
function shouldDeliver(sockData, channel, payload) {
  const row = payload.row || {}
  const email = sockData.email
  const isAdmin = sockData.isAdmin

  // Admin reçoit tout
  if (isAdmin) return true

  switch (channel) {
    case "notifications":
      return row.user_email && String(row.user_email).toLowerCase() === email
    case "messages":
      return (
        (row.from_email && String(row.from_email).toLowerCase() === email) ||
        (row.to_email && String(row.to_email).toLowerCase() === email)
      )
    case "visites":
      return (
        (row.locataire_email && String(row.locataire_email).toLowerCase() === email) ||
        (row.proprio_email && String(row.proprio_email).toLowerCase() === email)
      )
    case "annonces":
      return row.proprietaire_email && String(row.proprietaire_email).toLowerCase() === email
    default:
      // Channel inconnu = refus par défaut (sécurité)
      return false
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────
async function shutdown() {
  console.log("[realtime] shutdown")
  io.close()
  if (pgConnected) await pg.end().catch(() => {})
  httpServer.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 5000).unref()
}

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)

startPg()
  .then(() => {
    httpServer.listen(PORT, HOST, () => {
      console.log(`[realtime] socket.io listening ${HOST}:${PORT}`)
    })
  })
  .catch(err => {
    console.error("[realtime] startup failed", err)
    process.exit(1)
  })
