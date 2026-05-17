"use client"
import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useRealtimeSubscription } from "@/lib/realtime"

/**
 * V81 — Page pleine vue /notifications (auth).
 *
 * Le BottomNavMobile (V73.9) avait un tab "Notifs" qui pointait vers
 * /notifications mais cette page n'existait pas (404 console). Cette page
 * affiche la liste complète des notifications, groupées par date, avec
 * actions individuelles (cliquer = mark-read + ouvre href, croix =
 * dismiss, "Tout marquer lu" en haut).
 *
 * Équivalent du dropdown NotificationBell mais en pleine page (mieux sur
 * mobile, scroll natif, swipe-to-delete possible V82).
 */

type Notif = {
  id: number
  type: string
  title: string
  body: string | null
  href: string | null
  related_id: string | null
  lu: boolean
  created_at: string
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const j = Math.floor(h / 24)
  if (j < 7) return `il y a ${j} j`
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
}

function groupKey(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today.getTime() - 86400000)
  const thisWeek = new Date(today.getTime() - 7 * 86400000)
  if (d >= today) return "Aujourd'hui"
  if (d >= yesterday) return "Hier"
  if (d >= thisWeek) return "Cette semaine"
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
}

export default function NotificationsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  // Redirect si pas auth
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/auth?from=/notifications")
  }, [status, router])

  async function refresh() {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" })
      if (!res.ok) return
      const json = await res.json()
      if (json.ok) {
        setNotifs(json.notifs || [])
        setUnreadCount(json.unreadCount || 0)
      }
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }

  const userEmail = session?.user?.email?.toLowerCase()
  useEffect(() => {
    if (!userEmail) { setLoading(false); return }
    refresh()
  }, [userEmail])

  // V97.39.25 — migré vers useRealtimeSubscription (dispatcher Supabase↔socketio).
  useRealtimeSubscription(
    "notifications",
    { filter: { user_email: userEmail || "" }, enabled: !!userEmail },
    () => refresh(),
  )

  async function handleClickNotif(n: Notif) {
    if (!n.lu) {
      // Optimistic mark-read
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, lu: true } : x))
      setUnreadCount(c => Math.max(0, c - 1))
      fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [n.id] }),
      }).catch(() => { /* silent */ })
    }
    if (n.href) router.push(n.href)
  }

  async function markAllRead() {
    setNotifs(prev => prev.map(x => ({ ...x, lu: true })))
    setUnreadCount(0)
    try {
      await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      })
    } catch { /* silent */ }
  }

  async function dismissNotif(id: number) {
    const target = notifs.find(n => n.id === id)
    setNotifs(prev => prev.filter(n => n.id !== id))
    if (target && !target.lu) setUnreadCount(c => Math.max(0, c - 1))
    try {
      const res = await fetch(`/api/notifications/${id}/dismiss`, { method: "POST" })
      if (!res.ok && target) {
        setNotifs(prev => [...prev, target].sort((a, b) => b.id - a.id))
        if (!target.lu) setUnreadCount(c => c + 1)
      }
    } catch {
      if (target) {
        setNotifs(prev => [...prev, target].sort((a, b) => b.id - a.id))
        if (!target.lu) setUnreadCount(c => c + 1)
      }
    }
  }

  // Groupes ordonnés par date
  const groups: { key: string; items: Notif[] }[] = []
  for (const n of notifs) {
    const k = groupKey(n.created_at)
    let g = groups.find(x => x.key === k)
    if (!g) { g = { key: k, items: [] }; groups.push(g) }
    g.items.push(n)
  }

  return (
    <main style={{ background: "#F7F4EF", minHeight: "100vh", padding: "48px 16px 96px", fontFamily: "'DM Sans', sans-serif", color: "#111" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* En-tête */}
        <header style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "#8a8477", margin: "0 0 8px", textTransform: "uppercase" }}>
            Notifications
          </p>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 44, lineHeight: 1.1, margin: 0, letterSpacing: "-0.5px" }}>
              {unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? "s" : ""}` : "À jour"}
            </h1>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                style={{ background: "white", color: "#111", border: "1px solid #EAE6DF", borderRadius: 999, padding: "8px 18px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.3px" }}
              >
                Tout marquer lu
              </button>
            )}
          </div>
        </header>

        {/* Loading */}
        {loading && (
          <div style={{ background: "white", borderRadius: 20, padding: 32, border: "1px solid #EAE6DF", textAlign: "center", color: "#8a8477" }}>
            Chargement…
          </div>
        )}

        {/* Empty */}
        {!loading && notifs.length === 0 && (
          <div style={{ background: "white", borderRadius: 20, padding: 48, border: "1px solid #EAE6DF", textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#F7F4EF", border: "1px solid #EAE6DF", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8a8477" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <p style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontSize: 22, fontWeight: 500, color: "#111", margin: "0 0 8px" }}>Aucune notification</p>
            <p style={{ fontSize: 14, color: "#8a8477", margin: 0, lineHeight: 1.6 }}>
              Vous serez prévenu ici dès qu&apos;il se passera quelque chose.<br />
              <Link href="/annonces" style={{ color: "#111", textDecoration: "underline", textUnderlineOffset: 2, fontWeight: 600 }}>Voir les annonces →</Link>
            </p>
          </div>
        )}

        {/* Groupes par date */}
        {!loading && groups.map(g => (
          <section key={g.key} style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 12, fontWeight: 700, color: "#8a8477", letterSpacing: 1, textTransform: "uppercase", margin: "0 0 12px", paddingLeft: 4 }}>
              {g.key}
            </h2>
            <div style={{ background: "white", borderRadius: 20, border: "1px solid #EAE6DF", overflow: "hidden" }}>
              {g.items.map((n, i) => (
                <div
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleClickNotif(n)}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClickNotif(n) } }}
                  style={{
                    position: "relative",
                    padding: "16px 44px 16px 20px",
                    cursor: n.href ? "pointer" : "default",
                    background: n.lu ? "white" : "#FBF6EA",
                    borderBottom: i < g.items.length - 1 ? "1px solid #F2EEE6" : "none",
                    WebkitTapHighlightColor: "rgba(0,0,0,0.04)",
                    transition: "background 160ms ease",
                  }}
                  onMouseEnter={e => { if (n.href) e.currentTarget.style.background = n.lu ? "#FBF8F3" : "#F8F1DC" }}
                  onMouseLeave={e => { e.currentTarget.style.background = n.lu ? "white" : "#FBF6EA" }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    {!n.lu && (
                      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: "#b91c1c", marginTop: 8, flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: n.lu ? 600 : 700, color: "#111", margin: "0 0 4px", lineHeight: 1.4 }}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p style={{ fontSize: 13, color: "#5a5247", margin: "0 0 6px", lineHeight: 1.5 }}>
                          {n.body}
                        </p>
                      )}
                      <p style={{ fontSize: 11, color: "#8a8477", margin: 0 }}>{timeAgo(n.created_at)}</p>
                    </div>
                  </div>

                  {/* Croix dismiss */}
                  <button
                    type="button"
                    aria-label="Supprimer cette notification"
                    onClick={e => { e.stopPropagation(); dismissNotif(n.id) }}
                    style={{
                      position: "absolute",
                      top: 12,
                      right: 12,
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: "transparent",
                      border: "none",
                      color: "#8a8477",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "inherit",
                      WebkitTapHighlightColor: "transparent",
                      transition: "background 150ms ease, color 150ms ease",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#F7F4EF"; (e.currentTarget as HTMLButtonElement).style.color = "#111" }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "#8a8477" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
