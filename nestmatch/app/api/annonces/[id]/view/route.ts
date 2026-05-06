/**
 * V74.4 — POST /api/annonces/[id]/view
 *
 * Incrémente `annonces.nb_vues` quand un user consulte la fiche détaillée.
 * Endpoint séparé de la route de fetch pour pouvoir l'appeler en
 * fire-and-forget côté client (pas de blocage de la response principale).
 *
 * Anti-spam :
 *  - Rate-limit 60 vues/min/IP/annonce (un user qui hammer pas plus de
 *    1 vue/sec sur la même annonce — au-delà = bot).
 *  - Pas d'auth requise (les annonces sont publiques en lecture).
 *
 * Best-effort : si la mig 064 n'est pas encore appliquée (colonne nb_vues
 * absente), on swallow et on retourne {ok: true, persisted: false}. La
 * route ne doit JAMAIS bloquer la fiche annonce.
 */

import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const idNum = Number(id)
  if (!Number.isFinite(idNum) || idNum <= 0) {
    return NextResponse.json({ ok: false, error: "id invalide" }, { status: 400 })
  }

  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`annonce:view:${ip}:${idNum}`, { max: 60, windowMs: 60_000 })
  if (!rl.allowed) {
    // Pas une erreur user-facing — on retourne 200 pour ne pas alarmer le
    // client. L'incrément est juste skippé.
    return NextResponse.json({ ok: true, throttled: true })
  }

  try {
    // Increment via SQL atomique (pas de race condition entre lecture et écriture).
    // RPC ou raw SQL via supabase. On utilise update + .select pour confirm.
    const { error } = await supabaseAdmin.rpc("increment_annonce_nb_vues", { annonce_id_param: idNum })
    if (error) {
      // Si la fonction RPC n'existe pas, fallback simple update + 1.
      // Best-effort : on ne casse pas si la colonne est absente non plus.
      try {
        const { data } = await supabaseAdmin
          .from("annonces")
          .select("nb_vues")
          .eq("id", idNum)
          .single()
        if (data && typeof data.nb_vues === "number") {
          await supabaseAdmin
            .from("annonces")
            .update({ nb_vues: data.nb_vues + 1 })
            .eq("id", idNum)
        }
      } catch {
        return NextResponse.json({ ok: true, persisted: false })
      }
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true, persisted: false })
  }
}
