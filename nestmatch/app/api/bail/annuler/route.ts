/**
 * V69.1c — POST /api/bail/annuler
 *
 * Résiliation amiable d'un bail actif (les 2 parties d'accord). Différent de
 * /api/bail/preavis (procédure légale avec délai) et de
 * /api/annonces/terminer-bail (fin unilatérale).
 *
 * Use case : locataire et proprio s'entendent pour mettre fin au bail
 * rapidement (départ anticipé, accord, etc.). Pas de délai légal imposé.
 *
 * Body : { annonce_id, raison, date_effet?, accord_ecrit? }
 *
 * Effets :
 *   1. Vérification : les 2 parties doivent confirmer (workflow 2 étapes).
 *      a) Premier appel = qui demande l'annulation → pose flag pending +
 *         insert message [BAIL_ANNULER_PROPOSE] avec accord_id.
 *      b) Deuxième appel = autre partie qui confirme → exécution réelle.
 *   2. Sur exécution : update annonces.statut = 'archive_amiable' +
 *      bail_termine_at = date_effet OU now.
 *   3. Insert message [BAIL_ANNULE] avec PDF "Résiliation amiable" (à venir).
 *   4. Notif cloche les 2 + email.
 *   5. Le proprio doit ensuite restituer dépôt + EDL sortie via les routes
 *      existantes.
 *
 * Sécurité : NextAuth + check participant + bail double-signé requis.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync } from "@/lib/rateLimit"

export const runtime = "nodejs"

const PREFIX_PROPOSE = "[BAIL_ANNULER_PROPOSE]"
const PREFIX_ANNULE = "[BAIL_ANNULE]"

interface Body {
  annonce_id?: string | number
  raison?: string
  date_effet?: string
  accord_ecrit?: boolean
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userEmail = session?.user?.email?.toLowerCase()
  if (!userEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  const rl = await checkRateLimitAsync(`bail-annuler:${userEmail}`, { max: 3, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Trop de tentatives — patientez 1h." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 3600) } },
    )
  }

  let body: Body
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 })
  }
  const annonceId = Number(body.annonce_id)
  if (!Number.isFinite(annonceId) || annonceId <= 0) {
    return NextResponse.json({ ok: false, error: "annonce_id invalide" }, { status: 400 })
  }
  const raison = typeof body.raison === "string" ? body.raison.trim().slice(0, 1000) : ""
  if (raison.length < 10) {
    return NextResponse.json({ ok: false, error: "Précisez la raison (10 caractères min)." }, { status: 400 })
  }
  const dateEffetRaw = typeof body.date_effet === "string" ? body.date_effet.trim() : ""
  let dateEffet: string | null = null
  if (dateEffetRaw) {
    const ms = new Date(dateEffetRaw).getTime()
    if (!Number.isFinite(ms)) {
      return NextResponse.json({ ok: false, error: "date_effet invalide" }, { status: 400 })
    }
    // date_effet ne peut pas être dans le passé (>24h)
    if (ms < Date.now() - 24 * 3600 * 1000) {
      return NextResponse.json({ ok: false, error: "date_effet dans le passé" }, { status: 400 })
    }
    dateEffet = new Date(ms).toISOString().slice(0, 10)
  }

  const { data: ann } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, ville, proprietaire_email, locataire_email, statut, bail_signe_locataire_at, bail_signe_bailleur_at, bail_termine_at")
    .eq("id", annonceId)
    .maybeSingle()
  if (!ann) {
    return NextResponse.json({ ok: false, error: "Annonce introuvable" }, { status: 404 })
  }
  const propEmail = (ann.proprietaire_email || "").toLowerCase()
  const locEmail = (ann.locataire_email || "").toLowerCase()
  let qui: "locataire" | "proprietaire"
  if (userEmail === locEmail) qui = "locataire"
  else if (userEmail === propEmail) qui = "proprietaire"
  else return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 403 })

  // Bail doit être doublement signé pour être annulé amiablement
  if (!ann.bail_signe_locataire_at || !ann.bail_signe_bailleur_at) {
    return NextResponse.json({
      ok: false,
      error: "Le bail doit être doublement signé pour être résilié amiablement.",
    }, { status: 400 })
  }
  if (ann.bail_termine_at) {
    return NextResponse.json({ ok: false, error: "Bail déjà terminé." }, { status: 409 })
  }

  const autre = qui === "locataire" ? propEmail : locEmail
  const now = new Date().toISOString()

  // Workflow 2 étapes : check si l'AUTRE partie a déjà proposé l'annulation
  // récemment (dans les 14 derniers jours).
  const { data: existingPropose } = await supabaseAdmin
    .from("messages")
    .select("id, contenu, from_email, created_at")
    .eq("annonce_id", annonceId)
    .ilike("contenu", `${PREFIX_PROPOSE}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const proposeRecent = existingPropose
    && (Date.now() - new Date(existingPropose.created_at).getTime()) < 14 * 24 * 3600 * 1000
  const proposePar = (existingPropose?.from_email || "").toLowerCase()
  const isOtherProposing = proposeRecent && proposePar === autre

  if (!isOtherProposing) {
    // Étape 1 : on POSE la proposition. L'autre partie devra confirmer.
    const payload = JSON.stringify({
      qui,
      raison,
      dateEffet: dateEffet || null,
      proposeAt: now,
      annonceId,
    })
    await supabaseAdmin.from("messages").insert([{
      from_email: userEmail,
      to_email: autre,
      contenu: `${PREFIX_PROPOSE}${payload}`,
      lu: false,
      annonce_id: annonceId,
      created_at: now,
    }])
    await supabaseAdmin.from("notifications").insert([{
      user_email: autre,
      type: "bail_annuler_propose",
      title: qui === "locataire" ? "Le locataire propose une résiliation amiable" : "Le bailleur propose une résiliation amiable",
      body: `« ${raison.slice(0, 100)} » — votre confirmation est requise.`,
      href: qui === "locataire" ? `/proprietaire/bail/${annonceId}` : "/mon-logement",
      related_id: String(annonceId),
      lu: false,
      created_at: now,
    }])
    return NextResponse.json({
      ok: true,
      step: "proposed",
      message: "Proposition envoyée à l'autre partie. Elle doit confirmer pour que la résiliation prenne effet.",
    })
  }

  // Étape 2 : l'autre partie confirme. Exécution réelle.
  const finIso = dateEffet ? new Date(dateEffet + "T00:00:00").toISOString() : now

  // 1. Update annonces (bail terminé amiablement)
  const { error: updErr } = await supabaseAdmin
    .from("annonces")
    .update({
      statut: "archive_amiable",
      bail_termine_at: finIso,
      locataire_email_at_end: locEmail,
      auto_paiement_actif: false,
    })
    .eq("id", annonceId)
  if (updErr) {
    console.error("[bail/annuler] update failed", updErr)
    return NextResponse.json({ ok: false, error: "Mise à jour échouée" }, { status: 500 })
  }

  // 2. Insert message [BAIL_ANNULE]
  const annulePayload = JSON.stringify({
    annonceId,
    quiDemande: existingPropose ? proposePar : null,
    quiConfirme: userEmail,
    raison,
    dateEffet: dateEffet || finIso.slice(0, 10),
    annuleAt: now,
  })
  await supabaseAdmin.from("messages").insert([{
    from_email: userEmail,
    to_email: autre,
    contenu: `${PREFIX_ANNULE}${annulePayload}`,
    lu: false,
    annonce_id: annonceId,
    created_at: now,
  }])

  // 3. Notifs cloche les 2 parties (côté qui confirme inclut self pour audit-trail)
  await supabaseAdmin.from("notifications").insert([
    {
      user_email: autre,
      type: "bail_annule",
      title: "Bail résilié amiablement",
      body: `Date d'effet : ${dateEffet || finIso.slice(0, 10)}. Procédez à l'EDL sortie + restitution dépôt.`,
      href: qui === "locataire" ? `/proprietaire/bail/${annonceId}` : "/mon-logement",
      related_id: String(annonceId),
      lu: false,
      created_at: now,
    },
    {
      user_email: userEmail,
      type: "bail_annule",
      title: "Confirmation : bail résilié amiablement",
      body: `Vous avez confirmé la résiliation. EDL sortie + restitution dépôt à finaliser.`,
      href: qui === "locataire" ? "/mon-logement" : `/proprietaire/bail/${annonceId}`,
      related_id: String(annonceId),
      lu: false,
      created_at: now,
    },
  ])

  return NextResponse.json({
    ok: true,
    step: "executed",
    annonceId,
    dateEffet: dateEffet || finIso.slice(0, 10),
    annuleAt: now,
  })
}
