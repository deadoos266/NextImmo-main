/**
 * V97.39.20 P3 Phase 3 — Storage dispatcher Supabase ↔ MinIO self-host.
 *
 * Wrapper qui choisit le provider à runtime via `STORAGE_PROVIDER` :
 *   - `supabase` (défaut, comportement historique inchangé)
 *   - `minio` (self-host sur VPS OVH, S3-compatible, RGPD-natif)
 *
 * Permet de switcher de Supabase Storage à MinIO (Phase 3 plan migration
 * OVH) en flippant simplement l'env var — sans toucher aux call sites.
 *
 * Interface unifiée :
 *   upload(bucket, path, file, opts?)  → upload un fichier
 *   getPublicUrl(bucket, path)         → URL publique (bucket public)
 *   createSignedUrl(bucket, path, ttl) → URL signée (bucket privé)
 *   download(bucket, path)             → Blob/Buffer du fichier
 *   remove(bucket, paths)              → suppression d'1+ fichiers
 *
 * Buckets KeyMatch (cohérents Supabase ↔ MinIO) :
 *   - `avatars` (public)
 *   - `annonces-photos` (public)
 *   - `dossiers` (privé, signed URLs)
 *   - `baux` (privé)
 *   - `edl` (privé)
 *   - `quittances` (privé)
 *   - `messages-images` (privé)
 *   - `bug-screenshots` (privé, admin only)
 *
 * Activation MinIO (Phase 3 du plan migration OVH) :
 *   1. `cd tools/minio-vps && docker compose up -d` sur VPS
 *   2. `./scripts/init-buckets.sh` (idempotent)
 *   3. `./scripts/migrate-from-supabase.sh` (copie data via rclone)
 *   4. `psql ... -f scripts/rewrite-storage-urls.sql -v dry_run=1` (vérifier)
 *      puis `-v dry_run=0` (appliquer)
 *   5. `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner` (Vercel)
 *   6. Set env vars Vercel :
 *      - STORAGE_PROVIDER=minio
 *      - MINIO_ENDPOINT=https://media.keymatch-immo.fr
 *      - MINIO_ACCESS_KEY=keymatch
 *      - MINIO_SECRET_KEY=<from .env VPS>
 *      - MINIO_PUBLIC_URL=https://media.keymatch-immo.fr
 *   7. Redeploy → tous les uploads/reads passent par MinIO
 *
 * Rollback : flip STORAGE_PROVIDER=supabase + redeploy. Les fichiers MinIO
 * sont conservés intacts pendant 30 jours pour rollback safe.
 *
 * Cf nestmatch/docs/PHASE3_MINIO_SETUP.md pour la procédure détaillée.
 */

import { supabaseAdmin } from "@/lib/supabase-server"

export type StorageBucket =
  | "avatars"
  | "annonces-photos"
  | "dossiers"
  | "baux"
  | "edl"
  | "quittances"
  | "messages-images"
  | "bug-screenshots"

export type StorageProvider = "supabase" | "minio"

export interface UploadOpts {
  contentType?: string
  upsert?: boolean
  cacheControl?: string
}

export type StorageResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

function resolveProvider(): StorageProvider {
  const raw = (process.env.STORAGE_PROVIDER || "supabase").toLowerCase().trim()
  if (raw === "minio") return "minio"
  return "supabase"
}

/**
 * Upload un fichier (Blob/Buffer) sur le storage actif.
 * Retourne le path stocké (relatif au bucket) pour persister en DB.
 */
