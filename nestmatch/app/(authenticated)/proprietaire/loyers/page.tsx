"use client"
/**
 * V95.B.1 — /proprietaire/loyers — Suivi multi-baux des loyers.
 *
 * Vue tableau croisé (lignes = baux, colonnes = mois) avec :
 *  - KPIs cards : encaissé / attendu / taux paiement / retards
 *  - Range selector : 3m / 6m / 12m / YTD / Tout
 *  - Cellules colorées par statut paiement (✅ payé / 🟡 en attente / 🔴 retard / — pas dû)
 *  - Boutons : Export CSV + Email rappel impayés (TODO V96)
 *  - Click cellule : modal détail (TODO V96 — pour MVP, lien direct vers /proprietaire si statut pending)
 */

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useResponsive } from "../../../hooks/useResponsive"

type Bail = {
  annonce_id: number
  titre: string | null
  ville: string | null
  adresse: string | null
  locataire_email: string
  montant_mensuel: number
  bail_source: string | null
  date_debut: string | null
}
type Loyer = {
  annonce_id: number
  mois: string
  montant: number
  statut: string
  date_confirmation: string | null
  quittance_pdf_url: string | null
  en_retard: boolean
}
type Period = { start: string; end: string; months: string[] }
type Kpis = {
  total_encaisse: number
  total_attendu: number
  taux_paiement_pct: number
  retard_count: number
}
type ApiResponse = {
  ok: boolean
  period: Period
  baux: Bail[]
  loyers: Loyer[]
  kpis: Kpis
}

type Range = "3m" | "6m" | "12m" | "ytd" | "all"
const RANGES: { key: Range; label: string }[] = [
  { key: "3m",  label: "3 mois" },
  { key: "6m",  label: "6 mois" },
  { key: "12m", label: "12 mois" },
  { key: "ytd", label: "Cette année" },
  { key: "all", label: "Tout" },
]

function formatMois(mois: string): string {
  const [y, m] = mois.split("-")
  if (!y || !m) return mois
  try {
    const d = new Date(Number(y), Number(m) - 1, 1)
    return d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })
  } catch {
    return mois
  }
}

const T = {
  bg: "#F7F4EF",
  ink: "#111",
  muted: "#8a8477",
  line: "#EAE6DF",
  card: "#fff",
  success: "#15803d",
  successBg: "#F0FAEE",
  successLine: "#C6E9C0",
  warn: "#a16207",
  warnBg: "#FBF6EA",
  warnLine: "#EADFC6",
  err: "#b91c1c",
  errBg: "#FEECEC",
  errLine: "#F4C9C9",
}

