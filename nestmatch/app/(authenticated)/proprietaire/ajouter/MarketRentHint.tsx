"use client"
import { useEffect, useState } from "react"

/**
 * V97.34 P3-9 — Estimateur de loyer enrichi.
 *
 * Consomme désormais GET /api/estimer-loyer (server-side, agrégation côté
 * Postgres). Affiche médiane + fourchette interquartile (P25-P75, plus
 * informatif que min-max), prix au m² et badge de confiance.
 *
 * Compatible 100% avec les 3 callers existants (ajouter/modifier/estimateur) :
 * mêmes Props (ville, surface, pieces, prix, onUseMedian). Le param `meuble`
 * est optionnel pour affiner.
 */
interface Props {
  ville: string
  surface: string | number
  pieces: string | number
  prix: string | number
  meuble?: boolean | null
  /** Optionnel : permet de pré-remplir le champ Prix au click sur le médian. */
  onUseMedian?: (median: number) => void
}

interface ApiResponse {
  ok: boolean
  sample_size: number
  median?: number
  min?: number
  max?: number
  percentile_25?: number
  percentile_75?: number
  price_per_m2?: { median: number; min: number; max: number }
  confidence?: "high" | "medium" | "low"
  hint?: string
}

export default function MarketRentHint({ ville, surface, pieces, prix, meuble, onUseMedian }: Props) {
  const [result, setResult] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!ville || String(ville).trim().length < 2) { setResult(null); return }
    const surfaceNum = Number(surface)
    if (!Number.isFinite(surfaceNum) || surfaceNum < 5) { setResult(null); return }

    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          ville: String(ville).trim(),
          surface: String(surfaceNum),
        })
        const piecesNum = Number(pieces)
        if (Number.isFinite(piecesNum) && piecesNum >= 1) params.set("pieces", String(piecesNum))
        if (meuble === true) params.set("meuble", "true")
        else if (meuble === false) params.set("meuble", "false")

        const r = await fetch(`/api/estimer-loyer?${params.toString()}`)
        const j: ApiResponse = await r.json()
        if (!cancelled) setResult(j)
      } catch {
        if (!cancelled) setResult(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 400)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [ville, surface, pieces, meuble])

  if (!ville || String(ville).trim().length < 2) return null
  const surfaceNum = Number(surface)
  if (!Number.isFinite(surfaceNum) || surfaceNum < 5) return null

  if (loading) {
    return (
      <div style={{ background: "#F7F4EF", borderRadius: 12, padding: "10px 14px", fontSize: 12, color: "#8a8477", marginTop: 8 }}>
        Estimation du loyer de marché…
      </div>
    )
  }

  if (!result || !result.ok || !result.median || result.sample_size < 5) {
    return (
      <div style={{ background: "#F7F4EF", borderRadius: 12, padding: "10px 14px", fontSize: 12, color: "#8a8477", marginTop: 8 }}>
        {result?.hint || `Pas encore assez de biens similaires à ${ville} pour estimer un loyer de marché.`}
      </div>
    )
  }

  const median = result.median
  const prixNum = Number(prix) || 0
  const diff = prixNum > 0 ? ((prixNum - median) / median) * 100 : 0
  const diffLabel = prixNum === 0
    ? null
    : Math.abs(diff) < 5
      ? "conforme au marché"
      : diff > 0
        ? `+${Math.round(diff)} % au-dessus du marché`
        : `${Math.round(diff)} % en-dessous du marché`
  const diffColor = Math.abs(diff) < 5 ? "#15803d" : Math.abs(diff) < 15 ? "#a16207" : "#b91c1c"

  const confidence = result.confidence || "low"
  const confidenceBadge = confidence === "high"
    ? { label: "fiabilité élevée", bg: "#dcfce7", color: "#166534" }
    : confidence === "medium"
      ? { label: "fiabilité moyenne", bg: "#fef3c7", color: "#92400e" }
      : { label: "fiabilité faible", bg: "#fee2e2", color: "#991b1b" }

  return (
    <div style={{ background: "#f0f9ff", border: "1px solid #D7E3F4", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "#111", marginTop: 8, lineHeight: 1.5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>
            Loyer médian : <span style={{ color: "#1d4ed8" }}>{median} € CC</span>
            <span
              style={{
                marginLeft: 8, fontSize: 10, fontWeight: 700,
                background: confidenceBadge.bg, color: confidenceBadge.color,
                padding: "2px 8px", borderRadius: 999,
                textTransform: "uppercase", letterSpacing: "0.5px",
                verticalAlign: "middle",
              }}
              title={`Basé sur ${result.sample_size} annonces similaires`}
            >
              {confidenceBadge.label}
            </span>
          </p>

          {result.percentile_25 !== undefined && result.percentile_75 !== undefined && (
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#111" }}>
              50 % des biens entre <strong>{result.percentile_25} €</strong> et <strong>{result.percentile_75} €</strong>
              {" · "}
              <span style={{ color: "#8a8477" }}>plage observée {result.min}–{result.max} €</span>
            </p>
          )}

          {result.price_per_m2 && (
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#8a8477" }}>
              Prix au m² : <strong style={{ color: "#111" }}>{result.price_per_m2.median} €</strong> (médiane)
              {" · "}fourchette {result.price_per_m2.min}–{result.price_per_m2.max} €
              {" · "}{result.sample_size} bien{result.sample_size > 1 ? "s" : ""} similaire{result.sample_size > 1 ? "s" : ""}
            </p>
          )}

          {diffLabel && (
            <p style={{ margin: "6px 0 0", fontSize: 12, fontWeight: 700, color: diffColor }}>
              Votre prix est {diffLabel}
            </p>
          )}
        </div>

        {/* Bouton click-to-fill — pré-remplit le champ Prix avec la médiane.
            Visible uniquement si callback fourni ET prix actuel ≠ médian. */}
        {onUseMedian && Number(prix) !== median && (
          <button
            type="button"
            onClick={() => onUseMedian(median)}
            style={{
              background: "#1d4ed8", color: "#fff", border: "none",
              borderRadius: 999, padding: "6px 14px",
              fontSize: 11, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
              whiteSpace: "nowrap", letterSpacing: "0.3px",
              flexShrink: 0,
            }}
            title="Utiliser cette estimation comme loyer"
          >
            Utiliser {median} €
          </button>
        )}
      </div>
    </div>
  )
}
