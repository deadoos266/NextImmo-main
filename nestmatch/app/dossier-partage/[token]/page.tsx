import Link from "next/link"
import { notFound } from "next/navigation"
import { verifyDossierToken } from "../../../lib/dossierToken"
import { supabaseAdmin } from "../../../lib/supabase-server"
import { displayName } from "../../../lib/privacy"
import { BRAND } from "../../../lib/brand"
import { formatNomComplet } from "../../../lib/profilHelpers"
import { hashToken } from "../../../lib/dossierAccessLog"
import AccessLogPing from "./AccessLogPing"

export const metadata = {
  title: "Dossier locataire partagé",
  robots: { index: false, follow: false },
}

const DOC_LABELS: Record<string, string> = {
  identite: "Pièce d'identité",
  bulletins: "Bulletins de salaire",
  avis_imposition: "Avis d'imposition",
  contrat: "Contrat de travail",
  quittances: "Quittances de loyer",
  identite_garant: "Pièce d'identité du garant",
  bulletins_garant: "Bulletins de salaire du garant",
  avis_garant: "Avis d'imposition du garant",
  certificat_scolarite: "Certificat de scolarité",
  attestation_caf: "Attestation CAF",
  attestation_assurance: "Attestation d'assurance habitation",
  attestation_employeur: "Attestation employeur",
}

const T = {
  bg: "#F7F4EF",
  white: "#fff",
  ink: "#111",
  line: "#EAE6DF",
  hairline: "#F0EAE0",
  meta: "#666",
  soft: "#8a8477",
  mutedBg: "#FAF8F3",
  muted: "#9a958a",
}

const IMG_EXT = /\.(jpe?g|png|webp|gif|avif|heic)$/i
const PDF_EXT = /\.pdf$/i

function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const last = u.pathname.split("/").pop() || "fichier"
    return decodeURIComponent(last)
  } catch {
    return "fichier"
  }
}

