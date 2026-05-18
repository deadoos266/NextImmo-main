/**
 * V97.39.34 — PATCH /api/admin/agences/[id]
 *
 * Valide ou refuse une agence inscrite. Admin only.
 *
 * Body JSON :
 *   { action: "valider" }
 *   { action: "refuser", reason: "<motif>" }
 *   { action: "banir", reason: "<motif>" }
 *   { action: "reset_pending" }  // remet en attente après refus
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { sendEmail } from "@/lib/email"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface PatchBody {
  action: "valider" | "refuser" | "banir" | "reset_pending"
  reason?: string
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }
  const adminEmail = session.user.email!.toLowerCase()

  const { id } = await ctx.params
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    return NextResponse.json({ ok: false, error: "ID invalide" }, { status: 400 })
  }

  const body = (await req.json().catch(() => null)) as PatchBody | null
  if (!body?.action) {
    return NextResponse.json({ ok: false, error: "action requise" }, { status: 400 })
  }

  // Fetch agence
  const { data: agence, error: fetchErr } = await supabaseAdmin
    .from("agences")
    .select("id, name, email, slug, statut")
    .eq("id", id)
    .single()

  if (fetchErr || !agence) {
    return NextResponse.json({ ok: false, error: "Agence introuvable" }, { status: 404 })
  }

  let update: Record<string, unknown> = {}
  let emailSubject = ""
  let emailHtml = ""

  switch (body.action) {
    case "valider":
      update = {
        statut: "active",
        validated_at: new Date().toISOString(),
        validated_by: adminEmail,
        refused_reason: null,
      }
      emailSubject = `✓ Votre agence ${agence.name} est validée sur KeyMatch`
      emailHtml = `
        <p>Bonjour,</p>
        <p>Votre agence <strong>${escapeHtml(agence.name)}</strong> vient d'être validée par l'équipe KeyMatch après vérification de votre carte professionnelle T.</p>
        <p>Vous pouvez dès maintenant :</p>
        <ul>
          <li>Publier vos premières annonces au nom de votre agence</li>
          <li>Personnaliser votre page agence publique : <a href="https://keymatch-immo.fr/agence/${agence.slug}">keymatch-immo.fr/agence/${agence.slug}</a></li>
        </ul>
        <p>L'équipe KeyMatch</p>
      `
      break

    case "refuser":
      if (!body.reason) {
        return NextResponse.json({ ok: false, error: "reason requise pour refuser" }, { status: 400 })
      }
      update = {
        statut: "refused",
        refused_reason: body.reason,
        validated_at: null,
        validated_by: adminEmail,
      }
      emailSubject = `Votre inscription agence ${agence.name} — action requise`
      emailHtml = `
        <p>Bonjour,</p>
        <p>Votre inscription pour l'agence <strong>${escapeHtml(agence.name)}</strong> n'a pas pu être validée pour la raison suivante :</p>
        <p style="padding: 12px; background: #FFF3CD; border-left: 4px solid #F0AD4E;">${escapeHtml(body.reason)}</p>
        <p>Vous pouvez corriger les informations en répondant à cet email ou en contactant <a href="mailto:contact@keymatch-immo.fr">contact@keymatch-immo.fr</a>.</p>
        <p>L'équipe KeyMatch</p>
      `
      break

    case "banir":
      if (!body.reason) {
        return NextResponse.json({ ok: false, error: "reason requise pour bannir" }, { status: 400 })
      }
      update = {
        statut: "banned",
        refused_reason: body.reason,
      }
      emailSubject = `Suspension du compte agence ${agence.name}`
      emailHtml = `
        <p>Bonjour,</p>
        <p>Votre compte agence <strong>${escapeHtml(agence.name)}</strong> a été suspendu pour la raison suivante :</p>
        <p>${escapeHtml(body.reason)}</p>
        <p>Pour contester, contactez <a href="mailto:contact@keymatch-immo.fr">contact@keymatch-immo.fr</a>.</p>
      `
      break

    case "reset_pending":
      update = {
        statut: "pending",
        validated_at: null,
        validated_by: null,
        refused_reason: null,
      }
      break

    default:
      return NextResponse.json({ ok: false, error: "action inconnue" }, { status: 400 })
  }

  const { error: updErr } = await supabaseAdmin
    .from("agences")
    .update(update)
    .eq("id", id)

  if (updErr) {
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 })
  }

  // Send notification email (best-effort, non-blocking)
  if (emailSubject && emailHtml && agence.email) {
    try {
      await sendEmail({
        to: agence.email,
        subject: emailSubject,
        html: emailHtml,
        templateName: `agence_${body.action}`,
        tags: [{ name: "template", value: `agence_${body.action}` }],
      })
    } catch (e) {
      console.warn("[admin/agences] email notify failed:", e)
    }
  }

  return NextResponse.json({ ok: true, action: body.action, agence_id: id })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
