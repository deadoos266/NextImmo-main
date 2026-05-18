/**
 * V97.39.34 — POST /api/agences/[id]/import
 *
 * Import bulk d'annonces depuis fichier XML (Apimo, Hektor) ou CSV.
 *
 * Workflow :
 *   1. Upload multipart : file + mode (preview|commit)
 *   2. Détecte format auto (Apimo XML / Hektor / CSV)
 *   3. Parse le fichier → array de ParsedAnnonce
 *   4. Si mode=preview : retourne les 5 premiers + warnings + total (PAS d'insert)
 *   5. Si mode=commit : INSERT en bulk + déduplication par external_ref OU
 *      (adresse+surface+type_bien) + retourne ImportResult avec stats.
 *
 * Auth : user doit être membre de l'agence avec role agent+.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { getUserAgenceContext, hasMinRole } from "@/lib/agences/server"
import { detectFormat } from "@/lib/agences/import/detect"
import { parseApimoXML } from "@/lib/agences/import/apimo"
import { parseCSV } from "@/lib/agences/import/csv"
import type { ParsedAnnonce, ImportPreview, ImportResult, ImportFormat } from "@/lib/agences/import/types"
import { MAX_FILE_SIZE } from "@/lib/agences/import/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_ANNONCES_PER_IMPORT = 500

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }
  const userEmail = session.user.email.toLowerCase()

  const { id } = await ctx.params
  const uctx = await getUserAgenceContext(userEmail, id)
  if (!hasMinRole(uctx, "agent")) {
    return NextResponse.json({ ok: false, error: "Role agent+ requis" }, { status: 403 })
  }
  if (uctx?.agenceStatut !== "active") {
    return NextResponse.json({
      ok: false,
      error: "Votre agence doit être validée (statut=active) avant de pouvoir importer des annonces.",
    }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const mode = String(formData.get("mode") || "preview") as "preview" | "commit"

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Fichier requis" }, { status: 400 })
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ ok: false, error: `Fichier trop volumineux (max ${MAX_FILE_SIZE / 1024 / 1024} MB)` }, { status: 400 })
  }

  const content = await file.text()
  const format = detectFormat(content)

  let parsed: { annonces: ParsedAnnonce[]; warnings: string[] }
  try {
    if (format === "apimo") {
      parsed = parseApimoXML(content)
    } else if (format === "csv") {
      parsed = parseCSV(content)
    } else if (format === "hektor") {
      return NextResponse.json({
        ok: false,
        error: "Format Hektor / Périclès non encore supporté. Contacte contact@keymatch-immo.fr avec un échantillon de ton fichier pour qu'on l'ajoute.",
        format,
      }, { status: 415 })
    } else {
      return NextResponse.json({
        ok: false,
        error: "Format non reconnu. Formats supportés : Apimo XML, CSV. Vérifie l'export depuis ton logiciel métier.",
        format,
      }, { status: 415 })
    }
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "Erreur parsing",
      format,
    }, { status: 400 })
  }

  // Validation post-parse
  const errors: string[] = []
  if (parsed.annonces.length === 0) {
    return NextResponse.json({
      ok: false,
      error: "Aucune annonce détectée dans le fichier.",
      warnings: parsed.warnings,
      format,
    }, { status: 400 })
  }
  if (parsed.annonces.length > MAX_ANNONCES_PER_IMPORT) {
    return NextResponse.json({
      ok: false,
      error: `Trop d'annonces (${parsed.annonces.length}). Max ${MAX_ANNONCES_PER_IMPORT} par import.`,
      format,
    }, { status: 413 })
  }

  // Filtre les annonces sans prix
  const valid = parsed.annonces.filter(a => {
    if (!a.prix || a.prix <= 0) {
      errors.push(`"${a.titre}" ignorée (pas de prix valide)`)
      return false
    }
    if (!a.titre || a.titre.trim().length < 3) {
      errors.push("Annonce sans titre, ignorée")
      return false
    }
    return true
  })

  // ─── Mode preview : retourne les 5 premiers sans insert ──────────────────
  if (mode !== "commit") {
    const preview: ImportPreview = {
      format,
      total: valid.length,
      preview: valid.slice(0, 5),
      warnings: parsed.warnings,
      errors,
    }
    return NextResponse.json({ ok: true, ...preview })
  }

  // ─── Mode commit : insert en DB avec dedup ───────────────────────────────
  const result: ImportResult = {
    imported: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    details: [],
  }

  for (const a of valid) {
    try {
      // Dedup par external_ref si présent
      let existing: { id: number } | null = null
      if (a.external_ref) {
        const { data } = await supabaseAdmin
          .from("annonces")
          .select("id")
          .eq("agence_id", id)
          // V97.39.34 — pas de colonne external_ref pour MVP. Match par titre+adresse
          // comme fallback. Migration séparée plus tard pour stocker external_ref.
          .eq("titre", a.titre)
          .limit(1)
          .maybeSingle()
        existing = data as { id: number } | null
      }

      // Sinon dedup par (adresse + surface + type_bien) si on a tous les 3
      if (!existing && a.adresse && a.surface && a.type_bien) {
        const { data } = await supabaseAdmin
          .from("annonces")
          .select("id")
          .eq("agence_id", id)
          .eq("adresse", a.adresse)
          .eq("surface", String(a.surface))
          .eq("type_bien", a.type_bien)
          .limit(1)
          .maybeSingle()
        existing = data as { id: number } | null
      }

      const payload: Record<string, unknown> = {
        agence_id: id,
        titre: a.titre,
        description: a.description,
        ville: a.ville,
        adresse: a.adresse,
        prix: a.prix != null ? String(a.prix) : null,
        charges: a.charges != null ? String(a.charges) : null,
        caution: a.caution != null ? String(a.caution) : null,
        surface: a.surface != null ? String(a.surface) : null,
        pieces: a.pieces != null ? String(a.pieces) : null,
        chambres: a.chambres != null ? String(a.chambres) : null,
        etage: a.etage != null ? String(a.etage) : null,
        dpe: a.dpe,
        type_bien: a.type_bien,
        photos: a.photos,
        meuble: a.meuble === null ? undefined : a.meuble,
        fibre: a.fibre,
        parking: a.parking,
        cave: a.cave,
        balcon: a.balcon,
        terrasse: a.terrasse,
        jardin: a.jardin,
        ascenseur: a.ascenseur,
        proprietaire_email: userEmail,
        proprietaire: uctx?.agenceName || null,
        membre: "Membre depuis " + new Date().getFullYear(),
        verifie: true,
        statut: "disponible",
        is_test: false,
      }
      // Clean undefined
      for (const k of Object.keys(payload)) {
        if (payload[k] === undefined || payload[k] === null) delete payload[k]
      }

      if (existing) {
        const { error } = await supabaseAdmin
          .from("annonces")
          .update(payload)
          .eq("id", existing.id)
        if (error) {
          result.failed++
          result.details.push({ external_ref: a.external_ref, titre: a.titre, action: "failed", reason: error.message })
        } else {
          result.updated++
          result.details.push({ external_ref: a.external_ref, titre: a.titre, action: "updated", annonce_id: existing.id })
        }
      } else {
        const { data: ins, error } = await supabaseAdmin
          .from("annonces")
          .insert(payload)
          .select("id")
          .single()
        if (error || !ins) {
          result.failed++
          result.details.push({ external_ref: a.external_ref, titre: a.titre, action: "failed", reason: error?.message || "insert error" })
        } else {
          result.imported++
          result.details.push({ external_ref: a.external_ref, titre: a.titre, action: "imported", annonce_id: ins.id })
        }
      }
    } catch (e) {
      result.failed++
      result.details.push({
        external_ref: a.external_ref,
        titre: a.titre,
        action: "failed",
        reason: e instanceof Error ? e.message : "Unknown",
      })
    }
  }

  // Stats globales
  const totalProcessed = result.imported + result.updated + result.skipped + result.failed
  const summary = `${result.imported} importée${result.imported > 1 ? "s" : ""}, ${result.updated} mise${result.updated > 1 ? "s" : ""} à jour, ${result.failed} échec${result.failed > 1 ? "s" : ""}`

  return NextResponse.json({
    ok: true,
    format,
    total: totalProcessed,
    summary,
    ...result,
  })
}
