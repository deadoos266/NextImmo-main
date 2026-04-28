import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

/**
 * V12 Étape B Phase 1 — flag is_test sur annonces (admin moderation).
 *
 * PATCH /api/admin/annonces — body { ids: number[]; is_test: boolean }.
 *   Bulk-toggle is_test (single id ou liste). Auth admin obligatoire.
 *
 * Avant V12 : /admin/page.tsx (lignes 204, 222) faisait
 *   supabase.from("annonces").update({is_test}).eq/in()
 * directement avec la clé anon. Un attaquant pouvait flag/unflag toute
 * annonce comme test (cacher des annonces vraies). Centralisé ici.
 */

const schema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
  is_test: z.boolean(),
})

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Non authentifié" }, { status: 401 })
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ success: false, error: "Accès refusé" }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: "Corps invalide" }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Payload invalide" }, { status: 400 })
  }
  const { ids, is_test } = parsed.data

  const { error } = await supabaseAdmin
    .from("annonces")
    .update({ is_test })
    .in("id", ids)

  if (error) {
    console.error("[/api/admin/annonces PATCH]", error)
    return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 })
  }
  return NextResponse.json({ success: true, updated: ids.length })
}
