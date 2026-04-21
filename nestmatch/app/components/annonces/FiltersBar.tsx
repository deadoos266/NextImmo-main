"use client"
import { type ReactNode } from "react"
import FilterPopover from "../ui/FilterPopover"
import CityAutocomplete from "../CityAutocomplete"

/**
 * Barre horizontale sticky sous le header éditorial de /annonces.
 *
 * Desktop (≥1024) :
 *   [Ville ▾] [Budget ▾] [Pièces ▾]  ·  [⊟ Filtres (n)]  ·  [Tri ▾] [☰/▦] N résultats
 *
 * Tablette (768-1023) : même agencement mais scroll-x si overflow.
 * Mobile (<768) : uniquement [Filtres] [Tri ▾] + compteur ; les popovers
 * rapides sont masqués (tout passe dans la modal).
 *
 * Z-index 6000 : au-dessus du contenu et du header éditorial, en-dessous
 * de la Navbar (7000) et de FiltersModal (7500). background semi-translucide
 * avec backdrop-filter blur + fallback opaque si non supporté.
 *
 * Protocol Leaflet : la barre est sticky donc a position:sticky + z-index,
 * mais elle vit AU-DESSUS du conteneur qui embarque la carte (pas dans le
 * même stacking context que les tiles). Aucun risque de masquage.
 */

type TriKey = "match" | "prix_asc" | "prix_desc" | "alpha" | "recent"

export interface FiltersBarProps {
  isMobile: boolean
  isTablet: boolean

  // Ville popover
  activeVille: string
  onChangeVille: (v: string) => void

  // Budget popover
  budgetMaxFiltre: number | null
  setBudgetMaxFiltre: (v: number | null) => void

  // Pièces popover
  piecesMin: number
  setPiecesMin: (n: number) => void

  // Bouton Filtres (modal)
  onOpenModal: () => void
  activeFilterCount: number

  // Tri
  tri: TriKey
  setTri: (t: TriKey) => void
  showMatchOption: boolean // masqué pour proprio

  // View toggle
  view: "list" | "grid"
  setView: (v: "list" | "grid") => void

  // Compteur
  resultCount: number
  loading: boolean
}

function IconFilters() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="6" x2="14" y2="6" />
      <line x1="18" y1="6" x2="20" y2="6" />
      <circle cx="16" cy="6" r="2" />
      <line x1="4" y1="12" x2="8" y2="12" />
      <line x1="12" y1="12" x2="20" y2="12" />
      <circle cx="10" cy="12" r="2" />
      <line x1="4" y1="18" x2="16" y2="18" />
      <line x1="20" y1="18" x2="20" y2="18" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  )
}

function IconList() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function IconGrid() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  )
}

