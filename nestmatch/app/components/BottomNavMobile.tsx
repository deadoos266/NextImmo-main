"use client"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { useRole } from "../providers"
import { useResponsive } from "../hooks/useResponsive"
import { Z_INDEX } from "../../lib/zIndex"
import { supabase } from "../../lib/supabase"
import BottomNavSheet from "./BottomNavSheet"

/**
 * V73.9 — bottom navigation mobile pour les pages authentifiées.
 *
 * Pattern iOS standard : 4-5 tabs en bas, fixed, safe-area-inset.
 * Active = icône remplie + label noir, inactive = outlined + gris.
 *
 * Affichage conditionné :
 *  - Mobile uniquement (< 768px via useResponsive)
 *  - User connecté (sinon Navbar suffit, pas de tabs à afficher)
 *  - Pas dans un thread /messages mobile (Navbar est déjà cachée par
 *    `km:thread-mobile-open` event, on cache aussi BottomNav pour
 *    laisser le composer occuper le bottom safe-area)
 *  - Pas sur /admin/** (pages techniques internes)
 *
 * Tabs adaptés au rôle (proprietaireActive) :
 *  - Locataire : Annonces · Mon logement · Messages · Notifs · Moi
 *  - Proprio   : Annonces · Mes biens   · Messages · Notifs · Moi
 *
 * Z-index Z_INDEX.bottomNav (400) — sous floating actions (1000+) et
 * modaux (4000+). Ne masque pas les CTA flottants ni les modals.
 */

interface IconProps {
  active: boolean
  size?: number
}

function HomeIcon({ active, size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9.5L12 3l9 6.5V20a2 2 0 0 1-2 2h-4v-6h-6v6H5a2 2 0 0 1-2-2V9.5z"/>
    </svg>
  )
}
function ListingsIcon({ active, size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
    </svg>
  )
}
function MessageIcon({ active, size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  )
}
function BellIcon({ active, size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  )
}
function UserIcon({ active, size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  )
}
// V81.13 — Icône "Plus" (3 lignes hamburger) pour le tab qui ouvre le sheet
// avec TOUS les onglets/sections (favoris, dossier, candidatures, etc.).
// Feedback Paul : "on accède que à une partie des onglets c'est vraiment
// dommage" → menu déroulant vers le haut comme un Control Center.
function MenuIcon({ active, size = 22 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  )
}

interface Tab {
  href: string | null  // null = bouton qui ouvre le sheet
  label: string
  Icon: (p: IconProps) => React.JSX.Element
  matchPaths: (pathname: string) => boolean
}

// V81.4 — Annonces déplacé en position 3 (milieu) pour donner du poids
// visuel à la recherche d'annonces (core feature). Pattern UX iOS/Android :
// le tab central est souvent l'action principale ou la page la plus visitée.
// User feedback : "annonces au milieu à la place de messages".
// V81.13 — Le 5e tab passe de "Moi"→/profil (Link) à "Plus"→Sheet (button).
// Donne accès à TOUS les onglets/sections (favoris, dossier, candidatures,
// recherches sauvegardées, etc.) via un slide-up sheet plein écran.
// Mon profil reste accessible DANS le sheet (section "Mon compte").
const TABS_LOCATAIRE: Tab[] = [
  { href: "/mon-logement", label: "Logement",  Icon: HomeIcon,     matchPaths: (p) => p.startsWith("/mon-logement") },
  { href: "/messages",     label: "Messages",  Icon: MessageIcon,  matchPaths: (p) => p.startsWith("/messages") },
  { href: "/annonces",     label: "Annonces",  Icon: ListingsIcon, matchPaths: (p) => p === "/annonces" || p.startsWith("/annonces/") || p.startsWith("/location/") },
  { href: "/notifications",label: "Notifs",    Icon: BellIcon,     matchPaths: (p) => p.startsWith("/notifications") },
  { href: null,            label: "Plus",      Icon: MenuIcon,     matchPaths: () => false },
]

const TABS_PROPRIO: Tab[] = [
  { href: "/proprietaire",  label: "Mes biens",Icon: HomeIcon,     matchPaths: (p) => p.startsWith("/proprietaire") },
  { href: "/messages",      label: "Messages", Icon: MessageIcon,  matchPaths: (p) => p.startsWith("/messages") },
  { href: "/annonces",      label: "Annonces", Icon: ListingsIcon, matchPaths: (p) => p === "/annonces" || p.startsWith("/annonces/") || p.startsWith("/location/") },
  { href: "/notifications", label: "Notifs",   Icon: BellIcon,     matchPaths: (p) => p.startsWith("/notifications") },
  { href: null,             label: "Plus",     Icon: MenuIcon,     matchPaths: () => false },
]

