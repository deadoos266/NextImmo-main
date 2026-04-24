"use client"
import { useState, type ReactNode } from "react"
import Image from "next/image"
import { CARD_GRADIENTS as GRADIENTS } from "../../../lib/cardGradients"
import { highlightMatch } from "./highlight"

/**
 * Card annonce pour la page /annonces avec 2 variantes :
 *  - variant="grid"    : aspect 16/10 landscape, width ~520px, mode grille
 *                        magazine (cards fixes alignées).
 *  - variant="compact" : LAYOUT 3 COLONNES style Claude Design handoff —
 *                        col 1 photo fixe 200px (aspect 4/5) avec NOUVEAU
 *                        badge + favori, col 2 info riche flex:1 (eyebrow
 *                        localisation + titre clamp 1 + specs inline + chips
 *                        amenities + "Voir sur la carte"), col 3 prix+CTA
 *                        fixe 180px (ScoreMatchDonut + prix 22/700 + chat +
 *                        Candidater). Hauteur dérivée de la photo (~250px).
 *                        Requiert colonne liste ≥ 530px (voir
 *                        COMPACT_LIST_MIN_COL dans AnnoncesClient).
 *
 * Photos :
 *  - PAS d'auto-rotation (retirée v4, trop agressif selon feedback user).
 *  - Flèches manuelles visibles au hover (parité avec fiche détail).
 *  - Dots cliquables indicateurs (tap pour navigation directe).
 *
 * Accessibilité :
 *  - Le wrapper est un <a> cliquable → href annonce.
 *  - Boutons internes (favori, flèches, dots, chat, carte) stoppent la
 *    propagation. Candidater = span qui bubble naturellement vers le <a>.
 */

type Variant = "grid" | "compact"

interface Props {
  annonce: any
  score: number | null
  info: { label: string; color: string; bg: string } | null
  isOwn: boolean
  isSelected: boolean
  favori: boolean
  onToggleFavori: (e: React.MouseEvent) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  motCle: string
  variant: Variant
  /** R10.2 — handler aperçu rapide (modal). Si absent, bouton masqué. */
  onQuickView?: (annonceId: number) => void
  /** R10.2 — état « cochée pour comparaison ». Default false. */
  compared?: boolean
  /** R10.2 — toggle comparer. Si absent, case masquée. */
  onToggleCompare?: (annonceId: number) => void
  /** R10.2 — true quand la tray est pleine (≥ max) : empêche cocher en plus. */
  compareDisabled?: boolean
}

// ─── Helpers exportables (DpeBadge, ScoreMatchDonut…) ──────────────────
// Hors du composant = pas de re-render inutile, pas de perte de focus.

function dpeColorFor(letter: string): string {
  const L = letter?.toUpperCase?.() || ""
  const map: Record<string, string> = {
    A: "#16A34A", B: "#65A30D", C: "#EAB308",
    D: "#F59E0B", E: "#EA580C", F: "#DC2626", G: "#7F1D1D",
  }
  return map[L] || "#8a8477"
}

/**
 * Pastille DPE (A…G) aux couleurs officielles handoff Claude.
 * Null-safe : retourne null si letter vide/absent.
 */
function DpeBadge({ letter }: { letter: string | null | undefined }) {
  if (!letter) return null
  return (
    <span
      title={`DPE ${letter.toUpperCase()}`}
      style={{
        minWidth: 20,
        height: 20,
        padding: "0 6px",
        borderRadius: 4,
        background: dpeColorFor(letter),
        color: "white",
        fontSize: 11,
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {letter.toUpperCase()}
    </span>
  )
}

function scoreColorFor(pct: number): string {
  if (pct >= 80) return "#16A34A"
  if (pct >= 65) return "#65A30D"
  if (pct >= 50) return "#EAB308"
  if (pct >= 30) return "#EA580C"
  return "#DC2626"
}

/**
 * Donut SVG de score match — pct sur 100. Ring #EAE6DF, progress coloré
 * selon les seuils (≥80 vert, 65-79 olive, 50-64 jaune, 30-49 orange, <30
 * rouge). Pourcentage rendu au centre en noir. Taille 52×52 par défaut.
 */
function ScoreMatchDonut({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(score / 10)))
  const color = scoreColorFor(pct)
  const size = 52
  const stroke = 4
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#EAE6DF" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div
        style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700, color: "#111",
          letterSpacing: "-0.2px",
        }}
        aria-label={`${pct}% de compatibilité`}
      >
        {pct}%
      </div>
    </div>
  )
}

