/**
 * Service worker minimal NestMatch.
 *
 * Stratégie :
 *  - Précache les assets statiques (logo, manifest) au premier install.
 *  - Network-first pour la navigation HTML : si offline ou timeout, on
 *    renvoie la page /offline cachée.
 *  - Stale-while-revalidate pour les images annonces (Supabase Storage) :
 *    servit depuis cache si dispo, refresh en arrière-plan.
 *
 * ⚠️ Pas de cache pour les routes /api/* — on ne veut pas servir de données
 * périmées. Elles passent direct au réseau (fail si offline, normal).
 */

const CACHE_VERSION = "nm-v1"
const STATIC_CACHE = `${CACHE_VERSION}-static`
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`

const PRECACHE = [
  "/",
  "/offline",
  "/manifest.json",
  "/logo-mark.svg",
  "/logo-mark-192.png",
  "/logo-mark-512.png",
  "/apple-touch-icon.png",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE).catch(() => {})),
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      ),
    ),
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return

  const url = new URL(req.url)

  // Routes API : toujours réseau, pas de cache (évite de servir des données
  // stale sur des endpoints authentifiés).
  if (url.pathname.startsWith("/api/")) return

  // Navigation HTML : network-first, fallback offline.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req)
          // On pré-cache les pages visitées pour le revisite offline.
          const copy = res.clone()
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {})
          return res
        } catch {
          const cached = await caches.match(req)
          if (cached) return cached
          const offline = await caches.match("/offline")
          if (offline) return offline
          return new Response("Hors ligne", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        }
      })(),
    )
    return
  }

  // Images annonces (Supabase storage) + assets statiques : stale-while-revalidate.
  if (url.pathname.startsWith("/_next/static/") || url.origin.includes("supabase.co")) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((res) => {
            const copy = res.clone()
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {})
            return res
          })
          .catch(() => cached)
        return cached || fetchPromise
      }),
    )
    return
  }

  // Autres : cache-first court circuit.
  event.respondWith(caches.match(req).then((c) => c || fetch(req).catch(() => new Response("", { status: 504 }))))
})
