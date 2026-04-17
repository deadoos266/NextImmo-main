import crypto from "crypto"

/**
 * Génère et vérifie des tokens de partage de dossier locataire.
 * Stateless : encode email + expiration + signature HMAC, pas besoin de table DB.
 * Utilise NEXTAUTH_SECRET comme clé HMAC.
 */

const ALG = "sha256"

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function b64urlDecode(s: string): Buffer {
  s = s.replace(/-/g, "+").replace(/_/g, "/")
  while (s.length % 4) s += "="
  return Buffer.from(s, "base64")
}

function getSecret(): string {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) throw new Error("NEXTAUTH_SECRET non configuré")
  return s
}

/**
 * Génère un token signé pour partager le dossier de `email` pendant `days` jours.
 */
export function generateDossierToken(email: string, days: number = 7): string {
  const exp = Date.now() + days * 24 * 60 * 60 * 1000
  const payload = { email, exp }
  const payloadB64 = b64url(JSON.stringify(payload))
  const sig = crypto.createHmac(ALG, getSecret()).update(payloadB64).digest()
  const sigB64 = b64url(sig)
  return `${payloadB64}.${sigB64}`
}

/**
 * Vérifie un token et retourne l'email si valide, null sinon.
 */
export function verifyDossierToken(token: string): { email: string; exp: number } | null {
  try {
    const [payloadB64, sigB64] = token.split(".")
    if (!payloadB64 || !sigB64) return null

    // Vérif signature
    const expectedSig = crypto.createHmac(ALG, getSecret()).update(payloadB64).digest()
    const providedSig = b64urlDecode(sigB64)
    if (expectedSig.length !== providedSig.length) return null
    if (!crypto.timingSafeEqual(expectedSig, providedSig)) return null

    // Vérif expiration
    const payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8"))
    if (!payload.email || !payload.exp) return null
    if (Date.now() > payload.exp) return null

    return { email: payload.email, exp: payload.exp }
  } catch {
    return null
  }
}
