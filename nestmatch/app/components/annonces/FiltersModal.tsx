"use client"
import { useEffect, useRef, type ReactNode } from "react"

/**
 * Modal plein écran pour l'ensemble des filtres avancés de /annonces.
 *
 * Architecture :
 *  - Overlay rgba(0,0,0,0.5), z-index 7500 (au-dessus de Navbar 7000).
 *  - Desktop : panneau centré max-width 720, max-height 85vh, radius 20.
 *  - Mobile  : panneau plein écran, slide-up 320ms.
 *  - Header sticky (72px) avec titre + bouton fermer + compteur live.
 *  - Body scrollable, 7 sections espacées 32px.
 *  - Footer sticky (80px) avec reset + CTA « Voir les N résultats ».
 *
 * Interaction live : chaque changement met à jour immédiatement l'état
 * parent — le compteur du footer reflète le nombre d'annonces après filtre
 * en temps réel. Le bouton « Voir les N » ferme simplement la modal, les
 * filtres sont déjà appliqués (pattern Airbnb).
 *
 * Accessibilité : role dialog + aria-modal, ESC ferme, body overflow hidden
 * pendant modal open, focus trap léger sur la première action focusable.
 */

type MeubleTri = "oui" | "non" | null
type AnimauxChip = "oui" | "non" | null

export interface FiltersModalProps {
  open: boolean
  onClose: () => void

  // Compteur live
  resultCount: number

  // Recherche mot-clé (remonté depuis AnnoncesClient, persist dans URL n/a)
  motCle: string
  setMotCle: (v: string) => void

  // Pièces (miroir popover desktop, présent aussi modal pour mobile)
  piecesMin: number
  setPiecesMin: (n: number) => void

  // Surface
  surfaceMin: string
  setSurfaceMin: (v: string) => void
  surfaceMax: string
  setSurfaceMax: (v: string) => void

  // Type (meublé tri-state)
  filtreMeubleTri: MeubleTri
  setFiltreMeubleTri: (v: MeubleTri) => void

  // Compatibilité (masqué si proprio ou si profil null)
  showScoreMin: boolean
  scoreMin: number
  setScoreMin: (n: number) => void

  // Équipements
  filtreParking: boolean
  setFiltreParking: (v: boolean) => void
  filtreBalcon: boolean
  setFiltreBalcon: (v: boolean) => void
  filtreTerrasse: boolean
  setFiltreTerrasse: (v: boolean) => void
  filtreJardin: boolean
  setFiltreJardin: (v: boolean) => void
  filtreCave: boolean
  setFiltreCave: (v: boolean) => void
  filtreFibre: boolean
  setFiltreFibre: (v: boolean) => void
  filtreAscenseur: boolean
  setFiltreAscenseur: (v: boolean) => void
  dispoImmediate: boolean
  setDispoImmediate: (v: boolean) => void

  // Animaux tri-state + hard-lock info
  filtreAnimauxChip: AnimauxChip
  setFiltreAnimauxChip: (v: AnimauxChip) => void
  filtreAnimauxLock: boolean // profil.animaux=true
  animauxOverride: boolean
  setAnimauxOverride: (v: boolean) => void

  // DPE max
  filtreDpeMax: string
  setFiltreDpeMax: (v: string) => void

  // Recherches sauvegardées (optionnel)
  savedSearches?: Array<{ id: string; name: string; savedAt: string }>
  onApplySaved?: (id: string) => void
  onDeleteSaved?: (id: string) => void

  // Reset global
  onResetAll: () => void

  // Mobile detection (responsive)
  isMobile: boolean
}

const eyebrow: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#666",
  textTransform: "uppercase",
  letterSpacing: "1.8px",
  margin: "0 0 14px",
}

const sectionBox: React.CSSProperties = {
  marginBottom: 32,
}

function ChipToggle({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        background: active ? "#111" : "white",
        color: active ? "white" : "#666",
        border: `1px solid ${active ? "#111" : "#EAE6DF"}`,
        borderRadius: 999,
        padding: "8px 16px",
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "all 150ms ease",
      }}
    >
      {children}
    </button>
  )
}

