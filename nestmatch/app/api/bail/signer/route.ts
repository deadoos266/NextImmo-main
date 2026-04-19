/**
 * POST /api/bail/signer — Signature électronique d'un bail (niveau eIDAS 1).
 *
 * Le locataire signe le bail depuis sa messagerie après réception de la
 * BailCard. L'acte de signature capture :
 *   - l'identité confirmée (email NextAuth + nom saisi)
 *   - la mention manuscrite "Lu et approuvé, bon pour accord"
 *   - le tracé canvas (PNG base64)
 *   - l'IP et user-agent
 *   - un hash SHA-256 du payload du bail (preuve d'intégrité)
 *   - un timestamp serveur
 *
 * Conformité : article 1366 du Code civil + règlement UE 910/2014 (eIDAS).
 * Niveau simple = suffisant pour un bail d'habitation civil (non notarié).
 *
 * Body : {
 *   annonceId: number,
 *   role: 'locataire' | 'bailleur' | 'garant',
 *   nom: string,
 *   mention: string,      // doit contenir "Lu et approuvé"
 *   signaturePng: string, // data:image/png;base64,...
 *   bailHash: string,     // SHA-256 du payload
 * }
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const signataireEmail = session?.user?.email?.toLowerCase()
  if (!signataireEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  // Rate-limit agressif : 5 signatures / heure / user (anti-abus)
  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`bail-sign:${signataireEmail}`, {
    max: 5,
    windowMs: 60 * 60 * 1000,
  })
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Trop de tentatives, réessayez plus tard" },
      { status: 429 },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }

  const p = body as {
    annonceId?: unknown
    role?: unknown
    nom?: unknown
    mention?: unknown
    signaturePng?: unknown
    bailHash?: unknown
  }

  const annonceId = Number(p.annonceId)
  const role = typeof p.role === "string" ? p.role : ""
  const nom = typeof p.nom === "string" ? p.nom.trim() : ""
  const mention = typeof p.mention === "string" ? p.mention.trim() : ""
  const signaturePng = typeof p.signaturePng === "string" ? p.signaturePng : ""
  const bailHash = typeof p.bailHash === "string" ? p.bailHash : null

  // Validation
  if (!annonceId || !Number.isFinite(annonceId)) {
    return NextResponse.json({ ok: false, error: "annonceId invalide" }, { status: 400 })
  }
  if (!["locataire", "bailleur", "garant"].includes(role)) {
    return NextResponse.json({ ok: false, error: "role invalide" }, { status: 400 })
  }
  if (nom.length < 2) {
    return NextResponse.json({ ok: false, error: "Nom trop court" }, { status: 400 })
  }
  if (!/lu et approuv/i.test(mention)) {
    return NextResponse.json(
      { ok: false, error: 'Mention "Lu et approuvé" requise' },
      { status: 400 },
    )
  }
  if (!signaturePng.startsWith("data:image/png;base64,")) {
    return NextResponse.json({ ok: false, error: "Signature PNG invalide" }, { status: 400 })
  }
  if (signaturePng.length > 500_000) {
    return NextResponse.json({ ok: false, error: "Signature trop lourde" }, { status: 413 })
  }

  // Vérifier que le signataire est bien le bon interlocuteur de l'annonce
  const { data: annonce, error: errAnn } = await supabaseAdmin
    .from("annonces")
    .select("id, proprietaire_email, locataire_email")
    .eq("id", annonceId)
    .single()
  if (errAnn || !annonce) {
    return NextResponse.json({ ok: false, error: "Annonce introuvable" }, { status: 404 })
  }

  const expectedEmail =
    role === "locataire"
      ? (annonce.locataire_email || "").toLowerCase()
      : role === "bailleur"
        ? (annonce.proprietaire_email || "").toLowerCase()
        : signataireEmail // garant : pas de vérif stricte (pas en DB annonces)
  if (role !== "garant" && expectedEmail !== signataireEmail) {
    return NextResponse.json(
      { ok: false, error: "Vous n'êtes pas autorisé à signer ce bail en tant que " + role },
      { status: 403 },
    )
  }

  // Upsert signature (unique par annonce+email+role)
  const userAgent = req.headers.get("user-agent") || ""
  const { error: errIns } = await supabaseAdmin.from("bail_signatures").upsert(
    {
      annonce_id: annonceId,
      signataire_email: signataireEmail,
      signataire_nom: nom,
      signataire_role: role,
      signature_png: signaturePng,
      mention,
      bail_hash: bailHash,
      ip_address: ip,
      user_agent: userAgent,
      signe_at: new Date().toISOString(),
    },
    { onConflict: "annonce_id,signataire_email,signataire_role" },
  )
  if (errIns) {
    console.error("[bail/signer] insert error:", errIns)
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 })
  }

  // Update annonces avec timestamp du rôle signataire (raccourci pour les queries)
  const patch: Record<string, string> = {}
  const now = new Date().toISOString()
  if (role === "locataire") {
    patch.bail_signe_locataire_at = now
    // La signature locataire fait basculer le bien de "bail_envoye" à "loué".
    // Le bien devient officiellement loué dès l'acceptation du locataire.
    patch.statut = "loué"
  }
  if (role === "bailleur") patch.bail_signe_bailleur_at = now
  if (Object.keys(patch).length > 0) {
    await supabaseAdmin.from("annonces").update(patch).eq("id", annonceId)
  }

  // Détection double-signature (locataire + bailleur) → envoyer message EDL_A_PLANIFIER
  // pour inviter les deux parties à faire l'état des lieux d'entrée.
  const { data: allSigs } = await supabaseAdmin
    .from("bail_signatures")
    .select("signataire_role")
    .eq("annonce_id", annonceId)
  const roles = new Set((allSigs || []).map(s => s.signataire_role))
  roles.add(role) // inclure la signature qu'on vient d'insérer
  const doubleSigne = roles.has("locataire") && roles.has("bailleur")

  if (doubleSigne) {
    // Vérifier qu'on n'a pas déjà envoyé ce message (évite doublons en cas de double-clic)
    const propEmail = (annonce.proprietaire_email || "").toLowerCase()
    const locEmail = (annonce.locataire_email || "").toLowerCase()
    const { data: existingMsg } = await supabaseAdmin
      .from("messages")
      .select("id")
      .eq("annonce_id", annonceId)
      .ilike("contenu", "[EDL_A_PLANIFIER]%")
      .limit(1)
      .maybeSingle()

    if (!existingMsg && propEmail && locEmail) {
      const payload = JSON.stringify({ annonceId, bienTitre: "", dateSignature: now })
      // Message envoyé par l'API → from = proprio (pour rester cohérent côté UI)
      await supabaseAdmin.from("messages").insert([
        {
          from_email: propEmail,
          to_email: locEmail,
          contenu: `[EDL_A_PLANIFIER]${payload}`,
          lu: false,
          annonce_id: annonceId,
          created_at: now,
        },
      ])
      // Notif cloche pour les deux parties
      await supabaseAdmin.from("notifications").insert([
        {
          user_email: propEmail,
          type: "bail_signe",
          title: "Bail pleinement signé",
          body: "Vous pouvez maintenant créer l'état des lieux d'entrée.",
          href: `/proprietaire/edl/${annonceId}`,
          related_id: String(annonceId),
          lu: false,
          created_at: now,
        },
        {
          user_email: locEmail,
          type: "bail_signe",
          title: "Bail pleinement signé",
          body: "Prochaine étape : état des lieux d'entrée avec votre bailleur.",
          href: "/mon-logement",
          related_id: String(annonceId),
          lu: false,
          created_at: now,
        },
      ])
    }
  }

  // Notifier l'autre partie (via message système + notif cloche)
  const autre =
    role === "locataire"
      ? (annonce.proprietaire_email || "").toLowerCase()
      : role === "bailleur"
        ? (annonce.locataire_email || "").toLowerCase()
        : ""
  if (autre && autre !== signataireEmail) {
    const notif = JSON.stringify({
      role,
      nom,
      dateSignature: now,
      annonceId,
    })
    const { error: bsMsgErr } = await supabaseAdmin.from("messages").insert([
      {
        from_email: signataireEmail,
        to_email: autre,
        contenu: `[BAIL_SIGNE]${notif}`,
        lu: false,
        annonce_id: annonceId,
        created_at: now,
      },
    ])
    if (bsMsgErr) console.error("[bail/signer] insert BAIL_SIGNE message:", bsMsgErr)
    // Notif cloche
    const { error: bsNotifErr } = await supabaseAdmin.from("notifications").insert([
      {
        user_email: autre,
        type: "bail_signe",
        title: "Bail signé",
        body: `${nom} a signé le bail${role === "locataire" ? " en tant que locataire" : role === "bailleur" ? " en tant que bailleur" : " en tant que garant"}.`,
        href: "/messages",
        related_id: String(annonceId),
        lu: false,
        created_at: now,
      },
    ])
    if (bsNotifErr) console.error("[bail/signer] insert bail_signe notif:", bsNotifErr)
  }

  return NextResponse.json({ ok: true, signedAt: now })
}
