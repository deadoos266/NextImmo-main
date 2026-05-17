/**
 * V97.39.20 P3 Phase 3 — Provider MinIO pour lib/storage.
 *
 * MinIO est S3-compatible, on utilise `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`.
 *
 * ⚠ Ces deps NE SONT PAS installées par défaut pour ne pas grossir le
 * bundle Vercel tant que Phase 3 n'est pas activée. Avant d'activer
 * STORAGE_PROVIDER=minio en prod :
 *   cd nestmatch && npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
 *
 * L'import est dynamique (await import) côté lib/storage/index.ts pour
 * permettre au build de passer même sans les deps installées tant que
 * personne ne flippe STORAGE_PROVIDER.
 *
 * Si quelqu'un flippe STORAGE_PROVIDER=minio sans les deps → erreur claire
 * "Phase 3 not yet activated: install @aws-sdk/client-s3" au premier
 * upload/download/etc., pas un crash silencieux.
 */

import type { StorageBucket, StorageResult, UploadOpts } from "./index"

// Types minimalistes pour ne pas forcer le devDep AWS SDK.
// Quand on install les deps, TS s'aligne sur les vrais types.
type MinioConfig = {
  endpoint: string
  accessKey: string
  secretKey: string
  region: string
  forcePathStyle: boolean
}

function getConfig(): MinioConfig | null {
  const endpoint = process.env.MINIO_ENDPOINT
  const accessKey = process.env.MINIO_ACCESS_KEY
  const secretKey = process.env.MINIO_SECRET_KEY
  if (!endpoint || !accessKey || !secretKey) return null
  return {
    endpoint,
    accessKey,
    secretKey,
    region: process.env.MINIO_REGION || "us-east-1",
    forcePathStyle: true, // MinIO requiert path-style addressing
  }
}

/**
 * Lazy load le SDK AWS S3. Si pas installé → message d'erreur clair.
 */
async function loadSdk(): Promise<{
  S3Client: new (opts: unknown) => unknown
  PutObjectCommand: new (opts: unknown) => unknown
  GetObjectCommand: new (opts: unknown) => unknown
  DeleteObjectsCommand: new (opts: unknown) => unknown
  getSignedUrl: (client: unknown, command: unknown, opts: { expiresIn: number }) => Promise<string>
} | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — module optionnel non installé par défaut (cf docstring header)
    const s3mod = await import("@aws-sdk/client-s3")
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — module optionnel non installé par défaut
    const presigner = await import("@aws-sdk/s3-request-presigner")
    return {
      S3Client: s3mod.S3Client,
      PutObjectCommand: s3mod.PutObjectCommand,
      GetObjectCommand: s3mod.GetObjectCommand,
      DeleteObjectsCommand: s3mod.DeleteObjectsCommand,
      getSignedUrl: presigner.getSignedUrl,
    }
  } catch (e) {
    console.error(
      "[storage-minio] @aws-sdk/client-s3 non installé. Lance:\n" +
      "  cd nestmatch && npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner\n" +
      "Erreur:", e,
    )
    return null
  }
}

function createClient(sdk: Awaited<ReturnType<typeof loadSdk>>): unknown {
  if (!sdk) throw new Error("AWS SDK not loaded")
  const cfg = getConfig()
  if (!cfg) throw new Error("MINIO_ENDPOINT/ACCESS_KEY/SECRET_KEY missing")
  return new sdk.S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKey,
      secretAccessKey: cfg.secretKey,
    },
    forcePathStyle: cfg.forcePathStyle,
  })
}

export async function uploadMinio(
  bucket: StorageBucket,
  path: string,
  file: Blob | Buffer | Uint8Array,
  opts: UploadOpts,
): Promise<StorageResult<{ path: string }>> {
  const sdk = await loadSdk()
  if (!sdk) return { ok: false, data: null, error: "MinIO SDK not installed (cf lib/storage/minio.ts docstring)" }
  try {
    const client = createClient(sdk)
    // Convertit en Buffer (S3 SDK accepte Buffer/Uint8Array/Stream)
    let body: Buffer | Uint8Array
    if (file instanceof Buffer) body = file
    else if (file instanceof Uint8Array) body = file
    else body = Buffer.from(await file.arrayBuffer())

    const cmd = new sdk.PutObjectCommand({
      Bucket: bucket,
      Key: path,
      Body: body,
      ContentType: opts.contentType,
      CacheControl: opts.cacheControl,
      // Si upsert=false, ce serait bien d'utiliser IfNoneMatch: "*" mais MinIO
      // ne supporte pas ce header. On laisse passer pour rester compat.
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client as any).send(cmd)
    return { ok: true, data: { path }, error: null }
  } catch (e) {
    return { ok: false, data: null, error: e instanceof Error ? e.message : "Unknown MinIO upload error" }
  }
}

export async function createSignedUrlMinio(
  bucket: StorageBucket,
  path: string,
  ttlSeconds: number,
): Promise<StorageResult<{ url: string }>> {
  const sdk = await loadSdk()
  if (!sdk) return { ok: false, data: null, error: "MinIO SDK not installed" }
  try {
    const client = createClient(sdk)
    const cmd = new sdk.GetObjectCommand({ Bucket: bucket, Key: path })
    const url = await sdk.getSignedUrl(client, cmd, { expiresIn: ttlSeconds })
    return { ok: true, data: { url }, error: null }
  } catch (e) {
    return { ok: false, data: null, error: e instanceof Error ? e.message : "Unknown MinIO sign error" }
  }
}

export async function downloadMinio(
  bucket: StorageBucket,
  path: string,
): Promise<StorageResult<{ data: Buffer; contentType: string }>> {
  const sdk = await loadSdk()
  if (!sdk) return { ok: false, data: null, error: "MinIO SDK not installed" }
  try {
    const client = createClient(sdk)
    const cmd = new sdk.GetObjectCommand({ Bucket: bucket, Key: path })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (client as any).send(cmd)
    // res.Body est un Readable stream (Node)
    const chunks: Buffer[] = []
    for await (const chunk of res.Body) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer))
    }
    return {
      ok: true,
      data: {
        data: Buffer.concat(chunks),
        contentType: (res.ContentType as string | undefined) || "application/octet-stream",
      },
      error: null,
    }
  } catch (e) {
    return { ok: false, data: null, error: e instanceof Error ? e.message : "Unknown MinIO download error" }
  }
}

export async function removeMinio(
  bucket: StorageBucket,
  paths: string[],
): Promise<StorageResult<{ count: number }>> {
  const sdk = await loadSdk()
  if (!sdk) return { ok: false, data: null, error: "MinIO SDK not installed" }
  try {
    const client = createClient(sdk)
    const cmd = new sdk.DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: paths.map(p => ({ Key: p })),
        Quiet: true,
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client as any).send(cmd)
    return { ok: true, data: { count: paths.length }, error: null }
  } catch (e) {
    return { ok: false, data: null, error: e instanceof Error ? e.message : "Unknown MinIO remove error" }
  }
}
