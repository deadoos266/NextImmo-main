"use client"
// V55.2 — Walkthrough onboarding locataire post-signup style "vidéo
// interactive" (Option B validée user). 13 étapes au total :
//   - 1 étape "Pourquoi KeyMatch" (différenciation)
//   - 12 étapes locataire (matching, carte, sauvegarder, candidatures,
//     messages, visites ICS, signature bail, loyers, EDL, dossier)
//
// Affiché auto au premier load /annonces si :
//   - user authenticated AND profil.is_proprietaire IS NOT TRUE
//   - tuto_locataire_completed_at IS NULL AND tuto_locataire_skipped_at IS NULL
//
// Skip → tuto_locataire_skipped_at, Terminer → tuto_locataire_completed_at.
// Restart accessible depuis le menu user (POST /api/locataire/tuto reset).

import { useEffect, useState } from "react"
import Link from "next/link"

interface Props {
  open: boolean
  onClose: (action: "skip" | "complete") => void
  /** Email pour le cache localStorage anti-reshow. */
  userEmail?: string | null
}

type Step = {
  eyebrow: string
  title: string
  body: string
  bullets?: { icon: string; title: string; text: string }[]
  illustration?: React.ReactNode
}

const STEPS: Step[] = [
  // ─── 1. Pourquoi KeyMatch ──────────────────────────────────────────────
  {
    eyebrow: "Bienvenue · Étape 1 sur 13",
    title: "Pourquoi KeyMatch",
    body: "KeyMatch est conçu pour louer sans intermédiaire et sans frais d'agence. Trois différenciateurs clés :",
    bullets: [
      { icon: "🎯", title: "Matching personnalisé", text: "Les annonces les plus pertinentes pour TOI — score sur 1000 selon budget, surface, équipements, localisation." },
      { icon: "📦", title: "Tout dans une seule app", text: "Recherche, dossier, signature de bail, EDL, quittances, IRL — pas besoin de 5 outils différents." },
      { icon: "⚖️", title: "Bilatéral équitable", text: "Aucune commission, ni d'un côté ni de l'autre. Tu paies ton loyer, ton bailleur l'encaisse, c'est tout." },
    ],
  },
  // ─── 2-4. Recherche annonces ───────────────────────────────────────────
  {
    eyebrow: "Étape 2 sur 13 · Recherche",
    title: "Trouver ton logement",
    body: "Dans /annonces, applique tes critères dans la barre de gauche. Le score de matching s'affiche sur chaque carte (en haut à droite, %). Plus c'est élevé, plus l'annonce te correspond.",
    bullets: [
      { icon: "🎚️", title: "Filtres rapides", text: "Budget, surface, pièces, type de bail, équipements indispensables." },
      { icon: "📊", title: "Tri intelligent", text: "Par défaut : score décroissant. Tu peux trier par prix, surface, date." },
    ],
  },
  {
    eyebrow: "Étape 3 sur 13 · Carte",
    title: "Vue carte interactive",
    body: "Bascule vers la vue carte (bouton en haut à droite). Les annonces s'affichent géolocalisées avec leurs prix. La heatmap colore les zones par prix au m² (vert / ambre / rouge).",
    bullets: [
      { icon: "🗺️", title: "Heatmap quartiers", text: "Paris (20 arr), Lyon (9 arr), Marseille (16 arr) — visualise les zones abordables." },
      { icon: "📍", title: "Cluster + zoom", text: "Clique sur un cluster pour voir les annonces dans la zone, zoom pour le détail." },
    ],
  },
  {
    eyebrow: "Étape 4 sur 13 · Sauvegarder",
    title: "Sauvegarde tes annonces préférées",
    body: "Sur chaque carte, le ❤️ ajoute aux favoris. Le bouton 🔍 sauve la recherche (avec ses filtres) — tu reçois un email quand de nouvelles annonces matchent.",
  },
  // ─── 5-6. Dossier ─────────────────────────────────────────────────────
  {
    eyebrow: "Étape 5 sur 13 · Dossier",
    title: "Prépare ton dossier locataire",
    body: "Va dans /dossier (menu user). Renseigne situation pro, revenus, et upload tes pièces (CNI, bulletins, avis d'imposition, garant). Plus ton score de complétude est haut, plus tu te démarques.",
    bullets: [
      { icon: "🔒", title: "Chiffré bout en bout", text: "Tes documents sont stockés chiffrés. Le proprio reçoit un lien sécurisé révocable à tout moment." },
      { icon: "🎯", title: "Score de complétude", text: "Affiché sur ta page dossier. Vise 100% pour maximiser tes chances." },
    ],
  },
  {
    eyebrow: "Étape 6 sur 13 · Candidater",
    title: "Postule en 2 clics",
    body: "Sur une annonce, clique 'Contacter'. Le proprio reçoit ton message avec ton score de matching. Tu peux aussi joindre directement ton dossier ou attendre qu'il le demande.",
  },
  // ─── 7-9. Conversation + visite ────────────────────────────────────────
  {
    eyebrow: "Étape 7 sur 13 · Messages",
    title: "Discute avec le bailleur",
    body: "Dans /messages, conversation par annonce. Statut visible (contact / dossier partagé / visite / bail signé). Documents importants partagés affichés à droite.",
    bullets: [
      { icon: "💬", title: "Réponses rapides", text: "Templates pré-rédigés (questions sur le bien, dispo de visite)." },
      { icon: "📎", title: "Documents inline", text: "Bail, EDL, quittances, dossier — tout retrouvable dans la conv." },
    ],
  },
  {
    eyebrow: "Étape 8 sur 13 · Visite",
    title: "Propose un créneau",
    body: "Une fois ta candidature validée par le proprio, tu peux proposer jusqu'à 5 créneaux de visite (physique ou visio).",
    bullets: [
      { icon: "📅", title: "ICS calendar", text: "Une fois confirmée, tu reçois un fichier .ics — 1 clic pour ajouter à ton agenda Apple/Google." },
      { icon: "🔔", title: "Rappel J-1", text: "Email automatique la veille de la visite avec adresse et lien conv." },
    ],
  },
  {
    eyebrow: "Étape 9 sur 13 · Signature bail",
    title: "Signe ton bail en ligne",
    body: "Si le proprio t'envoie une invitation à signer, tu reçois un mail. La signature électronique est conforme eIDAS Niveau 1 (article 1366 Code civil).",
    bullets: [
      { icon: "✍️", title: "Mention manuscrite", text: "Tu recopies « Lu et approuvé, bon pour accord » + ta signature canvas." },
      { icon: "📜", title: "PDF complet", text: "Une fois les 2 parties signées, tu reçois le PDF final par email + dans la conv." },
    ],
  },
  // ─── 10-12. Phase locataire ────────────────────────────────────────────
  {
    eyebrow: "Étape 10 sur 13 · État des lieux",
    title: "EDL d'entrée et de sortie",
    body: "À l'entrée et à la sortie, tu signes l'état des lieux préparé par le bailleur. Si tu n'es pas d'accord, tu peux contester avec un motif et il devra ajuster.",
  },
  {
    eyebrow: "Étape 11 sur 13 · Loyers",
    title: "Tes loyers et quittances",
    body: "Une fois le loyer payé et confirmé par ton bailleur, tu reçois automatiquement la quittance PDF par email.",
    bullets: [
      { icon: "📨", title: "Quittance PDF", text: "Reçue par email dès la confirmation du paiement." },
      { icon: "⚠️", title: "Rappel J+5", text: "Si retard de paiement, rappel automatique amical (puis formel à J+15)." },
    ],
  },
  {
    eyebrow: "Étape 12 sur 13 · Mon logement",
    title: "Vue centralisée /mon-logement",
    body: "Toutes tes infos dans une seule page : bail signé, EDL, quittances, prochaine visite, état du loyer du mois. Une seule URL à retenir.",
  },
  // ─── 13. Préférences ──────────────────────────────────────────────────
  {
    eyebrow: "Étape 13 sur 13 · Préférences",
    title: "Tu contrôles tes notifications",
    body: "Dans /parametres > onglet Compte, tu choisis précisément quels emails recevoir (27 events distincts). Tu peux tout désactiver — sauf les signaux légaux (bail signé, préavis, mise en demeure).",
  },
]

