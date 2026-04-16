import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

const schema = z.object({
  confirm: z.literal("SUPPRIMER", { errorMap: () => ({ message: "Tapez SUPPRIMER pour confirmer" }) }),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ success: false, error: "Authentification requise" }, { status: 401 })
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

  // Cascade delete — ordre pour respecter les FK potentielles
  // On ignore les erreurs individuelles : certaines tables peuvent ne pas avoir de lignes pour ce user
  const cleanups: Promise<unknown>[] = [
    supabaseAdmin.from("messages").delete().or(`from_email.eq.${email},to_email.eq.${email}`),
    supabaseAdmin.from("visites").delete().or(`locataire_email.eq.${email},proprietaire_email.eq.${email}`),
    supabaseAdmin.from("loyers").delete().or(`locataire_email.eq.${email},proprietaire_email.eq.${email}`),
    supabaseAdmin.from("carnet_entretien").delete().or(`locataire_email.eq.${email},proprietaire_email.eq.${email}`),
    supabaseAdmin.from("annonces").delete().eq("proprietaire_email", email),
    supabaseAdmin.from("profils").delete().eq("email", email),
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
