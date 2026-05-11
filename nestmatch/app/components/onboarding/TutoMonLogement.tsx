"use client"
/**
 * V95.C.1 — Tuto /mon-logement : visite guidée post-acceptance locataire.
 *
 * 4 étapes simples qui présentent les fonctionnalités clés de l'espace
 * logement (bail, quittances, EDL, communication avec le proprio).
 *
 * Affichage :
 *  - Au 1er load de /mon-logement si profils.tuto_mon_logement_at IS NULL
 *    ET localStorage absent
 *  - Modale plein écran avec overlay sombre, progression + skip
 *  - Persistance via POST /api/locataire/tuto-mon-logement (skip ou complete)
 *
 * Restart possible depuis le menu user via lien "Refaire la visite guidée"
 * qui DELETE le timestamp côté server + localStorage.
 */

import { useEffect, useState } from "react"
import { Z_INDEX } from "../../../lib/zIndex"

interface Props {
  open: boolean
  onClose: (action: "skip" | "complete") => void
}

type Step = {
  eyebrow: string
  title: string
  body: string
  bullets?: { icon: string; title: string; text: string }[]
}

const STEPS: Step[] = [
  {
    eyebrow: "Bienvenue · Étape 1 sur 4",
    title: "Votre logement, votre espace",
    body: "Tout ce qui concerne votre location est désormais centralisé ici. Voici un tour rapide des 4 fonctionnalités clés que vous allez utiliser.",
    bullets: [
      { icon: "📋", title: "Votre bail", text: "PDF signé téléchargeable à tout moment, valeur juridique pleine." },
      { icon: "💶", title: "Vos quittances", text: "Générées automatiquement chaque mois après confirmation du paiement." },
      { icon: "🔑", title: "État des lieux", text: "Entrée et sortie, consultables même après la fin du bail." },
      { icon: "💬", title: "Échanges proprio", text: "Une seule conversation avec votre bailleur, archivée 3 ans." },
    ],
  },
  {
    eyebrow: "Étape 2 sur 4 · Votre bail",
    title: "Accéder à votre bail",
    body: "La card « Mon bail » en haut de la page affiche les infos essentielles (loyer, date début, durée). Cliquez sur « Télécharger le PDF » pour récupérer le contrat à tout moment.",
    bullets: [
      { icon: "📥", title: "Téléchargement direct", text: "Le PDF du bail s'ouvre en 1 clic dans un nouvel onglet." },
      { icon: "🔒", title: "Stockage sécurisé", text: "Conservé même après la fin du bail (RGPD art. 17 — vous pouvez demander suppression)." },
      { icon: "📎", title: "Annexes ALUR", text: "DPE, ERP, CREP, notice info — tout est dans le PDF principal ou en annexes séparées." },
    ],
  },
  {
    eyebrow: "Étape 3 sur 4 · Quittances",
    title: "Vos quittances mensuelles",
    body: "Chaque 1er du mois, votre propriétaire reçoit une notification pour confirmer le paiement reçu. Une fois confirmé, votre quittance PDF est générée automatiquement et apparaît dans /mes-quittances.",
    bullets: [
      { icon: "📅", title: "Génération auto", text: "Pas besoin de demander — le système crée le loyer le 1er du mois." },
      { icon: "✅", title: "Quittance officielle", text: "Conforme art. 21 loi 89-462 (mentions légales complètes)." },
      { icon: "💾", title: "Archive perso", text: "Vous pouvez aussi importer vos anciennes quittances pré-KeyMatch." },
    ],
  },
  {
    eyebrow: "Étape 4 sur 4 · Communication",
    title: "Tout passe par les messages",
    body: "Que ce soit pour signaler un problème, demander une réparation, ou discuter du préavis — utilisez la conversation avec votre proprio. Vous trouverez aussi le carnet d'entretien pour tracer les interventions.",
    bullets: [
      { icon: "📞", title: "Messages directs", text: "Conversation chiffrée bout en bout, sans intermédiaire." },
      { icon: "🛠️", title: "Carnet d'entretien", text: "Signalez une fuite, panne, dégât — historique partagé avec le proprio." },
      { icon: "📨", title: "Préavis dématérialisé", text: "Donner congé en ligne (LRAR via service partenaire à venir)." },
    ],
  },
]

