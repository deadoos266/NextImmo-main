"use client"
import { useEffect, useState, useRef, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { supabase } from "../../lib/supabase"
import { calculerScore, estExclu } from "../../lib/matching"
import { toggleFavori, getFavoris } from "../../lib/favoris"
import { CARD_GRADIENTS } from "../../lib/cardGradients"
import { km, KMBadge, KMEyebrow, KMHeading, KMDPE } from "../components/ui/km"

/**
 * Prototype mode swipe façon Tinder.
 * Paul : "Prototyper un mode swipe façon Tinder. Slogan : Arrêter de
 * chercher, commencer à matcher. Même pour votre logement."
 *
 * UX :
 * - Stack de 3 cartes empilées (la courante + 2 dessous pour preview profondeur)
 * - Drag horizontal avec pointer events : rotation + translate en temps réel
 * - Seuil threshold 120px : > droite = favori ajouté, < gauche = pass
 * - Boutons en bas (X / cœur) pour les non-tactiles
 * - Score matching affiché en haut de chaque carte
 *
 * Scope proto : pas de SUPER LIKE, pas d'historique, pas de undo.
 * Tourne en session memory, persistence = favoris existants (localStorage).
 */

type Annonce = {
  id: number
  titre: string
  ville: string | null
  prix: number | null
  surface: number | null
  pieces: number | null
  dpe: string | null
  meuble: boolean | null
  photos: string[] | null
  description: string | null
  scoreMatching?: number | null
}

const SLOGAN = "Arrêter de chercher, commencer à matcher."
const SUBLINE = "Même pour votre logement."

export default function SwipePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [deck, setDeck] = useState<Annonce[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [drag, setDrag] = useState<{ x: number; startX: number; pointerId: number } | null>(null)
  const [exiting, setExiting] = useState<"left" | "right" | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [stats, setStats] = useState({ liked: 0, skipped: 0 })

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth?redirect=/swipe")
      return
    }
    if (status !== "authenticated") return
    ;(async () => {
      const { data: all } = await supabase
        .from("annonces")
        .select("id, titre, ville, prix, surface, pieces, dpe, meuble, photos, description, balcon, terrasse, jardin, animaux, parking, ascenseur, type_bien, fibre, cave, statut, charges, duree_bail, proprietaire_email")
        .or("statut.is.null,statut.neq.loué")
        .limit(60)
      let profil: any = null
      if (session?.user?.email) {
        const { data: p } = await supabase.from("profils").select("*").eq("email", session.user.email).single()
        profil = p
      }
      const favSet = new Set(getFavoris())
      const enriched = (all || [])
        .filter((a: any) => !profil || !estExclu(a, profil))
        .filter((a: any) => !favSet.has(a.id)) // Skip les déjà-likes
        .map((a: any) => ({ ...a, scoreMatching: profil ? calculerScore(a, profil) : null }))
        .sort((a: any, b: any) => (b.scoreMatching ?? 0) - (a.scoreMatching ?? 0))
      setDeck(enriched)
      setLoading(false)
    })()
  }, [status, session, router])

  const current = deck[index]
  const next1 = deck[index + 1]
  const next2 = deck[index + 2]

  const handleSwipe = useCallback((dir: "left" | "right") => {
    if (exiting || !current) return
    setExiting(dir)
    if (dir === "right") {
      toggleFavori(current.id)
      setStats(s => ({ ...s, liked: s.liked + 1 }))
    } else {
      setStats(s => ({ ...s, skipped: s.skipped + 1 }))
    }
    // Anim 280ms puis on avance
    setTimeout(() => {
      setIndex(i => i + 1)
      setExiting(null)
      setDrag(null)
    }, 280)
  }, [current, exiting])

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (exiting) return
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    setDrag({ x: 0, startX: e.clientX, pointerId: e.pointerId })
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== e.pointerId || exiting) return
    setDrag({ ...drag, x: e.clientX - drag.startX })
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== e.pointerId || exiting) return
    const threshold = 120
    if (drag.x > threshold) handleSwipe("right")
    else if (drag.x < -threshold) handleSwipe("left")
    else setDrag(null)
  }

  // Rotation + translation calcul CSS
  const cardStyle: React.CSSProperties = (() => {
    const base: React.CSSProperties = {
      position: "absolute",
      inset: 0,
      borderRadius: 24,
      overflow: "hidden",
      background: km.white,
      border: `1px solid ${km.line}`,
      boxShadow: "0 20px 48px rgba(17,17,17,0.12)",
      touchAction: "none",
      cursor: drag ? "grabbing" : "grab",
      userSelect: "none",
      willChange: "transform",
    }
    if (exiting) {
      const off = exiting === "right" ? 800 : -800
      base.transform = `translateX(${off}px) rotate(${exiting === "right" ? 24 : -24}deg)`
      base.transition = "transform 0.28s ease-out, opacity 0.28s ease-out"
      base.opacity = 0
      return base
    }
    if (drag) {
      const rot = drag.x / 20
      base.transform = `translateX(${drag.x}px) rotate(${rot}deg)`
    }
    return base
  })()

  if (status === "loading" || loading) {
    return (
      <main style={{
        minHeight: "calc(100vh - 72px)",
        background: km.beige,
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: km.muted, fontSize: 13,
        textTransform: "uppercase", letterSpacing: "1.2px",
      }}>Chargement…</main>
    )
  }

  return (
    <main style={{
      minHeight: "calc(100vh - 72px)",
      background: km.beige,
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      padding: "24px 20px 40px",
      display: "flex", flexDirection: "column", alignItems: "center",
    }}>
      {/* Hero éditorial */}
      <div style={{ textAlign: "center", marginBottom: 28, maxWidth: 460 }}>
        <KMEyebrow style={{ marginBottom: 14 }}>Mode swipe · Beta</KMEyebrow>
        <KMHeading as="h1" size={30} style={{ marginBottom: 10 }}>
          {SLOGAN}
        </KMHeading>
        <p style={{ fontSize: 14, color: km.muted, margin: 0, lineHeight: 1.5 }}>{SUBLINE}</p>
      </div>

      {/* Stack zone */}
      <div style={{ position: "relative", width: "min(92vw, 380px)", height: 560, marginBottom: 28 }}>
        {/* Empty state */}
        {!current && (
          <div style={{
            position: "absolute", inset: 0,
            background: km.white,
            border: `1px solid ${km.line}`,
            borderRadius: 24,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: 32, textAlign: "center",
            boxShadow: "0 20px 48px rgba(17,17,17,0.06)",
          }}>
            <KMEyebrow style={{ marginBottom: 14 }}>Session terminée</KMEyebrow>
            <KMHeading as="h2" size={24} style={{ marginBottom: 12 }}>
              C&apos;est tout pour l&apos;instant.
            </KMHeading>
            <p style={{ fontSize: 14, color: km.muted, margin: 0, marginBottom: 24, lineHeight: 1.5 }}>
              {stats.liked > 0
                ? <>Vous avez mis <strong style={{ color: km.successText }}>{stats.liked}</strong> coup{stats.liked > 1 ? "s" : ""} de cœur.<br />Retrouvez-les dans vos favoris.</>
                : <>Pas de nouveaux logements à vous proposer pour l&apos;instant.</>
              }
            </p>
            <Link href="/favoris" style={{
              background: km.ink, color: km.white,
              padding: "14px 32px", borderRadius: 999,
              textDecoration: "none",
              fontSize: 11, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.6px",
            }}>
              Voir mes favoris
            </Link>
          </div>
        )}

        {/* Carte N+2 (dessous profondeur) */}
        {next2 && (
          <div style={{
            position: "absolute", inset: 16,
            background: km.white,
            border: `1px solid ${km.line}`,
            borderRadius: 20,
            boxShadow: "0 8px 24px rgba(17,17,17,0.06)",
            opacity: 0.6, transform: "scale(0.92)", transformOrigin: "top center",
          }} />
        )}
        {/* Carte N+1 (dessous) */}
        {next1 && (
          <SwipeCard annonce={next1} stacked="next" cardRef={null} />
        )}
        {/* Carte courante */}
        {current && (
          <div
            ref={cardRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDrag(null)}
            style={cardStyle}
          >
            <SwipeCardContent annonce={current} dragX={drag?.x || 0} />
          </div>
        )}
      </div>

      {/* Boutons actions */}
      {current && (
        <div style={{ display: "flex", gap: 24, alignItems: "center", marginBottom: 22 }}>
          <button
            type="button"
            onClick={() => handleSwipe("left")}
            aria-label="Passer"
            disabled={!!exiting}
            style={{
              width: 56, height: 56, borderRadius: "50%",
              background: km.white,
              border: `1px solid ${km.line}`,
              color: km.muted,
              cursor: exiting ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 12px rgba(17,17,17,0.04)",
              transition: "transform 0.12s ease, border-color 0.12s ease",
            }}
            onMouseEnter={e => {
              if (!exiting) {
                (e.currentTarget as HTMLButtonElement).style.borderColor = km.ink
                ;(e.currentTarget as HTMLButtonElement).style.color = km.ink
              }
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = km.line
              ;(e.currentTarget as HTMLButtonElement).style.color = km.muted
            }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>

          <a href={`/annonces/${current.id}`} target="_blank" rel="noopener noreferrer" style={{
            fontSize: 10, color: km.muted, textDecoration: "underline",
            textUnderlineOffset: 4,
            fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px",
          }}>
            Voir la fiche
          </a>

          <button
            type="button"
            onClick={() => handleSwipe("right")}
            aria-label="Coup de cœur"
            disabled={!!exiting}
            style={{
              width: 68, height: 68, borderRadius: "50%",
              background: km.ink,
              color: km.white,
              border: "none",
              cursor: exiting ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 10px 28px rgba(17,17,17,0.28)",
              transition: "transform 0.12s ease",
            }}
            onMouseEnter={e => { if (!exiting) (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.05)" }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="none" aria-hidden><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
          </button>
        </div>
      )}

      {/* Stats session — typographie éditoriale */}
      <div style={{
        display: "flex", gap: 28,
        fontSize: 10, color: km.muted,
        fontWeight: 700, letterSpacing: "1.2px",
        textTransform: "uppercase",
      }}>
        <span>Cœurs&nbsp;<strong style={{ color: km.ink, fontSize: 13, letterSpacing: "-0.2px" }}>{stats.liked}</strong></span>
        <span style={{ color: km.line }}>·</span>
        <span>Passés&nbsp;<strong style={{ color: km.ink, fontSize: 13, letterSpacing: "-0.2px" }}>{stats.skipped}</strong></span>
      </div>
    </main>
  )
}

// ─── Card sous-composants ────────────────────────────────────────────────

function SwipeCard({ annonce, stacked, cardRef }: { annonce: Annonce; stacked: "next" | "current"; cardRef: React.RefObject<HTMLDivElement> | null }) {
  const offset = stacked === "next" ? 8 : 0
  const scale = stacked === "next" ? 0.96 : 1
  return (
    <div
      ref={cardRef}
      style={{
        position: "absolute",
        inset: offset,
        borderRadius: 24,
        overflow: "hidden",
        background: km.white,
        border: `1px solid ${km.line}`,
        boxShadow: "0 12px 32px rgba(17,17,17,0.08)",
        opacity: stacked === "next" ? 0.8 : 1,
        transform: `scale(${scale})`,
        transformOrigin: "top center",
      }}
    >
      <SwipeCardContent annonce={annonce} dragX={0} />
    </div>
  )
}

function SwipeCardContent({ annonce, dragX }: { annonce: Annonce; dragX: number }) {
  const photo = Array.isArray(annonce.photos) && annonce.photos.length > 0 ? annonce.photos[0] : null
  const base = CARD_GRADIENTS[annonce.id % CARD_GRADIENTS.length]
  const showLike = dragX > 60
  const showNope = dragX < -60
  const pct = annonce.scoreMatching ? Math.round(annonce.scoreMatching / 10) : null

  return (
    <>
      {/* Photo */}
      <div style={{ position: "relative", height: 320, background: photo ? "#000" : base }}>
        {photo ? (
          <Image src={photo} alt={annonce.titre} fill sizes="380px" style={{ objectFit: "cover" }} />
        ) : (
          <span style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "rgba(0,0,0,0.3)", fontSize: 11, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "1.4px",
          }}>
            Pas de photo
          </span>
        )}
        {/* Gradient overlay bas pour lisibilité titre */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(0,0,0,0.6) 0%, transparent 45%)" }} />
        {/* Badge compat — style KM variant */}
        {pct !== null && (
          <div style={{ position: "absolute", top: 14, left: 14 }}>
            <KMBadge variant={pct >= 70 ? "success" : pct >= 40 ? "warn" : "neutral"}>
              {pct}% compat
            </KMBadge>
          </div>
        )}
        {/* Label swipe en direct (COEUR / PASSER) */}
        {showLike && (
          <span style={{
            position: "absolute", top: 22, right: 22,
            background: km.successText, color: km.white,
            padding: "10px 16px", borderRadius: 6,
            fontSize: 13, fontWeight: 800, letterSpacing: "2px",
            textTransform: "uppercase",
            transform: "rotate(14deg)",
            border: `3px solid ${km.white}`,
          }}>
            Coup de cœur
          </span>
        )}
        {showNope && (
          <span style={{
            position: "absolute", top: 22, left: 22,
            background: km.ink, color: km.white,
            padding: "10px 16px", borderRadius: 6,
            fontSize: 13, fontWeight: 800, letterSpacing: "2px",
            textTransform: "uppercase",
            transform: "rotate(-14deg)",
            border: `3px solid ${km.white}`,
          }}>
            Passer
          </span>
        )}
        {/* Infos overlay bottom — Fraunces italic sur titre */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "16px 18px", color: km.white }}>
          <p style={{
            fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif",
            fontStyle: "italic", fontWeight: 500,
            fontSize: 22, letterSpacing: "-0.3px",
            margin: 0, lineHeight: 1.2,
          }}>{annonce.titre}</p>
          <p style={{ fontSize: 12, margin: "4px 0 0", opacity: 0.88, textTransform: "uppercase", letterSpacing: "1.2px", fontWeight: 600 }}>{annonce.ville}</p>
        </div>
      </div>

      {/* Corps */}
      <div style={{ padding: "18px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{
            fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif",
            fontStyle: "italic", fontWeight: 500,
            fontSize: 26, letterSpacing: "-0.4px",
            color: km.ink,
          }}>
            {annonce.prix} €
            <span style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", fontStyle: "normal", fontSize: 12, fontWeight: 500, color: km.muted, marginLeft: 4 }}>/mois</span>
          </span>
          {annonce.dpe && <KMDPE value={annonce.dpe as any} />}
        </div>
        <div style={{ display: "flex", gap: 10, fontSize: 12, color: km.muted, marginBottom: 14, textTransform: "uppercase", letterSpacing: "1px", fontWeight: 600 }}>
          {annonce.surface && <span>{annonce.surface} m²</span>}
          {annonce.pieces && <><span style={{ color: km.line }}>·</span><span>{annonce.pieces} pièces</span></>}
          {annonce.meuble && <><span style={{ color: km.line }}>·</span><span>Meublé</span></>}
        </div>
        {annonce.description && (
          <p style={{
            fontSize: 13, color: km.muted, lineHeight: 1.55, margin: 0,
            display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {annonce.description}
          </p>
        )}
      </div>
    </>
  )
}
