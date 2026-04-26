"use client"
import { useSession, signOut } from "next-auth/react"
import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { useRole } from "../providers"
import { supabase } from "../../lib/supabase"
import { useResponsive } from "../hooks/useResponsive"
import { useUserHousingState } from "../hooks/useUserHousingState"
import Logo from "./Logo"
import NotificationBell from "./NotificationBell"
import { km } from "./ui/km"

// ─── Icon vocabulary (aligné sur le handoff Claude Design, stroke 1.8px) ─────
function MenuIcon({ name }: { name: string }) {
  const common = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "#555", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, style: { flexShrink: 0 } }
  switch (name) {
    case "user":     return <svg {...common}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    case "home":     return <svg {...common}><path d="M3 9.5 12 3l9 6.5V20a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2V9.5z"/></svg>
    case "plus":     return <svg {...common}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    case "wrench":   return <svg {...common}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94L14.7 6.3z"/></svg>
    case "chat":     return <svg {...common}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    case "file":     return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    case "calendar": return <svg {...common}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
    case "heart":    return <svg {...common}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l9.84-9.84a5.5 5.5 0 0 0 0-7.78z"/></svg>
    case "settings": return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    default:         return null
  }
}

export default function Navbar() {
  const { data: session } = useSession()
  const { isAdmin, proprietaireActive } = useRole()
  const [menuOpen, setMenuOpen] = useState(false)
  const [espaceOpen, setEspaceOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const [badgeVisites, setBadgeVisites] = useState(0)
  const [badgeMessages, setBadgeMessages] = useState(0)
  const [photoCustom, setPhotoCustom] = useState<string | null>(null)
  const { isMobile, isTablet } = useResponsive()
  const isSmall = isMobile || isTablet
  // Gating des entrées "Mon logement / Carnet / Quittances / Anciens logements"
  // selon l'état réel du locataire. Pas de gate côté proprio (espace inchangé).
  const { hasCurrentHousing, hasPastHousing } = useUserHousingState()
  // Priorité photo : custom uploadée > Google (session). Si la colonne n'existe
  // pas (migration 008 pas appliquée), on retombe silencieusement sur session.
  const avatarSrc = photoCustom || session?.user?.image || null

  const isActive = (path: string) => pathname?.startsWith(path)
  const linkStyle = (path: string): any => ({
    textDecoration: "none",
    color: isActive(path) ? km.ink : km.muted,
    fontWeight: isActive(path) ? 700 : 500,
    fontSize: 14,
    padding: "6px 12px",
    borderRadius: 8,
    background: isActive(path) ? km.beige : "transparent",
    transition: "background 200ms ease, color 200ms ease",
  })
  // Hover handlers : feedback léger uniquement si le lien est inactif.
  // Sur le lien actif, on laisse le background km.beige en place (pas d'override).
  const hoverEnter = (path: string) => (e: React.MouseEvent<HTMLElement>) => {
    if (!isActive(path)) e.currentTarget.style.background = km.beige
  }
  const hoverLeave = (path: string) => (e: React.MouseEvent<HTMLElement>) => {
    if (!isActive(path)) e.currentTarget.style.background = "transparent"
  }

  // Charge la photo custom si la migration 008 a posé la colonne.
  useEffect(() => {
    const email = session?.user?.email?.toLowerCase()
    if (!email) { setPhotoCustom(null); return }
    supabase.from("profils").select("photo_url_custom").eq("email", email).single()
      .then(({ data, error }) => {
        if (error) return // colonne absente ou profil pas encore créé
        const v = (data as { photo_url_custom?: string | null } | null)?.photo_url_custom
        if (v) setPhotoCustom(v)
      })
  }, [session?.user?.email])

  useEffect(() => {
    if (!session?.user?.email) return
    const email = session.user.email.toLowerCase()
    // Notification uniquement quand une action est attendue de MA part :
    // une demande en attente proposée par l'AUTRE partie.
    const col = proprietaireActive ? "proprietaire_email" : "locataire_email"
    const refresh = () => supabase.from("visites").select("id", { count: "exact", head: true })
      .eq(col, email).eq("statut", "proposée").neq("propose_par", email)
      .then(({ count }) => setBadgeVisites(count ?? 0))
    refresh()
    // Real-time : tout changement sur visites qui me concernent
    const channel = supabase.channel(`navbar-visites-${email}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "visites" }, (payload) => {
        const row = (payload.new || payload.old) as any
        const p = (row?.proprietaire_email || "").toLowerCase()
        const l = (row?.locataire_email || "").toLowerCase()
        if (p === email || l === email) refresh()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session, proprietaireActive, pathname])

  useEffect(() => {
    if (!session?.user?.email) return
    const email = session.user.email.toLowerCase()
    const refresh = () => supabase.from("messages").select("id", { count: "exact", head: true })
      .eq("to_email", email).eq("lu", false)
      .then(({ count }) => setBadgeMessages(count ?? 0))
    refresh()
    // Real-time : nouveau message reçu OU message marqué lu
    const channel = supabase.channel(`navbar-messages-${email}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `to_email=eq.${email}` }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `to_email=eq.${email}` }, refresh)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, refresh)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session, pathname])

  // Fermer le menu mobile au changement de route
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Fermer tous les menus lors d'un changement de taille d'ecran
  // (fix bug : apres resize mobile -> desktop, les dropdowns pouvaient rester bloques)
  useEffect(() => {
    setMobileOpen(false)
    setEspaceOpen(false)
    setMenuOpen(false)
  }, [isSmall])

  // Escape ferme les dropdowns ouverts (a11y WCAG 2.1.2 — utilisateurs
  // clavier doivent pouvoir refermer un menu sans tab-out manuel).
  useEffect(() => {
    if (!espaceOpen && !menuOpen && !mobileOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEspaceOpen(false)
        setMenuOpen(false)
        setMobileOpen(false)
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [espaceOpen, menuOpen, mobileOpen])

  // Gating locataire — masque les entrées qui n'ont aucune raison d'apparaître
  // tant que l'état correspondant n'existe pas (avant signature : 0 logement
  // ⇒ pas de Mon logement / Carnet / Quittances ; pas d'ancien bail terminé
  // ⇒ pas d'Anciens logements). Routes accessibles en direct (EmptyState).
  const espaceLinks = proprietaireActive ? [
    { href: "/profil",                 label: "Mon profil",         desc: "Informations personnelles" },
    { href: "/proprietaire",           label: "Mes biens",          desc: "Gestion de mes annonces" },
    { href: "/proprietaire/ajouter",   label: "Publier un bien",    desc: "Ajouter une nouvelle annonce" },
    { href: "/proprietaire/estimateur",label: "Estimer un loyer",   desc: "Comparer avec le marché avant de publier" },
    { href: "/carnet",                 label: "Carnet d'entretien", desc: "Historique des travaux" },
  ] : [
    { href: "/profil",        label: "Mon profil",         desc: "Critères de recherche & matching" },
    { href: "/dossier",       label: "Mon dossier",        desc: "Documents & complétion" },
    ...(hasCurrentHousing ? [
      { href: "/mon-logement",   label: "Mon logement",       desc: "Bail actif, loyer, documents" },
      { href: "/mes-documents",  label: "Mes documents",      desc: "Hub central — dossier, bail, EDL, quittances" },
      { href: "/mes-quittances", label: "Mes quittances",     desc: "Archives mensuelles" },
    ] : []),
    ...(hasPastHousing ? [
      { href: "/anciens-logements", label: "Anciens logements", desc: "Historique des baux passés" },
    ] : []),
    { href: "/visites",       label: "Mes visites",        desc: "Demandes & confirmations", badge: badgeVisites },
    ...(hasCurrentHousing ? [
      { href: "/carnet",        label: "Carnet d'entretien", desc: "Historique des travaux" },
    ] : []),
  ]

  const espaceActif = isActive("/profil") || isActive("/dossier") || isActive("/mon-logement") || isActive("/mes-documents") || isActive("/mes-quittances") || isActive("/anciens-logements") || isActive("/proprietaire") || isActive("/carnet") || isActive("/visites")
  const espaceLinksAvecBadge = proprietaireActive
    ? espaceLinks.map(l => l.href === "/proprietaire" ? { ...l, badge: badgeVisites } : l)
    : espaceLinks

  const totalBadge = badgeVisites + badgeMessages

  // Badge « action requise » (rouge d'erreur), utilisé dans le menu pour attirer l'œil.
  const badgePill: React.CSSProperties = {
    background: km.errText, color: km.white, borderRadius: 999,
    fontSize: 10, fontWeight: 800, minWidth: 16, height: 16,
    display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px",
  }

  return (
    <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: isSmall ? "0 16px" : "0 48px", background: km.white, borderBottom: `1px solid ${km.line}`, position: "sticky", top: 0, zIndex: 7000, height: 72, boxShadow: "0 1px 8px rgba(0,0,0,0.05)" }}>

      {/* Logo */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <Logo variant={isSmall ? "compact" : "navbar"} />
        {isAdmin && <Link href="/admin" style={{ fontSize: 11, background: km.ink, color: km.white, padding: "2px 6px", borderRadius: 999, textDecoration: "none" }}>ADMIN</Link>}
      </div>

      {/* Desktop : liens centraux */}
      {!isSmall && (
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <Link href="/annonces" style={linkStyle("/annonces")} onMouseEnter={hoverEnter("/annonces")} onMouseLeave={hoverLeave("/annonces")}>Annonces</Link>
          <Link href="/favoris"  style={linkStyle("/favoris")}  onMouseEnter={hoverEnter("/favoris")}  onMouseLeave={hoverLeave("/favoris")}>Favoris</Link>

          {session && (
            <>
              {/* Mon espace dropdown */}
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setEspaceOpen(!espaceOpen)}
                  aria-expanded={espaceOpen}
                  aria-haspopup="menu"
                  aria-controls="navbar-espace-menu"
                  onMouseEnter={e => { if (!espaceActif) e.currentTarget.style.background = km.beige }}
                  onMouseLeave={e => { if (!espaceActif) e.currentTarget.style.background = "transparent" }}
                  style={{ ...linkStyle("/profil"), background: espaceActif ? km.beige : "transparent", color: espaceActif ? km.ink : km.muted, fontWeight: espaceActif ? 700 : 500, border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
                  Mon espace
                  {badgeVisites > 0 && (
                    <span style={badgePill}>
                      {badgeVisites}
                    </span>
                  )}
                  <span aria-hidden="true" style={{ fontSize: 10, color: km.muted }}>▼</span>
                </button>

                {espaceOpen && (
                  <>
                    <div aria-hidden="true" onClick={() => setEspaceOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 150 }} />
                    <div id="navbar-espace-menu" role="menu" aria-label="Mon espace" style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, background: km.white, borderRadius: 16, border: `1px solid ${km.line}`, boxShadow: "0 8px 32px rgba(0,0,0,0.12)", minWidth: 240, zIndex: 200, overflow: "hidden" }}>
                      {espaceLinksAvecBadge.map(item => (
                        <Link key={item.href} href={item.href} onClick={() => setEspaceOpen(false)}
                          style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", textDecoration: "none", color: km.ink, borderBottom: `1px solid ${km.beige}` }}
                          onMouseEnter={e => (e.currentTarget.style.background = km.beige)}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{item.label}</p>
                            <p style={{ fontSize: 11, color: km.muted, margin: 0, marginTop: 1 }}>{item.desc}</p>
                          </div>
                          {(item as any).badge > 0 && (
                            <span style={{ ...badgePill, minWidth: 18, height: 18, padding: "0 5px", flexShrink: 0 }}>
                              {(item as any).badge}
                            </span>
                          )}
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div style={{ position: "relative" }}>
                <Link href="/messages" style={linkStyle("/messages")} onMouseEnter={hoverEnter("/messages")} onMouseLeave={hoverLeave("/messages")}>Messages</Link>
                {badgeMessages > 0 && (
                  <span style={{ position: "absolute", top: -4, right: -4, background: km.errText, color: km.white, borderRadius: 999, fontSize: 9, fontWeight: 800, minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", pointerEvents: "none" }}>
                    {badgeMessages > 9 ? "9+" : badgeMessages}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Desktop : avatar / auth */}
      {!isSmall && (
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {/* CTA "Publier un bien" — proprio uniquement, juste avant la cloche.
              Fidèle handoff `components.jsx` Navbar l. 97 (mode owner = "+ Publier")
              + visibilité gated par proprietaireActive pour ne pas polluer
              côté locataire. Bug Paul 2026-04-26 « il devait être en gros à
              côté de la cloche ». */}
          {session && proprietaireActive && (
            <Link
              href="/proprietaire/ajouter"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "10px 18px",
                background: km.ink, color: km.white,
                borderRadius: 999, textDecoration: "none",
                fontWeight: 700, fontSize: 12,
                textTransform: "uppercase", letterSpacing: "0.5px",
                fontFamily: "inherit", whiteSpace: "nowrap",
                transition: "transform 160ms ease, box-shadow 160ms ease",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = "translateY(-1px)"
                e.currentTarget.style.boxShadow = "0 6px 16px rgba(17,17,17,0.18)"
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = "translateY(0)"
                e.currentTarget.style.boxShadow = "none"
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Publier
            </Link>
          )}
          {session && <NotificationBell />}
          {session ? (
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-controls="navbar-user-menu"
                aria-label={`Menu de ${session.user?.name || "votre compte"}`}
                style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "6px 12px", borderRadius: 999, border: `1px solid ${km.line}`, background: menuOpen ? km.beige : km.white, transition: "background 200ms ease", fontFamily: "inherit" }}>
                {avatarSrc
                  ? <img src={avatarSrc} alt="" referrerPolicy="no-referrer" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
                  : <div aria-hidden="true" style={{ width: 40, height: 40, borderRadius: "50%", background: km.ink, display: "flex", alignItems: "center", justifyContent: "center", color: km.white, fontWeight: 700, fontSize: 16 }}>{session.user?.name?.[0]}</div>
                }
                <span style={{ fontSize: 14, fontWeight: 600 }}>{session.user?.name?.split(" ")[0]}</span>
                <span aria-hidden="true" style={{ fontSize: 10, color: km.muted }}>▼</span>
              </button>

              {menuOpen && (
                <>
                  <div aria-hidden="true" onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 150 }} />
                  <div id="navbar-user-menu" role="menu" aria-label="Menu utilisateur" style={{ position: "absolute", top: "calc(100% + 12px)", right: 0, background: km.white, borderRadius: 14, border: `1px solid ${km.line}`, boxShadow: "0 12px 32px -8px rgba(0,0,0,0.18)", minWidth: 260, zIndex: 200, overflow: "visible", fontFamily: "inherit" }}>
                    {/* Flèche pointeur vers le trigger */}
                    <div style={{ position: "absolute", top: -6, right: 24, width: 10, height: 10, background: km.white, borderLeft: `1px solid ${km.line}`, borderTop: `1px solid ${km.line}`, transform: "rotate(45deg)" }} />

                    {/* Header avec avatar + name + email */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: `1px solid ${km.line}` }}>
                      {avatarSrc
                        ? <img src={avatarSrc} alt="" referrerPolicy="no-referrer" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                        : <div aria-hidden="true" style={{ width: 34, height: 34, borderRadius: "50%", background: km.ink, display: "flex", alignItems: "center", justifyContent: "center", color: km.white, fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{session.user?.name?.[0]}</div>
                      }
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontWeight: 700, fontSize: 13, color: km.ink, letterSpacing: "-0.2px", lineHeight: 1.2, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{session.user?.name}</p>
                        <p style={{ color: km.muted, fontSize: 11, lineHeight: 1.2, margin: 0, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{session.user?.email}</p>
                      </div>
                    </div>

                    {/* Eyebrow groupe */}
                    <p style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.2px", padding: "10px 16px 4px", margin: 0 }}>Mon espace</p>

                    {/* Items avec icônes et indicateur actif */}
                    {(proprietaireActive ? [
                      { href: "/profil",               label: "Mon profil",      icon: "user" },
                      { href: "/proprietaire",         label: "Mes biens",       icon: "home" },
                      { href: "/proprietaire/ajouter", label: "Publier un bien", icon: "plus" },
                      { href: "/carnet",               label: "Carnet d'entretien", icon: "wrench" },
                      { href: "/messages",             label: "Messages",        icon: "chat", count: badgeMessages },
                    ] : [
                      { href: "/profil",       label: "Mon profil",   icon: "user" },
                      { href: "/dossier",      label: "Mon dossier",  icon: "file" },
                      { href: "/visites",      label: "Mes visites",  icon: "calendar", count: badgeVisites },
                      { href: "/favoris",      label: "Mes favoris",  icon: "heart" },
                      { href: "/messages",     label: "Messages",     icon: "chat", count: badgeMessages },
                    ]).map(item => {
                      const active = isActive(item.href)
                      return (
                        <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}
                          style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", textDecoration: "none", color: km.ink, transition: "background 150ms ease" }}
                          onMouseEnter={e => (e.currentTarget.style.background = km.beige)}
                          onMouseLeave={e => (e.currentTarget.style.background = active ? km.beige : "transparent")}
                          ref={el => { if (el && active) el.style.background = km.beige }}>
                          {active && <span style={{ position: "absolute", left: 0, top: 6, bottom: 6, width: 2, background: km.ink, borderRadius: 2 }} />}
                          <MenuIcon name={item.icon} />
                          <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{item.label}</span>
                          {(item as any).count > 0 && (
                            <span style={{ ...badgePill, minWidth: 18, height: 18, padding: "0 5px" }}>{(item as any).count}</span>
                          )}
                        </Link>
                      )
                    })}

                    {/* Divider */}
                    <div style={{ height: 1, background: km.line, margin: "6px 0" }} />

                    {/* Paramètres */}
                    <Link href="/parametres" onClick={() => setMenuOpen(false)}
                      style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", textDecoration: "none", color: km.ink }}
                      onMouseEnter={e => (e.currentTarget.style.background = km.beige)}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <MenuIcon name="settings" />
                      <span style={{ fontSize: 13, fontWeight: 500 }}>Paramètres</span>
                    </Link>

                    {/* Footer : version + déconnexion */}
                    <div style={{ borderTop: `1px solid ${km.line}`, marginTop: 6, padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 10, color: km.muted, letterSpacing: "0.3px" }}>KeyMatch · beta</span>
                      <button onClick={() => { setMenuOpen(false); signOut({ callbackUrl: "/" }) }}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, color: km.errText, fontFamily: "inherit", padding: 0, letterSpacing: "0.2px" }}>
                        Déconnexion
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Auth CTAs — alignés sur le pattern KMButtonText + KMButton */}
              <Link href="/auth" style={{
                padding: "8px 16px", textDecoration: "none",
                color: km.ink, fontWeight: 600, fontSize: 13,
                textTransform: "uppercase", letterSpacing: "0.6px",
                fontFamily: "inherit",
              }}>Connexion</Link>
              <Link href="/auth?mode=inscription" style={{
                padding: "12px 26px", background: km.ink, color: km.white,
                borderRadius: 999, textDecoration: "none",
                fontWeight: 700, fontSize: 11,
                textTransform: "uppercase", letterSpacing: "0.6px",
                fontFamily: "inherit", whiteSpace: "nowrap",
              }}>S&apos;inscrire</Link>
            </>
          )}
        </div>
      )}

      {/* Mobile : Publier (icône +) → cloche → burger.
          Visible uniquement proprio. Icône seule pour préserver l'espace. */}
      {isSmall && session && proprietaireActive && (
        <Link
          href="/proprietaire/ajouter"
          aria-label="Publier un bien"
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 40, height: 40, borderRadius: "50%",
            background: km.ink, color: km.white,
            textDecoration: "none", flexShrink: 0,
            boxShadow: "0 2px 8px rgba(17,17,17,0.18)",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </Link>
      )}
      {/* Mobile : cloche notifications à droite, avant le burger */}
      {isSmall && session && <NotificationBell />}

      {/* Mobile : burger gauche, circulaire, animation smooth (option A) */}
      {isSmall && (
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
          style={{
            order: -1,
            position: "relative",
            background: km.white,
            border: `1px solid ${km.line}`,
            borderRadius: "50%",
            width: 40,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
            transition: "box-shadow 0.2s ease, border-color 0.2s ease",
            boxShadow: mobileOpen ? "0 2px 12px rgba(0,0,0,0.12)" : "none",
            padding: 0,
          }}
        >
          <span style={{ position: "relative", width: 18, height: 14, display: "block" }}>
            {/* Barre haute */}
            <span style={{
              position: "absolute", left: 0,
              top: mobileOpen ? 6 : 0,
              width: 18, height: 2, background: km.ink, borderRadius: 2,
              transform: mobileOpen ? "rotate(45deg)" : "rotate(0deg)",
              transformOrigin: "center",
              transition: "top 0.22s cubic-bezier(0.4, 0, 0.2, 1), transform 0.22s cubic-bezier(0.4, 0, 0.2, 1) 0.12s",
            }} />
            {/* Barre milieu — s'efface en s'échappant latéralement */}
            <span style={{
              position: "absolute", left: 0, top: 6,
              width: 18, height: 2, background: km.ink, borderRadius: 2,
              opacity: mobileOpen ? 0 : 1,
              transform: mobileOpen ? "translateX(-22px)" : "translateX(0)",
              transition: "opacity 0.15s ease, transform 0.18s ease",
            }} />
            {/* Barre basse */}
            <span style={{
              position: "absolute", left: 0,
              top: mobileOpen ? 6 : 12,
              width: 18, height: 2, background: km.ink, borderRadius: 2,
              transform: mobileOpen ? "rotate(-45deg)" : "rotate(0deg)",
              transformOrigin: "center",
              transition: "top 0.22s cubic-bezier(0.4, 0, 0.2, 1), transform 0.22s cubic-bezier(0.4, 0, 0.2, 1) 0.12s",
            }} />
          </span>
          {totalBadge > 0 && !mobileOpen && (
            <span style={{ position: "absolute", top: -2, right: -2, background: km.errText, color: km.white, borderRadius: 999, fontSize: 9, fontWeight: 800, minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", border: `2px solid ${km.white}` }}>
              {totalBadge > 9 ? "9+" : totalBadge}
            </span>
          )}
        </button>
      )}

      {/* Mobile : drawer overlay — toujours monté quand isSmall pour animer l'ouverture/fermeture */}
      {isSmall && (
        <>
          <div
            onClick={() => setMobileOpen(false)}
            style={{
              position: "fixed", inset: 0, zIndex: 8000,
              background: "rgba(0,0,0,0.45)",
              opacity: mobileOpen ? 1 : 0,
              pointerEvents: mobileOpen ? "auto" : "none",
              transition: "opacity 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
          <div
            aria-hidden={!mobileOpen}
            style={{
              position: "fixed", top: 72, left: 0, bottom: 0,
              width: "100vw",
              background: km.white, zIndex: 8001, overflowY: "auto",
              boxShadow: mobileOpen ? "0 0 40px rgba(0,0,0,0.15)" : "none",
              transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
              transition: "transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >

            {/* User info */}
            {session && (
              <div style={{ padding: "20px 20px 16px", borderBottom: `1px solid ${km.beige}`, display: "flex", alignItems: "center", gap: 12 }}>
                {avatarSrc
                  ? <img src={avatarSrc} alt="avatar" referrerPolicy="no-referrer" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }} />
                  : <div style={{ width: 48, height: 48, borderRadius: "50%", background: km.ink, display: "flex", alignItems: "center", justifyContent: "center", color: km.white, fontWeight: 700, fontSize: 18 }}>{session.user?.name?.[0]}</div>
                }
                <div>
                  <p style={{ fontWeight: 700, fontSize: 14 }}>{session.user?.name}</p>
                  <p style={{ color: km.muted, fontSize: 12 }}>{session.user?.email}</p>
                </div>
              </div>
            )}

            {/* Nav links */}
            <div style={{ padding: "8px 0" }}>
              {[
                { href: "/annonces", label: "Annonces" },
                { href: "/favoris",  label: "Favoris" },
              ].map(item => (
                <Link key={item.href} href={item.href}
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 20px", textDecoration: "none", color: km.ink, background: isActive(item.href) ? km.beige : "transparent", fontWeight: isActive(item.href) ? 700 : 500, fontSize: 15, borderBottom: `1px solid ${km.beige}` }}>
                  {item.label}
                </Link>
              ))}

              {session && (
                <>
                  {/* Messages */}
                  <Link href="/messages"
                    style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 20px", textDecoration: "none", color: km.ink, background: isActive("/messages") ? km.beige : "transparent", fontWeight: isActive("/messages") ? 700 : 500, fontSize: 15, borderBottom: `1px solid ${km.beige}`, justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      Messages
                    </div>
                    {badgeMessages > 0 && (
                      <span style={{ background: km.errText, color: km.white, borderRadius: 999, fontSize: 11, fontWeight: 800, minWidth: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
                        {badgeMessages}
                      </span>
                    )}
                  </Link>

                  {/* Espace : section */}
                  <div style={{ padding: "12px 20px 6px", background: km.beige }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>Mon espace</p>
                  </div>
                  {espaceLinksAvecBadge.map(item => (
                    <Link key={item.href} href={item.href}
                      style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 20px", textDecoration: "none", color: km.ink, background: isActive(item.href) ? km.beige : "transparent", fontWeight: isActive(item.href) ? 700 : 500, fontSize: 15, borderBottom: `1px solid ${km.beige}`, justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        {item.label}
                      </div>
                      {(item as any).badge > 0 && (
                        <span style={{ background: km.errText, color: km.white, borderRadius: 999, fontSize: 11, fontWeight: 800, minWidth: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
                          {(item as any).badge}
                        </span>
                      )}
                    </Link>
                  ))}

                  <Link href="/parametres" onClick={() => setMobileOpen(false)}
                    style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 20px", textDecoration: "none", color: km.ink, background: isActive("/parametres") ? km.beige : "transparent", fontWeight: isActive("/parametres") ? 700 : 500, fontSize: 15, borderBottom: `1px solid ${km.beige}` }}>
                    Paramètres
                  </Link>

                  <div style={{ padding: 16, borderTop: `1px solid ${km.beige}`, marginTop: 8 }}>
                    <button onClick={() => { setMobileOpen(false); signOut({ callbackUrl: "/" }) }}
                      style={{ width: "100%", padding: "12px", background: km.errBg, border: "none", borderRadius: 12, cursor: "pointer", fontSize: 14, fontWeight: 700, color: km.errText, fontFamily: "inherit" }}>
                      Déconnexion
                    </button>
                  </div>
                </>
              )}

              {!session && (
                <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                  {/* Auth CTAs mobile — principal (noir) + secondaire (outline) */}
                  <Link href="/auth?mode=inscription" style={{
                    display: "block", padding: "14px", background: km.ink, color: km.white,
                    borderRadius: 999, textDecoration: "none",
                    fontWeight: 700, fontSize: 12,
                    textTransform: "uppercase", letterSpacing: "0.6px",
                    textAlign: "center", fontFamily: "inherit",
                  }}>
                    S&apos;inscrire
                  </Link>
                  <Link href="/auth" style={{
                    display: "block", padding: "14px", background: km.white,
                    color: km.ink, border: `1px solid ${km.ink}`,
                    borderRadius: 999, textDecoration: "none",
                    fontWeight: 700, fontSize: 12,
                    textTransform: "uppercase", letterSpacing: "0.6px",
                    textAlign: "center", fontFamily: "inherit",
                  }}>
                    Se connecter
                  </Link>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </nav>
  )
}
