/**
 * V36.3 — POST /api/bail/avenant/[id]/signer
 *
 * Signe un avenant (locataire OU proprio selon role détecté via session).
 *
 * Body : { mention: string, signaturePng: string }
 *   - mention : "Lu et approuvé, bon pour accord" (validation insensible accents/casse).
 *   - signaturePng : data:image/png;base64,...
 *
 * Side-effects :
 * - Update bail_avenants.signe_locataire_at OU signe_bailleur_at.
 * - Si les 2 ont signé → statut "actif" + propage le delta (nouveau_payload)
 *   aux colonnes annonces correspondantes (loyer, charges, locataire_email...).
 * - Insert message [AVENANT_SIGNE] dans le thread + notif autre partie.
 *
 * Auth : NextAuth + match locataire OU proprio de l'annonce liée à l'avenant.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync } from "@/lib/rateLimit"

interface RouteParams {
  params: Promise<{ id: string }>
}

function normaliserMention(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[  ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions)
  const userEmail = session?.user?.email?.toLowerCase()
  if (!userEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  // V64 — rate-limit aligné sur /api/bail/signer (5 sigs/h/user). La
  // signature avenant est un acte eIDAS niveau 1 ; on protège contre les
  // brute-forces / scripts qui itèrent sur des avenantIds après leak token.
  const rl = await checkRateLimitAsync(`avenant-sign:${userEmail}`, {
    max: 5,
    windowMs: 60 * 60 * 1000,
  })
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Trop de tentatives, réessayez plus tard" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 3600) } },
    )
  }

  const { id: avenantId } = await params
  if (!avenantId) {
    return NextResponse.json({ ok: false, error: "id avenant requis" }, { status: 400 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }
  const p = body as { mention?: unknown; signaturePng?: unknown }
  const mention = typeof p.mention === "string" ? p.mention.trim() : ""
  const signaturePng = typeof p.signaturePng === "string" ? p.signaturePng : ""

  // V50.11 — STRICT equality (avant : .includes() acceptait doublons → V50.9 bug PDF).
  if (normaliserMention(mention) !== "lu et approuve, bon pour accord") {
    return NextResponse.json({ ok: false, error: 'La mention doit être recopiée exactement : "Lu et approuvé, bon pour accord" — c\'est une exigence légale.' }, { status: 400 })
  }
  if (!signaturePng.startsWith("data:image/png;base64,")) {
    return NextResponse.json({ ok: false, error: "Signature PNG invalide" }, { status: 400 })
  }
  if (signaturePng.length > 500_000) {
    return NextResponse.json({ ok: false, error: "Signature trop lourde" }, { status: 413 })
  }

  // Récupère l'avenant + l'annonce associée
  const { data: avenant, error: errAv } = await supabaseAdmin
    .from("bail_avenants")
    .select("*")
    .eq("id", avenantId)
    .maybeSingle()
  if (errAv || !avenant) {
    return NextResponse.json({ ok: false, error: "Avenant introuvable" }, { status: 404 })
  }
  if (avenant.statut === "annule") {
    return NextResponse.json({ ok: false, error: "Avenant annulé" }, { status: 409 })
  }
  if (avenant.statut === "actif") {
    return NextResponse.json({ ok: false, error: "Avenant déjà actif" }, { status: 409 })
  }

  const { data: annonce } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, proprietaire_email, locataire_email")
    .eq("id", avenant.annonce_id)
    .maybeSingle()
  if (!annonce) {
    return NextResponse.json({ ok: false, error: "Annonce introuvable" }, { status: 404 })
  }
  const propEmail = (annonce.proprietaire_email || "").toLowerCase()
  const locEmail = (annonce.locataire_email || "").toLowerCase()
  let role: "locataire" | "proprietaire"
  if (userEmail === locEmail) role = "locataire"
  else if (userEmail === propEmail) role = "proprietaire"
  else return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 403 })

  // Vérifier que cette partie n'a pas déjà signé
  if (role === "locataire" && avenant.signe_locataire_at) {
    return NextResponse.json({ ok: false, error: "Vous avez déjà signé cet avenant" }, { status: 409 })
  }
  if (role === "proprietaire" && avenant.signe_bailleur_at) {
    return NextResponse.json({ ok: false, error: "Vous avez déjà signé cet avenant" }, { status: 409 })
  }

  const now = new Date().toISOString()

  // V62 — fix race condition double-signature concurrente.
  // Avant : on calculait `doubleSigne` à partir de l'état lu au début (avant
  // l'update). Si l'autre partie signait entre notre fetch et notre update,
  // sa signature était écrasée par notre statut "signe_locataire" /
  // "signe_proprio" → row avec les 2 timestamps mais statut faux + pas de
  // propagation au bail. On corrige en faisant l'update du timestamp sans
  // toucher au statut, puis on relit la row complète pour recalculer le
  // statut depuis l'état post-update.
  const sigCol = role === "locataire" ? "signe_locataire_at" : "signe_bailleur_at"
  const { data: afterUpdate, error: updErr } = await supabaseAdmin
    .from("bail_avenants")
    .update({ updated_at: now, [sigCol]: now })
    .eq("id", avenantId)
    .select("signe_locataire_at, signe_bailleur_at, statut, nouveau_payload")
    .single()
  if (updErr || !afterUpdate) {
    console.error("[avenant/signer] update failed", updErr)
    return NextResponse.json({ ok: false, error: "Mise à jour échouée" }, { status: 500 })
  }

  // Recalcule depuis l'état post-update (couvre la race concurrente).
  const doubleSigne = !!afterUpdate.signe_locataire_at && !!afterUpdate.signe_bailleur_at
  const newStatut = doubleSigne
    ? "actif"
    : afterUpdate.signe_locataire_at
      ? "signe_locataire"
      : "signe_proprio"
  if (newStatut !== afterUpdate.statut) {
    const { error: statutErr } = await supabaseAdmin
      .from("bail_avenants")
      .update({ statut: newStatut })
      .eq("id", avenantId)
      // Ne re-écrase pas un statut déjà passé à "actif" (idempotent contre
      // un autre worker qui aurait gagné la course).
      .neq("statut", "actif")
    if (statutErr) {
      console.warn("[avenant/signer] statut update failed (non bloquant):", statutErr)
    }
  }

  // Si double signature : propage le delta au bail principal (annonces).
  // On accepte un sous-ensemble de champs whitelisté pour éviter qu'un avenant
  // mal-formé écrase n'importe quoi.
  const PROPAGEABLE_KEYS = new Set([
    "prix", "charges", "caution", "locataire_email", "meuble", "surface", "pieces",
    "etage", "ascenseur", "balcon", "terrasse", "jardin", "cave", "fibre", "parking",
  ])
  if (doubleSigne && afterUpdate.nouveau_payload && typeof afterUpdate.nouveau_payload === "object") {
    const delta: Record<string, unknown> = {}
    const np = afterUpdate.nouveau_payload as Record<string, unknown>
    for (const k of Object.keys(np)) {
      if (PROPAGEABLE_KEYS.has(k)) delta[k] = np[k]
    }
    if (Object.keys(delta).length > 0) {
      const { error: propErr } = await supabaseAdmin
        .from("annonces")
        .update(delta)
        .eq("id", avenant.annonce_id)
      if (propErr) {
        console.warn("[avenant/signer] propagation delta failed (non bloquant):", propErr)
      }
    }
  }

  // Message in-app + notif à l'autre partie
  const autre = role === "locataire" ? propEmail : locEmail
  if (autre) {
    const payload = JSON.stringify({
      avenantId,
      numero: avenant.numero,
      type: avenant.type,
      titre: avenant.titre,
      signedByRole: role,
      doubleSigne,
      annonceId: avenant.annonce_id,
    })
    await supabaseAdmin.from("messages").insert([{
      from_email: userEmail,
      to_email: autre,
      contenu: `[AVENANT_SIGNE]${payload}`,
      lu: false,
      annonce_id: avenant.annonce_id,
      created_at: now,
    }])
    await supabaseAdmin.from("notifications").insert([{
      user_email: autre,
      type: doubleSigne ? "avenant_actif" : "avenant_signe",
      title: doubleSigne ? `Avenant N°${avenant.numero} actif` : `Avenant N°${avenant.numero} signé par ${role === "locataire" ? "le locataire" : "le bailleur"}`,
      body: doubleSigne
        ? `${avenant.titre} — modifications appliquées au bail.`
        : `${avenant.titre} — à votre tour de signer pour valider.`,
      href: role === "locataire" ? `/proprietaire/bail/${avenant.annonce_id}` : "/mon-logement",
      related_id: String(avenant.annonce_id),
      lu: false,
      created_at: now,
    }])
  }

  return NextResponse.json({ ok: true, doubleSigne, statut: newStatut })
}
