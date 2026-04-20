import { ImageResponse } from "next/og"
import { supabase } from "../../../lib/supabase"

/**
 * OG image dynamique par annonce (1200×630).
 *
 * Partagée sur WhatsApp/Messenger/Twitter/LinkedIn, elle remplace la
 * `/public/og-default.png` statique. On met l'essentiel de l'annonce :
 * titre, ville, prix + branding KeyMatch (fond dégradé chaleureux).
 *
 * Next.js appelle automatiquement cette fonction pour générer l'image au
 * build/runtime et l'exposer via `<meta property="og:image">`.
 */

export const alt = "Annonce KeyMatch"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

// runtime Edge n'a pas accès aux fonts custom simplement ; on reste sur
// du system font rendu via satori (moteur derrière ImageResponse).
export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: annonce } = await supabase
    .from("annonces")
    .select("titre, ville, prix, surface, pieces")
    .eq("id", id)
    .maybeSingle()

  const titre = annonce?.titre || "Logement à louer"
  const ville = annonce?.ville || ""
  const prix = annonce?.prix ? `${annonce.prix} €` : ""
  const surface = annonce?.surface ? `${annonce.surface} m²` : ""
  const pieces = annonce?.pieces ? `${annonce.pieces} ${annonce.pieces > 1 ? "pièces" : "pièce"}` : ""
  const details = [surface, pieces].filter(Boolean).join(" · ")

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
        {/* Header : logo A + KeyMatch */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Logo A simplifié (stroke path) */}
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
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>KeyMatch</div>
        </div>

        {/* Titre + infos principales */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: -2,
              maxWidth: "90%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical" as const,
            }}
          >
            {titre}
          </div>
          {ville && (
            <div style={{ fontSize: 42, fontWeight: 600, opacity: 0.95 }}>
              {ville}
            </div>
          )}
        </div>

        {/* Pied : prix + caractéristiques */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 32 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontSize: 32,
              fontWeight: 500,
              opacity: 0.95,
            }}
          >
            {details && <div>{details}</div>}
            <div style={{ fontSize: 24, opacity: 0.85 }}>
              Location entre particuliers · sans frais d&apos;agence
            </div>
          </div>
          {prix && (
            <div
              style={{
                fontSize: 64,
                fontWeight: 800,
                background: "rgba(255,255,255,0.12)",
                padding: "14px 28px",
                borderRadius: 20,
                border: "2px solid rgba(255,255,255,0.3)",
                whiteSpace: "nowrap",
              }}
            >
              {prix}
              <span style={{ fontSize: 28, fontWeight: 500, opacity: 0.9 }}> /mois</span>
            </div>
          )}
        </div>
      </div>
    ),
    { ...size },
  )
}
