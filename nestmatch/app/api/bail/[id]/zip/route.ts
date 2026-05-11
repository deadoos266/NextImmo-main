/**
 * V97.21 P3-12.A — GET /api/bail/[id]/zip
 *
 * Télécharge en un ZIP tous les documents légaux du bail :
 *   - bail.pdf (annonces.bail_pdf_url)
 *   - annexes/dpe.pdf, annexes/erp.pdf, annexes/crep.pdf, annexes/notice.pdf
 *     (annexes_alur jsonb avec .url par annexe ALUR)
 *   - edl-entree.pdf (etats_des_lieux.pdf_url_externe pour cas bail importé)
 *   - edl-photos/<idx>.jpg si etats_des_lieux.photos_externes non vide
 *
 * Sécurité :
 *  - NextAuth requis
 *  - Caller doit être proprietaire_email OU locataire_email du bail (annonce)
 *  - Rate-limit 10/min (lecture N fichiers = coûteux)
 *
 * Cf. PHASE_3_ROADMAP.md ligne 154 (P3-12).
 *
 * Best-effort : si un fichier n'est pas fetchable (404, CORS, expired URL),
 * on l'omet du ZIP en gardant un README qui liste les manquants.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"

export const runtime = "nodejs"
export const maxDuration = 60

interface AnnexeState {
  url: string | null
  included_in_bail: boolean
  not_required: boolean
}

const ANNEXE_LABELS: Record<string, string> = {
  dpe: "DPE_diagnostic-performance-energetique",
  erp: "ERP_etat-risques-pollutions",
  crep: "CREP_constat-risque-plomb",
  notice_info: "Notice-information-locataire",
}

function safeSegment(s: string): string {
  return (s || "doc")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-_.]+/g, "_")
    .slice(0, 60) || "doc"
}

// V97.21 fix verifier R3 — whitelist hostnames pour éviter SSRF.
// Toutes les URLs valides viennent de Supabase Storage (uploadées via
// l'app) ou éventuellement de Resend (images embed). On bloque tout
// host externe non-attendu.
const ALLOWED_HOSTS = [".supabase.co", ".supabase.in"]

function isAllowedHost(url: string): boolean {
  try {
    const h = new URL(url).hostname
    return ALLOWED_HOSTS.some(suffix => h.endsWith(suffix))
  } catch {
    return false
  }
}

// V97.21 fix verifier V4 — timeout PAR fetch (12s chacun) + global 45s.
// Avant : un seul timer partagé, si le 1er fetch prenait 40s, les autres
// n'avaient que 5s. Maintenant chaque fetch a son budget propre.
const PER_FETCH_TIMEOUT_MS = 12_000
const MAX_FILE_BYTES = 30 * 1024 * 1024  // 30 MB par fichier (anti memory bomb)
const MAX_TOTAL_BYTES = 100 * 1024 * 1024  // 100 MB total ZIP

async function fetchAsBuffer(url: string, globalSignal: AbortSignal): Promise<Buffer | null> {
  if (!isAllowedHost(url)) {
    console.warn("[bail/zip] fetch blocked (host not allowed):", url.slice(0, 80))
    return null
  }
  // Compose un signal qui combine le global et un timeout par fetch
  const localCtrl = new AbortController()
  const localTimer = setTimeout(() => localCtrl.abort(), PER_FETCH_TIMEOUT_MS)
  const onGlobalAbort = () => localCtrl.abort()
  globalSignal.addEventListener("abort", onGlobalAbort)
  try {
    const res = await fetch(url, { signal: localCtrl.signal, cache: "no-store" })
    if (!res.ok) {
      console.warn("[bail/zip] fetch status", res.status, url.slice(0, 80))
      return null
    }
    // Anti memory bomb : check Content-Length AVANT le download complet
    const contentLength = Number(res.headers.get("content-length") || "0")
    if (contentLength > 0 && contentLength > MAX_FILE_BYTES) {
      console.warn("[bail/zip] file too large:", contentLength, url.slice(0, 80))
      return null
    }
    const arrayBuf = await res.arrayBuffer()
    if (arrayBuf.byteLength > MAX_FILE_BYTES) {
      console.warn("[bail/zip] file too large (post-download):", arrayBuf.byteLength)
      return null
    }
    return Buffer.from(arrayBuf)
  } catch (e) {
    console.warn("[bail/zip] fetch error:", url.slice(0, 80), e instanceof Error ? e.message : String(e))
    return null
  } finally {
    clearTimeout(localTimer)
    globalSignal.removeEventListener("abort", onGlobalAbort)
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ error: "Auth requise" }, { status: 401 })
  }

  const { id } = await params
  const annonceId = Number(id)
  if (!Number.isFinite(annonceId) || annonceId <= 0) {
    return NextResponse.json({ error: "ID invalide" }, { status: 400 })
  }

  // Rate-limit (opération coûteuse — lecture N fichiers)
  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`bail-zip:${email || ip}`, { max: 10, windowMs: 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de téléchargements, réessayez dans 1 minute." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 60) } },
    )
  }

  // Récupère l'annonce
  const { data: annonce, error: annErr } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, ville, proprietaire_email, locataire_email, bail_pdf_url, annexes_alur, bail_source")
    .eq("id", annonceId)
    .maybeSingle()
  if (annErr) {
    console.error("[bail/zip] annonce fetch:", annErr)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
  if (!annonce) {
    return NextResponse.json({ error: "Bail introuvable" }, { status: 404 })
  }

  // Auth applicative : proprio OU locataire de ce bail
  const propEmail = (annonce.proprietaire_email || "").toLowerCase()
  const locEmail = (annonce.locataire_email || "").toLowerCase()
  if (email !== propEmail && email !== locEmail) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  // Récupère l'EDL d'entrée (si existant)
  const { data: edl } = await supabaseAdmin
    .from("etats_des_lieux")
    .select("id, pdf_url_externe, photos_externes, type")
    .eq("annonce_id", annonceId)
    .eq("type", "entree")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  // Import JSZip lazy (le runtime serverless aime ça)
  const { default: JSZip } = await import("jszip")
  const zip = new JSZip()

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 45_000)
  const manifest: { added: string[]; missing: string[] } = { added: [], missing: [] }
  let totalBytes = 0  // V97.21 fix verifier R4 — anti memory bomb

  // Helper local : ajoute un fichier en respectant le cap total
  const addFile = (path: string, buf: Buffer | null, label: string) => {
    if (!buf) { manifest.missing.push(label); return }
    if (totalBytes + buf.byteLength > MAX_TOTAL_BYTES) {
      console.warn("[bail/zip] total cap reached, skipping:", label)
      manifest.missing.push(`${label} (limite ZIP totale atteinte)`)
      return
    }
    zip.file(path, buf)
    totalBytes += buf.byteLength
    manifest.added.push(path)
  }

  try {
    // 1. Bail PDF principal
    if (annonce.bail_pdf_url) {
      const buf = await fetchAsBuffer(annonce.bail_pdf_url, ctrl.signal)
      addFile("bail.pdf", buf, buf ? "bail.pdf" : "bail.pdf (lecture échouée)")
    } else {
      manifest.missing.push("bail.pdf (URL absente — bail non encore généré ?)")
    }

    // 2. Annexes ALUR (DPE, ERP, CREP, notice)
    const annexes = (annonce.annexes_alur || {}) as Record<string, AnnexeState | undefined>
    for (const [key, annexe] of Object.entries(annexes)) {
      if (!annexe?.url) continue
      const label = ANNEXE_LABELS[key] || safeSegment(key)
      const ext = (annexe.url.match(/\.(pdf|jpg|jpeg|png)$/i)?.[1] || "pdf").toLowerCase()
      const buf = await fetchAsBuffer(annexe.url, ctrl.signal)
      addFile(`annexes/${label}.${ext}`, buf, buf ? `annexes/${label}.${ext}` : `annexes/${label}.${ext} (lecture échouée)`)
    }

    // 3. EDL d'entrée — PDF externe + photos
    if (edl?.pdf_url_externe) {
      const buf = await fetchAsBuffer(edl.pdf_url_externe, ctrl.signal)
      addFile("edl-entree.pdf", buf, buf ? "edl-entree.pdf" : "edl-entree.pdf (lecture échouée)")
    }
    // V97.21 fix verifier R4 — cap nombre de photos (anti memory bomb)
    const PHOTOS_CAP = 30
    const rawPhotos = Array.isArray(edl?.photos_externes) ? (edl.photos_externes as string[]) : []
    const photos = rawPhotos.slice(0, PHOTOS_CAP)
    if (rawPhotos.length > PHOTOS_CAP) {
      manifest.missing.push(`edl-photos (${rawPhotos.length - PHOTOS_CAP} photos non incluses, limite ${PHOTOS_CAP})`)
    }
    for (let i = 0; i < photos.length; i++) {
      const url = photos[i]
      if (typeof url !== "string") continue
      const ext = (url.match(/\.(jpg|jpeg|png|webp)$/i)?.[1] || "jpg").toLowerCase()
      const buf = await fetchAsBuffer(url, ctrl.signal)
      const path = `edl-photos/photo-${String(i + 1).padStart(2, "0")}.${ext}`
      addFile(path, buf, buf ? path : `${path} (lecture échouée)`)
    }

    // 4. README qui résume le contenu (UTF-8, accents OK dans un .txt)
    const readme = `Pack documents — ${annonce.titre || "Bail"}${annonce.ville ? " · " + annonce.ville : ""}
Généré par KeyMatch le ${new Date().toLocaleDateString("fr-FR")}.

Fichiers inclus :
${manifest.added.length > 0 ? manifest.added.map(f => "  - " + f).join("\n") : "  (aucun)"}

${manifest.missing.length > 0 ? `Fichiers manquants ou non récupérés :
${manifest.missing.map(f => "  - " + f).join("\n")}

Si un fichier essentiel manque, contactez le propriétaire ou réessayez plus tard.` : ""}

Références juridiques :
  - Bail : Loi 89-462, art. 3 (annexes ALUR obligatoires)
  - EDL  : Décret 2016-382 (contenu minimum)
  - DPE / ERP / CREP : obligatoires depuis 2007 / zone à risque / construction avant 1949
`
    zip.file("README.txt", readme)
    manifest.added.push("README.txt")

  } finally {
    clearTimeout(timer)
  }

  // Genere le ZIP final — Blob pour compat NextResponse stricte (BodyInit).
  // jszip type "blob" requiert un environnement avec Blob — Node 18+ et
  // Vercel Edge / Node runtime supportent.
  const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } })

  const safeTitle = safeSegment(annonce.titre || `bail-${annonceId}`)
  const filename = `${safeTitle}_documents.zip`

  return new NextResponse(zipBlob, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
