/**
 * V97.35 P3-3 — GET /api/cron/reviews-auto-publish
 *
 * Publie les reviews qui sont en attente depuis ≥7 jours (la 2e partie
 * n'a jamais soumis sa review réciproque). Évite de bloquer indéfiniment
 * une partie qui a joué le jeu.
 *
 * Cron Vercel quotidien : 30 5 * * *  (5h30 UTC, faible charge).
 *
 * Auth : Bearer CRON_SECRET en prod.
 */

import { NextRequest, NextResponse } from "next/server"
import { withCronLogging } from "@/lib/cron/withCronLogging"
import { supabaseAdmin } from "@/lib/supabase-server"

const AUTO_PUBLISH_AFTER_DAYS = 7

export const GET = withCronLogging("reviews-auto-publish", "30 5 * * *", async function cronGET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (secret && auth !== `Bearer ${secret}` && process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const threshold = new Date(Date.now() - AUTO_PUBLISH_AFTER_DAYS * 24 * 3600 * 1000).toISOString()

  const { data: pending, error } = await supabaseAdmin
    .from("reviews")
    .select("id, annonce_id, author_email, target_email, submitted_at")
    .is("published_at", null)
    .eq("hidden_by_admin", false)
    .lt("submitted_at", threshold)

  if (error) {
    console.error("[cron/reviews-auto-publish]", error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({ ok: true, published: 0 })
  }

  const now = new Date().toISOString()
  const ids = pending.map(r => r.id)

  const { error: updErr } = await supabaseAdmin
    .from("reviews")
    .update({ published_at: now })
    .in("id", ids)
  if (updErr) {
    console.error("[cron/reviews-auto-publish update]", updErr)
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 })
  }

  // Notif cloche aux 2 parties pour chaque review désormais publiée
  const notifications = pending.flatMap(r => ([
    {
      user_email: r.author_email,
      type: "review_published",
      title: "Votre avis est publié",
      body: `Votre avis sur ${r.target_email} est maintenant visible (publication automatique après ${AUTO_PUBLISH_AFTER_DAYS} jours).`,
      href: `/profil/${encodeURIComponent(r.target_email)}`,
      related_id: String(r.id),
      lu: false,
    },
    {
      user_email: r.target_email,
      type: "review_published",
      title: "Vous avez reçu un avis",
      body: `${r.author_email} a publié un avis sur vous.`,
      href: `/profil/${encodeURIComponent(r.author_email)}`,
      related_id: String(r.id),
      lu: false,
    },
  ]))
  if (notifications.length > 0) {
    await supabaseAdmin.from("notifications").insert(notifications)
  }

  return NextResponse.json({ ok: true, published: pending.length, review_ids: ids })
})
