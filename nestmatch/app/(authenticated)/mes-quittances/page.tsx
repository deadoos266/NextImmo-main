"use client"
import { useSession } from "next-auth/react"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../../lib/supabase"
import { useResponsive } from "../../hooks/useResponsive"
import { km, KMPageHeader } from "../../components/ui/km"
import { storage } from "@/lib/storage"

// V88.4 — Quittance importée par le locataire (historique perso)
type QuittancePerso = {
  id: number
  annonce_id: number | null
  mois: string
  montant: number | null
  loyer_hc: number | null
  charges: number | null
  bailleur_nom: string | null
  adresse_bien: string | null
  note: string | null
  fichier_url: string
  fichier_nom: string | null
  fichier_type: "pdf" | "image"
  created_at: string
}

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

  // V88.4 — Quittances perso (historique uploadé par le locataire)
  const [perso, setPerso] = useState<QuittancePerso[]>([])
  const [persoLoading, setPersoLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)

  async function refreshPerso() {
    try {
      const r = await fetch("/api/quittances/perso", { cache: "no-store" })
      const j = await r.json()
      if (j?.ok) setPerso(j.quittances || [])
    } catch (err) {
      console.warn("[mes-quittances] fetch perso failed", err)
    } finally {
      setPersoLoading(false)
    }
  }

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
      await refreshPerso()
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

        {/* V88.4 — Section archive perso (historique avant KeyMatch) */}
        <PersoSection
          email={session?.user?.email?.toLowerCase() || ""}
          perso={perso}
          loading={persoLoading}
          showUpload={showUpload}
          setShowUpload={setShowUpload}
          isMobile={isMobile}
          onRefresh={refreshPerso}
          loyersExistent={loyers.length > 0}
        />
      </div>
    </main>
  )
}

// ─── V88.4 — Section quittances perso ──────────────────────────────────────
type PersoSectionProps = {
  email: string
  perso: QuittancePerso[]
  loading: boolean
  showUpload: boolean
  setShowUpload: (b: boolean) => void
  isMobile: boolean
  onRefresh: () => Promise<void>
  loyersExistent: boolean
}

