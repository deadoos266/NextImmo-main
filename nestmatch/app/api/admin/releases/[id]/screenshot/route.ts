/**
 * V97.24 batch 2 — POST /api/admin/releases/[id]/screenshot
 *
 * Upload un screenshot pour une release_validation (cas blocage).
 * Body : multipart/form-data avec champ "file" (image)
 *
 * Pour ne pas créer un bucket dédié, on réutilise le bucket privé
 * "bug-screenshots" (créé V97.10) qui a déjà la policy RLS INSERT
 * pour anon/authenticated.
 *
 * Le path est stocké au format "release-{releaseId}/{timestamp}-{rand}.{ext}"
 * pour le distinguer des screenshots bug-report (path = "{timestamp}-{rand}.{ext}").
 *
 * Réponse : { ok: true, path } où path = "{releaseId}/{filename}".
 * Le frontend stocke ce path dans checks[N].screenshot_path via PATCH check.
 *
 * Lecture : signed URL générée par /api/admin/releases/[id]/screenshot-url
 * (à créer si besoin — sinon supabase admin direct).
 *
 * Auth : admin only.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB (cohérent avec bucket file_size_limit)
const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp"]

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(session && (session as any).user?.isAdmin === true)) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }

  const { id } = await params
  if (!id || id.length < 4) {
    return NextResponse.json({ ok: false, error: "id manquant" }, { status: 400 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ ok: false, error: "FormData invalide" }, { status: 400 })
  }

  const file = formData.get("file")
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ ok: false, error: "Fichier manquant" }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: `Fichier trop gros (${Math.round(file.size / 1024)} KB, max 5 MB)` }, { status: 413 })
  }
  if (!ALLOWED_MIMES.includes(file.type)) {
    return NextResponse.json({ ok: false, error: `Type non autorisé : ${file.type}` }, { status: 415 })
  }

  // Path : "release-{id}/{ts}-{rand}.{ext}" pour distinguer des bugs reports
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"
  const safeReleaseId = id.replace(/[^a-z0-9-]/gi, "_").slice(0, 40)
  const safeTs = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  const path = `release-${safeReleaseId}/${safeTs}-${rand}.${ext}`

  // Upload via supabaseAdmin (bypass RLS, sécurité applicative déjà gated par session admin)
  const arrayBuf = await file.arrayBuffer()
  const { error: upErr } = await supabaseAdmin.storage
    .from("bug-screenshots")
    .upload(path, Buffer.from(arrayBuf), {
      contentType: file.type,
      upsert: false,
    })
  if (upErr) {
    console.error("[admin/releases/screenshot POST]", upErr)
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, path })
}

/**
 * GET /api/admin/releases/[id]/screenshot?path=X
 * Génère une signed URL 1h pour afficher un screenshot.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(session && (session as any).user?.isAdmin === true)) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }

  void params  // suppress unused warning
  const path = req.nextUrl.searchParams.get("path") || ""
  // Validation : le path doit commencer par "release-" pour éviter qu'un admin
  // utilise cette route pour signer des bug-screenshots arbitraires.
  if (!/^release-[a-z0-9_-]+\/\d+-[a-z0-9]+\.(jpg|png|webp)$/i.test(path)) {
    return NextResponse.json({ ok: false, error: "Path invalide" }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin.storage
    .from("bug-screenshots")
    .createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) {
    return NextResponse.json({ ok: false, error: error?.message || "Signature URL échouée" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, url: data.signedUrl })
}
