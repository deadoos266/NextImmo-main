"use client"
import { useEffect, useState } from "react"

/**
 * V97.35 P3-3 — Bloc d'affichage des reviews reçues par un user (= target).
 *
 * Fetch /api/reviews/[email] (public, anonymisé). Affiche moyenne + liste
 * paginée des reviews avec étoiles + commentaire + rôle de l'auteur.
 *
 * Utilisé sur les pages profil public + sur la card "Mon proprio" /
 * "Mon locataire" côté espace authentifié.
 */

interface Review {
  id: number
  role: "locataire" | "proprietaire"
  score_global: number
  score_details: Record<string, number>
  comment: string | null
  author_email_masked: string
  published_at: string
}

interface ApiResponse {
  ok: boolean
  target_email: string
  total: number
  average_global: number | null
  by_role?: { locataire: number; proprietaire: number }
  reviews: Review[]
}

interface Props {
  target_email: string
  /** Affichage compact (carte profil) vs étendu (page reviews dédiée). */
  compact?: boolean
}

function Stars({ score, size = 14 }: { score: number; size?: number }) {
  return (
    <span aria-label={`${score} sur 5`} style={{ fontSize: size, letterSpacing: "1px", color: "#fbbf24" }}>
      {"★".repeat(score)}<span style={{ color: "#d4d4d4" }}>{"★".repeat(5 - score)}</span>
    </span>
  )
}

function formatDateFr(iso: string): string {
  try { return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) }
  catch { return iso }
}

export default function ReviewsBlock({ target_email, compact = false }: Props) {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const r = await fetch(`/api/reviews/${encodeURIComponent(target_email)}`)
        const j: ApiResponse = await r.json()
        if (!cancelled) { setData(j); setLoading(false) }
      } catch {
        if (!cancelled) { setData(null); setLoading(false) }
      }
    }
    load()
    return () => { cancelled = true }
  }, [target_email])

  if (loading) {
    return (
      <div style={{ background: "#F7F4EF", borderRadius: 14, padding: "16px 18px" }}>
        <p style={{ fontSize: 12, color: "#8a8477", margin: 0 }}>Chargement des avis…</p>
      </div>
    )
  }

  if (!data || !data.ok || data.total === 0) {
    return (
      <div style={{ background: "#F7F4EF", borderRadius: 14, padding: "16px 18px", border: "1px dashed #EAE6DF" }}>
        <p style={{ fontSize: 13, color: "#8a8477", margin: 0, lineHeight: 1.5 }}>
          Aucun avis publié pour le moment.
        </p>
      </div>
    )
  }

  const reviews = showAll ? data.reviews : data.reviews.slice(0, compact ? 2 : 5)

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #EAE6DF", padding: compact ? "14px 16px" : "20px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 12, borderBottom: "1px solid #F0EAE0" }}>
        <Stars score={Math.round(data.average_global || 0)} size={compact ? 16 : 22} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: compact ? 13 : 15, fontWeight: 700, color: "#111", margin: 0 }}>
            {data.average_global?.toFixed(1)}/5
            <span style={{ fontWeight: 500, color: "#8a8477", marginLeft: 8 }}>
              · {data.total} avis
            </span>
          </p>
          {data.by_role && (
            <p style={{ fontSize: 11, color: "#8a8477", margin: "2px 0 0" }}>
              {data.by_role.locataire > 0 && `${data.by_role.locataire} de locataire(s)`}
              {data.by_role.locataire > 0 && data.by_role.proprietaire > 0 && " · "}
              {data.by_role.proprietaire > 0 && `${data.by_role.proprietaire} de propriétaire(s)`}
            </p>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
        {reviews.map(r => (
          <div key={r.id} style={{ paddingBottom: 12, borderBottom: "1px solid #F8F5F0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <Stars score={r.score_global} size={13} />
              <span style={{ fontSize: 10, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 700 }}>
                {r.role === "locataire" ? "Avis locataire" : "Avis propriétaire"}
              </span>
            </div>
            {r.comment && (
              <p style={{ fontSize: 13, color: "#111", margin: "0 0 6px", lineHeight: 1.55 }}>
                « {r.comment} »
              </p>
            )}
            <p style={{ fontSize: 11, color: "#8a8477", margin: 0 }}>
              {r.author_email_masked} · {formatDateFr(r.published_at)}
            </p>
          </div>
        ))}
      </div>

      {data.reviews.length > reviews.length && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          style={{
            marginTop: 12, background: "transparent", border: "none",
            color: "#1d4ed8", fontSize: 12, fontWeight: 700,
            cursor: "pointer", padding: 0, fontFamily: "inherit",
            textTransform: "uppercase", letterSpacing: "0.5px",
          }}
        >
          Voir tous les avis ({data.total})
        </button>
      )}
    </div>
  )
}
