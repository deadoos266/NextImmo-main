/**
 * V36.3 — POST /api/bail/avenant/[id]/refuser
 *
 * Refuse un avenant proposé. Statut → "annule". Notif l'auteur.
 *
 * Body : { raison?: string }
 *
 * Auth : NextAuth + match locataire OU proprio de l'annonce.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions)
  const userEmail = session?.user?.email?.toLowerCase()
  if (!userEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  const { id: avenantId } = await params
  if (!avenantId) {
    return NextResponse.json({ ok: false, error: "id avenant requis" }, { status: 400 })
  }

  let raison = ""
  try {
    const body = await req.json().catch(() => ({}))
    const r = (body as { raison?: unknown }).raison
    if (typeof r === "string") raison = r.trim().slice(0, 500)
  } catch { /* body optionnel */ }

  const { data: avenant } = await supabaseAdmin
    .from("bail_avenants")
    .select("*")
    .eq("id", avenantId)
    .maybeSingle()
  if (!avenant) {
    return NextResponse.json({ ok: false, error: "Avenant introuvable" }, { status: 404 })
  }
  if (avenant.statut === "actif" || avenant.statut === "annule") {
    return NextResponse.json({ ok: false, error: `Avenant déjà ${avenant.statut}` }, { status: 409 })
  }

  const { data: annonce } = await supabaseAdmin
    .from("annonces")
    .select("proprietaire_email, locataire_email, titre")
    .eq("id", avenant.annonce_id)
    .maybeSingle()
  if (!annonce) {
    return NextResponse.json({ ok: false, error: "Annonce introuvable" }, { status: 404 })
  }
  const propEmail = (annonce.proprietaire_email || "").toLowerCase()
  const locEmail = (annonce.locataire_email || "").toLowerCase()
  if (userEmail !== locEmail && userEmail !== propEmail) {
    return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 403 })
  }

  const now = new Date().toISOString()
  await supabaseAdmin
    .from("bail_avenants")
    .update({ statut: "annule", updated_at: now })
    .eq("id", avenantId)

  // Notif à l'auteur de l'avenant (= autre partie qui l'a proposé)
  const auteurEmail = (avenant.propose_par_email || "").toLowerCase()
  if (auteurEmail && auteurEmail !== userEmail) {
    const payload = JSON.stringify({
      avenantId,
      numero: avenant.numero,
      titre: avenant.titre,
      raison,
      refuseParRole: userEmail === locEmail ? "locataire" : "proprietaire",
      annonceId: avenant.annonce_id,
    })
    await supabaseAdmin.from("messages").insert([{
      from_email: userEmail,
      to_email: auteurEmail,
      contenu: `[AVENANT_REFUSE]${payload}`,
      lu: false,
      annonce_id: avenant.annonce_id,
      created_at: now,
    }])
    await supabaseAdmin.from("notifications").insert([{
      user_email: auteurEmail,
      type: "avenant_refuse",
      title: `Avenant N°${avenant.numero} refusé`,
      body: `${avenant.titre}${raison ? ` — « ${raison.slice(0, 80)} »` : ""}`,
      href: userEmail === locEmail ? `/proprietaire/bail/${avenant.annonce_id}` : "/mon-logement",
      related_id: String(avenant.annonce_id),
      lu: false,
      created_at: now,
    }])
  }

  return NextResponse.json({ ok: true })
}
