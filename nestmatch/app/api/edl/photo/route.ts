/**
 * POST /api/edl/photo — Upload d'une photo d'état des lieux côté serveur.
 *
 * Même logique que /api/proprietaire/photo : strip EXIF/GPS avant stockage.
 * Différence : le path inclut "edl/<email>/<bienId>/..." pour regrouper les
 * photos d'EDL par bien (fidélité au pattern existant côté client).
 *
 * Le bienId est borné au paramètre "bienId" du form. L'email vient TOUJOURS
 * de la session — impossible d'écraser le dossier EDL d'un autre user.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"
import { sanitizeImage } from "@/lib/imageSanitize"

const MAX_SIZE = 10 * 1024 * 1024
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"])

function checkMagic(bytes: Uint8Array, mime: string): boolean {
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mime === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  if (mime === "image/webp") return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
  return false
}

// Les chemins Supabase Storage sont sensibles aux caractères exotiques.
// On whiteliste alnum + dash + underscore pour bienId.
function sanitizeBienId(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  if (trimmed.length === 0 || trimmed.length > 64) return null
  return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : null
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 })
  }

  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`photo-edl:${email}:${ip}`, {
    max: 100,
    windowMs: 60 * 60 * 1000,
  })
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop d'uploads récents" }, { status: 429 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Corps multipart attendu" }, { status: 400 })
  }

  const bienId = sanitizeBienId(form.get("bienId"))
  if (!bienId) {
    return NextResponse.json({ error: "bienId invalide" }, { status: 400 })
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Fichier vide" }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Image trop lourde (max 10 Mo)" }, { status: 413 })
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: "Format non supporté — JPEG, PNG ou WebP" }, { status: 415 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!checkMagic(bytes, file.type)) {
    return NextResponse.json({ error: "Contenu du fichier invalide" }, { status: 400 })
  }

  let sanitized
  try {
    sanitized = await sanitizeImage(Buffer.from(bytes), {
      maxWidth: 2000,
      maxHeight: 2000,
      format: "jpeg",
      quality: 85,
    })
  } catch (e) {
    console.error("[photo edl sanitize]", e)
    return NextResponse.json({ error: "Image illisible ou corrompue" }, { status: 400 })
  }

  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 10)
  const path = `edl/${email}/${bienId}/${ts}_${rand}.jpg`

  const { error: upErr } = await supabaseAdmin.storage
    .from("annonces-photos")
    .upload(path, sanitized.bytes, { contentType: sanitized.mime, upsert: false })
  if (upErr) {
    console.error("[photo edl upload]", upErr)
    return NextResponse.json({ error: `Upload échoué : ${upErr.message}` }, { status: 500 })
  }

  const { data: urlData } = supabaseAdmin.storage.from("annonces-photos").getPublicUrl(path)
  return NextResponse.json({ ok: true, url: urlData.publicUrl })
}
