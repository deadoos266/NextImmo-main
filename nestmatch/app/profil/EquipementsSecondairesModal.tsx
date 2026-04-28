"use client"

// V13 (Paul 2026-04-28) — popup côté locataire pour cocher les équipements
// secondaires souhaités. Reuse du catalogue lib/equipements.ts (déjà
// utilisé côté proprio). Pas de tri-state — checkbox simple : "souhaité"
// vs "indifférent". Le matching ajoute +5 pts par match (cap 30).

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { EQUIP_EXTRAS_GROUPS, type EquipementKey } from "../../lib/equipements"
import { T } from "./dossierTheme"

interface Props {
  open: boolean
  initial: EquipementKey[]
  onClose: () => void
  onValidate: (next: EquipementKey[]) => void | Promise<void>
}

export default function EquipementsSecondairesModal({ open, initial, onClose, onValidate }: Props) {
  const [mounted, setMounted] = useState(false)
  const [selected, setSelected] = useState<Set<EquipementKey>>(new Set(initial))
  const [saving, setSaving] = useState(false)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { setSelected(new Set(initial)) }, [initial, open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!mounted || !open) return null

  function toggle(k: EquipementKey) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  function clearAll() {
    setSelected(new Set())
  }

  async function valider() {
    if (saving) return
    setSaving(true)
    try {
      await onValidate(Array.from(selected))
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choix des équipements secondaires"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 5500,
        background: "rgba(17, 17, 17, 0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: T.white,
          borderRadius: 24,
          maxWidth: 580, width: "100%",
          maxHeight: "85vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 24px 48px rgba(0,0,0,0.25)",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ padding: "22px 26px 14px", borderBottom: `1px solid ${T.hairline}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: T.soft, textTransform: "uppercase", letterSpacing: "1.4px", margin: 0 }}>
                Plus d&apos;équipements
              </p>
              <h2 style={{
                fontFamily: "'Fraunces', Georgia, serif",
                fontStyle: "italic", fontWeight: 400,
                fontSize: 22, margin: "4px 0 0", color: T.ink,
                letterSpacing: "-0.3px",
              }}>
                Mes équipements souhaités
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Fermer"
              style={{
                background: "transparent", border: "none", cursor: "pointer",
                fontSize: 22, color: T.soft, padding: 4, lineHeight: 1,
              }}
            >×</button>
          </div>
          <p style={{ fontSize: 12.5, color: T.meta, margin: "10px 0 0", lineHeight: 1.5 }}>
            Cochez ce qui compte pour vous. Bonus de matching +5 par équipement présent dans l&apos;annonce (cap 30 pts).
            {selected.size > 0 && <> <strong style={{ color: T.ink }}>{selected.size} sélectionné{selected.size > 1 ? "s" : ""}</strong>.</>}
          </p>
        </div>

        {/* Body — groupes */}
        <div style={{ overflowY: "auto", padding: "14px 26px 22px", flex: 1 }}>
          {EQUIP_EXTRAS_GROUPS.map((groupe, gi) => (
            <div key={groupe.title} style={{ marginTop: gi === 0 ? 8 : 22 }}>
              <h3 style={{
                fontSize: 11, fontWeight: 700, color: T.soft,
                textTransform: "uppercase", letterSpacing: "1.4px",
                margin: "0 0 12px",
              }}>
                {groupe.title}
              </h3>
              <ul style={{
                listStyle: "none", padding: 0, margin: 0,
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
              }}>
                {groupe.items.map(item => {
                  const on = selected.has(item.k)
                  return (
                    <li key={item.k}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => toggle(item.k)}
                        style={{
                          width: "100%",
                          minHeight: 44,
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: `1px solid ${on ? T.ink : T.line}`,
                          background: on ? T.ink : T.white,
                          color: on ? T.white : T.ink,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          fontSize: 13,
                          fontWeight: 500,
                          textAlign: "left" as const,
                          transition: "all 0.15s",
                          WebkitTapHighlightColor: "transparent",
                          touchAction: "manipulation",
                        }}
                      >
                        <span aria-hidden style={{
                          width: 18, height: 18, borderRadius: 5,
                          background: on ? "#fff" : T.mutedBg,
                          border: `1px solid ${on ? "#fff" : T.line}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0,
                        }}>
                          {on && (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.ink} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>{item.label}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer — actions */}
        <div style={{
          padding: "14px 22px calc(18px + env(safe-area-inset-bottom, 0px))",
          borderTop: `1px solid ${T.hairline}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, flexWrap: "wrap",
        }}>
          {selected.size > 0 ? (
            <button
              type="button"
              onClick={clearAll}
              style={{
                background: "transparent",
                border: "none",
                color: T.soft,
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12.5,
                fontWeight: 600,
                textDecoration: "underline",
                textUnderlineOffset: 3,
                padding: "8px 4px",
              }}
            >
              Tout désélectionner
            </button>
          ) : <span aria-hidden />}
          <button
            type="button"
            onClick={valider}
            disabled={saving}
            style={{
              background: T.ink,
              color: T.white,
              border: "none",
              borderRadius: 999,
              minHeight: 44,
              padding: "12px 26px",
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.2px",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
              WebkitTapHighlightColor: "transparent",
              touchAction: "manipulation",
            }}
          >
            {saving ? "Enregistrement…" : `Valider${selected.size > 0 ? ` (${selected.size})` : ""}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
