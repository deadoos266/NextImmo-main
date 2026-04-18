/**
 * POST /api/account/avatar    — Upload la photo de profil custom.
 * DELETE /api/account/avatar  — Supprime la photo custom (restore Google).
 *
 * Auth : getServerSession (NextAuth). Upload via supabaseAdmin
 * (bucket "avatars", path = {email}/avatar.{ext}).
 *
 * Limites : 2 Mo, JPEG/PNG/WebP uniquement.
 * Magic bytes vérifiés côté serveur (validation client = UX only).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimit, getClientIp } from "@/lib/rateLimit"

const MAX_SIZE = 2 * 1024 * 1024 // 2 Mo
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"])
const ALLOWED_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

// Magic bytes minimaux (3-4 premiers octets) — empêche rename SVG→JPG
function checkMagic(bytes: Uint8Array, mime: string): boolean {
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mime === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  if (mime === "image/webp") return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
  return false
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 })
  }

  const ip = getClientIp(req.headers)
  const rl = checkRateLimit(`avatar:${email}:${ip}`, { max: 10, windowMs: 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop d'uploads récents" }, { status: 429 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Corps multipart attendu" }, { status: 400 })
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Fichier vide" }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Image trop lourde (max 2 Mo)" }, { status: 413 })
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: "Format non supporté — JPEG, PNG ou WebP" }, { status: 415 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!checkMagic(bytes, file.type)) {
    return NextResponse.json({ error: "Contenu du fichier invalide" }, { status: 400 })
  }

  const ext = ALLOWED_EXT[file.type]
  // On écrase toujours le même path → pas d'accumulation de fichiers orphelins.
  const path = `${email}/avatar.${ext}`
  const { error: upErr } = await supabaseAdmin.storage
    .from("avatars")
    .upload(path, bytes, { contentType: file.type, upsert: true })
  if (upErr) {
    console.error("[avatar upload]", upErr)
    const msg = upErr.message || ""
    // Surface les causes fréquentes (bucket manquant, policies absentes)
    // pour que le développeur ou admin voie tout de suite quoi corriger.
    if (/bucket.*not found|bucket.*n'existe/i.test(msg) || /The resource was not found/i.test(msg)) {
      return NextResponse.json(
        { error: "Bucket 'avatars' introuvable dans Supabase. Créez-le (public=true) avant de téléverser une photo." },
        { status: 500 },
      )
    }
    if (/row-level security|policy|permission/i.test(msg)) {
      return NextResponse.json(
        { error: "Politique de stockage refuse l'upload. Vérifiez la configuration du bucket 'avatars'." },
        { status: 500 },
      )
    }
    return NextResponse.json({ error: `Upload échoué : ${msg}` }, { status: 500 })
  }

  const { data: urlData } = supabaseAdmin.storage.from("avatars").getPublicUrl(path)
  // Ajout d'un bust de cache — sinon le browser sert l'ancienne image.
  const url = `${urlData.publicUrl}?v=${Date.now()}`

  // Upsert sûr : si le profil existe déjà on fait un UPDATE ciblé, sinon
  // on INSERT en fournissant un `nom` fallback dérivé de la session (évite
  // les violations NOT NULL sur champs hérités).
  const { data: existing, error: selErr } = await supabaseAdmin
    .from("profils")
    .select("email")
    .eq("email", email)
    .maybeSingle()

  if (selErr) {
    console.error("[avatar profil select]", selErr)
    return NextResponse.json({ error: `Erreur base de données : ${selErr.message}` }, { status: 500 })
  }

  const handleDbErr = (e: { code?: string; message?: string } | null) => {
    if (!e) return null
    const code = e.code
    if (code === "42703" || /column.*photo_url_custom/i.test(e.message || "")) {
      return NextResponse.json(
        { error: "Colonne 'photo_url_custom' absente. Appliquez la migration 008 puis relancez NOTIFY pgrst, 'reload schema';" },
        { status: 500 },
      )
    }
    if (code === "23502" || /null value.*not-null/i.test(e.message || "")) {
      return NextResponse.json(
        { error: "Contrainte NOT NULL dans 'profils'. Appliquez la migration 009_profils_nullable_fields.sql." },
        { status: 500 },
      )
    }
    return NextResponse.json({ error: `Erreur base de données : ${e.message || "inconnue"}` }, { status: 500 })
  }

  if (existing) {
    const { error: updErr } = await supabaseAdmin
      .from("profils")
      .update({ photo_url_custom: url })
      .eq("email", email)
    const err = handleDbErr(updErr)
    if (err) return err
  } else {
    const fallbackNom = session.user?.name?.trim() || email.split("@")[0] || "Utilisateur"
    const { error: insErr } = await supabaseAdmin
      .from("profils")
      .insert({ email, nom: fallbackNom, photo_url_custom: url })
    const err = handleDbErr(insErr)
    if (err) return err
  }

  return NextResponse.json({ ok: true, url })
}

export async function DELETE() {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 })
  }

  // Supprime les extensions possibles (best effort) — pas critique si 404 storage
  await Promise.allSettled([
    supabaseAdmin.storage.from("avatars").remove([`${email}/avatar.jpg`]),
    supabaseAdmin.storage.from("avatars").remove([`${email}/avatar.png`]),
    supabaseAdmin.storage.from("avatars").remove([`${email}/avatar.webp`]),
  ])

  const { error } = await supabaseAdmin
    .from("profils")
    .upsert({ email, photo_url_custom: null }, { onConflict: "email" })
  if (error) {
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
