/**
 * V97.39.34 — Phase D — Webhooks delivery layer
 *
 * - Signature HMAC SHA256 du payload avec secret partagé.
 * - Enqueue async via webhook_deliveries (worker pop + POST).
 * - Retry backoff exponential 1m → 5m → 30m (max 3 tentatives).
 *
 * Pas de delivery synchrone : on enqueue toujours et le worker s'en charge.
 * Permet de ne pas bloquer la requête HTTP utilisateur si l'URL webhook
 * est lente ou down.
 */

import crypto from "crypto"
import { supabaseAdmin } from "@/lib/supabase-server"

export const WEBHOOK_EVENTS = [
  "candidature.created",
  "candidature.refused",
  "visite.confirmee",
  "bail.signed",
  "message.received",
  "annonce.created",
  "annonce.updated",
  "annonce.deleted",
] as const

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

export interface WebhookConfig {
  id: string
  agence_id: string
  url: string
  secret: string
  events: string[]
  active: boolean
  label: string | null
}

/**
 * Signe un payload avec HMAC SHA256 et retourne le header value.
 * Format compatible Stripe/GitHub : `sha256=<hex>`.
 */
export function signPayload(secret: string, body: string): string {
  const hmac = crypto.createHmac("sha256", secret)
  hmac.update(body)
  return `sha256=${hmac.digest("hex")}`
}

/**
 * Vérifie une signature HMAC en constant-time (côté agence si elle reçoit).
 * Exposée pour les tests + doc.
 */
export function verifySignature(secret: string, body: string, presented: string): boolean {
  const expected = signPayload(secret, body)
  try {
    return crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(expected))
  } catch {
    return false
  }
}

/**
 * Enqueue un event pour toutes les agences qui ont souscrit à cet event.
 *
 * Best-effort : si la DB plante, on log mais on n'échoue pas l'action
 * métier d'origine (ex: création visite). Le user voit son action OK
 * même si le webhook n'a pas pu être enqueué.
 */
