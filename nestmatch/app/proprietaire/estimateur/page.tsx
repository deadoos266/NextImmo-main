"use client"
import { useState } from "react"
import Link from "next/link"
import { useResponsive } from "../../hooks/useResponsive"
import { km, KMCard, KMEyebrow, KMHeading, KMButton } from "../../components/ui/km"
import CityAutocomplete from "../../components/CityAutocomplete"
import MarketRentHint from "../ajouter/MarketRentHint"

/**
 * Estimateur de loyer marché — version standalone côté proprio.
 *
 * Réutilise le composant MarketRentHint qui calcule médiane + min/max
 * sur les annonces similaires en DB (même ville, surface ±20%, mêmes
 * pièces). Utile en avant-vente, avant de publier une annonce, pour
 * caler le prix attendu.
 *
 * Différent de /estimateur (côté locataire = budget max selon revenus).
 * Lien depuis le dropdown Mon espace proprio (à ajouter ultérieurement)
 * ou depuis le menu de la Navbar.
 */
export default function EstimateurProprio() {
  const { isMobile } = useResponsive()
  const [ville, setVille] = useState("")
  const [surface, setSurface] = useState("")
  const [pieces, setPieces] = useState("")

  const inp: React.CSSProperties = {
    width: "100%",
    padding: "12px 16px",
    border: `1px solid ${km.line}`,
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 500,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
    background: km.white,
    color: km.ink,
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    color: km.muted,
    textTransform: "uppercase",
    letterSpacing: "1.4px",
    display: "block",
    marginBottom: 8,
  }

  return (
    <main style={{
      minHeight: "100vh",
      background: km.beige,
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      padding: isMobile ? "24px 16px" : "40px",
    }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <Link href="/proprietaire" style={{
          fontSize: 10, color: km.muted, textDecoration: "none",
          textTransform: "uppercase", letterSpacing: "1.4px", fontWeight: 700,
        }}>← Tableau de bord</Link>

        <div style={{ marginTop: 22, marginBottom: 28 }}>
          <KMEyebrow style={{ marginBottom: 10 }}>Outil propriétaire</KMEyebrow>
          <KMHeading as="h1" size={isMobile ? 32 : 40} style={{ marginBottom: 12 }}>
            Estimer un loyer de marché
          </KMHeading>
          <p style={{ fontSize: 14, color: "#3f3c37", lineHeight: 1.7, margin: 0 }}>
            Avant de publier votre annonce ou pour réviser un loyer existant, situez votre bien par rapport au marché.
            L&apos;estimation s&apos;appuie sur les annonces similaires actuellement publiées sur KeyMatch dans la même ville,
            avec une surface comparable.
          </p>
        </div>

        <KMCard padding={isMobile ? 24 : 32} style={{ marginBottom: 20 }}>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Ville</label>
            <CityAutocomplete value={ville} onChange={setVille} placeholder="Commencez à taper…" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            <div>
              <label style={labelStyle}>Surface (m²)</label>
              <input
                type="number"
                value={surface}
                onChange={e => setSurface(e.target.value)}
                placeholder="40"
                min={0}
                max={1000}
                style={inp}
              />
            </div>
            <div>
              <label style={labelStyle}>Nombre de pièces</label>
              <input
                type="number"
                value={pieces}
                onChange={e => setPieces(e.target.value)}
                placeholder="2"
                min={0}
                max={20}
                style={inp}
              />
            </div>
          </div>
        </KMCard>

        {/* MarketRentHint affiche son résultat dès que ville + surface
            saisies. Lookup async débounced 400ms. Disparaît silencieusement
            si pas assez de données. */}
        {ville.trim().length >= 2 && (
          <MarketRentHint
            ville={ville}
            surface={surface}
            pieces={pieces}
            prix=""
          />
        )}

        {ville.trim().length < 2 && (
          <KMCard padding="22px 26px" style={{ background: km.beige, border: `1px dashed ${km.line}`, textAlign: "center" }}>
            <p style={{ fontSize: 13, color: km.muted, margin: 0, lineHeight: 1.55 }}>
              Saisissez au moins une ville pour lancer l&apos;estimation.
            </p>
          </KMCard>
        )}

        <div style={{ marginTop: 32, padding: "20px 0", borderTop: `1px solid ${km.line}`, display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontSize: 13, color: km.muted, margin: 0, maxWidth: 380, lineHeight: 1.55 }}>
            Une fois votre prix décidé, publiez votre bien — le wizard reprend les mêmes infos
            et propose la même estimation contextuelle au moment de saisir le loyer.
          </p>
          <Link href="/proprietaire/ajouter" style={{ textDecoration: "none" }}>
            <KMButton size="lg">Publier un bien</KMButton>
          </Link>
        </div>

        <p style={{ fontSize: 11, color: km.muted, marginTop: 20, lineHeight: 1.5, fontStyle: "italic" }}>
          Estimation indicative basée uniquement sur les biens similaires actuellement en ligne.
          Pour une estimation officielle ou réglementée (encadrement Paris/Lille/etc.),
          consultez l&apos;observatoire local des loyers.
        </p>
      </div>
    </main>
  )
}
