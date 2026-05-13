/**
 * V97.36 P3-7 — Fetcher HTML avec protections SSRF + timeout + UA réaliste.
 *
 * Pourquoi pas un simple fetch() :
 *  - SSRF : on doit refuser localhost / IP privées / metadata cloud
 *  - Timeout : éviter de bloquer la route serverless 10s+ si le site est lent
 *  - Body limit : refuser les HTML >5MB (DoS / memory bomb)
 *  - UA : certains sites bloquent les UA "node" / "Vercel"
 *  - HTTPS only en prod (downgrade attack)
 */

const MAX_HTML_BYTES = 5 * 1024 * 1024  // 5MB
const FETCH_TIMEOUT_MS = 8_000  // 8s : laisse 2s de marge sur le 10s serverless Vercel

const USER_AGENT =
  "Mozilla/5.0 (compatible; KeyMatch-Importer/1.0; +https://keymatch-immo.fr/aide/import-annonce)"

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "169.254.169.254",  // AWS metadata
  "metadata.google.internal",
])

function isPrivateIp(hostname: string): boolean {
  // Node.URL.hostname garde les crochets sur IPv6 ("[::1]", "[fe80::1]")
  // On normalise en stripant les crochets pour la détection.
  const h = hostname.replace(/^\[|\]$/g, "")

  // IPv4 privées : 10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x, 0.x
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    if (a === 0) return true
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 127) return true
    if (a === 169 && b === 254) return true
    return false
  }
  // IPv6 localhost / unspecified
  if (h === "::1" || h === "::" || h === "0:0:0:0:0:0:0:1") return true
  // IPv6 unique-local fc00::/7 (fc00-fdff) et link-local fe80::/10 (fe80-febf)
  if (/^(fc|fd|fe8|fe9|fea|feb)[0-9a-f]*:/i.test(h)) return true
  // IPv4-mapped IPv6 (::ffff:10.0.0.1)
  const mapped = h.match(/^::ffff:(\d+)\.(\d+)\.(\d+)\.(\d+)$/i)
  if (mapped) return isPrivateIp(`${mapped[1]}.${mapped[2]}.${mapped[3]}.${mapped[4]}`)
  // "0" tout court (Node.URL peut résoudre `http://0` → 0.0.0.0)
  if (h === "0") return true
  return false
}

/**
 * Garde-fou centralisé : à appeler sur chaque URL avant fetch, y compris
 * après une redirection 3xx. Throws ImportFetchError si l'host est interdit.
 */
function assertSafeHost(hostname: string): void {
  const h = hostname.toLowerCase()
  if (BLOCKED_HOSTS.has(h)) {
    throw new ImportFetchError("BLOCKED_HOST", "Domaine interne refusé")
  }
  if (isPrivateIp(h)) {
    throw new ImportFetchError("PRIVATE_IP", "IP privée refusée")
  }
  if (h.endsWith(".local") || h.endsWith(".internal")) {
    throw new ImportFetchError("BLOCKED_TLD", "TLD interne refusé")
  }
}

export interface FetchResult {
  html: string
  final_url: string
  status: number
  content_type: string
}

export class ImportFetchError extends Error {
  constructor(public code: string, message: string) {
    super(message)
    this.name = "ImportFetchError"
  }
}

/**
 * Récupère le HTML d'une URL avec garde-fous SSRF + timeout + size limit.
 * Suit jusqu'à 3 redirections (équivalent suivant les redirections par défaut).
 */