export default function BottomNavMobile() {
  const { isMobile } = useResponsive()
  const { data: session } = useSession()
  const { proprietaireActive } = useRole()
  const pathname = usePathname() || "/"
  const [unreadCount, setUnreadCount] = useState(0)
  const [threadOpen, setThreadOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  // V81.13 — Sheet "Plus" : slide-up depuis le bas pour accéder à tous les
  // onglets/sections (favoris, dossier, candidatures, ...).
  const [sheetOpen, setSheetOpen] = useState(false)

  // Hide quand thread mobile actif (composer occupe le bottom)
  useEffect(() => {
    function onThread(e: Event) {
      setThreadOpen((e as CustomEvent).detail?.open === true)
    }
    function onDrawer(e: Event) {
      setDrawerOpen((e as CustomEvent).detail?.open === true)
    }
    window.addEventListener("km:thread-mobile-open", onThread)
    window.addEventListener("km:drawer-state", onDrawer)
    return () => {
      window.removeEventListener("km:thread-mobile-open", onThread)
      window.removeEventListener("km:drawer-state", onDrawer)
    }
  }, [])

  // Récupère le compteur notif non-lues pour le badge sur l'onglet Notifs.
  // Petit fetch initial + abonnement Realtime pour rester à jour.
  useEffect(() => {
    const email = session?.user?.email?.toLowerCase()
    if (!email) { setUnreadCount(0); return }

    let alive = true
    async function refresh() {
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" })
        if (!res.ok) return
        const json = await res.json()
        if (alive && json.ok) setUnreadCount(json.unreadCount || 0)
      } catch { /* silent */ }
    }
    refresh()

    const channel = supabase.channel(`bottom-nav-notifs-${email}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "notifications",
        filter: `user_email=eq.${email}`,
      }, () => refresh())
      .subscribe()

    return () => {
      alive = false
      supabase.removeChannel(channel)
    }
  }, [session?.user?.email])

  // V80.2 — hide conditions simplifiées : BottomNavMobile est maintenant
  // scopé à app/(authenticated)/layout.tsx (route group). Les pages
  // publiques (/auth, /connexion, /login, /cgu, etc.) sont dans (public)/
  // et n'ont jamais BottomNav rendu — plus besoin de les filtrer ici.
  // Garde uniquement les conditions UX intra-auth :
  //  - desktop : pas de bottom nav (CSS-only via useResponsive)
  //  - drawer ouvert : éviter overlap visuel
  //  - admin : décision UX (admin n'a pas besoin de tabs locataire/proprio)
  //
  // V81.19 — RETIRÉ la condition threadOpen : l'user veut pouvoir naviguer
  // vers d'autres tabs (Annonces, Logement, Notifs) directement depuis le
  // thread. Avant : threadOpen=true → BottomNav caché → seul moyen de
  // sortir = back-arrow ← qui ramène à la liste des conversations puis
  // re-tap sur un autre tab. Maintenant : BottomNav reste visible, l'user
  // peut switch tab d'un seul tap. Le composer reste accessible (body
  // padding-bottom 56px + safe-area sur mobile réserve déjà l'espace).
  if (!isMobile) return null
  if (!session?.user) return null
  if (drawerOpen) return null
  if (pathname.startsWith("/admin")) return null

  const tabs = proprietaireActive ? TABS_PROPRIO : TABS_LOCATAIRE

  return (
    <>
    <nav
      role="navigation"
      aria-label="Navigation principale mobile"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: Z_INDEX.bottomNav,
        background: "white",
        borderTop: "1px solid #EAE6DF",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        // Compositing GPU pour éviter le re-layout pendant le scroll iOS.
        transform: "translate3d(0, 0, 0)",
        WebkitTransform: "translate3d(0, 0, 0)",
        willChange: "transform",
        contain: "layout style paint",
        boxShadow: "0 -1px 8px rgba(0,0,0,0.04)",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${tabs.length}, 1fr)`, height: 56 }}>
        {tabs.map((tab, idx) => {
          const active = tab.matchPaths(pathname) || (tab.href === null && sheetOpen)
          const showBadge = tab.href === "/notifications" && unreadCount > 0
          const itemStyle: React.CSSProperties = {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            color: active ? "#111" : "#8a8477",
            fontSize: 11,
            fontWeight: active ? 700 : 500,
            textDecoration: "none",
            position: "relative",
            WebkitTapHighlightColor: "transparent",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            padding: 0,
            touchAction: "manipulation",
          }
          const inner = (
            <>
              <span style={{ position: "relative", display: "inline-flex" }}>
                <tab.Icon active={active} />
                {showBadge && (
                  <span
                    aria-label={`${unreadCount} non lues`}
                    style={{
                      position: "absolute",
                      top: -3,
                      right: -8,
                      background: "#b91c1c",
                      color: "white",
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 800,
                      minWidth: 16,
                      height: 16,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 4px",
                      lineHeight: 1,
                    }}
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </span>
              <span>{tab.label}</span>
            </>
          )
          // V81.13 — Le tab "Plus" (href:null) est un bouton qui ouvre le
          // BottomNavSheet. Les autres restent des Link de navigation.
          if (tab.href === null) {
            return (
              <button
                key={`sheet-trigger-${idx}`}
                type="button"
                onClick={() => setSheetOpen(true)}
                aria-label="Ouvrir le menu complet"
                aria-expanded={sheetOpen}
                style={itemStyle}
              >
                {inner}
              </button>
            )
          }
          return (
            <Link key={tab.href} href={tab.href} style={itemStyle}>
              {inner}
            </Link>
          )
        })}
      </div>
    </nav>
    <BottomNavSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  )
}
