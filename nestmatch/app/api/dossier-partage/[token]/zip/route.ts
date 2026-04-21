/**
 * GET /api/dossier-partage/[token]/zip
 *
 * Télécharge le dossier complet sous forme d'archive .zip :
 *   - recapitulatif_<nom>.pdf (généré à la volée via jsPDF)
 *   - dossier_<nom>/<categorie>/<fichier> × N (binaires streamés depuis Supabase Storage)
 *
 * Sécurité :
 *   1. Re-vérifie le token HMAC (défense en profondeur).
 *   2. Check révocation via dossier_share_tokens (graceful si migration 021 absente).
 *   3. Rate-limit 5/min par IP (opération coûteuse — lecture de N fichiers).
 *   4. Chaque consultation est loggée (document_key = "zip") pour transparence.
 */

import { NextRequest, NextResponse } from "next/server"
import { verifyDossierToken } from "@/lib/dossierToken"
import { supabaseAdmin } from "@/lib/supabase-server"
import { hashToken, hashIP } from "@/lib/dossierAccessLog"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"
import { genererDossierPDFBlob, type DossierData, type DossierDocEntry } from "@/lib/dossierPDF"
import { formatNomComplet } from "@/lib/profilHelpers"

export const runtime = "nodejs"
// Opération lourde (lecture N fichiers) — on laisse 60s à Vercel
export const maxDuration = 60

const DOC_LABELS: Record<string, string> = {
  identite: "Pièce d'identité",
  bulletins: "Bulletins de salaire",
  avis_imposition: "Avis d'imposition",
  contrat: "Contrat de travail",
  quittances: "Quittances de loyer",
  identite_garant: "Pièce d'identité du garant",
  bulletins_garant: "Bulletins de salaire du garant",
  avis_garant: "Avis d'imposition du garant",
  certificat_scolarite: "Certificat de scolarité",
  attestation_caf: "Attestation CAF",
  attestation_assurance: "Attestation d'assurance habitation",
  attestation_employeur: "Attestation employeur",
}

const CHAMPS_SCORE = [
  "date_naissance", "nationalite", "situation_familiale", "situation_pro",
  "revenus_mensuels", "nb_occupants", "logement_actuel_type", "ville_souhaitee",
  "budget_max", "presentation",
]

function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const last = u.pathname.split("/").pop() || "fichier"
    return decodeURIComponent(last)
  } catch {
    return "fichier"
  }
}

