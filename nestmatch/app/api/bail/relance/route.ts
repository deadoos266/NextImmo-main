/**
 * V32.6/V32.7 — Relance signature bail.
 * Audit produit V31 R1.6 (rappels J+3/J+7) + R1.7 (bouton renvoyer).
 *
 * 2 modes :
 * 1. POST manuel par le proprio depuis /proprietaire/bail/[id] :
 *    body = { annonceId, mode: "manual" }
 *    Auth : NextAuth + match proprietaire_email.
 *    Rate-limit naturel : refuse si bail_relance_at < 24h.
 *
 * 2. POST auto depuis silent fetch au mount du dashboard proprio :
 *    body = { annonceId, mode: "auto" }
 *    Auth : NextAuth (proprio). Le serveur calcule J+3/J+7 et envoie
 *    seulement si la fenêtre est dans la cible ET pas de relance récente.
 *
 * Side-effects :
 * - Send email Resend au locataire (template bailInvitationRelance).
 * - Insert message [BAIL_RELANCE] dans le thread.
 * - Update annonces.bail_relance_at = now.
 * - Notif cloche locataire.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { sendEmail } from "@/lib/email/resend"

const MIN_RELANCE_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24h
const J3_MS = 3 * 24 * 60 * 60 * 1000
const J7_MS = 7 * 24 * 60 * 60 * 1000

function buildEmail(params: {
  proprioName: string
  bienTitre: string
  ville: string | null
  loyerCC: number
  jours: number
  signUrl: string
}): { subject: string; html: string; text: string } {
  const contexte = params.ville ? `${params.bienTitre} à ${params.ville}` : params.bienTitre
  const html = `<div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#F7F4EF;color:#111;">
  <h1 style="font-size:22px;font-weight:800;margin:0 0 12px;">Rappel : votre bail KeyMatch attend votre signature</h1>
  <p style="margin:0 0 14px;line-height:1.6;color:#4b5563;">
    Il y a ${params.jours} jours, <strong>${params.proprioName}</strong> vous a envoyé le bail pour <strong>${contexte}</strong>. Il n'est pas encore signé.
  </p>
  <p style="margin:0 0 18px;line-height:1.6;color:#4b5563;">
    Loyer charges comprises : <strong>${params.loyerCC.toLocaleString("fr-FR")} €/mois</strong>.
  </p>
  <a href="${params.signUrl}" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;">Signer le bail maintenant →</a>
  <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
    Si vous avez changé d'avis ou si ce bail ne vous concerne plus, contactez votre propriétaire via la messagerie KeyMatch.
  </p>
</div>`
  const text = `Rappel : votre bail KeyMatch attend votre signature.

Il y a ${params.jours} jours, ${params.proprioName} vous a envoyé le bail pour ${contexte}. Il n'est pas encore signé.

Loyer CC : ${params.loyerCC.toLocaleString("fr-FR")} €/mois

Signer le bail maintenant : ${params.signUrl}

— L'équipe KeyMatch`
  return {
    subject: `Rappel : votre bail KeyMatch attend votre signature — ${params.bienTitre}`,
    html,
    text,
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userEmail = session?.user?.email?.toLowerCase()
  if (!userEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 }) }

  const p = body as { annonceId?: unknown; mode?: unknown }
  const annonceId = Number(p.annonceId)
  const mode = p.mode === "auto" ? "auto" : "manual"
  if (!annonceId || !Number.isFinite(annonceId)) {
    return NextResponse.json({ ok: false, error: "annonceId invalide" }, { status: 400 })
  }

  const { data: annonce, error: errAnn } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, ville, prix, charges, proprietaire_email, locataire_email, bail_genere_at, bail_relance_at, bail_signe_locataire_at")
    .eq("id", annonceId)
    .single()
  if (errAnn || !annonce) {
    return NextResponse.json({ ok: false, error: "Annonce introuvable" }, { status: 404 })
  }

  // Auth : seul le propriétaire peut déclencher
  const propEmail = (annonce.proprietaire_email || "").toLowerCase()
  if (propEmail !== userEmail) {
    return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 403 })
  }

  // Pas de bail envoyé → rien à relancer
  if (!annonce.bail_genere_at) {
    return NextResponse.json({ ok: false, error: "Aucun bail envoyé pour cette annonce" }, { status: 400 })
  }
  // Locataire déjà signé → noop (succès silencieux pour le mode auto)
  if (annonce.bail_signe_locataire_at) {
    return NextResponse.json({ ok: true, skipped: "already_signed" })
  }
  const locEmail = (annonce.locataire_email || "").toLowerCase()
  if (!locEmail) {
    return NextResponse.json({ ok: false, error: "Pas de locataire associé" }, { status: 400 })
  }

  // Rate-limit : pas de relance dans les 24h précédentes
  const lastRelance = annonce.bail_relance_at ? new Date(annonce.bail_relance_at).getTime() : 0
  const now = Date.now()
  if (lastRelance && now - lastRelance < MIN_RELANCE_INTERVAL_MS) {
    return NextResponse.json({ ok: false, error: "Une relance a déjà été envoyée récemment", skipped: "throttled" }, { status: 429 })
  }

  // Mode auto : ne déclenche que dans les fenêtres J+3 ou J+7 (±12h)
  const baseAt = new Date(annonce.bail_genere_at).getTime()
  const elapsed = now - baseAt
  const nbJours = Math.floor(elapsed / (24 * 60 * 60 * 1000))
  if (mode === "auto") {
    const inJ3Window = elapsed >= J3_MS - 12 * 3600 * 1000 && elapsed <= J3_MS + 12 * 3600 * 1000
    const inJ7Window = elapsed >= J7_MS - 12 * 3600 * 1000 && elapsed <= J7_MS + 12 * 3600 * 1000
    if (!inJ3Window && !inJ7Window) {
      return NextResponse.json({ ok: true, skipped: "out_of_window", nbJours })
    }
  }

  // Send email
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://keymatch-immo.fr"
  const signUrl = `${baseUrl}/messages?with=${encodeURIComponent(propEmail)}&annonce=${annonceId}`
  const loyerCC = Number(annonce.prix || 0) + Number(annonce.charges || 0)
  // Récupère le nom du proprio depuis profils si dispo
  const { data: proprioProfil } = await supabaseAdmin
    .from("profils")
    .select("prenom, nom")
    .eq("email", propEmail)
    .maybeSingle()
  const proprioName =
    [proprioProfil?.prenom, proprioProfil?.nom].filter(Boolean).join(" ").trim() || propEmail

  const tpl = buildEmail({
    proprioName,
    bienTitre: annonce.titre || "Logement",
    ville: annonce.ville || null,
    loyerCC,
    jours: Math.max(nbJours, 1),
    signUrl,
  })

  const sendRes = await sendEmail({
    to: locEmail,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    tags: [
      { name: "type", value: "bail_relance" },
      { name: "mode", value: mode },
    ],
  })

  // Update timestamp même si l'email a été skipped (pas de RESEND_API_KEY) —
  // évite les retries en boucle.
  const nowIso = new Date().toISOString()
  await supabaseAdmin.from("annonces").update({ bail_relance_at: nowIso }).eq("id", annonceId)

  // Message in-app + notif
  await supabaseAdmin.from("messages").insert([
    {
      from_email: propEmail,
      to_email: locEmail,
      contenu: `[BAIL_RELANCE]Rappel : votre bail attend votre signature depuis ${nbJours} jour${nbJours > 1 ? "s" : ""}.`,
      lu: false,
      annonce_id: annonceId,
      created_at: nowIso,
    },
  ])
  await supabaseAdmin.from("notifications").insert([
    {
      user_email: locEmail,
      type: "bail_relance",
      title: "Rappel : bail à signer",
      body: `Votre bail pour « ${annonce.titre || "votre logement"} » attend votre signature.`,
      href: signUrl,
      related_id: String(annonceId),
      lu: false,
      created_at: nowIso,
    },
  ])

  return NextResponse.json({
    ok: true,
    sent: sendRes.ok,
    skipped: sendRes.ok === false && sendRes.skipped ? "no_resend_key" : undefined,
    nbJours,
  })
}
