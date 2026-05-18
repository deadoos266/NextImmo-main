/**
 * V97.39.34 — POST/DELETE/PATCH /api/agences/[id]/membres
 *
 * POST   : invite un nouveau membre par email (role par défaut: agent).
 *          Auto-joined (pas de workflow d'acceptation pour MVP).
 * PATCH  : modifie le role d'un membre existant (admin+ uniquement).
 * DELETE : retire un membre (set removed_at).
 *
 * Permissions :
 *   - Inviter : role admin+
 *   - Changer role : role admin+ ne peut pas se dégrader soi-même owner→admin
 *   - Retirer : role admin+. Un owner ne peut pas être retiré tant qu'il y
 *     a >= 1 owner restant.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { sendEmail } from "@/lib/email"
import { getUserAgenceContext, hasMinRole } from "@/lib/agences/server"
import type { AgenceMembreRole } from "@/lib/agences/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const VALID_ROLES: AgenceMembreRole[] = ["owner", "admin", "agent", "viewer"]

interface PostBody {
  email: string
  role?: AgenceMembreRole
}

interface PatchBody {
  member_id: string
  role: AgenceMembreRole
}

interface DeleteBody {
  member_id: string
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }
  const { id } = await ctx.params

  const uctx = await getUserAgenceContext(session.user.email, id)
  if (!hasMinRole(uctx, "admin")) {
    return NextResponse.json({ ok: false, error: "Role admin requis" }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as PostBody | null
  if (!body?.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return NextResponse.json({ ok: false, error: "Email invalide" }, { status: 400 })
  }
  const inviteEmail = body.email.toLowerCase()
  const role: AgenceMembreRole = body.role && VALID_ROLES.includes(body.role) ? body.role : "agent"

  // Vérifier que ce user n'est pas déjà membre actif
  const { data: existing } = await supabaseAdmin
    .from("agence_membres")
    .select("id, removed_at")
    .eq("agence_id", id)
    .eq("user_email", inviteEmail)
    .is("removed_at", null)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ ok: false, error: "Cette personne est déjà membre" }, { status: 409 })
  }

  // Pour MVP : auto-joined (pas de flow d'acceptation par email avec token).
  // En V3 : créer invitation pending, envoyer email avec lien d'acceptation,
  // joined_at = quand l'invité clique. Pour l'instant : add directement.
  const { data: created, error: insErr } = await supabaseAdmin
    .from("agence_membres")
    .insert({
      agence_id: id,
      user_email: inviteEmail,
      role,
      invited_by: session.user.email.toLowerCase(),
      joined_at: new Date().toISOString(),
    })
    .select("id")
    .single()

  if (insErr || !created) {
    return NextResponse.json({ ok: false, error: insErr?.message || "Erreur création" }, { status: 500 })
  }

  // Email notification (best-effort)
  if (uctx?.agenceName) {
    try {
      await sendEmail({
        to: inviteEmail,
        subject: `Vous êtes ajouté à l'agence ${uctx.agenceName} sur KeyMatch`,
        html: `
          <p>Bonjour,</p>
          <p>Vous avez été ajouté à l'agence <strong>${escapeHtml(uctx.agenceName)}</strong> sur
          KeyMatch avec le rôle <strong>${role}</strong>.</p>
          <p>Connectez-vous sur <a href="https://keymatch-immo.fr/agence/dashboard">https://keymatch-immo.fr/agence/dashboard</a> pour accéder aux annonces de l'agence.</p>
          <p>Si vous n'avez pas encore de compte KeyMatch, créez-en un avec cette adresse email pour rejoindre l'agence.</p>
        `,
        senderEmail: session.user.email.toLowerCase(),
        templateName: "agence_member_invited",
      })
    } catch (e) {
      console.warn("[agences/membres] email invite failed:", e)
    }
  }

  return NextResponse.json({ ok: true, member_id: created.id })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }
  const { id } = await ctx.params

  const uctx = await getUserAgenceContext(session.user.email, id)
  if (!hasMinRole(uctx, "admin")) {
    return NextResponse.json({ ok: false, error: "Role admin requis" }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as PatchBody | null
  if (!body?.member_id || !body?.role || !VALID_ROLES.includes(body.role)) {
    return NextResponse.json({ ok: false, error: "member_id et role requis" }, { status: 400 })
  }

  // Empêcher de retirer le dernier owner
  if (body.role !== "owner") {
    const { data: member } = await supabaseAdmin
      .from("agence_membres")
      .select("role")
      .eq("id", body.member_id)
      .single()
    if (member?.role === "owner") {
      const { count } = await supabaseAdmin
        .from("agence_membres")
        .select("id", { count: "exact", head: true })
        .eq("agence_id", id)
        .eq("role", "owner")
        .is("removed_at", null)
      if ((count || 0) <= 1) {
        return NextResponse.json({ ok: false, error: "Impossible de retirer le dernier owner" }, { status: 400 })
      }
    }
  }

  const { error } = await supabaseAdmin
    .from("agence_membres")
    .update({ role: body.role })
    .eq("id", body.member_id)
    .eq("agence_id", id)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }
  const { id } = await ctx.params

  const uctx = await getUserAgenceContext(session.user.email, id)
  if (!hasMinRole(uctx, "admin")) {
    return NextResponse.json({ ok: false, error: "Role admin requis" }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as DeleteBody | null
  if (!body?.member_id) {
    return NextResponse.json({ ok: false, error: "member_id requis" }, { status: 400 })
  }

  // Vérifier que ce n'est pas le dernier owner
  const { data: member } = await supabaseAdmin
    .from("agence_membres")
    .select("role")
    .eq("id", body.member_id)
    .single()
  if (member?.role === "owner") {
    const { count } = await supabaseAdmin
      .from("agence_membres")
      .select("id", { count: "exact", head: true })
      .eq("agence_id", id)
      .eq("role", "owner")
      .is("removed_at", null)
    if ((count || 0) <= 1) {
      return NextResponse.json({ ok: false, error: "Impossible de retirer le dernier owner" }, { status: 400 })
    }
  }

  const { error } = await supabaseAdmin
    .from("agence_membres")
    .update({ removed_at: new Date().toISOString() })
    .eq("id", body.member_id)
    .eq("agence_id", id)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
