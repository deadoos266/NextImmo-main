"use client"
import { useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"

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

export default function NotificationBell() {
  const { data: session } = useSession()
  const router = useRouter()
  const email = session?.user?.email?.toLowerCase() ?? null
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  async function refresh() {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" })
      if (!res.ok) return
      const json = await res.json()
      if (json.ok) {
        setNotifs(json.notifs || [])
        setUnreadCount(json.unreadCount || 0)
      }
    } catch { /* silent */ }
  }

  useEffect(() => {
    if (!email) { setNotifs([]); setUnreadCount(0); return }
    refresh()
    // Realtime : refresh complet dès qu'une notif me concerne arrive/change.
    const channel = supabase.channel(`notifs-${email}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "notifications",
        filter: `user_email=eq.${email}`,
      }, () => refresh())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [email])

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [open])

  async function handleClickNotif(n: Notif) {
    setOpen(false)
    // Optimistic mark read
    if (!n.lu) {
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
    // Optimistic
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

  if (!email) return null

  const badgeText = unreadCount > 99 ? "99+" : String(unreadCount)

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} non lues)` : ""}`}
        style={{
          position: "relative",
          background: open ? "#F7F4EF" : "white",
          border: "1px solid #EAE6DF",
          borderRadius: 999,
          width: 40,
          height: 40,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          padding: 0,
          color: "#111",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              background: "#b91c1c",
              color: "white",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 800,
              minWidth: 18,
              height: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 5px",
            }}
          >
            {badgeText}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            background: "white",
            borderRadius: 16,
            border: "1px solid #EAE6DF",
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            width: 340,
            maxWidth: "calc(100vw - 32px)",
            zIndex: 200,
            overflow: "hidden",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #F7F4EF", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                style={{ background: "none", border: "none", color: "#111", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}
              >
                Tout marquer lu
              </button>
            )}
          </div>

          {notifs.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "#8a8477", margin: 0 }}>Aucune notification.</p>
            </div>
          ) : (
            <div style={{ maxHeight: 400, overflowY: "auto" }}>
              {notifs.map(n => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClickNotif(n)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "12px 16px",
                    border: "none",
                    background: n.lu ? "white" : "#FBF6EA",
                    borderBottom: "1px solid #F7F4EF",
                    cursor: n.href ? "pointer" : "default",
                    fontFamily: "inherit",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    {!n.lu && (
                      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: "#b91c1c", marginTop: 6, flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: n.lu ? 600 : 800, color: "#111", margin: 0 }}>{n.title}</p>
                      {n.body && (
                        <p style={{ fontSize: 12, color: "#8a8477", margin: "2px 0 0", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                          {n.body}
                        </p>
                      )}
                      <p style={{ fontSize: 11, color: "#8a8477", margin: "4px 0 0" }}>{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
