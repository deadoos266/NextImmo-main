"use client"
import { useState } from "react"

export default function PhotoCarousel({ photos }: { photos: string[] }) {
  const [idx, setIdx] = useState(0)

  if (!photos || photos.length === 0) return (
    <div style={{ height: 380, background: "linear-gradient(135deg, #e5e7eb, #d1d5db)", borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 28 }}>
      <span style={{ color: "#9ca3af", fontSize: 16 }}>Aucune photo disponible</span>
    </div>
  )

  return (
    <div
      style={{ position: "relative", height: 380, borderRadius: 20, overflow: "hidden", marginBottom: 28, background: "#000" }}
      onMouseEnter={e => e.currentTarget.querySelectorAll<HTMLButtonElement>(".pnav").forEach(b => (b.style.opacity = "1"))}
      onMouseLeave={e => e.currentTarget.querySelectorAll<HTMLButtonElement>(".pnav").forEach(b => (b.style.opacity = "0"))}
    >
      <img
        src={photos[idx]}
        alt={`Photo ${idx + 1}`}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />

      {photos.length > 1 && (
        <>
          <button
            className="pnav"
            onClick={() => setIdx(i => (i - 1 + photos.length) % photos.length)}
            style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.9)", border: "none", borderRadius: "50%", width: 40, height: 40, cursor: "pointer", fontSize: 20, fontWeight: 700, opacity: 0, transition: "opacity 0.2s", display: "flex", alignItems: "center", justifyContent: "center" }}>
            ‹
          </button>
          <button
            className="pnav"
            onClick={() => setIdx(i => (i + 1) % photos.length)}
            style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.9)", border: "none", borderRadius: "50%", width: 40, height: 40, cursor: "pointer", fontSize: 20, fontWeight: 700, opacity: 0, transition: "opacity 0.2s", display: "flex", alignItems: "center", justifyContent: "center" }}>
            ›
          </button>

          {/* Dots */}
          <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 6 }}>
            {photos.map((_, i) => (
              <div key={i} onClick={() => setIdx(i)}
                style={{ width: i === idx ? 20 : 7, height: 7, borderRadius: 999, background: i === idx ? "white" : "rgba(255,255,255,0.5)", cursor: "pointer", transition: "all 0.2s" }} />
            ))}
          </div>

          {/* Compteur */}
          <span style={{ position: "absolute", bottom: 16, right: 16, background: "rgba(0,0,0,0.5)", color: "white", fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 999 }}>
            {idx + 1} / {photos.length}
          </span>
        </>
      )}
    </div>
  )
}
