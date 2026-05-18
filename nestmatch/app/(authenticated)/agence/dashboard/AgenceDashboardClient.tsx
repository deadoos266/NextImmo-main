"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

interface MyAgence {
  id: string
  slug: string
  name: string
  statut: string
  role: string
  logo_url: string | null
  ville: string | null
}

export default function AgenceDashboardClient() {
  const [agences, setAgences] = useState<MyAgence[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/agences/mine", { cache: "no-store" })
        const j = await r.json()
        if (!j.ok) setError(j.error || "Erreur inconnue")
        else setAgences(j.agences || [])
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur réseau")
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) {
    return <div style={{ maxWidth: 1000, margin: "60px auto", padding: 32, textAlign: "center", color: "#666" }}>Chargement…</div>
  }

  if (error) {
    return (
      <div style={{ maxWidth: 600, margin: "60px auto", padding: 32, background: "#FEE", border: "1px solid #FCC", borderRadius: 12, color: "#900" }}>
        {error}
      </div>
    )
  }

  if (agences.length === 0) {
    return (
      <div style={{ maxWidth: 600, margin: "60px auto", padding: 32, textAlign: "center" }}>
        <h1 style={{
          fontFamily: "var(--font-fraunces), serif", fontStyle: "italic",
          fontWeight: 400, fontSize: 30, color: "#111", marginBottom: 16,
        }}>
          Aucune agence
        </h1>
        <p style={{ fontSize: 14, color: "#444", marginBottom: 24 }}>
          Vous n&apos;êtes membre d&apos;aucune agence pour le moment. Vous pouvez inscrire
          votre propre agence pour gérer plusieurs biens en équipe.
        </p>
        <Link
          href="/agence/inscription"
          style={{
            display: "inline-block", padding: "12px 24px", background: "#111",
            color: "white", borderRadius: 12, textDecoration: "none", fontSize: 14, fontWeight: 500,
          }}
        >
          Inscrire mon agence →
        </Link>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1100, margin: "40px auto", padding: "0 20px 80px" }}>
      <h1 style={{
        fontFamily: "var(--font-fraunces), 'Fraunces', serif",
        fontStyle: "italic", fontWeight: 400, fontSize: 36, color: "#111",
        margin: "0 0 8px",
      }}>
        Mes agences
      </h1>
      <p style={{ fontSize: 14, color: "#444", marginTop: 0, marginBottom: 24 }}>
        Sélectionnez une agence pour accéder à ses annonces, candidatures, paramètres et équipe.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {agences.map(a => (
          <article key={a.id} style={{
            background: "white", border: "1px solid #EAE6DF", borderRadius: 16,
            padding: 20, display: "flex", flexDirection: "column", gap: 12,
          }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {a.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.logo_url} alt={a.name} style={{ width: 48, height: 48, borderRadius: 10, objectFit: "contain", background: "#F7F4EF" }} />
              ) : (
                <div style={{ width: 48, height: 48, borderRadius: 10, background: "#111", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 600 }}>
                  {a.name.charAt(0)}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: "#111", marginBottom: 2 }}>
                  {a.name}
                </div>
                <div style={{ fontSize: 12, color: "#888" }}>
                  {a.ville || ""} · role: {a.role}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{
                padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 500,
                background: a.statut === "active" ? "#dcfce7" : a.statut === "pending" ? "#FFF7E0" : "#FEE",
                color: a.statut === "active" ? "#166534" : a.statut === "pending" ? "#7a5a00" : "#900",
              }}>
                {a.statut === "active" ? "✓ Active" : a.statut === "pending" ? "En attente" : a.statut === "refused" ? "Refusée" : "Bannie"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: "auto" }}>
              {a.statut === "active" && (
                <Link href={`/agence/${a.slug}`} style={btnPrimary}>Page publique</Link>
              )}
              <Link href={`/agence/dashboard/${a.id}`} style={btnSec}>Gérer →</Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

const btnPrimary: React.CSSProperties = {
  padding: "8px 14px", background: "#111", color: "white", borderRadius: 10,
  fontSize: 13, textDecoration: "none", fontWeight: 500,
}

const btnSec: React.CSSProperties = {
  padding: "8px 14px", border: "1px solid #EAE6DF", background: "white",
  color: "#111", borderRadius: 10, fontSize: 13, textDecoration: "none",
}
