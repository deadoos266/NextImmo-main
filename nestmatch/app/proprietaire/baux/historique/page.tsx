"use client"
/**
 * V57.6 — /proprietaire/baux/historique
 *
 * Liste des baux clos du proprio. Pour chaque bail :
 *   - Bien (titre + ville + adresse)
 *   - Locataire (email)
 *   - Période (date_debut → date_fin)
 *   - Loyer total perçu
 *   - Caution + restitution dépôt
 *   - Liens : PDF bail signé, EDL entrée, EDL sortie
 *   - Motif fin de bail
 *
 * Lecture seule. Source : /api/baux/historique?as=proprio.
 */

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface HistoriqueBail {
  id: number
  annonce_id: number
  locataire_email: string
  date_debut_bail: string | null
  date_fin_bail: string | null
  bail_termine_at: string
  bien_titre: string | null
  bien_ville: string | null
  bien_adresse: string | null
  loyer_hc: number | null
  charges: number | null
  caution: number | null
  depot_restitue_at: string | null
  depot_montant_restitue: number | null
  depot_montant_retenu: number | null
  depot_motifs_retenue: Array<{ libelle: string; montant: number; type: string }> | null
  total_loyers_percus: number | null
  bail_pdf_url: string | null
  edl_entree_id: string | null
  edl_sortie_id: string | null
  fin_motif: string | null
  fin_motif_detail: string | null
}

const FIN_MOTIF_LABEL: Record<string, string> = {
  preavis_locataire: "Préavis donné par le locataire",
  preavis_bailleur: "Préavis donné par le bailleur",
  fin_terme: "Fin de la durée du bail",
  accord_amiable: "Accord amiable",
}

function formatDateFr(iso: string | null | undefined): string {
  if (!iso) return ""
  try { return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) }
  catch { return iso }
}

function formatEur(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return `${Number(n).toLocaleString("fr-FR")} €`
}

