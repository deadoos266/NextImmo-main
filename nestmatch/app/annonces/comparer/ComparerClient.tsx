"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { supabase } from "../../../lib/supabase"
import { CARD_GRADIENTS as GRADIENTS } from "../../../lib/cardGradients"
import { km, KMEyebrow, KMHeading, KMChip, KMDPE, KMMatchRing } from "../../components/ui/km"
import EmptyState from "../../components/ui/EmptyState"
import { useResponsive } from "../../hooks/useResponsive"
import { useSession } from "next-auth/react"
import { calculerScore } from "../../../lib/matching"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Annonce = any

/**
 * Comparateur côté-à-côte /annonces/comparer (R10.2c).
 *
 * Layout : grid responsive (1 col mobile, N cols desktop), chaque colonne =
 * bloc complet (photo + titre + loyer + specs + amenities + DPE + score).
 * Les lignes sont alignées via rangées CSS grid-auto-flow column puis
 * intervertion — chaque "ligne" de stats traversée = section avec même
 * hauteur min-height pour aligner.
 *
 * Highlights :
 *  - Prix : meilleur (le + bas) en badge « Moins cher »
 *  - Surface : meilleur (la + grande) en badge « Plus grand »
 *  - DPE : meilleure classe en badge « Meilleur DPE »
 *  - Score : meilleur match en badge ink (KMMatchRing seuil succès)
 */
