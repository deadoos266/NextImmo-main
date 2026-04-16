"use client"
import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { getFavoris, toggleFavori } from "../../lib/favoris"
import Link from "next/link"

const GRADIENTS = [
  "linear-gradient(135deg, #e8e0f0, #d4c5e8)",
  "linear-gradient(135deg, #d4e8e0, #b8d4c8)",
  "linear-gradient(135deg, #e8d4c5, #d4b89a)",
  "linear-gradient(135deg, #c5d4e8, #a0b8d4)",
  "linear-gradient(135deg, #e8e8c5, #d4d4a0)",
  "linear-gradient(135deg, #e8c5d4, #d4a0b8)",
]

export default function Favoris() {
  const [annonces, setAnnonces] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [favoris, setFavoris] = useState<number[]>([])

  useEffect(() => {
    const ids = getFavoris()
    setFavoris(ids)
    if (ids.length === 0) {
      setLoading(false)
      return
    }
    supabase.from("annonces").select("*").in("id", ids).then(({ data }) => {
      if (data) setAnnonces(data)
      setLoading(false)
    })
  }, [])

  function handleRetirer(e: React.MouseEvent, id: number) {
    e.preventDefault()
    toggleFavori(id)
    const newFavoris = getFavoris()
    setFavoris(newFavoris)
    setAnnonces(prev => prev.filter(a => a.id !== id))
  }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: "40px 48px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px" }}>Mes favoris</h1>
          <p style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>
            {favoris.length === 0 ? "Aucun favori pour l'instant" : `${favoris.length} logement${favoris.length > 1 ? "s" : ""} sauvegardé${favoris.length > 1 ? "s" : ""}`}
          </p>
        </div>

        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ background: "white", borderRadius: 20, height: 280, opacity: 0.4 }} />
            ))}
          </div>
        ) : annonces.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🤍</div>
            <p style={{ fontSize: 16, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Aucun favori</p>
            <p style={{ fontSize: 14, color: "#9ca3af", marginBottom: 24 }}>Clique sur le cœur d'une annonce pour la sauvegarder ici.</p>
            <Link href="/annonces" style={{ background: "#111", color: "white", padding: "12px 28px", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 14 }}>
              Voir les annonces
            </Link>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
            {annonces.map(a => {
              const photo = Array.isArray(a.photos) && a.photos.length > 0 ? a.photos[0] : null
              const gradient = GRADIENTS[a.id % GRADIENTS.length]
              return (
                <Link key={a.id} href={`/annonces/${a.id}`} style={{ textDecoration: "none", color: "#111", display: "block", background: "white", borderRadius: 20, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", transition: "box-shadow 0.2s, transform 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 24px rgba(0,0,0,0.10)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)" }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)"; (e.currentTarget as HTMLElement).style.transform = "none" }}>

                  {/* Photo */}
                  <div style={{ position: "relative", height: 180, background: photo ? "#000" : gradient, overflow: "hidden" }}>
                    {photo
                      ? <img src={photo} alt={a.titre} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(0,0,0,0.25)", fontSize: 12 }}>Pas de photo</span>
                    }
                    <span style={{ position: "absolute", top: 10, left: 10, background: a.dispo === "Disponible maintenant" ? "#16a34a" : "#ea580c", color: "white", padding: "3px 9px", borderRadius: 999, fontSize: 10, fontWeight: 700 }}>
                      {a.dispo}
                    </span>
                    {/* Bouton retirer */}
                    <button
                      onClick={e => handleRetirer(e, a.id)}
                      title="Retirer des favoris"
                      style={{ position: "absolute", top: 10, right: 10, background: "white", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.15)", fontSize: 16 }}>
                      ❤️
                    </button>
                  </div>

                  {/* Infos */}
                  <div style={{ padding: "14px 16px 16px" }}>
                    <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 3, lineHeight: 1.3 }}>{a.titre}</p>
                    <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 10 }}>{a.ville}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", gap: 10, fontSize: 12, color: "#6b7280" }}>
                        <span>{a.surface} m²</span>
                        <span style={{ color: "#d1d5db" }}>·</span>
                        <span>{a.pieces} p.</span>
                        {a.meuble && <><span style={{ color: "#d1d5db" }}>·</span><span>Meublé</span></>}
                      </div>
                      <span style={{ fontSize: 17, fontWeight: 800 }}>
                        {a.prix} €<span style={{ fontSize: 11, fontWeight: 400, color: "#9ca3af" }}>/mois</span>
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
