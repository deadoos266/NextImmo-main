"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../lib/supabase"
import { useResponsive } from "../hooks/useResponsive"
import { displayName } from "../../lib/privacy"
import EmptyState from "../components/ui/EmptyState"
import Image from "next/image"

/**
 * Historique des candidatures du locataire (annonces contactées).
 * Statut déduit : dossier envoyé / visite programmée / bail signé / rejeté / en cours.
 */

type Statut = "contact" | "dossier" | "visite" | "bail" | "rejete"
const STATUT_LABEL: Record<Statut, { label: string; bg: string; color: string; border: string }> = {
  contact:  { label: "Contact établi",      bg: "#F7F4EF", color: "#6b6559", border: "#EAE6DF" },
  dossier:  { label: "Dossier envoyé",      bg: "#F0FAEE", color: "#15803d", border: "#C6E9C0" },
  visite:   { label: "Visite programmée",   bg: "#EEF3FB", color: "#1d4ed8", border: "#D7E3F4" },
  bail:     { label: "Bail signé",          bg: "#111",    color: "#fff",    border: "#111"    },
  rejete:   { label: "Visite refusée",      bg: "#FEECEC", color: "#b91c1c", border: "#F4C9C9" },
}

const RETRAIT_PREFIX = "[CANDIDATURE_RETIREE]"
const RELANCE_PREFIX = "[RELANCE]"
// Délai avant de pouvoir relancer (jours sans réponse du proprio)
const RELANCE_DELAI_JOURS = 7
// Cooldown entre deux relances (jours)
const RELANCE_COOLDOWN_JOURS = 5

