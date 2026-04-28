"use client"
import Link from "next/link"
import FilterPopover from "../ui/FilterPopover"
import CityAutocomplete from "../CityAutocomplete"

/**
 * Barre horizontale sticky sous le header éditorial de /annonces.
 *
 * Desktop (≥1024) :
 *   [Ville ▾] [Budget ▾] [Compatibilité ▾]  ·  [⊟ Filtres (n)]      [Tri ▾] [☰/▦] N résultats
 *
 * Tablette (768-1023) : même agencement mais scroll-x si overflow.
 * Mobile (<768) : uniquement [Filtres] [Tri ▾] + compteur ; les popovers
 * rapides sont masqués (tout passe dans la modal).
 *
 * Groupe droit : Tri + ViewToggle + compteur sont compactés (gap:8) et
 * collés côte à côte pour éviter la sensation « Tri isolé à l'extrême droite ».
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

  // Compatibilité popover (slider 0-90 step 10) — remplace Pièces en quick chip
  scoreMin: number
  setScoreMin: (n: number) => void
  showScoreMin: boolean // masqué pour proprio ou si pas de profil

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

  // Top sticky : 0 quand la FiltersBar est dans un container scrollable
  // isolé (scroll liste = scroll parent custom). 72 quand le scroll est le
  // document (mode grille, mobile) et qu'il faut rester sous la Navbar.
  stickyTop?: number

  // V14c (Paul 2026-04-28) — pill "Mes critères" toujours visible côté
  // locataire, placée à gauche dans la barre. Si null/undefined, pas
  // de pill (proprio par exemple). Cliquer = navigue vers href donné.
  monProfilHref?: string | null
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
    scoreMin,
    setScoreMin,
    showScoreMin,
    onOpenModal,
    activeFilterCount,
    tri,
    setTri,
    showMatchOption,
    view,
    setView,
    resultCount,
    loading,
    stickyTop = 0,
    monProfilHref,
  } = props

  const showInlinePopovers = !isMobile // desktop + tablette

  return (
    <div
      className="km-filters-bar-fallback"
      style={{
        position: "sticky",
        top: stickyTop,
        zIndex: 6000,
        // Fond semi-translucide + fallback opaque si backdrop-filter non supporté
        background: "rgba(247,244,239,0.92)",
        WebkitBackdropFilter: "blur(10px)",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid #EAE6DF",
        padding: isMobile ? "10px 0" : "12px 0",
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexShrink: 0,
        overflowX: isTablet ? "auto" : "visible",
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

          {/* Compatibilité popover — slider 0-90 step 10 */}
          {showScoreMin && (
            <FilterPopover
              label="Compatibilité"
              value={scoreMin > 0 ? `${scoreMin}% min` : null}
              active={scoreMin > 0}
              width={280}
              onClear={() => setScoreMin(0)}
            >
              <p style={{ fontSize: 11, fontWeight: 600, color: "#666", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 10px" }}>Score minimum</p>
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
                <span style={{ fontSize: 13, fontWeight: 600, color: "#111", minWidth: 52, textAlign: "right" }}>
                  {scoreMin > 0 ? `≥ ${scoreMin}%` : "Tous"}
                </span>
              </div>
              <p style={{ fontSize: 11, color: "#888", fontStyle: "italic", margin: "6px 0 0" }}>
                Les annonces en dessous de ce seuil sont masquées.
              </p>
            </FilterPopover>
          )}
        </>
      )}

      {/* V14c (Paul 2026-04-28) — Pill "Mes critères" — toujours visible
          côté locataire connecté, accès direct au /profil. Placée à gauche
          juste avant "Filtres" pour être impossible à rater. */}
      {monProfilHref && (
        <Link
          href={monProfilHref}
          aria-label="Mon profil locataire — éditer mes critères"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "#111",
            color: "#fff",
            border: "1px solid #111",
            borderRadius: 999,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          {isMobile ? "Profil" : "Mes critères"}
        </Link>
      )}

      {/* Bouton Filtres (centre gauche) */}
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

      {/* Espace flex — pousse le groupe droit */}
      <div style={{ flex: 1 }} />

      {/* GROUPE DROIT : Tri + ViewToggle + compteur collés (gap:8) */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
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

        <span style={{ fontSize: 12, color: "#666", whiteSpace: "nowrap", fontWeight: 500 }}>
          {loading
            ? (isMobile ? "…" : "Chargement…")
            : isMobile
              ? `${resultCount} rés.`
              : `${resultCount} résultat${resultCount > 1 ? "s" : ""}`}
        </span>
      </div>
    </div>
  )
}
