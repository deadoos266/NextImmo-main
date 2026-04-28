import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

/**
 * V12 Étape B Phase 1 — endpoints admin pour gérer les utilisateurs.
 *
 * PATCH /api/admin/users — set is_admin OR is_banned + ban_reason.
 * DELETE /api/admin/users?email=xxx — supprime profil + user (cascade).
 *
 * Auth : NextAuth session + flag is_admin. Sinon 403.
 *
 * Avant V12 : /admin/page.tsx (lignes 245, 253, 260, 269) faisait
 *   supabase.from("users").update({is_admin}|{is_banned})...
 *   supabase.from("profils|users").delete()...
 * directement avec la clé anon. Un attaquant pouvait s'élever en admin
 * ou supprimer/bannir n'importe qui sans contrôle. Les écritures sont
 * désormais centralisées ici avec validation is_admin server-side.
 *
 * Garde-fou : un admin ne peut PAS retirer ses propres droits admin
 * (évite de se locker out du dashboard) ni supprimer son propre compte.
 */

const patchSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("toggle_admin"),
    email: z.string().email().max(180),
    is_admin: z.boolean(),
  }),
  z.object({
    kind: z.literal("ban"),
    email: z.string().email().max(180),
    ban_reason: z.string().min(1).max(500),
  }),
  z.object({
    kind: z.literal("unban"),
    email: z.string().email().max(180),
  }),
])

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
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Payload invalide" }, { status: 400 })
  }
  const data = parsed.data

  const adminEmail = session.user.email.toLowerCase()
  const targetEmail = data.email.toLowerCase()

  if (data.kind === "toggle_admin") {
    if (targetEmail === adminEmail && data.is_admin === false) {
      return NextResponse.json(
        { success: false, error: "Impossible de retirer ses propres droits admin" },
        { status: 400 }
      )
    }
    const { error } = await supabaseAdmin
      .from("users")
      .update({ is_admin: data.is_admin })
      .eq("email", targetEmail)
    if (error) {
      console.error("[/api/admin/users PATCH toggle_admin]", error)
      return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  }

  if (data.kind === "ban") {
    if (targetEmail === adminEmail) {
      return NextResponse.json(
        { success: false, error: "Impossible de se bannir soi-même" },
        { status: 400 }
      )
    }
    const { error } = await supabaseAdmin
      .from("users")
      .update({ is_banned: true, ban_reason: data.ban_reason })
      .eq("email", targetEmail)
    if (error) {
      console.error("[/api/admin/users PATCH ban]", error)
      return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  }

  // unban
  const { error } = await supabaseAdmin
    .from("users")
    .update({ is_banned: false, ban_reason: null })
    .eq("email", targetEmail)
  if (error) {
    console.error("[/api/admin/users PATCH unban]", error)
    return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "Non authentifié" }, { status: 401 })
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ success: false, error: "Accès refusé" }, { status: 403 })
  }

  const targetEmail = (req.nextUrl.searchParams.get("email") || "").toLowerCase().trim()
  if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
    return NextResponse.json({ success: false, error: "Email invalide" }, { status: 400 })
  }
  if (targetEmail === session.user.email.toLowerCase()) {
    return NextResponse.json(
      { success: false, error: "Impossible de supprimer son propre compte ici" },
      { status: 400 }
    )
  }

  // Suppression cascade : profils puis users.
  const profilsRes = await supabaseAdmin.from("profils").delete().eq("email", targetEmail)
  if (profilsRes.error) {
    console.error("[/api/admin/users DELETE profils]", profilsRes.error)
    return NextResponse.json({ success: false, error: "Erreur suppression profil" }, { status: 500 })
  }
  const usersRes = await supabaseAdmin.from("users").delete().eq("email", targetEmail)
  if (usersRes.error) {
    console.error("[/api/admin/users DELETE users]", usersRes.error)
    return NextResponse.json({ success: false, error: "Erreur suppression user" }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
