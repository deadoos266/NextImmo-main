"use client"
import Link from "next/link"
import type { BailStep, BailStepKey } from "../../../lib/bailTimeline"

const CTA_LABEL: Record<BailStepKey, string> = {
  acceptee: "Continuer →",
  bail: "Générer le bail →",
  edl: "Faire l'EDL →",
  loyer: "Gérer →",
}

export default function BailTimeline({ steps }: { steps: BailStep[] }) {
  const doneCount = steps.filter(s => s.done).length
  const total = steps.length

  return (
    <section
      aria-label="Progression de la location"
      style={{ background: "white", borderRadius: 20, padding: 24, fontFamily: "'DM Sans', sans-serif" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>Votre location pas à pas</h2>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: doneCount === total ? "#16a34a" : "#6b7280",
            background: doneCount === total ? "#dcfce7" : "#f3f4f6",
            padding: "3px 10px",
            borderRadius: 999,
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
                    background: s.done ? "#16a34a" : "white",
                    border: `2px solid ${s.done ? "#16a34a" : "#e5e7eb"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: s.done ? "white" : "#9ca3af",
                    fontWeight: 800,
                    fontSize: 13,
                    flexShrink: 0,
                  }}
                >
                  {s.done ? "✓" : i + 1}
                </div>
                {!last && (
                  <div
                    aria-hidden
                    style={{
                      width: 2,
                      flex: 1,
                      background: s.done ? "#16a34a" : "#e5e7eb",
                      minHeight: 36,
                    }}
                  />
                )}
              </div>

              <div style={{ flex: 1, paddingBottom: last ? 0 : 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: s.done ? "#111" : "#374151", margin: 0 }}>
                    {s.label}
                  </p>
                  {s.date && (
                    <span style={{ fontSize: 11, color: "#9ca3af" }}>
                      {new Date(s.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0", lineHeight: 1.5 }}>
                  {s.description}
                </p>
                {!s.done && s.href && (
                  <Link
                    href={s.href}
                    style={{
                      display: "inline-block",
                      marginTop: 8,
                      background: "#111",
                      color: "white",
                      padding: "7px 14px",
                      borderRadius: 999,
                      textDecoration: "none",
                      fontSize: 12,
                      fontWeight: 700,
                      fontFamily: "inherit",
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
  )
}
