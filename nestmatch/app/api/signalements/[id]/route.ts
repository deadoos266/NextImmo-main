import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

const schema = z.object({
  statut: z.enum(["traite", "rejete", "ouvert"]),
})

/**
 * PATCH /api/signalements/[id] — traiter/rejeter un signalement (admin)
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ success: false, error: "Accès refusé" }, { status: 403 })
  }

  const { id } = await params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: "Corps invalide" }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Statut invalide" }, { status: 422 })
  }

  const update: Record<string, unknown> = { statut: parsed.data.statut }
  if (parsed.data.statut === "traite" || parsed.data.statut === "rejete") {
    update.traite_par = session.user.email?.toLowerCase()
    update.traite_at = new Date().toISOString()
  } else {
    update.traite_par = null
    update.traite_at = null
  }

  const { error } = await supabaseAdmin
    .from("signalements")
    .update(update)
    .eq("id", id)

  if (error) {
    return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
