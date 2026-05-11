/**
 * V83.3 — Helpers Storage Supabase pour les screenshots QA Bot.
 *
 * Bucket : `qa-screenshots` (à créer côté Supabase dashboard, public:false).
 * Upload server-only via supabaseAdmin (service_role).
 *
 * URLs signées valides 1h pour affichage côté admin.
 */

import { supabaseAdmin } from "@/lib/supabase-server"

const BUCKET = "qa-screenshots"

export async function uploadScreenshot(name: string, buffer: Buffer): Promise<string> {
  const ts = Date.now()
  const path = `${ts}-${name}.png`
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: "image/png",
      upsert: false,
    })
  if (error) {
    console.error("[qa/storage] upload failed:", error.message)
    return ""
  }
  // Génère une URL signée 1h pour l'admin
  const { data: signed } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600)
  return signed?.signedUrl || ""
}

export async function getSignedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  const { data } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds)
  return data?.signedUrl || ""
}

export async function listScenarios(): Promise<string[]> {
  // Lit les fichiers .yaml depuis qa/scenarios/ (côté serveur Node.js).
  // En Vercel, ces fichiers sont bundlés via `unstable_includeFiles` ou
  // via la process.cwd() pour les Node runtimes.
  const fs = await import("fs/promises")
  const path = await import("path")
  const dir = path.join(process.cwd(), "qa", "scenarios")
  try {
    const files = await fs.readdir(dir)
    return files.filter(f => f.endsWith(".yaml") || f.endsWith(".yml")).sort()
  } catch {
    return []
  }
}

export async function readScenarioFile(fileName: string): Promise<string | null> {
  const fs = await import("fs/promises")
  const path = await import("path")
  const fullPath = path.join(process.cwd(), "qa", "scenarios", fileName)
  try {
    return await fs.readFile(fullPath, "utf-8")
  } catch {
    return null
  }
}
