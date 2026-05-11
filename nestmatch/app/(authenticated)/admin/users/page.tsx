import { supabaseAdmin } from "../../../../lib/supabase-server"
import AdminPageHeader from "../../../components/admin/AdminPageHeader"
import { km } from "../../../components/ui/km"

export const metadata = {
  title: "Utilisateurs admin — KeyMatch",
  description: "Gestion des comptes utilisateurs.",
  robots: { index: false, follow: false },
}
export const dynamic = "force-dynamic"

async function fetchUsers() {
  const { data } = await supabaseAdmin
    .from("users")
    .select("id, email, name, role, is_admin, is_banned, ban_reason, created_at")
    .order("created_at", { ascending: false })
    .limit(200)
  return data || []
}

async function fetchStats() {
  const { count: total } = await supabaseAdmin.from("users").select("id", { count: "exact", head: true })
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { count: new24h } = await supabaseAdmin.from("users").select("id", { count: "exact", head: true }).gte("created_at", since24h)
  const { count: admins } = await supabaseAdmin.from("users").select("id", { count: "exact", head: true }).eq("is_admin", true)
  const { count: banned } = await supabaseAdmin.from("users").select("id", { count: "exact", head: true }).eq("is_banned", true)
  return { total: total || 0, new24h: new24h || 0, admins: admins || 0, banned: banned || 0 }
}

export default async function AdminUsersPage() {
  const [users, stats] = await Promise.all([fetchUsers(), fetchStats()])

  return (
    <div>
      <AdminPageHeader title="Utilisateurs" subtitle={`${stats.total} comptes · ${stats.new24h} nouveaux 24h · ${stats.admins} admins · ${stats.banned} bannis`} />

      <div style={{ background: km.white, border: `1px solid ${km.line}`, borderRadius: 14, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
          <thead>
            <tr style={{ background: km.beige, color: km.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>Email</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>Nom</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>Rôle</th>
              <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700 }}>Status</th>
              <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700 }}>Créé</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: "center", color: km.muted }}>Aucun user.</td></tr>
            ) : users.map(u => (
              <tr key={u.id} style={{ borderTop: `1px solid ${km.line}` }}>
                <td style={{ padding: "10px 14px", color: km.ink, fontWeight: 600 }}>{u.email}</td>
                <td style={{ padding: "10px 14px", color: km.muted }}>{u.name || "—"}</td>
                <td style={{ padding: "10px 14px", color: km.muted, fontSize: 11 }}>
                  {u.role}{u.is_admin && <span style={{ marginLeft: 6, padding: "2px 6px", borderRadius: 4, background: km.ink, color: km.white, fontSize: 9, fontWeight: 700 }}>ADMIN</span>}
                </td>
                <td style={{ padding: "10px 14px", textAlign: "center" }}>
                  {u.is_banned ? (
                    <span style={{ fontSize: 10, color: "#b91c1c", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }} title={u.ban_reason || ""}>Banni</span>
                  ) : (
                    <span style={{ fontSize: 10, color: "#15803d", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Actif</span>
                  )}
                </td>
                <td style={{ padding: "10px 14px", textAlign: "right", color: km.muted, fontSize: 11 }}>
                  {new Date(u.created_at).toLocaleDateString("fr-FR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 11, color: km.muted, marginTop: 14 }}>
        Pour ban / promote / delete : utilise le dashboard <a href="/admin#users" style={{ color: km.ink }}>/admin · onglet Utilisateurs</a>.
      </p>
    </div>
  )
}
