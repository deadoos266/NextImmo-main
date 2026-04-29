"use client"
// V34.3 — Walkthrough onboarding proprio 3 écrans.
// Audit V31 R3.7 : "Mode 'import existant' simplifié + Onboarding proprio".
// Affiché au mount du dashboard /proprietaire si l'user a au moins une annonce
// ET tuto_proprio_completed_at IS NULL ET tuto_proprio_skipped_at IS NULL.
//
// Le user peut Skip (sauve tuto_proprio_skipped_at) ou Terminer (sauve
// tuto_proprio_completed_at). Dans les 2 cas, le tuto reste accessible
// depuis le menu user via prop `forceOpen`.

import { useEffect, useState } from "react"
import Link from "next/link"

interface Props {
  open: boolean
  onClose: (action: "skip" | "complete") => void
}

const STEPS = [
  {
    eyebrow: "Étape 1 sur 3",
    title: "Comment fonctionne le bail KeyMatch",
    body: "Trois étapes simples — tu envoies l'invitation, le locataire signe, tu signes. Le bail est juridiquement actif (signature électronique eIDAS Niveau 1, art. 1366 Code civil).",
    illustration: (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 8px", gap: 12 }}>
        {[
          { icon: "📤", label: "Tu invites" },
          { icon: "✍️", label: "Locataire signe" },
          { icon: "✍️", label: "Tu signes" },
          { icon: "✓", label: "Bail actif" },
        ].map((s, i, arr) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1, position: "relative" }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#F7F4EF", border: "1px solid #EAE6DF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
              {s.icon}
            </div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 600, textAlign: "center", color: "#111", lineHeight: 1.3 }}>{s.label}</p>
            {i < arr.length - 1 && (
              <div style={{ position: "absolute", top: 22, left: "calc(50% + 26px)", right: "calc(-50% + 26px)", height: 1, background: "#EAE6DF" }} aria-hidden />
            )}
          </div>
        ))}
      </div>
    ),
  },
  {
    eyebrow: "Étape 2 sur 3",
    title: "Et après ? Tu n'es pas seul·e",
    body: "Une fois le bail actif, KeyMatch t'accompagne au quotidien.",
    bullets: [
      { icon: "📨", title: "Quittances auto", text: "Génération PDF mensuelle envoyée au locataire après confirmation de paiement." },
      { icon: "📋", title: "État des lieux", text: "EDL d'entrée et de sortie collaboratifs avec signature électronique." },
      { icon: "📈", title: "Indexation IRL", text: "Notification annuelle pour réviser le loyer selon l'IRL INSEE en vigueur." },
      { icon: "💬", title: "Messagerie dédiée", text: "Discute avec ton locataire en gardant une trace écrite officielle." },
    ],
  },
  {
    eyebrow: "Étape 3 sur 3",
    title: "Plusieurs biens ? Pas de souci.",
    body: "KeyMatch est pensé pour les bailleurs particuliers qui louent un ou plusieurs biens. Tout est centralisé dans ton dashboard, et chaque bien a son propre suivi.",
    bullets: [
      { icon: "🏠", title: "Dashboard unifié", text: "Tous tes biens en 1 vue : loyers payés, candidatures, baux actifs." },
      { icon: "📊", title: "Statistiques", text: "Loyers perçus, taux de remplissage, retards par bien." },
      { icon: "🔔", title: "Notifications priorisées", text: "Tu sais où ton attention est requise — sans noyer ta boîte mail." },
    ],
  },
] as const

export default function TutoProprio({ open, onClose }: Props) {
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) setStep(0)
  }, [open])

  if (!open) return null

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const isFirst = step === 0

  async function handleSkip() {
    if (submitting) return
    setSubmitting(true)
    try {
      await fetch("/api/proprietaire/tuto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "skip" }) })
    } catch { /* ignore — user a skip, on n'attend pas */ }
    setSubmitting(false)
    onClose("skip")
  }

  async function handleComplete() {
    if (submitting) return
    setSubmitting(true)
    try {
      await fetch("/api/proprietaire/tuto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete" }) })
    } catch { /* ignore */ }
    setSubmitting(false)
    onClose("complete")
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bienvenue sur KeyMatch"
      style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.55)", zIndex: 13500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'DM Sans', sans-serif" }}
      onClick={e => { if (e.target === e.currentTarget && !submitting) handleSkip() }}
    >
      <div style={{ background: "#fff", borderRadius: 24, maxWidth: 560, width: "100%", boxShadow: "0 24px 64px rgba(0,0,0,0.25)", overflow: "hidden" }}>
        {/* Bandeau de progression */}
        <div style={{ height: 4, background: "#EAE6DF", display: "flex" }}>
          <div style={{ height: "100%", width: `${((step + 1) / STEPS.length) * 100}%`, background: "linear-gradient(90deg,#FF8A1E,#E8271C)", transition: "width 0.3s" }} />
        </div>

        <div style={{ padding: "28px 32px 12px" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.4px", textTransform: "uppercase", color: "#a16207", margin: "0 0 10px" }}>
            {current.eyebrow}
          </p>
          <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 28, margin: "0 0 12px", color: "#111", letterSpacing: "-0.5px", lineHeight: 1.15 }}>
            {current.title}
          </h2>
          <p style={{ fontSize: 14, color: "#4b5563", margin: 0, lineHeight: 1.6 }}>
            {current.body}
          </p>
        </div>

        <div style={{ padding: "8px 32px 24px" }}>
          {"illustration" in current && current.illustration}
          {"bullets" in current && Array.isArray(current.bullets) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
              {current.bullets.map((b, i) => (
                <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "12px 14px", background: "#F7F4EF", borderRadius: 12 }}>
                  <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }} aria-hidden>{b.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 13.5, color: "#111", letterSpacing: "-0.1px" }}>{b.title}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#6b6559", lineHeight: 1.5 }}>{b.text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{ borderTop: "1px solid #EAE6DF", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleSkip}
            disabled={submitting}
            style={{ background: "transparent", border: "none", color: "#8a8477", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: "8px 4px", textTransform: "uppercase", letterSpacing: "0.3px" }}
          >
            Passer
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {!isFirst && (
              <button
                type="button"
                onClick={() => setStep(s => Math.max(0, s - 1))}
                disabled={submitting}
                style={{ background: "#fff", color: "#111", border: "1px solid #EAE6DF", borderRadius: 999, padding: "10px 18px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
              >
                ← Retour
              </button>
            )}
            {isLast ? (
              <Link
                href="/proprietaire/ajouter"
                onClick={() => void handleComplete()}
                style={{ background: "#111", color: "#fff", borderRadius: 999, padding: "10px 22px", fontSize: 12, fontWeight: 700, fontFamily: "inherit", textDecoration: "none", textTransform: "uppercase", letterSpacing: "0.3px" }}
              >
                Terminer · Ajouter mon 1er bien
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}
                disabled={submitting}
                style={{ background: "#111", color: "#fff", border: "none", borderRadius: 999, padding: "10px 22px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}
              >
                Suivant →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