function safeSegment(s: string): string {
  return (s || "item")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_.]+/g, "_")
    .slice(0, 60) || "item"
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // 1. HMAC
  const valid = verifyDossierToken(token)
  if (!valid) {
    return NextResponse.json({ error: "Lien expiré ou invalide" }, { status: 404 })
  }

  // 1b. Révocation (graceful)
  const { data: shareRow, error: shareErr } = await supabaseAdmin
    .from("dossier_share_tokens")
    .select("revoked_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle()
  if (shareErr && shareErr.code !== "42P01") {
    console.error("[dossier-partage/zip] revoked check error:", shareErr.message)
  }
  if (shareRow?.revoked_at) {
    return NextResponse.json({ error: "Lien révoqué" }, { status: 404 })
  }

  // 2. Rate-limit par IP (5/min — opération coûteuse)
  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`dossier-zip:${ip}`, { max: 5, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 })
  }

  // 3. Profil
  const { data: profil } = await supabaseAdmin
    .from("profils")
    .select("*")
    .eq("email", valid.email.toLowerCase())
    .single()
  if (!profil) {
    return NextResponse.json({ error: "Dossier vide" }, { status: 404 })
  }

  const docs = (profil.dossier_docs || {}) as Record<string, string[] | string>
  const nom = formatNomComplet(profil) || profil.nom || valid.email.split("@")[0]
  const safeName = safeSegment(nom)

  // 4. Calcul score (même règle que /dossier page.tsx)
  const remplis = CHAMPS_SCORE.filter(k => {
    const v = profil[k]
    return v !== null && v !== undefined && v !== ""
  }).length
  const score = Math.round((remplis / CHAMPS_SCORE.length) * 100)

  // 5. Build PDF récap (best effort — si échec, on inclut un .txt de marqueur)
  const docEntries: DossierDocEntry[] = Object.keys(DOC_LABELS).map(key => {
    const val = docs[key]
    const count = Array.isArray(val) ? val.length : val ? 1 : 0
    return { key, label: DOC_LABELS[key], count }
  })

  // Pièces libres (graceful si colonne absente)
  type LibreEntry = { url: string; label: string; uploaded_at?: string }
  const docsLibresRaw: unknown = profil.dossier_docs_libres
  const docsLibres: LibreEntry[] = Array.isArray(docsLibresRaw)
    ? (docsLibresRaw as unknown[]).filter((x): x is LibreEntry =>
        typeof x === "object" && x !== null
        && typeof (x as LibreEntry).url === "string"
        && typeof (x as LibreEntry).label === "string"
      ).slice(0, 5)
    : []

  const pdfData: DossierData = {
    nom,
    email: valid.email,
    telephone: profil.telephone || undefined,
    dateNaissance: profil.date_naissance || undefined,
    nationalite: profil.nationalite || undefined,
    situationFamiliale: profil.situation_familiale || undefined,
    nbEnfants: profil.nb_enfants ?? 0,
    situationPro: profil.situation_pro || undefined,
    employeurNom: profil.employeur_nom || undefined,
    dateEmbauche: profil.date_embauche || undefined,
    revenusMensuels: profil.revenus_mensuels ?? null,
    nbOccupants: profil.nb_occupants ?? undefined,
    logementActuelType: profil.logement_actuel_type || undefined,
    logementActuelVille: profil.logement_actuel_ville || undefined,
    aApl: profil.a_apl === true,
    mobilitePro: profil.mobilite_pro === true,
    garant: profil.garant === true,
    typeGarant: profil.type_garant || undefined,
    presentation: profil.presentation || undefined,
    villeSouhaitee: profil.ville_souhaitee || undefined,
    budgetMax: profil.budget_max ?? null,
    score,
    docs: docEntries,
    docsLibres: docsLibres.map(d => ({ label: d.label })),
  }

  // 6. JSZip dynamique (lib lourde)
  const { default: JSZip } = await import("jszip")
  const zip = new JSZip()
  const root = zip.folder(`dossier_${safeName}`)
  if (!root) {
    return NextResponse.json({ error: "Erreur création archive" }, { status: 500 })
  }

  // 6a. PDF récap
  try {
    const pdfBlob = await genererDossierPDFBlob(pdfData)
    const pdfBuf = Buffer.from(await pdfBlob.arrayBuffer())
    root.file(`recapitulatif_${safeName}.pdf`, pdfBuf)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue"
    root.file(
      "RECAP_MANQUANT.txt",
      `La génération du récapitulatif PDF a échoué : ${msg}\n\nLes pièces justificatives restent disponibles dans ce ZIP.`
    )
  }

  // 6b. Fichiers par catégorie (téléchargement parallèle via Storage SDK)
  type JobOk = { ok: true; folder: string; filename: string; buf: Buffer }
  type JobErr = { ok: false; folder: string; filename: string; reason: string }
  type Job = JobOk | JobErr
  const jobs: Promise<Job>[] = []

  for (const key of Object.keys(DOC_LABELS)) {
    const val = docs[key]
    const urls = Array.isArray(val) ? val : val ? [val as string] : []
    if (urls.length === 0) continue
    const folderName = safeSegment(DOC_LABELS[key])
    urls.forEach((url, idx) => {
      jobs.push((async (): Promise<Job> => {
        const match = url.match(/\/object\/(?:public|sign)\/dossiers\/([^?]+)/)
        const filename = filenameFromUrl(url)
        const safeFilename = urls.length > 1
          ? `${idx + 1}_${safeSegment(filename)}`
          : safeSegment(filename)
        if (!match) {
          return { ok: false, folder: folderName, filename: safeFilename, reason: "URL inconnue" }
        }
        const path = decodeURIComponent(match[1])
        const { data, error } = await supabaseAdmin.storage.from("dossiers").download(path)
        if (error || !data) {
          return { ok: false, folder: folderName, filename: safeFilename, reason: error?.message || "Introuvable" }
        }
        const buf = Buffer.from(await data.arrayBuffer())
        return { ok: true, folder: folderName, filename: safeFilename, buf }
      })())
    })
  }

  // 6c. Pièces libres — sous-dossier `autres/` avec filename = `{idx+1}_{label_sanitizé}.ext`
  docsLibres.forEach((d, idx) => {
    jobs.push((async (): Promise<Job> => {
      const match = d.url.match(/\/object\/(?:public|sign)\/dossiers\/([^?]+)/)
      const filename = filenameFromUrl(d.url)
      const ext = filename.split(".").pop()?.toLowerCase() || "bin"
      const safeLabel = safeSegment(d.label) || `piece_${idx + 1}`
      const safeFilename = `${String(idx + 1).padStart(2, "0")}_${safeLabel}.${ext}`
      if (!match) {
        return { ok: false, folder: "autres", filename: safeFilename, reason: "URL inconnue" }
      }
      const path = decodeURIComponent(match[1])
      const { data, error } = await supabaseAdmin.storage.from("dossiers").download(path)
      if (error || !data) {
        return { ok: false, folder: "autres", filename: safeFilename, reason: error?.message || "Introuvable" }
      }
      const buf = Buffer.from(await data.arrayBuffer())
      return { ok: true, folder: "autres", filename: safeFilename, buf }
    })())
  })

  const results = await Promise.all(jobs)
  const manifestLines: string[] = []
  let totalOk = 0
  let totalErr = 0
  for (const r of results) {
    if (r.ok === true) {
      const folder = root.folder(r.folder)
      folder?.file(r.filename, r.buf)
      manifestLines.push(`[OK]   ${r.folder}/${r.filename}`)
      totalOk++
    } else {
      const err = r as JobErr
      manifestLines.push(`[FAIL] ${err.folder}/${err.filename} — ${err.reason}`)
      totalErr++
    }
  }
  if (totalErr > 0) {
    root.file(
      "PIECES_NON_RECUPEREES.txt",
      `${totalErr} pièce(s) n'ont pas pu être incluses dans ce ZIP.\nListe :\n\n${manifestLines.filter(l => l.startsWith("[FAIL]")).join("\n")}`
    )
  }

  // 7. Fire-and-forget : log l'accès ZIP
  void supabaseAdmin.from("dossier_access_log").insert({
    email: valid.email.toLowerCase(),
    token_hash: hashToken(token),
    ip_hash: hashIP(ip || "unknown"),
    user_agent: req.headers.get("user-agent")?.slice(0, 200) || null,
    document_key: "zip",
  })

  // 8. Bump consultation_count (graceful — read-then-write, fire-and-forget)
  void (async () => {
    const th = hashToken(token)
    const { data: row } = await supabaseAdmin
      .from("dossier_share_tokens")
      .select("consultation_count")
      .eq("token_hash", th)
      .maybeSingle()
    if (row) {
      await supabaseAdmin
        .from("dossier_share_tokens")
        .update({
          consultation_count: (row.consultation_count ?? 0) + 1,
          last_consulted_at: new Date().toISOString(),
        })
        .eq("token_hash", th)
    }
  })().catch(() => undefined)

  // 9. Stream binaire
  const zipBuf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } })
  return new NextResponse(new Uint8Array(zipBuf), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="dossier_${safeName}.zip"`,
      "Cache-Control": "private, no-store",
      "X-Dossier-Files-Ok": String(totalOk),
      "X-Dossier-Files-Err": String(totalErr),
    },
  })
}
