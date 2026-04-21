import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

/**
 * DELETE /api/dossier/share/[id]
 * Révoque un lien de partage : `revoked_at = now()`. Le JWT reste
 * cryptographiquement valide mais la route `/dossier-partage/[token]` refusera.
 * Seul le propriétaire du lien peut le révoquer.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ success: false, error: "Authentification requise" }, { status: 401 })
  }
  if (!id || typeof id !== "string") {
    return NextResponse.json({ success: false, error: "ID invalide" }, { status: 400 })
  }

  // Check ownership + update atomique (une seule requête)
  const { data, error } = await supabaseAdmin
    .from("dossier_share_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("email_locataire", email)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle()

  if (error) {
    if (error.code === "42P01") {
      return NextResponse.json({ success: false, error: "Fonctionnalité non disponible" }, { status: 404 })
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ success: false, error: "Lien introuvable ou déjà révoqué" }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
