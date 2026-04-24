"use client"
import { useState } from "react"

/**
 * PartagerCard — R10.10
 *
 * Card "Partager ce bien" : copy-link + WhatsApp + Mail.
 * Simple card placée sous la card sticky info, toujours affichée.
 */
export default function PartagerCard({ url, titre }: { url: string; titre: string }) {
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback : sélection manuelle non implémentée — on ignore silencieusement
    }
  }

  const msgEncoded = encodeURIComponent(`${titre} — ${url}`)
  const whatsappHref = `https://wa.me/?text=${msgEncoded}`
  const mailHref = `mailto:?subject=${encodeURIComponent(titre)}&body=${msgEncoded}`

  const pillStyle: React.CSSProperties = {
    flex: 1,
    textAlign: "center",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #EAE6DF",
    background: "white",
    fontSize: 12,
    fontWeight: 600,
    color: "#111",
    textDecoration: "none",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "background 0.15s",
  }

  return (
    <div style={{ background: "white", borderRadius: 20, padding: 22, boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0, marginBottom: 8 }}>
        Partager
      </p>
      <h3 style={{ fontSize: 16, fontWeight: 400, fontStyle: "italic", fontFamily: "'Fraunces', 'DM Sans', serif", letterSpacing: "-0.3px", margin: 0, marginBottom: 14, color: "#111" }}>
        Envoyer à un proche
      </h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={copyLink} style={pillStyle}>
          {copied ? "✓ Copié" : "Copier le lien"}
        </button>
        <a href={whatsappHref} target="_blank" rel="noopener noreferrer" style={pillStyle}>
          WhatsApp
        </a>
        <a href={mailHref} style={pillStyle}>
          Mail
        </a>
      </div>
    </div>
  )
}
