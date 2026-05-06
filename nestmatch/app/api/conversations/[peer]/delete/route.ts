/**
 * V74.1 — POST /api/conversations/[peer]/delete
 *
 * Soft-delete personnel d'une conversation : ajoute l'email du user
 * courant dans messages.hidden_for_emails pour TOUS les messages de la
 * paire (user ↔ peer). L'autre partie continue de voir l'historique
 * intact côté elle.
 *
 * Pattern UX iOS Mail / WhatsApp / Gmail : la suppression est personnelle.
 *
 * Param : `peer` = email URL-encodé de l'autre partie de la conversation.
 *
 * Auth : NextAuth required. Le user ne peut supprimer QUE les conversations
 * dans lesquelles il est participant.
 *
 * Best-effort : si la mig 065 n'est pas encore appliquée (colonne
 * hidden_for_emails absente), la route retourne 503 avec un message clair.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest, ctx: { params: Promise<{ peer: string }> }) {
  const session = await getServerSession(authOptions)
  const me = session?.user?.email?.toLowerCase()
  if (!me) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 })
  }

  // Rate-limit : 30 conv supprimées/min — un user normal n'en supprime
  // jamais autant en une rafale. Un attaquant qui scripte = blocage.
  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`conv:delete:${ip}:${me}`, { max: 30, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes" },
      { status: 429, headers: rl.retryAfterSec ? { "Retry-After": String(rl.retryAfterSec) } : undefined },
    )
  }

  const { peer } = await ctx.params
  const peerEmail = decodeURIComponent(peer || "").trim().toLowerCase()
  if (!peerEmail || !peerEmail.includes("@")) {
    return NextResponse.json({ error: "peer invalide" }, { status: 400 })
  }
  if (peerEmail === me) {
    return NextResponse.json({ error: "Conversation avec soi-même non gérée" }, { status: 400 })
  }

  // Lit tous les messages de la paire pour récupérer hidden_for_emails actuel.
  // Note : on doit faire un UPDATE par ligne car array_append n'est pas
  // exposé via le SDK supabase-js (pas de RPC dédié). On lit, on append, on
  // update en batch.
  try {
    const { data: rows, error: selErr } = await supabaseAdmin
      .from("messages")
      .select("id, hidden_for_emails")
      .or(`and(from_email.eq.${me},to_email.eq.${peerEmail}),and(from_email.eq.${peerEmail},to_email.eq.${me})`)

    if (selErr) {
      // Si la colonne n'existe pas, on tombe ici avec un code 42703.
      if (typeof selErr.message === "string" && selErr.message.includes("hidden_for_emails")) {
        return NextResponse.json(
          { error: "Migration 065 pas encore appliquée — soft-delete non disponible" },
          { status: 503 },
        )
      }
      console.error("[conv delete] select", selErr)
      return NextResponse.json({ error: "Erreur base de données" }, { status: 500 })
    }

    if (!rows || rows.length === 0) {
      // Aucun message → conversation déjà vide ou inexistante côté DB.
      return NextResponse.json({ ok: true, updated: 0 })
    }

    // Construit la liste des id à update : seulement ceux qui n'ont pas
    // déjà me dans hidden_for_emails.
    const toUpdate = rows.filter(r => {
      const arr = Array.isArray(r.hidden_for_emails) ? r.hidden_for_emails : []
      return !arr.includes(me)
    })

    if (toUpdate.length === 0) {
      return NextResponse.json({ ok: true, updated: 0, alreadyHidden: true })
    }

    // Update batch via .in("id", [...]). On ne peut pas array_append côté
    // SDK donc on calcule la nouvelle valeur côté JS et on update chaque
    // row avec sa nouvelle valeur. Pour minimiser les round-trips, on
    // groupe par hidden_for_emails actuel.
    let updatedCount = 0
    for (const row of toUpdate) {
      const arr = Array.isArray(row.hidden_for_emails) ? row.hidden_for_emails : []
      const next = [...arr, me]
      const { error: updErr } = await supabaseAdmin
        .from("messages")
        .update({ hidden_for_emails: next })
        .eq("id", row.id)
      if (!updErr) updatedCount++
    }

    return NextResponse.json({ ok: true, updated: updatedCount })
  } catch (e) {
    console.error("[conv delete] caught", e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
}
