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

type TriKey = "match" | "prix_asc" | "prix_desc" | "alpha" | "recent" | "populaire"

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

  // V14c + V15c (Paul 2026-04-28) — pill "Mes critères" toujours visible
  // côté locataire, placée à gauche dans la barre. Si null/undefined,
  // pas de pill (proprio par exemple). Morphée en "Réinitialiser mes
  // critères" quand divergence détectée + onResetToProfil fourni :
  // - default state → pill noire "Mes critères" → click /profil
  // - divergence state → pill ambre "Réinitialiser mes critères" → click reset
  monProfilHref?: string | null
  isDivergent?: boolean
  onResetToProfil?: () => void
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
    isDivergent,
    onResetToProfil,
  } = props

  const showInlinePopovers = !isMobile // desktop + tablette

  // V81.12 — DIAGNOSTIC FINAL du bug "barre fix toujours en plein milieu" :
  //
  // CAUSE RACINE identifiée : `globals.css` applique
  //   html, body { overflow-x: clip; max-width: 100vw }
  // pour bloquer le scroll horizontal iPhone (V11.12 NUCLEAR overflow guard).
  // Or `overflow-x: clip` sur body force IMPLICITEMENT `overflow-y: auto`
  // (CSS spec : si une dimension est non-visible, l'autre passe en auto).
  // → body devient un scroll container pour ses descendants.
  // → `position: sticky` à l'intérieur stick relativement au body, pas au
  //   viewport, ce qui dans certaines configs fait que sticky NE S'ENGAGE
  //   PAS et la barre reste à sa position naturelle (= "en plein milieu").
  //
  // Fix V81.12 : REMPLACER position:sticky par position:fixed. La barre
  // sort du flux et reste collée au top:72 du viewport quel que soit le
  // scroll. Insensible à overflow:clip d'un ancêtre.
  //
  // V81.18 — Le SPACER est désormais géré par AnnoncesClient (padding-top
  // sur le container principal) car le spacer interne n'était pas placé
  // au bon endroit (sous le dossier banner au lieu d'au-dessus), ce qui
  // causait le FiltersBar fixed à recouvrir le dossier banner au scrollY=0.
  // Cf feedback Paul : "des choses passent par dessus certaines".

  return (
    <>
      <div
        className="km-filters-bar-fallback"
        style={{
          position: "fixed",
          top: stickyTop,
          left: 0,
          right: 0,
          zIndex: 6000,
          backgroundColor: "#FFFFFF",
          borderBottom: "1px solid #EAE6DF",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          padding: isMobile ? "12px 16px" : "12px 24px",
          width: "100%",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
          overflowX: isTablet || isMobile ? "auto" : "visible",
          transform: "translate3d(0, 0, 0)",
          WebkitTransform: "translate3d(0, 0, 0)",
          willChange: "transform",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
          // V81.12 — JustifyContent center pour desktop (gardera les
          // popovers centrés dans 1700px max). Sur mobile/tablette, le
          // scroll horizontal interne gère le débordement.
          justifyContent: isMobile || isTablet ? "flex-start" : "center",
        }}
      >
        <style>{`
          .km-filters-bar-fallback { background-color: #FFFFFF !important; }
        `}</style>
        {/* Inner wrapper pour limiter le contenu à 1700px (cohérent
            avec GRID_MAX_WIDTH du AnnoncesClient) tout en gardant le
            background pleine largeur. */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
          width: "100%",
          maxWidth: isMobile || isTablet ? "100%" : 1700,
        }}>


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

      {/* V14c + V15c (Paul 2026-04-28) — Pill morph "Mes critères" ↔
          "Réinitialiser mes critères". À gauche en tête de la FiltersBar.
          - default → pill noire icone user → /profil
          - divergence → pill ambre icone refresh → reset URL aux valeurs profil
          Animation transition 200ms entre les 2 états. */}
      {monProfilHref && (
        isDivergent && onResetToProfil ? (
          <button
            type="button"
            onClick={onResetToProfil}
            aria-label="Réinitialiser les filtres à mes critères du profil"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "#a16207",
              color: "#fff",
              border: "1px solid #a16207",
              borderRadius: 999,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "inherit",
              whiteSpace: "nowrap",
              flexShrink: 0,
              cursor: "pointer",
              transition: "background 200ms, border-color 200ms",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
            {isMobile ? "Réinit." : "Réinitialiser mes critères"}
          </button>
        ) : (
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
              transition: "background 200ms, border-color 200ms",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            {isMobile ? "Profil" : "Mes critères"}
          </Link>
        )
      )}

      {/* V81.18 — Quick-access "Favoris" mobile uniquement (icône cœur).
          Feedback Paul : "il faudrait sur tel avoir un moyen d'aller au
          favoris depuis /annonces car la ca va etre lent pour y aller et
          pas intuitif" (via tab Plus → sheet → tap Favoris = 2-3 taps).
          1 tap depuis la FiltersBar = direct. Desktop a déjà l'accès via
          la Navbar (lien Favoris), pas besoin de doubler.
          V81.29 — tap target 38→44 (WCAG 2.5.5 AAA + iOS HIG/Material). */}
      {isMobile && monProfilHref && (
        <Link
          href="/favoris"
          aria-label="Mes favoris"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#fff",
            color: "#111",
            border: "1px solid #EAE6DF",
            borderRadius: 999,
            width: 44,
            height: 44,
            textDecoration: "none",
            fontFamily: "inherit",
            flexShrink: 0,
            WebkitTapHighlightColor: "transparent",
            touchAction: "manipulation",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </Link>
      )}

      {/* Bouton Filtres (centre gauche).
          V81.24 — Sur mobile, affichage compact : icone seule + badge count.
          Évite le overflow horizontal de la barre sur viewport étroit. */}
      <button
        type="button"
        onClick={onOpenModal}
        aria-label={`Ouvrir les filtres avancés${activeFilterCount > 0 ? ` (${activeFilterCount} actifs)` : ""}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: isMobile ? 4 : 8,
          background: "white",
          color: "#111",
          border: `1px solid ${activeFilterCount > 0 ? "#111" : "#EAE6DF"}`,
          borderRadius: 999,
          padding: isMobile ? "8px 12px" : "8px 18px",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
          whiteSpace: "nowrap",
          transition: "border-color 0.15s",
        }}
      >
        <IconFilters />
        {!isMobile && <span>Filtres</span>}
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

      {/* GROUPE DROIT : Tri + ViewToggle + compteur collés (gap:8).
          V81.24 — Sur mobile, label "Trier:" caché + compteur caché
          (redondant avec le h2 "N logements à Paris" juste en dessous). */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#666" }}>
          {!isMobile && <span style={{ fontWeight: 500, whiteSpace: "nowrap" }}>Trier&nbsp;:</span>}
          <select
            value={tri}
            onChange={e => setTri(e.target.value as TriKey)}
            aria-label={isMobile ? "Trier les annonces" : undefined}
            style={{
              padding: isMobile ? "7px 26px 7px 10px" : "7px 28px 7px 12px",
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
              maxWidth: isMobile ? 110 : undefined,
            }}
          >
            {showMatchOption && <option value="match">Matching</option>}
            <option value="populaire">Plus populaires</option>
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

        {/* V81.24 — Compteur masqué sur mobile : redondant avec le h2
            "{N} logements à {ville}" juste en dessous. Évite le overflow
            de la barre sur viewport étroit.
            V81.29 — aria-live="polite" pour annoncer les changements de
            résultats aux lecteurs d'écran (audit a11y WCAG 4.1.3 Status). */}
        {!isMobile && (
          <span
            aria-live="polite"
            aria-atomic="true"
            style={{ fontSize: 12, color: "#666", whiteSpace: "nowrap", fontWeight: 500 }}
          >
            {loading
              ? "Chargement…"
              : `${resultCount} résultat${resultCount > 1 ? "s" : ""}`}
          </span>
        )}
        </div>{/* close GROUPE DROIT */}
        </div>{/* close maxWidth inner wrapper */}
      </div>{/* close fixed bar */}
    </>
  )
}
