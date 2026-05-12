"use client"
import { useState } from "react"
import { km } from "../../../components/ui/km"

/**
 * V97.31 P3-5.B.4 — Client component pour /admin/users avec actions admin :
 *  - Bannir (prompt ban_reason)
 *  - Débannir
 *  - Force reset password (envoie email reset au user)
 *  - Promote/demote admin (déjà existait via PATCH /api/admin/users)
 *
 * Reuse les endpoints existants :
 *  - PATCH /api/admin/users { kind: "ban"|"unban"|"toggle_admin", email, ... }
 *  - POST /api/admin/users/force-reset { email } (V97.31 nouveau)
 */

interface UserRow {
  id: string
  email: string
  name: string | null
  role: string | null
  is_admin: boolean | null
  is_banned: boolean | null
  ban_reason: string | null
  created_at: string
}

export default function UsersAdminClient({ initialUsers }: { initialUsers: UserRow[] }) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers)
  const [busyEmail, setBusyEmail] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  async function patchUser(kind: string, email: string, extra: Record<string, unknown> = {}) {
    setBusyEmail(email)
    setFeedback(null)
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, email, ...extra }),
      })
      const json = await res.json()
      if (!json.success && !json.ok) {
        setFeedback({ ok: false, msg: json.error || "Erreur" })
      } else {
        setFeedback({ ok: true, msg: "OK" })
        // Refresh la row localement
        setUsers(prev => prev.map(u => {
          if (u.email !== email) return u
          if (kind === "ban") return { ...u, is_banned: true, ban_reason: String(extra.ban_reason || "") }
          if (kind === "unban") return { ...u, is_banned: false, ban_reason: null }
          if (kind === "toggle_admin") return { ...u, is_admin: !!extra.is_admin }
          return u
        }))
      }
    } catch (e) {
      setFeedback({ ok: false, msg: e instanceof Error ? e.message : "Erreur réseau" })
    } finally {
      setBusyEmail(null)
      window.setTimeout(() => setFeedback(null), 4000)
    }
  }

  async function forceReset(email: string) {
    if (!confirm(`Envoyer un email de reset password à ${email} ?`)) return
    setBusyEmail(email)
    setFeedback(null)
    try {
      const res = await fetch("/api/admin/users/force-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      const json = await res.json()
      setFeedback({ ok: !!json.ok, msg: json.message || json.error || "?" })
    } catch (e) {
      setFeedback({ ok: false, msg: e instanceof Error ? e.message : "Erreur réseau" })
    } finally {
      setBusyEmail(null)
      window.setTimeout(() => setFeedback(null), 4000)
    }
  }

  async function handleBan(email: string) {
    const reason = window.prompt(`Raison du bannissement de ${email} ?`)
    if (!reason || reason.trim().length < 2) return
    await patchUser("ban", email, { ban_reason: reason.trim() })
  }

  return (
    <>
      {feedback && (
        <div style={{
          padding: "10px 14px",
          background: feedback.ok ? "#F0FAEE" : "#FEECEC",
          border: `1px solid ${feedback.ok ? "#C6E9C0" : "#F4C9C9"}`,
          borderRadius: 10,
          fontSize: 13,
          color: feedback.ok ? "#15803d" : "#b91c1c",
          marginBottom: 14,
        }}>{feedback.msg}</div>
      )}

      <div style={{ background: km.white, border: `1px solid ${km.line}`, borderRadius: 14, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
          <thead>
            <tr style={{ background: km.beige, color: km.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Nom</th>
              <th style={thStyle}>Rôle</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Status</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Créé</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: km.muted }}>Aucun user.</td></tr>
            ) : users.map(u => {
              const isBusy = busyEmail === u.email
              return (
                <tr key={u.id} style={{ borderTop: `1px solid ${km.line}`, opacity: isBusy ? 0.5 : 1 }}>
                  <td style={{ ...tdStyle, color: km.ink, fontWeight: 600 }}>{u.email}</td>
                  <td style={{ ...tdStyle, color: km.muted }}>{u.name || "—"}</td>
                  <td style={{ ...tdStyle, color: km.muted, fontSize: 11 }}>
                    {u.role}
                    {u.is_admin && <span style={{ marginLeft: 6, padding: "2px 6px", borderRadius: 4, background: km.ink, color: km.white, fontSize: 9, fontWeight: 700 }}>ADMIN</span>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    {u.is_banned ? (
                      <span style={{ fontSize: 10, color: "#b91c1c", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }} title={u.ban_reason || ""}>Banni</span>
                    ) : (
                      <span style={{ fontSize: 10, color: "#15803d", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Actif</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", color: km.muted, fontSize: 11 }}>
                    {new Date(u.created_at).toLocaleDateString("fr-FR")}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {u.is_banned ? (
                        <button
                          onClick={() => patchUser("unban", u.email)}
                          disabled={isBusy}
                          style={{ ...actionBtnStyle, color: "#15803d", borderColor: "#86efac" }}
                          title="Débannir ce compte"
                        >Débannir</button>
                      ) : (
                        <button
                          onClick={() => handleBan(u.email)}
                          disabled={isBusy}
                          style={{ ...actionBtnStyle, color: "#b91c1c", borderColor: "#fca5a5" }}
                          title="Bannir ce compte"
                        >Bannir</button>
                      )}
                      <button
                        onClick={() => forceReset(u.email)}
                        disabled={isBusy}
                        style={{ ...actionBtnStyle, color: km.ink, borderColor: km.line }}
                        title="Force reset password — envoie un email reset à l'user"
                      >Reset password</button>
                      <button
                        onClick={() => patchUser("toggle_admin", u.email, { is_admin: !u.is_admin })}
                        disabled={isBusy}
                        style={{ ...actionBtnStyle, color: km.ink, borderColor: km.line }}
                        title={u.is_admin ? "Retirer les droits admin" : "Donner les droits admin"}
                      >{u.is_admin ? "Demote" : "Promote"}</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

const thStyle: React.CSSProperties = { padding: "10px 14px", textAlign: "left", fontWeight: 700 }
const tdStyle: React.CSSProperties = { padding: "10px 14px" }
const actionBtnStyle: React.CSSProperties = {
  background: "white",
  border: "1px solid",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 10.5,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  textTransform: "uppercase",
  letterSpacing: 0.4,
}
