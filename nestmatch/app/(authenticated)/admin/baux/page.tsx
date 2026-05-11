import { supabaseAdmin } from "../../../../lib/supabase-server"
import AdminPageHeader from "../../../components/admin/AdminPageHeader"
import { km } from "../../../components/ui/km"

export const metadata = {
  title: "Baux admin — KeyMatch",
  description: "Vue admin des baux signés.",
  robots: { index: false, follow: false },
}
export const dynamic = "force-dynamic"

async function fetchBaux() {
  const { data } = await supabaseAdmin
    .from("baux")
    .select("id, annonce_id, proprietaire_email, locataire_email, statut, loyer, charges, date_debut, date_fin, signed_at, created_at")
    .order("created_at", { ascending: false })
    .limit(150)
  return data || []
}

async function fetchStats() {
  const { count: total } = await supabaseAdmin.from("baux").select("id", { count: "exact", head: true })
  const { count: actifs } = await supabaseAdmin.from("baux").select("id", { count: "exact", head: true }).eq("statut", "actif")
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const { count: signedMonth } = await supabaseAdmin.from("baux").select("id", { count: "exact", head: true }).gte("signed_at", startOfMonth)
  const { count: termines } = await supabaseAdmin.from("baux").select("id", { count: "exact", head: true }).eq("statut", "termine")
  return { total: total || 0, actifs: actifs || 0, signedMonth: signedMonth || 0, termines: termines || 0 }
}

export default async function AdminBauxPage() {
  const [baux, stats] = await Promise.all([fetchBaux(), fetchStats()])

  return (
    <div>
      <AdminPageHeader
        title="Baux"
        subtitle={`${stats.total} total · ${stats.actifs} actifs · ${stats.signedMonth} signés ce mois · ${stats.termines} terminés`}
      />

      <div style={{ background: km.white, border: `1px solid ${km.line}`, borderRadius: 14, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
          <thead>
            <tr style={{ background: km.beige, color: km.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>Annonce</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>Proprio</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>Locataire</th>
              <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700 }}>Status</th>
              <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700 }}>Loyer</th>
              <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700 }}>Période</th>
            </tr>
          </thead>
          <tbody>
            {baux.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: km.muted }}>Aucun bail.</td></tr>
            ) : baux.map(b => {
              const statut = b.statut || "—"
              const statutColor = statut === "actif" ? "#15803d" : statut === "termine" ? km.muted : statut === "broullion" ? "#a16207" : "#1d4ed8"
              return (
                <tr key={b.id} style={{ borderTop: `1px solid ${km.line}` }}>
                  <td style={{ padding: "10px 14px", color: km.ink }}>
                    <a href={`/annonces/${b.annonce_id}`} target="_blank" rel="noopener noreferrer" style={{ color: km.ink, textDecoration: "none" }}>
                      #{b.annonce_id}
                    </a>
                  </td>
                  <td style={{ padding: "10px 14px", color: km.muted, fontSize: 11, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.proprietaire_email}</td>
                  <td style={{ padding: "10px 14px", color: km.muted, fontSize: 11, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.locataire_email}</td>
                  <td style={{ padding: "10px 14px", textAlign: "center" }}>
                    <span style={{ fontSize: 10, color: statutColor, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{statut}</span>
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", color: km.ink, fontVariantNumeric: "tabular-nums" }}>
                    {b.loyer ? `${b.loyer} €` : "—"}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", color: km.muted, fontSize: 11 }}>
                    {b.date_debut ? new Date(b.date_debut).toLocaleDateString("fr-FR") : "—"}
                    {b.date_fin && <span> → {new Date(b.date_fin).toLocaleDateString("fr-FR")}</span>}
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
