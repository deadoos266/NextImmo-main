/**
 * V95.B.1 — GET /api/proprietaire/loyers
 *
 * Récupère les loyers agrégés du proprio authentifié pour une période donnée.
 * Sert à alimenter la page /proprietaire/loyers (vue tableau croisé).
 *
 * Query params :
 *   range  : "3m" | "6m" | "12m" | "ytd" | "all" (défaut "12m")
 *   format : "json" (défaut) | "csv"
 *   status : "all" | "paid" | "pending" | "late" (défaut "all")
 *
 * Réponse JSON :
 *   {
 *     ok: true,
 *     period: { start, end, months: ["YYYY-MM", ...] },
 *     baux: [{ annonce_id, titre, ville, locataire_email, montant_mensuel }],
 *     loyers: [{ annonce_id, mois, montant, statut, date_confirmation }],
 *     kpis: { total_encaisse, total_attendu, taux_paiement_pct, retard_count }
 *   }
 *
 * Auth : NextAuth session requise + proprio (ou admin).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Range = "3m" | "6m" | "12m" | "ytd" | "all"

function monthsBetween(start: Date, end: Date): string[] {
  const months: string[] = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const stop = new Date(end.getFullYear(), end.getMonth(), 1)
  while (cursor.getTime() <= stop.getTime()) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`)
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return months
}

function computeRange(range: Range): { start: Date; end: Date } {
  const today = new Date()
  const end = new Date(today.getFullYear(), today.getMonth(), 1)
  let start: Date
  switch (range) {
    case "3m":  start = new Date(today.getFullYear(), today.getMonth() - 2, 1); break
    case "6m":  start = new Date(today.getFullYear(), today.getMonth() - 5, 1); break
    case "12m": start = new Date(today.getFullYear(), today.getMonth() - 11, 1); break
    case "ytd": start = new Date(today.getFullYear(), 0, 1); break
    case "all": start = new Date(2020, 0, 1); break
  }
  return { start, end }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 })
  }

  const url = new URL(req.url)
  const rangeParam = url.searchParams.get("range") as Range | null
  const range: Range = (rangeParam && ["3m","6m","12m","ytd","all"].includes(rangeParam)) ? rangeParam : "12m"
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json"
  const status = url.searchParams.get("status") || "all"

  const { start, end } = computeRange(range)
  const startMois = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`
  const months = monthsBetween(start, end)

  // 1. Récupère les baux actifs du proprio (statut loué + locataire identifié)
  const { data: baux } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, ville, adresse, locataire_email, prix, charges, bail_source, date_debut_bail")
    .eq("proprietaire_email", email)
    .eq("statut", "loué")
    .not("locataire_email", "is", null)
    .limit(500)

  const bauxArr = (baux || []).map(b => ({
    annonce_id: b.id,
    titre: b.titre,
    ville: b.ville,
    adresse: b.adresse,
    locataire_email: b.locataire_email,
    montant_mensuel: (Number(b.prix) || 0) + (Number(b.charges) || 0),
    bail_source: b.bail_source,
    date_debut: b.date_debut_bail,
  }))

  if (bauxArr.length === 0) {
    return NextResponse.json({
      ok: true,
      period: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), months },
      baux: [],
      loyers: [],
      kpis: { total_encaisse: 0, total_attendu: 0, taux_paiement_pct: 0, retard_count: 0 },
    })
  }

  // 2. Récupère les loyers sur la période
  const annonceIds = bauxArr.map(b => b.annonce_id)
  let loyersQuery = supabaseAdmin
    .from("loyers")
    .select("annonce_id, mois, montant, statut, date_confirmation, quittance_pdf_url, notified_retard_at")
    .in("annonce_id", annonceIds)
    .gte("mois", startMois)
    .order("mois", { ascending: false })
    .limit(5000)
  if (status === "paid") loyersQuery = loyersQuery.eq("statut", "confirmé")
  else if (status === "pending") loyersQuery = loyersQuery.eq("statut", "déclaré")

  const { data: loyers } = await loyersQuery
  const loyersArr = (loyers || []).map(l => ({
    annonce_id: l.annonce_id as number,
    mois: l.mois as string,
    montant: Number(l.montant) || 0,
    statut: l.statut as string,
    date_confirmation: l.date_confirmation,
    quittance_pdf_url: l.quittance_pdf_url,
    en_retard: !!l.notified_retard_at,
  }))

  // 3. KPIs
  const today = new Date()
  const moisCourant = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`
  const totalEncaisse = loyersArr.filter(l => l.statut === "confirmé").reduce((s, l) => s + l.montant, 0)
  const totalAttendu = bauxArr.reduce((s, b) => {
    // Pour chaque bail, on compte les mois entre max(start, date_debut) et today
    const debut = b.date_debut ? new Date(b.date_debut) : null
    if (!debut) return s + b.montant_mensuel * months.length
    const effectiveStart = debut > start ? debut : start
    if (effectiveStart > end) return s
    const nbMois = monthsBetween(effectiveStart, end).length
    return s + b.montant_mensuel * nbMois
  }, 0)
  const tauxPaiement = totalAttendu > 0 ? Math.round((totalEncaisse / totalAttendu) * 100) : 0
  const retardCount = loyersArr.filter(l => l.statut === "déclaré" && l.mois < moisCourant).length

  if (format === "csv") {
    const header = "Mois,Annonce,Locataire,Montant,Statut,Date confirmation\n"
    const rows = loyersArr.map(l => {
      const b = bauxArr.find(x => x.annonce_id === l.annonce_id)
      return `${l.mois},"${b?.titre || ""}","${b?.locataire_email || ""}",${l.montant},${l.statut},${l.date_confirmation || ""}`
    }).join("\n")
    return new NextResponse(header + rows, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="loyers-${range}-${new Date().toISOString().slice(0,10)}.csv"`,
      },
    })
  }

  return NextResponse.json({
    ok: true,
    period: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), months },
    baux: bauxArr,
    loyers: loyersArr,
    kpis: {
      total_encaisse: totalEncaisse,
      total_attendu: totalAttendu,
      taux_paiement_pct: tauxPaiement,
      retard_count: retardCount,
    },
  })
}
