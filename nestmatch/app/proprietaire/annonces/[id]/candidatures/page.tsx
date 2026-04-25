"use client"
// Candidatures par annonce — écran dédié (Phase 5 calque handoff candidatures.jsx)
// Route : /proprietaire/annonces/[id]/candidatures
// Source données : messages (type=candidature, to_email=me, annonce_id), profils
// (via from_email), visites (pour dériver statut visite/confirmée).
//
// Statut dérivé par candidature :
//   bail    = annonce.statut === "loué" && candidat = locataire_email
//   visite  = une visite existe (confirmée/proposée/effectuée)
//   dossier = profil complet (screening tier >= "moyen")
//   contact = seule la candidature existe, pas de dossier rempli
//   rejete  = l'annonce a un autre locataire (bail signé ailleurs)

import { useSession } from "next-auth/react"
import { useState, useEffect, useMemo } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { supabase } from "../../../../../lib/supabase"
import { useResponsive } from "../../../../hooks/useResponsive"
import { computeScreening, type ScreeningProfil } from "../../../../../lib/screening"
import { calculerScore } from "../../../../../lib/matching"

type StatutCand = "contact" | "dossier" | "visite" | "bail" | "rejete"

// Palette handoff 2026-04-24 — pastel doux + border hairline matching.
// Eyebrow uppercase letterSpacing 1.2px fontSize 10 fontWeight 700 partout.
const STATUT_META: Record<StatutCand, { label: string; dot: string; bg: string; color: string; border: string }> = {
  contact: { label: "Premier contact",    dot: "#9CA3AF", bg: "#F7F4EF", color: "#6b6559", border: "#EAE6DF" },
  dossier: { label: "Dossier reçu",       dot: "#3B82F6", bg: "#EEF3FB", color: "#1d4ed8", border: "#D7E3F4" },
  visite:  { label: "Visite programmée",  dot: "#F59E0B", bg: "#FBF6EA", color: "#a16207", border: "#EADFC6" },
  bail:    { label: "Bail signé",         dot: "#15803d", bg: "#F0FAEE", color: "#15803d", border: "#C6E9C0" },
  rejete:  { label: "Refusée",            dot: "#6B7280", bg: "#F7F4EF", color: "#8a8477", border: "#EAE6DF" },
}

type SortKey = "score" | "recent" | "revenus" | "dossier"
const SORTS: { k: SortKey; l: string }[] = [
  { k: "score",   l: "Score" },
  { k: "recent",  l: "Récents" },
  { k: "revenus", l: "Revenus" },
  { k: "dossier", l: "Dossier" },
]

function scoreColor(n: number) {
  return n >= 85 ? "#15803d" : n >= 70 ? "#a16207" : "#8a8477"
}
function initialsOf(profil: ScreeningProfil | null, email: string): string {
  const p = (profil?.prenom || "").trim()
  const n = (profil?.nom || "").trim()
  if (p || n) return `${p.charAt(0)}${n.charAt(0)}`.toUpperCase() || p.charAt(0).toUpperCase()
  return (email || "?").charAt(0).toUpperCase()
}
function formatTime(iso: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime()
    const mins = Math.round(diffMs / 60000)
    if (mins < 1) return "À l'instant"
    if (mins < 60) return `Il y a ${mins} min`
    const hours = Math.round(mins / 60)
    if (hours < 24) return `Il y a ${hours} h`
    const days = Math.round(hours / 24)
    if (days === 1) return "Hier"
    if (days < 7) return `Il y a ${days} j`
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
  } catch {
    return ""
  }
}

type CandidatureRow = {
  id: number
  from_email: string
  to_email: string
  annonce_id: number | null
  contenu: string | null
  created_at: string
  type: string | null
  lu: boolean | null
  /** Migration 022 : statut explicite posé par le proprio (debloque visite). */
  statut_candidature?: "en_attente" | "validee" | "refusee" | null
}

type VisiteRow = {
  id: string | number
  annonce_id: number | null
  locataire_email: string
  proprietaire_email: string
  statut: string
  date_visite: string | null
  heure: string | null
}

