"use client"
import { useState, type ReactNode } from "react"
import Image from "next/image"
import { CARD_GRADIENTS as GRADIENTS } from "../../../lib/cardGradients"
import { highlightMatch } from "./highlight"

/**
 * Card annonce pour la page /annonces avec 2 variantes :
 *  - variant="grid"    : aspect 16/10 landscape, width ~520px, mode grille
 *                        magazine (cards fixes alignées).
 *  - variant="compact" : LAYOUT HORIZONTAL style SeLoger classique —
 *                        photo à gauche (largeur fixe ~200px, aspect 4/3),
 *                        bloc texte dense à droite (flex:1). Hauteur totale
 *                        ~150px → permet de voir 4-5 cards dans la viewport
 *                        en mode Liste+Carte (colonne étroite ~450px).
 *
 * Photos :
 *  - PAS d'auto-rotation (retirée v4, trop agressif selon feedback user).
 *  - Flèches manuelles visibles au hover (parité avec fiche détail).
 *  - Dots cliquables indicateurs (tap pour navigation directe).
 *
 * Accessibilité :
 *  - Le wrapper est un <a> cliquable → href annonce.
 *  - Boutons internes (favori, flèches, dots) stoppent la propagation.
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
}

// ─── CardPhoto (interne) ───────────────────────────────────────────────
function CardPhoto({
  annonce,
  aspect = "4 / 5",
}: {
  annonce: any
  aspect?: string
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

      <span
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          background: annonce.dispo === "Disponible maintenant" ? "#16a34a" : "#ea580c",
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
        fill={favori ? "#dc2626" : "none"}
        stroke={favori ? "#dc2626" : "#6b7280"}
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
              color: "#374151",
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
      <div style={{ display: "flex", gap: 12, fontSize: 13, color: "#6b7280", marginBottom: 12, flexWrap: "wrap" }}>
        {annonce.surface != null && <span>{annonce.surface} m²</span>}
        {annonce.surface != null && annonce.pieces != null && <span style={{ color: "#d1d5db" }}>·</span>}
        {annonce.pieces != null && <span>{annonce.pieces} p.</span>}
        {annonce.meuble === true && (
          <>
            <span style={{ color: "#d1d5db" }}>·</span>
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
          <span style={{ fontSize: 12, fontWeight: 400, color: "#9ca3af" }}>/mois</span>
        </span>
      </div>
    </>
  )
}

// ─── Meta block compact variant (interne) ──────────────────────────────
// v5 : drastiquement compacté pour voir 2-3 cards en même temps dans la
// viewport disponible en mode Liste+Carte. Anatomie SeLoger dense :
//   Prix 17 · 1 ligne specs · Titre clamp 1 · Ville + DPE 18
function MetaBlockCompact({
  annonce,
  score,
  info,
  isOwn,
  motCle,
}: Pick<Props, "annonce" | "score" | "info" | "isOwn" | "motCle">) {
  const titre: ReactNode = motCle.trim() ? highlightMatch(annonce.titre || "", motCle) : annonce.titre
  const ville: ReactNode = motCle.trim() ? highlightMatch(annonce.ville || "", motCle) : annonce.ville

  const dpeColor = (letter: string): string => {
    const map: Record<string, string> = {
      A: "#16a34a", B: "#65a30d", C: "#eab308",
      D: "#f59e0b", E: "#ea580c", F: "#dc2626", G: "#7f1d1d",
    }
    return map[letter?.toUpperCase?.()] || "#6b7280"
  }

  // Amenities (jusqu'à 3 pills) — on priorise Meublé / Balcon / Terrasse /
  // Ascenseur / Parking (les plus différenciants pour un locataire).
  const amenityPills: string[] = []
  if (annonce.meuble === true) amenityPills.push("Meublé")
  if (annonce.balcon === true) amenityPills.push("Balcon")
  if (annonce.terrasse === true) amenityPills.push("Terrasse")
  if (annonce.ascenseur === true) amenityPills.push("Ascenseur")
  if (annonce.parking === true) amenityPills.push("Parking")
  if (annonce.jardin === true) amenityPills.push("Jardin")
  const pills = amenityPills.slice(0, 3)

  return (
    <div style={{ padding: "16px 20px 14px", display: "flex", flexDirection: "column", gap: 6, width: "100%", height: "100%", boxSizing: "border-box" }}>
      {/* Row 1 : Ville eyebrow (gauche) + match badge (droite, rond vert) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <p style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#6B6B6B",
          textTransform: "uppercase",
          letterSpacing: "0.8px",
          margin: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
          flex: 1,
        }}>
          {ville}
          {annonce.quartier && <span style={{ color: "#9ca3af", textTransform: "none", letterSpacing: "normal" }}> · {annonce.quartier}</span>}
        </p>
        {info && score !== null && (
          <span
            style={{
              background: info.bg,
              color: info.color,
              padding: "3px 10px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              flexShrink: 0,
              whiteSpace: "nowrap",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 999, background: "currentColor" }} />
            {Math.round(score / 10)}% match
          </span>
        )}
        {isOwn && (
          <span
            style={{
              background: "#F1EEE8",
              color: "#374151",
              padding: "3px 10px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            Votre bien
          </span>
        )}
      </div>

      {/* Row 2 : Titre (gauche, 1 ligne) + Prix (droite, gros) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <h3 style={{
          fontSize: 16,
          fontWeight: 500,
          lineHeight: 1.25,
          margin: 0,
          color: "#111",
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {titre}
        </h3>
        <span style={{ fontSize: 20, fontWeight: 600, color: "#111", lineHeight: 1.1, flexShrink: 0, whiteSpace: "nowrap" }}>
          {annonce.prix?.toLocaleString("fr-FR") ?? "—"} €
          <span style={{ fontSize: 12, fontWeight: 400, color: "#9ca3af" }}>&nbsp;/mois</span>
        </span>
      </div>

      {/* Row 3 : Specs (gauche) + DPE (droite). Charges comprises si pertinent. */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{
          display: "flex",
          gap: 6,
          fontSize: 13,
          color: "#374151",
          alignItems: "center",
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
          flex: 1,
          minWidth: 0,
        }}>
          {annonce.surface != null && <span>{annonce.surface} m²</span>}
          {annonce.surface != null && annonce.pieces != null && <span style={{ color: "#d1d5db" }}>·</span>}
          {annonce.pieces != null && <span>{annonce.pieces} {annonce.pieces > 1 ? "pièces" : "pièce"}</span>}
          {annonce.etage != null && (
            <>
              <span style={{ color: "#d1d5db" }}>·</span>
              <span>Ét. {annonce.etage === 0 ? "RDC" : annonce.etage}</span>
            </>
          )}
          {annonce.dpe && (
            <>
              <span style={{ color: "#d1d5db" }}>·</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                DPE
                <span
                  title={`DPE ${annonce.dpe}`}
                  style={{
                    minWidth: 18,
                    height: 18,
                    padding: "0 5px",
                    borderRadius: 4,
                    background: dpeColor(annonce.dpe),
                    color: "white",
                    fontSize: 11,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {annonce.dpe.toUpperCase()}
                </span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* Row 4 : Amenities pills (jusqu'à 3) — auto-hidden si aucun */}
      {pills.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
          {pills.map(p => (
            <span
              key={p}
              style={{
                background: "#F1EEE8",
                color: "#374151",
                padding: "4px 12px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 500,
                whiteSpace: "nowrap",
              }}
            >
              {p}
            </span>
          ))}
        </div>
      )}

      {/* Spacer élastique — pousse la ligne d'actions tout en bas de la card */}
      <div style={{ flex: 1 }} />

      {/* Row 5 : Actions — chat icon (gauche) + Candidater (droite, CTA noir).
          Pas de stopPropagation pour Candidater → navigue comme le <a> parent
          (même URL /annonces/[id]). Chat → /messages?annonce={id}. */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 2 }}>
        <button
          type="button"
          aria-label="Envoyer un message"
          onClick={e => {
            e.preventDefault()
            e.stopPropagation()
            window.location.href = `/messages?annonce=${annonce.id}`
          }}
          style={{
            background: "white",
            border: "1px solid #EAE6DF",
            borderRadius: "50%",
            width: 36,
            height: 36,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#374151",
            fontFamily: "inherit",
            flexShrink: 0,
            transition: "background 0.15s, border-color 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#F7F4EF" }}
          onMouseLeave={e => { e.currentTarget.style.background = "white" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
        {/* Candidater → même URL que le <a> wrapper, donc pas besoin de handler :
            on laisse le clic bubbler naturellement. */}
        <span
          style={{
            background: "#111",
            color: "white",
            padding: "9px 20px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          Candidater
        </span>
      </div>
    </div>
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
}: Props) {
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
    // v5.4 : LAYOUT HORIZONTAL — photo gauche grande + meta droite flex.
    // Photo cible 390×300px (aspect 13/10), responsive via min(390px, 58%) :
    //   - card 672px (viewport 1920) : photo 390×300 → meta 282px
    //   - card 504px (viewport 1440) : photo 292×225 → meta 212px
    // Moins de blanc dans le rectangle car la photo occupe ~58% visuellement.
    const compactStyle: React.CSSProperties = {
      ...baseStyle,
      display: "flex",
      flexDirection: "row",
      position: "relative",
      alignItems: "stretch",
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
        {/* Photo gauche — min(390px, 58%) wide, aspect 13/10 (~390×300).
            Favori en overlay top-right DE LA PHOTO (pas de la card) pour ne
            pas entrer en collision avec le badge "92% match" côté meta. */}
        <div style={{ width: "min(390px, 58%)", flexShrink: 0, position: "relative" }}>
          <CardPhoto annonce={annonce} aspect="13 / 10" />
          <FavoriButton favori={favori} onClick={onToggleFavori} />
        </div>
        {/* Bloc meta droite — flex:1, stretch pour que MetaBlockCompact
            fill la hauteur complète (actions row collée au bas de la card) */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "stretch" }}>
          <MetaBlockCompact annonce={annonce} score={score} info={info} isOwn={isOwn} motCle={motCle} />
        </div>
      </a>
    )
  }

  // variant="grid" — Mode Grille magazine, cards fixes alignées.
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
      </div>
    </a>
  )
}
