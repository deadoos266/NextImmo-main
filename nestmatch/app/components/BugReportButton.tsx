"use client"
import { useEffect, useRef, useState, useCallback } from "react"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { km } from "./ui/km"

/**
 * V84.8 / V97.10 — BugReportButton : widget flottant + auto-capture sur erreur JS.
 *
 * V84.8 (origine) : bouton manuel + capture console + network.
 * V97.10 : ajout (a) screenshot DOM html2canvas → Supabase Storage,
 *                (b) auto-trigger sur window.onerror et unhandledrejection.
 *
 * Accessible à tous les users authentifiés (admin + locataire + proprio).
 * Pas affiché sur /admin/* (admin a /admin/bugs pour gérer).
 *
 * Position : bottom-right au-dessus du cookie banner et au-dessus du
 * BottomNavMobile (sur mobile authenticated). zIndex 850 (sous Navbar 10000).
 *
 * Captures automatiques :
 *  - 50 derniers console.error/warn (V84.8)
 *  - 20 derniers fetch 4xx/5xx (V84.8)
 *  - Screenshot DOM via html2canvas (V97.10, lazy-load, JPEG q=0.7)
 *  - Stack trace si auto-triggered par window.onerror (V97.10)
 *
 * Anti-spam V97.10 :
 *  - Debounce auto-capture : 60s entre 2 ouvertures auto
 *  - Max 5 auto-reports par session
 *  - Flag anti-boucle : si erreur JS dans le handler lui-même, désactive auto
 *
 * Vie privée V97.10 :
 *  - Toggle "Inclure capture d'écran" (default ON) → désactivable par user
 *  - Message clair "votre écran sera capturé" dans la modale
 */

const CONSOLE_CAPTURE_MAX = 50
const NETWORK_CAPTURE_MAX = 20
const AUTO_DEBOUNCE_MS = 60 * 1000
const AUTO_MAX_PER_SESSION = 5
const SCREENSHOT_TIMEOUT_MS = 5000

type ConsoleEntry = { level: string; text: string; ts: number }
type NetworkEntry = { url: string; status: number; method: string }

