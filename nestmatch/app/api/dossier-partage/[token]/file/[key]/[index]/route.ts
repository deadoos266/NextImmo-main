/**
 * GET /api/dossier-partage/[token]/file/[key]/[index]
 *
 * Télécharge ou affiche une pièce justificative du dossier partagé.
 *
 * Sécurité (défense en profondeur) :
 *   1. Vérifie le token HMAC à chaque requête (même exp, même signature).
 *   2. Génère une signed URL Supabase avec TTL = min(exp - now, 7j), min 60s.
 *      Si le lien HTML fuite et que le token expire, les URLs redirigées
 *      deviennent mortes avec.
 *   3. Rate-limit 60/min par IP pour éviter l'énumération de pièces.
 *   4. Log chaque consultation dans dossier_access_log avec document_key
 *      pour la transparence utilisateur (panneau Consultations).
 *
 * Ne JAMAIS exposer l'URL publique Supabase directement côté client —
 * passer par cette route qui re-valide le HMAC à chaque accès.
 */

import { NextRequest, NextResponse } from "next/server"
import { verifyDossierToken } from "@/lib/dossierToken"
import { supabaseAdmin } from "@/lib/supabase-server"
import { hashToken, hashIP } from "@/lib/dossierAccessLog"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; key: string; index: string }> }
) {
  const { token, key, index } = await params
  const idx = parseInt(index, 10)
  if (!Number.isFinite(idx) || idx < 0) {
    return NextResponse.json({ error: "Index invalide" }, { status: 400 })
  }

  // 1. HMAC re-check à chaque requête (défense en profondeur)
  const valid = verifyDossierToken(token)
  if (!valid) {
    return NextResponse.json({ error: "Lien expiré ou invalide" }, { status: 404 })
  }

  // 2. Rate-limit par IP
  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`dossier-file:${ip}`, { max: 60, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 })
  }

  // 3. Récupère le profil + la pièce demandée
  const { data: profil } = await supabaseAdmin
    .from("profils")
    .select("dossier_docs")
    .eq("email", valid.email.toLowerCase())
    .single()

  if (!profil?.dossier_docs) {
    return NextResponse.json({ error: "Dossier vide" }, { status: 404 })
  }

  const docs = profil.dossier_docs as Record<string, string[] | string>
  const val = docs[key]
  const urls = Array.isArray(val) ? val : val ? [val] : []
  const url = urls[idx]
  if (!url) {
    return NextResponse.json({ error: "Pièce non trouvée" }, { status: 404 })
  }

  // 4. Extrait le path storage depuis l'URL publique Supabase
  //    Format attendu : .../storage/v1/object/public/dossiers/<path>
  const match = url.match(/\/object\/(?:public|sign)\/dossiers\/([^?]+)/)
  if (!match) {
    // URL non reconnue — on log quand même et on redirige en last resort
    return NextResponse.redirect(url)
  }
  const path = decodeURIComponent(match[1])

  // 5. TTL alignée sur exp - now (marge 60s, max 7j = 604 800s)
  const remainingMs = valid.exp - Date.now()
  if (remainingMs < 60_000) {
    return NextResponse.json({ error: "Lien sur le point d'expirer" }, { status: 404 })
  }
  const ttlSec = Math.min(Math.floor(remainingMs / 1000), 604_800)

  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from("dossiers")
    .createSignedUrl(path, ttlSec)

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: "Impossible de générer l'URL signée" }, { status: 500 })
  }

  // 6. Log per-attachment (fire-and-forget — ne bloque pas la redirection)
  void supabaseAdmin.from("dossier_access_log").insert({
    email: valid.email.toLowerCase(),
    token_hash: hashToken(token),
    ip_hash: hashIP(ip || "unknown"),
    user_agent: req.headers.get("user-agent")?.slice(0, 200) || null,
    document_key: key,
  })

  // 7. Redirect 302 vers la signed URL Supabase (stream Supabase → client)
  const res = NextResponse.redirect(signed.signedUrl)
  // Ne JAMAIS cacher une signed URL — proxy/CDN pourrait la servir à un autre
  res.headers.set("Cache-Control", "private, no-store")
  return res
}
