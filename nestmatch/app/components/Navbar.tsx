"use client"
import { useSession, signOut } from "next-auth/react"
import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { useRole } from "../providers"
import { supabase } from "../../lib/supabase"
import { useResponsive } from "../hooks/useResponsive"
import Logo from "./Logo"

export default function Navbar() {
  const { data: session } = useSession()
  const { isAdmin, proprietaireActive } = useRole()
  const [menuOpen, setMenuOpen] = useState(false)
  const [espaceOpen, setEspaceOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const [badgeVisites, setBadgeVisites] = useState(0)
  const [badgeMessages, setBadgeMessages] = useState(0)
  const { isMobile, isTablet } = useResponsive()
  const isSmall = isMobile || isTablet

  const isActive = (path: string) => pathname?.startsWith(path)
  const linkStyle = (path: string): any => ({
    textDecoration: "none",
    color: isActive(path) ? "#111" : "#6b7280",
    fontWeight: isActive(path) ? 700 : 500,
    fontSize: 14,
    padding: "6px 12px",
    borderRadius: 8,
    background: isActive(path) ? "#f3f4f6" : "transparent",
  })

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

  const espaceLinks = proprietaireActive ? [
    { href: "/profil",               label: "Mon profil",         desc: "Informations personnelles" },
    { href: "/proprietaire",         label: "Mes biens",          desc: "Gestion de mes annonces" },
    { href: "/proprietaire/ajouter", label: "Publier un bien",    desc: "Ajouter une nouvelle annonce" },
    { href: "/carnet",               label: "Carnet d'entretien", desc: "Historique des travaux" },
  ] : [
    { href: "/profil",        label: "Mon profil",         desc: "Critères de recherche & matching" },
    { href: "/dossier",       label: "Mon dossier",        desc: "Documents & complétion" },
    { href: "/mon-logement",  label: "Mon logement",       desc: "Bail actif, loyer, documents" },
    { href: "/visites",       label: "Mes visites",        desc: "Demandes & confirmations", badge: badgeVisites },
    { href: "/carnet",        label: "Carnet d'entretien", desc: "Historique des travaux" },
  ]

  const espaceActif = isActive("/profil") || isActive("/dossier") || isActive("/mon-logement") || isActive("/proprietaire") || isActive("/carnet") || isActive("/visites")
  const espaceLinksAvecBadge = proprietaireActive
    ? espaceLinks.map(l => l.href === "/proprietaire" ? { ...l, badge: badgeVisites } : l)
    : espaceLinks

  const totalBadge = badgeVisites + badgeMessages

  return (
    <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: isSmall ? "0 16px" : "0 48px", background: "white", borderBottom: "1px solid #e5e7eb", position: "sticky", top: 0, zIndex: 7000, height: 64, boxShadow: "0 1px 8px rgba(0,0,0,0.05)" }}>

      {/* Logo */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <Logo variant={isSmall ? "compact" : "navbar"} />
        {isAdmin && <Link href="/admin" style={{ fontSize: 11, background: "#111", color: "white", padding: "2px 6px", borderRadius: 999, textDecoration: "none" }}>ADMIN</Link>}
      </div>

      {/* Desktop : liens centraux */}
      {!isSmall && (
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <Link href="/annonces" style={linkStyle("/annonces")}>Annonces</Link>
          <Link href="/favoris"  style={linkStyle("/favoris")}>Favoris</Link>

          {session && (
            <>
              {/* Mon espace dropdown */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setEspaceOpen(!espaceOpen)}
                  style={{ ...linkStyle("/profil"), background: espaceActif ? "#f3f4f6" : "transparent", color: espaceActif ? "#111" : "#6b7280", fontWeight: espaceActif ? 700 : 500, border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
                  Mon espace
                  {badgeVisites > 0 && (
                    <span style={{ background: "#ef4444", color: "white", borderRadius: 999, fontSize: 10, fontWeight: 800, minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>
                      {badgeVisites}
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: "#9ca3af" }}>▼</span>
                </button>

                {espaceOpen && (
                  <>
                    <div onClick={() => setEspaceOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 150 }} />
                    <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, background: "white", borderRadius: 16, border: "1.5px solid #e5e7eb", boxShadow: "0 8px 32px rgba(0,0,0,0.12)", minWidth: 240, zIndex: 200, overflow: "hidden" }}>
                      {espaceLinksAvecBadge.map(item => (
                        <Link key={item.href} href={item.href} onClick={() => setEspaceOpen(false)}
                          style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", textDecoration: "none", color: "#111", borderBottom: "1px solid #f9fafb" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{item.label}</p>
                            <p style={{ fontSize: 11, color: "#9ca3af", margin: 0, marginTop: 1 }}>{item.desc}</p>
                          </div>
                          {(item as any).badge > 0 && (
                            <span style={{ background: "#ef4444", color: "white", borderRadius: 999, fontSize: 10, fontWeight: 800, minWidth: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px", flexShrink: 0 }}>
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
                <Link href="/messages" style={linkStyle("/messages")}>Messages</Link>
                {badgeMessages > 0 && (
                  <span style={{ position: "absolute", top: -4, right: -4, background: "#ef4444", color: "white", borderRadius: 999, fontSize: 9, fontWeight: 800, minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", pointerEvents: "none" }}>
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
          {session ? (
            <div style={{ position: "relative" }}>
              <div onClick={() => setMenuOpen(!menuOpen)}
                style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "6px 12px", borderRadius: 999, border: "1.5px solid #e5e7eb", background: menuOpen ? "#f3f4f6" : "white" }}>
                {session.user?.image
                  ? <img src={session.user.image} alt="avatar" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover" }} />
                  : <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#111", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 13 }}>{session.user?.name?.[0]}</div>
                }
                <span style={{ fontSize: 14, fontWeight: 600 }}>{session.user?.name?.split(" ")[0]}</span>
                <span style={{ fontSize: 10, color: "#6b7280" }}>▼</span>
              </div>

              {menuOpen && (
                <>
                  <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 150 }} />
                  <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, background: "white", borderRadius: 16, border: "1.5px solid #e5e7eb", boxShadow: "0 8px 32px rgba(0,0,0,0.12)", minWidth: 220, zIndex: 200, overflow: "hidden" }}>
                    <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid #f3f4f6" }}>
                      <p style={{ fontWeight: 700, fontSize: 14 }}>{session.user?.name}</p>
                      <p style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>{session.user?.email}</p>
                    </div>
                    {(proprietaireActive ? [
                      { href: "/profil",               label: "Mon profil",      desc: "Informations personnelles" },
                      { href: "/proprietaire",         label: "Mes biens",       desc: "Dashboard proprietaire" },
                      { href: "/proprietaire/ajouter", label: "Publier un bien", desc: "Ajouter une annonce" },
                      { href: "/carnet",               label: "Carnet d'entretien", desc: "Travaux & maintenance" },
                      { href: "/messages",             label: "Messages",        desc: "Vos conversations" },
                    ] : [
                      { href: "/profil",       label: "Mon profil",   desc: "Criteres de recherche" },
                      { href: "/dossier",      label: "Mon dossier",  desc: "Documents & candidature" },
                      { href: "/visites",      label: "Mes visites",  desc: "Demandes & confirmations" },
                      { href: "/favoris",      label: "Mes favoris",  desc: "Annonces sauvegardees" },
                      { href: "/messages",     label: "Messages",     desc: "Vos conversations" },
                    ]).map(item => (
                      <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}
                        style={{ display: "block", padding: "12px 16px", textDecoration: "none", color: "#111" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <p style={{ fontSize: 14, fontWeight: 600 }}>{item.label}</p>
                        <p style={{ fontSize: 12, color: "#6b7280", marginTop: 1 }}>{item.desc}</p>
                      </Link>
                    ))}
                    <Link href="/parametres" onClick={() => setMenuOpen(false)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", textDecoration: "none", color: "#111", borderTop: "1px solid #f3f4f6" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                      </svg>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 600 }}>Paramètres</p>
                        <p style={{ fontSize: 12, color: "#6b7280", marginTop: 1 }}>Compte, apparence, sécurité</p>
                      </div>
                    </Link>
                    <div style={{ borderTop: "1px solid #f3f4f6", padding: 8 }}>
                      <button onClick={() => { setMenuOpen(false); signOut({ callbackUrl: "/" }) }}
                        style={{ width: "100%", padding: "10px 12px", background: "none", border: "none", borderRadius: 10, cursor: "pointer", textAlign: "left", fontSize: 14, fontWeight: 600, color: "#dc2626", fontFamily: "inherit" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#fee2e2")}
                        onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                        Déconnexion
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <Link href="/auth" style={{ padding: "8px 16px", textDecoration: "none", color: "#111", fontWeight: 500, fontSize: 14 }}>Connexion</Link>
              <Link href="/auth?mode=inscription" style={{ padding: "10px 22px", background: "#111", color: "white", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 14 }}>S'inscrire</Link>
            </>
          )}
        </div>
      )}

      {/* Mobile : burger gauche, circulaire, animation smooth (option A) */}
      {isSmall && (
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
          style={{
            order: -1,
            position: "relative",
            background: "white",
            border: "1.5px solid #e5e7eb",
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
              width: 18, height: 2, background: "#111", borderRadius: 2,
              transform: mobileOpen ? "rotate(45deg)" : "rotate(0deg)",
              transformOrigin: "center",
              transition: "top 0.22s cubic-bezier(0.4, 0, 0.2, 1), transform 0.22s cubic-bezier(0.4, 0, 0.2, 1) 0.12s",
            }} />
            {/* Barre milieu — s'efface en s'échappant latéralement */}
            <span style={{
              position: "absolute", left: 0, top: 6,
              width: 18, height: 2, background: "#111", borderRadius: 2,
              opacity: mobileOpen ? 0 : 1,
              transform: mobileOpen ? "translateX(-22px)" : "translateX(0)",
              transition: "opacity 0.15s ease, transform 0.18s ease",
            }} />
            {/* Barre basse */}
            <span style={{
              position: "absolute", left: 0,
              top: mobileOpen ? 6 : 12,
              width: 18, height: 2, background: "#111", borderRadius: 2,
              transform: mobileOpen ? "rotate(-45deg)" : "rotate(0deg)",
              transformOrigin: "center",
              transition: "top 0.22s cubic-bezier(0.4, 0, 0.2, 1), transform 0.22s cubic-bezier(0.4, 0, 0.2, 1) 0.12s",
            }} />
          </span>
          {totalBadge > 0 && !mobileOpen && (
            <span style={{ position: "absolute", top: -2, right: -2, background: "#ef4444", color: "white", borderRadius: 999, fontSize: 9, fontWeight: 800, minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", border: "2px solid white" }}>
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
              position: "fixed", top: 64, left: 0, bottom: 0,
              width: "100vw",
              background: "white", zIndex: 8001, overflowY: "auto",
              boxShadow: mobileOpen ? "0 0 40px rgba(0,0,0,0.15)" : "none",
              transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
              transition: "transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >

            {/* User info */}
            {session && (
              <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 12 }}>
                {session.user?.image
                  ? <img src={session.user.image} alt="avatar" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
                  : <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#111", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 15 }}>{session.user?.name?.[0]}</div>
                }
                <div>
                  <p style={{ fontWeight: 700, fontSize: 14 }}>{session.user?.name}</p>
                  <p style={{ color: "#9ca3af", fontSize: 12 }}>{session.user?.email}</p>
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
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 20px", textDecoration: "none", color: isActive(item.href) ? "#111" : "#374151", background: isActive(item.href) ? "#f3f4f6" : "transparent", fontWeight: isActive(item.href) ? 700 : 500, fontSize: 15, borderBottom: "1px solid #f9fafb" }}>
                  {item.label}
                </Link>
              ))}

              {session && (
                <>
                  {/* Messages */}
                  <Link href="/messages"
                    style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 20px", textDecoration: "none", color: isActive("/messages") ? "#111" : "#374151", background: isActive("/messages") ? "#f3f4f6" : "transparent", fontWeight: isActive("/messages") ? 700 : 500, fontSize: 15, borderBottom: "1px solid #f9fafb", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      Messages
                    </div>
                    {badgeMessages > 0 && (
                      <span style={{ background: "#ef4444", color: "white", borderRadius: 999, fontSize: 11, fontWeight: 800, minWidth: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
                        {badgeMessages}
                      </span>
                    )}
                  </Link>

                  {/* Espace : section */}
                  <div style={{ padding: "12px 20px 6px", background: "#f9fafb" }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Mon espace</p>
                  </div>
                  {espaceLinksAvecBadge.map(item => (
                    <Link key={item.href} href={item.href}
                      style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 20px", textDecoration: "none", color: isActive(item.href) ? "#111" : "#374151", background: isActive(item.href) ? "#f3f4f6" : "transparent", fontWeight: isActive(item.href) ? 700 : 500, fontSize: 15, borderBottom: "1px solid #f9fafb", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        {item.label}
                      </div>
                      {(item as any).badge > 0 && (
                        <span style={{ background: "#ef4444", color: "white", borderRadius: 999, fontSize: 11, fontWeight: 800, minWidth: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
                          {(item as any).badge}
                        </span>
                      )}
                    </Link>
                  ))}

                  <Link href="/parametres" onClick={() => setMobileOpen(false)}
                    style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 20px", textDecoration: "none", color: isActive("/parametres") ? "#111" : "#374151", background: isActive("/parametres") ? "#f3f4f6" : "transparent", fontWeight: isActive("/parametres") ? 700 : 500, fontSize: 15, borderBottom: "1px solid #f9fafb" }}>
                    Paramètres
                  </Link>

                  <div style={{ padding: 16, borderTop: "1px solid #f3f4f6", marginTop: 8 }}>
                    <button onClick={() => { setMobileOpen(false); signOut({ callbackUrl: "/" }) }}
                      style={{ width: "100%", padding: "12px", background: "#fee2e2", border: "none", borderRadius: 12, cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#dc2626", fontFamily: "inherit" }}>
                      Déconnexion
                    </button>
                  </div>
                </>
              )}

              {!session && (
                <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                  <Link href="/auth" style={{ display: "block", padding: "12px", background: "#111", color: "white", borderRadius: 12, textDecoration: "none", fontWeight: 700, fontSize: 15, textAlign: "center" }}>
                    Se connecter
                  </Link>
                  <Link href="/auth?mode=inscription" style={{ display: "block", padding: "12px", background: "#f3f4f6", color: "#111", borderRadius: 12, textDecoration: "none", fontWeight: 600, fontSize: 15, textAlign: "center" }}>
                    S'inscrire
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
