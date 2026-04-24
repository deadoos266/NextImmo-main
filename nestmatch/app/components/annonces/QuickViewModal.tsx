"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { km, KMEyebrow, KMHeading, KMChip, KMDPE } from "../ui/km"
import { CARD_GRADIENTS as GRADIENTS } from "../../../lib/cardGradients"

/**
 * QuickView — aperçu rapide d'une annonce sans quitter /annonces (R10.2a).
 *
 * Ouvert depuis le bouton "Aperçu" d'une card de liste. Affiche :
 *  - Carrousel photo (réutilise la même logique que CardPhoto)
 *  - Titre + ville · quartier + specs (surface/pièces/étage)
 *  - Chips amenities (balcon, meublé, …)
 *  - Pastille DPE
 *  - Loyer / charges
 *  - Snippet description (clamp 3 lignes)
 *  - CTAs : "Voir la fiche" (push /annonces/[id]), "Candidater"
 *
 * Accessibilité : Escape ferme, focus trap naïf (overlay cliquable).
 * Scroll lock body pendant l'ouverture.
 */
interface QuickViewProps {
  annonce: any | null
  open: boolean
  onClose: () => void
  score: number | null
  favori: boolean
  onToggleFavori: () => void
}

export default function QuickViewModal({ annonce, open, onClose, score, favori, onToggleFavori }: QuickViewProps) {
  const [photoIdx, setPhotoIdx] = useState(0)

  useEffect(() => {
    if (!open) return
    setPhotoIdx(0)
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open || !annonce) return null

  const photos: string[] = Array.isArray(annonce.photos) && annonce.photos.length > 0 ? annonce.photos : []
  const total = photos.length
  const current = photos[photoIdx]
  const base = GRADIENTS[Number(annonce.id ?? 0) % GRADIENTS.length]

  const amenities: string[] = []
  if (annonce.meuble === true) amenities.push("Meublé")
  if (annonce.balcon === true) amenities.push("Balcon")
  if (annonce.terrasse === true) amenities.push("Terrasse")
  if (annonce.jardin === true) amenities.push("Jardin")
  if (annonce.ascenseur === true) amenities.push("Ascenseur")
  if (annonce.parking === true) amenities.push("Parking")
  if (annonce.fibre === true) amenities.push("Fibre")
  if (annonce.cave === true) amenities.push("Cave")

  const locLine = [annonce.ville, annonce.quartier].filter(Boolean).join(" · ")
  const scorePct = score !== null ? Math.max(0, Math.min(100, Math.round(score / 10))) : null

  function prevPhoto() { if (total > 0) setPhotoIdx(i => (i - 1 + total) % total) }
  function nextPhoto() { if (total > 0) setPhotoIdx(i => (i + 1) % total) }

  return (
    <>
      <style>{`
        @keyframes nm-qv-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes nm-qv-rise { from { opacity: 0; transform: translate(-50%, -46%) } to { opacity: 1; transform: translate(-50%, -50%) } }
      `}</style>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(17,17,17,0.55)",
          backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
          zIndex: 9000,
          animation: "nm-qv-fade 0.18s ease-out",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Aperçu de ${annonce.titre || "l'annonce"}`}
        style={{
          position: "fixed",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          background: km.white,
          border: `1px solid ${km.line}`,
          borderRadius: 24,
          width: "min(720px, 94vw)",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 64px rgba(17,17,17,0.22)",
          zIndex: 9001,
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
          overflow: "hidden",
          animation: "nm-qv-rise 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {/* Photo header */}
        <div style={{ position: "relative", aspectRatio: "16 / 9", background: current ? "#000" : base, flexShrink: 0 }}>
          {current ? (
            <Image src={current} alt={annonce.titre || "Photo logement"} fill sizes="(max-width: 768px) 100vw, 720px" style={{ objectFit: "cover" }} />
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.55)", fontSize: 14, fontWeight: 500 }}>
              Pas de photo
            </div>
          )}
          {total > 1 && (
            <>
              <button
                type="button"
                onClick={prevPhoto}
                aria-label="Photo précédente"
                style={{
                  position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
                  background: "rgba(255,255,255,0.92)", border: "none", borderRadius: "50%",
                  width: 36, height: 36, cursor: "pointer", fontWeight: 700, color: km.ink,
                  display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit",
                }}
              >‹</button>
              <button
                type="button"
                onClick={nextPhoto}
                aria-label="Photo suivante"
                style={{
                  position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                  background: "rgba(255,255,255,0.92)", border: "none", borderRadius: "50%",
                  width: 36, height: 36, cursor: "pointer", fontWeight: 700, color: km.ink,
                  display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit",
                }}
              >›</button>
              <div style={{ position: "absolute", bottom: 12, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 5 }}>
                {photos.map((_, i) => (
                  <span key={i} style={{ width: i === photoIdx ? 16 : 6, height: 6, borderRadius: 999, background: i === photoIdx ? "white" : "rgba(255,255,255,0.5)", transition: "all 0.2s" }} />
                ))}
              </div>
            </>
          )}
          {/* Close btn */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer l'aperçu"
            style={{
              position: "absolute", top: 14, right: 14,
              background: "rgba(255,255,255,0.92)", border: "none", borderRadius: "50%",
              width: 36, height: 36, cursor: "pointer", color: km.ink, fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          {/* Favori */}
          <button
            type="button"
            onClick={onToggleFavori}
            aria-label={favori ? "Retirer des favoris" : "Ajouter aux favoris"}
            style={{
              position: "absolute", top: 14, left: 14,
              background: "rgba(255,255,255,0.92)", border: "none", borderRadius: "50%",
              width: 36, height: 36, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill={favori ? "#b91c1c" : "none"} stroke={favori ? "#b91c1c" : km.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
          {/* Score pill overlay */}
          {scorePct !== null && (
            <span
              style={{
                position: "absolute", bottom: 16, right: 16,
                background: "rgba(17,17,17,0.78)", color: "white",
                padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                letterSpacing: "0.3px",
              }}
              aria-label={`${scorePct}% de compatibilité`}
            >
              {scorePct}% match
            </span>
          )}
        </div>

        {/* Body scrollable */}
        <div style={{ padding: "22px 28px 8px", overflowY: "auto", flex: 1 }}>
          {locLine && <KMEyebrow style={{ marginBottom: 6 }}>{locLine}</KMEyebrow>}
          <KMHeading as="h2" size={26} style={{ marginTop: 0, marginBottom: 10 }}>
            {annonce.titre || "Logement"}
          </KMHeading>

          {/* Specs inline */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: km.ink, flexWrap: "wrap", marginBottom: 14 }}>
            {annonce.surface != null && <span>{annonce.surface} m²</span>}
            {annonce.surface != null && annonce.pieces != null && <span style={{ color: km.line }}>·</span>}
            {annonce.pieces != null && <span>{annonce.pieces} {annonce.pieces > 1 ? "pièces" : "pièce"}</span>}
            {annonce.chambres != null && (<><span style={{ color: km.line }}>·</span><span>{annonce.chambres} ch.</span></>)}
            {annonce.etage != null && (<><span style={{ color: km.line }}>·</span><span>Ét. {annonce.etage === 0 ? "RDC" : annonce.etage}</span></>)}
            {annonce.dpe && (<><span style={{ color: km.line }}>·</span><KMDPE value={annonce.dpe} /></>)}
          </div>

          {/* Prix / charges */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 18, borderTop: `1px solid ${km.line}`, borderBottom: `1px solid ${km.line}`, padding: "14px 0" }}>
            <span style={{ fontSize: 28, fontWeight: 500, color: km.ink, letterSpacing: "-0.4px" }}>
              {annonce.prix?.toLocaleString("fr-FR") ?? "—"} €
              <span style={{ fontSize: 13, fontWeight: 400, color: km.muted }}> /mois</span>
            </span>
            <span style={{ fontSize: 12, color: km.muted, marginLeft: "auto" }}>
              {annonce.charges == null || annonce.charges === 0
                ? "Charges comprises"
                : `+ ${annonce.charges.toLocaleString("fr-FR")} € de charges`}
            </span>
          </div>

          {/* Amenities chips */}
          {amenities.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
              {amenities.map(a => <KMChip key={a}>{a}</KMChip>)}
            </div>
          )}

          {/* Description snippet */}
          {annonce.description && (
            <div style={{ marginBottom: 8 }}>
              <KMEyebrow style={{ marginBottom: 6 }}>Description</KMEyebrow>
              <p
                style={{
                  fontSize: 14, lineHeight: 1.6, color: km.ink, margin: 0,
                  display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {annonce.description}
              </p>
            </div>
          )}
        </div>

        {/* Footer CTAs */}
        <div
          style={{
            display: "flex", gap: 10, justifyContent: "flex-end",
            padding: "14px 28px", borderTop: `1px solid ${km.line}`,
            background: km.beige, flexShrink: 0, flexWrap: "wrap",
          }}
        >
          <a
            href={`/annonces/${annonce.id}`}
            style={{
              background: km.white, color: km.ink, border: `1px solid ${km.ink}`,
              borderRadius: 999, padding: "11px 25px",
              fontWeight: 600, fontSize: 11,
              textTransform: "uppercase", letterSpacing: "0.6px",
              textDecoration: "none", whiteSpace: "nowrap",
            }}
          >
            Voir la fiche
          </a>
          <a
            href={`/messages?annonce=${annonce.id}`}
            style={{
              background: km.ink, color: km.white, border: "none",
              borderRadius: 999, padding: "12px 26px",
              fontWeight: 700, fontSize: 11,
              textTransform: "uppercase", letterSpacing: "0.6px",
              textDecoration: "none", whiteSpace: "nowrap",
            }}
          >
            Candidater
          </a>
        </div>
      </div>
    </>
  )
}
