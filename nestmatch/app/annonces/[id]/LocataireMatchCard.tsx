"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { supabase } from "../../../lib/supabase"
import { useRole } from "../../providers"

/**
 * LocataireMatchCard — R10.10
 *
 * Pour le locataire connecté, affiche sur la fiche annonce :
 *   1. Profil recherché (critères owner post R10.6 : animaux_politique,
 *      fumeur_politique, age range, max_occupants) avec pastille de match
 *      global (vous correspondez / partiellement / non renseigné).
 *   2. Loyer max conseillé (33 % des revenus_mensuels du profil) comparé au
 *      loyer CC de l'annonce, avec pastille verte/orange.
 *
 * Skip gracieusement si :
 *   - user non connecté (affiche CTA "Connectez-vous")
 *   - profil vide (affiche CTA "Complétez votre profil")
 *   - owner n'a renseigné AUCUN critère ET user n'a pas de revenus
 *     (la card entière disparaît)
 *
 * Owner-side : n'affiche rien sur sa propre annonce (géré par useRole).
 */
export default function LocataireMatchCard({ annonce }: { annonce: any }) {
  const { data: session, status } = useSession()
  const { role, mounted } = useRole()
  const [profil, setProfil] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (session?.user?.email) {
      // V29.B — /api/profil/me (RLS Phase 5)
      fetch("/api/profil/me", { cache: "no-store" })
        .then(r => r.ok ? r.json() : null)
        .then(j => { setProfil(j?.ok ? j.profil : null); setLoading(false) })
        .catch(() => setLoading(false))
    } else if (status !== "loading") {
      setLoading(false)
    }
  }, [session, status])

  const hasCriteres = !!(
    annonce.animaux_politique ||
    annonce.fumeur_politique ||
    annonce.age_min !== null && annonce.age_min !== undefined ||
    annonce.age_max !== null && annonce.age_max !== undefined ||
    annonce.max_occupants !== null && annonce.max_occupants !== undefined
  )
  const loyerCC = Number(annonce.prix || 0) + Number(annonce.charges || 0)

  // Masque cette card pour le proprio (il connaît déjà ses critères) — robuste
  // même si l'utilisateur est admin en mode "Voir le site en tant que proprio".
  // Le check sur l'email de l'annonce est doublé d'un check role pour couvrir
  // les proprios qui browse les annonces des AUTRES proprios.
  // mounted=true requis pour éviter le flash SSR→CSR (role default "locataire").
  if (!mounted) return null
  const isOwnerOfThisListing = !!session?.user?.email && session.user.email === annonce.proprietaire_email
  if (isOwnerOfThisListing) return null
  if (role === "proprietaire") return null
  if (loading) return null
  if (!hasCriteres && !loyerCC) return null

  // ─── Non connecté : CTA de complétion ──────────────────────────────
  if (!session) return (
    <div style={{ background: "white", borderRadius: 20, padding: 22, boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0, marginBottom: 8 }}>
        Compatibilité
      </p>
      <p style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.5, margin: 0, marginBottom: 12 }}>
        Connectez-vous pour voir si votre profil correspond aux critères recherchés par le propriétaire.
      </p>
      <a href="/auth" style={{ display: "inline-block", background: "#111", color: "white", padding: "8px 16px", borderRadius: 999, fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
        Se connecter
      </a>
    </div>
  )

  // ─── Connecté sans profil complet ──────────────────────────────────
  if (!profil) return (
    <div style={{ background: "white", borderRadius: 20, padding: 22, boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0, marginBottom: 8 }}>
        Compatibilité
      </p>
      <p style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.5, margin: 0, marginBottom: 12 }}>
        Complétez votre profil pour évaluer votre compatibilité.
      </p>
      <a href="/profil" style={{ display: "inline-block", background: "#111", color: "white", padding: "8px 16px", borderRadius: 999, fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
        Compléter mon profil
      </a>
    </div>
  )

  // ─── Match par critère ─────────────────────────────────────────────
  type Row = { label: string; ok: boolean | null; note?: string }
  const rows: Row[] = []

  // Animaux — politique owner vs profil.animaux
  if (annonce.animaux_politique && annonce.animaux_politique !== "indifferent") {
    const userHasAnimaux = !!profil.animaux
    const ownerAccepts = annonce.animaux_politique === "oui"
    rows.push({
      label: "Animaux",
      ok: ownerAccepts ? true : !userHasAnimaux,
      note: userHasAnimaux ? "Vous en avez" : "Pas d'animaux",
    })
  }
  // Fumeur — politique owner vs profil.fumeur
  if (annonce.fumeur_politique && annonce.fumeur_politique !== "indifferent") {
    const userFume = !!profil.fumeur
    const ownerAccepts = annonce.fumeur_politique === "oui"
    rows.push({
      label: "Fumeur",
      ok: ownerAccepts ? true : !userFume,
      note: userFume ? "Vous fumez" : "Non-fumeur",
    })
  }
  // Occupants max
  if (annonce.max_occupants) {
    const userOccupants = Number(profil.nb_occupants || 1)
    rows.push({
      label: "Occupants",
      ok: userOccupants <= Number(annonce.max_occupants),
      note: `Vous : ${userOccupants}, max ${annonce.max_occupants}`,
    })
  }
  // Revenus : ratio min implicite 33 %
  const userRevenus = Number(profil.revenus_mensuels || 0)
  if (loyerCC > 0 && userRevenus > 0) {
    const ratio = userRevenus / loyerCC
    rows.push({
      label: "Revenus",
      ok: ratio >= 3,
      note: `${userRevenus} €/mois · ${ratio.toFixed(1)}× le loyer`,
    })
  }

  // Loyer max conseillé (33 %)
  const loyerMax = Math.round(userRevenus / 3)
  const loyerOk = loyerCC <= loyerMax
  const hasRevenus = userRevenus > 0

  // R10.12 — Si la card n'a RIEN à montrer (pas de rows ET pas de loyer max
  // utile), on ne rend rien plutôt que de laisser une card vide à l'écran.
  if (rows.length === 0 && !(hasRevenus && loyerCC > 0)) return null

  // R10.12 — Dédoublonnage : on retire le titre "Votre compatibilité" et la
  // pastille globale ("Vous correspondez au profil recherché" etc.) car le
  // chip "X % de compatibilité" est déjà affiché dans la sticky card du
  // haut. Cette card devient purement granulaire : critères owner + loyer max.
  return (
    <div style={{ background: "white", borderRadius: 20, padding: 22, boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0, marginBottom: 8 }}>
        Votre compatibilité
      </p>
      <h3 style={{ fontSize: 16, fontWeight: 400, fontStyle: "italic", fontFamily: "'Fraunces', 'DM Sans', serif", letterSpacing: "-0.3px", margin: 0, marginBottom: 14, color: "#111" }}>
        Le propriétaire recherche…
      </h3>

      {rows.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8, marginBottom: hasRevenus ? 14 : 0 }}>
          {rows.map((r, i) => (
            <li key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              <span aria-hidden style={{ width: 20, height: 20, borderRadius: "50%", background: r.ok ? "#F0FAEE" : "#FBECEC", color: r.ok ? "#15803d" : "#b91c1c", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {r.ok ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                ) : (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                )}
              </span>
              <span style={{ flex: 1, color: "#111" }}>{r.label}</span>
              {r.note && <span style={{ color: "#8a8477", fontSize: 12 }}>{r.note}</span>}
            </li>
          ))}
        </ul>
      )}

      {hasRevenus && loyerCC > 0 && (
        <div style={{ borderTop: "1px solid #F7F4EF", paddingTop: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0, marginBottom: 6 }}>
            Votre loyer max conseillé
          </p>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: "#111" }}>{loyerMax} €/mois</span>
            <span style={{ fontSize: 11, color: "#8a8477" }}>33 % de vos revenus</span>
          </div>
          <p style={{ fontSize: 12, color: loyerOk ? "#15803d" : "#a16207", marginTop: 8, marginBottom: 0, fontWeight: 600 }}>
            {loyerOk
              ? `✓ Ce bien (${loyerCC} € CC) est dans votre budget`
              : `△ Ce bien (${loyerCC} € CC) dépasse votre loyer max conseillé`}
          </p>
        </div>
      )}
    </div>
  )
}