export async function fetchUrl(url: string): Promise<FetchResult> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new ImportFetchError("INVALID_URL", "URL invalide")
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ImportFetchError("UNSUPPORTED_PROTOCOL", "Protocole non supporté")
  }

  // Refuser HTTP en prod (downgrade attack ; les vrais sites immo sont en HTTPS)
  if (parsed.protocol === "http:" && process.env.NODE_ENV === "production") {
    throw new ImportFetchError("HTTP_BLOCKED_IN_PROD", "URL HTTP refusée (HTTPS uniquement en production)")
  }

  const hostname = parsed.hostname.toLowerCase()
  assertSafeHost(hostname)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  // V97.36 P3-7 fix SSRF redirect : on suit les redirections MANUELLEMENT
  // pour re-valider l'hostname à chaque hop. Sans ça un site externe peut
  // 302 vers http://169.254.169.254/ (AWS metadata) ou IP interne et notre
  // fetcher accepte le bypass. Max 3 hops pour éviter les loops.
  const MAX_REDIRECTS = 3
  let res: Response | null = null
  let currentUrl = url
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const r: Response = await fetch(currentUrl, {
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.6",
        },
        redirect: "manual",
        signal: controller.signal,
      })

      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get("location")
        if (!loc) { res = r; break }
        if (hop === MAX_REDIRECTS) {
          throw new ImportFetchError("TOO_MANY_REDIRECTS", "Trop de redirections")
        }
        const nextUrl = new URL(loc, currentUrl)
        if (nextUrl.protocol !== "https:" && nextUrl.protocol !== "http:") {
          throw new ImportFetchError("UNSUPPORTED_PROTOCOL", "Redirection vers un protocole non supporté")
        }
        if (nextUrl.protocol === "http:" && process.env.NODE_ENV === "production") {
          throw new ImportFetchError("HTTP_BLOCKED_IN_PROD", "Redirection HTTP refusée en production")
        }
        assertSafeHost(nextUrl.hostname.toLowerCase())  // re-validation host à chaque hop
        currentUrl = nextUrl.toString()
        // Body de la redirection à drainer pour libérer la connexion
        try { await r.body?.cancel() } catch { /* noop */ }
        continue
      }
      res = r
      break
    }
    if (!res) {
      throw new ImportFetchError("FETCH_ERROR", "Aucune réponse")
    }
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new ImportFetchError("TIMEOUT", "La page met trop de temps à répondre")
    }
    if (e instanceof ImportFetchError) throw e
    throw new ImportFetchError("FETCH_ERROR", e instanceof Error ? e.message : "Erreur réseau")
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    // V97.36 amélioration message : DataDome/Cloudflare répondent souvent
    // 403 systématique aux requêtes serveur. Message explicite vers user.
    if (res.status === 403) {
      throw new ImportFetchError(
        "BOT_PROTECTION",
        "Le site bloque les imports automatisés (DataDome / Cloudflare). C'est le cas de Leboncoin et PAP. Copie-colle manuellement les infos, ou essaie depuis Bien'ici / Logic-immo / un site d'agence locale.",
      )
    }
    if (res.status === 404) {
      throw new ImportFetchError(
        "NOT_FOUND",
        "Annonce introuvable (404). Le lien a peut-être expiré, ou tu as collé une URL de recherche au lieu d'une fiche.",
      )
    }
    if (res.status === 410) {
      throw new ImportFetchError(
        "GONE",
        "Annonce supprimée (410). Le proprio a retiré son annonce de cette plateforme.",
      )
    }
    throw new ImportFetchError(
      "HTTP_ERROR",
      `Le site cible a retourné HTTP ${res.status}. Vérifie l'URL.`,
    )
  }

  const contentType = res.headers.get("content-type") || ""
  if (contentType && !contentType.toLowerCase().includes("html") && !contentType.toLowerCase().includes("text/")) {
    throw new ImportFetchError("NOT_HTML", "La page n'est pas une page HTML")
  }

  const contentLength = Number(res.headers.get("content-length") || "0")
  if (contentLength > MAX_HTML_BYTES) {
    throw new ImportFetchError("TOO_LARGE", "Page trop volumineuse")
  }

  // Lecture limitée (au cas où le content-length n'est pas renseigné)
  const reader = res.body?.getReader()
  if (!reader) {
    throw new ImportFetchError("NO_BODY", "Pas de contenu retourné")
  }
  const chunks: Uint8Array[] = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      received += value.byteLength
      if (received > MAX_HTML_BYTES) {
        try { await reader.cancel() } catch { /* noop */ }
        throw new ImportFetchError("TOO_LARGE", "Page trop volumineuse")
      }
      chunks.push(value)
    }
  }
  const buffer = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }
  const html = new TextDecoder("utf-8", { fatal: false }).decode(buffer)

  // V97.36 — détection des challenges anti-bot servis avec 200 OK (cas
  // rare mais possible pour DataDome/Cloudflare en soft challenge).
  // Si on reconnaît le pattern, on lève BOT_PROTECTION plutôt que de
  // laisser le parser extraire du contenu vide.
  if (html.length < 20_000 && (
    /captcha-delivery\.com/i.test(html) ||
    /Just a moment\.\.\./i.test(html) ||
    /cf-challenge|cf-browser-verification/i.test(html)
  )) {
    throw new ImportFetchError(
      "BOT_PROTECTION",
      "Le site sert un challenge anti-bot (DataDome / Cloudflare). Impossible d'importer automatiquement. Copie-colle manuellement les infos.",
    )
  }

  return {
    html,
    final_url: res.url,
    status: res.status,
    content_type: contentType,
  }
}
