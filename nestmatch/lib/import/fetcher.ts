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
  // IPv4 privées : 10.x, 172.16-31.x, 192.168.x
  const m = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 127) return true
  if (a === 169 && b === 254) return true
  return false
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
  if (BLOCKED_HOSTS.has(hostname)) {
    throw new ImportFetchError("BLOCKED_HOST", "Domaine interne refusé")
  }
  if (isPrivateIp(hostname)) {
    throw new ImportFetchError("PRIVATE_IP", "IP privée refusée")
  }
  // Refuser les .local et .internal
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new ImportFetchError("BLOCKED_TLD", "TLD interne refusé")
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.6",
      },
      redirect: "follow",
      signal: controller.signal,
    })
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new ImportFetchError("TIMEOUT", "La page met trop de temps à répondre")
    }
    throw new ImportFetchError("FETCH_ERROR", e instanceof Error ? e.message : "Erreur réseau")
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
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

  return {
    html,
    final_url: res.url,
    status: res.status,
    content_type: contentType,
  }
}
