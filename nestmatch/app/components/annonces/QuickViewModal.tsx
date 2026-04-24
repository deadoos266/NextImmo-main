"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { km, KMEyebrow, KMHeading, KMChip, KMDPE, KMMatchRing } from "../ui/km"
import { CARD_GRADIENTS as GRADIENTS } from "../../../lib/cardGradients"
import { getCityCoords } from "../../../lib/cityCoords"
import Lightbox from "../ui/Lightbox"

/**
 * QuickView — aperçu rapide d'une annonce sans quitter /annonces (R10.2 + R10.4).
 *
 * Ouvert depuis le bouton "Aperçu" d'une card de liste. Affiche :
 *  - Carrousel photo (clic = Lightbox fullscreen)
 *  - Titre + ville · quartier + specs (surface/pièces/chambres/étage/DPE)
 *  - Breakdown loyer (HC / charges / total CC) en ligne propre
 *  - Match ring si user connecté + profil cohérent
 *  - Distance depuis la ville active (URL ou profil)
 *  - Date de publication relative ("il y a N jours")
 *  - Chips amenities (top 5)
 *  - Snippet description (clamp 3 lignes)
 *  - CTAs : "Voir la fiche" + "Candidater"
 *
 * Accessibilité : Escape ferme, scroll lock body. Cliquer sur la photo
 * ouvre la Lightbox générique (Escape + flèches + swipe).
 */

