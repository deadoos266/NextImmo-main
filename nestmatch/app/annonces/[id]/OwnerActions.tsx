"use client"
import { useSession } from "next-auth/react"
import Link from "next/link"

export default function OwnerActions({
  proprietaireEmail,
  annonceId,
}: {
  proprietaireEmail: string
  annonceId: number
}) {
  const { data: session } = useSession()

  if (!session?.user?.email || session.user.email !== proprietaireEmail) {
    return null
  }

  const btnStyle = {
    display: "inline-flex",
    alignItems: "center",
    padding: "10px 18px",
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 13,
    textDecoration: "none",
    fontFamily: "'DM Sans', sans-serif",
    cursor: "pointer",
  } as const

  return (
    <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" as const }}>
      <Link
        href={`/proprietaire/modifier/${annonceId}`}
        style={{
          ...btnStyle,
          background: "#111",
          color: "white",
          border: "none",
        }}
      >
        Modifier l'annonce
      </Link>
      <Link
        href={`/proprietaire/stats?id=${annonceId}`}
        style={{
          ...btnStyle,
          background: "#eff6ff",
          color: "#1d4ed8",
          border: "1.5px solid #bfdbfe",
        }}
      >
        Statistiques
      </Link>
    </div>
  )
}
