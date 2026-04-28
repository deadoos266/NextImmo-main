"use client"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useRole } from "../providers"

/**
 * Bandeau affiché uniquement pour les admins sur toutes les pages.
 * Rappelle le mode admin et permet de switcher rapidement la vue
 * entre locataire et propriétaire pour tester les 2 flows.
 *
 * V11.10 (Paul 2026-04-28) — masqué quand on est dans un thread /messages
 * (mobile + desktop). Pattern Instagram/WhatsApp : conversation full-bleed,
 * zero chrome parasite. Listener sur 'km:thread-active' dispatch par
 * /messages/page.tsx.
 *
 * V11.14 (Paul 2026-04-28) — etend a TOUTE la route /messages (liste, vide,
 * thread) via 'km:messages-route-active' dispatch par
 * app/messages/MessagesRouteSignal.tsx (mount du layout).
 */
export default function AdminBar() {
  const { isAdmin, proprietaireActive, setProprietaireActive, mounted } = useRole()

  const [threadActive, setThreadActive] = useState(false)
  const [messagesRouteActive, setMessagesRouteActive] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined") return
    function onThread(e: Event) {
      setThreadActive((e as CustomEvent).detail?.open === true)
    }
    function onRoute(e: Event) {
      setMessagesRouteActive((e as CustomEvent).detail?.open === true)
    }
    window.addEventListener("km:thread-active", onThread)
    window.addEventListener("km:messages-route-active", onRoute)
    return () => {
      window.removeEventListener("km:thread-active", onThread)
      window.removeEventListener("km:messages-route-active", onRoute)
    }
  }, [])

  if (!mounted || !isAdmin) return null
  if (threadActive || messagesRouteActive) return null

  return (
    <div style={{
      position: "sticky",
      top: 0,
      zIndex: 1100,
      background: "#111",
      color: "white",
      padding: "6px 16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 14,
      fontSize: 12,
      fontWeight: 600,
      fontFamily: "'DM Sans', sans-serif",
      flexWrap: "wrap",
    }}>
      <span style={{ background: "#b91c1c", color: "white", padding: "2px 10px", borderRadius: 999, fontWeight: 700, letterSpacing: "0.5px" }}>ADMIN</span>

      <span style={{ opacity: 0.8 }}>Voir le site en tant que :</span>

      <div style={{ display: "inline-flex", background: "rgba(255,255,255,0.12)", borderRadius: 999, padding: 2, gap: 2 }}>
        <button
          onClick={() => setProprietaireActive(false)}
          style={{
            padding: "4px 14px",
            borderRadius: 999,
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 12,
            fontWeight: 700,
            background: !proprietaireActive ? "white" : "transparent",
            color: !proprietaireActive ? "#111" : "white",
            transition: "all 0.15s",
          }}
        >
          Locataire
        </button>
        <button
          onClick={() => setProprietaireActive(true)}
          style={{
            padding: "4px 14px",
            borderRadius: 999,
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 12,
            fontWeight: 700,
            background: proprietaireActive ? "white" : "transparent",
            color: proprietaireActive ? "#111" : "white",
            transition: "all 0.15s",
          }}
        >
          Propriétaire
        </button>
      </div>

      <Link href="/admin" style={{ color: "white", textDecoration: "none", borderBottom: "1px dotted rgba(255,255,255,0.6)", paddingBottom: 1 }}>
        Dashboard admin
      </Link>
    </div>
  )
}
