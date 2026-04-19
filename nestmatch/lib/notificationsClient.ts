/**
 * Helper client pour poster une notif in-app au destinataire d'un event.
 *
 * Passe par l'API route /api/notifications/create (auth + rate-limit
 * server-side). Fire-and-forget : les échecs sont silencieusement loggués —
 * on ne veut jamais bloquer un envoi de message parce que la notif a foiré.
 */

import type { NotifType } from "./notifications"

export type PostNotifArgs = {
  userEmail: string
  type: NotifType
  title: string
  body?: string | null
  href?: string | null
  relatedId?: string | null
}

export async function postNotif(args: PostNotifArgs): Promise<void> {
  try {
    await fetch("/api/notifications/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    })
  } catch (err) {
    console.error("[postNotif] failed", err)
  }
}
