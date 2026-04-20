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
  scoreMatching?: number
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
        .filter((a: any) => !favSet.has(a.id)) // Skip les deja-likes
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
      background: "white",
      boxShadow: "0 20px 48px rgba(0,0,0,0.15)",
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
    return <main style={{ minHeight: "calc(100vh - 72px)", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280" }}>Chargement…</main>
  }

  return (
    <main style={{ minHeight: "calc(100vh - 72px)", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: "20px 20px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Hero slogan */}
      <div style={{ textAlign: "center", marginBottom: 24, maxWidth: 440 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: "1.5px", margin: 0 }}>Mode swipe — beta</p>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px", margin: "8px 0 4px", lineHeight: 1.15 }}>{SLOGAN}</h1>
        <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>{SUBLINE}</p>
      </div>

      {/* Stack zone */}
      <div style={{ position: "relative", width: "min(92vw, 380px)", height: 560, marginBottom: 24 }}>
        {/* Empty state */}
        {!current && (
          <div style={{ position: "absolute", inset: 0, background: "white", borderRadius: 24, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center", boxShadow: "0 20px 48px rgba(0,0,0,0.08)" }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, marginBottom: 10 }}>C&apos;est tout pour l&apos;instant</h2>
            <p style={{ fontSize: 14, color: "#6b7280", margin: 0, marginBottom: 20 }}>
              {stats.liked > 0
                ? <>Tu as mis <strong style={{ color: "#16a34a" }}>{stats.liked}</strong> coup{stats.liked > 1 ? "s" : ""} de cœur.<br />Retrouve-les dans tes favoris.</>
                : <>Pas de nouveaux logements à te proposer pour l&apos;instant.</>
              }
            </p>
            <Link href="/favoris" style={{ background: "#111", color: "white", padding: "12px 28px", borderRadius: 999, textDecoration: "none", fontSize: 14, fontWeight: 700 }}>
              Voir mes favoris
            </Link>
          </div>
        )}

        {/* Carte N+2 (dessous profondeur) */}
        {next2 && (
          <div style={{ position: "absolute", inset: 16, background: "white", borderRadius: 20, boxShadow: "0 8px 24px rgba(0,0,0,0.08)", opacity: 0.6, transform: "scale(0.92)", transformOrigin: "top center" }} />
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
        <div style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 18 }}>
          <button
            type="button"
            onClick={() => handleSwipe("left")}
            aria-label="Passer"
            disabled={!!exiting}
            style={{ width: 56, height: 56, borderRadius: "50%", background: "white", border: "1.5px solid #e5e7eb", color: "#9ca3af", cursor: exiting ? "not-allowed" : "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.06)", transition: "transform 0.1s" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
          <a href={`/annonces/${current.id}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#6b7280", textDecoration: "underline", fontWeight: 600 }}>
            Voir la fiche
          </a>
          <button
            type="button"
            onClick={() => handleSwipe("right")}
            aria-label="Coup de cœur"
            disabled={!!exiting}
            style={{ width: 68, height: 68, borderRadius: "50%", background: "#dc2626", color: "white", border: "none", cursor: exiting ? "not-allowed" : "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(220,38,38,0.3)" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="none" aria-hidden><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
          </button>
        </div>
      )}

      {/* Stats session */}
      <div style={{ display: "flex", gap: 24, fontSize: 12, color: "#9ca3af", fontWeight: 600, letterSpacing: "0.3px" }}>
        <span>Coups de cœur : <strong style={{ color: "#dc2626" }}>{stats.liked}</strong></span>
        <span>Passés : <strong style={{ color: "#374151" }}>{stats.skipped}</strong></span>
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
        background: "white",
        boxShadow: "0 12px 32px rgba(0,0,0,0.10)",
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
          <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(0,0,0,0.25)", fontSize: 13, fontWeight: 500 }}>
            Pas de photo
          </span>
        )}
        {/* Gradient overlay bas pour lisibilité titre */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(0,0,0,0.6) 0%, transparent 45%)" }} />
        {/* Badge compat */}
        {pct !== null && (
          <span style={{ position: "absolute", top: 14, left: 14, background: pct >= 70 ? "#16a34a" : pct >= 40 ? "#ea580c" : "#6b7280", color: "white", padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 800, letterSpacing: "0.3px" }}>
            {pct}% compat
          </span>
        )}
        {/* Label swipe en direct (LIKE / NOPE) */}
        {showLike && (
          <span style={{ position: "absolute", top: 22, right: 22, background: "#16a34a", color: "white", padding: "10px 18px", borderRadius: 10, fontSize: 22, fontWeight: 900, letterSpacing: "2px", transform: "rotate(14deg)", border: "3px solid white" }}>
            COUP DE COEUR
          </span>
        )}
        {showNope && (
          <span style={{ position: "absolute", top: 22, left: 22, background: "#374151", color: "white", padding: "10px 18px", borderRadius: 10, fontSize: 22, fontWeight: 900, letterSpacing: "2px", transform: "rotate(-14deg)", border: "3px solid white" }}>
            PASSER
          </span>
        )}
        {/* Infos overlay bottom */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "16px 18px", color: "white" }}>
          <p style={{ fontSize: 20, fontWeight: 800, margin: 0, lineHeight: 1.2, letterSpacing: "-0.3px" }}>{annonce.titre}</p>
          <p style={{ fontSize: 13, margin: "3px 0 0", opacity: 0.9 }}>{annonce.ville}</p>
        </div>
      </div>

      {/* Corps */}
      <div style={{ padding: "18px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: "#111" }}>{annonce.prix} €<span style={{ fontSize: 12, fontWeight: 500, color: "#9ca3af" }}>/mois</span></span>
          {annonce.dpe && <span style={{ fontSize: 11, fontWeight: 700, background: "#f3f4f6", padding: "3px 10px", borderRadius: 999, color: "#374151" }}>DPE {annonce.dpe}</span>}
        </div>
        <div style={{ display: "flex", gap: 10, fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
          {annonce.surface && <span>{annonce.surface} m²</span>}
          {annonce.pieces && <><span style={{ color: "#d1d5db" }}>·</span><span>{annonce.pieces} pièces</span></>}
          {annonce.meuble && <><span style={{ color: "#d1d5db" }}>·</span><span>Meublé</span></>}
        </div>
        {annonce.description && (
          <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5, margin: 0, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {annonce.description}
          </p>
        )}
      </div>
    </>
  )
}
