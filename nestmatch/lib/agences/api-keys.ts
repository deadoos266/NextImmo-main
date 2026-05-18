/**
 * V97.39.34 — Phase C — Helpers API keys agences
 *
 * Génération + vérification + audit log des clés API.
 *
 * Format clé : `km_live_<32 chars hex>` (style Stripe).
 *   - km_live_ = préfixe identifiable
 *   - 8 chars affichables en clair pour identification (key_prefix en DB)
 *   - 32 chars hex = 128 bits entropie (crypto.randomBytes(16))
 *   - Hash complet en DB via bcryptjs cost 10
 */

import bcrypt from "bcryptjs"
import crypto from "crypto"
import { supabaseAdmin } from "@/lib/supabase-server"

export interface ApiKeyRecord {
  id: string
  agence_id: string
  label: string
  key_prefix: string
  scopes: string[]
  created_by: string
  created_at: string
  last_used_at: string | null
  last_used_ip: string | null
  revoked_at: string | null
}

export interface AuthedApiKey extends ApiKeyRecord {
  agenceStatut: string
  agenceName: string
}

const KEY_PREFIX_LEN = 8  // chars visibles en DB (km_live_xxxxxxxx)
const BCRYPT_COST = 10

/** Génère une nouvelle clé API. Retourne { fullKey, keyPrefix, keyHash }. */
export async function generateApiKey(): Promise<{
  fullKey: string
  keyPrefix: string
  keyHash: string
}> {
  // 16 random bytes → 32 hex chars
  const randomHex = crypto.randomBytes(16).toString("hex")
  const fullKey = `km_live_${randomHex}`
  const keyPrefix = `km_live_${randomHex.substring(0, KEY_PREFIX_LEN)}`
  const keyHash = await bcrypt.hash(fullKey, BCRYPT_COST)
  return { fullKey, keyPrefix, keyHash }
}

/**
 * Vérifie une clé API en clair contre la DB.
 * Retourne le record + contexte agence si valide et non révoquée.
 */
export async function verifyApiKey(presented: string): Promise<AuthedApiKey | null> {
  if (!presented || !presented.startsWith("km_live_")) return null
  if (presented.length < 16) return null  // sanity

  // Le prefix nous permet de faire un SELECT efficace (pas brute-force bcrypt)
  const prefix = presented.substring(0, "km_live_".length + KEY_PREFIX_LEN)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: candidates } = await supabaseAdmin
    .from("agence_api_keys")
    .select("*, agences!inner(name, statut)")
    .eq("key_prefix", prefix)
    .is("revoked_at", null)
    .limit(5)  // collision prefix possible mais peu probable, on check tous

  if (!candidates || candidates.length === 0) return null

  for (const cand of candidates) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = cand as any
    const match = await bcrypt.compare(presented, c.key_hash)
    if (match) {
      if (c.agences?.statut !== "active") {
        // Clé valide mais agence pas active
        return null
      }
      return {
        id: c.id,
        agence_id: c.agence_id,
        label: c.label,
        key_prefix: c.key_prefix,
        scopes: c.scopes || [],
        created_by: c.created_by,
        created_at: c.created_at,
        last_used_at: c.last_used_at,
        last_used_ip: c.last_used_ip,
        revoked_at: c.revoked_at,
        agenceStatut: c.agences.statut,
        agenceName: c.agences.name,
      }
    }
  }
  return null
}

/**
 * Vérifie qu'une clé a un scope donné.
 *
 * Scopes :
 *   - annonces:read     → GET endpoints
 *   - annonces:write    → POST / PUT / DELETE annonces
 *   - candidatures:read → GET candidatures
 *   - candidatures:write → patch candidatures (futur)
 *   - members:read      → GET membres agence (futur)
 *   - webhooks:write    → configurer webhooks (futur)
 */
export function hasScope(key: AuthedApiKey | null, scope: string): boolean {
  if (!key) return false
  return key.scopes.includes(scope)
}

/** Audit : log un appel API. Best-effort, n'échoue pas la requête principale. */
export async function logApiUsage(params: {
  apiKeyId: string
  agenceId: string
  endpoint: string
  statusCode: number
  ip?: string
  userAgent?: string
  durationMs?: number
  error?: string
}): Promise<void> {
  try {
    await supabaseAdmin.from("agence_api_usage").insert({
      api_key_id: params.apiKeyId,
      agence_id: params.agenceId,
      endpoint: params.endpoint,
      status_code: params.statusCode,
      ip: params.ip,
      user_agent: params.userAgent,
      duration_ms: params.durationMs,
      error: params.error,
    })
    // Update last_used_at + last_used_ip sur la clé (best-effort)
    if (params.statusCode < 400) {
      await supabaseAdmin
        .from("agence_api_keys")
        .update({ last_used_at: new Date().toISOString(), last_used_ip: params.ip })
        .eq("id", params.apiKeyId)
    }
  } catch (e) {
    console.warn("[api-keys] logApiUsage failed (non-blocking):", e)
  }
}

/** Extrait la clé d'une requête HTTP (header Authorization: Bearer …). */
export function extractApiKey(req: { headers: { get(name: string): string | null } }): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization")
  if (!h) return null
  const m = /^Bearer\s+(km_live_[a-f0-9]+)$/i.exec(h.trim())
  return m ? m[1] : null
}
