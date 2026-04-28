"use client"

// V9.4 (Paul 2026-04-28) — compteur public de candidatures sur la fiche
// annonce. Indique au candidat combien de personnes ont deja postule —
// pression sociale + signal de demande. Color coding selon densite.

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { supabase } from "../../../lib/supabase"

interface Props {
  annonceId: number
  annonceCreatedAt?: string | null
  proprietaireEmail?: string | null
}

function formatAnciennete(createdAt: string): string {
  try {
    const ms = Date.now() - new Date(createdAt).getTime()
    const days = Math.floor(ms / (24 * 3600 * 1000))
    if (days < 1) return "publiée aujourd'hui"
    if (days === 1) return "publiée hier"
    if (days < 7) return `active depuis ${days} jours`
    const weeks = Math.floor(days / 7)
    if (weeks === 1) return "active depuis 1 semaine"
    if (weeks < 5) return `active depuis ${weeks} semaines`
    const months = Math.floor(days / 30)
    return `active depuis ${months} mois`
  } catch {
    return ""
  }
}

export default function CandidaturesCounter({ annonceId, annonceCreatedAt, proprietaireEmail }: Props) {
  const { data: session } = useSession()
  const [count, setCount] = useState<number | null>(null)

  // Owner-side : on cache le compteur, le proprio a deja l'info dans
  // /proprietaire/annonces/[id]/candidatures.
  const isOwner = !!session?.user?.email && !!proprietaireEmail
    && session.user.email.toLowerCase() === proprietaireEmail.toLowerCase()

  useEffect(() => {
    if (isOwner) return
    let cancelled = false
    void supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("annonce_id", annonceId)
      .eq("type", "candidature")
      .then(({ count }) => {
        if (cancelled) return
        setCount(typeof count === "number" ? count : 0)
      })
    return () => { cancelled = true }
  }, [annonceId, isOwner])

  if (isOwner) return null
  if (count === null) return null  // pas de flicker pendant le fetch

  // Color coding selon densite
  const tone =
    count >= 10 ? { bg: "#FEECEC", color: "#b91c1c", border: "#F4C9C9", emoji: "🔥", note: "forte demande" } :
    count >= 3 ? { bg: "#FBF6EA", color: "#a16207", border: "#EADFC6", emoji: "👥", note: "annonce active" } :
    { bg: "#F7F4EF", color: "#6b6559", border: "#EAE6DF", emoji: "👤", note: null as string | null }

  const ancien = annonceCreatedAt ? formatAnciennete(annonceCreatedAt) : null

  return (
    <div style={{
      background: tone.bg,
      border: `1px solid ${tone.border}`,
      borderRadius: 14,
      padding: "10px 14px",
      marginBottom: 16,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      flexWrap: "wrap",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 16 }} aria-hidden="true">{tone.emoji}</span>
        <span style={{ fontSize: 13, color: tone.color, fontWeight: 600 }}>
          {count === 0
            ? "Aucune candidature pour le moment"
            : `${count} ${count > 1 ? "personnes ont déjà candidaté" : "personne a déjà candidaté"}`}
          {tone.note && <span style={{ fontWeight: 400, opacity: 0.85 }}> · {tone.note}</span>}
        </span>
      </div>
      {ancien && (
        <span style={{ fontSize: 11, color: tone.color, opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>
          {ancien}
        </span>
      )}
    </div>
  )
}