/**
 * Formatte "VILLE · Quartier" pour l'eyebrow carte 3 cols. Fallback
 * "VILLE" si quartier absent. Vide si ville absente.
 */
function formatLocalisationFull(annonce: any): string {
  const ville = (annonce.ville || "").toString().trim()
  const quartier = (annonce.quartier || "").toString().trim()
  if (ville && quartier) return `${ville.toUpperCase()} · ${quartier}`
  if (ville) return ville.toUpperCase()
  return ""
}

/**
 * true si created_at < 7 jours (badge NOUVEAU). Null-safe.
 */
function isNewAnnonce(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false
  const t = new Date(createdAt).getTime()
  if (Number.isNaN(t)) return false
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
  return Date.now() - t < SEVEN_DAYS
}

// ─── CardPhoto (interne) ───────────────────────────────────────────────
function CardPhoto({
  annonce,
  aspect = "4 / 5",
  hideDispoBadge = false,
}: {
  annonce: any
  aspect?: string
  // Le variant compact 3 cols utilise son propre badge NOUVEAU à la place
  // du dispo badge (spec handoff). Grid variant garde le dispo badge.
  hideDispoBadge?: boolean
}) {
  const [idx, setIdx] = useState(0)
  const realPhotos: string[] = Array.isArray(annonce.photos) && annonce.photos.length > 0 ? annonce.photos : []
  const total = realPhotos.length > 0 ? realPhotos.length : 1
  const base = GRADIENTS[annonce.id % GRADIENTS.length]

  function prev(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIdx(i => (i - 1 + total) % total)
  }
  function next(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIdx(i => (i + 1) % total)
  }
  function goto(e: React.MouseEvent, i: number) {
    e.preventDefault()
    e.stopPropagation()
    setIdx(i)
  }

  const currentPhoto = realPhotos[idx]

  return (
    <div
      style={{
        position: "relative",
        aspectRatio: aspect,
        width: "100%",
        height: "100%",
        background: currentPhoto ? "#000" : base,
        overflow: "hidden",
        flexShrink: 0,
      }}
      onMouseEnter={e => {
        const btns = e.currentTarget.querySelectorAll<HTMLButtonElement>(".photo-nav")
        btns.forEach(b => (b.style.opacity = "1"))
      }}
      onMouseLeave={e => {
        const btns = e.currentTarget.querySelectorAll<HTMLButtonElement>(".photo-nav")
        btns.forEach(b => (b.style.opacity = "0"))
      }}
    >
      {currentPhoto ? (
        <Image
          src={currentPhoto}
          alt={annonce.titre || "Photo logement"}
          fill
          sizes="(max-width: 768px) 100vw, 320px"
          style={{ objectFit: "cover", display: "block" }}
        />
      ) : (
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(0,0,0,0.25)",
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          Pas de photo
        </span>
      )}

      {!hideDispoBadge && (
        <span
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            background: annonce.dispo === "Disponible maintenant" ? "#15803d" : "#a16207",
            color: "white",
            padding: "3px 9px",
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 700,
            zIndex: 2,
          }}
        >
          {annonce.dispo}
        </span>
      )}

      {realPhotos.length > 1 && (
        <>
          <button
            className="photo-nav"
            onClick={prev}
            aria-label="Photo précédente"
            style={{
              position: "absolute",
              left: 8,
              top: "50%",
              transform: "translateY(-50%)",
              background: "rgba(255,255,255,0.85)",
              border: "none",
              borderRadius: "50%",
              width: 28,
              height: 28,
              cursor: "pointer",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0,
              transition: "opacity 0.15s",
              zIndex: 3,
              fontWeight: 700,
              color: "#111",
            }}
          >
            ‹
          </button>
          <button
            className="photo-nav"
            onClick={next}
            aria-label="Photo suivante"
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              background: "rgba(255,255,255,0.85)",
              border: "none",
              borderRadius: "50%",
              width: 28,
              height: 28,
              cursor: "pointer",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0,
              transition: "opacity 0.15s",
              zIndex: 3,
              fontWeight: 700,
              color: "#111",
            }}
          >
            ›
          </button>
        </>
      )}

      {realPhotos.length > 1 && (
        <div
          style={{
            position: "absolute",
            bottom: 10,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            gap: 4,
            zIndex: 2,
          }}
        >
          {realPhotos.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={e => goto(e, i)}
              aria-label={`Aller à la photo ${i + 1}`}
              style={{
                width: i === idx ? 14 : 6,
                height: 6,
                borderRadius: 999,
                background: i === idx ? "white" : "rgba(255,255,255,0.5)",
                transition: "all 0.2s",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── FavoriButton (interne) ────────────────────────────────────────────
function FavoriButton({ favori, onClick }: { favori: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={favori ? "Retirer des favoris" : "Ajouter aux favoris"}
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        zIndex: 4,
        background: "white",
        border: "none",
        borderRadius: "50%",
        width: 34,
        height: 34,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
        transition: "transform 0.15s",
      }}
      onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.12)")}
      onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill={favori ? "#b91c1c" : "none"}
        stroke={favori ? "#b91c1c" : "#8a8477"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  )
}

// ─── Meta block grid variant (interne) ─────────────────────────────────
function MetaBlockGrid({
  annonce,
  score,
  info,
  isOwn,
  motCle,
}: Pick<Props, "annonce" | "score" | "info" | "isOwn" | "motCle">) {
  const titre: ReactNode = motCle.trim() ? highlightMatch(annonce.titre || "", motCle) : annonce.titre
  const ville: ReactNode = motCle.trim() ? highlightMatch(annonce.ville || "", motCle) : annonce.ville

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#6B6B6B",
            textTransform: "uppercase",
            letterSpacing: "1.2px",
            margin: 0,
          }}
        >
          {ville}
        </p>
        {info && score !== null && (
          <span
            style={{
              background: info.bg,
              color: info.color,
              padding: "2px 9px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {Math.round(score / 10)}%
          </span>
        )}
        {isOwn && (
          <span
            style={{
              background: "#F1EEE8",
              color: "#111",
              padding: "2px 9px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            Votre bien
          </span>
        )}
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 500, lineHeight: 1.3, margin: "0 0 12px", color: "#111" }}>
        {titre}
      </h3>
      <div style={{ display: "flex", gap: 12, fontSize: 13, color: "#8a8477", marginBottom: 12, flexWrap: "wrap" }}>
        {annonce.surface != null && <span>{annonce.surface} m²</span>}
        {annonce.surface != null && annonce.pieces != null && <span style={{ color: "#EAE6DF" }}>·</span>}
        {annonce.pieces != null && <span>{annonce.pieces} p.</span>}
        {annonce.meuble === true && (
          <>
            <span style={{ color: "#EAE6DF" }}>·</span>
            <span>Meublé</span>
          </>
        )}
      </div>
      <div
        style={{
          borderTop: "1px solid #EAE6DF",
          paddingTop: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#6B6B6B",
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}
        >
          Loyer
        </span>
        <span style={{ fontSize: 22, fontWeight: 500, color: "#111" }}>
          {annonce.prix} €
          <span style={{ fontSize: 12, fontWeight: 400, color: "#8a8477" }}>/mois</span>
        </span>
      </div>
    </>
  )
}

// ─── ListingCardSearch (export principal) ──────────────────────────────
export default function ListingCardSearch({
  annonce,
  score,
  info,
  isOwn,
  isSelected,
  favori,
  onToggleFavori,
  onMouseEnter,
  onMouseLeave,
  motCle,
  variant,
  onQuickView,
  compared = false,
  onToggleCompare,
  compareDisabled = false,
}: Props) {
  function handleQuickView(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (onQuickView) onQuickView(annonce.id)
  }
  function handleCompareToggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (onToggleCompare && (compared || !compareDisabled)) onToggleCompare(annonce.id)
  }
  const baseStyle: React.CSSProperties = {
    display: "block",
    textDecoration: "none",
    color: "#111",
    background: "white",
    borderRadius: 16,
    border: `1px solid ${isSelected ? "#111" : "#EAE6DF"}`,
    overflow: "hidden",
    boxShadow: isSelected ? "0 6px 24px rgba(0,0,0,0.08)" : "0 1px 2px rgba(0,0,0,0.02)",
    transition: "box-shadow 0.25s ease, transform 0.25s ease, border-color 0.2s",
  }

  if (variant === "compact") {
    // v5.5 : LAYOUT 3 COLONNES handoff Claude Design —
    //   Col 1 (200×stretch) : Photo aspect 4/5 + NOUVEAU badge + favori overlay
    //   Col 2 (flex 1)      : Eyebrow pin + loc · quartier, titre clamp 1,
    //                         specs + DPE inline, chips amenities (4 max)
    //                         + "Voir sur la carte" (hover sync markers)
    //   Col 3 (180×stretch) : ScoreMatchDonut top, prix 22/700 + charges,
    //                         chat button + Candidater CTA noir full-width
    //
    // Hauteur naturelle ~250px (photo 200×250). Les 3 colonnes stretchent
    // via alignItems:"stretch" → border-left col 3 descend full height.
    const loc = formatLocalisationFull(annonce)
    const locHighlighted: ReactNode = motCle.trim() ? highlightMatch(loc, motCle) : loc
    const titre: ReactNode = motCle.trim() ? highlightMatch(annonce.titre || "", motCle) : annonce.titre
    const showNew = isNewAnnonce(annonce.created_at)

    // Jusqu'à 4 amenities, prioritisés par désirabilité locataire.
    const amenities: string[] = []
    if (annonce.meuble === true) amenities.push("Meublé")
    if (annonce.balcon === true) amenities.push("Balcon")
    if (annonce.terrasse === true) amenities.push("Terrasse")
    if (annonce.jardin === true) amenities.push("Jardin")
    if (annonce.ascenseur === true) amenities.push("Ascenseur")
    if (annonce.parking === true) amenities.push("Parking")
    if (annonce.fibre === true) amenities.push("Fibre")
    if (annonce.cave === true) amenities.push("Cave")
    const pills = amenities.slice(0, 4)

    // Charges : null ou 0 → "Charges comprises", sinon "Charges X €"
    const chargesLabel =
      annonce.charges == null || annonce.charges === 0
        ? "Charges comprises"
        : `+ ${annonce.charges.toLocaleString("fr-FR")} € charges`

    const compactStyle: React.CSSProperties = {
      ...baseStyle,
      display: "flex",
      flexDirection: "row",
      position: "relative",
      alignItems: "stretch",
      minHeight: 180,
    }

    return (
      <a
        href={`/annonces/${annonce.id}`}
        onMouseEnter={e => {
          onMouseEnter()
          e.currentTarget.style.transform = "translateY(-2px)"
          e.currentTarget.style.boxShadow = "0 10px 28px rgba(0,0,0,0.08)"
        }}
        onMouseLeave={e => {
          onMouseLeave()
          e.currentTarget.style.transform = "none"
          e.currentTarget.style.boxShadow = isSelected
            ? "0 6px 24px rgba(0,0,0,0.08)"
            : "0 1px 2px rgba(0,0,0,0.02)"
        }}
        style={compactStyle}
      >
        {/* ═══ Col 1 — Photo 200 wide, aspect 4/5, badge NOUVEAU + favori ═══ */}
        <div style={{ width: 200, flexShrink: 0, position: "relative", alignSelf: "stretch" }}>
          <CardPhoto annonce={annonce} aspect="4 / 5" hideDispoBadge />
          {showNew && (
            <span
              style={{
                position: "absolute",
                top: 10,
                left: 10,
                background: "#111",
                color: "white",
                padding: "3px 9px",
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.6px",
                zIndex: 2,
              }}
            >
              NOUVEAU
            </span>
          )}
          <FavoriButton favori={favori} onClick={onToggleFavori} />
        </div>

        {/* ═══ Col 2 — Info riche, flex:1 centré vertical ═══ */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            padding: "18px 20px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {/* Eyebrow pin + localisation "VILLE · Quartier" */}
          {loc && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: "#6B6B6B",
                minWidth: 0,
              }}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ flexShrink: 0 }}
              >
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  minWidth: 0,
                  flex: 1,
                }}
              >
                {locHighlighted}
              </span>
              {isOwn && (
                <span
                  style={{
                    background: "#F1EEE8",
                    color: "#111",
                    padding: "2px 8px",
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 700,
                    flexShrink: 0,
                    textTransform: "none",
                    letterSpacing: "normal",
                  }}
                >
                  Votre bien
                </span>
              )}
            </div>
          )}

          {/* Titre — clamp 1 ligne */}
          <h3
            style={{
              fontSize: 17,
              fontWeight: 600,
              lineHeight: 1.25,
              margin: 0,
              color: "#111",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {titre}
          </h3>

          {/* Specs inline — surface · pièces · étage + DPE pastille */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: "#111",
              flexWrap: "wrap",
            }}
          >
            {annonce.surface != null && <span>{annonce.surface} m²</span>}
            {annonce.surface != null && annonce.pieces != null && <span style={{ color: "#EAE6DF" }}>·</span>}
            {annonce.pieces != null && <span>{annonce.pieces} {annonce.pieces > 1 ? "pièces" : "pièce"}</span>}
            {annonce.etage != null && (
              <>
                <span style={{ color: "#EAE6DF" }}>·</span>
                <span>Ét. {annonce.etage === 0 ? "RDC" : annonce.etage}</span>
              </>
            )}
            {annonce.dpe && (
              <>
                <span style={{ color: "#EAE6DF" }}>·</span>
                <DpeBadge letter={annonce.dpe} />
              </>
            )}
          </div>

          {/* Chips amenities + bouton "Voir sur la carte" (hover sync) */}
          {(pills.length > 0 || true) && (
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                alignItems: "center",
                marginTop: 2,
              }}
            >
              {pills.map(p => (
                <span
                  key={p}
                  style={{
                    background: "#F1EEE8",
                    color: "#111",
                    padding: "4px 11px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                  }}
                >
                  {p}
                </span>
              ))}
              {/* "Voir sur la carte" : click = focus marker (via onMouseEnter prop
                  qui est déjà connecté à setSelectedId dans AnnoncesClient). */}
              <button
                type="button"
                onClick={e => {
                  e.preventDefault()
                  e.stopPropagation()
                  onMouseEnter()
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = "#F1EEE8"
                  onMouseEnter()
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "white"
                }}
                aria-label="Voir sur la carte"
                style={{
                  background: "white",
                  color: "#111",
                  border: "1px solid #EAE6DF",
                  padding: "4px 11px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "background 0.15s",
                }}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                  <line x1="8" y1="2" x2="8" y2="18" />
                  <line x1="16" y1="6" x2="16" y2="22" />
                </svg>
                Voir sur la carte
              </button>
              {/* R10.2 — Aperçu rapide (modal sans quitter la page) */}
              {onQuickView && (
                <button
                  type="button"
                  onClick={handleQuickView}
                  aria-label="Aperçu rapide"
                  style={{
                    background: "white", color: "#111",
                    border: "1px solid #EAE6DF", padding: "4px 11px",
                    borderRadius: 999, fontSize: 11, fontWeight: 500,
                    whiteSpace: "nowrap", display: "inline-flex",
                    alignItems: "center", gap: 5, cursor: "pointer",
                    fontFamily: "inherit", transition: "background 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#F1EEE8" }}
                  onMouseLeave={e => { e.currentTarget.style.background = "white" }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  Aperçu
                </button>
              )}
              {/* R10.2 — Toggle Comparer */}
              {onToggleCompare && (
                <button
                  type="button"
                  onClick={handleCompareToggle}
                  aria-label={compared ? "Retirer du comparateur" : "Ajouter au comparateur"}
                  aria-pressed={compared}
                  disabled={!compared && compareDisabled}
                  title={!compared && compareDisabled ? "Maximum atteint — retirez une annonce pour en ajouter une autre" : undefined}
                  style={{
                    background: compared ? "#111" : "white",
                    color: compared ? "white" : "#111",
                    border: compared ? "1px solid #111" : "1px solid #EAE6DF",
                    padding: "4px 11px",
                    borderRadius: 999, fontSize: 11, fontWeight: 600,
                    whiteSpace: "nowrap", display: "inline-flex",
                    alignItems: "center", gap: 5,
                    cursor: !compared && compareDisabled ? "not-allowed" : "pointer",
                    opacity: !compared && compareDisabled ? 0.5 : 1,
                    fontFamily: "inherit", transition: "background 0.15s",
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {compared ? <polyline points="20 6 9 17 4 12" /> : <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>}
                  </svg>
                  {compared ? "Ajouté" : "Comparer"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ═══ Col 3 — Prix + CTA, 180 fixe, border-left hairline ═══ */}
        <div
          style={{
            width: 180,
            flexShrink: 0,
            padding: "16px 16px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            borderLeft: "1px solid #EAE6DF",
            alignSelf: "stretch",
            boxSizing: "border-box",
          }}
        >
          {/* ScoreMatchDonut — uniquement si score non null et pas proprio */}
          {score !== null && !isOwn && <ScoreMatchDonut score={score} />}

          {/* Prix + charges */}
          <div style={{ textAlign: "center", lineHeight: 1.15 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#111", letterSpacing: "-0.3px" }}>
              {annonce.prix?.toLocaleString("fr-FR") ?? "—"} €
              <span style={{ fontSize: 11, fontWeight: 400, color: "#8a8477" }}> /mois</span>
            </div>
            <div style={{ fontSize: 11, color: "#6B6B6B", marginTop: 3 }}>{chargesLabel}</div>
          </div>

          {/* Actions — chat rond + Candidater full-width noir */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", alignItems: "center" }}>
            <button
              type="button"
              aria-label="Envoyer un message"
              onClick={e => {
                e.preventDefault()
                e.stopPropagation()
                window.location.href = `/messages?annonce=${annonce.id}`
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "#F7F4EF"
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "white"
              }}
              style={{
                background: "white",
                border: "1px solid #EAE6DF",
                borderRadius: "50%",
                width: 34,
                height: 34,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "#111",
                fontFamily: "inherit",
                flexShrink: 0,
                transition: "background 0.15s",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>
            {/* Candidater = span (pas <button>) car on laisse le clic bubbler
                vers le <a> parent → navigue vers /annonces/[id]. */}
            <span
              style={{
                background: "#111",
                color: "white",
                padding: "9px 14px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: "nowrap",
                textAlign: "center",
                width: "100%",
                display: "inline-flex",
                justifyContent: "center",
                alignItems: "center",
                boxSizing: "border-box",
                letterSpacing: "0.2px",
              }}
            >
              Candidater
            </span>
          </div>
        </div>
      </a>
    )
  }

  // variant="grid" — Mode Grille magazine, cards fixes alignées (inchangé).
  return (
    <a
      href={`/annonces/${annonce.id}`}
      onMouseEnter={e => {
        onMouseEnter()
        e.currentTarget.style.transform = "translateY(-2px)"
        e.currentTarget.style.boxShadow = "0 10px 28px rgba(0,0,0,0.08)"
      }}
      onMouseLeave={e => {
        onMouseLeave()
        e.currentTarget.style.transform = "none"
        e.currentTarget.style.boxShadow = isSelected
          ? "0 6px 24px rgba(0,0,0,0.08)"
          : "0 1px 2px rgba(0,0,0,0.02)"
      }}
      style={baseStyle}
    >
      <div style={{ position: "relative" }}>
        {/* v5.2 : aspect 16/10 landscape (rectangle) — cards zoomées plus
            grosses (520px large) pour une meilleure lisibilité des photos */}
        <CardPhoto annonce={annonce} aspect="16 / 10" />
        <FavoriButton favori={favori} onClick={onToggleFavori} />
      </div>
      <div style={{ padding: "18px 22px 22px" }}>
        <MetaBlockGrid annonce={annonce} score={score} info={info} isOwn={isOwn} motCle={motCle} />
        {/* R10.2 — action strip Aperçu / Comparer (sous le récap grid) */}
        {(onQuickView || onToggleCompare) && (
          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {onQuickView && (
              <button
                type="button"
                onClick={handleQuickView}
                aria-label="Aperçu rapide"
                style={{
                  background: "white", color: "#111",
                  border: "1px solid #EAE6DF", padding: "6px 14px",
                  borderRadius: 999, fontSize: 11, fontWeight: 500,
                  whiteSpace: "nowrap", cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Aperçu
              </button>
            )}
            {onToggleCompare && (
              <button
                type="button"
                onClick={handleCompareToggle}
                aria-label={compared ? "Retirer du comparateur" : "Ajouter au comparateur"}
                aria-pressed={compared}
                disabled={!compared && compareDisabled}
                title={!compared && compareDisabled ? "Maximum atteint" : undefined}
                style={{
                  background: compared ? "#111" : "white",
                  color: compared ? "white" : "#111",
                  border: compared ? "1px solid #111" : "1px solid #EAE6DF",
                  padding: "6px 14px",
                  borderRadius: 999, fontSize: 11, fontWeight: 600,
                  whiteSpace: "nowrap",
                  cursor: !compared && compareDisabled ? "not-allowed" : "pointer",
                  opacity: !compared && compareDisabled ? 0.5 : 1,
                  fontFamily: "inherit",
                }}
              >
                {compared ? "Ajouté au comparateur" : "Comparer"}
              </button>
            )}
          </div>
        )}
      </div>
    </a>
  )
}
