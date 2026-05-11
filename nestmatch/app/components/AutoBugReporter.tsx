"use client"
import { useEffect } from "react"

/**
 * V97.11 — Auto-report bug dans /admin/bugs quand l'user atterrit sur une
 * page d'erreur (404, runtime error, global error).
 *
 * Complète le système V97.10 (BugReportButton manuel + auto sur window.onerror).
 * Différence : V97.10 capture les erreurs JS qui ne crash pas Next, V97.11
 * capture les erreurs qui FONT crash la page (404, exception non gérée
 * remontée à error.tsx).
 *
 * Contexte capturé :
 *  - URL d'erreur (la page actuelle, ex /annonces/999 qui 404)
 *  - Referrer (la page d'avant, ex /annonces — d'où venait le lien cassé)
 *  - Pour runtime errors : stack trace + digest Next.js
 *  - User agent
 *
 * Anti-spam :
 *  - sessionStorage flag par URL : 1 report par URL par session
 *  - Sinon : un user qui rebondit entre /a et /b qui 404 boucle = 50 reports
 *
 * Non capturé volontairement :
 *  - Pas de screenshot : la page d'erreur elle-même est inutile à screenshoter
 *    ("Cette page n'existe pas" → rien à voir). L'info utile est dans referrer.
 *  - Pas de console_log / network_log : ces refs sont dans BugReportButton et
 *    on n'a pas de pont. Pour debug une 404 on a juste besoin de l'URL et du
 *    referrer, donc OK pour cette V97.11.
 */

interface Props {
  /** Type d'erreur. Détermine la severity et la description auto. */
  type: "404" | "runtime-error" | "global-error"
  /** Pour runtime-error / global-error : l'objet Error remonté par Next. */
  error?: { name?: string; message?: string; stack?: string; digest?: string }
}

const STORAGE_KEY_PREFIX = "autobug:"
const STORAGE_KEY_MAX_ENTRIES = 50

export default function AutoBugReporter({ type, error }: Props) {
  useEffect(() => {
    if (typeof window === "undefined") return

    const pathname = window.location.pathname + window.location.search
    const storageKey = `${STORAGE_KEY_PREFIX}${type}:${pathname}`

    // Anti-spam : 1 report par (type, URL) par session
    try {
      if (sessionStorage.getItem(storageKey)) return
      sessionStorage.setItem(storageKey, String(Date.now()))
      // Cleanup : si on a >50 entrées en session, vire les plus vieilles
      const keys = Object.keys(sessionStorage).filter(k => k.startsWith(STORAGE_KEY_PREFIX))
      if (keys.length > STORAGE_KEY_MAX_ENTRIES) {
        const sorted = keys
          .map(k => ({ k, ts: Number(sessionStorage.getItem(k) || 0) }))
          .sort((a, b) => a.ts - b.ts)
        for (const e of sorted.slice(0, keys.length - STORAGE_KEY_MAX_ENTRIES)) {
          sessionStorage.removeItem(e.k)
        }
      }
    } catch {
      // sessionStorage disabled (private mode, quota) → on tente quand même le report
    }

    const referrer = document.referrer || "(direct)"
    const isSameOrigin = referrer.startsWith(window.location.origin)
    const referrerPath = isSameOrigin ? referrer.slice(window.location.origin.length) : referrer

    let description = ""
    let severity: "critical" | "major" | "minor" | "cosmetic" = "minor"
    if (type === "404") {
      description = `[Auto-404] Page introuvable : ${pathname}\n\nVenait de : ${referrerPath}`
      // Severity minor : la plupart des 404 sont des typos d'user. Si plusieurs reports
      // viennent du même referrer, c'est probablement un lien cassé (à investiguer).
      severity = "minor"
    } else if (type === "runtime-error") {
      const errName = error?.name || "Error"
      const errMsg = error?.message || "(pas de message)"
      const stack = error?.stack ? `\n\nStack:\n${error.stack.slice(0, 1500)}` : ""
      const digest = error?.digest ? `\n\nDigest Next: ${error.digest}` : ""
      description = `[Auto-runtime] ${errName}: ${errMsg}\n\nPage : ${pathname}\nVenait de : ${referrerPath}${digest}${stack}`
      severity = "major"
    } else {
      // global-error : layout crash, c'est plus grave
      const errName = error?.name || "Error"
      const errMsg = error?.message || "(pas de message)"
      const stack = error?.stack ? `\n\nStack:\n${error.stack.slice(0, 1500)}` : ""
      const digest = error?.digest ? `\n\nDigest Next: ${error.digest}` : ""
      description = `[Auto-CRITIQUE-layout] ${errName}: ${errMsg}\n\nPage : ${pathname}\nVenait de : ${referrerPath}${digest}${stack}`
      severity = "critical"
    }

    // Best-effort : si /api/bugs/report n'est pas joignable (user offline, route 500),
    // on n'a aucun moyen de fallback ici. C'est OK : Sentry + /api/admin/incident-auto
    // (déjà appelés depuis error.tsx / global-error.tsx) couvrent le cas où le report
    // côté DB échoue.
    fetch("/api/bugs/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: description.slice(0, 2000),
        severity,
        page_url: window.location.href,
        user_agent: navigator.userAgent.slice(0, 300),
      }),
      keepalive: true,  // permet l'envoi même si l'user navigue ailleurs immédiatement
    }).catch(() => {
      // Silent : on n'a pas besoin de notifier l'user qu'un auto-report a échoué.
      // L'incident /admin/health est déjà créé par les hooks existants.
    })
  }, [type, error])

  return null  // Rien à afficher, juste un side effect
}
