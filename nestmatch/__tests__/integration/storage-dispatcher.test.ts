/**
 * V97.39.20 P3 Phase 3 — Tests storage dispatcher Supabase ↔ MinIO.
 *
 * Vérifie :
 *  - default provider = supabase (comportement inchangé)
 *  - flip STORAGE_PROVIDER=minio change le routing
 *  - getActiveStorageProvider() reflète l'état
 *  - upload/getPublicUrl/createSignedUrl/download/remove cohérents avec Supabase
 *  - encodeStoragePath gère les caractères spéciaux
 *  - MinIO sans SDK installé → erreur claire (pas crash)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock Supabase storage admin
const mockUpload = vi.fn(async () => ({ data: { path: "x" }, error: null }))
const mockGetPublicUrl = vi.fn(() => ({ data: { publicUrl: "https://test.supabase.co/storage/v1/object/public/avatars/test.jpg" } }))
const mockCreateSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://test.supabase.co/storage/v1/object/sign/dossiers/cni.pdf?token=abc" }, error: null }))
const mockDownload = vi.fn(async () => ({ data: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }), error: null }))
const mockRemove = vi.fn(async () => ({ data: [{ name: "x" }], error: null }))

vi.mock("@/lib/supabase-server", () => ({
  supabaseAdmin: {
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
        createSignedUrl: mockCreateSignedUrl,
        download: mockDownload,
        remove: mockRemove,
      })),
    },
  },
}))

describe("storage dispatcher (lib/storage/index.ts)", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    delete process.env.STORAGE_PROVIDER
    delete process.env.MINIO_ENDPOINT
    delete process.env.MINIO_ACCESS_KEY
    delete process.env.MINIO_SECRET_KEY
    delete process.env.MINIO_PUBLIC_URL
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test"
    mockUpload.mockClear()
    mockGetPublicUrl.mockClear()
    mockCreateSignedUrl.mockClear()
    mockDownload.mockClear()
    mockRemove.mockClear()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("getActiveStorageProvider défaut = supabase configuré", async () => {
    const { getActiveStorageProvider } = await import("@/lib/storage")
    const p = getActiveStorageProvider()
    expect(p.provider).toBe("supabase")
    expect(p.configured).toBe(true)
  })

  it("getActiveStorageProvider STORAGE_PROVIDER=minio sans creds → not configured", async () => {
    process.env.STORAGE_PROVIDER = "minio"
    const { getActiveStorageProvider } = await import("@/lib/storage")
    const p = getActiveStorageProvider()
    expect(p.provider).toBe("minio")
    expect(p.configured).toBe(false)
  })

  it("getActiveStorageProvider STORAGE_PROVIDER=minio + creds → configured", async () => {
    process.env.STORAGE_PROVIDER = "minio"
    process.env.MINIO_ENDPOINT = "https://media.keymatch-immo.fr"
    process.env.MINIO_ACCESS_KEY = "keymatch"
    process.env.MINIO_SECRET_KEY = "secret-test"
    const { getActiveStorageProvider } = await import("@/lib/storage")
    const p = getActiveStorageProvider()
    expect(p.provider).toBe("minio")
    expect(p.configured).toBe(true)
    expect(p.endpoint).toBe("https://media.keymatch-immo.fr")
  })

  it("default upload appelle supabase.storage.from(bucket).upload", async () => {
    const { upload } = await import("@/lib/storage")
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" })
    const res = await upload("avatars", "user@x.fr/avatar.jpg", blob, { contentType: "image/jpeg" })
    expect(res).toMatchObject({ ok: true })
    expect(mockUpload).toHaveBeenCalledTimes(1)
  })

  it("default getPublicUrl appelle supabase.storage.from(bucket).getPublicUrl", async () => {
    const { getPublicUrl } = await import("@/lib/storage")
    const url = getPublicUrl("avatars", "u@x.fr/a.jpg")
    expect(url).toBe("https://test.supabase.co/storage/v1/object/public/avatars/test.jpg")
    expect(mockGetPublicUrl).toHaveBeenCalledWith("u@x.fr/a.jpg")
  })

  it("STORAGE_PROVIDER=minio getPublicUrl construit URL MinIO sans SDK", async () => {
    process.env.STORAGE_PROVIDER = "minio"
    process.env.MINIO_PUBLIC_URL = "https://media.keymatch-immo.fr"
    const { getPublicUrl } = await import("@/lib/storage")
    const url = getPublicUrl("annonces-photos", "user@x.fr/photo 1.jpg")
    // Path encoding : "user@x.fr/photo 1.jpg" → "user%40x.fr/photo%201.jpg"
    expect(url).toBe("https://media.keymatch-immo.fr/annonces-photos/user%40x.fr/photo%201.jpg")
  })

  it("STORAGE_PROVIDER=minio getPublicUrl sans MINIO_PUBLIC_URL → string vide + warning", async () => {
    process.env.STORAGE_PROVIDER = "minio"
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { getPublicUrl } = await import("@/lib/storage")
    const url = getPublicUrl("avatars", "x.jpg")
    expect(url).toBe("")
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it("STORAGE_PROVIDER=minio avec endpoint invalide → upload erreur réseau", async () => {
    process.env.STORAGE_PROVIDER = "minio"
    // V97.39.25 — endpoint local port 1 (toujours refused, pas de DNS lookup
    // long sur fake hostname). Évite test timeout.
    process.env.MINIO_ENDPOINT = "http://127.0.0.1:1"
    process.env.MINIO_ACCESS_KEY = "k"
    process.env.MINIO_SECRET_KEY = "s"
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { upload } = await import("@/lib/storage")
    const blob = new Blob([new Uint8Array([0])], { type: "text/plain" })
    const res = await upload("dossiers", "test.pdf", blob)
    expect(res).toMatchObject({ ok: false })
    // L'erreur doit mentionner soit ECONNREFUSED soit similar (port 1 closed)
    const errStr = JSON.stringify(res).toLowerCase()
    expect(
      errStr.includes("econnrefused") || errStr.includes("connect") || errStr.includes("network"),
    ).toBe(true)
    errorSpy.mockRestore()
  }, 15000)

  it("default createSignedUrl appelle supabase pour bucket privé", async () => {
    const { createSignedUrl } = await import("@/lib/storage")
    const res = await createSignedUrl("dossiers", "u@x.fr/cni.pdf", 3600)
    expect(res).toMatchObject({ ok: true })
    expect(mockCreateSignedUrl).toHaveBeenCalledWith("u@x.fr/cni.pdf", 3600)
  })

  it("default download retourne Buffer + contentType", async () => {
    const { download } = await import("@/lib/storage")
    const res = await download("baux", "bail-2026.pdf")
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.data).toBeInstanceOf(Buffer)
      expect(res.data.data.length).toBe(3) // [1, 2, 3]
      expect(res.data.contentType).toBe("image/jpeg")
    }
  })

  it("default remove appelle supabase pour 1 path", async () => {
    const { remove } = await import("@/lib/storage")
    const res = await remove("avatars", ["u@x.fr/avatar.jpg"])
    expect(res).toMatchObject({ ok: true, data: { count: 1 } })
    expect(mockRemove).toHaveBeenCalledWith(["u@x.fr/avatar.jpg"])
  })

  it("remove avec paths vide → no-op count=0", async () => {
    const { remove } = await import("@/lib/storage")
    const res = await remove("avatars", [])
    expect(res).toMatchObject({ ok: true, data: { count: 0 } })
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it("Supabase upload error → ok=false avec message", async () => {
    mockUpload.mockResolvedValueOnce({ data: null, error: { message: "Duplicate" } })
    const { upload } = await import("@/lib/storage")
    const res = await upload("avatars", "x.jpg", new Blob([new Uint8Array([0])]))
    expect(res).toMatchObject({ ok: false })
    expect(JSON.stringify(res)).toContain("Duplicate")
  })

  it("STORAGE_PROVIDER inconnu → fallback supabase", async () => {
    process.env.STORAGE_PROVIDER = "s3-aws"
    const { getActiveStorageProvider } = await import("@/lib/storage")
    expect(getActiveStorageProvider().provider).toBe("supabase")
  })
})