export default function HistoriqueBauxPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [baux, setBaux] = useState<HistoriqueBail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth")
      return
    }
    if (status !== "authenticated") return
    void (async () => {
      try {
        const res = await fetch("/api/baux/historique?as=proprio", { cache: "no-store" })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json.ok) {
          setError(json?.error || "Erreur de chargement")
        } else {
          setBaux(json.baux || [])
        }
      } catch {
        setError("Erreur réseau")
      } finally {
        setLoading(false)
      }
    })()
  }, [status, router])

  if (status !== "authenticated") return null

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: "32px 16px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500&display=swap');`}</style>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "2.2px", textTransform: "uppercase", color: "#666" }}>
            Mon espace propriétaire
          </span>
          <span style={{ flex: 1, height: 1, background: "#EAE6DF", maxWidth: 220 }} aria-hidden />
          <Link href="/proprietaire" style={{ fontSize: 12, color: "#8a8477", textDecoration: "none" }}>← Dashboard</Link>
        </div>

        <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 40, letterSpacing: "-0.6px", color: "#111", margin: "0 0 8px", lineHeight: 1.1 }}>
          Historique des baux
        </h1>
        <p style={{ fontSize: 14, color: "#666", margin: "0 0 24px", lineHeight: 1.5, maxWidth: 560 }}>
          Tous vos baux clos, du plus récent au plus ancien. Conservation 3 ans
          minimum (loi ALUR). Téléchargez le PDF du bail signé, les EDL
          d&apos;entrée et de sortie pour chaque location.
        </p>

        {loading && (
          <p style={{ fontSize: 13, color: "#8a8477" }}>Chargement…</p>
        )}

        {error && (
          <div style={{ background: "#FEECEC", border: "1px solid #F4C9C9", borderRadius: 14, padding: "12px 16px", color: "#b91c1c", fontSize: 13 }}>
            {error}
          </div>
        )}

        {!loading && !error && baux.length === 0 && (
          <div style={{ background: "white", border: "1px solid #EAE6DF", borderRadius: 20, padding: 32, textAlign: "center" }}>
            <p style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontSize: 18, color: "#111", margin: "0 0 8px" }}>
              Aucun bail clos pour le moment
            </p>
            <p style={{ fontSize: 13, color: "#8a8477", margin: 0 }}>
              Quand vous terminerez une location et republierez un bien,
              le bail sera archivé ici.
            </p>
          </div>
        )}

        {!loading && !error && baux.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {baux.map(b => {
              const motifLabel = b.fin_motif ? FIN_MOTIF_LABEL[b.fin_motif] || b.fin_motif : "—"
              const dureeMois = (() => {
                if (!b.date_debut_bail || !b.date_fin_bail) return null
                const start = new Date(b.date_debut_bail).getTime()
                const end = new Date(b.date_fin_bail).getTime()
                if (!Number.isFinite(start) || !Number.isFinite(end)) return null
                return Math.max(1, Math.round((end - start) / (30 * 24 * 3600 * 1000)))
              })()
              return (
                <article key={b.id} style={{ background: "white", border: "1px solid #EAE6DF", borderRadius: 20, padding: 24, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14, marginBottom: 16 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 6px" }}>
                        {b.bien_ville || "—"}
                      </p>
                      <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, color: "#111", margin: 0, letterSpacing: "-0.2px" }}>
                        {b.bien_titre || "Bien"}
                      </h2>
                      {b.bien_adresse && (
                        <p style={{ fontSize: 12, color: "#8a8477", margin: "4px 0 0" }}>{b.bien_adresse}</p>
                      )}
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#a16207", background: "#FBF6EA", border: "1px solid #EADFC6", padding: "4px 10px", borderRadius: 999, textTransform: "uppercase", letterSpacing: "1px" }}>
                      Clos le {formatDateFr(b.bail_termine_at)}
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 16 }}>
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 4px" }}>Locataire</p>
                      <p style={{ fontSize: 13, color: "#111", margin: 0, fontWeight: 500, wordBreak: "break-all" as const }}>{b.locataire_email}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 4px" }}>Période</p>
                      <p style={{ fontSize: 13, color: "#111", margin: 0, fontWeight: 500 }}>
                        {formatDateFr(b.date_debut_bail)} → {formatDateFr(b.date_fin_bail)}
                        {dureeMois ? ` (${dureeMois} mois)` : ""}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 4px" }}>Loyer perçu</p>
                      <p style={{ fontSize: 13, color: "#111", margin: 0, fontWeight: 500 }}>
                        {formatEur(b.total_loyers_percus)}
                        <span style={{ fontSize: 11, color: "#8a8477", fontWeight: 400 }}> · {formatEur(b.loyer_hc ? b.loyer_hc + (b.charges || 0) : null)}/mois</span>
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 4px" }}>Dépôt de garantie</p>
                      {b.depot_restitue_at ? (
                        <p style={{ fontSize: 13, color: "#111", margin: 0, fontWeight: 500 }}>
                          {formatEur(b.depot_montant_restitue)} restitué
                          {Number(b.depot_montant_retenu) > 0 && (
                            <span style={{ fontSize: 11, color: "#a16207" }}> · {formatEur(b.depot_montant_retenu)} retenu</span>
                          )}
                        </p>
                      ) : (
                        <p style={{ fontSize: 13, color: "#b91c1c", margin: 0, fontWeight: 500 }}>Non restitué</p>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", paddingTop: 14, borderTop: "1px solid #F0EAE0" }}>
                    <span style={{ fontSize: 11, color: "#8a8477", marginRight: 6 }}>{motifLabel}</span>
                    {b.bail_pdf_url && (
                      <a href={b.bail_pdf_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 600, color: "#111", background: "#fff", border: "1px solid #EAE6DF", padding: "6px 12px", borderRadius: 999, textDecoration: "none", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                        PDF Bail
                      </a>
                    )}
                    {b.edl_entree_id && (
                      <Link href={`/edl/consulter/${b.edl_entree_id}`} style={{ fontSize: 11, fontWeight: 600, color: "#111", background: "#fff", border: "1px solid #EAE6DF", padding: "6px 12px", borderRadius: 999, textDecoration: "none", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                        EDL Entrée
                      </Link>
                    )}
                    {b.edl_sortie_id && (
                      <Link href={`/edl/consulter/${b.edl_sortie_id}`} style={{ fontSize: 11, fontWeight: 600, color: "#111", background: "#fff", border: "1px solid #EAE6DF", padding: "6px 12px", borderRadius: 999, textDecoration: "none", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                        EDL Sortie
                      </Link>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}

      </div>
    </main>
  )
}
