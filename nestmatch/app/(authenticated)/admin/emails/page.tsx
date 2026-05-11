import { supabaseAdmin } from "../../../../lib/supabase-server"
import AdminPageHeader from "../../../components/admin/AdminPageHeader"
import EmailsAdminClient from "./EmailsAdminClient"

export const metadata = {
  title: "Emails admin",
  description: "Logs Resend + stats deliverability + suppress list + test email.",
  robots: { index: false, follow: false },
}
export const dynamic = "force-dynamic"

async function fetchInitialLogs() {
  const { data } = await supabaseAdmin
    .from("email_logs")
    .select("id, resend_id, to_email, from_email, subject, template_name, status, sent_at, delivered_at, opened_at, bounced_at, complained_at, bounce_type, error_message")
    .order("sent_at", { ascending: false })
    .limit(100)
  return data || []
}

async function fetchStats() {
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const { data: all7d } = await supabaseAdmin
    .from("email_logs")
    .select("status, template_name")
    .gte("sent_at", since7d)
    .limit(5000)
  const byStatus: Record<string, number> = {}
  const byTemplate: Record<string, number> = {}
  for (const l of all7d || []) {
    byStatus[l.status] = (byStatus[l.status] || 0) + 1
    if (l.template_name) byTemplate[l.template_name] = (byTemplate[l.template_name] || 0) + 1
  }
  const total7d = all7d?.length || 0
  const delivered7d = byStatus.delivered || 0
  const opened7d = byStatus.opened || 0
  const clicked7d = byStatus.clicked || 0
  const bounced7d = byStatus.bounced || 0
  const deliveryRate = total7d > 0 ? Math.round(((delivered7d + opened7d + clicked7d) / total7d) * 100) : 0
  const bounceRate = total7d > 0 ? Math.round((bounced7d / total7d) * 100) : 0
  const { count: suppressCount } = await supabaseAdmin
    .from("email_suppress_list")
    .select("email", { count: "exact", head: true })
    .is("removed_at", null)
  return {
    total_7d: total7d,
    by_status: byStatus,
    by_template: byTemplate,
    delivery_rate_pct: deliveryRate,
    bounce_rate_pct: bounceRate,
    suppress_count: suppressCount || 0,
  }
}

async function fetchSuppressed() {
  const { data } = await supabaseAdmin
    .from("email_suppress_list")
    .select("email, reason, reason_detail, added_at, added_by")
    .is("removed_at", null)
    .order("added_at", { ascending: false })
    .limit(50)
  return data || []
}

export default async function AdminEmailsPage() {
  const [logs, stats, suppressed] = await Promise.all([fetchInitialLogs(), fetchStats(), fetchSuppressed()])

  return (
    <div>
      <AdminPageHeader
        title="Emails"
        subtitle={`${stats.total_7d} emails 7j · ${stats.delivery_rate_pct}% delivery · ${stats.bounce_rate_pct}% bounce · ${stats.suppress_count} suppressed`}
      />
      <EmailsAdminClient logs={logs} stats={stats} suppressed={suppressed} />
    </div>
  )
}
