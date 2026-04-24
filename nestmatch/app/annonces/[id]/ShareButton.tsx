"use client"
import { useState } from "react"

type Props = {
  title: string
  url: string
}

/**
 * Bouton "Partager" : ouvre un popover avec copier / WhatsApp / Mail / SMS.
 * Utilise l'API Web Share sur mobile quand dispo (navigator.share), fallback
 * popover desktop. Pas de dépendance externe.
 */
export default function ShareButton({ title, url }: Props) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const shareText = `${title} — ${url}`
  const emailHref = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(shareText + "\n\nVu sur KeyMatch.")}`
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`
  const smsHref = `sms:?&body=${encodeURIComponent(shareText)}`

  const handleClick = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title, text: title, url })
        return
      } catch {
        // l'user a annulé — on tombe sur le popover
      }
    }
    setOpen(v => !v)
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      // clipboard refusée (http, permissions) — fallback prompt
      window.prompt("Copiez ce lien :", url)
    }
  }

  const itemStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px 14px", borderRadius: 10,
    textDecoration: "none", color: "#111", fontSize: 14, fontWeight: 600,
    background: "white", border: "1px solid #EAE6DF", cursor: "pointer",
    fontFamily: "inherit", width: "100%", textAlign: "left",
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={handleClick}
        aria-label="Partager cette annonce"
        style={{
          background: "white",
          border: "1px solid #EAE6DF",
          borderRadius: 999,
          padding: "8px 14px",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 700,
          color: "#111",
          fontFamily: "inherit",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
        Partager
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 998, background: "transparent" }}
            aria-hidden
          />
          <div
            role="menu"
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              minWidth: 220,
              background: "white",
              borderRadius: 14,
              boxShadow: "0 8px 28px rgba(0,0,0,0.12)",
              border: "1px solid #EAE6DF",
              padding: 8,
              zIndex: 999,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <button type="button" onClick={copyLink} style={itemStyle}>
              <span aria-hidden>⧉</span>
              {copied ? "Lien copié !" : "Copier le lien"}
            </button>
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" style={itemStyle} onClick={() => setOpen(false)}>
              <span aria-hidden>●</span>
              WhatsApp
            </a>
            <a href={smsHref} style={itemStyle} onClick={() => setOpen(false)}>
              <span aria-hidden>◈</span>
              SMS
            </a>
            <a href={emailHref} style={itemStyle} onClick={() => setOpen(false)}>
              <span aria-hidden>✉</span>
              E-mail
            </a>
          </div>
        </>
      )}
    </div>
  )
}