export default function FiltersBar(props: FiltersBarProps) {
  const {
    isMobile,
    isTablet,
    activeVille,
    onChangeVille,
    budgetMaxFiltre,
    setBudgetMaxFiltre,
    piecesMin,
    setPiecesMin,
    onOpenModal,
    activeFilterCount,
    tri,
    setTri,
    showMatchOption,
    view,
    setView,
    resultCount,
    loading,
  } = props

  const showInlinePopovers = !isMobile // desktop + tablette

  return (
    <div
      style={{
        position: "sticky",
        top: 72,
        zIndex: 6000,
        // Fond semi-translucide + fallback opaque si backdrop-filter non supporté
        background: "rgba(247,244,239,0.92)",
        WebkitBackdropFilter: "blur(10px)",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid #EAE6DF",
        padding: isMobile ? "10px 16px" : "12px 32px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexShrink: 0,
        overflowX: isTablet ? "auto" : "visible",
        // Safari fallback : sans blur, on augmente l'opacité
      }}
    >
      <style>{`
        @supports not ((-webkit-backdrop-filter: blur(10px)) or (backdrop-filter: blur(10px))) {
          .km-filters-bar-fallback { background: rgba(247,244,239,0.98) !important; }
        }
      `}</style>

      {showInlinePopovers && (
        <>
          {/* Ville popover */}
          <FilterPopover
            label="Ville"
            value={activeVille || null}
            active={!!activeVille}
            width={300}
            onClear={() => onChangeVille("")}
          >
            <p style={{ fontSize: 11, fontWeight: 600, color: "#666", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 10px" }}>Ville ou code postal</p>
            <CityAutocomplete
              value={activeVille}
              onChange={onChangeVille}
              placeholder="Ville ou code postal"
              style={{ fontSize: 13, padding: "10px 12px" }}
            />
          </FilterPopover>

          {/* Budget popover */}
          <FilterPopover
            label="Budget"
            value={budgetMaxFiltre ? `≤ ${budgetMaxFiltre.toLocaleString("fr-FR")} €` : null}
            active={!!budgetMaxFiltre}
            width={280}
            onClear={() => setBudgetMaxFiltre(null)}
          >
            <p style={{ fontSize: 11, fontWeight: 600, color: "#666", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 10px" }}>Budget maximum</p>
            <input
              type="number"
              min={0}
              value={budgetMaxFiltre ?? ""}
              onChange={e => {
                const n = e.target.value.trim() ? Number(e.target.value) : null
                setBudgetMaxFiltre(n && Number.isFinite(n) && n > 0 ? n : null)
              }}
              placeholder="Ex. 1200"
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
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[800, 1000, 1500, 2000].map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setBudgetMaxFiltre(v)}
                  style={{
                    background: budgetMaxFiltre === v ? "#111" : "white",
                    color: budgetMaxFiltre === v ? "white" : "#666",
                    border: `1px solid ${budgetMaxFiltre === v ? "#111" : "#EAE6DF"}`,
                    borderRadius: 999,
                    padding: "5px 12px",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  ≤ {v.toLocaleString("fr-FR")} €
                </button>
              ))}
            </div>
          </FilterPopover>

          {/* Pièces popover */}
          <FilterPopover
            label="Pièces"
            value={piecesMin > 0 ? `${piecesMin}+` : null}
            active={piecesMin > 0}
            width={260}
            onClear={() => setPiecesMin(0)}
          >
            <p style={{ fontSize: 11, fontWeight: 600, color: "#666", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 10px" }}>Nombre minimum</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[0, 1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPiecesMin(n)}
                  style={{
                    flex: "1 1 auto",
                    padding: "8px 12px",
                    background: piecesMin === n ? "#111" : "white",
                    color: piecesMin === n ? "white" : "#666",
                    border: `1px solid ${piecesMin === n ? "#111" : "#EAE6DF"}`,
                    borderRadius: 999,
                    fontSize: 13,
                    fontWeight: piecesMin === n ? 600 : 500,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    minWidth: 42,
                  }}
                >
                  {n === 0 ? "Tous" : `${n}+`}
                </button>
              ))}
            </div>
          </FilterPopover>
        </>
      )}

      {/* Bouton Filtres (centre) */}
      <button
        type="button"
        onClick={onOpenModal}
        aria-label={`Ouvrir les filtres avancés${activeFilterCount > 0 ? ` (${activeFilterCount} actifs)` : ""}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "white",
          color: "#111",
          border: `1px solid ${activeFilterCount > 0 ? "#111" : "#EAE6DF"}`,
          borderRadius: 999,
          padding: "8px 18px",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
          whiteSpace: "nowrap",
          transition: "border-color 0.15s",
        }}
      >
        <IconFilters />
        <span>Filtres</span>
        {activeFilterCount > 0 && (
          <span
            aria-hidden="true"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#111",
              color: "white",
              borderRadius: 999,
              minWidth: 20,
              height: 20,
              padding: "0 6px",
              fontSize: 11,
              fontWeight: 700,
              marginLeft: 2,
            }}
          >
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* Espace flex */}
      <div style={{ flex: 1 }} />

      {/* Droite : Tri + View toggle + compteur */}
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#666" }}>
        <span style={{ fontWeight: 500, whiteSpace: "nowrap" }}>Trier&nbsp;:</span>
        <select
          value={tri}
          onChange={e => setTri(e.target.value as TriKey)}
          style={{
            padding: "7px 28px 7px 12px",
            border: "1px solid #EAE6DF",
            borderRadius: 999,
            background: "white",
            fontSize: 12,
            fontWeight: 600,
            color: "#111",
            cursor: "pointer",
            fontFamily: "inherit",
            appearance: "none",
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 10px center",
          }}
        >
          {showMatchOption && <option value="match">Matching</option>}
          <option value="recent">Plus récent</option>
          <option value="alpha">A-Z</option>
          <option value="prix_asc">Prix croissant</option>
          <option value="prix_desc">Prix décroissant</option>
        </select>
      </label>

      {!isMobile && (
        <div
          role="group"
          aria-label="Affichage liste ou grille"
          style={{
            display: "inline-flex",
            alignItems: "center",
            background: "white",
            border: "1px solid #EAE6DF",
            borderRadius: 999,
            padding: 3,
          }}
        >
          <button
            type="button"
            onClick={() => setView("list")}
            aria-label="Vue liste"
            aria-pressed={view === "list"}
            style={{
              width: 32,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: view === "list" ? "#111" : "transparent",
              color: view === "list" ? "white" : "#666",
              border: "none",
              borderRadius: 999,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 150ms",
            }}
          >
            <IconList />
          </button>
          <button
            type="button"
            onClick={() => setView("grid")}
            aria-label="Vue grille"
            aria-pressed={view === "grid"}
            style={{
              width: 32,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: view === "grid" ? "#111" : "transparent",
              color: view === "grid" ? "white" : "#666",
              border: "none",
              borderRadius: 999,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 150ms",
            }}
          >
            <IconGrid />
          </button>
        </div>
      )}

      {!isMobile && (
        <span style={{ fontSize: 12, color: "#666", whiteSpace: "nowrap", fontWeight: 500 }}>
          {loading ? "Chargement…" : `${resultCount} résultat${resultCount > 1 ? "s" : ""}`}
        </span>
      )}
    </div>
  )
}
