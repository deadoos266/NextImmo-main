"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../lib/supabase"
import { useResponsive } from "../hooks/useResponsive"

/**
 * /mes-quittances — historique des quittances de loyer pour le locataire.
 *
 * Liste les loyers confirmés par le proprio qui ont une URL PDF associée
 * (colonne loyers.quittance_pdf_url, populée par /api/loyers/quittance
 * au moment de la confirmation).
 *
 * Pas de génération côté locataire : c'est purement consultatif. Le
 * locataire reçoit aussi le PDF par email Resend, cette page est l'archive.
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
      // Charge les annonces correspondantes en un seul round-trip
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
    <main style={{ minHeight: "100vh", background: "#F7F4EF", padding: 40, fontFamily: "'DM Sans', sans-serif" }}>
      <p style={{ color: "#8a8477", textAlign: "center", marginTop: 80 }}>Chargement…</p>
    </main>
  )

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: isMobile ? "32px 16px" : "56px 32px" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.5px", margin: 0, marginBottom: 6 }}>
          Mes documents
        </p>
        <h1 style={{ fontSize: isMobile ? 30 : 40, fontWeight: 400, fontStyle: "italic", fontFamily: "'Fraunces', 'DM Sans', serif", letterSpacing: "-0.6px", margin: 0, marginBottom: 8, color: "#111", lineHeight: 1.1 }}>
          Mes quittances de loyer
        </h1>
        <p style={{ fontSize: 14, color: "#4b5563", margin: "0 0 32px", lineHeight: 1.55 }}>
          Toutes vos quittances reçues, classées par mois. Téléchargeables à tout moment — conservez-les comme preuves de paiement.
        </p>

        {loyers.length === 0 ? (
          <div style={{ background: "white", borderRadius: 20, padding: "40px 28px", boxShadow: "0 4px 24px rgba(0,0,0,0.06)", textAlign: "center" }}>
            <p style={{ fontSize: 15, color: "#111", fontWeight: 600, margin: "0 0 8px" }}>Aucune quittance pour le moment.</p>
            <p style={{ fontSize: 13, color: "#8a8477", margin: 0, lineHeight: 1.55 }}>
              Vos quittances apparaîtront ici dès que votre propriétaire aura confirmé un loyer reçu.
            </p>
          </div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            {loyers.map(loyer => {
              const annonce = annonces[loyer.annonce_id]
              const periode = formatPeriode(loyer.mois)
              const total = Number(loyer.montant || 0) + Number(loyer.charges || 0)
              return (
                <li
                  key={loyer.id}
                  style={{
                    background: "white",
                    borderRadius: 16,
                    padding: isMobile ? "16px 18px" : "18px 22px",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
                    border: "1px solid #EAE6DF",
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0, marginBottom: 4 }}>
                      {periode}
                    </p>
                    <p style={{ fontSize: 15, fontWeight: 600, color: "#111", margin: 0, marginBottom: 2 }}>
                      {annonce?.titre || `Bien #${loyer.annonce_id}`}
                    </p>
                    {(annonce?.ville || annonce?.adresse) && (
                      <p style={{ fontSize: 12, color: "#8a8477", margin: 0 }}>
                        {annonce.adresse || annonce.ville}
                      </p>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: 16, fontWeight: 800, color: "#111", margin: 0, fontVariantNumeric: "tabular-nums" }}>
                      {total.toLocaleString("fr-FR")} €
                    </p>
                    <p style={{ fontSize: 10, color: "#8a8477", margin: 0, textTransform: "uppercase", letterSpacing: "0.8px" }}>
                      Charges comprises
                    </p>
                  </div>
                  {loyer.quittance_pdf_url && (
                    <a
                      href={loyer.quittance_pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        background: "#111",
                        color: "white",
                        textDecoration: "none",
                        borderRadius: 999,
                        padding: "8px 18px",
                        fontSize: 12,
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Télécharger
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <p style={{ marginTop: 28, fontSize: 12, color: "#8a8477", textAlign: "center" }}>
          <Link href="/mon-logement" style={{ color: "#111", fontWeight: 600 }}>
            ← Retour à mon logement
          </Link>
        </p>
      </div>
    </main>
  )
}
