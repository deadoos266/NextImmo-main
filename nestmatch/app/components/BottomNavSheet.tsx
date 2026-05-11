"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { useRole } from "../providers"
import { km } from "./ui/km"

// V81.14 — Tokens design system locaux pour ce composant. Toutes les
// valeurs spacing/radius/font sont centralisées ici, pas hardcodées dans
// les styles plus bas. Si on veut changer un radius ou un padding, on
// touche UN endroit. Cohérent avec la philosophie km.* du projet.
const tokens = {
  // Spacing
  gapXs: 4,
  gapSm: 8,
  gapMd: 14,
  gapLg: 20,
  // Padding
  itemPaddingY: 14,
  itemPaddingX: 16,
  // Radius
  radiusXl: 24,   // sheet top corners
  radiusLg: 16,   // modal desktop
  radiusMd: 14,   // items, buttons
  radiusSm: 12,   // icon containers
  // Sizes
  itemMinHeight: 56,
  iconBox: 40,
  closeBtn: 36,
  // Fonts (chained avec CSS variables next/font + fallback)
  fontBody: "var(--font-dm-sans), 'DM Sans', sans-serif",
  fontDisplay: "var(--font-fraunces), 'Fraunces', Georgia, serif",
  // Typography scale
  itemLabelSize: 14,
  itemDescSize: 11.5,
  sectionLabelSize: 10,
  titleSize: 22,
} as const