export default function MesCandidatures() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { isMobile } = useResponsive()
  const [candidatures, setCandidatures] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [retraitId, setRetraitId] = useState<number | null>(null)
  const [retraitEnCours, setRetraitEnCours] = useState(false)
  const [relancantId, setRelancantId] = useState<number | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/auth"); return }
    if (!session?.user?.email) return
    load()
  }, [session, status])

  async function load() {
    const email = session!.user!.email!
    // 1. Tous les messages envoyés par le locataire vers un proprio (candidatures)
    const { data: msgs } = await supabase
      .from("messages")
      .select("id, to_email, annonce_id, contenu, created_at")
      .eq("from_email", email)
      .not("annonce_id", "is", null)
      .order("created_at", { ascending: false })

    const candidatsMap = new Map<number, any>()
    for (const m of msgs || []) {
      if (!candidatsMap.has(m.annonce_id)) {
        candidatsMap.set(m.annonce_id, { annonce_id: m.annonce_id, proprietaire: m.to_email, premier_contact: m.created_at })
      }
    }

    // 2. Enrichir avec annonces
    const ids = Array.from(candidatsMap.keys())
    if (ids.length === 0) { setCandidatures([]); setLoading(false); return }
    const { data: anns } = await supabase.from("annonces").select("*").in("id", ids)

    // 3. Enrichir avec visites (par annonce + email locataire)
    const { data: visites } = await supabase
      .from("visites")
      .select("annonce_id, statut, date_visite, heure")
      .eq("locataire_email", email)
      .in("annonce_id", ids)

    // 3bis. Messages reçus DES proprios (pour détecter si ils ont répondu)
    const { data: msgsRecus } = await supabase
      .from("messages")
      .select("from_email, annonce_id, created_at, contenu")
      .eq("to_email", email)
      .in("annonce_id", ids)
      .order("created_at", { ascending: false })

    // 4. Détecter dossier envoyé (préfixe [DOSSIER_CARD])
    const dossierEnvoyeIds = new Set<number>()
    const retireeIds = new Set<number>()
    for (const m of msgs || []) {
      if (typeof m.contenu !== "string") continue
      if (m.contenu.startsWith("[DOSSIER_CARD]")) dossierEnvoyeIds.add(m.annonce_id)
      if (m.contenu.startsWith(RETRAIT_PREFIX)) retireeIds.add(m.annonce_id)
    }

    // 5. Consolidation
    const emailLower = email.toLowerCase()
    const now = Date.now()
    const result = ids
      .map(id => {
        const c = candidatsMap.get(id)
        const annonce = anns?.find(a => a.id === id)
        const visitesAnn = visites?.filter(v => v.annonce_id === id) || []
        const hasVisiteConfirme = visitesAnn.some(v => v.statut === "confirmée" || v.statut === "effectuée")
        const hasVisiteProposee = visitesAnn.some(v => v.statut === "proposée")
        const hasVisiteRefusee = visitesAnn.some(v => v.statut === "annulée")
        const baisSigne = annonce?.statut === "loué" && (annonce?.locataire_email || "").toLowerCase() === emailLower

        let statut: Statut = "contact"
        if (baisSigne) statut = "bail"
        else if (hasVisiteConfirme) statut = "visite"
        else if (dossierEnvoyeIds.has(id)) statut = "dossier"
        else if (hasVisiteRefusee && !hasVisiteConfirme && !hasVisiteProposee) statut = "rejete"

        // Détection besoin de relance :
        // - dernier msg du proprio OU jamais de réponse
        // - MES derniers messages (dont dernière relance envoyée)
        const msgsEnvoyesCetteAnn = (msgs || []).filter(m => m.annonce_id === id)
        const msgsRecusCetteAnn = (msgsRecus || []).filter(m => m.annonce_id === id)
        const dernierEnvoye = msgsEnvoyesCetteAnn[0] // déjà triés desc
        const dernierRecu = msgsRecusCetteAnn[0]
        const dernierEnvoyeAt = dernierEnvoye?.created_at ? new Date(dernierEnvoye.created_at).getTime() : 0
        const dernierRecuAt = dernierRecu?.created_at ? new Date(dernierRecu.created_at).getTime() : 0
        const dernierRelanceAt = msgsEnvoyesCetteAnn
          .filter(m => typeof m.contenu === "string" && m.contenu.startsWith(RELANCE_PREFIX))
          .map(m => new Date(m.created_at).getTime())
          .reduce((max, t) => Math.max(max, t), 0)
        const joursDepuisMoi = Math.floor((now - Math.max(dernierEnvoyeAt, dernierRelanceAt)) / 86400000)
        const proprioARepondu = dernierRecuAt > dernierEnvoyeAt
        const cooldownActif = dernierRelanceAt > 0 && (now - dernierRelanceAt) / 86400000 < RELANCE_COOLDOWN_JOURS
        const peutRelancer = !baisSigne && !proprioARepondu && joursDepuisMoi >= RELANCE_DELAI_JOURS && !cooldownActif

        return {
          ...c,
          annonce,
          visites: visitesAnn,
          statut,
          dossierEnvoye: dossierEnvoyeIds.has(id),
          baisSigne,
          peutRelancer,
          joursSansReponse: joursDepuisMoi,
        }
      })
      // Filtrer les baux déjà signés — ils apparaissent dans /mon-logement,
      // pas ici. /mes-candidatures = seulement les candidatures en cours.
      // Filtrer aussi les candidatures que le locataire a retirées lui-même.
      .filter(r => !r.baisSigne && !retireeIds.has(r.annonce_id))

    setCandidatures(result)
    setLoading(false)
  }

  async function retirerCandidature(annonce_id: number, proprietaire: string, titre: string) {
    if (!session?.user?.email) return
    setRetraitEnCours(true)
    const email = session.user.email
    // 1. Annuler les visites en cours (proposée / confirmée) pour cette annonce.
    await supabase
      .from("visites")
      .update({ statut: "annulée" })
      .eq("annonce_id", annonce_id)
      .eq("locataire_email", email)
      .in("statut", ["proposée", "confirmée"])
    // 2. Poster un message système pour notifier le propriétaire.
    const payload = JSON.stringify({ bienTitre: titre, retireLe: new Date().toISOString() })
    await supabase.from("messages").insert([{
      from_email: email,
      to_email: proprietaire,
      contenu: `${RETRAIT_PREFIX}${payload}`,
      annonce_id,
      lu: false,
      created_at: new Date().toISOString(),
    }])
    // 3. Retirer de la liste locale — plus besoin d'un round-trip DB.
    setCandidatures(prev => prev.filter(c => c.annonce_id !== annonce_id))
    setRetraitId(null)
    setRetraitEnCours(false)
  }

  async function relancerCandidature(annonce_id: number, proprietaire: string, titre: string) {
    if (!session?.user?.email) return
    setRelancantId(annonce_id)
    const email = session.user.email
    const contenu = `${RELANCE_PREFIX}Bonjour, avez-vous eu l'occasion de consulter ma candidature pour « ${titre || "votre bien"} » ? Je reste très intéressé(e) et disponible pour échanger ou visiter. Merci !`
    await supabase.from("messages").insert([{
      from_email: email,
      to_email: proprietaire,
      contenu,
      annonce_id,
      lu: false,
      created_at: new Date().toISOString(),
    }])
    // Marque cette candidature comme relancée localement (cooldown immédiat)
    setCandidatures(prev => prev.map(c => c.annonce_id === annonce_id
      ? { ...c, peutRelancer: false, joursSansReponse: 0 }
      : c
    ))
    setRelancantId(null)
  }

  if (status === "loading" || loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#8a8477", fontFamily: "'DM Sans', sans-serif" }}>Chargement...</div>
  )

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", padding: isMobile ? "24px 16px" : "40px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 10px" }}>
          Locataire
        </p>
        <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: isMobile ? 32 : 40, lineHeight: 1.1, letterSpacing: "-0.6px", color: "#111", margin: 0 }}>
          Mes candidatures
        </h1>
        <p style={{ fontSize: 14, color: "#8a8477", marginTop: 10, marginBottom: 28, lineHeight: 1.6, maxWidth: 520 }}>
          Toutes les annonces que vous avez contactées, avec leur statut actuel.
        </p>

        {candidatures.length === 0 ? (
          <EmptyState
            icon={
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            }
            title="Aucune candidature pour le moment"
            description="Contactez un propriétaire depuis une annonce, et votre candidature apparaîtra ici avec son statut."
            ctaLabel="Parcourir les annonces"
            ctaHref="/annonces"
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {candidatures.map(c => {
              const ann = c.annonce
              const s = STATUT_LABEL[c.statut as Statut]
              const photo = ann && Array.isArray(ann.photos) && ann.photos.length > 0 ? ann.photos[0] : null
              return (
                <div key={c.annonce_id} style={{ background: "#fff", border: "1px solid #EAE6DF", borderRadius: 20, padding: 18, display: "flex", gap: 14, alignItems: "center", flexWrap: isMobile ? "wrap" : "nowrap", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
                  {photo ? (
                    <Image src={photo} alt="" width={80} height={80} sizes="80px" style={{ width: 80, height: 80, borderRadius: 14, objectFit: "cover", flexShrink: 0, border: "1px solid #EAE6DF" }} />
                  ) : (
                    <div style={{ width: 80, height: 80, borderRadius: 14, background: "#F7F4EF", border: "1px solid #EAE6DF", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", color: "#8a8477", fontSize: 22 }}>
                      {(ann?.titre || "—").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                      <p style={{ fontSize: 15, fontWeight: 600, margin: 0, color: "#111", letterSpacing: "-0.2px" }}>{ann?.titre || "Annonce supprimée"}</p>
                      <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 999, textTransform: "uppercase", letterSpacing: "1.2px" }}>
                        {s.label}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: "#8a8477", margin: 0 }}>
                      {ann?.ville}{ann?.prix ? <> <span style={{ color: "#EAE6DF" }}>·</span> {ann.prix} €/mois</> : ""}
                    </p>
                    <p style={{ fontSize: 11, color: "#8a8477", margin: "6px 0 0" }}>
                      Premier contact le {new Date(c.premier_contact).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                      {" "}<span style={{ color: "#EAE6DF" }}>·</span>{" "}Propriétaire : {displayName(c.proprietaire, ann?.proprietaire)}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
                    <Link href={`/messages?with=${encodeURIComponent(c.proprietaire)}`}
                      style={{ fontSize: 11, fontWeight: 600, color: "#111", textDecoration: "none", border: "1px solid #EAE6DF", borderRadius: 999, padding: "8px 16px", background: "#fff", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                      Messages
                    </Link>
                    {ann && (
                      <Link href={`/annonces/${ann.id}`}
                        style={{ fontSize: 11, fontWeight: 600, color: "#fff", background: "#111", textDecoration: "none", borderRadius: 999, padding: "8px 16px", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                        Annonce
                      </Link>
                    )}
                    {c.peutRelancer && (
                      <button
                        type="button"
                        disabled={relancantId === c.annonce_id}
                        onClick={() => relancerCandidature(c.annonce_id, c.proprietaire, ann?.titre || "")}
                        title={`Sans réponse depuis ${c.joursSansReponse} jours`}
                        style={{ fontSize: 11, fontWeight: 600, color: "#a16207", background: "#FBF6EA", border: "1px solid #EADFC6", borderRadius: 999, padding: "8px 16px", cursor: relancantId === c.annonce_id ? "wait" : "pointer", fontFamily: "inherit", opacity: relancantId === c.annonce_id ? 0.7 : 1, textTransform: "uppercase", letterSpacing: "0.3px" }}>
                        {relancantId === c.annonce_id ? "…" : `Relancer (${c.joursSansReponse} j)`}
                      </button>
                    )}
                    {retraitId === c.annonce_id ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          disabled={retraitEnCours}
                          onClick={() => retirerCandidature(c.annonce_id, c.proprietaire, ann?.titre || "")}
                          style={{ fontSize: 11, fontWeight: 600, color: "#fff", background: "#b91c1c", border: "none", borderRadius: 999, padding: "8px 16px", cursor: retraitEnCours ? "wait" : "pointer", fontFamily: "inherit", opacity: retraitEnCours ? 0.7 : 1, textTransform: "uppercase", letterSpacing: "0.3px" }}>
                          {retraitEnCours ? "…" : "Confirmer"}
                        </button>
                        <button
                          type="button"
                          disabled={retraitEnCours}
                          onClick={() => setRetraitId(null)}
                          style={{ fontSize: 11, fontWeight: 600, color: "#111", background: "#fff", border: "1px solid #EAE6DF", borderRadius: 999, padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setRetraitId(c.annonce_id)}
                        title="Retirer votre candidature — annule les visites en cours et notifie le propriétaire."
                        style={{ fontSize: 11, fontWeight: 600, color: "#b91c1c", background: "#FEECEC", border: "1px solid #F4C9C9", borderRadius: 999, padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                        Retirer
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