export default function TutoLocataireWalkthrough({ open, onClose, userEmail = null }: Props) {
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) setStep(0)
  }, [open])

  if (!open) return null

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const isFirst = step === 0
  const totalSteps = STEPS.length

  function cacheLocalDone() {
    if (!userEmail) return
    try { window.localStorage.setItem(`nestmatch_tuto_locataire:${userEmail}`, "done") } catch { /* ignore */ }
  }

  async function handleSkip() {
    if (submitting) return
    setSubmitting(true)
    cacheLocalDone()
    try {
      await fetch("/api/locataire/tuto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "skip" }) })
    } catch { /* ignore — cache local préserve l'intention */ }
    setSubmitting(false)
    onClose("skip")
  }

  async function handleComplete() {
    if (submitting) return
    setSubmitting(true)
    cacheLocalDone()
    try {
      await fetch("/api/locataire/tuto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete" }) })
    } catch { /* ignore */ }
    setSubmitting(false)
    onClose("complete")
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bienvenue sur KeyMatch — Visite guidée locataire"
      style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.55)", zIndex: 13500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'DM Sans', sans-serif" }}
      onClick={e => { if (e.target === e.currentTarget && !submitting) handleSkip() }}
    >
      <div style={{ background: "#fff", borderRadius: 24, maxWidth: 600, width: "100%", maxHeight: "92vh", boxShadow: "0 24px 64px rgba(0,0,0,0.25)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Bandeau de progression */}
        <div style={{ height: 4, background: "#EAE6DF", display: "flex", flexShrink: 0 }}>
          <div style={{ height: "100%", width: `${((step + 1) / totalSteps) * 100}%`, background: "linear-gradient(90deg,#FF8A1E,#E8271C)", transition: "width 0.3s" }} />
        </div>

        <div style={{ padding: "28px 32px 12px", overflowY: "auto", flex: 1 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.4px", textTransform: "uppercase", color: "#a16207", margin: "0 0 10px" }}>
            {current.eyebrow}
          </p>
          <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 28, margin: "0 0 12px", color: "#111", letterSpacing: "-0.5px", lineHeight: 1.15 }}>
            {current.title}
          </h2>
          <p style={{ fontSize: 14, color: "#4b5563", margin: 0, lineHeight: 1.65 }}>
            {current.body}
          </p>

          <div style={{ marginTop: 16 }}>
            {current.illustration}
            {current.bullets && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
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
        </div>

        {/* Footer actions */}
        <div style={{ borderTop: "1px solid #EAE6DF", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", flexShrink: 0 }}>
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
                href="/annonces"
                onClick={() => void handleComplete()}
                style={{ background: "#111", color: "#fff", borderRadius: 999, padding: "10px 22px", fontSize: 12, fontWeight: 700, fontFamily: "inherit", textDecoration: "none", textTransform: "uppercase", letterSpacing: "0.3px" }}
              >
                Terminer · Voir les annonces
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
