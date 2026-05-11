/**
 * V97.20 P3-4.D — GET /api/messages/image-url?path=<storage_path>
 *
 * Génère une signed URL (TTL 1h) pour une image stockée dans le bucket
 * messages-images. Auth NextAuth requise.
 *
 * Sécurité : vérifie que l'user demandeur est participant d'au moins
 * une conversation contenant un message dont le contenu commence par
 * `[IMG]<path>` ou `[IMG]<full_url>`. Sinon 403.
 *
 * Pattern repris de V97.10 (bug-screenshots) : bucket privé, signed URL
 * server-side après check d'autorisation applicative.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SIGNED_URL_TTL_SEC = 3600  // 1h, suffisant pour afficher

// Valide qu'un path est bien dans le bucket attendu (anti chemins exotiques)
function isValidPath(p: string): boolean {
  if (typeof p !== "string") return false
  if (p.length < 4 || p.length > 300) return false
  // Pas de caractères dangereux (path traversal, scheme injection)
  if (p.includes("..") || p.includes("//") || p.startsWith("/")) return false
  // Whitelist alphanum + tirets + slashes simples + extension image
  return /^[a-zA-Z0-9_/.-]+\.(jpg|jpeg|png|webp|gif)$/i.test(p)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  const path = req.nextUrl.searchParams.get("path") || ""
  if (!isValidPath(path)) {
    return NextResponse.json({ ok: false, error: "Path invalide" }, { status: 400 })
  }

  // V97.20 fix BUG-1 verifier — Sécurité renforcée contre auto-référence :
  //
  // Avant : .ilike("%[IMG]<path>%") OR (from=me OR to=me) → un attaquant
  // pouvait créer dans SA conv un message texte "voici [IMG]<path_volé>"
  // et obtenir une signed URL pour une image qu'il n'a pas le droit de voir.
  //
  // Après :
  //  1. Match STRICT eq("contenu", `[IMG]<path>`) — bloque les messages texte
  //     qui embarquent le pattern dans une string libre.
  //  2. Vérifie que le from_email du message original a un safeEmail qui
  //     correspond au préfixe du path. Empêche un attaquant de fabriquer
  //     un message [IMG]<path_d'autrui> dans sa propre conv pour bypass —
  //     son from_email ne matchera pas le pathPrefix de l'uploader original.
  //  3. Le user demandeur doit être from_email OU to_email de CE message
  //     original (= participant de la conv où l'image a été envoyée).
  const exactContenu = `[IMG]${path}`
  const pathPrefix = path.split("/")[0] || ""  // safeEmail de l'uploader

  const { data: msgs, error: msgsErr } = await supabaseAdmin
    .from("messages")
    .select("id, from_email, to_email")
    .eq("contenu", exactContenu)
    .limit(20)
  if (msgsErr) {
    console.error("[messages/image-url] msgs lookup error:", msgsErr)
    return NextResponse.json({ ok: false, error: "DB error" }, { status: 500 })
  }

  // Filtre côté JS : (a) from_email matche le pathPrefix (= uploader légitime)
  // ET (b) le demandeur est participant (from ou to).
  const legitimate = (msgs || []).find(m => {
    const fromSafe = (m.from_email || "").toLowerCase().replace(/[^a-z0-9]/g, "_")
    if (fromSafe !== pathPrefix) return false
    const from = (m.from_email || "").toLowerCase()
    const to = (m.to_email || "").toLowerCase()
    return from === email || to === email
  })
  if (!legitimate) {
    return NextResponse.json({ ok: false, error: "Accès refusé" }, { status: 403 })
  }

  // Génère la signed URL (admin bypass RLS pour signing)
  const { data: signed, error: signErr } = await supabaseAdmin
    .storage.from("messages-images")
    .createSignedUrl(path, SIGNED_URL_TTL_SEC)
  if (signErr || !signed?.signedUrl) {
    console.error("[messages/image-url] sign error:", signErr)
    return NextResponse.json({ ok: false, error: "Signature URL échouée" }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    url: signed.signedUrl,
    expires_in: SIGNED_URL_TTL_SEC,
  })
}
