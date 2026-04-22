"use client"
import { useEffect, useRef, useState } from "react"

/**
 * Popover dédié aux recherches sauvegardées — déclenché par le lien
 * « Sauvegarder cette recherche » du header éditorial de /annonces.
 *
 * Contenu :
 *  - Input « Nom de cette recherche » + bouton « Sauvegarder »
 *  - Liste des recherches existantes : clic pour appliquer, corbeille
 *    pour supprimer
 *
 * Dimensions : 320×auto, radius 16, shadow premium.
 * Fermeture : click-outside + ESC. Focus retour au trigger.
 * Z-index : 6100 (comme FilterPopover) — au-dessus de FiltersBar (6000),
 * en-dessous de FiltersModal (7500) et Navbar (7000).
 *
 * Le trigger est un simple lien texte inline, rendu à côté.
 */

interface SavedItem {
  id: string
  name: string
  savedAt: string
}

interface Props {
  savedSearches: SavedItem[]
  onSave: (name: string) => void
  onApply: (id: string) => void
  onDelete: (id: string) => void
  // Nom auto-généré proposé (filtres actuels résumés)
  defaultName?: string
  // Label du lien cliquable (default « Sauvegarder cette recherche »)
  label?: string
}

export default function SavedSearchesPopover({
  savedSearches,
  onSave,
  onApply,
  onDelete,
  defaultName = "",
  label = "Sauvegarder cette recherche",
}: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(defaultName)
  // v5.4 : confirmation inline après save (popup reste ouvert)
  const [justSavedName, setJustSavedName] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => { setName(defaultName) }, [defaultName])

  // ESC + focus input à l'ouverture
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    // Focus input au premier rendu
    const t = window.setTimeout(() => inputRef.current?.focus(), 80)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.clearTimeout(t)
    }
  }, [open])

  // Reset confirmation à la fermeture
  useEffect(() => { if (!open) setJustSavedName(null) }, [open])

  // Auto-clear confirmation après 3s (mais popup reste ouvert)
  useEffect(() => {
    if (!justSavedName) return
    const t = window.setTimeout(() => setJustSavedName(null), 3000)
    return () => window.clearTimeout(t)
  }, [justSavedName])

  function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) return
    const saved = trimmed.slice(0, 60)
    onSave(saved)
    setJustSavedName(saved)
    setName("")
    // v5.4 : popup reste ouvert → l'user voit la confirmation "Enregistré ✓"
    // + la nouvelle recherche dans la liste en dessous. Close manuel (ESC / click-outside).
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(v => !v)}
        style={{
          background: "transparent",
          border: "none",
          color: "#666",
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          fontFamily: "inherit",
          textDecoration: "underline",
          textUnderlineOffset: 3,
          padding: "6px 4px",
        }}
      >
        {label}
      </button>

      {open && (
        <>
          {/* Click-outside overlay, capte le clic et ferme sans masquer le reste */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 6090, background: "transparent" }}
          />
          <div
            role="dialog"
            aria-label="Recherches sauvegardées"
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              left: 0,
              width: 320,
              background: "white",
              border: "1px solid #EAE6DF",
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 12px 32px rgba(0,0,0,0.10)",
              zIndex: 6100,
              fontFamily: "'DM Sans', sans-serif",
              animation: "km-saved-in 180ms ease-out",
            }}
          >
            <style>{`
              @keyframes km-saved-in {
                from { opacity: 0; transform: translateY(-4px) }
                to   { opacity: 1; transform: translateY(0) }
              }
            `}</style>

            {/* Confirmation visible après save (auto-clear 3s) */}
            {justSavedName && (
              <div style={{
                background: "#ECFDF5",
                border: "1px solid #A7F3D0",
                color: "#065F46",
                borderRadius: 10,
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                  Enregistré : {justSavedName}
                </span>
              </div>
            )}

            <p style={{ fontSize: 11, fontWeight: 600, color: "#666", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 10px" }}>
              Nom de cette recherche
            </p>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleSave() } }}
              placeholder="Ex. Paris 2-pièces meublé"
              maxLength={60}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #EAE6DF",
                borderRadius: 10,
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "inherit",
                background: "#FAFAF7",
                marginBottom: 10,
              }}
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={!name.trim()}
              style={{
                width: "100%",
                background: name.trim() ? "#111" : "#EAE6DF",
                color: name.trim() ? "white" : "#999",
                border: "none",
                borderRadius: 999,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 600,
                cursor: name.trim() ? "pointer" : "not-allowed",
                fontFamily: "inherit",
                transition: "all 150ms",
              }}
            >
              Sauvegarder la recherche actuelle
            </button>

            {savedSearches.length > 0 && (
              <>
                <div style={{ borderTop: "1px solid #EAE6DF", margin: "14px -16px 12px" }} />
                <p style={{ fontSize: 11, fontWeight: 600, color: "#666", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 10px" }}>
                  Mes recherches ({savedSearches.length})
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" }}>
                  {savedSearches.map(s => (
                    <div
                      key={s.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 10px",
                        border: "1px solid #EAE6DF",
                        borderRadius: 10,
                        background: "#FAFAF7",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => { onApply(s.id); setOpen(false) }}
                        style={{
                          flex: 1,
                          textAlign: "left",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          padding: 0,
                          minWidth: 0,
                        }}
                      >
                        <p style={{ fontSize: 13, fontWeight: 600, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.name}
                        </p>
                        <p style={{ fontSize: 10, color: "#9ca3af", margin: "2px 0 0" }}>
                          {new Date(s.savedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(s.id)}
                        aria-label={`Supprimer ${s.name}`}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#6B6B6B",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          padding: 6,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 8,
                          transition: "background 0.15s, color 0.15s",
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = "#fee2e2"
                          e.currentTarget.style.color = "#dc2626"
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = "transparent"
                          e.currentTarget.style.color = "#6B6B6B"
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                          <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
