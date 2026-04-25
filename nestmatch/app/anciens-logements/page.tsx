"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../lib/supabase"
import { useResponsive } from "../hooks/useResponsive"

/**
 * /anciens-logements — historique des biens loués par le locataire dans le passé.
 *
 * Source : `profils.anciens_logements` jsonb, peuplé par
 * /api/annonces/terminer-bail au moment où le proprio bascule la fin de bail.
 *
 * Pour chaque entrée, on charge l'annonce + on expose des liens vers
 * l'historique des quittances et des messages, tant que ces ressources
 * restent accessibles (RLS storage public, messages indexés annonce_id).
 */
type AncienLogement = {
  annonce_id: number
  bail_termine_at: string
  titre: string | null
  ville: string | null
}

type AnnonceMin = {
  id: number
  titre: string | null
  ville: string | null
  adresse: string | null
}

export default function AnciensLogements() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { isMobile } = useResponsive()
  const [items, setItems] = useState<AncienLogement[]>([])
  const [annonces, setAnnonces] = useState<Record<number, AnnonceMin>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth")
    if (status !== "authenticated" || !session?.user?.email) return
    const email = session.user.email.toLowerCase()
    ;(async () => {
      const { data: profil } = await supabase
        .from("profils")
        .select("anciens_logements")
        .eq("email", email)
        .maybeSingle()
      const raw = profil?.anciens_logements
      const list: AncienLogement[] = Array.isArray(raw)
        ? (raw as AncienLogement[]).filter(item => item && typeof item.annonce_id === "number")
        : []
      // Trie par date de fin DESC (plus récent en premier)
      list.sort((a, b) => (b.bail_termine_at || "").localeCompare(a.bail_termine_at || ""))
      setItems(list)
      const ids = list.map(i => i.annonce_id)
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
          Mon historique
        </p>
        <h1 style={{ fontSize: isMobile ? 30 : 40, fontWeight: 400, fontStyle: "italic", fontFamily: "'Fraunces', 'DM Sans', serif", letterSpacing: "-0.6px", margin: 0, marginBottom: 8, color: "#111", lineHeight: 1.1 }}>
          Mes anciens logements
        </h1>
        <p style={{ fontSize: 14, color: "#4b5563", margin: "0 0 32px", lineHeight: 1.55 }}>
          Les biens que vous avez occupés. L&apos;historique reste accessible : annonce, échanges et quittances. Conservez ces preuves de location pour vos futures candidatures.
        </p>

        {items.length === 0 ? (
          <div style={{ background: "white", borderRadius: 20, padding: "40px 28px", boxShadow: "0 4px 24px rgba(0,0,0,0.06)", textAlign: "center" }}>
            <p style={{ fontSize: 15, color: "#111", fontWeight: 600, margin: "0 0 8px" }}>Aucun ancien logement.</p>
            <p style={{ fontSize: 13, color: "#8a8477", margin: 0, lineHeight: 1.55 }}>
              Lorsque le bail d&apos;un logement prendra fin, le bien apparaîtra ici avec son historique complet.
            </p>
          </div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            {items.map(it => {
              const annonce = annonces[it.annonce_id]
              const titre = annonce?.titre || it.titre || `Bien #${it.annonce_id}`
              const ville = annonce?.ville || it.ville || ""
              const adresse = annonce?.adresse || ""
              const fin = it.bail_termine_at
                ? new Date(it.bail_termine_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
                : ""
              return (
                <li
                  key={it.annonce_id}
                  style={{
                    background: "white",
                    borderRadius: 16,
                    padding: isMobile ? "16px 18px" : "20px 22px",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
                    border: "1px solid #EAE6DF",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: "#111", margin: 0, flex: 1, minWidth: 0 }}>
                      {titre}
                    </h3>
                    <span style={{ background: "#F7F4EF", color: "#6b6559", border: "1px solid #EAE6DF", padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px" }}>
                      Bail terminé
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: "#8a8477", margin: 0 }}>{adresse || ville}</p>
                  {fin && (
                    <p style={{ fontSize: 12, color: "#6b6559", margin: "8px 0 0" }}>
                      Bail terminé le <strong>{fin}</strong>
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                    <Link
                      href={`/annonces/${it.annonce_id}`}
                      style={{ background: "white", border: "1px solid #EAE6DF", color: "#111", textDecoration: "none", borderRadius: 999, padding: "7px 14px", fontSize: 11, fontWeight: 600, letterSpacing: "0.3px", textTransform: "uppercase" }}
                    >
                      Voir la fiche
                    </Link>
                    <Link
                      href={`/messages?annonce=${it.annonce_id}`}
                      style={{ background: "white", border: "1px solid #EAE6DF", color: "#111", textDecoration: "none", borderRadius: 999, padding: "7px 14px", fontSize: 11, fontWeight: 600, letterSpacing: "0.3px", textTransform: "uppercase" }}
                    >
                      Messages
                    </Link>
                    <Link
                      href={`/mes-quittances`}
                      style={{ background: "white", border: "1px solid #EAE6DF", color: "#111", textDecoration: "none", borderRadius: 999, padding: "7px 14px", fontSize: 11, fontWeight: 600, letterSpacing: "0.3px", textTransform: "uppercase" }}
                    >
                      Quittances
                    </Link>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
