"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { supabase } from "../../../lib/supabase"
import { CARD_GRADIENTS } from "../../../lib/cardGradients"
import FadeIn from "./FadeIn"

/**
 * Grille 3 colonnes d'annonces en vedette.
 *
 * Volontairement PAS le même composant card que /annonces : ici on veut
 * un rendu éditorial (photo large format 4/5, titre posé, prix discret,
 * aucun badge "dispo / favori / 92 %"). /annonces reste UX-heavy, cette
 * grille reste vitrine.
 *
 * Fetch client-side avec 3 slots : si Supabase down, on affiche 3 slots
 * placeholder avec dégradé (évite le trou blanc + lien vers /annonces).
 */

type Annonce = {
  id: number
  titre: string | null
  ville: string | null
  prix: number | null
  surface: number | null
  pieces: number | null
  photos: string[] | null
}

export default function FeaturedListings({ isMobile, isTablet }: { isMobile: boolean; isTablet: boolean }) {
  const [items, setItems] = useState<Annonce[] | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase
        .from("annonces")
        .select("id, titre, ville, prix, surface, pieces, photos, statut, created_at")
        .or("statut.is.null,statut.neq.loué")
        .order("created_at", { ascending: false })
        .limit(6)
      if (!alive) return
      // Préférer les annonces avec photo pour la section éditoriale
      const withPhoto = (data || []).filter((a: any) => Array.isArray(a.photos) && a.photos.length > 0)
      const chosen = (withPhoto.length >= 3 ? withPhoto : (data || [])).slice(0, 3)
      setItems(chosen)
    })()
    return () => { alive = false }
  }, [])

  const gridCols = isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(3, 1fr)"

  return (
    <section style={{
      background: "white",
      padding: isMobile ? "72px 20px" : "140px 48px",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <FadeIn>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: 20,
            flexWrap: "wrap",
            marginBottom: isMobile ? 36 : 56,
            borderBottom: "1px solid #EAE6DF",
            paddingBottom: 22,
          }}>
            <div>
              <p style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#666",
                textTransform: "uppercase",
                letterSpacing: "1.8px",
                margin: 0,
                marginBottom: 14,
              }}>
                Sélection
              </p>
              <h2 style={{
                fontSize: isMobile ? 28 : 38,
                fontWeight: 500,
                letterSpacing: "-1px",
                color: "#111",
                margin: 0,
                lineHeight: 1.1,
              }}>
                Annonces en vedette
              </h2>
            </div>
            <Link
              href="/annonces"
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "#111",
                textDecoration: "none",
                borderBottom: "1px solid #111",
                paddingBottom: 2,
                letterSpacing: "0.3px",
                whiteSpace: "nowrap",
              }}
            >
              Voir toutes les annonces
            </Link>
          </div>
        </FadeIn>

        <div style={{
          display: "grid",
          gridTemplateColumns: gridCols,
          gap: isMobile ? 24 : 28,
        }}>
          {(items ?? Array.from({ length: 3 })).map((a, i) => (
            <FadeIn key={a?.id ?? `skel-${i}`} delay={i * 80}>
              <FeaturedCard annonce={a as Annonce | undefined} slot={i} />
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}

function FeaturedCard({ annonce, slot }: { annonce?: Annonce; slot: number }) {
  if (!annonce) {
    // Skeleton sobre
    return (
      <div style={{
        background: "#F7F4EF",
        borderRadius: 20,
        height: 420,
        animation: "keym-pulse 1.6s ease-in-out infinite",
      }}>
        <style>{`@keyframes keym-pulse{0%,100%{opacity:0.6}50%{opacity:0.9}}`}</style>
      </div>
    )
  }
  const photo = Array.isArray(annonce.photos) && annonce.photos.length > 0 ? annonce.photos[0] : null
  const gradient = CARD_GRADIENTS[slot % CARD_GRADIENTS.length]
  return (
    <Link
      href={`/annonces/${annonce.id}`}
      style={{
        display: "block",
        background: "white",
        borderRadius: 20,
        overflow: "hidden",
        textDecoration: "none",
        color: "#111",
        border: "1px solid #EAE6DF",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        transition: "transform 200ms ease, box-shadow 200ms ease",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = "translateY(-2px)"
        e.currentTarget.style.boxShadow = "0 12px 32px rgba(0,0,0,0.08)"
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "translateY(0)"
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)"
      }}
    >
      <div style={{
        position: "relative",
        aspectRatio: "4 / 5",
        background: photo ? "#000" : gradient,
        overflow: "hidden",
      }}>
        {photo ? (
          <Image
            src={photo}
            alt={annonce.titre ?? "Logement Keymatch-immo"}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            style={{ objectFit: "cover" }}
          />
        ) : (
          <span style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(17,17,17,0.25)",
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
          }}>
            Sans photo
          </span>
        )}
      </div>
      <div style={{ padding: "22px 22px 24px" }}>
        <p style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#666",
          textTransform: "uppercase",
          letterSpacing: "1.2px",
          margin: 0,
          marginBottom: 8,
        }}>
          {annonce.ville ?? "France"}
        </p>
        <h3 style={{
          fontSize: 18,
          fontWeight: 500,
          color: "#111",
          margin: 0,
          marginBottom: 14,
          lineHeight: 1.3,
          letterSpacing: "-0.2px",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>
          {annonce.titre ?? "Logement à louer"}
        </h3>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 10,
          paddingTop: 14,
          borderTop: "1px solid #EAE6DF",
          fontSize: 13,
          color: "#555",
        }}>
          <span>
            {annonce.surface ? `${annonce.surface} m²` : ""}
            {annonce.surface && annonce.pieces ? " · " : ""}
            {annonce.pieces ? `${annonce.pieces} p.` : ""}
          </span>
          {annonce.prix != null && (
            <span style={{ fontWeight: 700, color: "#111" }}>{annonce.prix} €<span style={{ fontWeight: 400, color: "#888", fontSize: 12 }}>/mois</span></span>
          )}
        </div>
      </div>
    </Link>
  )
}
