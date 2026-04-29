/**
 * V34.2 — Hash SHA-256 d'un payload bail pour audit-trail eIDAS.
 * Audit V31 R3.2 : avant ce helper, le hash stocké en bail_signatures.bail_hash
 * était un hash JS custom (cf BailSignatureModal V14 ligne 47-57) :
 *   `bail-${Math.abs(hash).toString(16)}-${s.length}`
 * → faible (collisions triviales), pas crypto, pas suffisant pour preuve légale.
 *
 * Cette implémentation :
 * 1. Canonicalise le JSON (clés triées + sérialisation déterministe) — sinon
 *    deux serializations sémantiquement identiques produisent des hashes
 *    différents.
 * 2. Calcule SHA-256 via Node crypto (server) ou Web Crypto API (client).
 * 3. Le résultat est un hex 64-char prefixé "sha256:".
 *
 * Compatible avec :
 * - Server (signer/route.ts, finalize.ts) → require crypto Node.
 * - Client (BailSignatureModal) → window.crypto.subtle.
 */

import type { BailData } from "./bailPDF"

/**
 * Sérialisation déterministe d'un objet : clés triées récursivement.
 * Garantit que { a: 1, b: 2 } et { b: 2, a: 1 } produisent la même string.
 */
function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null"
  if (typeof value === "number" && !Number.isFinite(value)) return "null"
  if (typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  const parts = keys.map(k => `${JSON.stringify(k)}:${canonicalize(obj[k])}`)
  return `{${parts.join(",")}}`
}

/**
 * Sélectionne uniquement les champs canoniques (= ceux qui ne doivent pas
 * changer après signature). Exclut les champs UI/transients :
 *   - signatures (ajoutées au PDF mais après le hash de base)
 *   - fichierUrl (peut bouger si stockage migré)
 */
function pickCanonicalFields(data: BailData): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { signatures, fichierUrl, ...canon } = data as BailData & { signatures?: unknown; fichierUrl?: unknown }
  return canon as Record<string, unknown>
}

async function sha256Hex(input: string): Promise<string> {
  // Browser : window.crypto.subtle (async, vrai SHA-256 hardware-accelerated).
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const data = new TextEncoder().encode(input)
    const buf = await window.crypto.subtle.digest("SHA-256", data)
    const arr = Array.from(new Uint8Array(buf))
    return arr.map(b => b.toString(16).padStart(2, "0")).join("")
  }
  // Server (Node) : crypto module. Import dynamique pour éviter polyfill côté browser.
  const nodeCrypto = await import("node:crypto")
  return nodeCrypto.createHash("sha256").update(input, "utf8").digest("hex")
}

/**
 * Calcule le hash SHA-256 canonique d'un BailData.
 * Format de retour : `sha256:<hex64>` (préfixé pour distinguer des hashes legacy).
 */
export async function hashBailData(data: BailData): Promise<string> {
  const canon = canonicalize(pickCanonicalFields(data))
  const hex = await sha256Hex(canon)
  return `sha256:${hex}`
}

/**
 * Compare deux hashes en temps constant (anti timing-attack).
 * Pas critique pour ce cas d'usage mais good practice.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) {
    r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return r === 0
}

/**
 * Retourne le payload bail "canonicalisé" (pour stockage server-side dans
 * payload_snapshot). Garantit qu'on stocke exactement ce qu'on a hashé.
 */
export function canonicalPayloadString(data: BailData): string {
  return canonicalize(pickCanonicalFields(data))
}
