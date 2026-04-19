/**
 * Helpers pour la cloche de notifications in-app.
 *
 * `createNotification` insère une ligne dans `notifications` côté serveur
 * (supabaseAdmin). Appel fire-and-forget : on log en cas d'échec mais on ne
 * bloque jamais le flow métier qui l'appelle (envoi message, etc.).
 *
 * À n'appeler QUE depuis du code serveur (API routes). Les clients browser
 * passent par l'API route `/api/notifications` qui wrappe ce helper.
 */

import { supabaseAdmin } from "./supabase-server"

export type NotifType =
  | "message"
  | "visite_proposee"
  | "visite_confirmee"
  | "visite_annulee"
  | "location_acceptee"
  | "location_refusee"
  | "loyer_retard"
  | "bail_genere"
  | "dossier_consulte"
  | "candidature_retiree"

export type NotifArgs = {
  userEmail: string
  type: NotifType
  title: string
  body?: string | null
  href?: string | null
  relatedId?: string | null
}

export async function createNotification(args: NotifArgs): Promise<void> {
  const email = (args.userEmail || "").trim().toLowerCase()
  if (!email) return
  try {
    await supabaseAdmin.from("notifications").insert({
      user_email: email,
      type: args.type,
      title: args.title,
      body: args.body ?? null,
      href: args.href ?? null,
      related_id: args.relatedId ?? null,
    })
  } catch (err) {
    // Ne jamais bloquer le caller : la notif est un confort, pas une
    // correctness-critical path.
    console.error("[notifications] create failed", err)
  }
}

// Whitelist des types valides, utilisée par l'API route pour valider le body
// client.
export const NOTIF_TYPES: readonly NotifType[] = [
  "message",
  "visite_proposee",
  "visite_confirmee",
  "visite_annulee",
  "location_acceptee",
  "location_refusee",
  "loyer_retard",
  "bail_genere",
  "dossier_consulte",
  "candidature_retiree",
] as const

export function isNotifType(x: unknown): x is NotifType {
  return typeof x === "string" && (NOTIF_TYPES as readonly string[]).includes(x)
}
