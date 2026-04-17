import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

const schema = z.object({
  statut: z.enum(["ouvert", "en_cours", "resolu"]).optional(),
  reponse: z.string().max(4000).optional().nullable(),
  prendre_en_charge: z.boolean().optional(),
})

/**
 * PATCH /api/contact/[id] — admin uniquement.
 * Met à jour le statut, assigne à l'admin courant si `prendre_en_charge`, ou note une réponse.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const adminEmail = session?.user?.email?.toLowerCase()
  if (!session?.user?.isAdmin || !adminEmail) {
    return NextResponse.json({ success: false, error: "Accès refusé" }, { status: 403 })
  }

  const { id } = await params
  const contactId = Number(id)
  if (!Number.isFinite(contactId)) {
    return NextResponse.json({ success: false, error: "ID invalide" }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: "Corps invalide" }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Données invalides" }, { status: 422 })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.data.statut) patch.statut = parsed.data.statut
  if (parsed.data.reponse !== undefined) patch.reponse = parsed.data.reponse
  if (parsed.data.prendre_en_charge) {
    patch.assigne_a = adminEmail
    if (!parsed.data.statut) patch.statut = "en_cours"
  }

  const { error } = await supabaseAdmin.from("contacts").update(patch).eq("id", contactId)
  if (error) {
    console.error("[/api/contact/[id] PATCH]", error)
    return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
