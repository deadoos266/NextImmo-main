"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../lib/supabase"
import { useResponsive } from "../hooks/useResponsive"
import { km, KMPageHeader } from "../components/ui/km"

/**
 * /mes-quittances — historique des quittances de loyer pour le locataire.
 * Liste les loyers confirmés par le proprio qui ont une URL PDF associée
 * (loyers.quittance_pdf_url, populée par /api/loyers/quittance au moment
 * de la confirmation).
 *
 * Design fidèle handoff (3) pages.jsx MesQuittancesScreen l. 242-297 :
 *   - KMPageHeader eyebrow Locataire + titre + subtitle
 *   - 3 StatTile : Quittances reçues / Total versé / Logement actuel
 *   - Card tableau dense : Période / Loyer / Charges / Total / PDF
 */
type LoyerLigne = {
  id: number
  annonce_id: number
  mois: string
  montant: number | null
  charges: number | null
  quittance_pdf_url: string | null
  created_at: string
}

type AnnonceMin = {
  id: number
  titre: string | null
  ville: string | null
  adresse: string | null
}

function formatPeriode(mois: string): string {
  const [y, m] = mois.split("-")
  if (!y || !m) return mois
  try {
    const d = new Date(parseInt(y), parseInt(m) - 1, 1)
    return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
  } catch {
    return mois
  }
}

