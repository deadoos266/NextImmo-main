/**
 * V34.2 — GET /api/bail/[annonceId]/verify-integrity
 * Audit produit V31 R3.2 : "Hash PDF jamais re-vérifié post-signature.
 * Tampering possible non détecté."
 *
 * Vérifie que le bailData courant (dernier message [BAIL_CARD] dans la
 * conversation) correspond au snapshot stocké au moment de la signature.
 *
 * 3 cas possibles :
 * - { ok: true, status: "verified" }     → hash courant === hash stocké, intégrité OK.
 * - { ok: true, status: "no_signature" } → aucune signature en DB, rien à vérifier.
 * - { ok: false, status: "tampered" }    → mismatch détecté = bail modifié post-signature.
 * - { ok: true, status: "legacy" }       → signature antérieure à V34, pas de snapshot.
 *
 * Auth : NextAuth + match proprio OU locataire de l'annonce.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { hashBailData, constantTimeEqual } from "@/lib/bailHash"
import type { BailData } from "@/lib/bailPDF"

interface RouteParams {
  params: Promise<{ annonceId: string }>
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { annonceId: annonceIdRaw } = await params
  const annonceId = Number(annonceIdRaw)
  if (!Number.isFinite(annonceId)) {
    return NextResponse.json({ ok: false, error: "annonceId invalide" }, { status: 400 })
  }

  const session = await getServerSession(authOptions)
  const userEmail = session?.user?.email?.toLowerCase()
  if (!userEmail) {
    return NextResponse.json({ ok: false, error: "Auth requise" }, { status: 401 })
  }

  // Auth : seul proprio ou locataire de l'annonce peut vérifier.
  const { data: annonce } = await supabaseAdmin
    .from("annonces")
    .select("id, proprietaire_email, locataire_email")
    .eq("id", annonceId)
    .maybeSingle()
  if (!annonce) {
    return NextResponse.json({ ok: false, error: "Annonce introuvable" }, { status: 404 })
  }
  const propEmail = (annonce.proprietaire_email || "").toLowerCase()
  const locEmail = (annonce.locataire_email || "").toLowerCase()
  if (userEmail !== propEmail && userEmail !== locEmail) {
    return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 403 })
  }

  // Récupère la dernière signature avec snapshot (priorité locataire car
  // c'est elle qui horodate l'engagement principal).
  const { data: sigs } = await supabaseAdmin
    .from("bail_signatures")
    .select("signataire_role, signe_at, payload_hash_sha256, payload_snapshot")
    .eq("annonce_id", annonceId)
    .order("signe_at", { ascending: true })

  if (!sigs || sigs.length === 0) {
    return NextResponse.json({ ok: true, status: "no_signature" })
  }

  // Cherche la 1ère signature avec snapshot (= V34+). Si aucune n'a de
  // snapshot, la signature est legacy V14-V33 (hash custom, pas de re-vérif).
  const sigWithSnapshot = sigs.find(s => s.payload_hash_sha256 && s.payload_snapshot)
  if (!sigWithSnapshot) {
    return NextResponse.json({
      ok: true,
      status: "legacy",
      signedAt: sigs[0].signe_at,
      message: "Signature antérieure à V34 — vérification d'intégrité non disponible.",
    })
  }

  // Récupère le payload [BAIL_CARD] courant et recalcule le hash.
  const { data: bailMsg } = await supabaseAdmin
    .from("messages")
    .select("contenu")
    .eq("annonce_id", annonceId)
    .ilike("contenu", "[BAIL_CARD]%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!bailMsg?.contenu) {
    return NextResponse.json({ ok: false, status: "no_payload", error: "Payload bail introuvable" })
  }

  let currentBail: BailData
  try {
    currentBail = JSON.parse(bailMsg.contenu.slice("[BAIL_CARD]".length)) as BailData
  } catch {
    return NextResponse.json({ ok: false, status: "no_payload", error: "Payload illisible" })
  }

  const currentHash = await hashBailData(currentBail)
  const storedHash = String(sigWithSnapshot.payload_hash_sha256)

  if (constantTimeEqual(currentHash, storedHash)) {
    return NextResponse.json({
      ok: true,
      status: "verified",
      signedAt: sigWithSnapshot.signe_at,
      hash: currentHash,
    })
  }

  return NextResponse.json({
    ok: false,
    status: "tampered",
    signedAt: sigWithSnapshot.signe_at,
    storedHash,
    currentHash,
    message: "Le bail courant ne correspond plus au document signé. Modifications détectées.",
  })
}
