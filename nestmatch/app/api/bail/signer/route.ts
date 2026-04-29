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
import { finalizeBail } from "@/lib/bail/finalize"
import { hashBailData, canonicalPayloadString } from "@/lib/bailHash"
import type { BailData } from "@/lib/bailPDF"

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
    pdfLuAt?: unknown
  }

  const annonceId = Number(p.annonceId)
  const role = typeof p.role === "string" ? p.role : ""
  const nom = typeof p.nom === "string" ? p.nom.trim() : ""
  const mention = typeof p.mention === "string" ? p.mention.trim() : ""
  const signaturePng = typeof p.signaturePng === "string" ? p.signaturePng : ""
  const bailHash = typeof p.bailHash === "string" ? p.bailHash : null
  // V32.2 — Le client envoie le timestamp ISO de lecture du PDF avant signature.
  // On valide qu'il s'agit d'une date valide ; sinon null (legacy clients).
  const pdfLuAtRaw = typeof p.pdfLuAt === "string" ? p.pdfLuAt : null
  const pdfLuAt = pdfLuAtRaw && !Number.isNaN(new Date(pdfLuAtRaw).getTime()) ? pdfLuAtRaw : null

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
  // V33.2 — Validation stricte mention (insensible accents/casse/espaces).
  // Avant : /lu et approuv/i.test(mention) — trop lâche, accepte "lu et approuvé"
  // sans "bon pour accord" → audit-trail eIDAS faible.
  const mentionNorm = mention
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[  ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  // V50.11 — STRICT equality (avant : .includes() acceptait "lu et approuve,
  // bon pour accord lu et approuve, bon pour accord" en doublon → V50.9 bug PDF).
  // Cas garant = canonical + suffixe libre " + caution solidaire à hauteur de X €".
  const CANONICAL = "lu et approuve, bon pour accord"
  const isStrictMatch = mentionNorm === CANONICAL
  const isGarantMatch = role === "garant" &&
    /^lu et approuve, bon pour accord([ ,].*)?caution solidaire/i.test(mentionNorm)
  if (!isStrictMatch && !isGarantMatch) {
    return NextResponse.json(
      { ok: false, error: 'La mention doit être recopiée exactement : "Lu et approuvé, bon pour accord" — c\'est une exigence légale.' },
      { status: 400 },
    )
  }
  if (role === "garant" && !/caution\s+solidaire/i.test(mention)) {
    return NextResponse.json(
      { ok: false, error: 'Garant : la mention doit inclure "caution solidaire à hauteur de [montant] €"' },
      { status: 400 },
    )
  }
  if (!signaturePng.startsWith("data:image/png;base64,")) {
    return NextResponse.json({ ok: false, error: "Signature PNG invalide" }, { status: 400 })
  }
  if (signaturePng.length > 500_000) {
    return NextResponse.json({ ok: false, error: "Signature trop lourde" }, { status: 413 })
  }

  // Vérifier que le signataire est bien le bon interlocuteur de l'annonce.
  // V23.3 — on récupère aussi prix/charges/date_debut_bail pour l'auto-
  // génération des loyers à double signature.
  const { data: annonce, error: errAnn } = await supabaseAdmin
    .from("annonces")
    .select("id, proprietaire_email, locataire_email, prix, charges, date_debut_bail, titre, ville")
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

  // V34.2 — Récupère le payload [BAIL_CARD] courant pour calculer le hash
  // SHA-256 canonique server-side. Stocké dans payload_snapshot pour
  // permettre une vérification d'intégrité ultérieure (anti-tampering).
  let payloadSnapshot: string | null = null
  let payloadHashSha256: string | null = null
  try {
    const { data: bailMsg } = await supabaseAdmin
      .from("messages")
      .select("contenu")
      .eq("annonce_id", annonceId)
      .ilike("contenu", "[BAIL_CARD]%")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (bailMsg?.contenu) {
      const raw = bailMsg.contenu.slice("[BAIL_CARD]".length)
      const bailData = JSON.parse(raw) as BailData
      payloadSnapshot = canonicalPayloadString(bailData)
      payloadHashSha256 = await hashBailData(bailData)
    }
  } catch (e) {
    // Silent fallback : si le payload n'est pas parseable, on signe quand
    // même (eIDAS niveau 1 ne requiert pas le PDF intégral).
    console.warn("[bail/signer] payload snapshot capture failed:", e)
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
      // V32.2 — Audit-trail eIDAS renforcé : on horodate le moment où le
      // signataire confirme avoir lu le PDF (case "J'ai lu intégralement").
      pdf_lu_avant_signature_at: pdfLuAt,
      // V34.2 — Snapshot canonique + hash SHA-256 pour anti-tampering.
      payload_snapshot: payloadSnapshot ? JSON.parse(payloadSnapshot) : null,
      payload_hash_sha256: payloadHashSha256,
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
    // V23.3 (Paul 2026-04-29) — auto-génère 12 mois de loyers à partir de
    // date_debut_bail (ou aujourd'hui si absent). Idempotent : skip si
    // au moins une row loyers existe déjà pour cet annonce_id. User a
    // explicitement validé V23.3 (audit V22.1 finding HIGH #5).
    try {
      const { data: existingLoyers } = await supabaseAdmin
        .from("loyers")
        .select("id")
        .eq("annonce_id", annonceId)
        .limit(1)
      if (!existingLoyers || existingLoyers.length === 0) {
        const dateDebutRaw = (annonce as { date_debut_bail?: string | null }).date_debut_bail
        const startDate = dateDebutRaw ? new Date(dateDebutRaw) : new Date()
        if (!Number.isFinite(startDate.getTime())) {
          startDate.setTime(Date.now())
        }
        const loyerHC = Number((annonce as { prix?: number | null }).prix ?? 0) || 0
        const charges = Number((annonce as { charges?: number | null }).charges ?? 0) || 0
        const totalCC = loyerHC + charges
        if (totalCC > 0) {
          // Génère 12 mois (durée bail meublé = 12, vide = 36 — on prend
          // 12 par défaut, le proprio peut étendre ensuite si nécessaire).
          const NB_MOIS = 12
          const rows: Array<{ annonce_id: number; mois: string; montant: number; statut: string; created_at: string }> = []
          for (let i = 0; i < NB_MOIS; i++) {
            const d = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1)
            const mois = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
            rows.push({
              annonce_id: annonceId,
              mois,
              montant: totalCC,
              statut: "déclaré",
              created_at: now,
            })
          }
          const { error: loyersErr } = await supabaseAdmin.from("loyers").insert(rows)
          if (loyersErr) {
            console.warn("[bail/signer] loyers auto-create failed:", loyersErr.message)
          }
        }
      }
    } catch (e) {
      console.warn("[bail/signer] loyers auto-create exception:", e)
    }

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
      // V50.16 — Auto-validate la candidature liée à ce bail. Si le proprio
      // a sauté l'étape "Valider candidat" et a signé direct, le locataire
      // restait bloqué sur "candidature en attente" pour proposer une visite.
      // Maintenant : à signature double, on flagge tous les messages de
      // candidature de ce locataire pour cette annonce comme `validee`.
      try {
        await supabaseAdmin
          .from("messages")
          .update({ statut_candidature: "validee" })
          .eq("annonce_id", annonceId)
          .eq("from_email", locEmail)
          .eq("type", "candidature")
          .neq("statut_candidature", "validee")
      } catch (e) {
        console.warn("[bail/signer] auto-validate candidature failed:", e)
      }

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

      // V32.5 — Email formel aux 2 parties avec PDF signé en pièce jointe.
      // Audit V31 R1.5 : avant cette feature, le succès de signature était
      // silencieux côté locataire (juste le message in-app), créant le doute
      // "ça a vraiment marché ?". Cet email (Resend) apporte la preuve écrite
      // + le PDF complet signé, et améliore la confiance produit.
      // Wrap try/catch : ne JAMAIS bloquer la réponse au signataire si l'email rate.
      try {
        await finalizeBail({
          annonceId,
          proprioEmail: propEmail,
          locataireEmail: locEmail,
          bienTitre: (annonce as { titre?: string | null }).titre ?? null,
          ville: (annonce as { ville?: string | null }).ville ?? null,
          prix: (annonce as { prix?: number | null }).prix ?? null,
          charges: (annonce as { charges?: number | null }).charges ?? null,
          dateDebutBail: (annonce as { date_debut_bail?: string | null }).date_debut_bail ?? null,
        })
      } catch (e) {
        console.error("[bail/signer] finalizeBail exception:", e)
      }
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