type Annonce = {
  id: number
  titre: string
  ville: string
  prix: number
  charges?: number | null
  surface?: number | null
  pieces?: number | null
  photos?: string[] | null
  photo_url?: string | null
  proprietaire_email: string
  statut?: string | null
  locataire_email?: string | null
  created_at?: string | null
}

export default function CandidaturesParAnnonce() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const { isMobile } = useResponsive()
  const bienId = Number(params.id)

  const [loading, setLoading] = useState(true)
  const [bien, setBien] = useState<Annonce | null>(null)
  const [candidatures, setCandidatures] = useState<CandidatureRow[]>([])
  const [dossiers, setDossiers] = useState<Record<string, ScreeningProfil & Record<string, unknown>>>({})
  const [visites, setVisites] = useState<VisiteRow[]>([])
  const [notFound, setNotFound] = useState(false)
  const [filter, setFilter] = useState<"all" | StatutCand>("all")
  const [sort, setSort] = useState<SortKey>("score")

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth")
    if (session?.user?.email && Number.isFinite(bienId)) loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, status, bienId])

  async function loadAll() {
    const me = session!.user!.email!
    setLoading(true)

    // 1) Bien — on vérifie que l'user est bien le propriétaire
    const { data: bienData } = await supabase
      .from("annonces")
      .select("*")
      .eq("id", bienId)
      .single()

    if (!bienData || (bienData.proprietaire_email || "").toLowerCase() !== me.toLowerCase()) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setBien(bienData as Annonce)

    // 2) Candidatures (messages type=candidature) pour cette annonce
    const { data: msgs } = await supabase
      .from("messages")
      .select("*")
      .eq("to_email", me)
      .eq("annonce_id", bienId)
      .eq("type", "candidature")
      .order("created_at", { ascending: false })

    const candRows = (msgs || []) as CandidatureRow[]
    setCandidatures(candRows)

    // 3) Dossiers (profils) pour les candidats
    const emails = Array.from(new Set(candRows.map(c => c.from_email).filter(Boolean)))
    if (emails.length > 0) {
      const { data: profs } = await supabase.from("profils").select("*").in("email", emails)
      const map: Record<string, ScreeningProfil & Record<string, unknown>> = {}
      ;(profs || []).forEach((p: Record<string, unknown>) => {
        const email = p.email as string | undefined
        if (email) map[email] = p as ScreeningProfil & Record<string, unknown>
      })
      setDossiers(map)
    }

    // 4) Visites liées à ce bien (pour statut "visite programmée")
    const { data: vis } = await supabase
      .from("visites")
      .select("id, annonce_id, locataire_email, proprietaire_email, statut, date_visite, heure")
      .eq("annonce_id", bienId)
    setVisites((vis || []) as VisiteRow[])

    setLoading(false)
  }

  // Enrichissement : ajoute statut dérivé + screening + compat
  const enriched = useMemo(() => {
    if (!bien) return []
    const loyer = (Number(bien.prix) || 0) + (Number(bien.charges) || 0)
    const bienIsRented = bien.statut === "loué"
    return candidatures.map(c => {
      const profil = dossiers[c.from_email] || null
      const screening = computeScreening(profil, loyer)
      const compatRaw = profil ? calculerScore(bien as never, profil as never) : null
      const compatPct = compatRaw !== null ? Math.round(compatRaw / 10) : null
      const myVisite = visites.find(v => (v.locataire_email || "").toLowerCase() === (c.from_email || "").toLowerCase())
      let statut: StatutCand
      if (bienIsRented && (bien.locataire_email || "").toLowerCase() === (c.from_email || "").toLowerCase()) {
        statut = "bail"
      } else if (bienIsRented) {
        // Un autre candidat a signé : cette candidature est de facto refusée
        statut = "rejete"
      } else if (myVisite && ["confirmée", "proposée", "effectuée"].includes(myVisite.statut)) {
        statut = "visite"
      } else if (screening.tier !== "incomplet") {
        statut = "dossier"
      } else {
        statut = "contact"
      }
      return { c, profil, screening, compatPct, statut, visite: myVisite || null }
    })
  }, [candidatures, dossiers, visites, bien])

  const counts = useMemo(() => {
    const out: Record<"all" | StatutCand, number> = { all: enriched.length, contact: 0, dossier: 0, visite: 0, bail: 0, rejete: 0 }
    enriched.forEach(e => { out[e.statut] = (out[e.statut] || 0) + 1 })
    return out
  }, [enriched])

  const filtered = useMemo(() => {
    let arr = filter === "all" ? [...enriched] : enriched.filter(e => e.statut === filter)
    if (sort === "score") arr.sort((a, b) => b.screening.score - a.screening.score)
    if (sort === "recent") arr.sort((a, b) => +new Date(b.c.created_at) - +new Date(a.c.created_at))
    if (sort === "revenus") {
      const rev = (p: ScreeningProfil | null) => Number(p?.revenus_mensuels) || 0
      arr.sort((a, b) => rev(b.profil) - rev(a.profil))
    }
    if (sort === "dossier") {
      // Complétude grossière : profil rempli = 100, sinon screening.score
      const compl = (p: ScreeningProfil | null) => {
        if (!p) return 0
        const keys: Array<keyof ScreeningProfil> = ["revenus_mensuels", "situation_pro", "garant", "prenom", "nom", "telephone"]
        const filled = keys.filter(k => {
          const v = p[k]
          return v !== null && v !== undefined && v !== ""
        }).length
        return Math.round((filled / keys.length) * 100)
      }
      arr.sort((a, b) => compl(b.profil) - compl(a.profil))
    }
    return arr
  }, [enriched, filter, sort])

  const bienPhoto = bien?.photos?.[0] || bien?.photo_url || null

  if (status === "loading" || loading) {
    return (
      <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#8a8477", fontSize: 14 }}>Chargement…</p>
      </main>
    )
  }

  if (notFound || !bien) {
    return (
      <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: 48 }}>
        <div style={{ maxWidth: 600, margin: "0 auto", background: "#fff", borderRadius: 20, padding: 32, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>Annonce introuvable</h1>
          <p style={{ color: "#8a8477", fontSize: 14, marginBottom: 18 }}>Cette annonce n&apos;existe pas ou vous n&apos;en êtes pas le propriétaire.</p>
          <Link href="/proprietaire" style={{ background: "#111", color: "#fff", padding: "10px 22px", borderRadius: 999, textDecoration: "none", fontSize: 13, fontWeight: 700 }}>
            Retour au tableau de bord
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,300;1,9..144,400;1,9..144,500&display=swap');
        .km-serif { font-family: 'Fraunces', Georgia, serif; font-feature-settings: 'ss01'; }
      `}</style>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? "24px 16px" : "32px 40px 80px" }}>
        {/* Back link */}
        <Link href="/proprietaire" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#666", fontSize: 12, textDecoration: "none", marginBottom: 14 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Tableau de bord
        </Link>

        {/* Header éditorial calque candidatures.jsx L78-96 */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 24 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center", minWidth: 0 }}>
            <div style={{ width: isMobile ? 56 : 72, height: isMobile ? 56 : 72, borderRadius: 16, overflow: "hidden", background: "#EAE6DF", flexShrink: 0, position: "relative" }}>
              {bienPhoto && (
                <Image src={bienPhoto} alt={bien.titre} fill sizes="72px" style={{ objectFit: "cover" }} />
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.8px", textTransform: "uppercase", color: "#666", marginBottom: 6 }}>
                {candidatures.length} candidature{candidatures.length > 1 ? "s" : ""}{bien.ville ? ` · ${bien.ville}` : ""}
              </div>
              <h1 className="km-serif" style={{ fontSize: isMobile ? 24 : 30, fontWeight: 500, fontStyle: "italic", letterSpacing: "-0.8px", margin: 0, lineHeight: 1.1, color: "#111" }}>
                {bien.titre}
              </h1>
              <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                {bien.prix} €/mois{bien.surface ? ` · ${bien.surface} m²` : ""}{bien.pieces ? ` · ${bien.pieces} pièce${bien.pieces > 1 ? "s" : ""}` : ""}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href={`/annonces/${bien.id}`} style={{ padding: "9px 16px", background: "#fff", color: "#111", border: "1px solid #EAE6DF", borderRadius: 999, fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}>
              Voir l&apos;annonce
            </Link>
            <Link href={`/proprietaire/modifier/${bien.id}`} style={{ padding: "9px 16px", background: "#111", color: "#fff", borderRadius: 999, fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}>
              Modifier
            </Link>
          </div>
        </div>

        {/* Status tabs */}
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #EAE6DF", overflowX: "auto", paddingBottom: 0 }}>
          <TabPill label="Toutes" count={counts.all} active={filter === "all"} onClick={() => setFilter("all")} />
          {(Object.keys(STATUT_META) as StatutCand[]).map(k => counts[k] > 0 && (
            <TabPill
              key={k}
              label={STATUT_META[k].label}
              dot={STATUT_META[k].dot}
              count={counts[k]}
              active={filter === k}
              onClick={() => setFilter(k)}
            />
          ))}
        </div>

        {/* Sort bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0 18px", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#666" }}>
            {filtered.length} candidature{filtered.length > 1 ? "s" : ""} · tri {SORTS.find(s => s.k === sort)?.l.toLowerCase()}
          </span>
          <div style={{ display: "inline-flex", background: "#fff", border: "1px solid #EAE6DF", borderRadius: 999, padding: 3, flexWrap: "wrap" }}>
            {SORTS.map(s => (
              <button
                key={s.k}
                onClick={() => setSort(s.k)}
                style={{
                  padding: "6px 14px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 600,
                  background: sort === s.k ? "#111" : "transparent", color: sort === s.k ? "#fff" : "#111",
                }}
              >
                {s.l}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "60px 20px", textAlign: "center", color: "#8a8477", fontSize: 13, background: "#fff", borderRadius: 20 }}>
              {filter === "all"
                ? "Aucune candidature pour ce bien."
                : `Aucune candidature dans le statut "${STATUT_META[filter as StatutCand]?.label}".`}
            </div>
          ) : filtered.map(e => (
            <CandidatureCard
              key={e.c.id}
              email={e.c.from_email}
              contenu={e.c.contenu}
              createdAt={e.c.created_at}
              annonceId={bien.id}
              profil={e.profil}
              screening={e.screening}
              compatPct={e.compatPct}
              statut={e.statut}
              visite={e.visite}
              statutCandidature={e.c.statut_candidature ?? null}
              onValidated={() => {
                // Optimistic : marque le statut sans refetch complet
                setCandidatures(prev => prev.map(c =>
                  c.id === e.c.id ? { ...c, statut_candidature: "validee" } : c
                ))
              }}
            />
          ))}
        </div>
      </div>
    </main>
  )
}

// ────────────────────────────────────────────────────────────────────
// Sous-composants
// ────────────────────────────────────────────────────────────────────

function TabPill({ label, count, dot, active, onClick }: { label: string; count: number; dot?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 16px 12px",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 12.5,
        fontWeight: active ? 600 : 500,
        color: active ? "#111" : "#666",
        borderBottom: `2px solid ${active ? "#111" : "transparent"}`,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        marginBottom: -1,
        whiteSpace: "nowrap",
      }}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot }} />}
      {label}
      <span style={{ padding: "1px 7px", borderRadius: 999, background: active ? "#111" : "#EAE6DF", color: active ? "#fff" : "#666", fontSize: 10, fontWeight: 700 }}>
        {count}
      </span>
    </button>
  )
}

function CandidatureCard({
  email,
  contenu,
  createdAt,
  annonceId,
  profil,
  screening,
  compatPct,
  statut,
  visite,
  statutCandidature,
  onValidated,
}: {
  email: string
  contenu: string | null
  createdAt: string
  annonceId: number
  profil: ScreeningProfil | null
  screening: ReturnType<typeof computeScreening>
  compatPct: number | null
  statut: StatutCand
  visite: VisiteRow | null
  statutCandidature: "en_attente" | "validee" | "refusee" | null
  onValidated: () => void
}) {
  const [validating, setValidating] = useState(false)
  const isValidated = statutCandidature === "validee"
  const canValidate = !isValidated && statut !== "rejete" && statut !== "bail"
  async function valider() {
    if (validating) return
    setValidating(true)
    try {
      const res = await fetch("/api/candidatures/valider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annonceId, locataireEmail: email }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) {
        alert(`Validation échouée : ${json.error || res.statusText}`)
        return
      }
      onValidated()
    } finally {
      setValidating(false)
    }
  }
  const meta = STATUT_META[statut]
  const initials = initialsOf(profil, email)
  const displayName = profil?.prenom || profil?.nom
    ? `${profil.prenom || ""} ${profil.nom || ""}`.trim()
    : email
  const revenus = Number(profil?.revenus_mensuels) || 0
  const ratio = screening.ratioSolvabilite
  const pro = profil?.situation_pro || "Profil en cours"

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "64px 1fr auto",
        gap: 14,
        padding: "16px 20px",
        background: "#fff",
        border: "1px solid #EAE6DF",
        borderRadius: 18,
        alignItems: "center",
        boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Avatar initiales */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "#F7F4EF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#111",
          fontFamily: "'Fraunces', Georgia, serif",
          fontSize: 20,
          fontWeight: 500,
          letterSpacing: "-0.5px",
        }}
        aria-hidden
      >
        {initials}
      </div>

      {/* Infos */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>
            {displayName}
          </span>
          {compatPct !== null && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: scoreColor(compatPct) }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: scoreColor(compatPct) }} />
              {compatPct}% compatibilité
            </span>
          )}
        </div>
        <div style={{ fontSize: 12.5, color: "#8a8477", marginTop: 4, letterSpacing: "0.1px" }}>
          {pro}
          {revenus > 0 ? ` · ${revenus.toLocaleString("fr-FR")} €/mois` : ""}
          {ratio !== null ? ` · ${ratio.toFixed(1)}× loyer` : ""}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontSize: 10, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 999, background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px" }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: meta.dot }} />
            {meta.label}
          </span>
          {profil?.garant === true && (
            <span style={{ color: "#8a8477", fontSize: 11, letterSpacing: "0.1px" }}>· Garant{profil.type_garant ? ` ${profil.type_garant}` : ""}</span>
          )}
          <span style={{ color: "#8a8477", fontSize: 11, letterSpacing: "0.1px" }}>· {formatTime(createdAt)}</span>
        </div>
        {statut === "visite" && visite?.date_visite && (
          <div style={{ marginTop: 8, fontSize: 11, color: meta.color, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /></svg>
            {new Date(visite.date_visite).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
            {visite.heure ? ` · ${visite.heure}` : ""}
          </div>
        )}
        {contenu && (
          <div style={{ fontSize: 12, color: "#8a8477", marginTop: 6, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 420 }}>
            « {contenu.length > 90 ? contenu.slice(0, 90) + "…" : contenu} »
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
        {canValidate && (
          <button
            type="button"
            onClick={valider}
            disabled={validating}
            title="Présélection : débloque le droit pour ce candidat de proposer une visite"
            style={{ padding: "10px 18px", background: "#15803d", color: "#fff", border: "none", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: validating ? "not-allowed" : "pointer", whiteSpace: "nowrap", letterSpacing: "0.3px", fontFamily: "inherit", opacity: validating ? 0.6 : 1 }}
          >
            {validating ? "Validation…" : "Valider la candidature"}
          </button>
        )}
        {isValidated && (
          <span
            aria-label="Candidature validée"
            style={{ padding: "8px 14px", background: "#F0FAEE", color: "#15803d", border: "1px solid #C6E9C0", borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", letterSpacing: "0.3px", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            Validée
          </span>
        )}
        <Link
          href={`/messages?with=${encodeURIComponent(email)}&annonce=${annonceId}`}
          style={{ padding: "10px 18px", background: "#111", color: "#fff", borderRadius: 999, fontSize: 11, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap", letterSpacing: "0.3px", fontFamily: "inherit" }}
        >
          Répondre
        </Link>
        <Link
          href={`/messages?with=${encodeURIComponent(email)}&annonce=${annonceId}&panel=dossier`}
          style={{ padding: "9px 18px", background: "#fff", color: "#111", border: "1px solid #EAE6DF", borderRadius: 999, fontSize: 11, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap", letterSpacing: "0.3px", fontFamily: "inherit" }}
        >
          Voir dossier
        </Link>
      </div>
    </div>
  )
}
