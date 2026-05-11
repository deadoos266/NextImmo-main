import { supabaseAdmin } from "../../../../lib/supabase-server"
import AdminPageHeader from "../../../components/admin/AdminPageHeader"
import { km } from "../../../components/ui/km"

export const metadata = {
  title: "Loyers admin — KeyMatch",
  description: "Vue admin des loyers déclarés et payés.",
  robots: { index: false, follow: false },
}
export const dynamic = "force-dynamic"

async function fetchLoyers() {
  const { data } = await supabaseAdmin
    .from("loyers")
    .select("id, bail_id, mois, montant, statut, paye_le, notified_retard_at, notified_retard_15_at, created_at")
    .order("created_at", { ascending: false })
    .limit(150)
  return data || []
}

async function fetchStats() {
  const { count: total } = await supabaseAdmin.from("loyers").select("id", { count: "exact", head: true })
  const { count: declare } = await supabaseAdmin.from("loyers").select("id", { count: "exact", head: true }).eq("statut", "déclaré")
  const { count: paye } = await supabaseAdmin.from("loyers").select("id", { count: "exact", head: true }).eq("statut", "payé")
  const { count: retard } = await supabaseAdmin
    .from("loyers")
    .select("id", { count: "exact", head: true })
    .eq("statut", "déclaré")
    .not("notified_retard_at", "is", null)
  return { total: total || 0, declare: declare || 0, paye: paye || 0, retard: retard || 0 }
}

export default async function AdminLoyersPage() {
  const [loyers, stats] = await Promise.all([fetchLoyers(), fetchStats()])

  return (
    <div>
      <AdminPageHeader
        title="Loyers"
        subtitle={`${stats.total} loyers · ${stats.declare} en attente · ${stats.paye} payés · ${stats.retard} en retard notifié`}
      />

      <div style={{ background: km.white, border: `1px solid ${km.line}`, borderRadius: 14, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
          <thead>
            <tr style={{ background: km.beige, color: km.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>Mois</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>Bail</th>
              <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700 }}>Montant</th>
              <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700 }}>Status</th>
              <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700 }}>Payé</th>
              <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700 }}>Retard notif</th>
            </tr>
          </thead>
          <tbody>
            {loyers.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: km.muted }}>Aucun loyer.</td></tr>
            ) : loyers.map(l => {
              const statut = l.statut || "—"
              const statutColor = statut === "payé" ? "#15803d" : statut === "déclaré" ? "#a16207" : km.muted
              return (
                <tr key={l.id} style={{ borderTop: `1px solid ${km.line}` }}>
                  <td style={{ padding: "10px 14px", color: km.ink, fontFamily: "monospace", fontSize: 12 }}>{l.mois}</td>
                  <td style={{ padding: "10px 14px", color: km.muted, fontSize: 11 }}>#{l.bail_id}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right", color: km.ink, fontVariantNumeric: "tabular-nums" }}>
                    {l.montant ? `${l.montant} €` : "—"}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "center" }}>
                    <span style={{ fontSize: 10, color: statutColor, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{statut}</span>
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", color: km.muted, fontSize: 11 }}>
                    {l.paye_le ? new Date(l.paye_le).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", color: km.muted, fontSize: 11 }}>
                    {l.notified_retard_15_at ? "J+15 ✓" : l.notified_retard_at ? "J+5 ✓" : "—"}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
