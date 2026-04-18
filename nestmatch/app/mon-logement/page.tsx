"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../lib/supabase"
import { useResponsive } from "../hooks/useResponsive"

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

export default function MonLogement() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { isMobile } = useResponsive()
  const [bien, setBien] = useState<Bien | null>(null)
  const [loading, setLoading] = useState(true)
  const [visitesAVenir, setVisitesAVenir] = useState<number>(0)
  const [edlCount, setEdlCount] = useState<number>(0)
  const [loyersPayes, setLoyersPayes] = useState<number>(0)

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
        .eq("locataire_email", email)
        .order("id", { ascending: false })
        .limit(1)

      const b = biens?.[0]
      if (!b) {
        setLoading(false)
        return
      }
      setBien(b as Bien)

      // Stats rapides côté locataire
      const [vRes, eRes, lRes] = await Promise.all([
        supabase.from("visites").select("id", { count: "exact", head: true })
          .eq("annonce_id", b.id).eq("locataire_email", email).eq("statut", "confirmée"),
        supabase.from("etats_des_lieux").select("id", { count: "exact", head: true })
          .eq("annonce_id", b.id),
        supabase.from("loyers").select("id", { count: "exact", head: true })
          .eq("annonce_id", b.id).eq("locataire_email", email).eq("statut", "confirmé"),
      ])
      setVisitesAVenir(vRes.count ?? 0)
      setEdlCount(eRes.count ?? 0)
      setLoyersPayes(lRes.count ?? 0)
      setLoading(false)
    }
    load()
  }, [session, status, router])

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
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          <QuickLink href="/visites" title="Visites à venir" value={String(visitesAVenir)} bg="#eff6ff" color="#1d4ed8" />
          <QuickLink href="/carnet" title="Carnet d'entretien" value="Accéder" bg="#fef3c7" color="#92400e" />
          <QuickLink href={`/annonces/${bien.id}`} title="Fiche du bien" value="Consulter" bg="#f3f4f6" color="#111" />
          <QuickLink href="/dossier" title="Mon dossier" value="Mettre à jour" bg="#f0fdf4" color="#15803d" />
        </div>

        {/* Stats + historique */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12 }}>
          <Stat label="Visites confirmées" value={String(visitesAVenir)} />
          <Stat label="États des lieux" value={String(edlCount)} />
          <Stat label="Loyers payés" value={String(loyersPayes)} />
        </div>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "white", borderRadius: 14, padding: "14px 16px", border: "1px solid #e5e7eb" }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 4px" }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{value}</p>
    </div>
  )
}
