"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../lib/supabase"
import { useResponsive } from "../hooks/useResponsive"
import { joursRetardLoyer } from "../../lib/loyerHelpers"

/**
 * Mon logement actuel — vue dédiée locataire après bail signé.
 *
 * Critère de détection : `annonces.locataire_email === session.email`
 *   AND (statut = "loué" OU date_debut_bail renseignée).
 *
 * Si aucun bail, redirige vers /mes-candidatures.
 */

type Bien = {
  id: number
  titre: string
  ville: string | null
  adresse: string | null
  prix: number | null
  charges: number | null
  surface: number | null
  pieces: number | null
  photos: string[] | null
  proprietaire_email: string
  date_debut_bail: string | null
  dpe: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Edl = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loyer = any

export default function MonLogement() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { isMobile } = useResponsive()
  const [bien, setBien] = useState<Bien | null>(null)
  const [loading, setLoading] = useState(true)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [visitesAVenir, setVisitesAVenir] = useState<number>(0)
  const [edls, setEdls] = useState<Edl[]>([])
  const [loyers, setLoyers] = useState<Loyer[]>([])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth")
      return
    }
    if (!session?.user?.email) return

    const email = session.user.email.toLowerCase()
    async function load() {
      const { data: biens } = await supabase
        .from("annonces")
        .select("*")
        .ilike("locataire_email", email)
        .order("id", { ascending: false })
        .limit(1)

      const b = biens?.[0]
      if (!b) {
        setLoading(false)
        return
      }
      setBien(b as Bien)

      // Docs du logement
      const [vRes, edlRes, loyRes] = await Promise.all([
        supabase.from("visites").select("id", { count: "exact", head: true })
          .eq("annonce_id", b.id).ilike("locataire_email", email).eq("statut", "confirmée"),
        supabase.from("etats_des_lieux")
          .select("id, type, date_edl, statut, created_at")
          .eq("annonce_id", b.id)
          .order("created_at", { ascending: false }),
        supabase.from("loyers")
          .select("id, mois, montant, statut, date_confirmation, quittance_envoyee_at")
          .eq("annonce_id", b.id)
          .order("mois", { ascending: false })
          .limit(24),
      ])
      setVisitesAVenir(vRes.count ?? 0)
      setEdls(edlRes.data || [])
      setLoyers(loyRes.data || [])
      setLoading(false)
    }
    load()
  }, [session, status, router])

  async function exportHistoriqueLoyersPDF() {
    if (!bien || loyers.length === 0) return
    setExportingPdf(true)
    try {
      const { default: jsPDF } = await import("jspdf")
      const doc = new jsPDF()
      const now = new Date().toLocaleDateString("fr-FR")
      doc.setFontSize(18); doc.setFont("helvetica", "bold")
      doc.text("Historique des loyers", 105, 22, { align: "center" })
      doc.setFontSize(10); doc.setFont("helvetica", "normal")
      doc.text(`Édité le ${now}`, 105, 28, { align: "center" })
      doc.setDrawColor(200, 200, 200); doc.line(20, 34, 190, 34)

      doc.setFont("helvetica", "bold"); doc.setFontSize(11)
      doc.text("BIEN", 20, 44)
      doc.setFont("helvetica", "normal"); doc.setFontSize(9)
      doc.text(bien.titre || "", 20, 51)
      if (bien.adresse) doc.text(bien.adresse, 20, 57)
      if (bien.ville) doc.text(bien.ville, 20, bien.adresse ? 63 : 57)

      const locataireEmail = session?.user?.email || ""
      doc.setFont("helvetica", "bold"); doc.setFontSize(11)
      doc.text("LOCATAIRE", 110, 44)
      doc.setFont("helvetica", "normal"); doc.setFontSize(9)
      doc.text(locataireEmail, 110, 51)

      // Table
      let y = 80
      doc.line(20, y - 4, 190, y - 4)
      doc.setFont("helvetica", "bold"); doc.setFontSize(10)
      doc.text("Mois", 22, y)
      doc.text("Montant", 90, y)
      doc.text("Statut", 130, y)
      doc.text("Confirmé le", 165, y)
      y += 4
      doc.line(20, y, 190, y)
      y += 6
      doc.setFont("helvetica", "normal"); doc.setFontSize(9)

      const loyersTries = [...loyers].sort((a, b) => (a.mois || "").localeCompare(b.mois || ""))
      let totalConfirme = 0
      for (const l of loyersTries) {
        if (y > 270) { doc.addPage(); y = 30 }
        const moisLabel = l.mois
          ? new Date(l.mois + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
          : "—"
        const montant = Number(l.montant) || 0
        if (l.statut === "confirmé") totalConfirme += montant
        const statut = l.statut === "confirmé" ? "Payé" : "En attente"
        const dateConf = l.date_confirmation
          ? new Date(l.date_confirmation).toLocaleDateString("fr-FR")
          : "—"
        doc.text(moisLabel.charAt(0).toUpperCase() + moisLabel.slice(1), 22, y)
        doc.text(`${montant.toLocaleString("fr-FR")} €`, 90, y)
        doc.text(statut, 130, y)
        doc.text(dateConf, 165, y)
        y += 7
      }

      if (y > 260) { doc.addPage(); y = 30 }
      doc.line(20, y, 190, y); y += 8
      doc.setFont("helvetica", "bold"); doc.setFontSize(11)
      doc.text(`Total loyers confirmés : ${totalConfirme.toLocaleString("fr-FR")} €`, 20, y)

      doc.setFontSize(8); doc.setFont("helvetica", "italic"); doc.setTextColor(120, 120, 120)
      doc.text("Document généré depuis NestMatch — à valeur indicative.", 105, 290, { align: "center" })

      const ts = new Date().toISOString().slice(0, 10)
      doc.save(`historique-loyers-${ts}.pdf`)
    } catch {
      alert("Export PDF impossible. Réessayez.")
    }
    setExportingPdf(false)
  }

  if (status === "loading" || loading) {
    return (
      <main style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", color: "#6b7280" }}>
        Chargement...
      </main>
    )
  }

  if (!bien) {
    return (
      <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: isMobile ? "32px 16px" : "48px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", background: "white", borderRadius: 20, padding: isMobile ? 24 : 40, textAlign: "center" }}>
          <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 12 }}>
            Aucun logement actif
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, marginBottom: 24 }}>
            Vous n&apos;avez pas encore signé de bail via NestMatch. Retrouvez vos candidatures en cours pour suivre leur avancement.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/mes-candidatures" style={{ background: "#111", color: "white", padding: "12px 24px", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 14 }}>
              Mes candidatures
            </Link>
            <Link href="/annonces" style={{ background: "white", border: "1.5px solid #e5e7eb", color: "#111", padding: "12px 24px", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 14 }}>
              Parcourir les annonces
            </Link>
          </div>
        </div>
      </main>
    )
  }

  const photoPrincipale = Array.isArray(bien.photos) && bien.photos.length > 0 ? bien.photos[0] : null
  const loyerTotal = (bien.prix || 0) + (bien.charges || 0)

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: isMobile ? "24px 16px" : "40px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* En-tête */}
        <p style={{ fontSize: 11, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>
          Bail actif
        </p>
        <h1 style={{ fontSize: isMobile ? 24 : 32, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 8 }}>
          Mon logement actuel
        </h1>
        <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 28 }}>
          Retrouvez ici votre logement, votre propriétaire, et tous vos documents.
        </p>

        {/* Carte principale du bien */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 16 }}>
          {/* Visuel */}
          <div style={{ background: "white", borderRadius: 20, overflow: "hidden", border: "1px solid #e5e7eb" }}>
            <div style={{
              height: isMobile ? 180 : 240,
              background: photoPrincipale
                ? `url(${photoPrincipale}) center/cover no-repeat`
                : "linear-gradient(135deg, #d4e8e0, #b8d4c8)",
            }} />
            <div style={{ padding: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 6px", letterSpacing: "-0.3px" }}>{bien.titre}</h2>
              <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 14px" }}>
                {bien.adresse ? `${bien.adresse} · ` : ""}{bien.ville}
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 13, color: "#374151" }}>
                {bien.surface && <span><strong>{bien.surface} m²</strong></span>}
                {bien.pieces && <span><strong>{bien.pieces}</strong> pièces</span>}
                {bien.dpe && <span>DPE <strong>{bien.dpe}</strong></span>}
              </div>
            </div>
          </div>

          {/* Infos bail + contact */}
          <div style={{ background: "white", borderRadius: 20, padding: 24, border: "1px solid #e5e7eb", display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Loyer mensuel</p>
              <p style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>{loyerTotal} €<span style={{ fontSize: 14, color: "#6b7280", fontWeight: 500 }}>/mois</span></p>
              {bien.charges ? (
                <p style={{ fontSize: 12, color: "#6b7280", margin: "4px 0 0" }}>
                  dont {bien.charges} € de charges
                </p>
              ) : null}
            </div>

            {bien.date_debut_bail && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Début du bail</p>
                <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
                  {new Date(bien.date_debut_bail).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
            )}

            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Propriétaire</p>
              <p style={{ fontSize: 14, margin: 0, color: "#111" }}>{bien.proprietaire_email}</p>
            </div>

            <Link
              href={`/messages?with=${encodeURIComponent(bien.proprietaire_email)}`}
              style={{ background: "#111", color: "white", borderRadius: 999, padding: "12px 24px", textAlign: "center", textDecoration: "none", fontWeight: 700, fontSize: 14 }}
            >
              Contacter mon propriétaire
            </Link>
          </div>
        </div>

        {/* Raccourcis */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          <QuickLink href="/visites" title="Visites à venir" value={String(visitesAVenir)} bg="#eff6ff" color="#1d4ed8" />
          <QuickLink href="/carnet" title="Carnet d'entretien" value="Accéder" bg="#fef3c7" color="#92400e" />
          <QuickLink href={`/annonces/${bien.id}`} title="Fiche du bien" value="Consulter" bg="#f3f4f6" color="#111" />
          <QuickLink href="/dossier" title="Mon dossier" value="Mettre à jour" bg="#f0fdf4" color="#15803d" />
        </div>

        {/* ─── États des lieux ─── */}
        <div style={{ background: "white", borderRadius: 20, padding: isMobile ? 20 : 24, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0, letterSpacing: "-0.3px" }}>États des lieux</h2>
            {edls.some(e => e.statut === "envoye") && (
              <span style={{ background: "#fff7ed", color: "#c2410c", padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                Action requise
              </span>
            )}
          </div>
          {edls.length === 0 ? (
            <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>Aucun état des lieux pour l&apos;instant.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {edls.map(e => {
                const typeLabel = e.type === "entree" ? "Entrée" : "Sortie"
                const dateStr = e.date_edl ? new Date(e.date_edl).toLocaleDateString("fr-FR") : ""
                const statutStyle = e.statut === "valide"
                  ? { bg: "#dcfce7", color: "#15803d", label: "Validé" }
                  : e.statut === "conteste"
                  ? { bg: "#fee2e2", color: "#dc2626", label: "Contesté" }
                  : e.statut === "envoye"
                  ? { bg: "#fff7ed", color: "#c2410c", label: "À valider" }
                  : { bg: "#f3f4f6", color: "#6b7280", label: e.statut }
                return (
                  <Link key={e.id} href={`/edl/consulter/${e.id}`}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 12, textDecoration: "none", color: "#111", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>EDL {typeLabel}</span>
                      <span style={{ color: "#6b7280", fontSize: 12 }}>{dateStr}</span>
                    </div>
                    <span style={{ background: statutStyle.bg, color: statutStyle.color, padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{statutStyle.label}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* ─── Quittances / Loyers ─── */}
        {(() => {
          const retards = loyers
            .map(l => ({ l, jours: joursRetardLoyer(l.mois, l.statut) }))
            .filter(x => x.jours > 0)
          const retardMax = retards.reduce((m, x) => x.jours > m.jours ? x : m, { l: null as any, jours: 0 })
          return (
            <div style={{ background: "white", borderRadius: 20, padding: isMobile ? 20 : 24, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
                <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0, letterSpacing: "-0.3px" }}>Mes loyers</h2>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {retards.length > 0 && (
                    <span style={{ background: "#fef2f2", border: "1.5px solid #fecaca", color: "#b91c1c", padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                      {retards.length} loyer{retards.length > 1 ? "s" : ""} en retard
                    </span>
                  )}
                  {loyers.length > 0 && (
                    <button type="button" onClick={exportHistoriqueLoyersPDF} disabled={exportingPdf}
                      style={{ background: "white", border: "1.5px solid #e5e7eb", borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 700, color: "#111", cursor: exportingPdf ? "wait" : "pointer", fontFamily: "inherit", opacity: exportingPdf ? 0.6 : 1 }}>
                      {exportingPdf ? "Export…" : "Télécharger PDF"}
                    </button>
                  )}
                </div>
              </div>
              {retardMax.l && (
                <div style={{ background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 12, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#991b1b", lineHeight: 1.5 }}>
                  <strong>Retard de paiement</strong> — votre loyer {new Date(retardMax.l.mois + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })} est en retard de {retardMax.jours} jour{retardMax.jours > 1 ? "s" : ""}. Contactez votre propriétaire dès que possible.
                </div>
              )}
              {loyers.length === 0 ? (
                <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>Aucun loyer enregistré pour l&apos;instant.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {loyers.map(l => {
                    const moisLabel = l.mois
                      ? new Date(l.mois + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
                      : ""
                    const confirmed = l.statut === "confirmé"
                    const quittanceEnvoyee = !!l.quittance_envoyee_at
                    const jRetard = joursRetardLoyer(l.mois, l.statut)
                    const enRetard = jRetard > 0
                    return (
                      <div key={l.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", border: `1px solid ${enRetard ? "#fecaca" : "#e5e7eb"}`, borderRadius: 12, gap: 10, background: enRetard ? "#fef2f2" : "white" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                          <span style={{ fontWeight: 700, fontSize: 13, textTransform: "capitalize" }}>{moisLabel}</span>
                          <span style={{ color: "#6b7280", fontSize: 12 }}>{l.montant} €</span>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                          <span style={{ background: confirmed ? "#dcfce7" : enRetard ? "#fee2e2" : "#fff7ed", color: confirmed ? "#15803d" : enRetard ? "#b91c1c" : "#c2410c", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                            {confirmed ? "Payé" : enRetard ? `En retard ${jRetard} j` : "En attente"}
                          </span>
                          {quittanceEnvoyee && (
                            <Link href="/messages" style={{ fontSize: 11, color: "#1d4ed8", fontWeight: 700, textDecoration: "none" }}>Quittance →</Link>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}

        {/* Bail actif */}
        {bien.date_debut_bail && (
          <div style={{ background: "white", borderRadius: 20, padding: isMobile ? 20 : 24, marginBottom: 16 }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 14px", letterSpacing: "-0.3px" }}>Mon bail</h2>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 8px" }}>
              Bail actif depuis le {new Date(bien.date_debut_bail).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.
            </p>
            <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
              Le PDF du bail a été téléchargé par le propriétaire lors de la génération. Demandez-lui une copie si besoin via la messagerie.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}

function QuickLink({ href, title, value, bg, color }: { href: string; title: string; value: string; bg: string; color: string }) {
  return (
    <Link href={href} style={{ background: bg, borderRadius: 14, padding: "14px 16px", textDecoration: "none", display: "block" }}>
      <p style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.4px", margin: "0 0 4px" }}>{title}</p>
      <p style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "#111" }}>{value}</p>
    </Link>
  )
}

// Stat helper retiré — remplacé par les sections EDL / Quittances / Bail
