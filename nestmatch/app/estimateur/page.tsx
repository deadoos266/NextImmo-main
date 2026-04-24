"use client"
import { useState } from "react"
import Link from "next/link"
import { useResponsive } from "../hooks/useResponsive"
import { km, KMCard, KMEyebrow, KMHeading } from "../components/ui/km"

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

  const lblSmall: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: km.muted,
    textTransform: "uppercase", letterSpacing: "1.4px",
    display: "block", marginBottom: 8,
  }

  const inp: React.CSSProperties = {
    width: "100%", padding: "14px 18px",
    border: `1px solid ${km.line}`,
    borderRadius: 12, fontSize: 18, fontWeight: 700,
    outline: "none", boxSizing: "border-box",
    fontFamily: "inherit",
    background: km.white, color: km.ink,
  }

  return (
    <main style={{
      minHeight: "100vh",
      background: km.beige,
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      padding: isMobile ? "24px 16px" : "40px",
    }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <Link href="/" style={{
          fontSize: 10, color: km.muted, textDecoration: "none",
          textTransform: "uppercase", letterSpacing: "1.4px", fontWeight: 700,
        }}>← Retour à l&apos;accueil</Link>

        <div style={{ marginTop: 22, marginBottom: 28 }}>
          <KMEyebrow style={{ marginBottom: 10 }}>Budget · Estimateur</KMEyebrow>
          <KMHeading as="h1" size={36} style={{ marginBottom: 10 }}>Estimateur de budget location</KMHeading>
          <p style={{ fontSize: 14, color: "#3f3c37", lineHeight: 1.7 }}>
            Calculez en un instant le loyer maximum qu&apos;un propriétaire est susceptible d&apos;accepter selon vos revenus.
            La règle courante : les revenus nets doivent représenter environ <strong style={{ color: km.ink, fontWeight: 700 }}>3 fois le loyer charges comprises</strong>.
          </p>
        </div>

        <KMCard padding={isMobile ? 24 : 32} style={{ marginBottom: 20 }}>
          <label style={lblSmall}>Revenus mensuels nets (€)</label>
          <input
            type="number"
            value={revenus}
            onChange={e => setRevenus(e.target.value)}
            placeholder="2500"
            style={{ ...inp, marginBottom: 20 }}
          />

          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: avecGarant ? 14 : 0,
          }}>
            <label style={{ fontSize: 14, fontWeight: 500, color: km.ink }}>J&apos;ai un garant</label>
            <button
              type="button"
              onClick={() => setAvecGarant(!avecGarant)}
              role="switch"
              aria-checked={avecGarant}
              style={{
                width: 44, height: 24, borderRadius: 999,
                background: avecGarant ? km.ink : km.line,
                cursor: "pointer", position: "relative",
                transition: "background 0.2s",
                border: "none", padding: 0,
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: "50%",
                background: km.white,
                position: "absolute", top: 3, left: avecGarant ? 23 : 3,
                transition: "left 0.2s",
                boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
              }} />
            </button>
          </div>

          {avecGarant && (
            <>
              <label style={lblSmall}>Revenus nets du garant (€)</label>
              <input
                type="number"
                value={revenusGarant}
                onChange={e => setRevenusGarant(e.target.value)}
                placeholder="3500"
                style={inp}
              />
            </>
          )}
        </KMCard>

        {rev > 0 && (
          <KMCard padding={isMobile ? 24 : 32} style={{ marginBottom: 20 }}>
            <KMHeading as="h2" size={22} style={{ marginBottom: 18 }}>Votre estimation</KMHeading>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{
                background: km.successBg, borderRadius: 14,
                padding: "18px 20px",
                border: `1px solid ${km.successLine}`,
              }}>
                <p style={{
                  fontSize: 10, fontWeight: 700, color: km.successText,
                  textTransform: "uppercase", letterSpacing: "1.4px", marginBottom: 4,
                }}>Loyer idéal</p>
                <p style={{
                  fontSize: 34, fontWeight: 500, color: km.successText,
                  letterSpacing: "-0.5px",
                  fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif",
                  fontStyle: "italic",
                  margin: 0,
                }}>
                  {loyerIdeal.toLocaleString("fr-FR")} €/mois
                </p>
                <p style={{ fontSize: 13, color: km.successText, lineHeight: 1.5, marginTop: 6 }}>
                  Revenus / 3 · le plus confortable, accepté par tous les propriétaires sérieux.
                </p>
              </div>

              <div style={{
                background: km.warnBg, borderRadius: 14,
                padding: "18px 20px",
                border: `1px solid ${km.warnLine}`,
              }}>
                <p style={{
                  fontSize: 10, fontWeight: 700, color: km.warnText,
                  textTransform: "uppercase", letterSpacing: "1.4px", marginBottom: 4,
                }}>Loyer maximum raisonnable</p>
                <p style={{
                  fontSize: 28, fontWeight: 500, color: km.warnText,
                  letterSpacing: "-0.5px",
                  fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif",
                  fontStyle: "italic",
                  margin: 0,
                }}>
                  {loyerMax.toLocaleString("fr-FR")} €/mois
                </p>
                <p style={{ fontSize: 13, color: km.warnText, lineHeight: 1.5, marginTop: 6 }}>
                  Revenus / 2,8 · limite haute. Acceptable avec un bon dossier (CDI, garant).
                </p>
              </div>

              {avecGarant && revGarant > 0 && (
                <div style={{
                  background: km.infoBg, borderRadius: 14,
                  padding: "18px 20px",
                  border: `1px solid ${km.infoLine}`,
                }}>
                  <p style={{
                    fontSize: 10, fontWeight: 700, color: km.infoText,
                    textTransform: "uppercase", letterSpacing: "1.4px", marginBottom: 4,
                  }}>Avec votre garant</p>
                  <p style={{
                    fontSize: 28, fontWeight: 500, color: km.infoText,
                    letterSpacing: "-0.5px",
                    fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif",
                    fontStyle: "italic",
                    margin: 0,
                  }}>
                    {loyerAvecGarant.toLocaleString("fr-FR")} €/mois
                  </p>
                  <p style={{ fontSize: 13, color: km.infoText, lineHeight: 1.5, marginTop: 6 }}>
                    Vos revenus + 70 % de ceux du garant / 3. Le garant élargit votre champ.
                  </p>
                </div>
              )}
            </div>

            <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${km.line}` }}>
              <p style={{ fontSize: 13, color: km.muted, lineHeight: 1.6, marginBottom: 14 }}>
                Prêt(e) à chercher un logement dans votre budget ?
              </p>
              <Link
                href={`/annonces?budget_max=${Math.max(loyerMax, loyerAvecGarant)}`}
                style={{
                  display: "inline-block",
                  background: km.ink, color: km.white,
                  border: "none", borderRadius: 999,
                  padding: "16px 36px",
                  fontWeight: 700, fontSize: 13,
                  textTransform: "uppercase", letterSpacing: "0.6px",
                  textDecoration: "none",
                }}
              >
                Voir les annonces compatibles →
              </Link>
            </div>
          </KMCard>
        )}

        <div style={{ fontSize: 12, color: km.muted, lineHeight: 1.6, textAlign: "center", padding: "0 12px" }}>
          Les ratios affichés sont indicatifs. Chaque propriétaire est libre d&apos;appliquer ses propres critères.
        </div>
      </div>
    </main>
  )
}
