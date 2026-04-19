import { ImageResponse } from "next/og"
import { supabase } from "../../../lib/supabase"
import { CITY_NAMES, normalizeCityName } from "../../../lib/cityCoords"

/**
 * OG image dynamique pour /location/[ville] (1200×630).
 *
 * Affiche : branding NestMatch + "Location à [Ville]" + nombre d'annonces
 * disponibles + prix médian si calculable. Partagé sur réseaux sociaux,
 * donne directement le contexte aux prospects.
 */

export const alt = "Location à NestMatch"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

function cityFromSlug(slug: string): string | null {
  const decoded = decodeURIComponent(slug).replace(/-/g, " ").toLowerCase().trim()
  const match = CITY_NAMES.find(c => c.toLowerCase() === decoded)
  return match || null
}

function computeMedian(arr: number[]): number {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : s[mid]
}

export default async function OgImage({ params }: { params: Promise<{ ville: string }> }) {
  const { ville } = await params
  const city = cityFromSlug(ville)
  const displayCity = city ? normalizeCityName(city) : ville

  // Stats rapides (même requête que la page)
  let total = 0
  let prixMedian = 0
  if (city) {
    const { data } = await supabase
      .from("annonces")
      .select("prix")
      .ilike("ville", city)
      .eq("statut", "disponible")
      .limit(200)
    const prix = (data || []).map(a => Number(a.prix)).filter(n => !isNaN(n) && n > 0)
    total = prix.length
    prixMedian = computeMedian(prix)
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 80px",
          background: "linear-gradient(135deg, #FF8A1E 0%, #FF4A1C 55%, #E8271C 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="64" height="64" viewBox="0 0 400 400">
            <path d="M 105 325 L 200 95" stroke="#ffffff" strokeWidth={54} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="M 200 95 L 295 325" stroke="#ffffff" strokeWidth={54} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <g fill="#ffffff">
              <rect x={178} y={228} width={20} height={20} rx={4} />
              <rect x={202} y={228} width={20} height={20} rx={4} />
              <rect x={178} y={252} width={20} height={20} rx={4} />
              <rect x={202} y={252} width={20} height={20} rx={4} />
            </g>
          </svg>
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>NestMatch</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 36, fontWeight: 600, opacity: 0.95 }}>
            Location à
          </div>
          <div
            style={{
              fontSize: 110,
              fontWeight: 900,
              lineHeight: 0.95,
              letterSpacing: -4,
              display: "flex",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {displayCity}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 32 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 28, fontWeight: 500 }}>
            <div>{total > 0 ? `${total} annonces disponibles` : "Nouvelles annonces chaque jour"}</div>
            <div style={{ fontSize: 22, opacity: 0.85 }}>Sans frais d&apos;agence · directement avec le proprio</div>
          </div>
          {prixMedian > 0 && (
            <div
              style={{
                fontSize: 48,
                fontWeight: 800,
                background: "rgba(255,255,255,0.12)",
                padding: "14px 28px",
                borderRadius: 20,
                border: "2px solid rgba(255,255,255,0.3)",
                whiteSpace: "nowrap",
              }}
            >
              {prixMedian} €
              <span style={{ fontSize: 22, fontWeight: 500, opacity: 0.9 }}> /mois médian</span>
            </div>
          )}
        </div>
      </div>
    ),
    { ...size },
  )
}