// V81.14 — Breakpoint sync avec useResponsive (lib/hooks/useResponsive.ts)
// pour cohérence mobile/tablet/desktop dans tout le projet.
function useViewport() {
  const [v, setV] = useState<{ w: number; isMobile: boolean; isTabletOrAbove: boolean }>({
    w: 1200, isMobile: false, isTabletOrAbove: true,
  })
  useEffect(() => {
    function update() {
      const w = window.innerWidth
      setV({ w, isMobile: w < 640, isTabletOrAbove: w >= 640 })
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])
  return v
}

/**
 * V81.13 — Slide-up sheet déclenché depuis BottomNavMobile pour donner
 * accès à TOUS les onglets/sections du site (pas juste les 5 tabs).
 *
 * V81.14 — RESPONSIVE adaptation + tokens design system centralisés.
 *
 * Comportement adaptatif (feedback Paul "que ça s'adapte les composants") :
 *  - MOBILE (<640) : bottom sheet slide-up (pattern iOS Control Center)
 *      → coins arrondis top, full-width, handle gris, safe-area inset
 *  - TABLET/DESKTOP (≥640) : modal centré avec fade-in
 *      → max-width 520px, radius 16, animation scale+fade
 *      → backdrop click ou ESC ferme, X en haut à droite
 *
 * Tokens design (objet `tokens` ci-dessus) :
 *  - Toutes les valeurs spacing/radius/font sont centralisées en haut
 *  - Modifier un radius/padding = 1 seul endroit à changer
 *  - Cohérent avec km.* (palette couleurs) du projet
 *
 * Iconographie cohérente avec BottomNavMobile (SVG outlines stroke=2).
 * Liens adaptés au rôle (proprietaireActive de useRole()).
 */

interface Props {
  open: boolean
  onClose: () => void
}

interface LinkItem {
  href: string
  label: string
  desc?: string
  Icon: () => React.JSX.Element
}

// Icons (cohérent avec BottomNavMobile + km style)
const Icons = {
  Profil: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Dossier: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h6"/></svg>,
  Favoris: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  Recherches: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>,
  Visites: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Candidatures: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  Comparer: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>,
  Bail: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/></svg>,
  Quittances: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  Biens: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a2 2 0 0 1-2 2h-4v-6h-6v6H5a2 2 0 0 1-2-2V9.5z"/></svg>,
  Ajouter: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Settings: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  Aide: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Logout: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  // V81.27 — Nouveaux icônes pour l'audit complet menu proprio
  Stats: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  EDL: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  Carnet: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  Documents: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
}

export default function BottomNavSheet({ open, onClose }: Props) {
  const pathname = usePathname() || "/"
  const { proprietaireActive } = useRole()
  const { isMobile } = useViewport()

  // ESC closes + body scroll lock when open
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  // Liens organisés par section selon le rôle.
  // V81.26 — /profil et /dossier redirigent vers /proprietaire quand
  // proprietaireActive (V51.1 — la page profil locataire fait doublon
  // pour les proprios qui n'ont pas de critères de matching à régler).
  // Conséquence : on cache ces 2 items du sheet en mode proprio pour
  // éviter le redirect non-attendu vers Mes biens.
  // Feedback Paul : "quand je clique sur mon profil ça m'envoie vers
  // mes biens en tant que proprio et pareil pour le truc mon dossier".
  const sectionMonCompte: LinkItem[] = proprietaireActive
    ? [
        { href: "/parametres", label: "Paramètres", desc: "Compte, notifications, RGPD", Icon: Icons.Settings },
      ]
    : [
        { href: "/profil", label: "Mon profil", desc: "Préférences, infos perso", Icon: Icons.Profil },
        { href: "/dossier", label: "Mon dossier", desc: "Pièces justificatives", Icon: Icons.Dossier },
        { href: "/parametres", label: "Paramètres", desc: "Compte, notifications, RGPD", Icon: Icons.Settings },
      ]

  // V81.19 — liens corrigés pour pointer vers routes existantes uniquement
  // (audit screenshots Paul : /comparer et /aide 404, retirés).
  // V81.27 — Audit complet menu proprio (feedback Paul) : ajout EDL,
  // Stats, Carnet d'entretien, Documents. Items locataire-only restent
  // cachés via la branche ternaire ci-dessous.
  // Routes vérifiées dans app/(authenticated)/ et app/(public)/.
  const sectionLocataire: LinkItem[] = [
    { href: "/favoris", label: "Mes favoris", desc: "Annonces sauvegardées", Icon: Icons.Favoris },
    { href: "/recherches-sauvegardees", label: "Mes recherches", desc: "Filtres mémorisés", Icon: Icons.Recherches },
    { href: "/mes-candidatures", label: "Mes candidatures", desc: "Suivi des dossiers envoyés", Icon: Icons.Candidatures },
    { href: "/visites", label: "Mes visites", desc: "Demandes et confirmations", Icon: Icons.Visites },
    { href: "/mon-logement", label: "Mon logement", desc: "Bail en cours, locations passées", Icon: Icons.Bail },
    { href: "/mes-documents", label: "Mes documents", desc: "Quittances reçues, dossier signé", Icon: Icons.Documents },
  ]

  const sectionProprio: LinkItem[] = [
    { href: "/proprietaire", label: "Mes biens", desc: "Tous mes logements", Icon: Icons.Biens },
    { href: "/proprietaire/ajouter", label: "Publier une annonce", desc: "Nouveau bien à louer", Icon: Icons.Ajouter },
    { href: "/proprietaire/stats", label: "Statistiques", desc: "Pipeline candidats, performances", Icon: Icons.Stats },
    { href: "/visites", label: "Visites planifiées", desc: "Mon agenda candidats", Icon: Icons.Visites },
    { href: "/proprietaire/baux/historique", label: "Baux", desc: "Contrats en cours / archivés", Icon: Icons.Bail },
    { href: "/mes-quittances", label: "Quittances", desc: "Loyers encaissés & PDFs", Icon: Icons.Quittances },
    // V81.28 — /edl retiré : la page redirige vers /proprietaire (doublon
    // avec Mes biens). Les EDL sont accessibles via la fiche bien → onglet
    // EDL. Pas de landing utile au niveau global.
    { href: "/carnet", label: "Carnet d'entretien", desc: "Réparations & interventions", Icon: Icons.Carnet },
    { href: "/mes-documents", label: "Mes documents", desc: "Diagnostics, annexes, archives", Icon: Icons.Documents },
  ]

  const sectionAide: LinkItem[] = [
    { href: "/contact", label: "Contact & support", desc: "Une question, un bug ?", Icon: Icons.Aide },
  ]

  function Item({ item }: { item: LinkItem }) {
    const active = pathname === item.href || pathname.startsWith(item.href + "/")
    return (
      <Link
        href={item.href}
        onClick={onClose}
        style={{
          display: "flex",
          alignItems: "center",
          gap: tokens.gapMd,
          padding: `${tokens.itemPaddingY}px ${tokens.itemPaddingX}px`,
          borderRadius: tokens.radiusMd,
          background: active ? km.beige : "transparent",
          textDecoration: "none",
          color: km.ink,
          fontFamily: tokens.fontBody,
          WebkitTapHighlightColor: "transparent",
          touchAction: "manipulation",
          minHeight: tokens.itemMinHeight,
          transition: "background 160ms ease",
        }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.background = km.beige }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent" }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: tokens.iconBox,
            height: tokens.iconBox,
            borderRadius: tokens.radiusSm,
            background: km.beige,
            color: km.ink,
            flexShrink: 0,
          }}
        >
          <item.Icon />
        </span>
        <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: tokens.itemLabelSize, fontWeight: 700, color: km.ink, lineHeight: 1.25 }}>{item.label}</span>
          {item.desc && (
            <span style={{ fontSize: tokens.itemDescSize, color: km.muted, lineHeight: 1.4, marginTop: 2 }}>{item.desc}</span>
          )}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={km.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </Link>
    )
  }

  function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
      <p style={{
        fontSize: tokens.sectionLabelSize, fontWeight: 700, color: km.muted,
        textTransform: "uppercase", letterSpacing: "1.4px",
        margin: `18px ${tokens.itemPaddingX}px 6px`,
        fontFamily: tokens.fontBody,
      }}>{children}</p>
    )
  }

  // V81.14 — Style adaptatif :
  //   - Mobile : bottom sheet slide-up (radius top only, full width, handle)
  //   - Tablet/desktop : modal centré (radius all sides, maxWidth, no handle)
  const containerStyle: React.CSSProperties = isMobile
    ? {
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9001,
        backgroundColor: "#FFFFFF",
        borderTopLeftRadius: tokens.radiusXl,
        borderTopRightRadius: tokens.radiusXl,
        maxHeight: "85vh",
        overflowY: "auto",
        paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
        boxShadow: "0 -12px 40px rgba(0,0,0,0.18)",
        fontFamily: tokens.fontBody,
        animation: "km-bnsheet-slide 280ms cubic-bezier(0.32, 0.72, 0, 1)",
      }
    : {
        position: "fixed",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 9001,
        width: "min(520px, calc(100vw - 48px))",
        maxHeight: "80vh",
        overflowY: "auto",
        backgroundColor: "#FFFFFF",
        borderRadius: tokens.radiusLg,
        paddingBottom: 16,
        boxShadow: "0 24px 64px rgba(0,0,0,0.24)",
        fontFamily: tokens.fontBody,
        animation: "km-bnsheet-pop 240ms cubic-bezier(0.32, 0.72, 0, 1)",
      }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(17,17,17,0.45)",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
          zIndex: 9000,
          animation: "km-bnsheet-fade 200ms ease-out",
        }}
      />
      {/* Sheet (mobile) / Modal (desktop) — même DOM, style switch */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu complet"
        style={containerStyle}
      >
        <style>{`
          @keyframes km-bnsheet-slide {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
          @keyframes km-bnsheet-pop {
            from { transform: translate(-50%, -50%) scale(0.96); opacity: 0; }
            to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          }
          @keyframes km-bnsheet-fade {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `}</style>
        {/* Handle (mobile only) */}
        {isMobile && (
          <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
            <div style={{ width: 40, height: 4, borderRadius: 999, background: km.line }} aria-hidden />
          </div>
        )}

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: isMobile ? "8px 20px 4px" : "20px 24px 8px",
          borderBottom: isMobile ? "none" : `1px solid ${km.line}`,
        }}>
          <p style={{
            fontFamily: tokens.fontDisplay,
            fontStyle: "italic", fontWeight: 500, fontSize: tokens.titleSize,
            color: km.ink, letterSpacing: "-0.3px", margin: 0,
          }}>
            Menu
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le menu"
            style={{
              width: tokens.closeBtn, height: tokens.closeBtn, borderRadius: 999,
              background: km.beige, border: `1px solid ${km.line}`,
              cursor: "pointer", color: km.ink, fontSize: 16,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontFamily: tokens.fontBody,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: isMobile ? "8px 8px 16px" : "8px 16px 16px" }}>
          <SectionLabel>Mon compte</SectionLabel>
          {sectionMonCompte.map(item => <Item key={item.href} item={item} />)}

          {proprietaireActive ? (
            <>
              <SectionLabel>Propriétaire</SectionLabel>
              {sectionProprio.map(item => <Item key={item.href} item={item} />)}
            </>
          ) : (
            <>
              <SectionLabel>Locataire</SectionLabel>
              {sectionLocataire.map(item => <Item key={item.href} item={item} />)}
            </>
          )}

          <SectionLabel>Support</SectionLabel>
          {sectionAide.map(item => <Item key={item.href} item={item} />)}

          {/* Déconnexion (action destructive isolée) */}
          <div style={{ padding: "16px 16px 0", borderTop: `1px solid ${km.line}`, marginTop: 14 }}>
            <button
              type="button"
              onClick={() => { onClose(); signOut({ callbackUrl: "/" }) }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: tokens.gapSm + 2,
                width: "100%", padding: `${tokens.itemPaddingY}px 18px`,
                background: km.errBg, color: km.errText,
                border: `1px solid ${km.errLine}`,
                borderRadius: tokens.radiusMd,
                fontSize: 13, fontWeight: 700,
                fontFamily: tokens.fontBody,
                cursor: "pointer",
                textTransform: "uppercase", letterSpacing: "0.6px",
                WebkitTapHighlightColor: "transparent",
                touchAction: "manipulation",
                minHeight: 48,
              }}
            >
              <Icons.Logout />
              Déconnexion
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
