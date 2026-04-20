"use client"
import { useEffect, useState } from "react"
import { CARD_GRADIENTS } from "../../../lib/cardGradients"
import { useReducedMotion } from "./hooks"

/**
 * Section "Messagerie intégrée" — différenciant produit KeyMatch.
 *
 * Layout 60/40 desktop : à gauche texte éditorial + 4 features avec tiret
 * noir 28×1 (pas de bullet, pas d'icône — cohérent avec design system).
 * À droite un mockup de conversation avec 5 bulles qui apparaissent
 * séquentiellement toutes les 1.5s, puis reset après 8s.
 *
 * prefers-reduced-motion : les 5 bulles s'affichent d'un coup, pas de loop.
 */

type Bulle =
  | { from: "them" | "me"; text: string; kind?: "text" }
  | { from: "them"; kind: "slots"; slots: Array<{ day: string; hour: string }> }

const BULLES: Bulle[] = [
  { from: "them", text: "Bonjour, votre dossier a l'air solide !", kind: "text" },
  { from: "me",   text: "Merci. Le logement est toujours dispo ?", kind: "text" },
  { from: "them", text: "Oui, je vous propose 3 créneaux de visite", kind: "text" },
  { from: "them", kind: "slots", slots: [
    { day: "Ven. 18 avr.", hour: "18h30" },
    { day: "Sam. 19 avr.", hour: "10h" },
    { day: "Sam. 19 avr.", hour: "14h" },
  ]},
  { from: "me",   text: "Samedi 14h, parfait !", kind: "text" },
]

const FEATURES = [
  { t: "Statuts automatiques",  d: "Contact, dossier envoyé, visite programmée, bail signé" },
  { t: "Préfixes intelligents", d: "Vos cartes dossier, propositions de visite, signatures organisées par type" },
  { t: "Relance facile",         d: "Bouton de relance proposé après 7 jours sans réponse" },
  { t: "Zéro spam",              d: "Pas de numéro de téléphone exposé, pas d'email visible" },
]

