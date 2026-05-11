/**
 * V89.12 — GET /api/cron/qa-bail-importe
 *
 * Test d'intégration server-side du flow "bail importé" complet :
 *   1. Crée une annonce synthétique (bail_source=imported_pending)
 *   2. Crée une invitation en attente
 *   3. Simule l'acceptance en ré-exécutant exactement la logique de
 *      /api/bail/accepter (mise à jour annonce + génération rétro loyers/EDL)
 *   4. Valide que tous les invariants attendus sont respectés
 *   5. Cleanup complet (annonce + invitations + loyers + EDL + notif)
 *   6. Log le résultat dans `qa_runs` (status success/fail + détails)
 *
 * Pourquoi ce cron : suite à V89, plusieurs bugs silencieux (colonne `loue`
 * inexistante, champs d'état non posés, etc.) ont cassé le flow sans qu'on
 * s'en aperçoive jusqu'à ce qu'un user teste. Ce cron tourne quotidiennement
 * et alerte par incident V71 si quoi que ce soit régresse.
 *
 * Limitation : ne teste PAS le flow OAuth NextAuth (l'auth est shuntée car
 * on ré-exécute la logique applicative au lieu d'appeler la route HTTP). Si
 * la route /api/bail/accepter est modifiée structurellement, ce test peut
 * passer alors que l'endpoint réel ne marche plus. À compléter avec un
 * health-check HTTP léger sur les routes critiques.
 *
 * Auth : Bearer CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { withCronLogging } from "@/lib/cron/withCronLogging"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Check = { name: string; ok: boolean; detail?: string }

function monthsBetween(startIso: string, endIso: string): string[] {
  const start = new Date(startIso)
  const end = new Date(endIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []
  const months: string[] = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const stop = new Date(end.getFullYear(), end.getMonth(), 1)
  while (cursor.getTime() <= stop.getTime()) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`)
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return months
}

export const GET = withCronLogging("qa-bail-importe", "0 5 * * *", async function cronGET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (process.env.NODE_ENV === "production" && (!cronSecret || auth !== `Bearer ${cronSecret}`)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const t0 = Date.now()
  const checks: Check[] = []
  // Identifiants uniques pour la run — facilite la détection et le nettoyage
  // d'éventuels orphelins (test interrompu, etc.)
  const runId = `qa-${Date.now()}-${randomBytes(3).toString("hex")}`
  const proprioEmail = `qa.proprio.${runId}@keymatch-test.local`
  const locataireEmail = `qa.locataire.${runId}@keymatch-test.local`
  const today = new Date()
  const dateEntree = new Date(today.getFullYear(), today.getMonth() - 2, 1).toISOString().slice(0, 10)  // 2 mois avant

  let annonceId: number | null = null
  let invitId: string | null = null

  try {
    // ─── ÉTAPE 1 — Setup synthétique ────────────────────────────────────
    // Crée une annonce comme le ferait /api/bail/importer
    const importMetadata = {
      date_signature: dateEntree,
      date_debut: dateEntree,
      duree_mois: 36,
      depot_garantie: 2000,
      imported_at: new Date().toISOString(),
      imported_by: proprioEmail,
      pdf_url: "https://example.com/qa-test.pdf",
      deja_installe: true,
      date_entree_reelle: dateEntree,
      loyers_passes_payes: true,
      edl_entree_deja_fait: true,
    }
    const { data: ann, error: annErr } = await supabaseAdmin
      .from("annonces")
      .insert({
        titre: `QA TEST ${runId}`,
        ville: "Paris",
        adresse: "1 rue de Test, 75001 Paris",
        prix: 1000,
        charges: 100,
        surface: 30,
        pieces: 2,
        meuble: false,
        proprietaire_email: proprioEmail,
        bail_source: "imported_pending",
        import_metadata: importMetadata,
        bail_pdf_url: "https://example.com/qa-test.pdf",
        statut: "loué",
        is_test: true,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single()
    if (annErr || !ann) throw new Error(`Setup annonce: ${annErr?.message || "no data"}`)
    annonceId = ann.id
    checks.push({ name: "setup_annonce", ok: true, detail: `id=${annonceId}` })

    // Crée l'invitation
    const token = randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    const { data: invit, error: invErr } = await supabaseAdmin
      .from("bail_invitations")
      .insert({
        annonce_id: annonceId,
        proprietaire_email: proprioEmail,
        locataire_email: locataireEmail,
        token,
        statut: "pending",
        loyer_hc: 1000,
        charges: 100,
        expires_at: expiresAt,
      })
      .select("id")
      .single()
    if (invErr || !invit) throw new Error(`Setup invitation: ${invErr?.message || "no data"}`)
    invitId = invit.id
    checks.push({ name: "setup_invitation", ok: true })

    // ─── ÉTAPE 2 — Simule l'acceptance (réplique /api/bail/accepter) ───
    const now = new Date().toISOString()
    // 2a) Update invitation
    await supabaseAdmin
      .from("bail_invitations")
      .update({ statut: "accepted", responded_at: now })
      .eq("id", invitId)
    // 2b) Update annonce
    await supabaseAdmin
      .from("annonces")
      .update({
        bail_source: "imported",
        locataire_email: locataireEmail,
        date_debut_bail: dateEntree,
        bail_genere_at: now,
        bail_signe_locataire_at: now,
        bail_signe_bailleur_at: now,
      })
      .eq("id", annonceId)
    // 2c) Génération rétro loyers
    const months = monthsBetween(dateEntree, now.slice(0, 10))
    const loyersToInsert = months.map(mois => ({
      annonce_id: annonceId,
      proprietaire_email: proprioEmail,
      locataire_email: locataireEmail,
      titre_bien: `QA TEST ${runId}`,
      mois,
      montant: 1100,
      statut: "confirmé",
      date_confirmation: now,
      created_at: now,
    }))
    if (loyersToInsert.length > 0) {
      await supabaseAdmin.from("loyers").insert(loyersToInsert)
    }
    // 2d) EDL d'entrée
    await supabaseAdmin.from("etats_des_lieux").insert({
      annonce_id: annonceId,
      proprietaire_email: proprioEmail,
      locataire_email: locataireEmail,
      email_bailleur: proprioEmail,
      email_locataire: locataireEmail,
      type: "entree",
      statut: "valide",
      date_edl: dateEntree,
      observations: `QA TEST ${runId} — EDL synthétique`,
      signe_locataire_at: now,
      signe_bailleur_at: now,
      date_validation: now,
    })

    // ─── ÉTAPE 3 — Validations ─────────────────────────────────────────
    const { data: annAfter } = await supabaseAdmin
      .from("annonces")
      .select("bail_source, locataire_email, date_debut_bail, bail_genere_at, bail_signe_locataire_at, bail_signe_bailleur_at, bail_pdf_url, statut")
      .eq("id", annonceId)
      .single()

    checks.push({
      name: "annonce.bail_source=imported",
      ok: annAfter?.bail_source === "imported",
      detail: String(annAfter?.bail_source),
    })
    checks.push({
      name: "annonce.locataire_email lié",
      ok: annAfter?.locataire_email === locataireEmail,
      detail: annAfter?.locataire_email || "null",
    })
    checks.push({
      name: "annonce.date_debut_bail posé",
      ok: !!annAfter?.date_debut_bail,
      detail: annAfter?.date_debut_bail || "null",
    })
    checks.push({
      name: "annonce.bail_signe_locataire_at posé",
      ok: !!annAfter?.bail_signe_locataire_at,
    })
    checks.push({
      name: "annonce.bail_signe_bailleur_at posé",
      ok: !!annAfter?.bail_signe_bailleur_at,
    })

    const { count: loyersCount } = await supabaseAdmin
      .from("loyers")
      .select("id", { count: "exact", head: true })
      .eq("annonce_id", annonceId)
    checks.push({
      name: "loyers générés (3 mois attendus)",
      ok: (loyersCount || 0) === 3,
      detail: `count=${loyersCount}`,
    })

    const { count: edlCount } = await supabaseAdmin
      .from("etats_des_lieux")
      .select("id", { count: "exact", head: true })
      .eq("annonce_id", annonceId)
      .eq("type", "entree")
      .eq("statut", "valide")
    checks.push({
      name: "EDL d'entrée valide créé",
      ok: (edlCount || 0) === 1,
      detail: `count=${edlCount}`,
    })

    const { data: invitAfter } = await supabaseAdmin
      .from("bail_invitations")
      .select("statut")
      .eq("id", invitId)
      .single()
    checks.push({
      name: "invitation.statut=accepted",
      ok: invitAfter?.statut === "accepted",
      detail: String(invitAfter?.statut),
    })
  } catch (err) {
    checks.push({
      name: "exception",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    })
  } finally {
    // ─── CLEANUP — toujours exécuté, même si une étape a planté ────────
    if (annonceId) {
      await supabaseAdmin.from("loyers").delete().eq("annonce_id", annonceId)
      await supabaseAdmin.from("etats_des_lieux").delete().eq("annonce_id", annonceId)
      await supabaseAdmin.from("bail_invitations").delete().eq("annonce_id", annonceId)
      await supabaseAdmin.from("annonces").delete().eq("id", annonceId)
    }
  }

  const allOk = checks.every(c => c.ok)
  const failedChecks = checks.filter(c => !c.ok)

  // Log dans qa_runs
  try {
    await supabaseAdmin.from("qa_runs").insert({
      scenario_name: "QA Bail Importé (cron)",
      scenario_file: "internal:qa-bail-importe",
      status: allOk ? "pass" : "fail",
      steps_total: checks.length,
      steps_passed: checks.filter(c => c.ok).length,
      steps_failed: failedChecks.length,
      duration_ms: Date.now() - t0,
      trigger: "cron",
      triggered_by: "cron",
      result_summary: { checks, runId },
      finished_at: new Date().toISOString(),
    })
  } catch (e) {
    console.warn("[qa-bail-importe] qa_runs insert failed", e)
  }

  // Si fail → créer un incident V71 (sauf si déjà ouvert pour ce service)
  if (!allOk) {
    try {
      const { count: openCount } = await supabaseAdmin
        .from("incidents")
        .select("id", { count: "exact", head: true })
        .eq("service", "app")
        .ilike("title", "%QA Bail Importé%")
        .in("status", ["investigating", "identified", "monitoring"])
      if ((openCount || 0) === 0) {
        await supabaseAdmin.from("incidents").insert({
          title: "QA Bail Importé — checks en échec",
          description: `${failedChecks.length}/${checks.length} validations ont échoué : ${failedChecks.map(c => c.name).join(", ")}`,
          severity: "minor",
          status: "investigating",
          service: "app",
          is_public: false,
        })
      }
    } catch (e) {
      console.warn("[qa-bail-importe] incident insert failed", e)
    }
  }

  return NextResponse.json({
    ok: allOk,
    runId,
    checks,
    duration_ms: Date.now() - t0,
    failed: failedChecks.length,
    note: allOk
      ? "Tous les checks passent — flow bail importé OK."
      : "Au moins un check a échoué. Un incident a été ouvert (cf /admin/health).",
  })
})
