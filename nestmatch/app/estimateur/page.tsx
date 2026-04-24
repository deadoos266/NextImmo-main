"use client"
import { useState } from "react"
import Link from "next/link"
import { useResponsive } from "../hooks/useResponsive"

/**
 * Estimateur de budget locataire.
 * Règle usuelle : loyer ≤ 33% des revenus nets. La plupart des proprios
 * attendent des revenus ≥ 3× le loyer charges comprises.
 */
export default function Estimateur() {
  const { isMobile } = useResponsive()
  const [revenus, setRevenus] = useState("")
  const [revenusGarant, setRevenusGarant] = useState("")
  const [avecGarant, setAvecGarant] = useState(false)

  const rev = Number(revenus) || 0
  const revGarant = avecGarant ? (Number(revenusGarant) || 0) : 0
  const loyerIdeal = Math.round(rev / 3)
  const loyerMax = Math.round(rev / 2.8)
  // Avec garant (règle informelle : revenus locataire + garant / 3)
  const loyerAvecGarant = avecGarant ? Math.round((rev + revGarant * 0.7) / 3) : 0

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: isMobile ? "24px 16px" : "40px" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <Link href="/" style={{ fontSize: 13, color: "#8a8477", textDecoration: "none" }}>← Retour à l&apos;accueil</Link>

        <div style={{ marginTop: 16, marginBottom: 28 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.5px" }}>Estimateur de budget location</h1>
          <p style={{ fontSize: 14, color: "#8a8477", marginTop: 6, lineHeight: 1.6 }}>
            Calculez en un instant le loyer maximum qu&apos;un propriétaire est susceptible d&apos;accepter selon vos revenus.
            La règle courante : les revenus nets doivent représenter environ <strong>3 fois le loyer charges comprises</strong>.
          </p>
        </div>

        <div style={{ background: "white", borderRadius: 20, padding: isMobile ? 24 : 32, marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 6 }}>
            Revenus mensuels nets (€)
          </label>
          <input
            type="number"
            value={revenus}
            onChange={e => setRevenus(e.target.value)}
            placeholder="2500"
            style={{ width: "100%", padding: "14px 18px", border: "1px solid #EAE6DF", borderRadius: 12, fontSize: 18, fontWeight: 700, outline: "none", boxSizing: "border-box", fontFamily: "inherit", marginBottom: 20 }}
          />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: avecGarant ? 12 : 0 }}>
            <label style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>J&apos;ai un garant</label>
            <button onClick={() => setAvecGarant(!avecGarant)}
              style={{ width: 44, height: 24, borderRadius: 999, background: avecGarant ? "#111" : "#EAE6DF", cursor: "pointer", position: "relative", transition: "background 0.2s", border: "none", padding: 0 }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: "white", position: "absolute", top: 3, left: avecGarant ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
            </button>
          </div>

          {avecGarant && (
            <>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 6 }}>
                Revenus nets du garant (€)
              </label>
              <input
                type="number"
                value={revenusGarant}
                onChange={e => setRevenusGarant(e.target.value)}
                placeholder="3500"
                style={{ width: "100%", padding: "14px 18px", border: "1px solid #EAE6DF", borderRadius: 12, fontSize: 18, fontWeight: 700, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
              />
            </>
          )}
        </div>

        {rev > 0 && (
          <div style={{ background: "white", borderRadius: 20, padding: isMobile ? 24 : 32, marginBottom: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 18 }}>Votre estimation</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ background: "#F0FAEE", borderRadius: 14, padding: "18px 20px", border: "1px solid #C6E9C0" }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Loyer idéal</p>
                <p style={{ fontSize: 32, fontWeight: 800, color: "#15803d", letterSpacing: "-0.5px" }}>
                  {loyerIdeal.toLocaleString("fr-FR")} €/mois
                </p>
                <p style={{ fontSize: 13, color: "#15803d", lineHeight: 1.5, marginTop: 4 }}>
                  Revenus / 3 · le plus confortable, accepté par tous les propriétaires sérieux.
                </p>
              </div>

              <div style={{ background: "#FBF6EA", borderRadius: 14, padding: "18px 20px", border: "1px solid #EADFC6" }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#a16207", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Loyer maximum raisonnable</p>
                <p style={{ fontSize: 26, fontWeight: 800, color: "#a16207", letterSpacing: "-0.5px" }}>
                  {loyerMax.toLocaleString("fr-FR")} €/mois
                </p>
                <p style={{ fontSize: 13, color: "#a16207", lineHeight: 1.5, marginTop: 4 }}>
                  Revenus / 2,8 · limite haute. Acceptable avec un bon dossier (CDI, garant).
                </p>
              </div>

              {avecGarant && revGarant > 0 && (
                <div style={{ background: "#EEF3FB", borderRadius: 14, padding: "18px 20px", border: "1px solid #D7E3F4" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Avec votre garant</p>
                  <p style={{ fontSize: 26, fontWeight: 800, color: "#1d4ed8", letterSpacing: "-0.5px" }}>
                    {loyerAvecGarant.toLocaleString("fr-FR")} €/mois
                  </p>
                  <p style={{ fontSize: 13, color: "#1d4ed8", lineHeight: 1.5, marginTop: 4 }}>
                    Vos revenus + 70 % de ceux du garant / 3. Le garant élargit votre champ.
                  </p>
                </div>
              )}
            </div>

            <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid #F7F4EF" }}>
              <p style={{ fontSize: 13, color: "#8a8477", lineHeight: 1.6, marginBottom: 12 }}>
                Prêt(e) à chercher un logement dans votre budget ?
              </p>
              <Link
                href={`/annonces?budget_max=${Math.max(loyerMax, loyerAvecGarant)}`}
                style={{ background: "#111", color: "white", padding: "12px 28px", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 14, display: "inline-block" }}
              >
                Voir les annonces compatibles &rarr;
              </Link>
            </div>
          </div>
        )}

        <div style={{ fontSize: 12, color: "#8a8477", lineHeight: 1.6, textAlign: "center", padding: "0 12px" }}>
          Les ratios affichés sont indicatifs. Chaque propriétaire est libre d&apos;appliquer ses propres critères.
        </div>
      </div>
    </main>
  )
}