export default function ComparerClient({ ids }: { ids: number[] }) {
  const { isMobile } = useResponsive()
  const { data: session } = useSession()
  const [annonces, setAnnonces] = useState<Annonce[]>([])
  const [profil, setProfil] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (ids.length === 0) { setLoading(false); return }
      const { data } = await supabase.from("annonces").select("*").in("id", ids).eq("is_test", false)
      if (cancelled) return
      if (data) {
        // Preserve URL order
        const byId = new Map<number, Annonce>(data.map((a: Annonce) => [a.id, a]))
        const ordered = ids.map(id => byId.get(id)).filter((a): a is Annonce => !!a)
        setAnnonces(ordered)
      }
      if (session?.user?.email) {
        // V29.B — via /api/profil/me (server-side, RLS Phase 5)
        const res = await fetch("/api/profil/me", { cache: "no-store" })
        const json = await res.json().catch(() => ({}))
        const p = json.ok ? json.profil : null
        if (!cancelled && p) setProfil(p)
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(","), session?.user?.email])

  // ── Zero / single state
  if (!loading && ids.length < 2) {
    return (
      <div style={{ background: km.beige, minHeight: "calc(100vh - 72px)", padding: "40px 20px", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <EmptyState
            title="Sélectionnez au moins 2 annonces"
            description="Retournez sur la liste, cochez 2 ou 3 annonces puis cliquez sur « Comparer »."
            ctaLabel="Voir les annonces"
            ctaHref="/annonces"
          />
        </div>
      </div>
    )
  }
  if (!loading && annonces.length === 0) {
    return (
      <div style={{ background: km.beige, minHeight: "calc(100vh - 72px)", padding: "40px 20px", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <EmptyState
            title="Annonces introuvables"
            description="Les références fournies n'existent plus ou ne sont plus disponibles."
            ctaLabel="Retour aux annonces"
            ctaHref="/annonces"
          />
        </div>
      </div>
    )
  }

  // ── Enrich with score (any[] to match AnnoncesClient convention)
  const enriched: Annonce[] = annonces.map(a => ({
    ...a,
    _score: profil ? calculerScore(a, profil) : null,
  }))

  // ── Compute "best" per metric for highlighting
  const prix = enriched.map(a => (typeof a.prix === "number" ? a.prix : null))
  const surfaces = enriched.map(a => (typeof a.surface === "number" ? a.surface : null))
  const scores = enriched.map(a => (typeof a._score === "number" ? a._score : null))
  const dpes = enriched.map(a => (typeof a.dpe === "string" ? a.dpe.toUpperCase() : null))

  const minPrix = prix.filter((n): n is number => n !== null).reduce((a, b) => Math.min(a, b), Infinity)
  const maxSurface = surfaces.filter((n): n is number => n !== null).reduce((a, b) => Math.max(a, b), -Infinity)
  const maxScore = scores.filter((n): n is number => n !== null).reduce((a, b) => Math.max(a, b), -Infinity)
  const bestDpe = dpes
    .filter((s): s is string => s !== null && /^[A-G]$/.test(s))
    .reduce<string | null>((best, d) => (best === null || d.localeCompare(best) < 0 ? d : best), null)

  return (
    <div style={{ background: km.beige, minHeight: "calc(100vh - 72px)", padding: isMobile ? "24px 16px 60px" : "40px 32px 80px", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: isMobile ? 22 : 32 }}>
          <KMEyebrow style={{ marginBottom: 8 }}>Comparateur</KMEyebrow>
          <KMHeading as="h1" size={isMobile ? 28 : 40} style={{ marginBottom: 8 }}>
            {enriched.length} logements côte à côte
          </KMHeading>
          <p style={{ fontSize: 14, color: km.muted, margin: 0 }}>
            Les meilleures valeurs sont signalées par un badge.{" "}
            <Link href="/annonces" style={{ color: km.ink, textDecoration: "underline", textUnderlineOffset: 3 }}>
              Retour à la liste
            </Link>
          </p>
        </div>

        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : `repeat(${Math.max(ids.length, 2)}, 1fr)`, gap: 16 }}>
            {ids.map(id => (
              <div key={id} style={{ background: km.white, border: `1px solid ${km.line}`, borderRadius: 20, height: 420, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }} />
            ))}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : `repeat(${enriched.length}, minmax(0, 1fr))`,
              gap: 16,
              alignItems: "stretch",
            }}
          >
            {enriched.map((a, idx) => {
              const photo0 = Array.isArray(a.photos) && a.photos.length > 0 ? a.photos[0] : null
              const gradient = GRADIENTS[a.id % GRADIENTS.length]
              const isCheapest = prix[idx] !== null && prix[idx] === minPrix && minPrix !== Infinity
              const isBiggest = surfaces[idx] !== null && surfaces[idx] === maxSurface && maxSurface !== -Infinity
              const isBestDpe = dpes[idx] !== null && bestDpe !== null && dpes[idx] === bestDpe
              const isBestScore = scores[idx] !== null && scores[idx] === maxScore && maxScore !== -Infinity && profil

              const amenities: string[] = []
              if (a.meuble === true) amenities.push("Meublé")
              if (a.balcon === true) amenities.push("Balcon")
              if (a.terrasse === true) amenities.push("Terrasse")
              if (a.jardin === true) amenities.push("Jardin")
              if (a.ascenseur === true) amenities.push("Ascenseur")
              if (a.parking === true) amenities.push("Parking")
              if (a.fibre === true) amenities.push("Fibre")
              if (a.cave === true) amenities.push("Cave")

              return (
                <article
                  key={a.id}
                  style={{
                    background: km.white,
                    border: `1px solid ${km.line}`,
                    borderRadius: 20,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
                  }}
                >
                  {/* Photo */}
                  <div style={{ position: "relative", aspectRatio: "16 / 10", background: photo0 ? "#000" : gradient }}>
                    {photo0 ? (
                      <Image src={photo0} alt={a.titre || "Photo logement"} fill sizes="(max-width: 768px) 100vw, 400px" style={{ objectFit: "cover" }} />
                    ) : (
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.55)", fontSize: 13 }}>
                        Pas de photo
                      </div>
                    )}
                    {isBestScore && (
                      <span style={{ position: "absolute", top: 12, left: 12, background: km.ink, color: km.white, padding: "4px 12px", borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase" }}>
                        Meilleur match
                      </span>
                    )}
                  </div>

                  {/* Body rows */}
                  <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
                    <div>
                      <KMEyebrow>{(a.ville || "").toString().toUpperCase()}{a.quartier ? ` · ${a.quartier}` : ""}</KMEyebrow>
                      <h2 style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.3, margin: "4px 0 0", color: km.ink, minHeight: 44 }}>
                        {a.titre || "Logement"}
                      </h2>
                    </div>

                    <Row label="Loyer">
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 22, fontWeight: 500, color: km.ink, letterSpacing: "-0.3px" }}>
                          {a.prix?.toLocaleString("fr-FR") ?? "—"} €
                          <span style={{ fontSize: 12, fontWeight: 400, color: km.muted }}> /mois</span>
                        </span>
                        {isCheapest && enriched.length > 1 && <Badge>Moins cher</Badge>}
                      </div>
                      <span style={{ fontSize: 11, color: km.muted, marginTop: 2, display: "block" }}>
                        {a.charges == null || a.charges === 0
                          ? "Charges comprises"
                          : `+ ${a.charges.toLocaleString("fr-FR")} € de charges`}
                      </span>
                    </Row>

                    <Row label="Surface">
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14, color: km.ink }}>
                          {a.surface != null ? `${a.surface} m²` : "—"}
                        </span>
                        {isBiggest && enriched.length > 1 && <Badge>Plus grand</Badge>}
                      </div>
                    </Row>

                    <Row label="Pièces">
                      <span style={{ fontSize: 14, color: km.ink }}>
                        {a.pieces != null ? `${a.pieces} ${a.pieces > 1 ? "pièces" : "pièce"}` : "—"}
                        {a.chambres != null ? ` · ${a.chambres} ch.` : ""}
                      </span>
                    </Row>

                    <Row label="Étage">
                      <span style={{ fontSize: 14, color: km.ink }}>
                        {a.etage != null ? (a.etage === 0 ? "RDC" : `Étage ${a.etage}`) : "—"}
                      </span>
                    </Row>

                    <Row label="Dépôt de garantie">
                      <span style={{ fontSize: 14, color: km.ink }}>
                        {a.caution != null && a.caution > 0
                          ? `${Number(a.caution).toLocaleString("fr-FR")} €`
                          : a.prix != null
                            ? `${Number(a.prix).toLocaleString("fr-FR")} €`
                            : "—"}
                      </span>
                    </Row>

                    <Row label="Disponibilité">
                      <span style={{ fontSize: 13, color: km.ink }}>
                        {a.dispo || "Non renseigné"}
                      </span>
                    </Row>

                    <Row label="DPE">
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {a.dpe ? <KMDPE value={a.dpe} /> : <span style={{ fontSize: 14, color: km.muted }}>—</span>}
                        {isBestDpe && enriched.length > 1 && <Badge>Meilleur DPE</Badge>}
                      </div>
                    </Row>

                    {profil && a._score !== null && (
                      <Row label="Compatibilité">
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <KMMatchRing score={Math.round(a._score / 10)} size={48} />
                        </div>
                      </Row>
                    )}

                    <Row label="Équipements">
                      {amenities.length === 0 ? (
                        <span style={{ fontSize: 13, color: km.muted }}>—</span>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {amenities.map(x => <KMChip key={x}>{x}</KMChip>)}
                        </div>
                      )}
                    </Row>

                    <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8, paddingTop: 10 }}>
                      <Link
                        href={`/annonces/${a.id}`}
                        style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          background: km.ink, color: km.white, textDecoration: "none",
                          padding: "11px 18px", borderRadius: 999,
                          fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px",
                        }}
                      >
                        Voir la fiche
                      </Link>
                      <Link
                        href={`/messages?annonce=${a.id}`}
                        style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          background: km.white, color: km.ink, border: `1px solid ${km.ink}`, textDecoration: "none",
                          padding: "10px 18px", borderRadius: 999,
                          fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px",
                        }}
                      >
                        Candidater
                      </Link>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: `1px solid ${km.line}`, paddingTop: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.4px", marginBottom: 4 }}>
        {label}
      </div>
      <div>{children}</div>
    </div>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      background: km.successBg, color: km.successText,
      border: `1px solid ${km.successLine}`,
      padding: "3px 10px", borderRadius: 999,
      fontSize: 10, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase",
    }}>
      {children}
    </span>
  )
}
