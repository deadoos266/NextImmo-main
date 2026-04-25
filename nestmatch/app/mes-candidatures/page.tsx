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
import { km, KMPageHeader } from "../components/ui/km"

/**
 * /mes-candidatures — historique des candidatures locataire (annonces
 * contactées). Statut déduit côté client : contact / dossier / visite /
 * bail / rejeté. Aligné Claude Design handoff (km primitives).
 */

type Statut = "contact" | "dossier" | "visite" | "bail" | "rejete"
const STATUT_LABEL: Record<Statut, { label: string; bg: string; color: string; border: string }> = {
  contact:  { label: "Contact établi",      bg: km.beige,    color: "#6b6559",     border: km.line },
  dossier:  { label: "Dossier envoyé",      bg: km.successBg, color: km.successText, border: km.successLine },
  visite:   { label: "Visite programmée",   bg: km.infoBg,    color: km.infoText,    border: km.infoLine },
  bail:     { label: "Bail signé",          bg: km.ink,       color: km.white,       border: km.ink },
  rejete:   { label: "Visite refusée",      bg: km.errBg,     color: km.errText,     border: km.errLine },
}

const RETRAIT_PREFIX = "[CANDIDATURE_RETIREE]"
const RELANCE_PREFIX = "[RELANCE]"
// Délai avant de pouvoir relancer (jours sans réponse du proprio)
const RELANCE_DELAI_JOURS = 7
// Cooldown entre deux relances (jours)
const RELANCE_COOLDOWN_JOURS = 5

// Pill bouton générique aligné km — utilisée pour tous les CTA de la card
// candidature. Sortie du composant pour éviter la recréation au render.
function CtaPill({
  variant = "outline",
  href,
  onClick,
  disabled,
  title,
  children,
}: {
  variant?: "ink" | "outline" | "warn" | "err" | "errSoft"
  href?: string
  onClick?: () => void
  disabled?: boolean
  title?: string
  children: React.ReactNode
}) {
  const cfg = {
    outline:  { bg: km.white,    color: km.ink,        border: km.line },
    ink:      { bg: km.ink,      color: km.white,      border: km.ink },
    warn:     { bg: km.warnBg,   color: km.warnText,   border: km.warnLine },
    err:      { bg: km.errText,  color: km.white,      border: km.errText },
    errSoft:  { bg: km.errBg,    color: km.errText,    border: km.errLine },
  }[variant]
  const baseStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600,
    background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
    borderRadius: 999, padding: "8px 16px",
    textTransform: "uppercase", letterSpacing: "0.3px",
    fontFamily: "inherit",
    textDecoration: "none",
    cursor: disabled ? "wait" : "pointer",
    opacity: disabled ? 0.7 : 1,
    whiteSpace: "nowrap",
  }
  if (href) {
    return <Link href={href} title={title} style={baseStyle}>{children}</Link>
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} style={baseStyle}>
      {children}
    </button>
  )
}

