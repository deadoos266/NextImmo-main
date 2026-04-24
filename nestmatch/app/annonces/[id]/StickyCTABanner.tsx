"use client"
import { useSession } from "next-auth/react"
import { useEffect, useRef, useState } from "react"
import { supabase } from "../../../lib/supabase"
import { useRole } from "../../providers"
import { calculerScore } from "../../../lib/matching"
import ContactButton from "./ContactButton"

/**
 * StickyCTABanner — R10.10
 *
 * Bandeau fixé en bas de l'écran, apparaît UNIQUEMENT quand la card sticky
 * droite (avec bouton Contacter) n'est plus visible au viewport. Fade 200ms.
 *
 * Contenu : prix CC + score compat (chip vert/orange/gris) + bouton Contacter.
 *
 * IntersectionObserver :
 *   - Target = la card sticky droite (injecté via data-r-sticky-target sur
 *     l'élément parent dans page.tsx, mais on observe directement l'ID
 *     `r-sticky-card-target` exposé par le parent).
 *   - Quand la target n'intersecte plus → on affiche le bandeau.
 *   - Quand elle revient visible → on masque.
 *
 * a11y :
 *   - role="complementary" + aria-label descriptif
 *   - aria-hidden mirror de isVisible (le bandeau n'est pas focusable tant
 *     qu'invisible)
 *
 * Mobile : layout condensé sous 640px (prix + compat empilés à gauche, bouton
 * droite), le tout gère le viewport height iOS via padding-bottom safe-area.
 */
export default function StickyCTABanner({ annonce }: { annonce: any }) {
  const { data: session, status } = useSession()
  const { role } = useRole()
  const [visible, setVisible] = useState(false)
  const [profil, setProfil] = useState<any>(null)
  const [mounted, setMounted] = useState(false)
  const bannerRef = useRef<HTMLDivElement | null>(null)

  const loyerCC = Number(annonce.prix || 0) + Number(annonce.charges || 0)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (session?.user?.email) {
      supabase.from("profils").select("*").eq("email", session.user.email).maybeSingle()
        .then(({ data }) => { setProfil(data || null) })
    }
  }, [session])

  useEffect(() => {
    if (!mounted) return
    const target = document.getElementById("r-sticky-card-target")
    if (!target) return
    const io = new IntersectionObserver(
      entries => {
        const e = entries[0]
        if (!e) return
        // Invisible = bandeau affiché. Intersecte = bandeau masqué.
        setVisible(!e.isIntersecting)
      },
      { threshold: 0, rootMargin: "0px 0px -80px 0px" }
    )
    io.observe(target)
    return () => io.disconnect()
  }, [mounted])

  // Owner sur sa propre annonce → pas de bandeau (déjà pas de contact)
  if (role === "proprietaire" && session?.user?.email === annonce.proprietaire_email) return null
  if (role === "proprietaire") return null

  const pct = profil ? Math.round(calculerScore(annonce, profil) / 10) : null
  const scoreChip = (() => {
    if (pct === null) return null
    if (pct >= 70) return { bg: "#F0FAEE", color: "#15803d", text: `${pct} % compat.` }
    if (pct >= 50) return { bg: "#FFF4E5", color: "#a16207", text: `${pct} % compat.` }
    return { bg: "#EAE6DF", color: "#8a8477", text: `${pct} % compat.` }
  })()

  const statusLabel = status === "loading" ? null : null

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 639px) {
          .r-sticky-cta-inner { gap: 10px !important; padding: 10px 16px !important; }
          .r-sticky-cta-price-wrap { flex-direction: column !important; align-items: flex-start !important; gap: 4px !important; }
          .r-sticky-cta-contact { padding: 10px 14px !important; font-size: 13px !important; }
          .r-sticky-cta-price { font-size: 16px !important; }
          .r-sticky-cta-charges { font-size: 10px !important; }
        }
      ` }} />
      <div
        ref={bannerRef}
        role="complementary"
        aria-label="Barre d'action — prix et contact"
        aria-hidden={!visible}
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 60,
          background: "white",
          borderTop: "1.5px solid #EAE6DF",
          boxShadow: "0 -4px 24px rgba(0,0,0,0.08)",
          transform: visible ? "translateY(0)" : "translateY(100%)",
          opacity: visible ? 1 : 0,
          transition: "transform 200ms ease, opacity 200ms ease",
          pointerEvents: visible ? "auto" : "none",
          paddingBottom: "env(safe-area-inset-bottom, 0)",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div className="r-sticky-cta-inner" style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}>
          <div className="r-sticky-cta-price-wrap" style={{ display: "flex", alignItems: "baseline", gap: 14, flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span className="r-sticky-cta-price" style={{
                fontSize: 18,
                fontWeight: 400,
                fontStyle: "italic",
                fontFamily: "'Fraunces', 'DM Sans', serif",
                color: "#111",
                letterSpacing: "-0.3px",
                whiteSpace: "nowrap",
              }}>
                {loyerCC > 0 ? `${loyerCC} €/mois` : `${annonce.prix} €/mois`}
              </span>
              <span className="r-sticky-cta-charges" style={{ fontSize: 11, color: "#8a8477", letterSpacing: "0.2px" }}>
                {annonce.charges
                  ? `charges comprises · ${annonce.charges} €`
                  : "charges comprises"}
              </span>
            </div>
            {scoreChip && (
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "4px 10px",
                borderRadius: 999,
                background: scoreChip.bg,
                color: scoreChip.color,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.2px",
                whiteSpace: "nowrap",
              }}>
                {scoreChip.text}
              </span>
            )}
          </div>
          <div className="r-sticky-cta-contact" style={{ flexShrink: 0, minWidth: 0 }}>
            <ContactButton annonce={annonce} />
          </div>
        </div>
        {statusLabel}
      </div>
    </>
  )
}