// ─── Helpers hors composant (focus preservation + purs) ────────────────────

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371
  const dLat = ((b[0] - a[0]) * Math.PI) / 180
  const dLng = ((b[1] - a[1]) * Math.PI) / 180
  const lat1 = (a[0] * Math.PI) / 180
  const lat2 = (b[0] * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

function relativePast(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const diffMs = Date.now() - d.getTime()
  if (diffMs < 0) return null
  const day = 24 * 60 * 60 * 1000
  const j = Math.floor(diffMs / day)
  if (j === 0) return "Aujourd'hui"
  if (j === 1) return "Hier"
  if (j < 7) return `Il y a ${j} jours`
  if (j < 30) return `Il y a ${Math.floor(j / 7)} sem.`
  if (j < 365) return `Il y a ${Math.floor(j / 30)} mois`
  return `Il y a ${Math.floor(j / 365)} an${Math.floor(j / 365) > 1 ? "s" : ""}`
}

interface QuickViewProps {
  annonce: any | null
  open: boolean
  onClose: () => void
  score: number | null
  favori: boolean
  onToggleFavori: () => void
  userVille?: string | null
}

export default function QuickViewModal({ annonce, open, onClose, score, favori, onToggleFavori, userVille }: QuickViewProps) {
  const [photoIdx, setPhotoIdx] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setPhotoIdx(0)
    setLightboxOpen(false)
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
  const topAmenities = amenities.slice(0, 5)

  const locLine = [annonce.ville, annonce.quartier].filter(Boolean).join(" · ")
  const scorePct = score !== null ? Math.max(0, Math.min(100, Math.round(score / 10))) : null

  // Loyer breakdown
  const prix = typeof annonce.prix === "number" ? annonce.prix : null
  const charges = typeof annonce.charges === "number" && annonce.charges > 0 ? annonce.charges : null
  const totalCC = prix !== null ? prix + (charges ?? 0) : null

  // Distance depuis userVille
  let distanceKm: number | null = null
  if (userVille && annonce.ville && userVille.toLowerCase().trim() !== annonce.ville.toLowerCase().trim()) {
    const a = getCityCoords(userVille)
    const b = getCityCoords(annonce.ville)
    if (a && b) distanceKm = Math.round(haversineKm(a, b))
  }

  const datePub = relativePast(annonce.created_at ?? null)

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
        {/* Photo header (cliquable → Lightbox) */}
        <div
          style={{ position: "relative", aspectRatio: "16 / 9", background: current ? "#000" : base, flexShrink: 0, cursor: current ? "zoom-in" : "default" }}
          onClick={() => { if (current) setLightboxOpen(true) }}
        >
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
                onClick={(e) => { e.stopPropagation(); prevPhoto() }}
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
                onClick={(e) => { e.stopPropagation(); nextPhoto() }}
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
            onClick={(e) => { e.stopPropagation(); onClose() }}
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
            onClick={(e) => { e.stopPropagation(); onToggleFavori() }}
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
          {/* Date pub pill bottom-left */}
          {datePub && (
            <span
              style={{
                position: "absolute", bottom: 16, left: 16,
                background: "rgba(17,17,17,0.78)", color: "white",
                padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                letterSpacing: "0.3px",
              }}
            >
              {datePub}
            </span>
          )}
        </div>

        {/* Body scrollable */}
        <div style={{ padding: "22px 28px 8px", overflowY: "auto", flex: 1 }}>
          {/* Header row : Titre+loc à gauche, KMMatchRing à droite si connecté */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 10 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              {locLine && <KMEyebrow style={{ marginBottom: 6 }}>{locLine}</KMEyebrow>}
              <KMHeading as="h2" size={26} style={{ marginTop: 0, marginBottom: 0 }}>
                {annonce.titre || "Logement"}
              </KMHeading>
            </div>
            {scorePct !== null && (
              <div style={{ flexShrink: 0 }} title={`${scorePct}% de compatibilité`}>
                <KMMatchRing score={scorePct} size={56} />
              </div>
            )}
          </div>

          {/* Distance depuis ville user */}
          {distanceKm !== null && userVille && (
            <div style={{ fontSize: 12, color: km.muted, marginBottom: 12 }}>
              À environ <strong style={{ color: km.ink, fontWeight: 600 }}>{distanceKm} km</strong> de {userVille}
            </div>
          )}

          {/* Specs inline */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: km.ink, flexWrap: "wrap", marginBottom: 14 }}>
            {annonce.surface != null && <span>{annonce.surface} m²</span>}
            {annonce.surface != null && annonce.pieces != null && <span style={{ color: km.line }}>·</span>}
            {annonce.pieces != null && <span>{annonce.pieces} {annonce.pieces > 1 ? "pièces" : "pièce"}</span>}
            {annonce.chambres != null && (<><span style={{ color: km.line }}>·</span><span>{annonce.chambres} ch.</span></>)}
            {annonce.etage != null && (<><span style={{ color: km.line }}>·</span><span>Ét. {annonce.etage === 0 ? "RDC" : annonce.etage}</span></>)}
            {annonce.dpe && (<><span style={{ color: km.line }}>·</span><KMDPE value={annonce.dpe} /></>)}
          </div>

          {/* Loyer breakdown : HC / charges / CC en 1 ligne */}
          <div style={{ borderTop: `1px solid ${km.line}`, borderBottom: `1px solid ${km.line}`, padding: "14px 0", marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 28, fontWeight: 500, color: km.ink, letterSpacing: "-0.4px" }}>
                {totalCC !== null ? totalCC.toLocaleString("fr-FR") : "—"} €
                <span style={{ fontSize: 13, fontWeight: 400, color: km.muted }}> /mois CC</span>
              </span>
            </div>
            {prix !== null && (
              <div style={{ marginTop: 6, fontSize: 12, color: km.muted, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span>{prix.toLocaleString("fr-FR")} € HC</span>
                <span>·</span>
                <span>
                  {charges !== null
                    ? `+ ${charges.toLocaleString("fr-FR")} € charges`
                    : "Charges comprises"}
                </span>
              </div>
            )}
          </div>

          {/* Amenities chips (top 5) */}
          {topAmenities.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
              {topAmenities.map(a => <KMChip key={a}>{a}</KMChip>)}
            </div>
          )}

          {/* Description snippet (3 lignes) */}
          {annonce.description && (
            <div style={{ marginBottom: 8 }}>
              <KMEyebrow style={{ marginBottom: 6 }}>Description</KMEyebrow>
              <p
                style={{
                  fontSize: 14, lineHeight: 1.6, color: km.ink, margin: 0,
                  display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
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

      {/* Lightbox par-dessus (z-index 10000 > modal 9001) */}
      {photos.length > 0 && (
        <Lightbox
          photos={photos}
          initialIndex={photoIdx}
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  )
}
