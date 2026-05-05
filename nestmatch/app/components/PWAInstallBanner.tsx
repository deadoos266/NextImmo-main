"use client"
import { useEffect, useState } from "react"

/**
 * V66.4 — Banner discret bottom mobile "Installer KeyMatch"
 *
 * Pattern Web : `beforeinstallprompt` event est dispatché par Chrome/Edge
 * quand le site est éligible PWA. On le capture, on stocke le prompt, et
 * on l'affiche au user via un banner au lieu de la prompt native (qui
 * peut être intrusive).
 *
 * Comportement :
 *   - Si user a déjà installé OU déjà refusé → ne s'affiche jamais.
 *   - Si pas de support PWA (Safari iOS) → affiche un fallback texte avec
 *     les instructions "Partager → Ajouter à l'écran d'accueil".
 *   - Mobile uniquement (≤768px) — desktop a déjà l'install icon dans
 *     l'URL bar.
 *
 * Stockage : `pwa_install_dismissed` dans localStorage.
 * Réaffiche après 30 jours (regenère le prompt si refus = procrastination
 * pas refus définitif).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const STORAGE_KEY = "pwa_install_dismissed"
const REPROMPT_DAYS = 30

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return

    // Détection mobile + iOS
    const mq = window.matchMedia("(max-width: 768px)")
    setIsMobile(mq.matches)
    const ua = navigator.userAgent.toLowerCase()
    const ios = /iphone|ipad|ipod/.test(ua) && !/crios|fxios|edgios/.test(ua)
    setIsIOS(ios)

    // Check si déjà dismissed récemment
    const dismissedRaw = localStorage.getItem(STORAGE_KEY)
    if (dismissedRaw) {
      const dismissedAt = parseInt(dismissedRaw, 10)
      if (Number.isFinite(dismissedAt)) {
        const daysAgo = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24)
        if (daysAgo < REPROMPT_DAYS) return
      }
    }

    // Check si déjà installé (display-mode: standalone)
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (isStandalone) return

    // Listener Chrome/Edge
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // Délai pour ne pas bombarder l'user dès l'arrivée
      setTimeout(() => setVisible(true), 8000)
    }
    window.addEventListener("beforeinstallprompt", handler)

    // Pour iOS qui n'a pas beforeinstallprompt : on affiche le fallback
    // après 12s sur la 2ᵉ visite (1 visite déjà loggée via le storage
    // d'auth ou autre).
    if (ios && mq.matches) {
      setTimeout(() => setVisible(true), 12000)
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handler)
    }
  }, [])

  function dismiss(): void {
    localStorage.setItem(STORAGE_KEY, String(Date.now()))
    setVisible(false)
  }

  async function install(): Promise<void> {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === "accepted") {
      // Installé : marque comme dismissed permanent
      localStorage.setItem(STORAGE_KEY, String(Date.now()))
    } else {
      dismiss()
    }
    setDeferredPrompt(null)
    setVisible(false)
  }

  if (!visible || !isMobile) return null
  // Pas iOS et pas de prompt = rien à proposer
  if (!isIOS && !deferredPrompt) return null

  return (
    <div
      role="dialog"
      aria-label="Installer KeyMatch"
      style={{
        position: "fixed",
        bottom: 12,
        left: 12,
        right: 12,
        zIndex: 8000,
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderRadius: 18,
        border: "1px solid rgba(0,0,0,0.08)",
        boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
        padding: 16,
        fontFamily: "'DM Sans', sans-serif",
        animation: "km-pwa-rise 0.32s cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      <style>{`@keyframes km-pwa-rise { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }`}</style>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: "#111",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            fontFamily: "'Fraunces', Georgia, serif",
            fontWeight: 500,
            fontSize: 22,
            fontStyle: "italic",
          }}
          aria-hidden="true"
        >
          K
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: 0 }}>
            Installer KeyMatch
          </p>
          <p style={{ fontSize: 12.5, color: "#6b6559", margin: "2px 0 0", lineHeight: 1.45 }}>
            {isIOS
              ? "Appuyez sur Partager puis « Sur l'écran d'accueil »"
              : "Accès rapide depuis votre écran d'accueil, sans navigateur."}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Fermer"
          style={{
            background: "transparent",
            border: "none",
            color: "#8a8477",
            cursor: "pointer",
            padding: 4,
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      {!isIOS && deferredPrompt && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            type="button"
            onClick={dismiss}
            style={{
              flex: 1,
              background: "transparent",
              border: "1px solid #EAE6DF",
              color: "#111",
              borderRadius: 999,
              padding: "9px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Plus tard
          </button>
          <button
            type="button"
            onClick={install}
            style={{
              flex: 2,
              background: "#111",
              color: "#fff",
              border: "none",
              borderRadius: 999,
              padding: "9px 16px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Installer
          </button>
        </div>
      )}
    </div>
  )
}