export default function ProprietaireLoyersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { isMobile } = useResponsive()
  const [range, setRange] = useState<Range>("12m")
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth")
  }, [status, router])

  useEffect(() => {
    if (status !== "authenticated") return
    setLoading(true)
    setError(null)
    fetch(`/api/proprietaire/loyers?range=${range}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (j?.ok) setData(j as ApiResponse)
        else setError(j?.error || "Chargement impossible")
      })
      .catch(e => setError(e instanceof Error ? e.message : "Erreur réseau"))
      .finally(() => setLoading(false))
  }, [range, status])

  if (status === "loading" || loading) {
    return (
      <main style={{ minHeight: "100vh", background: T.bg, padding: 40, fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ color: T.muted, textAlign: "center", marginTop: 80 }}>Chargement…</p>
      </main>
    )
  }

  if (error) {
    return (
      <main style={{ minHeight: "100vh", background: T.bg, padding: 40, fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ color: T.err, textAlign: "center", marginTop: 80 }}>{error}</p>
      </main>
    )
  }

  if (!data) return null

  const cellByKey = new Map<string, Loyer>()
  for (const l of data.loyers) {
    cellByKey.set(`${l.annonce_id}|${l.mois}`, l)
  }

  function cellStatut(bail: Bail, mois: string): { state: "paid" | "pending" | "late" | "future" | "out_of_range"; loyer: Loyer | null; label: string } {
    const today = new Date()
    const moisCourant = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`
    // Si le bail n'a pas démarré pour ce mois
    if (bail.date_debut) {
      const debut = bail.date_debut.slice(0, 7)
      if (mois < debut) return { state: "out_of_range", loyer: null, label: "" }
    }
    const loyer = cellByKey.get(`${bail.annonce_id}|${mois}`) || null
    if (!loyer) {
      if (mois > moisCourant) return { state: "future", loyer: null, label: "—" }
      return { state: "late", loyer: null, label: "Manquant" }
    }
    if (loyer.statut === "confirmé") return { state: "paid", loyer, label: "Payé" }
    if (mois < moisCourant) return { state: "late", loyer, label: "Retard" }
    return { state: "pending", loyer, label: "En attente" }
  }

  function cellStyle(state: "paid" | "pending" | "late" | "future" | "out_of_range"): React.CSSProperties {
    const base: React.CSSProperties = {
      padding: "8px 6px",
      textAlign: "center",
      fontSize: 11,
      fontWeight: 600,
      borderRight: `1px solid ${T.line}`,
      whiteSpace: "nowrap",
    }
    if (state === "paid") return { ...base, background: T.successBg, color: T.success }
    if (state === "pending") return { ...base, background: T.warnBg, color: T.warn }
    if (state === "late") return { ...base, background: T.errBg, color: T.err }
    if (state === "future") return { ...base, background: T.bg, color: T.muted, opacity: 0.4 }
    return { ...base, background: "transparent", color: T.muted, opacity: 0.3 }
  }

  return (
    <main style={{ minHeight: "100vh", background: T.bg, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500&display=swap');`}</style>
      <div style={{ maxWidth: 1300, margin: "0 auto", padding: isMobile ? "32px 16px 60px" : "56px 48px 80px" }}>

        {/* Hero */}
        <header style={{ marginBottom: isMobile ? 28 : 36 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "1.6px", margin: 0 }}>
            Tableau de bord propriétaire
          </p>
          <h1 style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontStyle: "italic", fontWeight: 500,
            fontSize: isMobile ? 36 : 48,
            letterSpacing: "-0.6px",
            color: T.ink,
            margin: "8px 0 12px",
            lineHeight: 1.1,
          }}>
            Suivi des loyers
          </h1>
          <p style={{ fontSize: 14, color: "#4b5563", margin: 0, lineHeight: 1.55, maxWidth: 600 }}>
            Vue d&apos;ensemble de l&apos;encaissement de tous vos baux actifs. Filtre par période, exportez en CSV, et identifiez en un coup d&apos;œil les retards.
          </p>
        </header>

        {/* Range selector + actions — V96.11 mobile : overflowX auto pour
            permettre scroll horizontal si 5 boutons débordent sur petit écran */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
          <div style={{ display: "inline-flex", gap: 4, background: T.card, border: `1px solid ${T.line}`, borderRadius: 999, padding: 4, maxWidth: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            {RANGES.map(r => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                style={{
                  background: range === r.key ? T.ink : "transparent",
                  color: range === r.key ? "#fff" : T.ink,
                  border: "none", borderRadius: 999,
                  padding: "7px 14px",
                  fontSize: 12, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit",
                  whiteSpace: "nowrap",
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a
              href={`/api/proprietaire/loyers?range=${range}&format=csv`}
              download
              style={{ background: T.card, border: `1px solid ${T.line}`, color: T.ink, borderRadius: 999, padding: "8px 16px", fontSize: 11, fontWeight: 700, textDecoration: "none", textTransform: "uppercase", letterSpacing: "0.4px", fontFamily: "inherit" }}
            >
              Export CSV
            </a>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
          {[
            { label: "Total encaissé", val: `${data.kpis.total_encaisse.toLocaleString("fr-FR")} €`, bg: T.successBg, color: T.success, border: T.successLine },
            { label: "Total attendu", val: `${data.kpis.total_attendu.toLocaleString("fr-FR")} €`, bg: T.card, color: T.ink, border: T.line },
            { label: "Taux paiement", val: `${data.kpis.taux_paiement_pct}%`, bg: T.card, color: T.ink, border: T.line },
            { label: "Loyers en retard", val: String(data.kpis.retard_count), bg: data.kpis.retard_count > 0 ? T.errBg : T.card, color: data.kpis.retard_count > 0 ? T.err : T.muted, border: data.kpis.retard_count > 0 ? T.errLine : T.line },
          ].map(k => (
            <div key={k.label} style={{ background: k.bg, border: `1px solid ${k.border}`, borderRadius: 16, padding: isMobile ? "14px 16px" : "18px 20px" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "1.2px", margin: 0 }}>{k.label}</p>
              <p style={{ fontSize: isMobile ? 20 : 26, fontWeight: 700, color: k.color, margin: "8px 0 0", letterSpacing: "-0.5px", fontVariantNumeric: "tabular-nums" }}>{k.val}</p>
            </div>
          ))}
        </div>

        {/* Tableau croisé */}
        {data.baux.length === 0 ? (
          <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 20, padding: 60, textAlign: "center" }}>
            <p style={{ fontSize: 14, color: T.muted, margin: 0, lineHeight: 1.6 }}>
              Aucun bail actif. Importez ou créez un bail pour voir le suivi des loyers ici.
            </p>
            <Link href="/proprietaire" style={{ display: "inline-block", marginTop: 16, background: T.ink, color: "#fff", padding: "10px 22px", borderRadius: 999, textDecoration: "none", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px" }}>
              Voir mes biens →
            </Link>
          </div>
        ) : (
          <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 20, overflow: "hidden", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: T.bg }}>
                  <th style={{ padding: "12px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "1.2px", borderRight: `1px solid ${T.line}`, position: "sticky", left: 0, background: T.bg, zIndex: 1, minWidth: 220 }}>
                    Bail
                  </th>
                  {data.period.months.map(m => (
                    <th key={m} style={{ padding: "12px 8px", textAlign: "center", fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.6px", borderRight: `1px solid ${T.line}`, whiteSpace: "nowrap", minWidth: 70 }}>
                      {formatMois(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.baux.map(b => (
                  <tr key={b.annonce_id} style={{ borderTop: `1px solid ${T.line}` }}>
                    <td style={{ padding: "12px 14px", borderRight: `1px solid ${T.line}`, position: "sticky", left: 0, background: T.card, zIndex: 1 }}>
                      <Link href={`/proprietaire/bail/${b.annonce_id}`} style={{ color: T.ink, fontWeight: 600, fontSize: 13, textDecoration: "none", display: "block", lineHeight: 1.3 }}>
                        {b.titre || `Bail #${b.annonce_id}`}
                      </Link>
                      <p style={{ fontSize: 11, color: T.muted, margin: "2px 0 0" }}>
                        {b.ville} · {b.locataire_email}
                      </p>
                      <p style={{ fontSize: 11, color: T.muted, margin: "1px 0 0", fontVariantNumeric: "tabular-nums" }}>
                        {b.montant_mensuel.toLocaleString("fr-FR")} €/mois
                      </p>
                    </td>
                    {data.period.months.map(m => {
                      const { state, label } = cellStatut(b, m)
                      return (
                        <td key={m} style={cellStyle(state)} title={`${formatMois(m)} · ${label || "Non applicable"}`}>
                          {label}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Légende */}
        {data.baux.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 18, fontSize: 11, color: T.muted }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: T.successBg, border: `1px solid ${T.successLine}` }} />
              Payé
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: T.warnBg, border: `1px solid ${T.warnLine}` }} />
              En attente
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: T.errBg, border: `1px solid ${T.errLine}` }} />
              Retard
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: T.bg, border: `1px solid ${T.line}`, opacity: 0.5 }} />
              Pas dû / futur
            </span>
          </div>
        )}
      </div>
    </main>
  )
}