export default async function DossierPartage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const valid = verifyDossierToken(token)
  if (!valid) return notFound()

  // Check révocation en DB (graceful si migration 021 pas encore appliquée) + bump consultation_count
  const th = hashToken(token)
  const { data: shareRow, error: shareErr } = await supabaseAdmin
    .from("dossier_share_tokens")
    .select("id, revoked_at, consultation_count")
    .eq("token_hash", th)
    .maybeSingle()
  if (shareErr && shareErr.code !== "42P01") {
    console.error("[dossier-partage/page] revoked check error:", shareErr.message)
  }
  if (shareRow?.revoked_at) return notFound()
  if (shareRow?.id) {
    // fire-and-forget : bump consultation_count à chaque rendu (le page load compte comme une consultation)
    void supabaseAdmin
      .from("dossier_share_tokens")
      .update({
        consultation_count: (shareRow.consultation_count ?? 0) + 1,
        last_consulted_at: new Date().toISOString(),
      })
      .eq("id", shareRow.id)
  }

  const { data: profil } = await supabaseAdmin
    .from("profils")
    .select("*")
    .eq("email", valid.email.toLowerCase())
    .single()
  if (!profil) return notFound()

  const name = displayName(valid.email, formatNomComplet(profil) || profil.nom)
  const docs = (profil.dossier_docs || {}) as Record<string, string[] | string>
  const expiresFull = new Date(valid.exp).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })

  // Pièces complémentaires libres (graceful si colonne absente).
  type LibreEntry = { url: string; label: string; uploaded_at?: string }
  const docsLibresRaw: unknown = profil.dossier_docs_libres
  const docsLibres: LibreEntry[] = Array.isArray(docsLibresRaw)
    ? (docsLibresRaw as unknown[]).filter((x): x is LibreEntry =>
        typeof x === "object" && x !== null
        && typeof (x as LibreEntry).url === "string"
        && typeof (x as LibreEntry).label === "string"
      ).slice(0, 5)
    : []

  const section: React.CSSProperties = {
    background: T.white,
    borderRadius: 20,
    padding: 28,
    marginBottom: 16,
    border: `1px solid ${T.line}`,
  }
  const eyebrow: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "1.8px",
    textTransform: "uppercase",
    color: T.soft,
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  }
  const eyebrowBar: React.CSSProperties = { flex: 1, height: 1, background: T.hairline }
  const h2: React.CSSProperties = {
    fontSize: 22,
    fontWeight: 500,
    fontStyle: "italic",
    letterSpacing: "-0.4px",
    margin: "0 0 14px",
    color: T.ink,
    lineHeight: 1.15,
  }
  const row: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    padding: "10px 0",
    fontSize: 14,
    borderBottom: `1px solid ${T.hairline}`,
    gap: 16,
  }
  const rowLabel: React.CSSProperties = { color: T.meta, fontSize: 13 }
  const rowValue: React.CSSProperties = { fontWeight: 500, color: T.ink, textAlign: "right" }

  return (
    <main style={{ minHeight: "100vh", background: T.bg, fontFamily: "'DM Sans', sans-serif", padding: "40px 20px" }}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>

        {/* Bandeau expiration + lecture seule */}
        <div style={{ background: T.white, border: `1px solid ${T.line}`, borderRadius: 14, padding: "12px 16px", marginBottom: 20, fontSize: 12, color: T.meta, lineHeight: 1.55, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: T.ink }} />
          <span><strong style={{ color: T.ink, fontWeight: 600 }}>Dossier locataire partagé.</strong> Lien valide jusqu&apos;au {expiresFull}. Accès en lecture seule, conforme RGPD (logs anonymisés, purgés à 90 jours).</span>
        </div>

        {/* Hero */}
        <div style={{ ...section, padding: "36px 32px" }}>
          <div style={eyebrow}>
            <span>Dossier locataire</span>
            <div style={eyebrowBar} />
            <span style={{ letterSpacing: "1.5px" }}>01</span>
          </div>
          <h1 style={{ fontSize: 44, fontWeight: 500, fontStyle: "italic", letterSpacing: "-0.8px", margin: 0, color: T.ink, lineHeight: 1.05 }}>{name}</h1>
          <p style={{ fontSize: 13, color: T.meta, margin: "14px 0 0", lineHeight: 1.6 }}>
            Les informations ci-dessous correspondent strictement aux pièces autorisées par le décret n° 2015-1437 et l&apos;article 22-2 de la loi n° 89-462.
          </p>
        </div>

        <AccessLogPing token={token} />

        {/* 02 — Identité */}
        <div style={section}>
          <div style={eyebrow}>
            <span>Identité &amp; situation</span>
            <div style={eyebrowBar} />
            <span style={{ letterSpacing: "1.5px" }}>02</span>
          </div>
          <h2 style={h2}>Qui est le candidat</h2>
          <div style={row}><span style={rowLabel}>Date de naissance</span><span style={rowValue}>{profil.date_naissance ? new Date(profil.date_naissance).toLocaleDateString("fr-FR") : "—"}</span></div>
          <div style={row}><span style={rowLabel}>Nationalité</span><span style={rowValue}>{profil.nationalite || "—"}</span></div>
          <div style={row}><span style={rowLabel}>Situation familiale</span><span style={rowValue}>{profil.situation_familiale || "—"}</span></div>
          <div style={row}><span style={rowLabel}>Enfants à charge</span><span style={rowValue}>{profil.nb_enfants ?? 0}</span></div>
          <div style={row}><span style={rowLabel}>Nombre d&apos;occupants prévus</span><span style={rowValue}>{profil.nb_occupants || "—"}</span></div>
          <div style={{ ...row, borderBottom: "none" }}><span style={rowLabel}>Profil</span><span style={rowValue}>{profil.profil_locataire || "—"}</span></div>
        </div>

        {/* 03 — Pro */}
        <div style={section}>
          <div style={eyebrow}>
            <span>Situation professionnelle</span>
            <div style={eyebrowBar} />
            <span style={{ letterSpacing: "1.5px" }}>03</span>
          </div>
          <h2 style={h2}>Revenus et employeur</h2>
          <div style={row}><span style={rowLabel}>Statut</span><span style={rowValue}>{profil.situation_pro || "—"}</span></div>
          {profil.employeur_nom && <div style={row}><span style={rowLabel}>Employeur</span><span style={rowValue}>{profil.employeur_nom}</span></div>}
          {profil.date_embauche && <div style={row}><span style={rowLabel}>Date d&apos;embauche</span><span style={rowValue}>{new Date(profil.date_embauche).toLocaleDateString("fr-FR")}</span></div>}
          <div style={{ ...row, borderBottom: "none" }}><span style={rowLabel}>Revenus mensuels nets</span><span style={rowValue}>{profil.revenus_mensuels ? `${Number(profil.revenus_mensuels).toLocaleString("fr-FR")} €` : "—"}</span></div>
        </div>

        {/* 04 — Logement & garanties */}
        <div style={section}>
          <div style={eyebrow}>
            <span>Logement &amp; garanties</span>
            <div style={eyebrowBar} />
            <span style={{ letterSpacing: "1.5px" }}>04</span>
          </div>
          <h2 style={h2}>Contexte et garants</h2>
          <div style={row}><span style={rowLabel}>Statut actuel</span><span style={rowValue}>{profil.logement_actuel_type || "—"}</span></div>
          {profil.logement_actuel_ville && <div style={row}><span style={rowLabel}>Ville actuelle</span><span style={rowValue}>{profil.logement_actuel_ville}</span></div>}
          <div style={row}><span style={rowLabel}>Garant</span><span style={rowValue}>{profil.garant ? (profil.type_garant || "Oui") : "Non"}</span></div>
          <div style={row}><span style={rowLabel}>APL</span><span style={rowValue}>{profil.a_apl ? "Oui" : "Non"}</span></div>
          <div style={{ ...row, borderBottom: "none" }}><span style={rowLabel}>Mobilité pro (Visale)</span><span style={rowValue}>{profil.mobilite_pro ? "Oui" : "Non"}</span></div>
        </div>

        {/* 05 — Présentation (si renseignée) */}
        {profil.presentation && (
          <div style={section}>
            <div style={eyebrow}>
              <span>Le mot du candidat</span>
              <div style={eyebrowBar} />
              <span style={{ letterSpacing: "1.5px" }}>05</span>
            </div>
            <h2 style={h2}>Présentation</h2>
            <p style={{ fontSize: 15, color: T.ink, lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap", fontWeight: 400 }}>{profil.presentation}</p>
          </div>
        )}

        {/* Critères de recherche */}
        <div style={section}>
          <div style={eyebrow}>
            <span>Critères de recherche</span>
            <div style={eyebrowBar} />
            <span style={{ letterSpacing: "1.5px" }}>{profil.presentation ? "06" : "05"}</span>
          </div>
          <h2 style={h2}>Ce que le candidat cherche</h2>
          <div style={row}><span style={rowLabel}>Ville souhaitée</span><span style={rowValue}>{profil.ville_souhaitee || "—"}</span></div>
          <div style={row}><span style={rowLabel}>Budget max</span><span style={rowValue}>{profil.budget_max ? `${profil.budget_max} €/mois` : "—"}</span></div>
          <div style={row}><span style={rowLabel}>Surface min</span><span style={rowValue}>{profil.surface_min ? `${profil.surface_min} m²` : "—"}</span></div>
          <div style={{ ...row, borderBottom: "none" }}><span style={rowLabel}>Pièces min</span><span style={rowValue}>{profil.pieces_min || "—"}</span></div>
        </div>

        {/* Dossier complet ZIP */}
        <div style={{ background: T.ink, color: T.white, borderRadius: 20, padding: 28, marginBottom: 16, border: `1px solid ${T.ink}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.8px", textTransform: "uppercase", color: "#B8B4AC" }}>
              Dossier complet
            </span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.15)" }} />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 500, fontStyle: "italic", letterSpacing: "-0.4px", margin: "0 0 10px", color: T.white, lineHeight: 1.15 }}>
            Télécharger le dossier en un clic
          </h2>
          <p style={{ fontSize: 13, color: "#D8D4CC", lineHeight: 1.6, margin: "0 0 18px" }}>
            Archive .zip contenant le récapitulatif en PDF et l&apos;ensemble des pièces justificatives organisées par catégorie.
          </p>
          <a
            href={`/api/dossier-partage/${token}/zip`}
            download
            style={{ display: "inline-block", background: T.white, color: T.ink, border: "none", borderRadius: 999, padding: "11px 22px", fontWeight: 600, fontSize: 13, textDecoration: "none", letterSpacing: "0.3px", fontFamily: "inherit" }}
          >
            Télécharger le dossier (.zip)
          </a>
        </div>

        {/* Documents déposés */}
        <div style={section}>
          <div style={eyebrow}>
            <span>Pièces justificatives</span>
            <div style={eyebrowBar} />
            <span style={{ letterSpacing: "1.5px" }}>{profil.presentation ? "07" : "06"}</span>
          </div>
          <h2 style={h2}>Documents déposés</h2>
          <p style={{ fontSize: 12, color: T.meta, margin: "0 0 16px", lineHeight: 1.6 }}>
            Chaque pièce est servie via une URL signée à durée limitée, alignée sur l&apos;expiration de ce lien. Les liens ne peuvent pas être réutilisés hors de cette page.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {Object.keys(DOC_LABELS).map(key => {
              const val = docs[key]
              const urls = Array.isArray(val) ? val : (val ? [val as string] : [])
              if (urls.length === 0) {
                return (
                  <div key={key} style={{ padding: 16, border: `1px solid ${T.hairline}`, borderRadius: 14, background: T.mutedBg, opacity: 0.6 }}>
                    <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: T.soft, margin: 0, fontWeight: 600 }}>{DOC_LABELS[key]}</p>
                    <p style={{ fontSize: 13, color: T.muted, margin: "6px 0 0", fontStyle: "italic" }}>Non fourni</p>
                  </div>
                )
              }
              return urls.map((u, idx) => {
                const fname = filenameFromUrl(u)
                const isImg = IMG_EXT.test(fname)
                const isPdf = PDF_EXT.test(fname)
                const viewHref = `/api/dossier-partage/${token}/file/${key}/${idx}`
                return (
                  <div key={`${key}-${idx}`} style={{ border: `1px solid ${T.line}`, borderRadius: 14, background: T.white, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    <div style={{ aspectRatio: "16 / 10", background: T.mutedBg, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", borderBottom: `1px solid ${T.hairline}` }}>
                      {isImg ? (
                        // Les thumbnails passent par l'URL publique Supabase (lecture seule, bucket non confidentiel pour aperçu).
                        // L'ouverture "Voir" repasse obligatoirement par le handler HMAC qui émet une signed URL TTL bornée.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u} alt={DOC_LABELS[key]} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <svg width="44" height="56" viewBox="0 0 44 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                          <path d="M4 4h22l14 14v34a0 0 0 0 1 0 0H4V4z" stroke={T.soft} strokeWidth="1.5" fill="#fff"/>
                          <path d="M26 4v14h14" stroke={T.soft} strokeWidth="1.5" fill="none"/>
                          <text x="22" y="44" textAnchor="middle" fontFamily="DM Sans" fontSize="9" fontWeight="600" fill={T.ink}>{isPdf ? "PDF" : "DOC"}</text>
                        </svg>
                      )}
                    </div>
                    <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                      <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.4, color: T.soft, margin: 0, fontWeight: 700 }}>{DOC_LABELS[key]}</p>
                      <p style={{ fontSize: 13, color: T.ink, margin: 0, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fname}</p>
                      {urls.length > 1 && <p style={{ fontSize: 11, color: T.meta, margin: 0 }}>Pièce {idx + 1} / {urls.length}</p>}
                      <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 4 }}>
                        <a href={viewHref} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 600, padding: "8px 10px", borderRadius: 999, background: T.ink, color: T.white, textDecoration: "none", letterSpacing: "0.3px" }}>
                          Voir
                        </a>
                        <a href={viewHref} download={fname} style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 600, padding: "8px 10px", borderRadius: 999, background: T.white, color: T.ink, border: `1px solid ${T.line}`, textDecoration: "none", letterSpacing: "0.3px" }}>
                          Télécharger
                        </a>
                      </div>
                    </div>
                  </div>
                )
              })
            })}
          </div>
        </div>

        {/* Pièces complémentaires libres (si fournies) */}
        {docsLibres.length > 0 && (
          <div style={section}>
            <div style={eyebrow}>
              <span>Pièces complémentaires</span>
              <div style={eyebrowBar} />
              <span style={{ letterSpacing: "1.5px" }}>{profil.presentation ? "08" : "07"}</span>
            </div>
            <h2 style={h2}>Justificatifs additionnels fournis par le candidat</h2>
            <p style={{ fontSize: 12, color: T.meta, margin: "0 0 16px", lineHeight: 1.6 }}>
              Documents nommés et fournis librement par le candidat (attestation d&apos;hébergement, lettre de recommandation, etc.).
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              {docsLibres.map((d, idx) => {
                const fname = filenameFromUrl(d.url)
                const isImg = IMG_EXT.test(fname)
                const isPdf = PDF_EXT.test(fname)
                const viewHref = `/api/dossier-partage/${token}/file/libres/${idx}`
                return (
                  <div key={idx} style={{ border: `1px solid ${T.line}`, borderRadius: 14, background: T.white, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    <div style={{ aspectRatio: "16 / 10", background: T.mutedBg, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", borderBottom: `1px solid ${T.hairline}` }}>
                      {isImg ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={d.url} alt={d.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <svg width="44" height="56" viewBox="0 0 44 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                          <path d="M4 4h22l14 14v34a0 0 0 0 1 0 0H4V4z" stroke={T.soft} strokeWidth="1.5" fill="#fff"/>
                          <path d="M26 4v14h14" stroke={T.soft} strokeWidth="1.5" fill="none"/>
                          <text x="22" y="44" textAnchor="middle" fontFamily="DM Sans" fontSize="9" fontWeight="600" fill={T.ink}>{isPdf ? "PDF" : "DOC"}</text>
                        </svg>
                      )}
                    </div>
                    <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                      <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.4, color: T.soft, margin: 0, fontWeight: 700 }}>Complémentaire</p>
                      <p style={{ fontSize: 13, color: T.ink, margin: 0, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</p>
                      <p style={{ fontSize: 11, color: T.meta, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fname}</p>
                      <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 4 }}>
                        <a href={viewHref} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 600, padding: "8px 10px", borderRadius: 999, background: T.ink, color: T.white, textDecoration: "none", letterSpacing: "0.3px" }}>
                          Voir
                        </a>
                        <a href={viewHref} download={fname} style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 600, padding: "8px 10px", borderRadius: 999, background: T.white, color: T.ink, border: `1px solid ${T.line}`, textDecoration: "none", letterSpacing: "0.3px" }}>
                          Télécharger
                        </a>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <p style={{ fontSize: 11, color: T.soft, textAlign: "center", marginTop: 24, lineHeight: 1.6 }}>
          Lien de partage sécurisé · <Link href="/" style={{ color: T.meta, textDecoration: "none", borderBottom: `1px solid ${T.hairline}` }}>{BRAND.name}</Link>
        </p>
      </div>
    </main>
  )
}
