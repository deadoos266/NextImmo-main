"use client"

import { useState } from "react"
import { generateIcs, icsDataUrl, googleCalendarUrl, type IcsEvent } from "../../lib/icsGenerator"

/**
 * V4.4 (Paul 2026-04-28) — bouton \"Ajouter à mon agenda\" utilise dans
 * les cartes de visite confirmee (messages thread + emails).
 *
 * Comportement :
 * - Clic principal → telecharge un .ics (compatible Apple/Outlook/Samsung).
 * - Lien secondaire \"Google Calendar\" → ouvre le deep link template direct.
 *
 * Pas de detection de plateforme : on offre les 2 chemins en clair pour
 * eviter de mal deviner (un user iOS peut tres bien utiliser Google Cal).
 */
export default function AddToCalendarButton({ event }: { event: IcsEvent }) {
  const [open, setOpen] = useState(false)
  const ics = generateIcs(event)
  const downloadHref = icsDataUrl(ics)
  const gcalHref = googleCalendarUrl(event)
  const fileName = `visite-${event.uid}.ics`

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "#F7F4EF",
          border: "1px solid #EAE6DF",
          borderRadius: 999,
          padding: "6px 12px",
          fontSize: 11.5,
          fontWeight: 600,
          color: "#111",
          cursor: "pointer",
          fontFamily: "inherit",
          letterSpacing: "0.1px",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        Ajouter à mon agenda
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            aria-hidden="true"
            style={{ position: "fixed", inset: 0, zIndex: 100 }}
          />
          <div
            role="menu"
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              zIndex: 101,
              background: "#fff",
              border: "1px solid #EAE6DF",
              borderRadius: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              minWidth: 240,
              overflow: "hidden",
              fontFamily: "inherit",
            }}
          >
            <a
              href={downloadHref}
              download={fileName}
              role="menuitem"
              onClick={() => setOpen(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                fontSize: 13,
                color: "#111",
                textDecoration: "none",
                borderBottom: "1px solid #F7F4EF",
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 16 }}>📅</span>
              Apple / Outlook / Samsung (.ics)
            </a>
            <a
              href={gcalHref}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => setOpen(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                fontSize: 13,
                color: "#111",
                textDecoration: "none",
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 16 }}>🗓️</span>
              Google Calendar
            </a>
          </div>
        </>
      )}
    </div>
  )
}
