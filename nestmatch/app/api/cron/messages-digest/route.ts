/**
 * V59.3 — GET /api/cron/messages-digest
 *
 * Cron quotidien 8h pour les users en mode `notif_preferences.message_recu_mode = "digest"`.
 *
 * Logique :
 *   1. Récupère tous les profils où notif_preferences->>'message_recu_mode' = 'digest'
 *      ET notif_preferences->>'message_recu' != 'false' (master toggle ON)
 *   2. Pour chaque user, récupère messages reçus depuis last_digest_at
 *      (ou fallback 24h glissantes), unread (lu=false), exclut les messages
 *      système (préfixés [BAIL_CARD], [DOSSIER_CARD], etc.)
 *   3. Si ≥ 1 → envoie digest avec liste compactée par conversation
 *      (sender + bien + nbMsg + dernier preview)
 *   4. Update messages_emails_log.last_digest_at = now()
 *
 * Auth : Bearer CRON_SECRET en prod.
 *
 * Schedule : `0 8 * * *` (vercel.json) — 8h matin Europe/Paris.
 */

import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { sendEmail } from "@/lib/email/resend"
import { messagesDigestTemplate } from "@/lib/email/templates"
import { displayName } from "@/lib/privacy"

interface ProfilDigest {
  email: string
  prenom: string | null
  nom: string | null
  notif_preferences: Record<string, unknown> | null
}

interface MsgRow {
  id: number
  from_email: string | null
  to_email: string | null
  contenu: string | null
  annonce_id: number | null
  created_at: string
}

// Préfixes système — exclu du digest (pas des "vrais messages")
const SYSTEM_PREFIXES = [
  "[BAIL_CARD]", "[BAIL_SIGNE]", "[BAIL_REFUSE]", "[BAIL_FINAL_PDF]",
  "[BAIL_RELANCE]", "[BAIL_RELANCE_LOCATAIRE]",
  "[DOSSIER_CARD]", "[DEMANDE_DOSSIER]",
  "[EDL_CARD]", "[EDL_A_PLANIFIER]",
  "[VISITE_CONFIRMEE]", "[VISITE_DEMANDE]",
  "[CANDIDATURE_VALIDEE]", "[CANDIDATURE_RETIREE]", "[CANDIDATURE_DEVALIDEE]",
  "[CANDIDATURE_NON_RETENUE]", "[LOCATION_ACCEPTEE]",
  "[QUITTANCE_CARD]", "[LOYER_PAYE]", "[AUTO_PAIEMENT_DEMANDE]",
  "[PREAVIS]", "[RETRAIT_CANDIDATURE]",
  "[DEPOT_RESTITUE]", "[SOLDE_TOUT_COMPTE]",
]

