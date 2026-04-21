/**
 * GET  /api/profil/identite
 *   Renvoie { prenom, nom, verrouillee } pour le user connecté. Utilisé
 *   par /onboarding/identite pour pré-remplir les champs depuis Google
 *   (given_name/family_name) ou depuis un signup email antérieur.
 *
 * POST /api/profil/identite
 *   Body : { prenom, nom } + toggle certification validé côté client.
 *   Valide la regex Unicode, upsert profils + bascule le flag verrouillé.
 *   Si le row profils existait déjà avec identite_verrouillee=true, la DB
 *   lève une exception (trigger protect_identite_immuable) — on renvoie
 *   un 409 explicite pour que le client redirige proprement.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { IDENTITE_PATTERN } from "@/lib/profilHelpers"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"

const schema = z.object({
  prenom: z.string().trim().min(1).max(80).regex(IDENTITE_PATTERN, "Caractères invalides dans le prénom"),
  nom: z.string().trim().min(1).max(80).regex(IDENTITE_PATTERN, "Caractères invalides dans le nom"),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })

  const { data } = await supabaseAdmin
    .from("profils")
    .select("prenom, nom, identite_verrouillee")
    .eq("email", email)
    .maybeSingle()

  return NextResponse.json({
    prenom: data?.prenom ?? "",
    nom: data?.nom ?? "",
    verrouillee: data?.identite_verrouillee === true,
  })
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`identite-lock:${ip}`, { max: 5, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de tentatives" }, { status: 429 })
  }

  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) return NextResponse.json({ error: "Non authentifié" }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body invalide" }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Données invalides" }, { status: 422 })
  }
  const { prenom, nom } = parsed.data

  // Si l'identité est déjà verrouillée on refuse tout changement côté client
  // (défense en profondeur — le trigger Postgres le ferait aussi).
  const { data: current } = await supabaseAdmin
    .from("profils")
    .select("identite_verrouillee, prenom, nom")
    .eq("email", email)
    .maybeSingle()

  if (current?.identite_verrouillee === true) {
    return NextResponse.json(
      { error: "Identité déjà verrouillée", verrouillee: true },
      { status: 409 },
    )
  }

  const { error } = await supabaseAdmin.from("profils").upsert(
    {
      email,
      prenom,
      nom,
      identite_verrouillee: true,
      identite_confirmee_le: new Date().toISOString(),
    },
    { onConflict: "email" },
  )

  if (error) {
    // Le trigger DB remonte ici si quelqu'un a réussi à contourner le check
    // above (race condition : 2 onglets). On remonte un 409 non-ambigu.
    if (/IDENTITE_VERROUILLEE/.test(error.message)) {
      return NextResponse.json(
        { error: "Identité déjà verrouillée", verrouillee: true },
        { status: 409 },
      )
    }
    console.error("[identite POST]", error)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }

  return NextResponse.json({ success: true, verrouillee: true })
}
