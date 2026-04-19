import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync } from "@/lib/rateLimit"

const schema = z.object({
  confirm: z.literal("SUPPRIMER", { errorMap: () => ({ message: "Tapez SUPPRIMER pour confirmer" }) }),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ success: false, error: "Authentification requise" }, { status: 401 })
  }

  // Anti-abus : 1 suppression / heure / email (action irréversible, session volée)
  const rl = await checkRateLimitAsync(`account-delete:${email}`, { max: 1, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Demande de suppression déjà en cours." },
      { status: 429 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: "Corps de requete invalide" }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.errors[0]?.message ?? "Confirmation invalide" }, { status: 422 })
  }

  // Cascade delete — 2 eq() par table au lieu de .or() pour éviter toute
  // injection PostgREST via email (certains caractères valides dans email
  // peuvent casser le filtre .or() encodé en string).
  const cleanups = [
    Promise.resolve(supabaseAdmin.from("messages").delete().eq("from_email", email)),
    Promise.resolve(supabaseAdmin.from("messages").delete().eq("to_email", email)),
    Promise.resolve(supabaseAdmin.from("visites").delete().eq("locataire_email", email)),
    Promise.resolve(supabaseAdmin.from("visites").delete().eq("proprietaire_email", email)),
    Promise.resolve(supabaseAdmin.from("loyers").delete().eq("locataire_email", email)),
    Promise.resolve(supabaseAdmin.from("loyers").delete().eq("proprietaire_email", email)),
    Promise.resolve(supabaseAdmin.from("carnet_entretien").delete().eq("locataire_email", email)),
    Promise.resolve(supabaseAdmin.from("carnet_entretien").delete().eq("proprietaire_email", email)),
    Promise.resolve(supabaseAdmin.from("annonces").delete().eq("proprietaire_email", email)),
    Promise.resolve(supabaseAdmin.from("profils").delete().eq("email", email)),
  ]
  await Promise.allSettled(cleanups)

  // Supprimer l'enregistrement users en dernier (session NextAuth)
  const { error } = await supabaseAdmin.from("users").delete().eq("email", email)
  if (error) {
    console.error("[/api/account/delete]", error)
    return NextResponse.json({ success: false, error: "Erreur serveur lors de la suppression" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
