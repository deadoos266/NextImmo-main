"use client"
import { useEffect, useState } from "react"
import { isFavori, toggleFavori } from "../../../lib/favoris"

export default function FavoriButton({ id }: { id: number }) {
  const [actif, setActif] = useState(false)

  useEffect(() => {
    setActif(isFavori(id))
  }, [id])

  function handleClick() {
    toggleFavori(id)
    setActif(isFavori(id))
  }

  return (
    <button
      onClick={handleClick}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 20px", border: `2px solid ${actif ? "#ef4444" : "#e5e7eb"}`,
        borderRadius: 999, background: actif ? "#fff1f2" : "white",
        cursor: "pointer", fontWeight: 700, fontSize: 14,
        fontFamily: "'DM Sans', sans-serif",
        color: actif ? "#ef4444" : "#6b7280",
        transition: "all 0.2s",
      }}
      onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.04)")}
      onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
    >
      <span style={{ fontSize: 18 }}>{actif ? "❤️" : "🤍"}</span>
      {actif ? "Sauvegardé" : "Sauvegarder"}
    </button>
  )
}
