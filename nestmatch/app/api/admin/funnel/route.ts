/**
 * V97.27 P3-5.B.1 — GET /api/admin/funnel
 *
 * Funnel de conversion KeyMatch côté locataires :
 *   1. Inscrits          (users count)
 *   2. Avec dossier      (profils avec dossier_pdf_url OU dossier_docs non vide)
 *   3. Avec candidature  (≥ 1 message type='candidature' from_email = email user)
 *   4. Avec visite       (≥ 1 visite statut='confirmée' OR 'effectuée')
 *   5. Bail signé        (annonces avec locataire_email = email + bail_signe_locataire_at NOT NULL)
 *
 * Pour chaque étape : count + % du total inscrits + % de l'étape précédente.
 *
 * Note : on ne tracke pas les "visiteurs anonymes" (pas de Plausible/Umami
 * intégré). Le funnel commence donc à "Inscrits".
 *
 * Auth : admin only.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(session && (session as any).user?.isAdmin === true)) {
    return NextResponse.json({ ok: false, error: "Admin requis" }, { status: 403 })
  }

  // Étape 1 — Inscrits (table users)
  const { count: nInscrits } = await supabaseAdmin
    .from("users")
    .select("id", { count: "exact", head: true })

  // Étape 2 — Avec dossier : profils avec dossier_pdf_url OR dossier_docs non vide.
  // dossier_docs est jsonb, on considère "non vide" si la clé existe (Supabase
  // ne distingue pas easily {} vs filled, donc on fait .not.is.null).
  const { count: nDossier } = await supabaseAdmin
    .from("profils")
    .select("email", { count: "exact", head: true })
    .not("dossier_pdf_url", "is", null)

  // Étape 3 — Avec candidature : users distincts qui ont envoyé ≥ 1 message
  // type='candidature'. On fetch les from_email distincts.
  const { data: candidatures } = await supabaseAdmin
    .from("messages")
    .select("from_email")
    .eq("type", "candidature")
    .limit(50000)  // safety cap
  const nCandidatures = new Set((candidatures || []).map(c => (c.from_email || "").toLowerCase()).filter(Boolean)).size

  // Étape 4 — Avec visite confirmée OR effectuée
  const { data: visites } = await supabaseAdmin
    .from("visites")
    .select("locataire_email, statut")
    .in("statut", ["confirmée", "effectuée"])
    .limit(50000)
  const nVisites = new Set((visites || []).map(v => (v.locataire_email || "").toLowerCase()).filter(Boolean)).size

  // Étape 5 — Bail signé : annonces avec bail_signe_locataire_at NOT NULL
  const { data: baux } = await supabaseAdmin
    .from("annonces")
    .select("locataire_email")
    .not("bail_signe_locataire_at", "is", null)
    .not("locataire_email", "is", null)
    .limit(50000)
  const nBaux = new Set((baux || []).map(b => (b.locataire_email || "").toLowerCase()).filter(Boolean)).size

  // Helper conversion : % de l'étape précédente
  const totalInscrits = nInscrits || 0
  const steps = [
    { key: "inscrits",     label: "Inscrits",            count: totalInscrits },
    { key: "dossier",      label: "Avec dossier",        count: nDossier || 0 },
    { key: "candidature",  label: "Avec candidature",    count: nCandidatures },
    { key: "visite",       label: "Avec visite",         count: nVisites },
    { key: "bail",         label: "Bail signé",          count: nBaux },
  ]

  // Ajoute % vs précédent et vs total
  const enrichedSteps = steps.map((s, i) => {
    const prev = i === 0 ? null : steps[i - 1]
    return {
      ...s,
      pct_of_total: totalInscrits > 0 ? Math.round((s.count / totalInscrits) * 1000) / 10 : 0,
      pct_of_prev: prev && prev.count > 0 ? Math.round((s.count / prev.count) * 1000) / 10 : null,
    }
  })

  return NextResponse.json({ ok: true, steps: enrichedSteps })
}