export default function MesQuittances() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { isMobile } = useResponsive()
  const [loyers, setLoyers] = useState<LoyerLigne[]>([])
  const [annonces, setAnnonces] = useState<Record<number, AnnonceMin>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth")
    if (status !== "authenticated" || !session?.user?.email) return
    const email = session.user.email.toLowerCase()
    ;(async () => {
      const { data } = await supabase
        .from("loyers")
        .select("id, annonce_id, mois, montant, charges, quittance_pdf_url, created_at")
        .eq("locataire_email", email)
        .not("quittance_pdf_url", "is", null)
        .order("mois", { ascending: false })
      const list = (data || []) as LoyerLigne[]
      setLoyers(list)
      const ids = Array.from(new Set(list.map(l => l.annonce_id))).filter(Boolean)
      if (ids.length > 0) {
        const { data: as } = await supabase
          .from("annonces")
          .select("id, titre, ville, adresse")
          .in("id", ids)
        const map: Record<number, AnnonceMin> = {}
        ;(as || []).forEach(a => { map[a.id] = a as AnnonceMin })
        setAnnonces(map)
      }
      setLoading(false)
    })()
  }, [session, status, router])

  if (status === "loading" || loading) return (
    <main style={{ minHeight: "100vh", background: km.beige, padding: 40, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
      <p style={{ color: km.muted, textAlign: "center", marginTop: 80 }}>Chargement…</p>
    </main>
  )

  // Calculs stat tiles
  const totalVerse = loyers.reduce((s, l) => s + Number(l.montant || 0) + Number(l.charges || 0), 0)
  // Logement actuel : annonce du loyer le plus récent
  const logementActuel = loyers.length > 0 ? annonces[loyers[0].annonce_id] : null
  const villeActuelle = logementActuel?.ville || "—"

  return (
    <main style={{ minHeight: "100vh", background: km.beige, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", padding: isMobile ? "24px 16px" : "40px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <KMPageHeader
          eyebrow="Locataire"
          title="Mes quittances"
          subtitle="Archive de vos quittances de loyer · PDF officiel généré par votre propriétaire"
          isMobile={isMobile}
        />

        {loyers.length === 0 ? (
          <div style={{ background: km.white, borderRadius: 20, padding: "60px 32px", border: `1px solid ${km.line}`, textAlign: "center", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: km.beige, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={km.muted} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <p style={{ fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, color: km.ink, margin: "0 0 8px" }}>Aucune quittance pour le moment</p>
            <p style={{ fontSize: 13, color: km.muted, margin: 0, lineHeight: 1.55, maxWidth: 480, marginInline: "auto" }}>
              Vos quittances apparaîtront ici dès que votre propriétaire aura confirmé un loyer reçu.
            </p>
            <Link href="/mon-logement" style={{ display: "inline-block", marginTop: 20, background: km.ink, color: km.white, padding: "10px 22px", borderRadius: 999, textDecoration: "none", fontSize: 12, fontWeight: 700, letterSpacing: "0.4px", textTransform: "uppercase" as const }}>
              Mon logement →
            </Link>
          </div>
        ) : (
          <>
            {/* Stat tiles 3 cols (handoff l. 263-267) */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(3, 1fr)", gap: isMobile ? 8 : 14, marginBottom: 28 }}>
              {[
                { label: "Quittances reçues", val: String(loyers.length), accent: km.beige, color: km.ink },
                { label: "Total versé", val: `${totalVerse.toLocaleString("fr-FR")} €`, accent: km.successBg, color: km.successText },
                { label: "Logement actuel", val: villeActuelle, accent: km.beige, color: km.ink },
              ].map(t => (
                <div
                  key={t.label}
                  style={{
                    background: t.accent,
                    border: `1px solid ${km.line}`,
                    borderRadius: 18,
                    padding: isMobile ? "14px 14px" : "18px 22px",
                  }}
                >
                  <div style={{ fontSize: isMobile ? 16 : 22, fontWeight: 700, color: t.color, letterSpacing: "-0.5px", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" as const, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.val}</div>
                  <div style={{ fontSize: 10, color: km.muted, marginTop: 8, textTransform: "uppercase" as const, letterSpacing: "1.2px", fontWeight: 700 }}>{t.label}</div>
                </div>
              ))}
            </div>

            {/* Tableau dense fidèle handoff (3) l. 269-294 */}
            <div style={{ background: km.white, borderRadius: 18, border: `1px solid ${km.line}`, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
              {/* Header colonnes — masqué sur mobile, layout switch en card */}
              {!isMobile && (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 100px 100px 110px 130px",
                  padding: "14px 22px",
                  borderBottom: `1px solid ${km.line}`,
                  fontSize: 10,
                  fontWeight: 700,
                  color: km.muted,
                  textTransform: "uppercase" as const,
                  letterSpacing: "1.2px",
                }}>
                  <div>Période</div>
                  <div style={{ textAlign: "right" }}>Loyer</div>
                  <div style={{ textAlign: "right" }}>Charges</div>
                  <div style={{ textAlign: "right" }}>Total</div>
                  <div style={{ textAlign: "right" }}>PDF</div>
                </div>
              )}

              {loyers.map((q, i) => {
                const annonce = annonces[q.annonce_id]
                const periode = formatPeriode(q.mois)
                const loyer = Number(q.montant || 0)
                const charges = Number(q.charges || 0)
                const total = loyer + charges
                const isLast = i === loyers.length - 1

                if (isMobile) {
                  // Layout mobile : card stacked
                  return (
                    <div key={q.id} style={{ padding: "16px 18px", borderBottom: isLast ? "none" : `1px solid ${km.line}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: km.ink, textTransform: "capitalize" as const }}>{periode}</div>
                          {annonce?.titre && (
                            <div style={{ fontSize: 11, color: km.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{annonce.titre}</div>
                          )}
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: km.ink, fontVariantNumeric: "tabular-nums" as const, letterSpacing: "-0.3px", flexShrink: 0 }}>
                          {total.toLocaleString("fr-FR")} €
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 11, color: km.muted, fontVariantNumeric: "tabular-nums" as const }}>
                          {loyer.toLocaleString("fr-FR")} € loyer · {charges.toLocaleString("fr-FR")} € charges
                        </span>
                        {q.quittance_pdf_url && (
                          <a
                            href={q.quittance_pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ background: km.white, color: km.ink, border: `1px solid ${km.line}`, borderRadius: 999, padding: "7px 14px", fontSize: 11, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "inherit" }}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                              <polyline points="7 10 12 15 17 10"/>
                              <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            PDF
                          </a>
                        )}
                      </div>
                    </div>
                  )
                }

                // Layout desktop : ligne tableau
                return (
                  <div key={q.id} style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 100px 100px 110px 130px",
                    padding: "16px 22px",
                    borderBottom: isLast ? "none" : `1px solid ${km.line}`,
                    alignItems: "center",
                    fontSize: 13.5,
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, color: km.ink, textTransform: "capitalize" as const }}>{periode}</div>
                      <div style={{ fontSize: 11, color: km.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {annonce?.titre || `Bien #${q.annonce_id}`}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" as const, color: km.ink }}>
                      {loyer.toLocaleString("fr-FR")} €
                    </div>
                    <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" as const, color: km.muted }}>
                      {charges.toLocaleString("fr-FR")} €
                    </div>
                    <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" as const, fontWeight: 700, color: km.ink, letterSpacing: "-0.2px" }}>
                      {total.toLocaleString("fr-FR")} €
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {q.quittance_pdf_url ? (
                        <a
                          href={q.quittance_pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ background: km.white, color: km.ink, border: `1px solid ${km.line}`, borderRadius: 999, padding: "7px 14px", fontSize: 11, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "inherit" }}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                          </svg>
                          PDF
                        </a>
                      ) : (
                        <span style={{ fontSize: 11, color: km.muted }}>—</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Footer retour */}
            <p style={{ marginTop: 24, fontSize: 12, color: km.muted, textAlign: "center" }}>
              <Link href="/mon-logement" style={{ color: km.ink, fontWeight: 600, textDecoration: "none" }}>
                ← Retour à mon logement
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  )
}
