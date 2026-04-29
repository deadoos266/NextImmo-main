"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../lib/supabase"
import { useResponsive } from "../hooks/useResponsive"

/**
 * /mes-documents — hub central des documents du locataire.
 *
 * Agrège en lecture-seule tout ce qui concerne le locataire :
 *  - Mon dossier (profil + pièces) → renvoie /dossier
 *  - Bail (PDF signé si dispo)     → bucket `baux` ou /mon-logement
 *  - État des lieux (signé)        → /edl/[id] ou voir EDL_CARD message
 *  - Quittances (URL bucket)       → /mes-quittances
 *
 * Vue persistante MEME après fin de bail (cf workflow fin de bail
 * mig 021 : profils.anciens_logements + RLS bucket public). Le locataire
 * conserve l'accès à toute la chaîne juridique pour ses futurs dossiers.
 *
 * Pour cette V1 : page hub minimaliste avec compteurs + CTAs vers les
 * vraies pages détaillées. Évite de réimplémenter la logique métier
 * disséminée dans /dossier, /mon-logement, /mes-quittances.
 */
type AnnonceMin = {
  id: number
  titre: string | null
  ville: string | null
  statut: string | null
}

type LoyerMin = {
  id: number
  annonce_id: number
  mois: string | null
  quittance_pdf_url: string | null
}

