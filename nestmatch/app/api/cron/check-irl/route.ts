/**
 * V38.4 — GET /api/cron/check-irl
 * Audit V37 R37.2 — alerte trimestrielle si IRL_HISTORIQUE pas à jour.
 *
 * Cron Vercel : 0 0 5 1,4,7,10 *  (5 janvier/avril/juillet/octobre — laisse
 * 5 jours de marge à l'INSEE pour publier).
 *
 * Le cron ne PUSH pas le nouveau IRL automatiquement (l'API INSEE nécessite
 * une clé OAuth, hors scope V38). Il vérifie juste que IRL_HISTORIQUE
 * contient le trimestre attendu et alerte sinon (Sentry + console.error).
 *
 * Auth : `Authorization: Bearer ${CRON_SECRET}` ou origin Vercel.
 */

import { NextRequest, NextResponse } from "next/server"
import { IRL_HISTORIQUE } from "@/lib/irl"

function expectedTrimestre(now: Date = new Date()): { annee: number; trimNum: number; trimLabel: string } {
  const m = now.getMonth() + 1
  const y = now.getFullYear()
  if (m >= 4 && m < 7) return { annee: y, trimNum: 1, trimLabel: `T1 ${y}` }
  if (m >= 7 && m < 10) return { annee: y, trimNum: 2, trimLabel: `T2 ${y}` }
  if (m >= 10) return { annee: y, trimNum: 3, trimLabel: `T3 ${y}` }
  return { annee: y - 1, trimNum: 4, trimLabel: `T4 ${y - 1}` }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  // Vercel cron envoie Authorization: Bearer <CRON_SECRET>
  if (secret && auth !== `Bearer ${secret}`) {
    // En dev sans CRON_SECRET, on autorise (pour test local).
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }
  }

  const expected = expectedTrimestre()
  const last = IRL_HISTORIQUE[0]
  const isUpToDate = last.annee === expected.annee && last.trimNum === expected.trimNum

  if (isUpToDate) {
    return NextResponse.json({
      ok: true,
      status: "up_to_date",
      lastKnown: last.trimestre,
      expected: expected.trimLabel,
    })
  }

  // Pas à jour → log warning Sentry-ready + retour status outdated.
  const message = `IRL_HISTORIQUE pas à jour : dernier ${last.trimestre}, attendu ${expected.trimLabel}. Lancer 'npm run update-irl' pour ajouter la ligne.`
  console.warn(`[cron/check-irl] ${message}`)
  return NextResponse.json({
    ok: true,
    status: "outdated",
    lastKnown: last.trimestre,
    expected: expected.trimLabel,
    message,
  })
}