export default function MesCandidatures() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { isMobile } = useResponsive()
  const [candidatures, setCandidatures] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [retraitId, setRetraitId] = useState<number | null>(null)
  const [retraitEnCours, setRetraitEnCours] = useState(false)
  const [relancantId, setRelancantId] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/auth"); return }
    if (!session?.user?.email) return
    load()
  }, [session, status])

  async function load() {
    if (!session?.user?.email) return
    const email = session.user.email
    setLoadError(null)
    // 1. Tous les messages envoyés par le locataire vers un proprio
    const { data: msgs, error: msgsErr } = await supabase
      .from("messages")
      .select("id, to_email, annonce_id, contenu, created_at")
      .eq("from_email", email)
      .not("annonce_id", "is", null)
      .order("created_at", { ascending: false })

    // Fail loud — sinon liste vide silencieuse interprétée comme
    // « aucune candidature » alors que la DB est down.
    if (msgsErr) {
      console.error("[mes-candidatures] load messages failed", msgsErr)
      setLoadError("Impossible de charger vos candidatures. Vérifiez votre connexion et réessayez.")
      setLoading(false)
      return
    }

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

    // 3. Enrichir avec visites
    const { data: visites } = await supabase
      .from("visites")
      .select("annonce_id, statut, date_visite, heure")
      .eq("locataire_email", email)
      .in("annonce_id", ids)

    // 3bis. Messages reçus des proprios (détection de réponse)
    const { data: msgsRecus } = await supabase
      .from("messages")
      .select("from_email, annonce_id, created_at, contenu")
      .eq("to_email", email)
      .in("annonce_id", ids)
      .order("created_at", { ascending: false })

    // 4. Détection dossier envoyé + retraits
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

        const msgsEnvoyesCetteAnn = (msgs || []).filter(m => m.annonce_id === id)
        const msgsRecusCetteAnn = (msgsRecus || []).filter(m => m.annonce_id === id)
        const dernierEnvoye = msgsEnvoyesCetteAnn[0]
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
      // Filtrer les baux signés (vus dans /mon-logement) et candidatures retirées
      .filter(r => !r.baisSigne && !retireeIds.has(r.annonce_id))

    setCandidatures(result)
    setLoading(false)
  }

  async function retirerCandidature(annonce_id: number, proprietaire: string, titre: string) {
    if (!session?.user?.email) return
    setRetraitEnCours(true)
    const email = session.user.email
    // 1. Annuler les visites en cours pour cette annonce
    const { error: cancelErr } = await supabase
      .from("visites")
      .update({ statut: "annulée" })
      .eq("annonce_id", annonce_id)
      .eq("locataire_email", email)
      .in("statut", ["proposée", "confirmée"])
    if (cancelErr) {
      console.error("[mes-candidatures] retrait visites failed", cancelErr)
      alert("Le retrait n'a pas pu être enregistré. Réessayez dans quelques instants.")
      setRetraitEnCours(false)
      return
    }
    // 2. Notifier le proprio via message système
    const payload = JSON.stringify({ bienTitre: titre, retireLe: new Date().toISOString() })
    const { error: msgErr } = await supabase.from("messages").insert([{
      from_email: email,
      to_email: proprietaire,
      contenu: `${RETRAIT_PREFIX}${payload}`,
      annonce_id,
      lu: false,
      created_at: new Date().toISOString(),
    }])
    if (msgErr) {
      console.error("[mes-candidatures] retrait notif failed", msgErr)
      alert("Le retrait a été partiellement enregistré (visites annulées) mais le propriétaire n'a pas pu être notifié. Réessayez plus tard.")
      setRetraitEnCours(false)
      return
    }
    // 3. Retirer de la liste locale
    setCandidatures(prev => prev.filter(c => c.annonce_id !== annonce_id))
    setRetraitId(null)
    setRetraitEnCours(false)
  }

  async function relancerCandidature(annonce_id: number, proprietaire: string, titre: string) {
    if (!session?.user?.email) return
    setRelancantId(annonce_id)
    const email = session.user.email
    const contenu = `${RELANCE_PREFIX}Bonjour, avez-vous eu l'occasion de consulter ma candidature pour « ${titre || "votre bien"} » ? Je reste très intéressé(e) et disponible pour échanger ou visiter. Merci !`
    const { error } = await supabase.from("messages").insert([{
      from_email: email,
      to_email: proprietaire,
      contenu,
      annonce_id,
      lu: false,
      created_at: new Date().toISOString(),
    }])
    if (error) {
      console.error("[mes-candidatures] relance failed", error)
      alert("La relance n'a pas pu être envoyée. Vérifiez votre connexion et réessayez.")
      setRelancantId(null)
      return
    }
    // Marque cette candidature comme relancée localement (cooldown immédiat)
    setCandidatures(prev => prev.map(c => c.annonce_id === annonce_id
      ? { ...c, peutRelancer: false, joursSansReponse: 0 }
      : c
    ))
    setRelancantId(null)
  }

  if (status === "loading" || loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: km.muted, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>Chargement…</div>
  )

  return (
    <main style={{ minHeight: "100vh", background: km.beige, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif", padding: isMobile ? "24px 16px" : "40px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <KMPageHeader
          eyebrow="Locataire"
          title="Mes candidatures"
          subtitle="Toutes les annonces que vous avez contactées, avec leur statut actuel."
          isMobile={isMobile}
        />

        {loadError && (
          <div style={{ background: km.errBg, color: km.errText, border: `1px solid ${km.errLine}`, borderRadius: 16, padding: "14px 18px", fontSize: 13, marginBottom: 20 }}>
            {loadError}
          </div>
        )}

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
                <div key={c.annonce_id} style={{ background: km.white, border: `1px solid ${km.line}`, borderRadius: 20, padding: 18, display: "flex", gap: 14, alignItems: "center", flexWrap: isMobile ? "wrap" : "nowrap", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
                  {photo ? (
                    <Image src={photo} alt="" width={80} height={80} sizes="80px" style={{ width: 80, height: 80, borderRadius: 14, objectFit: "cover", flexShrink: 0, border: `1px solid ${km.line}` }} />
                  ) : (
                    <div style={{ width: 80, height: 80, borderRadius: 14, background: km.beige, border: `1px solid ${km.line}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif", fontStyle: "italic", color: km.muted, fontSize: 22 }}>
                      {(ann?.titre || "—").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                      <p style={{ fontSize: 15, fontWeight: 600, margin: 0, color: km.ink, letterSpacing: "-0.2px" }}>{ann?.titre || "Annonce supprimée"}</p>
                      <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 999, textTransform: "uppercase", letterSpacing: "1.2px" }}>
                        {s.label}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: km.muted, margin: 0 }}>
                      {ann?.ville}{ann?.prix ? <> <span style={{ color: km.line }}>·</span> {ann.prix} €/mois</> : ""}
                    </p>
                    <p style={{ fontSize: 11, color: km.muted, margin: "6px 0 0" }}>
                      Premier contact le {new Date(c.premier_contact).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                      {" "}<span style={{ color: km.line }}>·</span>{" "}Propriétaire : {displayName(c.proprietaire, ann?.proprietaire)}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
                    <CtaPill variant="outline" href={`/messages?with=${encodeURIComponent(c.proprietaire)}`}>
                      Messages
                    </CtaPill>
                    {ann && (
                      <CtaPill variant="ink" href={`/annonces/${ann.id}`}>
                        Annonce
                      </CtaPill>
                    )}
                    {c.peutRelancer && (
                      <CtaPill
                        variant="warn"
                        disabled={relancantId === c.annonce_id}
                        onClick={() => relancerCandidature(c.annonce_id, c.proprietaire, ann?.titre || "")}
                        title={`Sans réponse depuis ${c.joursSansReponse} jours`}
                      >
                        {relancantId === c.annonce_id ? "…" : `Relancer (${c.joursSansReponse} j)`}
                      </CtaPill>
                    )}
                    {retraitId === c.annonce_id ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <CtaPill
                          variant="err"
                          disabled={retraitEnCours}
                          onClick={() => retirerCandidature(c.annonce_id, c.proprietaire, ann?.titre || "")}
                        >
                          {retraitEnCours ? "…" : "Confirmer"}
                        </CtaPill>
                        <CtaPill variant="outline" disabled={retraitEnCours} onClick={() => setRetraitId(null)}>
                          Annuler
                        </CtaPill>
                      </div>
                    ) : (
                      <CtaPill
                        variant="errSoft"
                        onClick={() => setRetraitId(c.annonce_id)}
                        title="Retirer votre candidature — annule les visites en cours et notifie le propriétaire."
                      >
                        Retirer
                      </CtaPill>
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