export default function FiltersModal(props: FiltersModalProps) {
  const {
    open,
    onClose,
    resultCount,
    motCle,
    setMotCle,
    piecesMin,
    setPiecesMin,
    surfaceMin,
    setSurfaceMin,
    surfaceMax,
    setSurfaceMax,
    filtreMeubleTri,
    setFiltreMeubleTri,
    showScoreMin,
    scoreMin,
    setScoreMin,
    filtreParking,
    setFiltreParking,
    filtreBalcon,
    setFiltreBalcon,
    filtreTerrasse,
    setFiltreTerrasse,
    filtreJardin,
    setFiltreJardin,
    filtreCave,
    setFiltreCave,
    filtreFibre,
    setFiltreFibre,
    filtreAscenseur,
    setFiltreAscenseur,
    dispoImmediate,
    setDispoImmediate,
    filtreAnimauxChip,
    setFiltreAnimauxChip,
    filtreAnimauxLock,
    animauxOverride,
    setAnimauxOverride,
    filtreDpeMax,
    setFiltreDpeMax,
    savedSearches,
    onApplySaved,
    onDeleteSaved,
    onResetAll,
    isMobile,
  } = props

  const closeBtnRef = useRef<HTMLButtonElement | null>(null)

  // ESC + focus management + body scroll lock
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    // Focus the close button au premier rendu (pattern accessible, skip les champs)
    closeBtnRef.current?.focus()
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  const DPE: Array<{ letter: string; color: string }> = [
    { letter: "A", color: "#16a34a" },
    { letter: "B", color: "#65a30d" },
    { letter: "C", color: "#eab308" },
    { letter: "D", color: "#f59e0b" },
    { letter: "E", color: "#ea580c" },
    { letter: "F", color: "#dc2626" },
    { letter: "G", color: "#7f1d1d" },
  ]
  const dpeMaxIdx = filtreDpeMax ? DPE.findIndex(d => d.letter === filtreDpeMax) : -1

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 7500,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: isMobile ? "stretch" : "center",
        justifyContent: "center",
        animation: "km-fade 200ms ease-out",
      }}
    >
      <style>{`
        @keyframes km-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes km-slide-up { from { transform: translateY(40px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes km-pop-in { from { transform: scale(0.96); opacity: 0 } to { transform: scale(1); opacity: 1 } }
      `}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="km-filters-title"
        onClick={e => e.stopPropagation()}
        style={{
          background: "white",
          width: isMobile ? "100%" : "min(720px, 100%)",
          maxHeight: isMobile ? "100vh" : "85vh",
          height: isMobile ? "100vh" : "auto",
          borderRadius: isMobile ? 0 : 20,
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          fontFamily: "'DM Sans', sans-serif",
          animation: isMobile ? "km-slide-up 320ms ease-out" : "km-pop-in 200ms ease-out",
        }}
      >
        {/* Header sticky */}
        <div
          style={{
            flexShrink: 0,
            height: 72,
            padding: "0 24px",
            borderBottom: "1px solid #EAE6DF",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            background: "white",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2 id="km-filters-title" style={{ fontSize: 24, fontWeight: 500, margin: 0, color: "#111" }}>
              Filtres
            </h2>
            <p style={{ fontSize: 13, color: "#666", margin: "2px 0 0" }}>
              {resultCount} résultat{resultCount > 1 ? "s" : ""} correspondant{resultCount > 1 ? "s" : ""}
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Fermer les filtres"
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "inherit",
              color: "#111",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#F7F4EF")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: isMobile ? 24 : 32,
          }}
        >
          {/* Section 0 — Recherche mot-clé (header modal selon validation Q2) */}
          <div style={sectionBox}>
            <p style={eyebrow}>Recherche</p>
            <input
              type="search"
              value={motCle}
              onChange={e => setMotCle(e.target.value)}
              placeholder="Mot-clé, quartier, titre..."
              style={{
                width: "100%",
                padding: "12px 14px",
                border: "1px solid #EAE6DF",
                borderRadius: 12,
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "inherit",
                background: "#FAFAF7",
              }}
            />
          </div>

          {/* Section 1 — Pièces (parité avec popover desktop pour mobile) */}
          <div style={sectionBox}>
            <p style={eyebrow}>Pièces minimum</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[0, 1, 2, 3, 4, 5].map(n => (
                <ChipToggle key={n} active={piecesMin === n} onClick={() => setPiecesMin(n)}>
                  {n === 0 ? "Tous" : `${n}+`}
                </ChipToggle>
              ))}
            </div>
          </div>

          {/* Section 2 — Surface */}
          <div style={sectionBox}>
            <p style={eyebrow}>Surface</p>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <label style={{ flex: 1 }}>
                <span style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 4 }}>Min (m²)</span>
                <input
                  type="number"
                  min={0}
                  value={surfaceMin}
                  onChange={e => setSurfaceMin(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #EAE6DF",
                    borderRadius: 12,
                    fontSize: 14,
                    outline: "none",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                    background: "#FAFAF7",
                  }}
                />
              </label>
              <span style={{ color: "#ccc", marginTop: 18 }}>—</span>
              <label style={{ flex: 1 }}>
                <span style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 4 }}>Max (m²)</span>
                <input
                  type="number"
                  min={0}
                  value={surfaceMax}
                  onChange={e => setSurfaceMax(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #EAE6DF",
                    borderRadius: 12,
                    fontSize: 14,
                    outline: "none",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                    background: "#FAFAF7",
                  }}
                />
              </label>
            </div>
          </div>

          {/* Section 3 — Type (meublé tri-state) */}
          <div style={sectionBox}>
            <p style={eyebrow}>Type de bien</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <ChipToggle active={filtreMeubleTri === "oui"} onClick={() => setFiltreMeubleTri(filtreMeubleTri === "oui" ? null : "oui")}>
                Meublé
              </ChipToggle>
              <ChipToggle active={filtreMeubleTri === "non"} onClick={() => setFiltreMeubleTri(filtreMeubleTri === "non" ? null : "non")}>
                Vide
              </ChipToggle>
              <ChipToggle active={filtreMeubleTri === null} onClick={() => setFiltreMeubleTri(null)}>
                Indifférent
              </ChipToggle>
            </div>
          </div>

          {/* Section 4 — Compatibilité (masqué si proprio/pas profil) */}
          {showScoreMin && (
            <div style={sectionBox}>
              <p style={eyebrow}>Compatibilité minimum</p>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                <input
                  type="range"
                  min={0}
                  max={90}
                  step={10}
                  value={scoreMin}
                  onChange={e => setScoreMin(Number(e.target.value))}
                  aria-label="Compatibilité minimum"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={scoreMin}
                  style={{ flex: 1, accentColor: "#111" }}
                />
                <span style={{ fontSize: 14, fontWeight: 600, color: "#111", minWidth: 56, textAlign: "right" }}>
                  {scoreMin > 0 ? `≥ ${scoreMin}%` : "Tous"}
                </span>
              </div>
              <p style={{ fontSize: 12, color: "#888", fontStyle: "italic", margin: 0 }}>
                Les annonces en dessous de ce seuil ne s'affichent pas.
              </p>
            </div>
          )}

          {/* Section 5 — Équipements */}
          <div style={sectionBox}>
            <p style={eyebrow}>Équipements</p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                gap: 10,
              }}
            >
              <ChipToggle active={dispoImmediate} onClick={() => setDispoImmediate(!dispoImmediate)}>Dispo maintenant</ChipToggle>
              <ChipToggle active={filtreParking} onClick={() => setFiltreParking(!filtreParking)}>Parking</ChipToggle>
              <ChipToggle active={filtreBalcon} onClick={() => setFiltreBalcon(!filtreBalcon)}>Balcon</ChipToggle>
              <ChipToggle active={filtreTerrasse} onClick={() => setFiltreTerrasse(!filtreTerrasse)}>Terrasse</ChipToggle>
              <ChipToggle active={filtreJardin} onClick={() => setFiltreJardin(!filtreJardin)}>Jardin</ChipToggle>
              <ChipToggle active={filtreCave} onClick={() => setFiltreCave(!filtreCave)}>Cave</ChipToggle>
              <ChipToggle active={filtreFibre} onClick={() => setFiltreFibre(!filtreFibre)}>Fibre</ChipToggle>
              <ChipToggle active={filtreAscenseur} onClick={() => setFiltreAscenseur(!filtreAscenseur)}>Ascenseur</ChipToggle>
            </div>
          </div>

          {/* Section 6 — Animaux */}
          <div style={sectionBox}>
            <p style={eyebrow}>Animaux</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <ChipToggle active={filtreAnimauxChip === "oui"} onClick={() => setFiltreAnimauxChip(filtreAnimauxChip === "oui" ? null : "oui")}>
                Oui
              </ChipToggle>
              <ChipToggle active={filtreAnimauxChip === "non"} onClick={() => setFiltreAnimauxChip(filtreAnimauxChip === "non" ? null : "non")}>
                Non
              </ChipToggle>
              <ChipToggle active={filtreAnimauxChip === null} onClick={() => setFiltreAnimauxChip(null)}>
                Indifférent
              </ChipToggle>
            </div>
            {filtreAnimauxLock && filtreAnimauxChip === null && (
              <div style={{ marginTop: 10 }}>
                <p style={{ fontSize: 12, color: "#666", fontStyle: "italic", margin: 0 }}>
                  Votre profil indique que vous avez un animal — les annonces refusant les animaux sont masquées
                  automatiquement (hard-lock).
                </p>
                <button
                  type="button"
                  onClick={() => setAnimauxOverride(!animauxOverride)}
                  style={{
                    marginTop: 8,
                    background: animauxOverride ? "#F1EEE8" : "white",
                    color: "#92400e",
                    border: "1px solid #fde68a",
                    borderRadius: 999,
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {animauxOverride ? "Hard-lock désactivé — réactiver" : "Voir toutes les annonces (session)"}
                </button>
              </div>
            )}
          </div>

          {/* Section 7 — DPE maximum */}
          <div style={sectionBox}>
            <p style={eyebrow}>Performance énergétique — max</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {DPE.map((d, i) => {
                const active = filtreDpeMax !== "" && i <= dpeMaxIdx
                return (
                  <button
                    key={d.letter}
                    type="button"
                    onClick={() => setFiltreDpeMax(filtreDpeMax === d.letter ? "" : d.letter)}
                    aria-pressed={active}
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 10,
                      border: active ? `2px solid ${d.color}` : "1px solid #EAE6DF",
                      background: active ? d.color : "white",
                      color: active ? "white" : "#666",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "all 150ms",
                    }}
                  >
                    {d.letter}
                  </button>
                )
              })}
              {filtreDpeMax && (
                <button
                  type="button"
                  onClick={() => setFiltreDpeMax("")}
                  style={{
                    marginLeft: 8,
                    background: "transparent",
                    border: "none",
                    color: "#6B6B6B",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textDecoration: "underline",
                  }}
                >
                  Effacer
                </button>
              )}
            </div>
            <p style={{ fontSize: 12, color: "#888", fontStyle: "italic", margin: "10px 0 0" }}>
              Sélectionnez la classe maximum tolérée (ex. C → affiche A, B, C).
            </p>
          </div>

          {/* Section 8 — Mes recherches (si connecté + au moins une) */}
          {savedSearches && savedSearches.length > 0 && (
            <div style={sectionBox}>
              <p style={eyebrow}>Mes recherches sauvegardées</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {savedSearches.map(s => (
                  <div
                    key={s.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      border: "1px solid #EAE6DF",
                      borderRadius: 12,
                      background: "#FAFAF7",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onApplySaved?.(s.id)}
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
                      <p style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: 0 }}>{s.name}</p>
                      <p style={{ fontSize: 11, color: "#9ca3af", margin: "2px 0 0" }}>
                        {new Date(s.savedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSaved?.(s.id)}
                      aria-label="Supprimer cette recherche"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#dc2626",
                        fontSize: 16,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        padding: 6,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer sticky */}
        <div
          style={{
            flexShrink: 0,
            height: 80,
            padding: "0 24px",
            background: "white",
            borderTop: "1px solid #EAE6DF",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={onResetAll}
            style={{
              background: "transparent",
              color: "#111",
              border: "none",
              padding: "8px 4px",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
              textDecoration: "underline",
              textDecorationThickness: "1px",
              textUnderlineOffset: 3,
            }}
          >
            Tout réinitialiser
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "#111",
              color: "white",
              border: "none",
              borderRadius: 999,
              padding: "14px 28px",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              minWidth: 220,
            }}
          >
            Voir les {resultCount} résultat{resultCount > 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  )
}
