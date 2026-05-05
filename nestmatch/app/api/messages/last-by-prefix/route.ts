/**
 * V65.1 — GET /api/messages/last-by-prefix?annonce_id=X&prefix=Y
 *
 * Retourne le dernier message dont le contenu commence par `prefix` pour
 * une annonce donnée. Utilisé pour récupérer les messages système
 * (`[BAIL_REFUSE]`, `[BAIL_FINAL_PDF]`, `[QUITTANCE_CARD]` etc.) sans
 * lecture directe de la table.
 *
 * Sécurité :
 *   - NextAuth requis.
 *   - Scope : appelant doit être proprio OU locataire de l'annonce.
 *   - Whitelist des prefixes autorisés (sinon, n'importe qui pourrait
 *     scraper le payload de tout type de message).
 *
 * Préreq migration 058 (REVOKE SELECT anon sur messages).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"

// Whitelist explicite des prefixes — sinon risque d'exfiltration de données
// sensibles via lecture du contenu. Ces prefixes sont des messages système
// dont le payload est "non sensible" (juste meta sur visite/bail/quittance).
const ALLOWED_PREFIXES = new Set([
  "[BAIL_REFUSE]",
  "[BAIL_FINAL_PDF]",
  "[QUITTANCE_CARD]",
  "[VISITE_DEMANDE]",
  "[VISITE_CONFIRMEE]",
  "[EDL_CARD]",
  "[DOSSIER_CARD]",
  "[CANDIDATURE_VALIDEE]",
  "[CANDIDATURE_RETIREE]",
])

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  const annonceId = Number(req.nextUrl.searchParams.get("annonce_id"))
  if (!Number.isFinite(annonceId) || annonceId <= 0) {
    return NextResponse.json({ ok: false, error: "annonce_id invalide" }, { status: 400 })
  }

  const prefix = req.nextUrl.searchParams.get("prefix") || ""
  if (!ALLOWED_PREFIXES.has(prefix)) {
    return NextResponse.json({ ok: false, error: "prefix non autorisé" }, { status: 400 })
  }

  // Scope : proprio OU locataire
  const { data: ann } = await supabaseAdmin
    .from("annonces")
    .select("proprietaire_email, locataire_email")
    .eq("id", annonceId)
    .maybeSingle()
  if (!ann) {
    return NextResponse.json({ ok: false, error: "Annonce introuvable" }, { status: 404 })
  }
  const propEmail = (ann.proprietaire_email || "").toLowerCase()
  const locEmail = (ann.locataire_email || "").toLowerCase()
  if (email !== propEmail && email !== locEmail) {
    return NextResponse.json({ ok: false, error: "Accès refusé" }, { status: 403 })
  }

  const { data: msg } = await supabaseAdmin
    .from("messages")
    .select("contenu, created_at")
    .eq("annonce_id", annonceId)
    .ilike("contenu", `${prefix}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!msg) {
    return NextResponse.json({ ok: true, message: null })
  }

  return NextResponse.json({
    ok: true,
    message: {
      contenu: msg.contenu,
      created_at: msg.created_at,
    },
  })
}
