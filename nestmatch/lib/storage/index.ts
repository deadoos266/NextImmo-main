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
  // V97.39.23 — legacy bucket utilisé par /api/cron/db-backup (Phase 8
  // Vercel pre-VPS). À supprimer quand Phase 8 backups VPS prend le relai.
  | "backups"
  // V97.39.23 — bucket QA bot screenshots (lib/qa/storage.ts)
  | "qa-screenshots"
  // V97.39.23 — bucket release validation screenshots (admin/releases)
  | "release-screenshots"

export type StorageProvider = "supabase" | "minio"

export interface UploadOpts {
  contentType?: string
  upsert?: boolean
  cacheControl?: string
}

// V97.39.23 — Inclut error sur les 2 branches (null si ok) pour faciliter
// le narrowing TS sous tsconfig strict:false.
export type StorageResult<T> =
  | { ok: true; data: T; error: null }
  | { ok: false; data: null; error: string }

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
    if (error) return { ok: false, data: null, error: error.message }
    return { ok: true, data: { path }, error: null }
  } catch (e) {
    return { ok: false, data: null, error: e instanceof Error ? e.message : "Unknown upload error" }
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
    if (error || !data?.signedUrl) return { ok: false, data: null, error: error?.message || "No signed URL returned" }
    return { ok: true, data: { url: data.signedUrl }, error: null }
  } catch (e) {
    return { ok: false, data: null, error: e instanceof Error ? e.message : "Unknown sign error" }
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
    if (error || !data) return { ok: false, data: null, error: error?.message || "Download empty" }
    const buf = Buffer.from(await data.arrayBuffer())
    return { ok: true, data: { data: buf, contentType: data.type || "application/octet-stream" }, error: null }
  } catch (e) {
    return { ok: false, data: null, error: e instanceof Error ? e.message : "Unknown download error" }
  }
}

/**
 * Supprime 1 ou N fichiers d'un bucket.
 */
export async function remove(
  bucket: StorageBucket,
  paths: string[],
): Promise<StorageResult<{ count: number }>> {
  if (paths.length === 0) return { ok: true, data: { count: 0 }, error: null }
  const provider = resolveProvider()
  if (provider === "minio") {
    const { removeMinio } = await import("./minio")
    return removeMinio(bucket, paths)
  }
  try {
    const { data, error } = await supabaseAdmin.storage.from(bucket).remove(paths)
    if (error) return { ok: false, data: null, error: error.message }
    return { ok: true, data: { count: data?.length ?? 0 }, error: null }
  } catch (e) {
    return { ok: false, data: null, error: e instanceof Error ? e.message : "Unknown remove error" }
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
 * V97.39.23 — Wrapper compat API Supabase Storage pour migrer les call sites
 * existants en 1 ligne (changement d'import seulement, pas de réécriture).
 *
 * Usage :
 *   AVANT : import { supabaseAdmin } from "@/lib/supabase-server"
 *           supabaseAdmin.storage.from("avatars").upload(path, file, opts)
 *   APRÈS : import { storage } from "@/lib/storage"
 *           storage.from("avatars").upload(path, file, opts)
 *
 * Retourne le même format `{ data, error }` que Supabase Storage SDK pour
 * minimiser la friction de migration. Le dispatcher Supabase ↔ MinIO opère
 * en dessous via STORAGE_PROVIDER env var.
 *
 * ⚠ NOTE : les méthodes `list()` ne sont PAS implémentées (utilisées seulement
 * par /api/cron/db-backup qui est legacy Vercel — sera remplacé par Phase 8
 * backups VPS de toute façon).
 */
export const storage = {
  from: (bucket: StorageBucket) => ({
    /**
     * Upload — mimic Supabase signature.
     * Retourne `{ data: { path }, error: { message } | null }`.
     */
    async upload(
      path: string,
      file: Blob | Buffer | Uint8Array | ArrayBuffer,
      opts: UploadOpts = {},
    ): Promise<{ data: { path: string } | null; error: { message: string } | null }> {
      // Normalize ArrayBuffer → Uint8Array
      let body: Blob | Buffer | Uint8Array
      if (file instanceof ArrayBuffer) body = new Uint8Array(file)
      else body = file
      const res = await upload(bucket, path, body, opts)
      // V97.39.23 — narrowing explicite (tsconfig strict:false ne narrow pas
      // bien les discriminated unions sur la branche `!ok`)
      if (res.ok) return { data: { path: res.data.path }, error: null }
      return { data: null, error: { message: res.error } }
    },

    /**
     * Get public URL — sync, mimic Supabase signature.
     * Retourne `{ data: { publicUrl } }`.
     */
    getPublicUrl(path: string): { data: { publicUrl: string } } {
      return { data: { publicUrl: getPublicUrl(bucket, path) } }
    },

    /**
     * Create signed URL — async.
     * Retourne `{ data: { signedUrl }, error: { message } | null }`.
     */
    async createSignedUrl(
      path: string,
      ttlSeconds: number,
    ): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }> {
      const res = await createSignedUrl(bucket, path, ttlSeconds)
      if (res.ok) return { data: { signedUrl: res.data.url }, error: null }
      return { data: null, error: { message: res.error } }
    },

    /**
     * Download — async.
     * Retourne `{ data: Blob, error: { message } | null }`.
     * Note : Supabase retourne un Blob, on convertit Buffer → Blob.
     */
    async download(
      path: string,
    ): Promise<{ data: Blob | null; error: { message: string } | null }> {
      const res = await download(bucket, path)
      if (res.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const blob = new Blob([res.data.data as any], { type: res.data.contentType })
        return { data: blob, error: null }
      }
      return { data: null, error: { message: res.error } }
    },

    /**
     * Remove — async.
     * Retourne `{ data: { name: string }[] | null, error: { message } | null }`.
     */
    async remove(
      paths: string[],
    ): Promise<{ data: { name: string }[] | null; error: { message: string } | null }> {
      const res = await remove(bucket, paths)
      if (res.ok) return { data: paths.map(name => ({ name })), error: null }
      return { data: null, error: { message: res.error } }
    },

    /**
     * List — délègue à Supabase. NOT IMPLEMENTÉ pour MinIO (pas utilisé en
     * dehors de /api/cron/db-backup qui est legacy Vercel et remplacé par
     * tools/postgres-vps/scripts/backup-daily.sh).
     */
    async list(
      prefix: string,
      opts?: { limit?: number; offset?: number; sortBy?: { column: string; order: string } },
    ): Promise<{ data: Array<{ name: string; id?: string; created_at?: string; updated_at?: string }> | null; error: { message: string } | null }> {
      const provider = resolveProvider()
      if (provider === "minio") {
        return { data: null, error: { message: "list() pas implémenté en MinIO (legacy /api/cron/db-backup à supprimer)" } }
      }
      const { data, error } = await supabaseAdmin.storage.from(bucket).list(prefix, opts)
      if (error) return { data: null, error: { message: error.message } }
      return { data: data || [], error: null }
    },
  }),
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