function isSystemMessage(contenu: string | null): boolean {
  if (!contenu) return true
  return SYSTEM_PREFIXES.some(p => contenu.startsWith(p))
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (secret && auth !== `Bearer ${secret}` && process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const base = process.env.NEXT_PUBLIC_URL || "https://keymatch-immo.fr"
  const stats = { profils_scannes: 0, digests_envoyes: 0, skipped: 0, errors: 0 }

  // ─── 1. Récupère les users en mode "digest" ────────────────────────────
  // Filtre via JSONB : notif_preferences->>'message_recu_mode' = 'digest'
  // (Postgres : @> operator. On utilise filter sur le jsonb path.)
  const { data: profils, error } = await supabaseAdmin
    .from("profils")
    .select("email, prenom, nom, notif_preferences")
    .filter("notif_preferences->>message_recu_mode", "eq", "digest")
  if (error) {
    console.error("[cron/messages-digest] fetch profils error:", error)
    return NextResponse.json({ ok: false, error: "DB error" }, { status: 500 })
  }
  stats.profils_scannes = (profils || []).length

  // ─── 2. Pour chaque user, récupère messages unread depuis last_digest ──
  for (const p of (profils || []) as ProfilDigest[]) {
    const receiverEmail = p.email.toLowerCase()
    const prefs = (p.notif_preferences || {}) as Record<string, unknown>
    // Master toggle off : skip
    if (prefs.message_recu === false) { stats.skipped++; continue }

    // Récupère le timestamp du dernier digest envoyé à ce receiver
    const { data: lastDigestRow } = await supabaseAdmin
      .from("messages_emails_log")
      .select("last_digest_at")
      .eq("receiver_email", receiverEmail)
      .not("last_digest_at", "is", null)
      .order("last_digest_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const since = lastDigestRow?.last_digest_at
      ? new Date(lastDigestRow.last_digest_at).toISOString()
      : new Date(now.getTime() - 24 * 3600 * 1000).toISOString()

    // Messages reçus depuis `since`, non lus, non système
    const { data: msgs } = await supabaseAdmin
      .from("messages")
      .select("id, from_email, to_email, contenu, annonce_id, created_at")
      .eq("to_email", receiverEmail)
      .eq("lu", false)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
    const realMessages = (msgs || []).filter((m: MsgRow) => !isSystemMessage(m.contenu))
    if (realMessages.length === 0) { stats.skipped++; continue }

    // ─── 3. Group par conversation (from_email + annonce_id) ─────────────
    const convMap = new Map<string, {
      senderEmail: string
      annonceId: number | null
      nbMessages: number
      lastPreview: string
      lastCreated: string
    }>()
    for (const m of realMessages) {
      const sender = (m.from_email || "").toLowerCase()
      const key = `${sender}::${m.annonce_id ?? "null"}`
      const existing = convMap.get(key)
      const preview = (m.contenu || "").slice(0, 200)
      if (!existing) {
        convMap.set(key, { senderEmail: sender, annonceId: m.annonce_id, nbMessages: 1, lastPreview: preview, lastCreated: m.created_at })
      } else {
        existing.nbMessages++
        existing.lastPreview = preview
        existing.lastCreated = m.created_at
      }
    }
    const convs = Array.from(convMap.values()).sort((a, b) => new Date(b.lastCreated).getTime() - new Date(a.lastCreated).getTime())

    // ─── 4. Hydrate sender names + bien titres ───────────────────────────
    const senderEmails = Array.from(new Set(convs.map(c => c.senderEmail))).filter(Boolean)
    const annonceIds = Array.from(new Set(convs.map(c => c.annonceId).filter((id): id is number => id !== null)))
    const [senderProfils, annonces] = await Promise.all([
      senderEmails.length > 0
        ? supabaseAdmin.from("profils").select("email, prenom, nom").in("email", senderEmails)
        : Promise.resolve({ data: [] as Array<{ email: string; prenom: string | null; nom: string | null }> }),
      annonceIds.length > 0
        ? supabaseAdmin.from("annonces").select("id, titre").in("id", annonceIds)
        : Promise.resolve({ data: [] as Array<{ id: number; titre: string | null }> }),
    ])
    const senderName = new Map<string, string>()
    for (const sp of (senderProfils.data || [])) {
      const fullName = [sp.prenom, sp.nom].filter(Boolean).join(" ").trim()
      senderName.set(sp.email.toLowerCase(), fullName || displayName(sp.email, null) || sp.email)
    }
    const annonceTitre = new Map<number, string>()
    for (const a of (annonces.data || [])) {
      if (a.titre) annonceTitre.set(a.id, a.titre)
    }

    const conversationsForTemplate = convs.map(c => ({
      senderName: senderName.get(c.senderEmail) || displayName(c.senderEmail, null) || c.senderEmail,
      senderEmail: c.senderEmail,
      bienTitre: c.annonceId ? (annonceTitre.get(c.annonceId) || null) : null,
      nbMessages: c.nbMessages,
      lastPreview: c.lastPreview,
      convUrl: `${base}/messages?with=${encodeURIComponent(c.senderEmail)}${c.annonceId ? `&annonce=${c.annonceId}` : ""}`,
    }))

    // ─── 5. Envoie le digest ─────────────────────────────────────────────
    try {
      const tpl = messagesDigestTemplate({
        receiverName: [p.prenom, p.nom].filter(Boolean).join(" ").trim() || displayName(receiverEmail, null) || receiverEmail,
        conversations: conversationsForTemplate,
        totalMessages: realMessages.length,
      })
      const result = await sendEmail({
        to: receiverEmail,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        tags: [
          { name: "category", value: "messages_digest" },
          { name: "convs", value: String(conversationsForTemplate.length) },
        ],
      })
      if (result.ok) {
        // Update last_digest_at
        await supabaseAdmin.from("messages_emails_log").insert({
          receiver_email: receiverEmail,
          conversation_key: "__DIGEST__",
          sent_at: new Date().toISOString(),
          last_digest_at: new Date().toISOString(),
        })
        stats.digests_envoyes++
      } else {
        stats.errors++
      }
    } catch (e) {
      console.warn("[cron/messages-digest] send failed for", receiverEmail, e)
      stats.errors++
    }
  }

  return NextResponse.json({ ok: true, stats, ranAt: now.toISOString() })
}