export default function MessagerieSection({ isMobile, isTablet }: { isMobile: boolean; isTablet: boolean }) {
  const reduced = useReducedMotion()
  // Nombre de bulles visibles (0 → 5). Reset en boucle toutes les 8s.
  const [visible, setVisible] = useState<number>(reduced ? BULLES.length : 0)

  useEffect(() => {
    if (reduced) { setVisible(BULLES.length); return }
    // Séquence : apparition toutes les 1.5s, full à 1.5 × 5 = 7.5s, reset à 8s
    let cancelled = false
    const run = () => {
      setVisible(0)
      const timeouts: ReturnType<typeof setTimeout>[] = []
      BULLES.forEach((_, i) => {
        timeouts.push(setTimeout(() => { if (!cancelled) setVisible(i + 1) }, 1500 * (i + 1)))
      })
      timeouts.push(setTimeout(() => { if (!cancelled) run() }, 8000))
      return () => timeouts.forEach(clearTimeout)
    }
    const cleanup = run()
    return () => { cancelled = true; cleanup?.() }
  }, [reduced])

  return (
    <section style={{
      background: "#fff",
      padding: isMobile ? "72px 20px" : "120px 32px",
    }}>
      <div style={{
        maxWidth: 1280,
        margin: "0 auto",
        display: "grid",
        gridTemplateColumns: (isMobile || isTablet) ? "1fr" : "3fr 2fr",
        gap: isMobile ? 48 : 80,
        alignItems: "center",
      }}>

        {/* Colonne gauche — texte éditorial + 4 features */}
        <div>
          <p style={{
            fontSize: 12, fontWeight: 700,
            color: "#666", textTransform: "uppercase", letterSpacing: "1.8px",
            margin: 0, marginBottom: 18,
          }}>
            Messagerie intégrée
          </p>
          <h2 style={{
            fontSize: isMobile ? 30 : 44,
            fontWeight: 500,
            lineHeight: 1.08,
            letterSpacing: "-1.2px",
            margin: 0,
            marginBottom: 20,
            color: "#111",
          }}>
            Vos échanges. Votre dossier. Vos visites.<br />Au même endroit.
          </h2>
          <p style={{
            fontSize: 16,
            lineHeight: 1.7,
            color: "#555",
            margin: 0,
            marginBottom: 32,
            maxWidth: 560,
          }}>
            Discutez en direct avec les propriétaires sans donner votre numéro.
            Envoyez votre dossier ALUR en un clic, planifiez une visite, signez
            votre bail. Tout est centralisé, tout est tracé, tout est conforme.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {FEATURES.map(f => (
              <div key={f.t} style={{
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
              }}>
                {/* Tiret noir 28×1, aligné avec la ligne de base du titre */}
                <span aria-hidden style={{
                  flexShrink: 0,
                  display: "inline-block",
                  width: 28,
                  height: 1,
                  background: "#111",
                  marginTop: 12,
                }} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#111", letterSpacing: "-0.1px" }}>
                    {f.t}
                  </div>
                  <div style={{ fontSize: 13, color: "#555", lineHeight: 1.55, marginTop: 2 }}>
                    {f.d}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Colonne droite — mockup chat animé */}
        <ChatMockup visible={visible} reduced={reduced} />
      </div>
    </section>
  )
}

function ChatMockup({ visible, reduced }: { visible: number; reduced: boolean }) {
  // 1er gradient cardGradients pour l'avatar du propriétaire fictif
  const avatarGradient = CARD_GRADIENTS[0]
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #EAE6DF",
      borderRadius: 20,
      boxShadow: "0 12px 32px rgba(0,0,0,0.08)",
      padding: 24,
    }}>
      {/* Header conv */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        paddingBottom: 16,
        borderBottom: "1px solid #EAE6DF",
        marginBottom: 20,
      }}>
        <div style={{
          position: "relative",
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: avatarGradient,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#111",
          fontSize: 12,
          fontWeight: 600,
          flexShrink: 0,
        }}>
          ML
          {/* Pastille verte "en ligne" */}
          <span aria-hidden style={{
            position: "absolute",
            bottom: -1,
            right: -1,
            width: 11,
            height: 11,
            background: "#16A34A",
            borderRadius: "50%",
            border: "2px solid #fff",
          }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#111", letterSpacing: "-0.1px" }}>
            Marie L.
          </div>
          <div style={{ fontSize: 11, color: "#16A34A", fontWeight: 600, letterSpacing: "0.2px" }}>
            Propriétaire · Paris 10e · En ligne
          </div>
        </div>
      </div>

      {/* Liste de bulles */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {BULLES.map((b, i) => (
          <Bulle key={i} bulle={b} show={i < visible} reduced={reduced} />
        ))}
      </div>
    </div>
  )
}

function Bulle({ bulle, show, reduced }: { bulle: Bulle; show: boolean; reduced: boolean }) {
  const mine = bulle.from === "me"
  const baseStyle: React.CSSProperties = {
    opacity: show ? 1 : 0,
    transform: show ? "translateY(0)" : "translateY(8px)",
    transition: reduced ? "none" : "opacity 200ms ease, transform 200ms ease",
    display: "flex",
    justifyContent: mine ? "flex-end" : "flex-start",
  }

  if (bulle.kind === "slots") {
    return (
      <div style={baseStyle}>
        <div style={{
          maxWidth: "85%",
          background: "#F4EFE7",
          color: "#111",
          borderRadius: "18px 18px 18px 4px",
          padding: "10px 12px",
          fontSize: 13,
          fontFamily: "'DM Sans', sans-serif",
        }}>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 8, fontWeight: 600 }}>
            Proposition de visite
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {bulle.slots.map((s, j) => (
              <div key={j} style={{
                background: "#fff",
                border: "1px solid #EAE6DF",
                borderRadius: 12,
                padding: "6px 10px",
                fontSize: 11,
                fontWeight: 500,
                color: "#111",
                textAlign: "center",
              }}>
                <div style={{ color: "#666", marginBottom: 2 }}>{s.day}</div>
                <div style={{ fontWeight: 700 }}>{s.hour}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={baseStyle}>
      <div style={{
        maxWidth: "80%",
        background: mine ? "#111" : "#F4EFE7",
        color: mine ? "#fff" : "#111",
        borderRadius: mine ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
        padding: "10px 14px",
        fontSize: 14,
        lineHeight: 1.4,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {bulle.text}
      </div>
    </div>
  )
}