export default function TutoMonLogement({ open, onClose }: Props) {
  const [step, setStep] = useState(0)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (!open) { setStep(0); setClosing(false) }
  }, [open])

  if (!open) return null

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  async function finish(action: "skip" | "complete") {
    setClosing(true)
    try {
      // Persist côté server
      await fetch("/api/locataire/tuto-mon-logement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
    } catch { /* non-bloquant */ }
    try {
      localStorage.setItem("km_tuto_mon_logement_done_v1", action)
    } catch { /* quota */ }
    onClose(action)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tuto-logement-title"
      style={{
        position: "fixed", inset: 0,
        background: "rgba(17, 17, 17, 0.72)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        zIndex: Z_INDEX.modal,
        fontFamily: "'DM Sans', sans-serif",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) finish("skip") }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500&display=swap');`}</style>
      <div
        style={{
          maxWidth: 560,
          width: "100%",
          maxHeight: "92vh",
          overflowY: "auto",
          background: "#F7F4EF",
          borderRadius: 24,
          padding: 0,
          boxShadow: "0 24px 64px rgba(0,0,0,0.28)",
          opacity: closing ? 0.5 : 1,
          transition: "opacity 200ms",
        }}
      >
        {/* Header progression */}
        <div style={{ padding: "20px 28px 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", gap: 4, flex: 1 }}>
            {STEPS.map((_, i) => (
              <div
                key={i}
                style={{
                  flex: 1, height: 3, borderRadius: 2,
                  background: i <= step ? "#111" : "#EAE6DF",
                  transition: "background 200ms",
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => finish("skip")}
            style={{
              background: "transparent",
              border: "none",
              color: "#8a8477",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              padding: "4px 8px",
              flexShrink: 0,
            }}
          >
            Passer
          </button>
        </div>

        {/* Contenu */}
        <div style={{ padding: "20px 28px 28px" }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.4px", margin: 0 }}>
            {current.eyebrow}
          </p>
          <h2
            id="tuto-logement-title"
            style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: 30,
              letterSpacing: "-0.5px",
              color: "#111",
              margin: "8px 0 12px",
              lineHeight: 1.15,
            }}
          >
            {current.title}
          </h2>
          <p style={{ fontSize: 15, color: "#4b5563", lineHeight: 1.6, margin: 0 }}>{current.body}</p>

          {current.bullets && (
            <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0", display: "flex", flexDirection: "column", gap: 12 }}>
              {current.bullets.map(b => (
                <li
                  key={b.title}
                  style={{
                    display: "flex",
                    gap: 12,
                    padding: "12px 14px",
                    background: "#fff",
                    border: "1px solid #EAE6DF",
                    borderRadius: 14,
                  }}
                >
                  <span aria-hidden style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{b.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "#111", margin: 0 }}>{b.title}</p>
                    <p style={{ fontSize: 12, color: "#6b6358", margin: "2px 0 0", lineHeight: 1.5 }}>{b.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Navigation */}
        <div style={{ padding: "0 28px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep(s => Math.max(0, s - 1))}
            style={{
              background: "transparent",
              border: "1px solid #EAE6DF",
              color: step === 0 ? "#bfbcb3" : "#111",
              borderRadius: 999,
              padding: "10px 18px",
              fontSize: 12,
              fontWeight: 600,
              cursor: step === 0 ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              textTransform: "uppercase",
              letterSpacing: "0.3px",
            }}
          >
            ← Précédent
          </button>
          <button
            type="button"
            onClick={() => {
              if (isLast) finish("complete")
              else setStep(s => Math.min(STEPS.length - 1, s + 1))
            }}
            style={{
              background: "#111",
              color: "#fff",
              border: "none",
              borderRadius: 999,
              padding: "12px 24px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              textTransform: "uppercase",
              letterSpacing: "0.4px",
            }}
          >
            {isLast ? "C'est compris ✓" : "Suivant →"}
          </button>
        </div>
      </div>
    </div>
  )
}
