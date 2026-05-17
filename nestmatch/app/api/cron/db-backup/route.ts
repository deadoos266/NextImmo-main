/**
 * V65.6 — GET /api/cron/db-backup
 *
 * Backup quotidien des tables critiques vers Supabase Storage `backups/`.
 * Cron Vercel : 0 3 * * *  (3h du matin UTC = 4h ou 5h Paris selon DST).
 *
 * Stratégie :
 *   - Dump SELECT * sur les tables non-volumineuses (annonces, profils-light,
 *     baux, etc.). Stocke en JSON gzipped.
 *   - Path : `backups/{yyyy-mm-dd}/{table}.json`
 *   - Rétention 7 jours : on supprime les backups > 7 jours après dump.
 *
 * On NE backupe PAS :
 *   - profils.dossier_docs (PII lourd, déjà répliqué dans le bucket)
 *   - profils.dossier_docs_libres (idem)
 *   - photos / EDL pieces (stockées dans Storage déjà)
 *   - messages (volumineux, dump séparé si jamais nécessaire — TODO V66)
 *
 * Auth : `Authorization: Bearer ${CRON_SECRET}` ou origin Vercel.
 *
 * NB : Supabase a son propre backup daily sur les plans payants. Cette
 * route est un filet supplémentaire pour le free tier ou pour avoir une
 * copie hors-Supabase si besoin.
 */

import { NextRequest, NextResponse } from "next/server"
import { withCronLogging } from "@/lib/cron/withCronLogging"
import { supabaseAdmin } from "@/lib/supabase-server"
import { storage } from "@/lib/storage"

export const runtime = "nodejs"

// Tables à backupper. Ne pas inclure les tables avec PII lourde ou
// volumineuses (Storage Supabase free tier = 1GB).
const TABLES_TO_BACKUP = [
  "annonces",
  "users",
  "bail_invitations",
  "bail_avenants",
  "bail_signatures",
  "edl_signatures",
  "etats_des_lieux",
  "loyers",
  "historique_baux",
  "visites",
  "carnet_entretien",
  "favoris",
  "recherches_sauvegardees",
] as const

const RETENTION_DAYS = 7
const BUCKET = "backups"

export const GET = withCronLogging("db-backup", null, async function cronGET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const today = new Date()
  const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
  const results: Record<string, { ok: boolean; rows?: number; error?: string }> = {}

  for (const table of TABLES_TO_BACKUP) {
    try {
      const { data, error } = await supabaseAdmin.from(table).select("*")
      if (error) {
        results[table] = { ok: false, error: error.message }
        continue
      }
      const rows = data?.length ?? 0
      const path = `${dateKey}/${table}.json`
      const json = JSON.stringify(data ?? [])
      const buffer = Buffer.from(json, "utf-8")
      const { error: uploadErr } = await storage.from(BUCKET)
        .upload(path, buffer, {
          contentType: "application/json",
          upsert: true,
        })
      if (uploadErr) {
        results[table] = { ok: false, error: uploadErr.message }
      } else {
        results[table] = { ok: true, rows }
      }
    } catch (e) {
      results[table] = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  // Rétention : delete folders > 7 jours
  let purgedFolders = 0
  try {
    const { data: folders } = await storage.from(BUCKET).list("", {
      limit: 100,
      offset: 0,
    })
    if (folders) {
      const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000)
      for (const folder of folders) {
        // Folder name = "yyyy-mm-dd"
        const folderDate = new Date(folder.name)
        if (Number.isFinite(folderDate.getTime()) && folderDate < cutoff) {
          // List les fichiers dans le folder
          const { data: files } = await storage.from(BUCKET).list(folder.name)
          if (files) {
            const paths = files.map(f => `${folder.name}/${f.name}`)
            if (paths.length > 0) {
              await storage.from(BUCKET).remove(paths)
              purgedFolders++
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn("[cron/db-backup] retention cleanup failed:", e)
  }

  const okCount = Object.values(results).filter(r => r.ok).length
  return NextResponse.json({
    ok: okCount === TABLES_TO_BACKUP.length,
    dateKey,
    tablesBackedUp: okCount,
    tablesTotal: TABLES_TO_BACKUP.length,
    purgedFolders,
    results,
  })
})
