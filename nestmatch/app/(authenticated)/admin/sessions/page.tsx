import { supabaseAdmin } from "../../../../lib/supabase-server"
import AdminPageHeader from "../../../components/admin/AdminPageHeader"
import { km } from "../../../components/ui/km"

export const metadata = {
  title: "Sessions admin — KeyMatch",
  description: "Sessions actives + dernière connexion utilisateurs.",
  robots: { index: false, follow: false },
}
export const dynamic = "force-dynamic"

/**
 * V85.7 — /admin/sessions
 *
 * NextAuth utilise des JWT signés côté serveur, pas de table sessions
 * stockée en DB (strategy 'jwt' au lieu de 'database'). Pour avoir une
 * vraie liste de sessions actives, il faudrait basculer vers session
 * strategy 'database' + créer une table sessions (V86+).
 *
 * Pour l'instant, on affiche les dernières connexions via le champ
 * users.last_active si dispo, OU on compte les users qui ont créé/lu
 * des messages dans les 24h derniers (proxy d'activité).
 */

async function fetchRecentActivity() {
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  // Proxy : users qui ont envoyé un message dans les 24h
  const { data: senders } = await supabaseAdmin
    .from("messages")
    .select("from_email")
    .gte("created_at", since24h)
    .limit(500)
  const uniqueEmails = Array.from(new Set((senders || []).map(s => s.from_email).filter(Boolean)))
  if (uniqueEmails.length === 0) return []
  const { data: users } = await supabaseAdmin
    .from("users")
    .select("id, email, name, role, is_admin, last_active")
    .in("email", uniqueEmails)
    .order("last_active", { ascending: false, nullsFirst: false })
    .limit(100)
  return users || []
}

async function fetchTopActive() {
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const { data } = await supabaseAdmin
    .from("messages")
    .select("from_email")
    .gte("created_at", since7d)
  const counts: Record<string, number> = {}
  for (const m of data || []) {
    if (m.from_email) counts[m.from_email] = (counts[m.from_email] || 0) + 1
  }
  return Object.entries(counts)
    .map(([email, count]) => ({ email, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
}

export default async function AdminSessionsPage() {
  const [recent, topActive] = await Promise.all([fetchRecentActivity(), fetchTopActive()])

  return (
    <div>
      <AdminPageHeader
        title="Sessions"
        subtitle={`${recent.length} users actifs 24h (proxy: messages envoyés) · NextAuth strategy 'jwt' → pas de table sessions persistée`}
      />

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "var(--font-fraunces), 'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: "0 0 14px", color: km.ink }}>
          Actifs 24h
        </h2>
        <div style={{ background: km.white, border: `1px solid ${km.line}`, borderRadius: 14, overflow: "hidden" }}>
          {recent.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: km.muted, fontSize: 13 }}>Aucune activité dans les 24h.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
              <thead>
                <tr style={{ background: km.beige, color: km.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>
                  <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>Email</th>
                  <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>Nom</th>
                  <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>Rôle</th>
                  <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700 }}>Dernière activité</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(u => (
                  <tr key={u.id} style={{ borderTop: `1px solid ${km.line}` }}>
                    <td style={{ padding: "10px 14px", color: km.ink, fontWeight: 600 }}>{u.email}</td>
                    <td style={{ padding: "10px 14px", color: km.muted, fontSize: 12 }}>{u.name || "—"}</td>
                    <td style={{ padding: "10px 14px", color: km.muted, fontSize: 12 }}>
                      {u.role}{u.is_admin && <span style={{ marginLeft: 6, padding: "2px 6px", borderRadius: 4, background: km.ink, color: km.white, fontSize: 9, fontWeight: 700 }}>ADMIN</span>}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: km.muted, fontSize: 11 }}>
                      {u.last_active ? new Date(u.last_active).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section>
        <h2 style={{ fontFamily: "var(--font-fraunces), 'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: "0 0 14px", color: km.ink }}>
          Top 20 actifs 7j (messages envoyés)
        </h2>
        <div style={{ background: km.white, border: `1px solid ${km.line}`, borderRadius: 14, overflow: "hidden" }}>
          {topActive.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: km.muted, fontSize: 13 }}>Aucune donnée.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
              <thead>
                <tr style={{ background: km.beige, color: km.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>
                  <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>Email</th>
                  <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700 }}>Messages</th>
                </tr>
              </thead>
              <tbody>
                {topActive.map(u => (
                  <tr key={u.email} style={{ borderTop: `1px solid ${km.line}` }}>
                    <td style={{ padding: "10px 14px", color: km.ink, fontWeight: 600 }}>{u.email}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: km.ink, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{u.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}