export default function MesDocuments() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { isMobile } = useResponsive()
  const [annoncesActuelles, setAnnoncesActuelles] = useState<AnnonceMin[]>([])
  const [annoncesAnciennes, setAnnoncesAnciennes] = useState<AnnonceMin[]>([])
  const [nbQuittances, setNbQuittances] = useState(0)
  const [nbDocsDossier, setNbDocsDossier] = useState(0)
  const [hasEdl, setHasEdl] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth")
    if (status !== "authenticated" || !session?.user?.email) return
    const email = session.user.email.toLowerCase()
    ;(async () => {
      // 1. Annonces actives + anciennes
      // V29.B — profils via /api/profil/me (RLS Phase 5)
      const profilP = fetch("/api/profil/me?cols=dossier_docs,anciens_logements", { cache: "no-store" })
        .then(r => r.ok ? r.json() : null)
        .then(j => j?.ok ? { data: j.profil } : { data: null })
        .catch(() => ({ data: null }))
      const [{ data: actives }, { data: profil }, { data: loyers }, { data: edls }] = await Promise.all([
        supabase.from("annonces").select("id, titre, ville, statut").eq("locataire_email", email),
        profilP,
        supabase.from("loyers").select("id, annonce_id, mois, quittance_pdf_url").eq("locataire_email", email).not("quittance_pdf_url", "is", null),
        supabase.from("etats_des_lieux").select("id").eq("locataire_email", email).limit(1),
      ])
      setAnnoncesActuelles((actives || []) as AnnonceMin[])
      const anciensIds = Array.isArray(profil?.anciens_logements)
        ? (profil!.anciens_logements as Array<{ annonce_id?: number }>).map(x => x?.annonce_id).filter((x): x is number => typeof x === "number")
        : []
      if (anciensIds.length > 0) {
        const { data: anciens } = await supabase.from("annonces").select("id, titre, ville, statut").in("id", anciensIds)
        setAnnoncesAnciennes((anciens || []) as AnnonceMin[])
      }
      setNbQuittances(((loyers || []) as LoyerMin[]).length)
      const docs = profil?.dossier_docs && typeof profil.dossier_docs === "object" ? profil.dossier_docs as Record<string, unknown> : {}
      // Compte les catégories de docs uploadées (dossier_docs = { key: string[] })
      setNbDocsDossier(Object.values(docs).filter(v => Array.isArray(v) && v.length > 0).length)
      setHasEdl(Array.isArray(edls) && edls.length > 0)
      setLoading(false)
    })()
  }, [session, status, router])

  if (status === "loading" || loading) {
    return (
      <main style={{ minHeight: "100vh", background: "#F7F4EF", padding: 40, fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ color: "#8a8477", textAlign: "center", marginTop: 80 }}>Chargement…</p>
      </main>
    )
  }

  const totalAnnonces = annoncesActuelles.length + annoncesAnciennes.length

  const cards: Array<{
    eyebrow: string
    title: string
    desc: string
    count: string | null
    cta: string
    href: string
    bg: string
  }> = [
    {
      eyebrow: "Identité",
      title: "Mon dossier locataire",
      desc: "Pièces justificatives (identité, revenus, garant) regroupées et partagées via lien sécurisé.",
      count: `${nbDocsDossier} catégorie${nbDocsDossier > 1 ? "s" : ""} remplie${nbDocsDossier > 1 ? "s" : ""}`,
      cta: "Ouvrir mon dossier",
      href: "/dossier",
      bg: "#fff",
    },
    {
      eyebrow: "Logement",
      title: "Mon bail",
      desc: totalAnnonces === 0
        ? "Aucun bail actif pour le moment. Votre bail signé apparaîtra ici."
        : "Bail électronique à valeur légale, accessible à tout moment.",
      count: totalAnnonces > 0 ? `${totalAnnonces} bien${totalAnnonces > 1 ? "s" : ""} concerné${totalAnnonces > 1 ? "s" : ""}` : null,
      cta: totalAnnonces > 0 ? "Voir mon logement" : "Voir les annonces",
      href: totalAnnonces > 0 ? "/mon-logement" : "/annonces",
      bg: "#fff",
    },
    {
      eyebrow: "Sortie",
      title: "État des lieux",
      desc: hasEdl
        ? "Document signé entre vous et le propriétaire — vos preuves de l'état du logement à l'entrée et à la sortie."
        : "L'état des lieux sera consultable ici dès qu'il aura été signé par les deux parties.",
      count: hasEdl ? "Disponible" : null,
      cta: hasEdl ? "Voir mon logement" : "En savoir plus",
      href: hasEdl ? "/mon-logement" : "/dossier",
      bg: "#fff",
    },
    {
      eyebrow: "Paiements",
      title: "Mes quittances",
      desc: "Preuves de paiement mensuelles émises par le propriétaire — conservez-les pour vos prochaines candidatures.",
      count: nbQuittances > 0 ? `${nbQuittances} archive${nbQuittances > 1 ? "s" : ""}` : null,
      cta: "Voir mes quittances",
      href: "/mes-quittances",
      bg: "#fff",
    },
  ]

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: isMobile ? "32px 16px" : "56px 32px" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.5px", margin: 0, marginBottom: 6 }}>
          Mon espace
        </p>
        <h1 style={{ fontSize: isMobile ? 30 : 40, fontWeight: 400, fontStyle: "italic", fontFamily: "'Fraunces', 'DM Sans', serif", letterSpacing: "-0.6px", margin: 0, marginBottom: 8, color: "#111", lineHeight: 1.1 }}>
          Mes documents
        </h1>
        <p style={{ fontSize: 14, color: "#4b5563", margin: "0 0 32px", lineHeight: 1.55 }}>
          Toute la chaîne de votre location au même endroit : dossier, bail, état des lieux, quittances. Conservés même après la fin du bail pour vos futures recherches.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
          {cards.map(c => (
            <div key={c.title} style={{
              background: c.bg,
              border: "1px solid #EAE6DF",
              borderRadius: 20,
              padding: isMobile ? "20px 22px" : "24px 26px",
              boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
              display: "flex", flexDirection: "column", gap: 10, minHeight: 180,
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0 }}>
                {c.eyebrow}
              </p>
              <h2 style={{ fontSize: 18, fontWeight: 400, fontStyle: "italic", fontFamily: "'Fraunces', 'DM Sans', serif", letterSpacing: "-0.3px", margin: 0, color: "#111", lineHeight: 1.25 }}>
                {c.title}
              </h2>
              <p style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.5, margin: 0, flex: 1 }}>
                {c.desc}
              </p>
              {c.count && (
                <span style={{ fontSize: 12, color: "#15803d", fontWeight: 700, background: "#F0FAEE", border: "1px solid #C6E9C0", padding: "4px 10px", borderRadius: 999, alignSelf: "flex-start", letterSpacing: "0.3px" }}>
                  {c.count}
                </span>
              )}
              <Link href={c.href} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#111", fontSize: 12, fontWeight: 700, textDecoration: "none", textTransform: "uppercase", letterSpacing: "0.6px", marginTop: 4, alignSelf: "flex-start", borderBottom: "1px solid #111", paddingBottom: 2 }}>
                {c.cta} →
              </Link>
            </div>
          ))}
        </div>

        {annoncesAnciennes.length > 0 && (
          <p style={{ marginTop: 28, fontSize: 12, color: "#8a8477", textAlign: "center", lineHeight: 1.6 }}>
            Vous avez occupé {annoncesAnciennes.length} ancien{annoncesAnciennes.length > 1 ? "s" : ""} logement{annoncesAnciennes.length > 1 ? "s" : ""}. <Link href="/anciens-logements" style={{ color: "#111", fontWeight: 600 }}>Voir l&apos;historique</Link>
          </p>
        )}

        <div style={{ marginTop: 32, padding: "20px 22px", background: "#fff", border: "1px solid #EAE6DF", borderRadius: 16, fontSize: 12, color: "#6b6559", lineHeight: 1.6 }}>
          <strong style={{ color: "#111" }}>À savoir.</strong> Tous vos documents sont conservés même après la fin de votre bail (RGPD article 17 — vous pouvez demander leur suppression depuis vos <Link href="/parametres" style={{ color: "#111" }}>paramètres</Link>).
        </div>
      </div>
    </main>
  )
}
