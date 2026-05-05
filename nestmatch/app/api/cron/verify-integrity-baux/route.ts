/**
 * V69.2c — GET /api/cron/verify-integrity-baux
 *
 * Cron hebdomadaire (dimanche 4h Paris). Pour chaque bail signé,
 * recalcule le hash SHA-256 du payload [BAIL_CARD] courant et compare
 * avec `bail_signatures.payload_hash_sha256` (snapshoté à la signature).
 *
 * Si mismatch → flag `integrity_check_failed_at` posé sur la signature
 * + log critique + email admin Paul. Audit-trail eIDAS proactif (vs
 * detection passive via /api/bail/[annonceId]/verify-integrity).
 *
 * Auth : Bearer CRON_SECRET en prod.
 *
 * NB : ne tape que les baux signés au moins une fois (locataire OU
 * bailleur). Les baux non encore signés sont skipped.
 */

import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { hashBailData } from "@/lib/bailHash"
import { sendEmail } from "@/lib/email/resend"
import type { BailData } from "@/lib/bailPDF"

export const runtime = "nodejs"

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tic3467@gmail.com"
const BAIL_PREFIX = "[BAIL_CARD]"

interface IntegrityResult {
  annonceId: number
  signatureId: string
  status: "ok" | "tampered" | "skipped"
  reason?: string
  expectedHash?: string
  actualHash?: string
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (secret && auth !== `Bearer ${secret}` && process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  // Fetch signatures avec hash snapshot non null, pas encore flaggées tampered
  const { data: sigs, error: sigsErr } = await supabaseAdmin
    .from("bail_signatures")
    .select("id, annonce_id, signataire_role, signataire_email, payload_hash_sha256, integrity_check_failed_at")
    .not("payload_hash_sha256", "is", null)
    .is("integrity_check_failed_at", null)
    .limit(500)

  if (sigsErr) {
    console.error("[cron/verify-integrity-baux] fetch sigs failed", sigsErr)
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 })
  }

  const results: IntegrityResult[] = []
  const tampered: IntegrityResult[] = []

  // Group by annonce_id pour éviter de re-fetcher le BAIL_CARD plusieurs fois
  const byAnnonce = new Map<number, typeof sigs>()
  for (const s of sigs || []) {
    const annId = s.annonce_id
    if (!annId) continue
    if (!byAnnonce.has(annId)) byAnnonce.set(annId, [])
    byAnnonce.get(annId)!.push(s)
  }

  for (const [annonceId, annSigs] of byAnnonce) {
    // Fetch dernier BAIL_CARD message pour cette annonce
    const { data: bailMsg } = await supabaseAdmin
      .from("messages")
      .select("contenu")
      .eq("annonce_id", annonceId)
      .ilike("contenu", `${BAIL_PREFIX}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!bailMsg?.contenu) {
      for (const s of annSigs) {
        results.push({ annonceId, signatureId: s.id, status: "skipped", reason: "no_bail_card" })
      }
      continue
    }

    let bailData: BailData | null = null
    try {
      const raw = (bailMsg.contenu as string).slice(BAIL_PREFIX.length)
      bailData = JSON.parse(raw) as BailData
    } catch {
      for (const s of annSigs) {
        results.push({ annonceId, signatureId: s.id, status: "skipped", reason: "bail_card_parse_failed" })
      }
      continue
    }

    let actualHash: string
    try {
      actualHash = await hashBailData(bailData)
    } catch (e) {
      console.error("[cron/verify-integrity-baux] hash failed", e)
      for (const s of annSigs) {
        results.push({ annonceId, signatureId: s.id, status: "skipped", reason: "hash_compute_failed" })
      }
      continue
    }

    for (const s of annSigs) {
      if (s.payload_hash_sha256 === actualHash) {
        results.push({ annonceId, signatureId: s.id, status: "ok" })
      } else {
        const result: IntegrityResult = {
          annonceId,
          signatureId: s.id,
          status: "tampered",
          expectedHash: s.payload_hash_sha256 ?? undefined,
          actualHash,
        }
        results.push(result)
        tampered.push(result)
        // Flag la signature comme intégrité compromise
        await supabaseAdmin
          .from("bail_signatures")
          .update({ integrity_check_failed_at: new Date().toISOString() })
          .eq("id", s.id)
      }
    }
  }

  // Email admin si tampered détecté
  if (tampered.length > 0) {
    try {
      const lines = tampered.slice(0, 20).map(t =>
        `- annonce_id=${t.annonceId} sig=${t.signatureId.slice(0, 8)} expected=${t.expectedHash?.slice(0, 16)} actual=${t.actualHash?.slice(0, 16)}`
      ).join("\n")
      const subject = `🚨 KeyMatch — ${tampered.length} signature(s) compromise(s)`
      const html = `
        <h2 style="color:#b91c1c">⚠ Intégrité bail compromise</h2>
        <p>Le cron <code>verify-integrity-baux</code> a détecté <strong>${tampered.length}</strong> signature(s) où le hash SHA-256 du payload ne correspond plus.</p>
        <pre style="background:#FEECEC;padding:12px;border-radius:8px;font-size:12px;overflow:auto">${lines}</pre>
        <p>Les signatures concernées ont été flaggées <code>integrity_check_failed_at</code>. Investigation manuelle requise.</p>
      `
      await sendEmail({
        to: ADMIN_EMAIL,
        subject,
        html,
        text: `${tampered.length} signatures bail compromises\n\n${lines}\n\nInvestigation manuelle requise.`,
        tags: [{ name: "type", value: "integrity_alert" }],
      })
    } catch (e) {
      console.error("[cron/verify-integrity-baux] admin email failed", e)
    }
  }

  return NextResponse.json({
    ok: true,
    scannedSignatures: sigs?.length ?? 0,
    scannedAnnonces: byAnnonce.size,
    tamperedCount: tampered.length,
    skippedCount: results.filter(r => r.status === "skipped").length,
  })
}
