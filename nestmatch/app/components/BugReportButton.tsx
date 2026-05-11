"use client"
import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { km } from "./ui/km"

/**
 * V84.8 — BugReportButton : widget flottant pour signaler un bug.
 *
 * Accessible à tous les users authentifiés (admin + locataire + proprio).
 * Pas affiché sur /admin/* (admin a /admin/bugs pour gérer).
 *
 * Position : bottom-right au-dessus du cookie banner et au-dessus du
 * BottomNavMobile (sur mobile authenticated). zIndex 850 (sous Navbar 10000).
 *
 * Form modale :
 *  - Description (textarea, required, min 5 chars)
 *  - Sévérité (select : critical / major / minor / cosmetic)
 *  - Submit → POST /api/bugs/report avec contexte auto :
 *    • page_url, user_agent
 *    • console_log (capture des 50 dernières console.error/warn)
 *    • network_log (capture des 20 derniers 4xx/5xx via PerformanceObserver)
 */

const CONSOLE_CAPTURE_MAX = 50
const NETWORK_CAPTURE_MAX = 20

type ConsoleEntry = { level: string; text: string; ts: number }
type NetworkEntry = { url: string; status: number; method: string }

export default function BugReportButton() {
  const pathname = usePathname() || "/"
  const { status } = useSession()
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState("")
  const [severity, setSeverity] = useState("minor")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const consoleRef = useRef<ConsoleEntry[]>([])
  const networkRef = useRef<NetworkEntry[]>([])

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

  // Capture network 4xx/5xx via PerformanceObserver
  useEffect(() => {
    if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") return
    // Patch fetch pour capturer status
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

  // Cache si pas authentifié, ou sur /admin/*
  if (status !== "authenticated") return null
  if (pathname.startsWith("/admin")) return null

  const submit = async () => {
    if (description.trim().length < 5) {
      setResult({ ok: false, msg: "Description trop courte (min 5 caractères)." })
      return
    }
    setSubmitting(true)
    setResult(null)
    try {
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
        }),
      })
      const j = await res.json()
      if (j.ok) {
        setResult({ ok: true, msg: "Bug signalé. Merci !" })
        setDescription("")
        setSeverity("minor")
        setTimeout(() => { setOpen(false); setResult(null) }, 1800)
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
          bottom: "calc(120px + env(safe-area-inset-bottom, 0px))",  // au-dessus du cookie pill + BottomNavMobile
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
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.55)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: km.white, borderRadius: 18, width: "min(480px, 100%)", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ fontFamily: "var(--font-fraunces), 'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: 0 }}>
                Signaler un bug
              </h3>
              <button onClick={() => setOpen(false)} aria-label="Fermer" style={{ background: km.beige, border: `1px solid ${km.line}`, borderRadius: 999, width: 36, height: 36, cursor: "pointer", fontSize: 16, fontFamily: "inherit" }}>×</button>
            </div>

            <p style={{ fontSize: 12, color: km.muted, marginTop: 0, marginBottom: 14, lineHeight: 1.5 }}>
              On capture automatiquement votre URL actuelle, navigateur, et les erreurs console récentes pour faciliter le debug.
            </p>

            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: 1.2, display: "block", marginBottom: 6 }}>Description</span>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={5}
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
                }}
              />
            </label>

            <label style={{ display: "block", marginBottom: 18 }}>
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
              }}>
                <option value="cosmetic">Cosmétique (mineur visuel)</option>
                <option value="minor">Mineur (gêne mais contournable)</option>
                <option value="major">Majeur (fonctionnalité cassée)</option>
                <option value="critical">Critique (bloque l&apos;usage)</option>
              </select>
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
              {submitting ? "Envoi…" : "Envoyer le signalement"}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
