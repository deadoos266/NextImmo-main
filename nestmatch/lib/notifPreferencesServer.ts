/**
 * V56.1 — Server-only side de notifPreferences.
 *
 * **NE PAS IMPORTER DEPUIS UN CLIENT COMPONENT** ("use client").
 * Cet import dépend de `supabaseAdmin` qui requiert
 * `SUPABASE_SERVICE_ROLE_KEY` côté serveur uniquement. Si on bundle
 * ça dans le client → throw runtime, app crash.
 *
 * Ce fichier ne contient QUE `shouldSendEmailForEvent` qui requiert
 * un lookup Supabase. Le catalogue (NOTIF_EVENTS, eventsForRole,
 * defaultNotifPreferences, types) reste dans `./notifPreferences.ts`
 * qui est pure et sûr pour le client.
 *
 * Use sites :
 * - app/api/notifications/event/route.ts
 * - app/api/notifications/new-message/route.ts
 * - app/api/cron/* (4 crons V53)
 * - app/api/bail/* (signer/preavis/from-annonce/importer/relance/relance-bailleur)
 * - app/api/candidatures/* (valider/refuser)
 * - app/api/dossier/share/[id]/route.ts
 * - app/api/loyers/quittance/route.ts
 * - lib/bail/finalize.ts (server-only by location, OK)
 */

import { supabaseAdmin } from "./supabase-server"
import { NOTIF_EVENTS, type NotifEventKey } from "./notifPreferences"

/**
 * Resolves whether `email` wants to receive an email for `eventKey`.
 *
 * Lookup order (fallback chain) :
 *   1. profils.notif_preferences[eventKey] si défini → use it
 *   2. legacy column (notif_*_email) si mappé → use it
 *   3. default of the event (NOTIF_EVENTS[*].default)
 *   4. true (fail open — un signal raté = pire qu'un email de trop)
 *
 * Si le profil n'existe pas du tout (user pas encore en DB), fallback true.
 *
 * Best-effort : ne fail jamais. Si Supabase rate, on retourne true (fail open).
 */
export async function shouldSendEmailForEvent(
  email: string,
  eventKey: NotifEventKey,
): Promise<boolean> {
  const def = NOTIF_EVENTS.find(e => e.key === eventKey)
  // Events critiques (signal légal) : on ne respecte pas les préférences,
  // l'user reçoit toujours.
  if (def?.required) return true

  const cols = ["notif_preferences"]
  if (def?.legacyKey) cols.push(def.legacyKey)

  try {
    const { data } = await supabaseAdmin
      .from("profils")
      .select(cols.join(", "))
      .eq("email", email.toLowerCase())
      .maybeSingle()
    if (!data) return def?.default ?? true
    const row = data as unknown as Record<string, unknown>

    // 1. notif_preferences[event]
    const prefs = row["notif_preferences"] as Record<string, unknown> | null
    if (prefs && typeof prefs === "object" && eventKey in prefs) {
      const v = prefs[eventKey]
      if (typeof v === "boolean") return v
    }

    // 2. legacy column
    if (def?.legacyKey) {
      const legacyVal = row[def.legacyKey]
      if (typeof legacyVal === "boolean") return legacyVal
    }

    // 3. default of the event
    return def?.default ?? true
  } catch (e) {
    console.warn("[notifPreferences] lookup failed for", email, eventKey, e)
    // 4. fail open
    return true
  }
}