export async function enqueueWebhook(
  agenceId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<{ enqueued: number }> {
  try {
    // Trouve les webhooks de cette agence qui ont souscrit à cet event
    const { data: webhooks } = await supabaseAdmin
      .from("agence_webhooks")
      .select("id, events")
      .eq("agence_id", agenceId)
      .eq("active", true)

    const matching = (webhooks || []).filter((w: { events: string[] }) =>
      Array.isArray(w.events) && w.events.includes(event),
    )

    if (matching.length === 0) return { enqueued: 0 }

    const fullPayload = {
      event,
      timestamp: new Date().toISOString(),
      agence_id: agenceId,
      data: payload,
    }

    const inserts = matching.map((w: { id: string }) => ({
      webhook_id: w.id,
      agence_id: agenceId,
      event,
      payload: fullPayload,
      status: "pending",
      next_attempt_at: new Date().toISOString(),
    }))

    await supabaseAdmin.from("webhook_deliveries").insert(inserts)
    return { enqueued: inserts.length }
  } catch (e) {
    console.warn("[webhooks] enqueueWebhook failed (non-blocking):", e)
    return { enqueued: 0 }
  }
}

/**
 * Délais de retry en millisecondes selon le numéro de tentative.
 * attempt 1 → retry après 1m, attempt 2 → 5m, attempt 3 → 30m.
 * Après attempt 3 → status='abandoned'.
 */
export function retryBackoffMs(attempt: number): number {
  switch (attempt) {
    case 1: return 60 * 1000           // 1 minute
    case 2: return 5 * 60 * 1000        // 5 minutes
    case 3: return 30 * 60 * 1000       // 30 minutes
    default: return 30 * 60 * 1000
  }
}

/**
 * Détermine si un status code HTTP justifie un retry.
 * - 2xx → success
 * - 4xx hors 408/429 → permanent failure (client error, pas la peine de retry)
 * - 408/429/5xx → retry
 * - 0 (network err/timeout) → retry
 */
export function shouldRetry(statusCode: number): boolean {
  if (statusCode === 0) return true                   // network/timeout
  if (statusCode >= 200 && statusCode < 300) return false  // success
  if (statusCode === 408 || statusCode === 429) return true
  if (statusCode >= 500) return true
  return false  // 4xx permanent
}

/**
 * Traite une delivery pending : POST vers URL, met à jour le statut.
 * Appelée par le worker async (cron systemd toutes les 30s).
 */
export async function processDelivery(deliveryId: number): Promise<void> {
  // 1. Fetch la delivery + son webhook config
  const { data: delivery } = await supabaseAdmin
    .from("webhook_deliveries")
    .select("id, webhook_id, agence_id, event, payload, attempt, max_attempts, status")
    .eq("id", deliveryId)
    .single()

  if (!delivery || delivery.status !== "pending") return

  const { data: webhook } = await supabaseAdmin
    .from("agence_webhooks")
    .select("url, secret, active")
    .eq("id", delivery.webhook_id)
    .single()

  if (!webhook || !webhook.active) {
    await supabaseAdmin
      .from("webhook_deliveries")
      .update({ status: "abandoned", last_error: "Webhook disabled or deleted", completed_at: new Date().toISOString() })
      .eq("id", deliveryId)
    return
  }

  // 2. Sign + POST
  const body = JSON.stringify(delivery.payload)
  const signature = signPayload(webhook.secret, body)
  const newAttempt = (delivery.attempt || 0) + 1

  let statusCode = 0
  let responseBody = ""
  let error: string | null = null

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10_000)
    const res = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "KeyMatch-Webhook/1.0",
        "X-KeyMatch-Event": delivery.event,
        "X-KeyMatch-Delivery-Id": String(deliveryId),
        "X-KeyMatch-Signature": signature,
      },
      body,
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    statusCode = res.status
    // Tronque la réponse à 2000 chars pour éviter de gonfler la DB
    const text = await res.text().catch(() => "")
    responseBody = text.substring(0, 2000)
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown network error"
  }

  // 3. Update delivery status
  const isSuccess = statusCode >= 200 && statusCode < 300
  const canRetry = !isSuccess && shouldRetry(statusCode) && newAttempt < delivery.max_attempts

  const update: Record<string, unknown> = {
    attempt: newAttempt,
    last_status_code: statusCode,
    last_response_body: responseBody || null,
    last_error: error,
  }
  if (isSuccess) {
    update.status = "success"
    update.completed_at = new Date().toISOString()
  } else if (canRetry) {
    update.status = "pending"
    update.next_attempt_at = new Date(Date.now() + retryBackoffMs(newAttempt)).toISOString()
  } else {
    update.status = newAttempt >= delivery.max_attempts ? "failed" : "failed"
    update.completed_at = new Date().toISOString()
  }

  await supabaseAdmin
    .from("webhook_deliveries")
    .update(update)
    .eq("id", deliveryId)

  // 4. Update webhook stats
  const statsUpdate: Record<string, unknown> = {
    total_deliveries: 1,  // increment géré par RPC ou trigger plus tard
    last_status: statusCode,
  }
  if (isSuccess) {
    statsUpdate.last_delivered_at = new Date().toISOString()
  } else if (!canRetry) {
    statsUpdate.last_failed_at = new Date().toISOString()
  }
  // Increment counters via RPC (best-effort)
  try {
    await supabaseAdmin.rpc("increment_webhook_stats", {
      p_webhook_id: delivery.webhook_id,
      p_is_success: isSuccess,
      p_status_code: statusCode,
    })
  } catch {
    // Si RPC n'existe pas (migration séparée), update direct
    await supabaseAdmin
      .from("agence_webhooks")
      .update({
        last_status: statusCode,
        ...(isSuccess ? { last_delivered_at: new Date().toISOString() } : {}),
        ...(!isSuccess && !canRetry ? { last_failed_at: new Date().toISOString() } : {}),
      })
      .eq("id", delivery.webhook_id)
  }
}

/**
 * Traite jusqu'à N deliveries pending en parallèle.
 * Appelé par le cron systemd toutes les 30s.
 */
export async function processDeliveriesBatch(maxBatch = 20): Promise<{ processed: number }> {
  const { data: pending } = await supabaseAdmin
    .from("webhook_deliveries")
    .select("id")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(maxBatch)

  if (!pending || pending.length === 0) return { processed: 0 }

  // Process en parallèle (chaque delivery est indépendante)
  await Promise.allSettled(pending.map((d: { id: number }) => processDelivery(d.id)))
  return { processed: pending.length }
}
