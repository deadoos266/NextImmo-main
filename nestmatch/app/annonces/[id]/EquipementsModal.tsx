"use client"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { EQUIP_EXTRAS_GROUPS, type EquipementKey } from "../../../lib/equipements"

/**
 * Popup détail des équipements de l'annonce, ouverte au clic du bouton
 * "Voir tous les équipements" sur la fiche `/annonces/[id]`.
 *
 * Affiche TOUS les équipements groupés (Électroménager / Confort / Vue)
 * avec une coche verte pour les présents, une croix rouge pour les absents.
 * Les groupes sans aucun équipement actif sont masqués pour ne pas surcharger.
 *
 * UX : portal au document.body pour échapper au stacking context du
 * sidebar fiche annonce, fermeture par clic backdrop / Escape / bouton X.
 */
export default function EquipementsModal({
  open,
  onClose,
  extras,
}: {
  open: boolean
  onClose: () => void
  extras: Record<string, unknown> | null | undefined
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

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

  const dict = (extras || {}) as Record<string, unknown>

  // Garder uniquement les groupes qui ont au moins 1 équipement actif.
  const groupesAvecActifs = EQUIP_EXTRAS_GROUPS.map(g => ({
    ...g,
    actifs: g.items.filter(i => dict[i.k] === true),
    inactifs: g.items.filter(i => dict[i.k] !== true),
  })).filter(g => g.actifs.length > 0 || g.inactifs.length > 0)

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Équipements détaillés"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 5000,
        background: "rgba(17, 17, 17, 0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: 20,
          maxWidth: 560, width: "100%",
          maxHeight: "85vh",
          display: "flex", flexDirection: "column",
          boxShadow: "0 24px 48px rgba(0,0,0,0.25)",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px 12px" }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0 }}>
            Équipements
          </p>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              fontSize: 22, color: "#8a8477", padding: 4, lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ overflowY: "auto", padding: "0 22px 22px" }}>
          {groupesAvecActifs.length === 0 ? (
            <p style={{ fontSize: 14, color: "#8a8477", textAlign: "center", padding: "24px 0" }}>
              Le propriétaire n&apos;a pas renseigné d&apos;équipements.
            </p>
          ) : groupesAvecActifs.map((groupe, gi) => (
            <div key={groupe.title} style={{ marginTop: gi === 0 ? 4 : 18 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: "0 0 10px" }}>
                {groupe.title}
              </h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[...groupe.actifs, ...groupe.inactifs].map(item => {
                  const present = dict[item.k] === true
                  return (
                    <li key={item.k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: present ? "#111" : "#a8a39a" }}>
                      <span aria-hidden style={{
                        width: 18, height: 18, borderRadius: "50%",
                        background: present ? "#F0FAEE" : "#F5F1EC",
                        color: present ? "#15803d" : "#c8c2b6",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}>
                        {present ? (
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        )}
                      </span>
                      <span style={{ textDecoration: present ? "none" : "line-through" }}>{item.label}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// Re-export pour usage externe sans devoir relire la lib
export { EQUIP_EXTRAS_GROUPS }
export type { EquipementKey }
