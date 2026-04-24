"use client"
import { useEffect, useState } from "react"
import { estimerLoyerMarche } from "../../../lib/marketRent"

/**
 * Affiche une estimation du loyer de marché (médiane + fourchette min-max)
 * basée sur les biens similaires publiés sur la plateforme.
 * S'actualise dynamiquement quand ville/surface/pièces changent.
 */
interface Props {
  ville: string
  surface: string | number
  pieces: string | number
  prix: string | number
}

export default function MarketRentHint({ ville, surface, pieces, prix }: Props) {
  const [result, setResult] = useState<{ median: number | null; count: number; min: number | null; max: number | null } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!ville || String(ville).trim().length < 2) { setResult(null); return }
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      const r = await estimerLoyerMarche({ ville, surface: Number(surface) || null, pieces: pieces || null })
      if (!cancelled) {
        setResult(r)
        setLoading(false)
      }
    }, 400)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [ville, surface, pieces])

  if (!ville || String(ville).trim().length < 2) return null
  if (loading) {
    return (
      <div style={{ background: "#F7F4EF", borderRadius: 12, padding: "10px 14px", fontSize: 12, color: "#8a8477", marginTop: 8 }}>
        Estimation du loyer de marché…
      </div>
    )
  }
  if (!result || result.median === null) {
    return (
      <div style={{ background: "#F7F4EF", borderRadius: 12, padding: "10px 14px", fontSize: 12, color: "#8a8477", marginTop: 8 }}>
        Pas encore assez de biens similaires à {ville} pour estimer un loyer de marché.
      </div>
    )
  }

  const prixNum = Number(prix) || 0
  const diff = prixNum > 0 && result.median ? ((prixNum - result.median) / result.median) * 100 : 0
  const diffLabel = Math.abs(diff) < 5
    ? "conforme au marché"
    : diff > 0
      ? `+${Math.round(diff)}% au-dessus du marché`
      : `${Math.round(diff)}% en-dessous du marché`
  const diffColor = Math.abs(diff) < 5 ? "#15803d" : Math.abs(diff) < 15 ? "#a16207" : "#b91c1c"

  return (
    <div style={{ background: "#f0f9ff", border: "1px solid #D7E3F4", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#111", marginTop: 8, lineHeight: 1.5 }}>
      <p style={{ margin: 0, fontWeight: 700 }}>
        Loyer médian sur {ville}{pieces ? ` · ${pieces} pièces` : ""} : <span style={{ color: "#1d4ed8" }}>{result.median} €/mois</span>
      </p>
      <p style={{ margin: "4px 0 0", fontSize: 12, color: "#111" }}>
        Fourchette observée : {result.min} € à {result.max} €
        {" "}<span style={{ color: "#8a8477" }}>({result.count} bien{result.count > 1 ? "s" : ""} similaire{result.count > 1 ? "s" : ""})</span>
      </p>
      {prixNum > 0 && (
        <p style={{ margin: "4px 0 0", fontSize: 12, fontWeight: 700, color: diffColor }}>
          Votre prix est {diffLabel}
        </p>
      )}
    </div>
  )
}
