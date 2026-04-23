"use client"
import Link from "next/link"
import type { BailStep, BailStepKey } from "../../../lib/bailTimeline"

const CTA_LABEL: Record<BailStepKey, string> = {
  acceptee: "Continuer →",
  bail: "Générer le bail →",
  edl: "Faire l'EDL →",
  loyer: "Gérer →",
}

/**
 * Timeline des étapes du bail — calque handoff editorial.
 * Card blanche hairline beige, titre Fraunces italic, pills uppercase,
 * pastilles de progression verts doux F0FAEE/C6E9C0, ligne hairline EAE6DF.
 */
export default function BailTimeline({ steps }: { steps: BailStep[] }) {
  const doneCount = steps.filter(s => s.done).length
  const total = steps.length
  const allDone = doneCount === total

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500&display=swap');`}</style>
      <section
        aria-label="Progression de la location"
        style={{ background: "#fff", border: "1px solid #EAE6DF", borderRadius: 20, padding: 26, fontFamily: "'DM Sans', sans-serif", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
          <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, letterSpacing: "-0.3px", color: "#111", margin: 0 }}>Votre location pas à pas</h2>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: allDone ? "#15803d" : "#8a8477",
              background: allDone ? "#F0FAEE" : "#F7F4EF",
              border: `1px solid ${allDone ? "#C6E9C0" : "#EAE6DF"}`,
              padding: "4px 12px",
              borderRadius: 999,
              textTransform: "uppercase",
              letterSpacing: "1.2px",
            }}
          >
            {doneCount}/{total} étapes
          </span>
        </div>

        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column" }}>
          {steps.map((s, i) => {
            const last = i === steps.length - 1
            return (
              <li key={s.key} style={{ display: "flex", gap: 14, position: "relative" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                  <div
                    aria-hidden
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: s.done ? "#DCF5E4" : "#fff",
                      border: `1px solid ${s.done ? "#C6E9C0" : "#EAE6DF"}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: s.done ? "#15803d" : "#8a8477",
                      fontWeight: 600,
                      fontSize: 12,
                      flexShrink: 0,
                    }}
                  >
                    {s.done ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : i + 1}
                  </div>
                  {!last && (
                    <div
                      aria-hidden
                      style={{
                        width: 1,
                        flex: 1,
                        background: s.done ? "#C6E9C0" : "#EAE6DF",
                        minHeight: 36,
                      }}
                    />
                  )}
                </div>

                <div style={{ flex: 1, paddingBottom: last ? 0 : 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: s.done ? "#111" : "#111", margin: 0, letterSpacing: "-0.2px" }}>
                      {s.label}
                    </p>
                    {s.date && (
                      <span style={{ fontSize: 11, color: "#8a8477" }}>
                        {new Date(s.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 13, color: "#8a8477", margin: "4px 0 0", lineHeight: 1.55 }}>
                    {s.description}
                  </p>
                  {!s.done && s.href && (
                    <Link
                      href={s.href}
                      style={{
                        display: "inline-block",
                        marginTop: 10,
                        background: "#111",
                        color: "#fff",
                        padding: "8px 16px",
                        borderRadius: 999,
                        textDecoration: "none",
                        fontSize: 11,
                        fontWeight: 600,
                        fontFamily: "inherit",
                        textTransform: "uppercase",
                        letterSpacing: "0.3px",
                      }}
                    >
                      {CTA_LABEL[s.key]}
                    </Link>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </section>
    </>
  )
}
