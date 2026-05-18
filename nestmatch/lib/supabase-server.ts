/**
 * Supabase admin client (server-only, bypass RLS).
 *
 * V97.39.32 — Refactor lazy init :
 *   - AVANT : `throw new Error` au module-load si keys absentes. Bug : tout
 *     composant "use client" qui importait ce module crashait au boot car
 *     SUPABASE_SERVICE_ROLE_KEY n'est pas exposé côté browser.
 *   - APRÈS : init paresseux via Proxy. Le throw n'arrive qu'au PREMIER ACCÈS
 *     à une propriété de supabaseAdmin (ex: .from(...)). Côté client, on
 *     n'accède jamais à supabaseAdmin (lib/storage/index.ts dispatche vers
 *     le browser anon client si typeof window !== "undefined"). Donc plus
 *     de crash module-load.
 *
 * Usage server-only : import { supabaseAdmin } from "@/lib/supabase-server"
 *   const { data, error } = await supabaseAdmin.from("annonces").select("*")
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let _client: SupabaseClient | null = null

function init(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      "❌ Variables Supabase serveur manquantes — supabaseAdmin demandé côté client ?\n" +
        "Ajoute dans nestmatch/.env.local :\n" +
        "  NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co\n" +
        "  SUPABASE_SERVICE_ROLE_KEY=eyJ...",
    )
  }
  _client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return _client
}

// Proxy paresseux : init() seulement au premier accès. Plus de throw au
// module-load → safe à importer transitivement côté client (Vitest, Next.js
// client bundles avec tree-shaking).
//
// Traps additionnels (has + getOwnPropertyDescriptor + defineProperty) :
// nécessaires pour `vi.spyOn(supabaseAdmin, "from")` dans les tests Vitest
// (cf lib/import/__tests__/fetcher-router.test.ts). Sans eux, spyOn lève
// "The property X is not defined on the object" car il interroge la
// presence + descriptor avant de défaire/remplacer la propriété.
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(target, prop, receiver) {
    // Si le test a fait `Object.defineProperty` (via spyOn), retourne la
    // valeur stockée sur le target plutôt que celle du client réel.
    if (Object.prototype.hasOwnProperty.call(target, prop)) {
      return Reflect.get(target, prop, receiver)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (init() as any)[prop]
  },
  has(target, prop) {
    if (Object.prototype.hasOwnProperty.call(target, prop)) return true
    return prop in init()
  },
  getOwnPropertyDescriptor(target, prop) {
    if (Object.prototype.hasOwnProperty.call(target, prop)) {
      return Reflect.getOwnPropertyDescriptor(target, prop)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (init() as any)[prop]
    if (value === undefined) return undefined
    return { configurable: true, enumerable: true, writable: true, value }
  },
  defineProperty(target, prop, descriptor) {
    return Reflect.defineProperty(target, prop, descriptor)
  },
  deleteProperty(target, prop) {
    return Reflect.deleteProperty(target, prop)
  },
})