export async function upload(
  bucket: StorageBucket,
  path: string,
  file: Blob | Buffer | Uint8Array,
  opts: UploadOpts = {},
): Promise<StorageResult<{ path: string }>> {
  const provider = resolveProvider()
  if (provider === "minio") {
    const { uploadMinio } = await import("./minio")
    return uploadMinio(bucket, path, file, opts)
  }

  // Supabase (défaut)
  try {
    // Supabase ne gère pas Uint8Array nativement, on convertit en Blob.
    // Cast en ArrayBufferView via slice() pour satisfaire BlobPart (Buffer
    // est techniquement Uint8Array<ArrayBufferLike>, mais BlobPart attend
    // Uint8Array<ArrayBuffer> — petit mismatch TS lib types).
    let body: Blob | Buffer
    if (file instanceof Uint8Array && !(file instanceof Buffer)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body = new Blob([file as any], { type: opts.contentType || "application/octet-stream" })
    } else {
      body = file as Blob | Buffer
    }
    const { error } = await supabaseAdmin.storage.from(bucket).upload(path, body, {
      contentType: opts.contentType,
      upsert: opts.upsert ?? false,
      cacheControl: opts.cacheControl,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, data: { path } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown upload error" }
  }
}

/**
 * URL publique d'un fichier dans un bucket public (avatars, annonces-photos).
 * Si MinIO actif, construit `<MINIO_PUBLIC_URL>/<bucket>/<path>`.
 */
export function getPublicUrl(bucket: StorageBucket, path: string): string {
  const provider = resolveProvider()
  if (provider === "minio") {
    const base = process.env.MINIO_PUBLIC_URL || process.env.MINIO_ENDPOINT || ""
    if (!base) {
      console.warn("[storage] MINIO_PUBLIC_URL absent — URL publique vide")
      return ""
    }
    return `${base.replace(/\/$/, "")}/${bucket}/${encodeStoragePath(path)}`
  }
  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

/**
 * URL signée temporaire pour un fichier dans un bucket privé.
 * TTL en secondes (Supabase max 7 jours, MinIO max 7 jours, on aligne).
 */
export async function createSignedUrl(
  bucket: StorageBucket,
  path: string,
  ttlSeconds: number,
): Promise<StorageResult<{ url: string }>> {
  const provider = resolveProvider()
  if (provider === "minio") {
    const { createSignedUrlMinio } = await import("./minio")
    return createSignedUrlMinio(bucket, path, ttlSeconds)
  }
  try {
    const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, ttlSeconds)
    if (error || !data?.signedUrl) return { ok: false, error: error?.message || "No signed URL returned" }
    return { ok: true, data: { url: data.signedUrl } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown sign error" }
  }
}

/**
 * Télécharge un fichier (Buffer côté Node).
 */
export async function download(
  bucket: StorageBucket,
  path: string,
): Promise<StorageResult<{ data: Buffer; contentType: string }>> {
  const provider = resolveProvider()
  if (provider === "minio") {
    const { downloadMinio } = await import("./minio")
    return downloadMinio(bucket, path)
  }
  try {
    const { data, error } = await supabaseAdmin.storage.from(bucket).download(path)
    if (error || !data) return { ok: false, error: error?.message || "Download empty" }
    const buf = Buffer.from(await data.arrayBuffer())
    return { ok: true, data: { data: buf, contentType: data.type || "application/octet-stream" } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown download error" }
  }
}

/**
 * Supprime 1 ou N fichiers d'un bucket.
 */
export async function remove(
  bucket: StorageBucket,
  paths: string[],
): Promise<StorageResult<{ count: number }>> {
  if (paths.length === 0) return { ok: true, data: { count: 0 } }
  const provider = resolveProvider()
  if (provider === "minio") {
    const { removeMinio } = await import("./minio")
    return removeMinio(bucket, paths)
  }
  try {
    const { data, error } = await supabaseAdmin.storage.from(bucket).remove(paths)
    if (error) return { ok: false, error: error.message }
    return { ok: true, data: { count: data?.length ?? 0 } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown remove error" }
  }
}

/**
 * Helper utilisé par getPublicUrl pour MinIO : encode chaque segment du
 * path sans toucher aux `/`. Aligne avec le comportement Supabase qui
 * renvoie une URL prête à être passée dans <img src=...>.
 */
function encodeStoragePath(path: string): string {
  return path
    .split("/")
    .map(segment => encodeURIComponent(segment))
    .join("/")
}

/**
 * Helper diagnostic exposé pour /admin/operations : retourne le provider
 * actif et si la config est valide.
 */
export function getActiveStorageProvider(): {
  provider: StorageProvider
  configured: boolean
  endpoint?: string
} {
  const provider = resolveProvider()
  if (provider === "minio") {
    return {
      provider: "minio",
      configured: !!(process.env.MINIO_ENDPOINT && process.env.MINIO_ACCESS_KEY && process.env.MINIO_SECRET_KEY),
      endpoint: process.env.MINIO_ENDPOINT,
    }
  }
  return {
    provider: "supabase",
    configured: !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    endpoint: process.env.NEXT_PUBLIC_SUPABASE_URL,
  }
}
