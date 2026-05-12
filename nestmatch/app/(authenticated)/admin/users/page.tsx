import { supabaseAdmin } from "../../../../lib/supabase-server"
import AdminPageHeader from "../../../components/admin/AdminPageHeader"
import { km } from "../../../components/ui/km"
import UsersAdminClient from "./UsersAdminClient"

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

      {/* V97.31 — Liste interactive avec actions ban/unban/reset/promote */}
      <UsersAdminClient initialUsers={users} />

      <p style={{ fontSize: 11, color: km.muted, marginTop: 14 }}>
        Actions admin : Bannir / Débannir / Reset password / Promote ou Demote. Tous les events sont auth-gated (NextAuth + is_admin) et passent par <code>/api/admin/users</code> ou <code>/api/admin/users/force-reset</code>.
      </p>
    </div>
  )
}