function PersoSection({ email, perso, loading, showUpload, setShowUpload, isMobile, onRefresh, loyersExistent }: PersoSectionProps) {
  if (loading || !email) return null

  return (
    <section style={{ marginTop: 36 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase" as const, letterSpacing: "1.4px", margin: "0 0 6px" }}>
            Archive perso
          </p>
          <h2 style={{ fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: isMobile ? 22 : 26, color: km.ink, margin: "0 0 6px", letterSpacing: "-0.3px" }}>
            Vos anciennes quittances
          </h2>
          <p style={{ fontSize: 13, color: km.muted, margin: 0, lineHeight: 1.55, maxWidth: 560 }}>
            {loyersExistent
              ? "Importez vos quittances reçues avant KeyMatch (loyers passés, ancien logement). Visible uniquement par vous."
              : "Pas encore de quittance KeyMatch ? Importez ici vos anciennes quittances pour conserver votre historique de paiement."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowUpload(!showUpload)}
          style={{
            background: showUpload ? km.beige : km.ink,
            color: showUpload ? km.ink : km.white,
            border: showUpload ? `1px solid ${km.line}` : "none",
            borderRadius: 999,
            padding: "10px 20px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            textTransform: "uppercase" as const,
            letterSpacing: "0.4px",
            flexShrink: 0,
          }}
        >
          {showUpload ? "Annuler" : "+ Importer"}
        </button>
      </div>

      {showUpload && (
        <PersoUploadForm
          email={email}
          isMobile={isMobile}
          onDone={async () => {
            await onRefresh()
            setShowUpload(false)
          }}
        />
      )}

      {perso.length === 0 && !showUpload && (
        <div style={{ background: km.white, borderRadius: 18, padding: "28px 22px", border: `1px dashed ${km.line}`, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 13, color: km.muted, lineHeight: 1.55 }}>
            Aucune quittance perso importée. Cliquez sur <strong style={{ color: km.ink }}>+ Importer</strong> pour ajouter un PDF ou une photo.
          </p>
        </div>
      )}

      {perso.length > 0 && (
        <div style={{ background: km.white, borderRadius: 18, border: `1px solid ${km.line}`, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
          {perso.map((q, i) => {
            const isLast = i === perso.length - 1
            const total = (Number(q.montant) || (Number(q.loyer_hc || 0) + Number(q.charges || 0))) || 0
            return (
              <div
                key={q.id}
                style={{
                  padding: isMobile ? "14px 16px" : "16px 22px",
                  borderBottom: isLast ? "none" : `1px solid ${km.line}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: isMobile ? "wrap" : "nowrap",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: km.ink, textTransform: "capitalize" as const }}>
                    {formatPeriode(q.mois)}
                    {q.fichier_type === "image" && (
                      <span style={{ marginLeft: 8, fontSize: 9.5, padding: "2px 7px", borderRadius: 999, background: km.beige, color: km.muted, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.7px", verticalAlign: "middle" }}>
                        Photo
                      </span>
                    )}
                  </div>
                  {(q.bailleur_nom || q.adresse_bien) && (
                    <div style={{ fontSize: 11, color: km.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {[q.bailleur_nom, q.adresse_bien].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  {q.note && (
                    <div style={{ fontSize: 11.5, color: km.muted, marginTop: 4, fontStyle: "italic", lineHeight: 1.45 }}>
                      « {q.note} »
                    </div>
                  )}
                </div>
                {total > 0 && (
                  <div style={{ fontSize: 14, fontWeight: 700, color: km.ink, fontVariantNumeric: "tabular-nums" as const, flexShrink: 0 }}>
                    {total.toLocaleString("fr-FR")} €
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <a
                    href={q.fichier_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ background: km.white, color: km.ink, border: `1px solid ${km.line}`, borderRadius: 999, padding: "7px 14px", fontSize: 11, fontWeight: 600, textDecoration: "none", fontFamily: "inherit" }}
                  >
                    Voir
                  </a>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm("Supprimer cette quittance perso ?")) return
                      const r = await fetch(`/api/quittances/perso?id=${q.id}`, { method: "DELETE" })
                      if (r.ok) await onRefresh()
                      else alert("Suppression échouée.")
                    }}
                    style={{ background: "transparent", color: km.muted, border: `1px solid ${km.line}`, borderRadius: 999, padding: "7px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                    aria-label="Supprimer"
                  >
                    ×
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ─── V88.4 — Form upload quittance perso ──────────────────────────────────
function PersoUploadForm({ email, isMobile, onDone }: { email: string; isMobile: boolean; onDone: () => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [mois, setMois] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  })
  const [montant, setMontant] = useState("")
  const [bailleur, setBailleur] = useState("")
  const [adresse, setAdresse] = useState("")
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!file) { setError("Sélectionnez un fichier."); return }
    if (!/^\d{4}-\d{2}$/.test(mois)) { setError("Mois invalide (YYYY-MM)."); return }
    if (file.size > 15 * 1024 * 1024) { setError("Fichier > 15 MB."); return }
    const type = file.type === "application/pdf" ? "pdf" : (file.type.startsWith("image/") ? "image" : null)
    if (!type) { setError("Seuls PDF, JPG, PNG sont acceptés."); return }

    setSubmitting(true)
    try {
      // Upload Supabase Storage : bucket `quittances`, path = email/perso-<ts>.<ext>
      const folder = email.replace(/[^a-z0-9]/gi, "_").toLowerCase()
      const ext = type === "pdf" ? "pdf" : (file.name.match(/\.(jpe?g|png)$/i)?.[1].toLowerCase() || "jpg")
      const path = `${folder}/perso-${Date.now()}.${ext}`
      const { error: upErr } = await storage.from("quittances")
        .upload(path, file, { contentType: file.type, upsert: false })
      if (upErr) {
        setError(`Upload échoué : ${upErr.message}`)
        return
      }
      const { data: pub } = storage.from("quittances").getPublicUrl(path)
      const fichierUrl = pub?.publicUrl
      if (!fichierUrl) { setError("URL fichier introuvable."); return }

      const res = await fetch("/api/quittances/perso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fichier_url: fichierUrl,
          fichier_nom: file.name.slice(0, 200),
          fichier_taille_bytes: file.size,
          fichier_type: type,
          mois,
          montant: montant ? Number(montant) : null,
          bailleur_nom: bailleur.trim() || null,
          adresse_bien: adresse.trim() || null,
          note: note.trim() || null,
        }),
      })
      const j = await res.json()
      if (!res.ok || !j?.ok) {
        setError(j?.error || "Échec de l'ajout")
        return
      }
      await onDone()
    } catch (err) {
      console.error("[mes-quittances] upload perso failed", err)
      setError(err instanceof Error ? err.message : "Erreur inconnue")
    } finally {
      setSubmitting(false)
    }
  }

  const labelSx: React.CSSProperties = {
    display: "block",
    fontSize: 10,
    fontWeight: 700,
    color: km.ink,
    textTransform: "uppercase" as const,
    letterSpacing: "0.4px",
    marginBottom: 6,
  }
  const inputSx: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${km.line}`,
    background: km.white,
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 13,
    color: km.ink,
    fontFamily: "inherit",
    outline: "none",
  }

  return (
    <form onSubmit={onSubmit} style={{ background: km.white, border: `1px solid ${km.line}`, borderRadius: 18, padding: isMobile ? 18 : 22, marginBottom: 18, display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <label style={labelSx}>Fichier (PDF, JPG, PNG)</label>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: 10,
            border: `1.5px dashed ${file ? "#15803d" : km.line}`,
            borderRadius: 12,
            background: file ? "#F0FAEE" : km.white,
            color: km.ink,
            fontFamily: "inherit",
            fontSize: 12.5,
          }}
        />
        {file && (
          <p style={{ fontSize: 11, color: "#15803d", margin: "6px 0 0", fontWeight: 600 }}>
            ✓ {file.name} ({Math.round(file.size / 1024)} KB)
          </p>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelSx}>Mois</label>
          <input style={inputSx} type="month" value={mois} onChange={(e) => setMois(e.target.value)} required />
        </div>
        <div>
          <label style={labelSx}>Montant total (€)</label>
          <input style={inputSx} type="number" min={0} max={50000} step={0.01} value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="800" />
        </div>
        <div style={{ gridColumn: isMobile ? "span 2" : "auto" }}>
          <label style={labelSx}>Bailleur</label>
          <input style={inputSx} type="text" maxLength={200} value={bailleur} onChange={(e) => setBailleur(e.target.value)} placeholder="M. Durand" />
        </div>
      </div>

      <div>
        <label style={labelSx}>Adresse du bien (optionnel)</label>
        <input style={inputSx} type="text" maxLength={300} value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="12 rue Saint-Antoine, Paris" />
      </div>

      <div>
        <label style={labelSx}>Note libre (optionnel)</label>
        <textarea
          style={{ ...inputSx, resize: "vertical", lineHeight: 1.55 }}
          rows={2}
          maxLength={600}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ex : payé par virement le 5 du mois"
        />
      </div>

      {error && (
        <div style={{ background: km.errBg, border: `1px solid ${km.errLine}`, color: km.errText, padding: "10px 14px", borderRadius: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          type="submit"
          disabled={submitting}
          style={{
            background: submitting ? km.muted : km.ink,
            color: km.white,
            border: "none",
            borderRadius: 999,
            padding: "10px 22px",
            fontSize: 12,
            fontWeight: 700,
            cursor: submitting ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            textTransform: "uppercase" as const,
            letterSpacing: "0.4px",
          }}
        >
          {submitting ? "Envoi…" : "Ajouter"}
        </button>
      </div>
    </form>
  )
}