export default function BugReportButton() {
  const pathname = usePathname() || "/"
  const { status } = useSession()
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState("")
  const [severity, setSeverity] = useState("minor")
  const [includeScreenshot, setIncludeScreenshot] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [autoTriggered, setAutoTriggered] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const consoleRef = useRef<ConsoleEntry[]>([])
  const networkRef = useRef<NetworkEntry[]>([])
  const lastAutoTriggerRef = useRef<number>(0)
  const autoTriggerCountRef = useRef<number>(0)
  const autoCaptureDisabledRef = useRef<boolean>(false)

  // Capture console errors/warnings dès le mount
  useEffect(() => {
    if (typeof window === "undefined") return
    const origError = console.error
    const origWarn = console.warn
    console.error = (...args) => {
      const text = args.map(a => typeof a === "string" ? a : String(a)).join(" ").slice(0, 400)
      consoleRef.current.push({ level: "error", text, ts: Date.now() })
      if (consoleRef.current.length > CONSOLE_CAPTURE_MAX) consoleRef.current.shift()
      origError.apply(console, args)
    }
    console.warn = (...args) => {
      const text = args.map(a => typeof a === "string" ? a : String(a)).join(" ").slice(0, 400)
      consoleRef.current.push({ level: "warn", text, ts: Date.now() })
      if (consoleRef.current.length > CONSOLE_CAPTURE_MAX) consoleRef.current.shift()
      origWarn.apply(console, args)
    }
    return () => {
      console.error = origError
      console.warn = origWarn
    }
  }, [])

  // Capture network 4xx/5xx via patch fetch
  useEffect(() => {
    if (typeof window === "undefined") return
    const origFetch = window.fetch
    window.fetch = async (...args) => {
      const res = await origFetch.apply(window, args)
      try {
        if (res.status >= 400) {
          const url = typeof args[0] === "string" ? args[0] : (args[0] as Request).url
          const method = (args[1] as RequestInit | undefined)?.method || (typeof args[0] === "object" ? (args[0] as Request).method : "GET")
          networkRef.current.push({ url: url.slice(0, 200), status: res.status, method })
          if (networkRef.current.length > NETWORK_CAPTURE_MAX) networkRef.current.shift()
        }
      } catch { /* silent */ }
      return res
    }
    return () => { window.fetch = origFetch }
  }, [])

  // V97.10 — Auto-trigger sur erreur JS non capturée.
  // Évite spam : debounce 60s + max 5 par session + désactivable si boucle.
  const tryAutoTrigger = useCallback((errorText: string, stack: string | null) => {
    if (autoCaptureDisabledRef.current) return
    if (autoTriggerCountRef.current >= AUTO_MAX_PER_SESSION) return
    const now = Date.now()
    if (now - lastAutoTriggerRef.current < AUTO_DEBOUNCE_MS) return
    lastAutoTriggerRef.current = now
    autoTriggerCountRef.current += 1
    try {
      const prefix = `[Auto-détecté] ${errorText}`
      const stackPart = stack ? `\n\nStack:\n${stack.slice(0, 1500)}` : ""
      setDescription(prev => prev || (prefix + stackPart))
      setSeverity("major")
      setAutoTriggered(true)
      setOpen(true)
    } catch {
      // Si on échoue à ouvrir la modale, on désactive l'auto pour éviter boucle
      autoCaptureDisabledRef.current = true
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (status !== "authenticated") return
    if (pathname.startsWith("/admin")) return

    const onError = (e: ErrorEvent) => {
      const text = e.message || "Erreur JS"
      const stack = e.error?.stack || null
      tryAutoTrigger(text, stack)
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason
      const text = reason instanceof Error ? reason.message : String(reason).slice(0, 200)
      const stack = reason instanceof Error ? reason.stack || null : null
      tryAutoTrigger(`Promesse rejetée : ${text}`, stack)
    }
    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)
    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
    }
  }, [status, pathname, tryAutoTrigger])

  // Cache si pas authentifié, ou sur /admin/*
  if (status !== "authenticated") return null
  if (pathname.startsWith("/admin")) return null

  /**
   * V97.10 — Capture le DOM en JPEG via html2canvas, upload Supabase Storage.
   * Retourne l'URL signée (publicUrl-like via signed) ou null si échec.
   *
   * Best-effort : si échec (timeout, lib failure, CORS), on retourne null
   * et on submit le bug report quand même (sans screenshot).
   */
  async function captureAndUploadScreenshot(): Promise<string | null> {
    try {
      // Lazy-load html2canvas (~50KB) seulement au moment du capture
      const html2canvasMod = await import("html2canvas")
      const html2canvas = html2canvasMod.default

      const capturePromise = html2canvas(document.body, {
        // Qualité raisonnable pour debug, pas pour print
        scale: window.devicePixelRatio > 1 ? 1 : 1.5,
        useCORS: true,
        allowTaint: true,
        logging: false,
        // Skip notre propre modale du screenshot
        ignoreElements: el => {
          return el.getAttribute("data-bug-modal") === "true"
        },
      })

      // Timeout 5s : si html2canvas mouline, on abandonne (sans casser le report)
      const canvas = await Promise.race([
        capturePromise,
        new Promise<HTMLCanvasElement>((_, reject) =>
          setTimeout(() => reject(new Error("Screenshot timeout")), SCREENSHOT_TIMEOUT_MS),
        ),
      ])

      // Convertit en JPEG quality 0.7 (~150-300KB selon page)
      const blob = await new Promise<Blob | null>(resolve => {
        canvas.toBlob(b => resolve(b), "image/jpeg", 0.7)
      })
      if (!blob) return null

      // Upload Supabase Storage bucket bug-screenshots
      const { supabase } = await import("../../lib/supabase")
      const safeTs = Date.now()
      const safePath = `${safeTs}-${Math.random().toString(36).slice(2, 8)}.jpg`
      const { error } = await supabase.storage.from("bug-screenshots").upload(safePath, blob, {
        contentType: "image/jpeg",
        upsert: false,
      })
      if (error) {
        console.warn("[BugReport] screenshot upload failed:", error.message)
        return null
      }
      // Bucket privé : on stocke juste le path, /api/bugs/report générera une signed URL côté server si admin.
      // Pour V97.10 simple : on stocke directement le path préfixé d'un marqueur.
      return `storage://bug-screenshots/${safePath}`
    } catch (e) {
      console.warn("[BugReport] screenshot capture failed:", e instanceof Error ? e.message : String(e))
      return null
    }
  }

  const submit = async () => {
    if (description.trim().length < 5) {
      setResult({ ok: false, msg: "Description trop courte (min 5 caractères)." })
      return
    }
    setSubmitting(true)
    setResult(null)
    try {
      // V97.10 — Capture screenshot si user a coché (default ON)
      let screenshot_url: string | null = null
      let screenshotFailed = false
      if (includeScreenshot) {
        screenshot_url = await captureAndUploadScreenshot()
        screenshotFailed = screenshot_url === null
      }
      const res = await fetch("/api/bugs/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          severity,
          page_url: window.location.href,
          user_agent: navigator.userAgent.slice(0, 300),
          console_log: consoleRef.current,
          network_log: networkRef.current,
          screenshot_url,
        }),
      })
      const j = await res.json()
      if (j.ok) {
        // V97.10 — Feedback honnête : si user a coché screenshot mais ça a foiré,
        // on lui dit. Avant : "Bug signalé. Merci !" même si screenshot raté → mensonge UX.
        const msg = screenshotFailed
          ? "Bug signalé (capture d'écran indisponible — vérifie ta connexion ou décoche la case)."
          : "Bug signalé. Merci !"
        setResult({ ok: true, msg })
        setDescription("")
        setSeverity("minor")
        setAutoTriggered(false)
        setTimeout(() => { setOpen(false); setResult(null) }, screenshotFailed ? 3000 : 1800)
      } else {
        setResult({ ok: false, msg: j.error || "Échec de l'envoi." })
      }
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : String(e) })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Signaler un bug"
        title="Signaler un bug"
        style={{
          position: "fixed",
          bottom: "calc(120px + env(safe-area-inset-bottom, 0px))",
          right: 16,
          width: 44, height: 44,
          borderRadius: 999,
          background: km.white,
          border: `1px solid ${km.line}`,
          boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
          cursor: "pointer",
          zIndex: 850,
          fontSize: 18,
          fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: km.ink,
          padding: 0,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = km.beige)}
        onMouseLeave={e => (e.currentTarget.style.background = km.white)}
      >
        🐛
      </button>

      {open && (
        <div
          data-bug-modal="true"
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.55)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: km.white, borderRadius: 18, width: "min(480px, 100%)", padding: 24, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ fontFamily: "var(--font-fraunces), 'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: 0 }}>
                {autoTriggered ? "Erreur détectée" : "Signaler un bug"}
              </h3>
              <button onClick={() => { setOpen(false); setAutoTriggered(false) }} aria-label="Fermer" style={{ background: km.beige, border: `1px solid ${km.line}`, borderRadius: 999, width: 36, height: 36, cursor: "pointer", fontSize: 16, fontFamily: "inherit" }}>×</button>
            </div>

            {autoTriggered && (
              <div style={{ padding: "10px 14px", background: "#FBF6EA", border: "1px solid #EADFC6", borderRadius: 10, fontSize: 12, color: "#a16207", marginBottom: 12, lineHeight: 1.5 }}>
                Une erreur JS a été détectée automatiquement sur cette page. Vous pouvez préciser ce que vous faisiez puis envoyer.
              </div>
            )}

            <p style={{ fontSize: 12, color: km.muted, marginTop: 0, marginBottom: 14, lineHeight: 1.5 }}>
              On capture automatiquement l&apos;URL, le navigateur, et les erreurs console récentes pour faciliter le debug.
            </p>

            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: 1.2, display: "block", marginBottom: 6 }}>Description</span>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={6}
                placeholder="Décris ce que tu as fait, ce qui devrait se passer, et ce qui se passe à la place…"
                disabled={submitting}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: `1px solid ${km.line}`,
                  borderRadius: 10,
                  fontSize: 13,
                  fontFamily: "inherit",
                  resize: "vertical",
                  outline: "none",
                  color: km.ink,
                  boxSizing: "border-box",
                }}
              />
            </label>

            <label style={{ display: "block", marginBottom: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: 1.2, display: "block", marginBottom: 6 }}>Sévérité</span>
              <select value={severity} onChange={e => setSeverity(e.target.value)} disabled={submitting} style={{
                width: "100%",
                padding: "10px 12px",
                border: `1px solid ${km.line}`,
                borderRadius: 10,
                fontSize: 13,
                fontFamily: "inherit",
                background: km.white,
                color: km.ink,
                outline: "none",
                boxSizing: "border-box",
              }}>
                <option value="cosmetic">Cosmétique (mineur visuel)</option>
                <option value="minor">Mineur (gêne mais contournable)</option>
                <option value="major">Majeur (fonctionnalité cassée)</option>
                <option value="critical">Critique (bloque l&apos;usage)</option>
              </select>
            </label>

            {/* V97.10 — Toggle capture d'écran */}
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: 12, color: km.ink, marginBottom: 16, lineHeight: 1.5, padding: "10px 12px", background: km.beige, border: `1px solid ${km.line}`, borderRadius: 10 }}>
              <input
                type="checkbox"
                checked={includeScreenshot}
                onChange={e => setIncludeScreenshot(e.target.checked)}
                disabled={submitting}
                style={{ accentColor: km.ink, marginTop: 2, flexShrink: 0 }}
              />
              <span>
                <strong style={{ display: "block", marginBottom: 2 }}>Inclure une capture d&apos;écran</strong>
                <span style={{ color: km.muted, fontSize: 11 }}>Le contenu visible de la page sera capturé pour aider au debug. Décochez si vous voulez préserver des infos privées affichées.</span>
              </span>
            </label>

            {result && (
              <div style={{
                padding: "10px 14px",
                background: result.ok ? "#F0FAEE" : "#FEECEC",
                border: `1px solid ${result.ok ? "#C6E9C0" : "#F4C9C9"}`,
                borderRadius: 10,
                fontSize: 13,
                color: result.ok ? "#15803d" : "#b91c1c",
                marginBottom: 12,
              }}>
                {result.msg}
              </div>
            )}

            <button
              onClick={submit}
              disabled={submitting || description.trim().length < 5}
              style={{
                width: "100%",
                background: km.ink,
                color: km.white,
                border: "none",
                padding: "12px 20px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                cursor: submitting ? "wait" : (description.trim().length < 5 ? "not-allowed" : "pointer"),
                opacity: submitting || description.trim().length < 5 ? 0.5 : 1,
                fontFamily: "inherit",
              }}
            >
              {submitting ? (includeScreenshot ? "Capture + envoi…" : "Envoi…") : "Envoyer le signalement"}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
