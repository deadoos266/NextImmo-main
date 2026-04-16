"use client"
import { useSession, signOut } from "next-auth/react"
import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { useRole } from "../providers"
import { supabase } from "../../lib/supabase"

export default function Navbar() {
  const { data: session } = useSession()
  const { isAdmin, proprietaireActive } = useRole()
  const [menuOpen, setMenuOpen] = useState(false)
  const [espaceOpen, setEspaceOpen] = useState(false)
  const pathname = usePathname()
  const [badgeVisites, setBadgeVisites] = useState(0)
  const [badgeMessages, setBadgeMessages] = useState(0)

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

  // Fetch du badge visites selon le rôle
  useEffect(() => {
    if (!session?.user?.email) return
    const email = session.user.email

    if (proprietaireActive) {
      // Proprio : nb de demandes en attente (proposée)
      supabase.from("visites")
        .select("id", { count: "exact", head: true })
        .eq("proprietaire_email", email)
        .eq("statut", "proposée")
        .then(({ count }) => setBadgeVisites(count ?? 0))
    } else {
      // Locataire : nb de visites confirmées à venir
      supabase.from("visites")
        .select("id", { count: "exact", head: true })
        .eq("locataire_email", email)
        .eq("statut", "confirmée")
        .gte("date_visite", new Date().toISOString().split("T")[0])
        .then(({ count }) => setBadgeVisites(count ?? 0))
    }
  }, [session, proprietaireActive, pathname])

  // Badge messages non lus
  useEffect(() => {
    if (!session?.user?.email) return
    supabase.from("messages")
      .select("id", { count: "exact", head: true })
      .eq("to_email", session.user.email)
      .eq("lu", false)
      .then(({ count }) => setBadgeMessages(count ?? 0))
  }, [session, pathname])

  const espaceLinks = proprietaireActive ? [
    { href: "/profil",               icon: "👤", label: "Mon profil",          desc: "Informations personnelles" },
    { href: "/proprietaire",         icon: "🏠", label: "Mes biens",           desc: "Gestion de mes annonces" },
    { href: "/proprietaire/ajouter", icon: "➕", label: "Publier un bien",     desc: "Ajouter une nouvelle annonce" },
    { href: "/carnet",               icon: "🔨", label: "Carnet d'entretien",  desc: "Historique des travaux", badge: badgeVisites > 0 ? undefined : undefined },
  ] : [
    { href: "/profil",               icon: "👤", label: "Mon profil",          desc: "Critères de recherche & matching" },
    { href: "/dossier",              icon: "📁", label: "Mon dossier",         desc: "Documents & complétion" },
    { href: "/visites",              icon: "📅", label: "Mes visites",         desc: "Demandes & confirmations", badge: badgeVisites },
    { href: "/carnet",               icon: "🔨", label: "Carnet d'entretien",  desc: "Historique des travaux" },
  ]

  const espaceActif = isActive("/profil") || isActive("/dossier") || isActive("/proprietaire") || isActive("/carnet") || isActive("/visites")

  // Pour proprio : badge sur "Mes biens" (dashboard avec onglet Visites)
  const espaceLinksAvecBadge = proprietaireActive
    ? espaceLinks.map(l => l.href === "/proprietaire" ? { ...l, badge: badgeVisites } : l)
    : espaceLinks

  return (
    <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 48px", background: "white", borderBottom: "1px solid #e5e7eb", position: "sticky", top: 0, zIndex: 1000, height: 64, boxShadow: "0 1px 8px rgba(0,0,0,0.05)" }}>

      {/* Logo */}
      <Link href="/" style={{ fontSize: 22, fontWeight: 800, textDecoration: "none", color: "#111", letterSpacing: "-0.5px" }}>
        NestMatch {isAdmin && <span style={{ fontSize: 12, background: "#111", color: "white", padding: "2px 8px", borderRadius: 999, marginLeft: 6 }}>ADMIN</span>}
      </Link>

      {/* Liens centraux */}
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <Link href="/annonces" style={linkStyle("/annonces")}>Annonces</Link>
        <Link href="/favoris"  style={linkStyle("/favoris")}>Favoris</Link>

        {session && (
          <>
            {/* Mon espace */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setEspaceOpen(!espaceOpen)}
                style={{
                  ...linkStyle("/profil"),
                  background: espaceActif ? "#f3f4f6" : "transparent",
                  color: espaceActif ? "#111" : "#6b7280",
                  fontWeight: espaceActif ? 700 : 500,
                  border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit", position: "relative",
                }}>
                Mon espace
                {/* Badge global sur le bouton */}
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
                        <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
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

      {/* Avatar / Auth */}
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
                  {[
                    { href: "/profil",       label: "Mon profil",     desc: "Critères de recherche" },
                    { href: "/dossier",      label: "Mon dossier",    desc: "Documents" },
                    { href: "/visites",      label: "Mes visites",    desc: "Demandes & confirmations" },
                    { href: "/proprietaire", label: "Mes biens",      desc: "Gestion propriétaire" },
                    { href: "/annonces",     label: "Annonces",       desc: "Trouver un logement" },
                    { href: "/messages",     label: "Messages",       desc: "Vos conversations" },
                  ].map(item => (
                    <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}
                      style={{ display: "block", padding: "12px 16px", textDecoration: "none", color: "#111" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <p style={{ fontSize: 14, fontWeight: 600 }}>{item.label}</p>
                      <p style={{ fontSize: 12, color: "#6b7280", marginTop: 1 }}>{item.desc}</p>
                    </Link>
                  ))}
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
            <Link href="/auth" style={{ padding: "10px 22px", background: "#111", color: "white", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 14 }}>S'inscrire</Link>
          </>
        )}
      </div>
    </nav>
  )
}
