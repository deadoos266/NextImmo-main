import { supabaseAdmin } from "../../../../lib/supabase-server"
import AdminPageHeader from "../../../components/admin/AdminPageHeader"
import { km } from "../../../components/ui/km"

export const metadata = {
  title: "Annonces admin — KeyMatch",
  description: "Vue admin des annonces publiées.",
  robots: { index: false, follow: false },
}
export const dynamic = "force-dynamic"

async function fetchAnnonces() {
  const { data } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, ville, prix, surface, pieces, dpe, statut, proprietaire_email, is_test, created_at")
    .order("created_at", { ascending: false })
    .limit(150)
  return data || []
}

async function fetchStats() {
  const { count: total } = await supabaseAdmin.from("annonces").select("id", { count: "exact", head: true }).eq("is_test", false)
  const { count: dispo } = await supabaseAdmin.from("annonces").select("id", { count: "exact", head: true }).eq("is_test", false).or("statut.is.null,statut.eq.disponible")
  const { count: loues } = await supabaseAdmin.from("annonces").select("id", { count: "exact", head: true }).eq("statut", "loué")
  const { count: tests } = await supabaseAdmin.from("annonces").select("id", { count: "exact", head: true }).eq("is_test", true)
  return { total: total || 0, dispo: dispo || 0, loues: loues || 0, tests: tests || 0 }
}

export default async function AdminAnnoncesPage() {
  const [annonces, stats] = await Promise.all([fetchAnnonces(), fetchStats()])

  return (
    <div>
      <AdminPageHeader
        title="Annonces"
        subtitle={`${stats.total} actives · ${stats.dispo} disponibles · ${stats.loues} louées · ${stats.tests} en test`}
      />

      <div style={{ background: km.white, border: `1px solid ${km.line}`, borderRadius: 14, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
          <thead>
            <tr style={{ background: km.beige, color: km.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>Titre</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>Ville</th>
              <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700 }}>Prix</th>
              <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700 }}>Surface</th>
              <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700 }}>Status</th>
              <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700 }}>Proprio</th>
              <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700 }}>Créée</th>
            </tr>
          </thead>
          <tbody>
            {annonces.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: km.muted }}>Aucune annonce.</td></tr>
            ) : annonces.map(a => {
              const statut = a.statut || "disponible"
              const statutColor = statut === "loué" ? "#a16207" : statut === "disponible" ? "#15803d" : km.muted
              return (
                <tr key={a.id} style={{ borderTop: `1px solid ${km.line}` }}>
                  <td style={{ padding: "10px 14px", color: km.ink, fontWeight: 600, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <a href={`/annonces/${a.id}`} target="_blank" rel="noopener noreferrer" style={{ color: km.ink, textDecoration: "none" }}>
                      {a.titre || "(sans titre)"}
                    </a>
                    {a.is_test && <span style={{ marginLeft: 6, padding: "2px 6px", borderRadius: 4, background: km.muted, color: km.white, fontSize: 9, fontWeight: 700 }}>TEST</span>}
                  </td>
                  <td style={{ padding: "10px 14px", color: km.muted, fontSize: 12 }}>{a.ville || "—"}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right", color: km.ink, fontVariantNumeric: "tabular-nums" }}>
                    {a.prix ? `${a.prix} €` : "—"}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", color: km.muted, fontSize: 12 }}>
                    {a.surface ? `${a.surface} m²` : "—"}{a.pieces ? ` · ${a.pieces}p` : ""}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "center" }}>
                    <span style={{ fontSize: 10, color: statutColor, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{statut}</span>
                  </td>
                  <td style={{ padding: "10px 14px", color: km.muted, fontSize: 11, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.proprietaire_email}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", color: km.muted, fontSize: 11 }}>
                    {new Date(a.created_at).toLocaleDateString("fr-FR")}
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
