"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import { supabase } from "../../lib/supabase"
import { useRole } from "../providers"
import { Suspense } from "react"
import { useResponsive } from "../hooks/useResponsive"
import { displayName } from "../../lib/privacy"
import { formatNomComplet } from "../../lib/profilHelpers"
import { annulerVisite, STATUT_VISITE_STYLE as STATUT_VISITE } from "../../lib/visitesHelpers"
import { postNotif } from "../../lib/notificationsClient"
import MessageSkeleton from "../components/ui/MessageSkeleton"
import Modal from "../components/ui/Modal"

// Lazy : modals/dialogs ouverts à la demande (1-2× / session). Économie
// estimée ~10-15 kB sur First Load JS de /messages (cible 270 kB,
// baseline 288 kB).
const AnnulerVisiteDialog = dynamic(() => import("../components/AnnulerVisiteDialog"), { ssr: false })
const ProposerVisiteDialog = dynamic(() => import("../components/ProposerVisiteDialog"), { ssr: false })
const BailSignatureModal = dynamic(() => import("../components/BailSignatureModal"), { ssr: false })
import type { BailData } from "../../lib/bailPDF"
import { calculerScore, type Profil as MatchingProfil, type Annonce as MatchingAnnonce } from "../../lib/matching"

const DOSSIER_PREFIX = "[DOSSIER_CARD]"
const BAIL_PREFIX = "[BAIL_CARD]"
const BAIL_SIGNE_PREFIX = "[BAIL_SIGNE]"
const EDL_A_PLANIFIER_PREFIX = "[EDL_A_PLANIFIER]"
const DEMANDE_DOSSIER_PREFIX = "[DEMANDE_DOSSIER]"
const EDL_PREFIX = "[EDL_CARD]"
const RETRAIT_PREFIX = "[CANDIDATURE_RETIREE]"
const DEVALIDEE_PREFIX = "[CANDIDATURE_DEVALIDEE]"
const REFUS_PREFIX = "[CANDIDATURE_NON_RETENUE]"
const RELANCE_PREFIX = "[RELANCE]"
const LOCATION_PREFIX = "[LOCATION_ACCEPTEE]"
const QUITTANCE_PREFIX = "[QUITTANCE_CARD]"
const VISITE_CONFIRMEE_PREFIX = "[VISITE_CONFIRMEE]"
const VISITE_DEMANDE_PREFIX = "[VISITE_DEMANDE]"
const AUTO_PAIEMENT_DEMANDE_PREFIX = "[AUTO_PAIEMENT_DEMANDE]"
const LOYER_PAYE_PREFIX = "[LOYER_PAYE]"
// Prefix encodé dans contenu pour un message en réponse à un autre.
// Format : "[REPLY:<id>]\n<texte>". Permet d'implémenter le reply-to sans migration DB.
const REPLY_REGEX = /^\[REPLY:(\d+)\]\n([\s\S]*)$/

// ─── Statuts de conversation (fidèle handoff messages.jsx L12-19) ─────────────
// Dérivation :
//   contact  = échange entamé, pas encore de [DOSSIER_CARD]
//   dossier  = au moins un message préfixé [DOSSIER_CARD]
//   visite   = visite statut "proposée" / "confirmée" / "effectuée"
//   bail     = annonce.statut === "loué" + locataire_email match
//   rejete   = visite "annulée" uniquement (aucune en cours)
type StatutConv = "contact" | "dossier" | "validee" | "visite" | "bail" | "rejete"
const STATUT_CONV: Record<StatutConv, { label: string; color: string; bg: string }> = {
  contact: { label: "Contact",           color: "#111", bg: "#F7F4EF" },
  dossier: { label: "Dossier envoyé",    color: "#15803d", bg: "#F0FAEE" },
  validee: { label: "Candidature validée", color: "#15803d", bg: "#DCFCE7" },
  visite:  { label: "Visite programmée", color: "#1d4ed8", bg: "#dbeafe" },
  bail:    { label: "Bail signé",        color: "#ffffff", bg: "#15803d" },
  rejete:  { label: "Refusé",            color: "#b91c1c", bg: "#FEECEC" },
}

// Statut candidat côté propriétaire — qualifie la RELATION (indép. du cycle)
//   standard  = candidat lambda
//   confirme  = visite confirmée ou effectuée → prêt à signer
//   locataire = bail signé, locataire en place
type StatutCandidat = "standard" | "confirme" | "locataire"
const CANDIDATE_STATUS: Record<StatutCandidat, { label: string; short: string; color: string; ring: string; dot: string }> = {
  standard:  { label: "Candidat",          short: "Candidat",      color: "#8a8477", ring: "transparent", dot: "#8a8477" },
  confirme:  { label: "Prêt à signer",     short: "Prêt à signer", color: "#b45309", ring: "#f59e0b",     dot: "#f59e0b" },
  locataire: { label: "Locataire actuel",  short: "Locataire",     color: "#111",    ring: "#111",        dot: "#111" },
}

function parseReply(contenu: string): { replyToId: number | null; text: string } {
  const m = contenu.match(REPLY_REGEX)
  if (m) return { replyToId: parseInt(m[1], 10), text: m[2] }
  return { replyToId: null, text: contenu }
}

function encodeReply(replyToId: number | null, text: string): string {
  return replyToId ? `[REPLY:${replyToId}]\n${text}` : text
}

/**
 * Parse une date_visite robustement :
 *   - "2024-03-01"              → "2024-03-01"
 *   - "2024-03-01T00:00:00"     → "2024-03-01"
 *   - "2024-03-01T00:00:00.000Z"→ "2024-03-01"
 *   - null / invalide           → ""
 * Puis formate en FR ("1 mars"). Evite "Invalid Date".
 */
function formatVisiteDate(raw: unknown, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  if (!raw || typeof raw !== "string") return ""
  const ymd = raw.split("T")[0]
  const d = new Date(ymd + "T12:00:00")
  if (isNaN(d.getTime())) return ""
  return d.toLocaleDateString("fr-FR", opts)
}

// ─── Dossier Card ────────────────────────────────────────────────────────────

function DossierCard({ contenu, isMine, annonceId, bailDejaGenere }: { contenu: string; isMine: boolean; annonceId?: number | null; bailDejaGenere?: boolean }) {
  let data: any = {}
  try { data = JSON.parse(contenu.slice(DOSSIER_PREFIX.length)) } catch {}
  const scoreColor = data.score >= 80 ? "#15803d" : data.score >= 50 ? "#a16207" : "#b91c1c"
  const scoreBg   = data.score >= 80 ? "#F0FAEE" : data.score >= 50 ? "#FBF6EA" : "#FEECEC"
  return (
    <div style={{ background: isMine ? "#111" : "#fff", border: `1px solid ${isMine ? "#1a1a1a" : "#EAE6DF"}`, borderRadius: 16, padding: "14px 18px", minWidth: 220, maxWidth: 280, boxShadow: isMine ? "none" : "0 2px 8px rgba(17,17,17,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${isMine ? "rgba(255,255,255,0.12)" : "#F2EEE6"}` }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: isMine ? "#bdbdbd" : "#8a8477", margin: 0, textTransform: "uppercase", letterSpacing: "1.4px" }}>Dossier locataire</p>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: isMine ? "white" : "#111", margin: "3px 0 0", letterSpacing: "-0.1px" }}>{data.email}</p>
        </div>
        {data.score != null && (
          <span style={{ background: scoreBg, color: scoreColor, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, letterSpacing: "0.1px" }}>{data.score}%</span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {data.nom           && <Row label="Nom"       val={data.nom}                                                   isMine={isMine} />}
        {data.situation_pro && <Row label="Situation" val={data.situation_pro}                                         isMine={isMine} />}
        {data.revenus_mensuels && <Row label="Revenus" val={`${Number(data.revenus_mensuels).toLocaleString("fr-FR")} €/mois`} isMine={isMine} />}
        {data.garant        && <Row label="Garant"    val={data.type_garant || "Oui"}                                  isMine={isMine} />}
      </div>
      {!isMine && data.shareUrl && (
        <a href={data.shareUrl} target="_blank" rel="noopener noreferrer"
          style={{ display: "block", marginTop: 12, background: "#111", color: "white", borderRadius: 999, padding: "9px 14px", fontSize: 12, fontWeight: 600, textAlign: "center", textDecoration: "none", fontFamily: "inherit", letterSpacing: "0.1px" }}>
          Voir les pièces du dossier →
        </a>
      )}
      {!isMine && annonceId && data.email && !bailDejaGenere && (
        <a href={`/proprietaire/bail/${annonceId}?locataire=${encodeURIComponent(data.email)}`}
          style={{ display: "block", marginTop: 6, background: "#15803d", color: "white", borderRadius: 999, padding: "9px 14px", fontSize: 12, fontWeight: 600, textAlign: "center", textDecoration: "none", fontFamily: "inherit", letterSpacing: "0.1px" }}>
          Accepter &amp; générer le bail →
        </a>
      )}
      {!isMine && annonceId && bailDejaGenere && (
        <a href={`/proprietaire/bail/${annonceId}`}
          style={{ display: "block", marginTop: 6, background: "#fff", color: "#111", border: "1px solid #EAE6DF", borderRadius: 999, padding: "9px 14px", fontSize: 12, fontWeight: 600, textAlign: "center", textDecoration: "none", fontFamily: "inherit", letterSpacing: "0.1px" }}>
          Voir le bail →
        </a>
      )}
      {isMine && data.shareUrl && (
        <p style={{ marginTop: 10, fontSize: 10.5, color: "#bdbdbd", letterSpacing: "0.1px" }}>Lien de partage 30 j inclus pour le propriétaire.</p>
      )}
    </div>
  )
}
function Row({ label, val, isMine }: { label: string; val: string; isMine: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span style={{ fontSize: 11, color: isMine ? "#9b9b9b" : "#8a8477" }}>{label}</span>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: isMine ? "white" : "#111", letterSpacing: "-0.1px" }}>{val}</span>
    </div>
  )
}

// ─── Demande Dossier Card ────────────────────────────────────────────────────

function DemandeDossierCard({ isMine, dossierRecu, onEnvoyer, envoyant }: {
  isMine: boolean
  dossierRecu: boolean
  onEnvoyer: () => void
  envoyant: boolean
}) {
  if (isMine) {
    return (
      <div style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 14, padding: "14px 18px", minWidth: 220, maxWidth: 280 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: 13, color: "white", margin: 0 }}>Dossier demandé</p>
            <p style={{ fontSize: 11, color: dossierRecu ? "#86efac" : "#8a8477", margin: "2px 0 0" }}>
              {dossierRecu ? "Dossier reçu" : "En attente de réponse..."}
            </p>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div style={{ background: "#fff", border: "1px solid #EAE6DF", borderRadius: 16, padding: "16px 20px", minWidth: 220, maxWidth: 280, fontFamily: "'DM Sans', sans-serif", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 28, height: 28, borderRadius: 10, background: "#F7F4EF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <div>
          <p style={{ fontWeight: 600, fontSize: 13, color: "#111", margin: 0, letterSpacing: "-0.1px" }}>Demande de dossier</p>
          <p style={{ fontSize: 11, color: "#8a8477", margin: "2px 0 0", letterSpacing: "0.2px" }}>Le propriétaire souhaite voir votre dossier</p>
        </div>
      </div>
      {dossierRecu ? (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#F0FAEE", border: "1px solid #C6E9C0", borderRadius: 999, padding: "6px 12px" }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#15803d", letterSpacing: "0.3px", textTransform: "uppercase" }}>Dossier envoyé</span>
        </div>
      ) : (
        <button onClick={onEnvoyer} disabled={envoyant}
          style={{ width: "100%", background: envoyant ? "#EAE6DF" : "#111", color: envoyant ? "#8a8477" : "#fff", border: "none", borderRadius: 999, padding: "10px 18px", fontSize: 12, fontWeight: 600, cursor: envoyant ? "not-allowed" : "pointer", letterSpacing: "0.3px", fontFamily: "inherit" }}>
          {envoyant ? "Envoi en cours…" : "Envoyer mon dossier"}
        </button>
      )}
    </div>
  )
}

// ─── EDL Card ───────────────────────────────────────────────────────────────

function EdlCard({ contenu, isMine, signatures }: { contenu: string; isMine: boolean; signatures?: { locataire: boolean; bailleur: boolean } }) {
  let data: any = {}
  try { data = JSON.parse(contenu.slice(EDL_PREFIX.length)) } catch {}
  const typeLabel = data.type === "entree" ? "entree" : "sortie"
  const dateLabel = data.dateEdl ? new Date(data.dateEdl).toLocaleDateString("fr-FR") : ""

  // État de signature pour bandeau statut : "en_attente" | "signe_locataire" | "signe_complet"
  const sigLoc = signatures?.locataire ?? false
  const sigBail = signatures?.bailleur ?? false
  const statutSig = sigLoc && sigBail ? "signe_complet" : sigLoc ? "signe_locataire" : "en_attente"

  if (isMine) {
    // Cote proprio : afficher statut "En attente de confirmation" tant que
    // locataire n'a pas signe. Paul : "afficher un etat En attente de
    // confirmation de l'EDL dans la messagerie tant que le locataire n'a
    // pas confirme."
    return (
      <div style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 14, padding: "14px 18px", minWidth: 240, maxWidth: 300 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: data.edlId ? 10 : 0 }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, fontSize: 13, color: "white", margin: 0 }}>État des lieux envoyé</p>
            <p style={{ fontSize: 11, color: "#8a8477", margin: "2px 0 0" }}>
              {data.bienTitre || "Bien"} — {dateLabel}
            </p>
          </div>
        </div>
        {data.edlId && (
          <>
            {/* Statut de confirmation - badge centralisé */}
            <div style={{
              marginBottom: 8,
              padding: "6px 10px",
              borderRadius: 8,
              background: statutSig === "signe_complet" ? "#052e16"
                : statutSig === "signe_locataire" ? "#422006"
                : "#1f2937",
              border: `1px solid ${statutSig === "signe_complet" ? "#14532d" : statutSig === "signe_locataire" ? "#78350f" : "#111"}`,
              fontSize: 10,
              fontWeight: 700,
              color: statutSig === "signe_complet" ? "#4ade80"
                : statutSig === "signe_locataire" ? "#fbbf24"
                : "#8a8477",
              textAlign: "center",
              letterSpacing: "0.3px",
            }}>
              {statutSig === "signe_complet" && "Signé par les 2 parties"}
              {statutSig === "signe_locataire" && "Signé par le locataire — à contresigner"}
              {statutSig === "en_attente" && "En attente de confirmation du locataire…"}
            </div>
            <a href={`/edl/consulter/${data.edlId}`}
              style={{ display: "block", background: "white", color: "#111", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, textAlign: "center", textDecoration: "none", fontFamily: "inherit" }}>
              {statutSig === "signe_locataire" ? "Contresigner l'EDL →" : "Consulter l'EDL →"}
            </a>
          </>
        )}
      </div>
    )
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #EAE6DF", borderRadius: 16, padding: "16px 20px", minWidth: 220, maxWidth: 280, fontFamily: "'DM Sans', sans-serif", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 28, height: 28, borderRadius: 10, background: "#F7F4EF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-4"/>
            <polyline points="9 7 12 4 15 7"/>
            <line x1="12" y1="4" x2="12" y2="15"/>
          </svg>
        </div>
        <div>
          <p style={{ fontWeight: 600, fontSize: 13, color: "#111", margin: 0, letterSpacing: "-0.1px" }}>État des lieux d&apos;{typeLabel}</p>
          <p style={{ fontSize: 11, color: "#8a8477", margin: "2px 0 0", letterSpacing: "0.2px" }}>
            {data.bienTitre || "Bien"} — {dateLabel}
          </p>
        </div>
      </div>
      {data.edlId && (
        <a href={`/edl/consulter/${data.edlId}`}
          style={{
            display: "block", width: "100%", background: "#111", color: "#fff",
            border: "none", borderRadius: 999, padding: "10px 18px", fontSize: 12,
            fontWeight: 600, textAlign: "center", textDecoration: "none",
            letterSpacing: "0.3px", fontFamily: "inherit",
          }}>
          Consulter l&apos;EDL →
        </a>
      )}
    </div>
  )
}

// ─── Bail Card ──────────────────────────────────────────────────────────────

type BailSignatureSummary = { role: string; nom: string; dateSignature: string }

function BailCard({
  contenu,
  isMine,
  annonceId,
  signatures,
  canSignAsRole,
  onRequestSign,
}: {
  contenu: string
  isMine: boolean
  annonceId: number | null
  signatures: BailSignatureSummary[]
  canSignAsRole: "locataire" | "bailleur" | null
  onRequestSign: (bail: BailData, role: "locataire" | "bailleur") => void
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = {}
  try { data = JSON.parse(contenu.slice(BAIL_PREFIX.length)) } catch { /* ignore */ }
  const dateStr = data.dateDebut
    ? new Date(data.dateDebut).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : ""
  const loyer = Number(data.loyerHC || 0) + Number(data.charges || 0)
  // Download autorisé si le payload a les champs essentiels (ancien ou enrichi)
  // OU si c'est un bail externe (URL directe vers le PDF uploadé).
  const canDownload =
    !!data?.fichierUrl ||
    !!(data.nomBailleur && data.titreBien && data.dateDebut && data.villeBien)
  const [downloading, setDownloading] = useState(false)

  const sigLocataire = signatures.find(s => s.role === "locataire")
  const sigBailleur = signatures.find(s => s.role === "bailleur")
  const dejaSigneParMoi = canSignAsRole
    ? !!signatures.find(s => s.role === canSignAsRole)
    : false

  const isExterne = !!data?.fichierUrl

  async function telecharger() {
    if (downloading) return
    setDownloading(true)
    try {
      // Variant bail externe : ouvrir l'URL du PDF uploadé
      if (isExterne) {
        window.open(String(data.fichierUrl), "_blank")
        return
      }
      if (!canDownload) return
      const { genererBailPDF } = await import("../../lib/bailPDF")
      // Fetch les signatures (PNG complet) depuis Supabase pour les injecter dans le PDF.
      let sigs: Array<{ role: "bailleur" | "locataire" | "garant"; nom: string; png: string; signeAt: string; mention?: string; ipAddress?: string }> = []
      if (annonceId) {
        const { data: raw } = await supabase
          .from("bail_signatures")
          .select("signataire_role, signataire_nom, signature_png, mention, ip_address, signe_at")
          .eq("annonce_id", annonceId)
        if (raw) {
          sigs = raw.map(s => ({
            role: s.signataire_role as "bailleur" | "locataire" | "garant",
            nom: s.signataire_nom,
            png: s.signature_png,
            signeAt: s.signe_at,
            mention: s.mention,
            ipAddress: s.ip_address,
          }))
        }
      }
      await genererBailPDF({ ...data, signatures: sigs })
    } finally {
      setDownloading(false)
    }
  }

  function signer() {
    if (!canSignAsRole || !annonceId) return
    onRequestSign(data as BailData, canSignAsRole)
  }

  const signatureBadge = (s: BailSignatureSummary) => {
    const d = new Date(s.dateSignature).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
    return `✓ Signé par ${s.nom} (${s.role}) le ${d}`
  }

  // === Variante PROPRIO (isMine = true) ===
  if (isMine) {
    const statutLabel = sigLocataire && sigBailleur
      ? "Bail signé par les 2 parties ✓"
      : sigLocataire
        ? "Signé par le locataire — à contresigner"
        : sigBailleur
          ? "Signé par vous — en attente du locataire"
          : isExterne
            ? "Bail importé — en attente de signature du locataire"
            : "Bail envoyé — en attente de signature du locataire"
    const statutColor = sigLocataire && sigBailleur ? "#a7f3d0" : sigLocataire ? "#fcd34d" : "#EADFC6"
    return (
      <div style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 14, padding: "14px 18px", minWidth: 240, maxWidth: 320 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: statutColor, textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 6px" }}>
          {statutLabel}
        </p>
        <p style={{ fontWeight: 700, fontSize: 13, color: "white", margin: 0 }}>{data.titreBien || "Bien"} — {data.villeBien}</p>
        <p style={{ fontSize: 11, color: "#8a8477", margin: "4px 0 8px" }}>Début {dateStr}{loyer > 0 ? ` · ${loyer} €/mois` : ""}</p>

        {sigLocataire && (
          <p style={{ fontSize: 11, color: "#a7f3d0", margin: "4px 0 0", fontWeight: 600 }}>{signatureBadge(sigLocataire)}</p>
        )}
        {sigBailleur && (
          <p style={{ fontSize: 11, color: "#a7f3d0", margin: "4px 0 0", fontWeight: 600 }}>{signatureBadge(sigBailleur)}</p>
        )}

        {canDownload && (
          <button onClick={telecharger} disabled={downloading}
            style={{ marginTop: 10, width: "100%", background: "white", color: "#111", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: downloading ? "wait" : "pointer", fontFamily: "inherit" }}>
            {downloading ? "Génération…" : "Télécharger le bail (PDF)"}
          </button>
        )}

        {/* Proprio peut contresigner après le locataire */}
        {canSignAsRole === "bailleur" && !dejaSigneParMoi && sigLocataire && (
          <button onClick={signer}
            style={{ marginTop: 8, width: "100%", background: "#15803d", color: "white", border: "none", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            ✍ Contresigner le bail
          </button>
        )}
      </div>
    )
  }

  // === Variante LOCATAIRE (isMine = false) ===
  return (
    <div style={{ background: "#F0FAEE", border: "1px solid #C6E9C0", borderRadius: 16, padding: "16px 20px", minWidth: 240, maxWidth: 320, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#DCF5E4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
        </div>
        <p style={{ fontSize: 10, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0 }}>
          {dejaSigneParMoi ? "Bail signé" : "Bail à signer"}
        </p>
      </div>
      <p style={{ fontWeight: 600, fontSize: 14, color: "#111", margin: 0, letterSpacing: "-0.1px" }}>{data.titreBien || "Bien"}</p>
      <p style={{ fontSize: 12, color: "#8a8477", margin: "2px 0 10px" }}>{data.villeBien || ""}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#111", lineHeight: 1.55 }}>
        {dateStr && <div>Début : <strong style={{ fontWeight: 600 }}>{dateStr}</strong></div>}
        {loyer > 0 && <div>Loyer : <strong style={{ fontWeight: 600 }}>{loyer} €/mois</strong></div>}
        {data.duree && <div>Durée : <strong style={{ fontWeight: 600 }}>{data.duree} mois</strong></div>}
      </div>

      {sigLocataire && (
        <div style={{ marginTop: 12, padding: "7px 12px", background: "#DCF5E4", borderRadius: 10, fontSize: 11, color: "#15803d", fontWeight: 600 }}>
          {signatureBadge(sigLocataire)}
        </div>
      )}
      {sigBailleur && (
        <div style={{ marginTop: 6, padding: "7px 12px", background: "#DCF5E4", borderRadius: 10, fontSize: 11, color: "#15803d", fontWeight: 600 }}>
          {signatureBadge(sigBailleur)}
        </div>
      )}

      {/* CTA signature — priorité sur tout */}
      {canSignAsRole === "locataire" && !dejaSigneParMoi && (
        <button onClick={signer}
          style={{ display: "block", width: "100%", marginTop: 14, background: "#111", color: "#fff", border: "none", borderRadius: 999, padding: "12px 18px", fontSize: 13, fontWeight: 600, textAlign: "center", cursor: "pointer", letterSpacing: "0.3px", fontFamily: "inherit" }}>
          Signer le bail
        </button>
      )}

      {canDownload && (
        <button onClick={telecharger} disabled={downloading}
          style={{ display: "block", width: "100%", marginTop: 8, background: "#fff", color: "#111", border: "1px solid #EAE6DF", borderRadius: 999, padding: "9px 18px", fontSize: 12, fontWeight: 600, textAlign: "center", cursor: downloading ? "wait" : "pointer", letterSpacing: "0.3px", fontFamily: "inherit" }}>
          {downloading ? "Génération…" : "Télécharger le PDF"}
        </button>
      )}
      <a href="/mon-logement"
        style={{ display: "block", marginTop: 6, background: "transparent", color: "#8a8477", border: "none", borderRadius: 999, padding: "7px 16px", fontSize: 11, fontWeight: 500, textAlign: "center", textDecoration: "none", letterSpacing: "0.2px", fontFamily: "inherit" }}>
        Voir mon logement →
      </a>
    </div>
  )
}

// Carte CTA "Prochaine étape : EDL" — envoyée automatiquement après double signature.
function EdlAPlanifierCard({ annonceId, proprietaireActive, isMine }: {
  annonceId: number | null
  proprietaireActive: boolean
  isMine: boolean
}) {
  const href = proprietaireActive && annonceId ? `/proprietaire/edl/${annonceId}` : "/mon-logement"
  const cta = proprietaireActive ? "Créer l'état des lieux" : "Voir mon logement"
  return (
    <div style={{ background: "#fff", border: "1px solid #EAE6DF", borderRadius: 16, padding: "16px 20px", minWidth: 240, maxWidth: 340, fontFamily: "'DM Sans', sans-serif", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 10, background: "#F7F4EF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>
        <p style={{ fontSize: 10, fontWeight: 700, color: "#111", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0 }}>
          Prochaine étape — État des lieux
        </p>
      </div>
      <p style={{ fontSize: 13, color: "#111", margin: 0, fontWeight: 500, lineHeight: 1.55 }}>
        Le bail est signé par les deux parties.
      </p>
      <p style={{ fontSize: 12, color: "#8a8477", margin: "6px 0 12px", lineHeight: 1.55 }}>
        {proprietaireActive
          ? "Planifiez l'état des lieux d'entrée avec votre locataire."
          : "Votre bailleur va maintenant créer l'état des lieux d'entrée — vous serez notifié."}
      </p>
      <a
        href={href}
        style={{
          display: "inline-block",
          background: "#111",
          color: "#fff",
          borderRadius: 999,
          padding: "10px 18px",
          fontSize: 12,
          fontWeight: 600,
          textDecoration: "none",
          letterSpacing: "0.3px",
          fontFamily: "inherit",
        }}
      >
        {cta} →
      </a>
    </div>
  )
}

// Carte informative affichée quand quelqu'un vient de signer.
// Carte "Demande d'auto-paiement" — envoyée par le locataire quand il a mis
// en place un virement auto. Le proprio confirme via cette card.
function AutoPaiementDemandeCard({
  contenu,
  isMine,
  annonceId,
  proprietaireActive,
  onConfirme,
}: {
  contenu: string
  isMine: boolean
  annonceId: number | null
  proprietaireActive: boolean
  onConfirme: (annId: number) => void
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = {}
  try { data = JSON.parse(contenu.slice(AUTO_PAIEMENT_DEMANDE_PREFIX.length)) } catch { /* ignore */ }
  const confirmed = data.confirmedAt
  return (
    <div style={{ background: confirmed ? "#F0FAEE" : "#fff", border: `1px solid ${confirmed ? "#C6E9C0" : "#EAE6DF"}`, borderRadius: 16, padding: "16px 20px", minWidth: 240, maxWidth: 340, fontFamily: "'DM Sans', sans-serif", boxShadow: confirmed ? "none" : "0 1px 2px rgba(0,0,0,0.02)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: confirmed ? "50%" : 10, background: confirmed ? "#DCF5E4" : "#F7F4EF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {confirmed ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3l4 4-4 4"/>
              <path d="M3 7h18"/>
              <path d="M7 21l-4-4 4-4"/>
              <path d="M21 17H3"/>
            </svg>
          )}
        </div>
        <p style={{ fontSize: 10, fontWeight: 700, color: confirmed ? "#15803d" : "#111", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0 }}>
          {confirmed ? "Auto-paiement actif" : "Demande d'auto-paiement"}
        </p>
      </div>
      <p style={{ fontSize: 13, color: "#111", margin: 0, fontWeight: 500, lineHeight: 1.55 }}>
        {isMine
          ? confirmed
            ? "Le propriétaire a confirmé votre virement automatique."
            : "Vous avez signalé avoir mis en place un virement automatique — en attente de confirmation."
          : confirmed
            ? "Vous avez confirmé le virement automatique du locataire."
            : "Le locataire a mis en place un virement automatique mensuel."}
      </p>
      {!confirmed && !isMine && proprietaireActive && annonceId && (
        <button
          onClick={() => onConfirme(annonceId)}
          style={{ marginTop: 12, background: "#111", color: "#fff", border: "none", borderRadius: 999, padding: "10px 18px", fontSize: 12, fontWeight: 600, cursor: "pointer", letterSpacing: "0.3px", fontFamily: "inherit" }}
        >
          Confirmer l&apos;auto-paiement
        </button>
      )}
      {confirmed && (
        <p style={{ fontSize: 11, color: "#15803d", margin: "10px 0 0", lineHeight: 1.55 }}>
          Les loyers seront automatiquement marqués payés chaque mois. Le proprio peut contester un mois individuellement si nécessaire.
        </p>
      )}
    </div>
  )
}

// Carte "Loyer payé" — envoyée par le locataire via "J'ai payé" sur /mon-logement
function LoyerPayeCard({ contenu, isMine }: { contenu: string; isMine: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = {}
  try { data = JSON.parse(contenu.slice(LOYER_PAYE_PREFIX.length)) } catch { /* ignore */ }
  const moisLabel = data.mois
    ? new Date(data.mois + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
    : ""
  const montant = Number(data.montant || 0)
  return (
    <div style={{ background: "#F0FAEE", border: "1px solid #C6E9C0", borderRadius: 16, padding: "16px 20px", minWidth: 240, maxWidth: 320, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#DCF5E4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M16 12l-4 4-4-4M12 8v8"/>
          </svg>
        </div>
        <p style={{ fontSize: 10, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0 }}>
          Paiement signalé
        </p>
      </div>
      <p style={{ fontWeight: 600, fontSize: 14, color: "#111", margin: 0, textTransform: "capitalize", letterSpacing: "-0.1px" }}>
        Loyer de {moisLabel}
      </p>
      <p style={{ fontSize: 13, color: "#15803d", margin: "6px 0 0", fontWeight: 600 }}>
        {montant.toLocaleString("fr-FR")} € payé{isMine ? "" : "s"}
      </p>
      <p style={{ fontSize: 12, color: "#15803d", margin: "10px 0 0", lineHeight: 1.55 }}>
        {isMine
          ? "En attente de la quittance du propriétaire."
          : "Le locataire signale avoir payé. Envoyez-lui la quittance depuis l'onglet Statistiques."}
      </p>
    </div>
  )
}

// Carte "Demande de visite" ou "Contre-proposition" — envoyée quand on propose
// une visite. R10.8 : gère jusqu'à 5 créneaux (data.slots[]). Le destinataire
// clique sur un slot pour le retenir ; les autres s'affichent grisés « non retenu ».
function VisiteDemandeCard({
  contenu,
  isMine,
  visitesConv,
  onOuvrirGestion,
  onChooseSlot,
}: {
  contenu: string
  isMine: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visitesConv: any[]
  onOuvrirGestion: () => void
  onChooseSlot: (visiteId: string, slot: { date: string; heure: string }) => void | Promise<void>
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = {}
  try { data = JSON.parse(contenu.slice(VISITE_DEMANDE_PREFIX.length)) } catch { /* ignore */ }
  // R10.8 — slots[] si multi-créneaux, sinon on construit un tableau à 1 entrée
  // à partir des champs legacy dateVisite/heure pour unifier le rendu.
  const rawSlots: Array<{ date: string; heure: string }> = Array.isArray(data.slots) && data.slots.length > 0
    ? data.slots
    : (data.dateVisite && data.heure ? [{ date: data.dateVisite, heure: data.heure }] : [])
  const multi = rawSlots.length > 1
  const dateLong = data.dateFormatee || (data.dateVisite ? formatVisiteDate(data.dateVisite, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "")
  const visite = data.visiteId ? visitesConv.find(v => v.id === data.visiteId) : null
  const statut = visite?.statut || "proposée"
  const title = data.isCounter ? "Contre-proposition" : "Proposition de visite"
  const accent =
    statut === "confirmée" ? "#15803d"
    : statut === "annulée" ? "#b91c1c"
    : "#1d4ed8"
  const badgeLabel =
    statut === "confirmée" ? "Confirmée"
    : statut === "annulée" ? "Annulée"
    : "En attente"
  const isPending = statut === "proposée"
  // Quand la visite est confirmée, on détecte le créneau retenu par date+heure
  // (la visites row a été mise à jour par choisirSlotVisite).
  const retenu = visite && statut === "confirmée"
    ? rawSlots.findIndex(s => s.date === visite.date_visite && s.heure === visite.heure)
    : -1
  // Le destinataire peut choisir un slot s'il n'est pas l'auteur ET la visite est
  // en attente ET au moins un slot existe.
  const canChoose = !isMine && isPending && rawSlots.length > 0
  return (
    <div style={{ background: "#fff", borderRadius: 18, border: "1px solid #EAE6DF", padding: 16, minWidth: 260, maxWidth: 340, boxShadow: "0 1px 2px rgba(0,0,0,0.02)", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: "#F7F4EF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#111", letterSpacing: "-0.1px" }}>{title}</div>
          <div style={{ fontSize: 10, color: "#8a8477", textTransform: "uppercase" as const, letterSpacing: "1px", fontWeight: 600 }}>
            {rawSlots.length} créneau{rawSlots.length > 1 ? "x" : ""} · 30 min
          </div>
        </div>
        <span style={{ background: "#fff", color: accent, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, border: `1px solid ${accent}33`, textTransform: "uppercase" as const, letterSpacing: "0.3px", flexShrink: 0 }}>
          {badgeLabel}
        </span>
      </div>
      {/* Slots — R10.8. Grille à 1 col si 1-2 slots, 2 col si ≥3 pour compacité. */}
      <div style={{ display: "grid", gridTemplateColumns: rawSlots.length >= 3 ? "1fr 1fr" : "1fr", gap: 6 }}>
        {rawSlots.map((slot, i) => {
          const dayShort = slot.date ? formatVisiteDate(slot.date, { weekday: "short", day: "numeric", month: "short" }) : ""
          const isRetenu = retenu === i
          const isNonRetenu = statut === "confirmée" && retenu >= 0 && i !== retenu
          return (
            <button
              key={`${slot.date}-${slot.heure}-${i}`}
              type="button"
              disabled={!canChoose}
              onClick={() => { if (canChoose && data.visiteId) void onChooseSlot(data.visiteId, slot) }}
              style={{
                padding: 12,
                background: isRetenu ? "#F0FAEE" : isNonRetenu ? "#F7F4EF" : "#FBF9F5",
                border: `1px solid ${isRetenu ? "#15803d" : "#EAE6DF"}`,
                borderRadius: 12,
                textAlign: "center",
                cursor: canChoose ? "pointer" : "default",
                fontFamily: "inherit",
                opacity: isNonRetenu ? 0.5 : 1,
                transition: "all 180ms",
                position: "relative",
              }}
              onMouseEnter={e => { if (canChoose) e.currentTarget.style.borderColor = "#111" }}
              onMouseLeave={e => { if (canChoose) e.currentTarget.style.borderColor = isRetenu ? "#15803d" : "#EAE6DF" }}
            >
              <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 3, textTransform: "uppercase" as const, letterSpacing: "0.5px", color: "#8a8477", fontWeight: 600 }}>
                {dayShort || "Date"}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: isNonRetenu ? "#8a8477" : "#111" }}>
                {slot.heure || "–"}
              </div>
              {isRetenu && (
                <div style={{ fontSize: 9, fontWeight: 700, color: "#15803d", marginTop: 4, textTransform: "uppercase" as const, letterSpacing: "0.4px" }}>
                  ✓ Retenu
                </div>
              )}
              {isNonRetenu && (
                <div style={{ fontSize: 9, fontWeight: 600, color: "#8a8477", marginTop: 4, textTransform: "uppercase" as const, letterSpacing: "0.4px" }}>
                  Non retenu
                </div>
              )}
            </button>
          )
        })}
      </div>
      {canChoose && multi && (
        <p style={{ fontSize: 11, color: "#8a8477", margin: "10px 0 0", lineHeight: 1.45 }}>
          Cliquez sur le créneau qui vous arrange — les autres seront automatiquement rejetés.
        </p>
      )}
      {data.message && (
        <p style={{ fontSize: 12, color: "#111", margin: "10px 0 0", fontStyle: "italic", lineHeight: 1.5 }}>
          « {data.message} »
        </p>
      )}
      {/* CTA secondaire : ouvrir la gestion (annuler, proposer autre créneau).
          Visible pour l'auteur (proposer un autre créneau) ou le destinataire
          d'une proposition 1-slot (compat avec l'ancien flow). */}
      {isPending && (isMine || !multi) && (
        <button
          type="button"
          onClick={onOuvrirGestion}
          style={{ width: "100%", padding: 11, marginTop: 10, borderRadius: 999, background: isMine ? "#111" : "#fff", color: isMine ? "#fff" : "#111", border: isMine ? "none" : "1px solid #EAE6DF", fontFamily: "inherit", fontWeight: 600, fontSize: 12, cursor: "pointer", letterSpacing: "0.3px", transition: "all 200ms" }}
        >
          {isMine ? "Gérer la proposition" : "Proposer un autre créneau"}
        </button>
      )}
      {/* Ligne de rappel date si confirmée/annulée sur un format 1-slot */}
      {!isPending && !multi && dateLong && (
        <p style={{ fontSize: 11, color: accent, margin: "10px 0 0", textAlign: "right" as const, fontWeight: 600, textTransform: "capitalize" }}>
          {dateLong}
        </p>
      )}
    </div>
  )
}

// Carte "Visite confirmée" — remplace le texte brut "Visite confirmée pour le X"
function VisiteConfirmeeCard({ contenu, isMine }: { contenu: string; isMine: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = {}
  try { data = JSON.parse(contenu.slice(VISITE_CONFIRMEE_PREFIX.length)) } catch { /* ignore */ }
  const dateStr = data.dateFormatee || (data.dateVisite ? formatVisiteDate(data.dateVisite, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "")
  return (
    <div style={{ background: "#F0FAEE", border: "1px solid #C6E9C0", borderRadius: 16, padding: "12px 16px", minWidth: 240, maxWidth: 320 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#DCF5E4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5"/>
          </svg>
        </div>
        <p style={{ fontSize: 10.5, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0 }}>
          Visite confirmée
        </p>
      </div>
      <p style={{ fontSize: 13, color: "#111", margin: 0, fontWeight: 600, lineHeight: 1.5, letterSpacing: "-0.1px" }}>
        {isMine ? "Vous avez confirmé la visite" : "La visite est confirmée"}
      </p>
      <p style={{ fontSize: 12, color: "#15803d", margin: "4px 0 0", lineHeight: 1.5, fontWeight: 500 }}>
        {dateStr}{data.heure ? ` à ${data.heure}` : ""}
      </p>
    </div>
  )
}

function BailSigneCard({ contenu, isMine }: { contenu: string; isMine: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = {}
  try { data = JSON.parse(contenu.slice(BAIL_SIGNE_PREFIX.length)) } catch { /* ignore */ }
  const d = data.dateSignature
    ? new Date(data.dateSignature).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : ""
  const roleLabel = data.role === "locataire" ? "le locataire" : data.role === "bailleur" ? "le bailleur" : "le garant"
  return (
    <div style={{ background: "#F0FAEE", border: "1px solid #C6E9C0", borderRadius: 16, padding: "14px 18px", minWidth: 240, maxWidth: 320, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#DCF5E4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        </div>
        <p style={{ fontSize: 10, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0 }}>
          Bail signé
        </p>
      </div>
      <p style={{ fontSize: 13, color: "#111", margin: 0, fontWeight: 500, lineHeight: 1.5 }}>
        {isMine ? `Vous avez signé le bail` : `${data.nom || "La partie"} a signé en tant que ${roleLabel}`}
      </p>
      {d && (
        <p style={{ fontSize: 11, color: "#8a8477", margin: "6px 0 0", letterSpacing: "0.2px" }}>{d}</p>
      )}
    </div>
  )
}

// ─── Location acceptée Card ──────────────────────────────────────────────────

function LocationAccepteeCard({ contenu, isMine, bailDejaGenere }: { contenu: string; isMine: boolean; bailDejaGenere?: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = {}
  try { data = JSON.parse(contenu.slice(LOCATION_PREFIX.length)) } catch { /* ignore */ }
  const dateStr = data.accepteLe
    ? new Date(data.accepteLe).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : ""
  return (
    <div style={{ background: "#F0FAEE", border: "1px solid #C6E9C0", borderRadius: 16, padding: "16px 20px", minWidth: 240, maxWidth: 340, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#DCF5E4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        </div>
        <p style={{ fontSize: 10, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0 }}>
          {isMine ? "Location confirmée" : "Félicitations"}
        </p>
      </div>
      <p style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: 0, lineHeight: 1.45, letterSpacing: "-0.1px" }}>
        {isMine ? "Vous avez accepté cette candidature." : "Votre candidature a été acceptée."}
        {data.bienTitre ? ` (${data.bienTitre})` : ""}
      </p>
      <p style={{ fontSize: 12, color: "#15803d", margin: "8px 0 0", lineHeight: 1.55 }}>
        {isMine
          ? "Le locataire peut désormais accéder à « Mon logement ». Générez le bail quand vous êtes prêt."
          : "Retrouvez votre logement, vos quittances et l'état des lieux dans « Mon logement »."}
      </p>
      {dateStr && <p style={{ fontSize: 11, color: "#8a8477", margin: "8px 0 0", letterSpacing: "0.2px" }}>{dateStr}</p>}
      {!isMine && (
        <a href="/mon-logement" style={{ display: "inline-block", marginTop: 12, background: "#111", color: "#fff", borderRadius: 999, padding: "9px 18px", fontSize: 12, fontWeight: 600, textDecoration: "none", letterSpacing: "0.3px", fontFamily: "inherit" }}>
          Voir mon logement →
        </a>
      )}
      {/* CTA proprio : générer le bail direct après acceptation.
          Si bail déjà généré/envoyé → bascule vers "Voir le bail". */}
      {isMine && data.annonceId && !bailDejaGenere && (
        <a
          href={`/proprietaire/bail/${data.annonceId}`}
          style={{ display: "block", marginTop: 12, background: "#111", color: "#fff", borderRadius: 999, padding: "11px 18px", fontSize: 12, fontWeight: 600, textDecoration: "none", textAlign: "center", letterSpacing: "0.3px", fontFamily: "inherit" }}
        >
          Générer le bail maintenant →
        </a>
      )}
      {isMine && data.annonceId && bailDejaGenere && (
        <a
          href={`/proprietaire/bail/${data.annonceId}`}
          style={{ display: "block", marginTop: 12, background: "#fff", color: "#111", border: "1px solid #EAE6DF", borderRadius: 999, padding: "11px 18px", fontSize: 12, fontWeight: 600, textDecoration: "none", textAlign: "center", letterSpacing: "0.3px", fontFamily: "inherit" }}
        >
          Voir le bail →
        </a>
      )}
    </div>
  )
}

// ─── Quittance Card ──────────────────────────────────────────────────────────

function QuittanceCard({ contenu, isMine }: { contenu: string; isMine: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = {}
  try { data = JSON.parse(contenu.slice(QUITTANCE_PREFIX.length)) } catch { /* ignore */ }
  const moisLabel = data.mois
    ? new Date(data.mois + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
    : ""
  const dateConf = data.dateConfirmation
    ? new Date(data.dateConfirmation).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
    : ""
  const montant = Number(data.montant || 0)

  if (isMine) {
    return (
      <div style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 14, padding: "14px 18px", minWidth: 220, maxWidth: 300 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#a7f3d0", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 6px" }}>Quittance envoyée</p>
        <p style={{ fontWeight: 700, fontSize: 14, color: "white", margin: 0 }}>{data.bienTitre || "Bien"}</p>
        <p style={{ fontSize: 12, color: "#8a8477", margin: "4px 0 0" }}>
          {moisLabel}{montant > 0 ? ` · ${montant} €` : ""}
        </p>
      </div>
    )
  }

  return (
    <div style={{ background: "#F0FAEE", border: "1px solid #C6E9C0", borderRadius: 16, padding: "16px 20px", minWidth: 220, maxWidth: 320, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#DCF5E4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <p style={{ fontSize: 10, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0 }}>Quittance reçue</p>
      </div>
      <p style={{ fontWeight: 600, fontSize: 14, color: "#111", margin: 0, letterSpacing: "-0.1px" }}>{data.bienTitre || "Bien"}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#111", marginTop: 10, lineHeight: 1.5 }}>
        {moisLabel && <div>Mois : <strong style={{ fontWeight: 600 }}>{moisLabel}</strong></div>}
        {montant > 0 && <div>Loyer : <strong style={{ fontWeight: 600 }}>{montant} €</strong></div>}
        {dateConf && <div>Confirmé le <strong style={{ fontWeight: 600 }}>{dateConf}</strong></div>}
      </div>
      <a href="/mon-logement"
        style={{ display: "block", marginTop: 14, background: "#111", color: "#fff", border: "none", borderRadius: 999, padding: "10px 18px", fontSize: 12, fontWeight: 600, textAlign: "center", textDecoration: "none", letterSpacing: "0.3px", fontFamily: "inherit" }}>
        Voir mes quittances →
      </a>
    </div>
  )
}

// ─── Candidature retirée Card ────────────────────────────────────────────────

function CandidatureRetireeCard({ contenu, isMine }: { contenu: string; isMine: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = {}
  try { data = JSON.parse(contenu.slice(RETRAIT_PREFIX.length)) } catch { /* ignore */ }
  const dateStr = data.retireLe
    ? new Date(data.retireLe).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : ""
  return (
    <div style={{ background: "#fef2f2", border: "1.5px dashed #F4C9C9", borderRadius: 14, padding: "12px 16px", minWidth: 220, maxWidth: 320 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#b91c1c", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 4px" }}>Candidature retirée</p>
      <p style={{ fontSize: 13, color: "#b91c1c", margin: 0, lineHeight: 1.4 }}>
        {isMine ? "Vous avez retiré votre candidature" : "Le candidat a retiré sa candidature"}
        {data.bienTitre ? ` pour « ${data.bienTitre} »` : ""}.
      </p>
      {dateStr && <p style={{ fontSize: 11, color: "#b91c1c", margin: "4px 0 0" }}>{dateStr}</p>}
    </div>
  )
}

// ─── Candidature dévalidée Card ──────────────────────────────────────────────
// Rendue quand le proprio annule une validation précédente (découverte d'un
// élément, validation par erreur). Posté par /api/candidatures/devalider.

function CandidatureDevalideeCard({ contenu, isMine }: { contenu: string; isMine: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = {}
  try { data = JSON.parse(contenu.slice(DEVALIDEE_PREFIX.length)) } catch { /* ignore */ }
  const dateStr = data.devalidatedAt
    ? new Date(data.devalidatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : ""
  return (
    <div style={{ background: "#FBF6EA", border: "1px solid #EADFC6", borderRadius: 14, padding: "14px 18px", minWidth: 240, maxWidth: 340, fontFamily: "'DM Sans', sans-serif" }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#a16207", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 6px" }}>
        {isMine ? "Validation retirée" : "Validation retirée"}
      </p>
      <p style={{ fontSize: 13, color: "#111", margin: 0, lineHeight: 1.5 }}>
        {isMine
          ? `Vous avez annulé la validation${data.bienTitre ? ` pour « ${data.bienTitre} »` : ""}. Le candidat ne peut plus proposer de visite tant que vous n'aurez pas revalidé.`
          : `Le propriétaire a retiré la validation de votre candidature${data.bienTitre ? ` pour « ${data.bienTitre} »` : ""}. Vous ne pouvez plus proposer de visite pour le moment.`}
      </p>
      {dateStr && <p style={{ fontSize: 11, color: "#a16207", margin: "6px 0 0" }}>{dateStr}</p>}
    </div>
  )
}

// ─── Candidature non retenue Card (LOUPÉ #2 fix) ─────────────────────────────
// Rendue côté locataire quand le proprio a accepté un autre candidat. Posté
// par /api/notifications/candidats-orphelins (en plus de l'email respectueux).

function CandidatureNonRetenueCard({ contenu, isMine }: { contenu: string; isMine: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = {}
  try { data = JSON.parse(contenu.slice(REFUS_PREFIX.length)) } catch { /* ignore */ }
  const dateStr = data.refuseLe
    ? new Date(data.refuseLe).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : ""
  return (
    <div style={{ background: "#FEECEC", border: "1px solid #F4C9C9", borderRadius: 14, padding: "14px 18px", minWidth: 240, maxWidth: 340, fontFamily: "'DM Sans', sans-serif" }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#b91c1c", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 6px" }}>
        {isMine ? "Candidat non retenu — notifié" : "Candidature non retenue"}
      </p>
      <p style={{ fontSize: 13, color: "#111", margin: 0, lineHeight: 1.5 }}>
        {isMine
          ? `Vous avez retenu un autre candidat${data.bienTitre ? ` pour « ${data.bienTitre} »` : ""}. Le candidat a été notifié par message et email.`
          : `Le propriétaire a retenu un autre candidat${data.bienTitre ? ` pour « ${data.bienTitre} »` : ""}. Votre dossier reste valable pour vos autres recherches.`}
      </p>
      {dateStr && <p style={{ fontSize: 11, color: "#8a8477", margin: "6px 0 0" }}>{dateStr}</p>}
      {!isMine && (
        <a href="/annonces" style={{ display: "inline-block", marginTop: 10, background: "#fff", color: "#111", border: "1px solid #EAE6DF", borderRadius: 999, padding: "8px 16px", fontSize: 12, fontWeight: 600, textDecoration: "none", letterSpacing: "0.3px" }}>
          Voir d&apos;autres annonces →
        </a>
      )}
    </div>
  )
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({ email, image, size = 36 }: { email: string; image?: string | null; size?: number }) {
  const initial = (email || "?").trim().slice(0, 1).toUpperCase()
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, background: "#EAE6DF" }}
        referrerPolicy="no-referrer"
      />
    )
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "#EAE6DF", color: "#111", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.42), fontWeight: 700, flexShrink: 0 }}>
      {initial}
    </div>
  )
}

// ─── Date separator ──────────────────────────────────────────────────────────

function dateSep(dateStr: string) {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui"
  if (d.toDateString() === yesterday.toDateString()) return "Hier"
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
}

// ─── Main component ──────────────────────────────────────────────────────────

function MessagesInner() {
  const { data: session, status } = useSession()
  const { proprietaireActive } = useRole()
  const router = useRouter()
  const searchParams = useSearchParams()
  const withEmail = searchParams.get("with")

  const [conversations, setConversations] = useState<any[]>([])
  const [annonces, setAnnonces] = useState<Record<number, any>>({})
  // Photos de profil des interlocuteurs (keyed par email lower). Chargé après
  // la liste de conv pour afficher un avatar dans la liste et dans le header chat.
  const [peerImages, setPeerImages] = useState<Record<string, string>>({})
  // Téléphones des interlocuteurs (keyed par email lower). Chargé en piggyback
  // de peerImages. Utilisé UNIQUEMENT pour afficher le bouton "Appeler" dans le
  // header chat quand la relation est assez avancée (visite programmée ou bail
  // signé) — cf. garde-fou vie privée 2026-04-23.
  const [peerPhones, setPeerPhones] = useState<Record<string, string>>({})
  // Profils matching des peers (keyed par email lower). Chargé en piggyback
  // de peerImages pour pouvoir calculer, cote proprio, le score du candidat
  // sur l'annonce concernée. Inutile cote locataire (c'est myProfile qui sert).
  const [peerProfiles, setPeerProfiles] = useState<Record<string, MatchingProfil>>({})
  // Profil matching de l'user connecte (cote locataire seulement). Sert a
  // calculer le score d'une annonce donnee dans une conv (ex. "82% compat").
  const [myProfile, setMyProfile] = useState<MatchingProfil | null>(null)
  const [convActive, setConvActive] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  // Signatures EDL : { [edlId]: { locataire: bool, bailleur: bool } }.
  // Fetch après chaque loadMessages pour que EdlCard cote proprio puisse
  // afficher "En attente de confirmation" tant que le locataire n'a pas signé.
  const [edlSignatures, setEdlSignatures] = useState<Record<number, { locataire: boolean; bailleur: boolean }>>({})
  const [nouveau, setNouveau] = useState("")
  const [loading, setLoading] = useState(true)
  const [envoi, setEnvoi] = useState(false)
  // Indicateur "en train d'écrire" — broadcast Supabase Realtime (pas de DB).
  // peerTyping = l'autre est en train d'écrire (affiché au-dessus de l'input).
  const [peerTyping, setPeerTyping] = useState(false)
  const [envoyantDossier, setEnvoyantDossier] = useState(false)
  const [recherche, setRecherche] = useState("")
  // Onglet de filtrage des conversations.
  // Côté proprio : 4 onglets stricts (Paul 2026-04-26) :
  //   - "candidat"  = candidature non validée
  //   - "valide"    = candidature explicitement validée par le proprio
  //   - "locataire" = bail signé en cours (ce qu'on appelait "actifs")
  //   - "autre"     = conv libre sans annonce OU candidature refusée
  // Côté locataire : 2 onglets historiques (Mon bail / Mes candidatures)
  // mappés sur "locataire" / "candidat" pour réutiliser la même mécanique.
  type MessagesTab = "candidat" | "valide" | "locataire" | "autre"
  const [messagesTab, setMessagesTab] = useState<MessagesTab>("locataire")
  // Persistance localStorage : si l'user était sur "Validé", on reste sur
  // "Validé" après reload. Utilisé aussi pour neutraliser l'auto-switch
  // tabInitialized — sinon un onglet vide auto-bascule vers un autre, ce
  // qui contredit la demande user "garder l'onglet".
  const [restoredFromStorage, setRestoredFromStorage] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const stored = window.localStorage.getItem("nm_messages_tab")
      if (stored === "candidat" || stored === "valide" || stored === "locataire" || stored === "autre") {
        setMessagesTab(stored)
        setRestoredFromStorage(true)
      }
    } catch { /* noop */ }
  }, [])
  useEffect(() => {
    if (typeof window === "undefined") return
    try { window.localStorage.setItem("nm_messages_tab", messagesTab) } catch { /* noop */ }
  }, [messagesTab])
  // Filtre par statut (handoff messages.jsx L154-179) : 6 pills
  const [statusFilter, setStatusFilter] = useState<"all" | StatutConv>("all")
  // Derivation statut : flag [DOSSIER_CARD] par conv + visites batchées par conv
  const [convDossierFlag, setConvDossierFlag] = useState<Record<string, boolean>>({})
  // Flag par conv : la candidature a été validée (statut_candidature='validee'
  // sur le 1er message type='candidature' de la conv). Calculé en même temps
  // que convDossierFlag depuis la query messages globale.
  const [convCandidatureValideeFlag, setConvCandidatureValideeFlag] = useState<Record<string, boolean>>({})
  const [convVisitesMap, setConvVisitesMap] = useState<Record<string, Array<{ statut: string }>>>({})
  // Filtre par bien (proprio uniquement) — persist localStorage
  const [bienFilter, setBienFilter] = useState<number | "all">("all")
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("nm_msg_bien_filter")
      if (stored && stored !== "all") {
        const n = Number(stored)
        if (!Number.isNaN(n)) setBienFilter(n)
      }
    } catch { /* ignore */ }
  }, [])
  // Ajuste automatiquement l'onglet par défaut selon le contexte : si l'user
  // n'a aucun bail actif, on bascule sur "Candidatures" (évite liste vide au load).
  const [tabInitialized, setTabInitialized] = useState(false)
  const [supprimant, setSupprimant] = useState<string | null>(null)
  const [menuConv, setMenuConv] = useState<string | null>(null)
  // Archivage côté client : Set de conv.key archivées (localStorage par email).
  // On ne touche pas la DB — archiver = "hors de ma vue", pas "supprimé".
  const [archivedKeys, setArchivedKeys] = useState<Set<string>>(new Set())
  const [showArchived, setShowArchived] = useState(false)
  // Notes privées proprio sur chaque candidat (localStorage). Jamais partagées.
  const [candidatNotes, setCandidatNotes] = useState<Record<string, string>>({})
  const [noteEditKey, setNoteEditKey] = useState<string | null>(null)
  const [accepterLocationOpen, setAccepterLocationOpen] = useState(false)
  // Bandeau success post-acceptation : affiche un CTA fort "Générer le bail"
  // pendant la session, se clear quand le proprio clique le bouton OU passe
  // sur une autre conv (commit 3 du flow plan).
  const [justAcceptedAnnonceId, setJustAcceptedAnnonceId] = useState<number | null>(null)
  const [accepteEnCours, setAccepteEnCours] = useState(false)
  const [noteDraft, setNoteDraft] = useState("")
  // Reply-to : infos du message auquel on répond (null = pas de reply)
  const [replyTo, setReplyTo] = useState<{ id: number; contenu: string; from: string } | null>(null)
  // Menu d'actions sur un message (id du msg ouvert, null = fermé)
  const [menuMsgId, setMenuMsgId] = useState<number | null>(null)
  // Ancre du menu ⋯ : coords du bouton + côté d'affichage. Rendu via
  // portal dans <body> pour échapper overflow-hidden du scroll chat.
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number; right: number; isMine: boolean } | null>(null)
  // Modale annulation visite (inline dans la conv)
  const [visiteCancelTarget, setVisiteCancelTarget] = useState<{ v: any; mode: "refus" | "annulation" } | null>(null)
  const [visitesConv, setVisitesConv] = useState<any[]>([])
  // Modale de gestion des visites (ouverte depuis la mini-barre dans la conv).
  const [visitesModalOpen, setVisitesModalOpen] = useState<boolean>(false)
  // Historique annulées dans la modale : collapsible local (fermé par défaut).
  const [historiqueAnnOuvert, setHistoriqueAnnOuvert] = useState<boolean>(false)
  useEffect(() => { setHistoriqueAnnOuvert(false); setJustAcceptedAnnonceId(null) }, [convActive])
  const [showVisiteForm, setShowVisiteForm] = useState(false)
  const [visiteDate, setVisiteDate] = useState("")
  const [visiteHeure, setVisiteHeure] = useState("10:00")
  const [visiteMessage, setVisiteMessage] = useState("")
  const [envoyantVisite, setEnvoyantVisite] = useState(false)
  // Contre-proposition : si défini, le form de visite annule la visite
  // ciblée et poste une nouvelle proposition à sa place.
  const [counterTarget, setCounterTarget] = useState<any | null>(null)
  const [demandantDossier, setDemandantDossier] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Refs pour le typing indicator (throttle envoi + timeout reset du peer)
  const typingLastSentRef = useRef<number>(0)
  const peerTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typingChannelRef = useRef<any>(null)
  // ID unique du tab/session courant — permet de filtrer nos propres broadcasts
  // même si on ouvre 2 sessions du même compte (test dev, 2e navigateur).
  const myTabIdRef = useRef<string>("")
  if (!myTabIdRef.current && typeof crypto !== "undefined" && "randomUUID" in crypto) {
    myTabIdRef.current = crypto.randomUUID()
  } else if (!myTabIdRef.current) {
    myTabIdRef.current = String(Date.now()) + "-" + Math.random().toString(36).slice(2)
  }
  // Index de recherche : clé conv -> concat lowercase des contenus de tous les
  // messages de la conv (strippés des prefixes systeme). Permet de chercher un
  // mot dans un message ancien, pas seulement dans le preview du dernier.
  const [searchIndex, setSearchIndex] = useState<Record<string, string>>({})
  const myEmail = session?.user?.email?.toLowerCase()

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth")
    if (session?.user?.email) loadConversations()
  }, [session, status, withEmail])

  // Hydrate archivedKeys depuis localStorage dès qu'on a l'email.
  useEffect(() => {
    if (!myEmail) return
    try {
      const raw = localStorage.getItem(`nestmatch:archivedConvs:${myEmail}`)
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) setArchivedKeys(new Set(arr))
      }
    } catch { /* localStorage indisponible */ }
    try {
      const raw = localStorage.getItem(`nestmatch:candidatNotes:${myEmail}`)
      if (raw) {
        const obj = JSON.parse(raw)
        if (obj && typeof obj === "object") setCandidatNotes(obj)
      }
    } catch { /* idem */ }
  }, [myEmail])

  function saveNote(convKey: string, texte: string) {
    if (!myEmail) return
    const trimmed = texte.trim()
    setCandidatNotes(prev => {
      const next = { ...prev }
      if (trimmed) next[convKey] = trimmed
      else delete next[convKey]
      try { localStorage.setItem(`nestmatch:candidatNotes:${myEmail}`, JSON.stringify(next)) } catch { /* quota */ }
      return next
    })
  }

  function openNoteEditor(convKey: string) {
    setNoteDraft(candidatNotes[convKey] || "")
    setNoteEditKey(convKey)
  }

  /**
   * Acceptation d'un candidat comme locataire officiel du bien.
   *
   * Action proprio : met à jour annonces.statut = "loué" + locataire_email.
   * Conséquence : la conv migre automatiquement vers "Biens loués" (proprio)
   *   / "Mon bail" (locataire), et /mon-logement devient accessible au locataire.
   * Poste un message [LOCATION_ACCEPTEE] pour notifier le locataire.
   *
   * N'impose pas la génération du bail — le proprio peut la faire plus tard
   * via le bouton dédié dans /proprietaire.
   */
  async function accepterLocation() {
    if (!myEmail || !convActiveData?.annonceId || !proprietaireActive) return
    const conv = conversations.find(c => c.key === convActive)
    if (!conv) return
    setAccepteEnCours(true)
    const peerEmail = conv.other.toLowerCase()
    const annId = convActiveData.annonceId
    // 1. Update annonce : statut "loué" + locataire officiel
    const { error: updErr } = await supabase
      .from("annonces")
      .update({ statut: "loué", locataire_email: peerEmail })
      .eq("id", annId)
    if (updErr) {
      alert(`Erreur mise à jour annonce : ${updErr.message}`)
      setAccepteEnCours(false)
      return
    }
    // 2. Reflect local : update annonces map + conversations (sert la migration
    //    visuelle onglet Candidatures → Biens loués sans reload).
    setAnnonces(prev => ({ ...prev, [annId]: { ...(prev[annId] || {}), statut: "loué", locataire_email: peerEmail } }))
    // 3. Poster un message [LOCATION_ACCEPTEE] pour le locataire
    const ann = annonces[annId]
    const titre = ann?.titre || "votre logement"
    const payload = JSON.stringify({ bienTitre: titre, annonceId: annId, accepteLe: new Date().toISOString() })
    const { data: msg } = await supabase.from("messages").insert([{
      from_email: myEmail,
      to_email: peerEmail,
      contenu: `${LOCATION_PREFIX}${payload}`,
      annonce_id: annId,
      lu: false,
      created_at: new Date().toISOString(),
    }]).select().single()
    if (msg) {
      setMessages(prev => [...prev, msg])
      setConversations(prev => prev.map(c => c.key === convActive ? { ...c, lastMsg: msg } : c))
    }
    // Notif cloche locataire : candidature acceptée ! Gros event UX.
    void postNotif({
      userEmail: peerEmail,
      type: "location_acceptee",
      title: "Candidature acceptée",
      body: `Votre dossier a été retenu pour « ${titre} »`,
      href: "/mon-logement",
      relatedId: String(annId),
    })
    // Email aux autres candidats non retenus (fire-and-forget, respectueux)
    void fetch("/api/notifications/candidats-orphelins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annonceId: annId, locataireRetenu: peerEmail }),
    }).catch(() => { /* silent */ })
    setAccepteEnCours(false)
    setAccepterLocationOpen(false)
    // Affiche le bandeau success "Générer le bail maintenant →" en haut.
    setJustAcceptedAnnonceId(annId)
  }

  // Désactive la restauration auto du scroll par le navigateur sur /messages
  useEffect(() => {
    if (typeof window === "undefined") return
    const prev = window.history.scrollRestoration
    try { window.history.scrollRestoration = "manual" } catch { /* noop */ }
    return () => { try { window.history.scrollRestoration = prev } catch { /* noop */ } }
  }, [])

  // ─── Scroll « sticky bottom » style WhatsApp ───────────────────────────
  // Stratégie :
  // 1. Flag `stickBottom` = true quand on vient d'ouvrir la conv OU l'user
  //    est déjà en bas (< 80px du fond)
  // 2. MutationObserver + ResizeObserver sur le conteneur → à chaque changement
  //    de taille (image qui charge, nouveau message, réponse API arrivée),
  //    on force scrollTop = scrollHeight si stickBottom
  // 3. Si l'user scroll vers le haut de > 80px, stickBottom devient false
  //    (on respecte sa lecture)
  // 4. Au changement de conv, on reset stickBottom = true
  const stickBottomRef = useRef(true)
  const prevConvKey2 = useRef<string | null>(null)

  // Au changement de conv : on "re-stick" + scroll instantané en bas
  useEffect(() => {
    if (!convActive) return
    if (prevConvKey2.current !== convActive) {
      prevConvKey2.current = convActive
      stickBottomRef.current = true
      // Force un premier scroll bottom dès que le conteneur est dispo
      requestAnimationFrame(() => {
        const el = messagesContainerRef.current
        if (el) el.scrollTop = el.scrollHeight
      })
    }
  }, [convActive])

  // Listener scroll user : détecte quand il scrolle vers le haut pour
  // NE PAS le ramener contre son gré
  useEffect(() => {
    const el = messagesContainerRef.current
    if (!el) return
    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      stickBottomRef.current = distanceFromBottom < 80
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [convActive])

  // Observers : à chaque changement de taille / contenu, on re-stick si flag
  useEffect(() => {
    const el = messagesContainerRef.current
    if (!el) return
    const stick = () => {
      if (stickBottomRef.current) el.scrollTop = el.scrollHeight
    }
    const resizeObs = new ResizeObserver(() => requestAnimationFrame(stick))
    resizeObs.observe(el)
    Array.from(el.children).forEach(child => resizeObs.observe(child as Element))
    const mutObs = new MutationObserver(() => requestAnimationFrame(stick))
    mutObs.observe(el, { childList: true, subtree: true })
    // Première vague : plusieurs retries pour couvrir images lentes
    const t1 = setTimeout(stick, 50)
    const t2 = setTimeout(stick, 200)
    const t3 = setTimeout(stick, 600)
    const t4 = setTimeout(stick, 1200)
    return () => {
      resizeObs.disconnect()
      mutObs.disconnect()
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4)
    }
  }, [convActive])

  // Temps réel — écoute les nouveaux messages de la conv active
  useEffect(() => {
    if (!convActive || !myEmail) return
    const conv = conversations.find(c => c.key === convActive)
    if (!conv) return

    const me = myEmail.toLowerCase()
    const other = conv.other.toLowerCase()
    const convAnnId = conv.annonceId ?? null
    const isRelevant = (m: any) => {
      const f = (m.from_email || "").toLowerCase()
      const t = (m.to_email || "").toLowerCase()
      const peers = (f === me && t === other) || (f === other && t === me)
      if (!peers) return false
      const mAnn = m.annonce_id ?? null
      return mAnn === convAnnId
    }

    const channel = supabase.channel(`messages-${convActive}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as any
        if (!isRelevant(m)) return
        setMessages(prev => {
          if (prev.find(x => x.id === m.id)) return prev
          return [...prev, m]
        })
        if ((m.to_email || "").toLowerCase() === me) {
          supabase.from("messages").update({ lu: true }).eq("id", m.id)
          setConversations(prev => prev.map(c => c.key === convActive ? { ...c, unread: 0, lastMsg: m } : c))
        }
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
        const m = payload.old as any
        // DELETE payload ne contient que la PK par défaut — on retire par id
        setMessages(prev => prev.filter(x => x.id !== m.id))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [convActive, myEmail, conversations])

  // Temps réel — écoute les nouvelles visites + changements de statut
  // pour la conv active (affiche direct les contre-propositions reçues)
  useEffect(() => {
    if (!convActive || !myEmail) return
    const conv = conversations.find(c => c.key === convActive)
    if (!conv) return

    const me = myEmail.toLowerCase()
    const other = conv.other.toLowerCase()

    const convAnnId = conv.annonceId ?? null
    const isMine = (row: { proprietaire_email?: string; locataire_email?: string; annonce_id?: number | null }) => {
      const p = (row.proprietaire_email || "").toLowerCase()
      const l = (row.locataire_email || "").toLowerCase()
      const peers = (p === me && l === other) || (p === other && l === me)
      if (!peers) return false
      const rowAnn = row.annonce_id ?? null
      return convAnnId == null || rowAnn === convAnnId
    }

    const channel = supabase.channel(`visites-${convActive}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "visites" }, (payload) => {
        if (isMine(payload.new as any)) loadVisitesConv(conv.other, convAnnId)
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "visites" }, (payload) => {
        if (isMine(payload.new as any)) loadVisitesConv(conv.other, convAnnId)
      })
      // Realtime annonces : si statut / locataire_email change → maj annonces map
      // IMPORTANT : merger au lieu de remplacer, car payload.new peut être
      // partiel (la publication peut ne broadcast que les colonnes modifiées).
      // Sinon on perd proprietaire_email/titre/photos → isActiveBail retourne false
      // → la conv bascule en "Candidatures" à tort.
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "annonces" }, (payload) => {
        const ann = payload.new as { id?: number }
        if (!ann?.id || ann.id !== convAnnId) return
        setAnnonces(prev => ({ ...prev, [ann.id as number]: { ...(prev[ann.id as number] || {}), ...ann } }))
      })
      // Realtime bail_signatures : nouvelle signature → reload messages pour
      // refresh BailCard (qui lit les signatures via signaturesParAnnonce),
      // ET refresh de l'annonce liée : la signature locataire bascule statut
      // "bail_envoye" → "loué" côté DB, l'UPDATE Realtime annonces peut tarder
      // selon la publication → on refetch l'annonce ici pour garantir que
      // deriveStatut passe bien à "bail" et la timeline avance.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bail_signatures" }, (payload) => {
        const sig = payload.new as { annonce_id?: number }
        if (!sig?.annonce_id || sig.annonce_id !== convAnnId) return
        if (myEmail) void loadMessages(myEmail, conv.other, convAnnId)
        void (async () => {
          const { data: ann } = await supabase.from("annonces").select("*").eq("id", convAnnId).single()
          if (ann) setAnnonces(prev => ({ ...prev, [ann.id as number]: { ...(prev[ann.id as number] || {}), ...ann } }))
        })()
      })
      // Realtime edl_signatures : idem — permet a EdlCard cote proprio de
      // passer d'"En attente de confirmation" à "Signé par le locataire".
      // Avant ce listener il fallait reload la page manuellement.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "edl_signatures" }, () => {
        if (myEmail) void loadMessages(myEmail, conv.other, convAnnId)
      })
      // Realtime etats_des_lieux : statut "valide" passe -> refresh des cards.
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "etats_des_lieux" }, () => {
        if (myEmail) void loadMessages(myEmail, conv.other, convAnnId)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [convActive, myEmail, conversations])

  async function loadConversations() {
    // Audit silent-failure-hunter HIGH#5 : trois non-null assertions
    // crashaient la page si la session disparaît entre le useEffect et
    // l'appel (NextAuth status flicker au mount). Guard explicite.
    const email = session?.user?.email
    if (!email) return
    const { data } = await supabase.from("messages")
      .select("*")
      .or(`from_email.eq.${email},to_email.eq.${email}`)
      .order("created_at", { ascending: false })

    const convMap = new Map<string, any>()
    const searchBuckets = new Map<string, string[]>()
    const dossierFlags = new Map<string, boolean>()
    const candidatureValideeFlags = new Map<string, boolean>()
    if (data) {
      data.forEach((m: any) => {
        const other = m.from_email === email ? m.to_email : m.from_email
        // Clé SCOPÉE par annonce_id : 2 annonces du même proprio = 2 conv distinctes.
        // Seuls les messages sans annonce_id (rare, ex: premier msg historique)
        // tombent dans une conv "autre" partagée.
        const annId = m.annonce_id || "none"
        const key = [email, other].sort().join("|") + `:${annId}`
        if (!convMap.has(key)) convMap.set(key, { key, other, lastMsg: m, unread: 0, annonceId: m.annonce_id || null })
        if (m.to_email === email && !m.lu) convMap.get(key)!.unread++
        // Index de recherche : on accumule les contenus lowercase, en strippant
        // les préfixes systèmes ([BAIL_CARD]..., [REPLY:42]...) pour ne matcher
        // que le texte utilisateur. JSON des cards reste searchable via le nom
        // de l'annonce déjà filtré ailleurs.
        const raw = typeof m.contenu === "string" ? m.contenu : ""
        // Flag "dossier envoyé" : au moins 1 message [DOSSIER_CARD] dans la conv
        // (envoyé ou reçu). Utilisé par la dérivation de statut `dossier`.
        if (raw.startsWith(DOSSIER_PREFIX)) dossierFlags.set(key, true)
        // Flag "candidature validée" : au moins 1 message type='candidature' avec
        // statut_candidature='validee' dans la conv. Utilisé par deriveStatut
        // pour afficher la pill "Validée" dans la sidebar (Paul 2026-04-26).
        if (m.type === "candidature" && m.statut_candidature === "validee") {
          candidatureValideeFlags.set(key, true)
        }
        const plain = raw
          .replace(/^\[REPLY:\d+\]\n/, "")
          .replace(/^\[\w+[:\]][^\]]*\]/, "")
          .toLowerCase()
        if (plain) {
          const bucket = searchBuckets.get(key) ?? []
          bucket.push(plain)
          searchBuckets.set(key, bucket)
        }
      })
    }
    const dossierFlagsObj: Record<string, boolean> = {}
    for (const [k, v] of dossierFlags) dossierFlagsObj[k] = v
    setConvDossierFlag(dossierFlagsObj)
    const candidatureValideeFlagsObj: Record<string, boolean> = {}
    for (const [k, v] of candidatureValideeFlags) candidatureValideeFlagsObj[k] = v
    setConvCandidatureValideeFlag(candidatureValideeFlagsObj)
    const nextIndex: Record<string, string> = {}
    for (const [k, arr] of searchBuckets) nextIndex[k] = arr.join(" ")
    setSearchIndex(nextIndex)

    if (withEmail && withEmail !== email) {
      // Arrivée depuis un lien ?with=X sans annonce → conv "libre"
      const key = [email, withEmail].sort().join("|") + ":none"
      if (!convMap.has(key)) convMap.set(key, { key, other: withEmail, lastMsg: null, unread: 0, annonceId: null })
    }

    const convList = Array.from(convMap.values())
    setConversations(convList)

    // Fetch photos de profil des peers : priorité à profils.photo_url_custom
    // (avatar uploadé par l'user), fallback users.image (Google OAuth).
    const peerEmails = [...new Set(convList.map(c => (c.other || "").toLowerCase()).filter(Boolean))]
    if (peerEmails.length > 0) {
      // Colonnes matching : permet calcul score cote proprio (peer = candidat)
      // + avatar/tel deja en piggyback depuis 2026-04-23.
      const MATCH_COLS = "email, photo_url_custom, telephone, ville_souhaitee, mode_localisation, budget_max, surface_min, pieces_min, chambres_min, rez_de_chaussee_ok, animaux, meuble, parking, balcon, terrasse, jardin, cave, fibre, ascenseur, dpe_min"
      const [usersRes, profilsRes, myProfileRes] = await Promise.all([
        supabase.from("users").select("email, image").in("email", peerEmails),
        supabase.from("profils").select(MATCH_COLS).in("email", peerEmails),
        // Mon profil pour calculer score cote locataire (score de l'annonce
        // vs mes preferences). Skip silencieusement si erreur (ex. colonnes
        // manquantes en prod) — le score tombera sur 500 neutre.
        supabase.from("profils").select(MATCH_COLS).eq("email", email).maybeSingle(),
      ])
      const map: Record<string, string> = {}
      const phoneMap: Record<string, string> = {}
      const profileMap: Record<string, MatchingProfil> = {}
      // Fallback : Google / provider image
      for (const u of usersRes.data || []) {
        const e = (u as { email?: string | null }).email?.toLowerCase()
        const img = (u as { image?: string | null }).image
        if (e && img) map[e] = img
      }
      // Priorité : avatar custom uploadé par l'user (si colonne présente)
      if (!profilsRes.error) {
        for (const p of profilsRes.data || []) {
          const row = p as Record<string, unknown>
          const e = (row.email as string | undefined)?.toLowerCase()
          const img = row.photo_url_custom as string | null | undefined
          const tel = row.telephone as string | null | undefined
          if (e && img) map[e] = img
          if (e && tel && typeof tel === "string" && tel.trim()) phoneMap[e] = tel.trim()
          if (e) profileMap[e] = row as unknown as MatchingProfil
        }
      }
      setPeerImages(map)
      setPeerPhones(phoneMap)
      setPeerProfiles(profileMap)
      if (!myProfileRes.error && myProfileRes.data) {
        setMyProfile(myProfileRes.data as unknown as MatchingProfil)
      }
    }

    // Fetch les annonces liées (avec locataire_email + statut pour badges +
    // colonnes matching pour score compat affiche dans la liste et le header).
    const ids = [...new Set(convList.map(c => c.annonceId).filter(Boolean))]
    if (ids.length > 0) {
      const { data: ann } = await supabase.from("annonces").select("id, titre, ville, photos, proprietaire_email, locataire_email, statut, prix, surface, pieces, chambres, etage, animaux, meuble, parking, balcon, terrasse, jardin, cave, fibre, ascenseur, dpe").in("id", ids)
      if (ann) {
        const map: Record<number, any> = {}
        ann.forEach((a: any) => { map[a.id] = a })
        setAnnonces(map)
      }
    }

    // Visites batchées pour toutes les convs — alimente la dérivation de
    // statut (visite / rejete) et candidateStatus (confirme). Scopé à moi +
    // annonces des convs. Beaucoup moins cher que d'appeler loadVisitesConv
    // par conv à l'affichage.
    if (ids.length > 0) {
      const me2 = email.toLowerCase()
      let vq = supabase
        .from("visites")
        .select("annonce_id, proprietaire_email, locataire_email, statut")
        .in("annonce_id", ids as number[])
      vq = proprietaireActive ? vq.eq("proprietaire_email", me2) : vq.eq("locataire_email", me2)
      const { data: visites } = await vq
      if (visites) {
        const vmap: Record<string, Array<{ statut: string }>> = {}
        for (const v of visites as any[]) {
          const peer = (proprietaireActive ? v.locataire_email : v.proprietaire_email || "").toString().toLowerCase()
          const annId = v.annonce_id
          if (!peer || annId == null) continue
          const key = [me2, peer].sort().join("|") + `:${annId}`
          if (!vmap[key]) vmap[key] = []
          vmap[key].push({ statut: String(v.statut || "") })
        }
        setConvVisitesMap(vmap)
      }
    }

    // On n'auto-sélectionne une conversation QUE si l'URL contient ?with=X
    // (arrivée depuis une annonce / un lien direct). Sinon, au reload normal,
    // l'utilisateur arrive sur la liste sans conv ouverte — il choisit.
    // Si ?annonce=N est aussi fourni, on cherche la conv scopée a ce bien
    // (cas proprio qui clique "Repondre" sur une candidature d'un bien donne).
    if (withEmail) {
      const annParam = searchParams.get("annonce")
      const annId = annParam ? Number(annParam) : null
      const target = (annId != null && !Number.isNaN(annId))
        ? convList.find(c => c.other === withEmail && c.annonceId === annId)
          ?? convList.find(c => c.other === withEmail) // fallback si conv scopée pas trouvée
        : convList.find(c => c.other === withEmail)
      if (target) {
        setConvActive(target.key)
        loadMessages(email, target.other, target.annonceId)
        loadVisitesConv(target.other, target.annonceId)
      }
    }
    setLoading(false)
  }

  async function loadMessages(email: string, other: string, annonceId?: number | null) {
    const me = email.toLowerCase()
    const peer = other.toLowerCase()
    const [{ data: sent }, { data: received }] = await Promise.all([
      supabase.from("messages").select("*").eq("from_email", me).eq("to_email", peer),
      supabase.from("messages").select("*").eq("from_email", peer).eq("to_email", me),
    ])
    let all = [...(sent || []), ...(received || [])]
    // Scope par annonce — une conv est liée à UNE annonce. Les messages
    // sans annonce_id apparaissent dans la conv "libre" (annonceId=null).
    if (annonceId != null) {
      all = all.filter(m => m.annonce_id === annonceId)
    } else {
      all = all.filter(m => !m.annonce_id)
    }
    const data = all.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    setMessages(data)
    // Marquer lus seulement les messages de cette conv
    const unreadIds = data.filter(m => m.to_email?.toLowerCase() === me && !m.lu).map(m => m.id)
    if (unreadIds.length > 0) {
      await supabase.from("messages").update({ lu: true }).in("id", unreadIds)
    }
    setConversations(prev => prev.map(c => c.other === other && c.annonceId === (annonceId ?? null) ? { ...c, unread: 0 } : c))

    // Fetch signatures EDL pour tous les [EDL_CARD] rencontres dans la conv.
    // Le badge "En attente de confirmation" cote proprio a besoin de savoir
    // si le locataire a signé. Regroupé en 1 requête pour éviter N round-trips.
    const edlIds: number[] = []
    for (const m of data) {
      if (typeof m.contenu === "string" && m.contenu.startsWith("[EDL_CARD]")) {
        try {
          const payload = JSON.parse(m.contenu.slice("[EDL_CARD]".length))
          if (payload?.edlId) edlIds.push(Number(payload.edlId))
        } catch { /* ignore */ }
      }
    }
    if (edlIds.length > 0) {
      const { data: sigs } = await supabase
        .from("edl_signatures")
        .select("edl_id, signataire_role")
        .in("edl_id", edlIds)
      const map: Record<number, { locataire: boolean; bailleur: boolean }> = {}
      edlIds.forEach(id => { map[id] = { locataire: false, bailleur: false } })
      if (sigs) {
        for (const s of sigs) {
          const id = Number(s.edl_id)
          if (!map[id]) map[id] = { locataire: false, bailleur: false }
          if (s.signataire_role === "locataire") map[id].locataire = true
          if (s.signataire_role === "bailleur") map[id].bailleur = true
        }
      }
      setEdlSignatures(prev => ({ ...prev, ...map }))
    }
  }

  /**
   * Ecoute les events "typing" broadcast sur le channel de la conv active.
   * Quand un peer broadcast, on set peerTyping=true pour 3s (reset via
   * timeout a chaque nouveau signal). Channel eject quand convActive change
   * ou quand le composant demount.
   */
  /**
   * Ecoute les events "typing" broadcast sur le channel de la conv active.
   * On filtre par tabId (et pas par email) : ca marche meme si l'user ouvre
   * 2 sessions du meme compte (dev, test). broadcast.self reste false pour
   * ne pas recevoir un echo immediat de son propre send.
   */
  useEffect(() => {
    if (!convActive || !myEmail) { setPeerTyping(false); return }
    const myTabId = myTabIdRef.current
    const channel = supabase.channel(`typing:${convActive}`, {
      config: { broadcast: { self: false } },
    })
    channel.on("broadcast", { event: "typing" }, (payload) => {
      const tabId = (payload.payload as { tabId?: string } | undefined)?.tabId
      if (!tabId || tabId === myTabId) return
      setPeerTyping(true)
      if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current)
      peerTypingTimeoutRef.current = setTimeout(() => setPeerTyping(false), 3000)
    })
    channel.subscribe()
    typingChannelRef.current = channel
    return () => {
      supabase.removeChannel(channel)
      typingChannelRef.current = null
      if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current)
      setPeerTyping(false)
    }
  }, [convActive, myEmail])

  /**
   * Broadcast "en train d'écrire" sur le channel de la conv active.
   * Throttled à 2s. Envoie tabId (pas email) — les autres tabs du meme
   * compte recevront et afficheront.
   */
  function signalTyping() {
    if (!convActive || !myEmail) return
    const channel = typingChannelRef.current
    if (!channel) return
    const now = Date.now()
    if (now - typingLastSentRef.current < 2000) return
    typingLastSentRef.current = now
    channel.send({
      type: "broadcast",
      event: "typing",
      payload: { tabId: myTabIdRef.current, at: now },
    }).catch(() => { /* silent */ })
  }

  async function envoyer() {
    if (!nouveau.trim() || !convActive || !myEmail) return
    setEnvoi(true)
    const conv = conversations.find(c => c.key === convActive)
    if (!conv) return
    const contenuFinal = encodeReply(replyTo?.id ?? null, nouveau.trim())
    // Propager annonce_id pour que le message reste scope à la conv du bien
    const msg: Record<string, unknown> = {
      from_email: myEmail,
      to_email: conv.other,
      contenu: contenuFinal,
      lu: false,
      created_at: new Date().toISOString(),
    }
    if (conv.annonceId) msg.annonce_id = conv.annonceId
    // On garde le contenu en mémoire avant clear : si l'insert échoue,
    // on le restitue dans l'input pour ne pas perdre le message du user.
    const draftBackup = nouveau
    const { data, error } = await supabase.from("messages").insert([msg]).select().single()
    if (error || !data) {
      // Silent failure historique (audit silent-failure-hunter HIGH#1) :
      // l'utilisateur croyait son message envoyé alors qu'aucun row n'était
      // inséré (RLS, réseau). On signale clairement et on remet le draft.
      console.error("[messages] envoyer: insert failed", error)
      setNouveau(draftBackup)
      setEnvoi(false)
      alert("Votre message n'a pas pu être envoyé. Vérifiez votre connexion et réessayez.")
      return
    }
    setMessages(prev => [...prev, data])
    setConversations(prev => prev.map(c => c.key === convActive ? { ...c, lastMsg: data } : c))
    // Notif cloche pour le destinataire (n'apparaît pas si lui-même est sur /messages — géré côté UI)
    void postNotif({
      userEmail: conv.other,
      type: "message",
      title: "Nouveau message",
      body: nouveau.trim().slice(0, 120),
      href: "/messages",
      relatedId: data?.id != null ? String(data.id) : null,
    })
    // Email de notification au destinataire (respecte les préfs + rate-limit)
    void fetch("/api/notifications/new-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: conv.other,
        preview: nouveau.trim(),
        convUrl: "/messages",
      }),
    }).catch(() => { /* silent */ })
    setNouveau("")
    setReplyTo(null)
    setEnvoi(false)
    inputRef.current?.focus()
  }

  async function supprimerMessage(id: number) {
    if (!confirm("Supprimer ce message ?")) return
    // Optimistic : retirer direct, DB sync en arrière-plan
    const backup = messages.find(m => m.id === id)
    setMessages(prev => prev.filter(m => m.id !== id))
    setMenuMsgId(null)
    const { error } = await supabase.from("messages").delete().eq("id", id)
    if (error && backup) {
      // Rollback si échec
      setMessages(prev => [...prev, backup].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()))
      alert("Impossible de supprimer le message")
    }
  }

  async function copierMessage(contenu: string) {
    const { text } = parseReply(contenu)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Fallback silencieux si clipboard API indisponible
    }
    setMenuMsgId(null)
  }

  function repondreMessage(m: any) {
    const { text } = parseReply(m.contenu)
    setReplyTo({ id: m.id, contenu: text, from: m.from_email })
    setMenuMsgId(null)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  async function envoyerDossier() {
    if (!convActive || !myEmail) return
    const conv = conversations.find(c => c.key === convActive)
    if (!conv) return

    // Confirmation explicite avant envoi : l'envoi génère un lien de partage
    // actif 30 jours qui donne accès aux pièces justificatives — on évite
    // l'envoi par mégarde ou par double-clic.
    const annonceTitre = conv.annonceId && annonces[conv.annonceId]?.titre ? annonces[conv.annonceId].titre : null
    const confirmMsg = annonceTitre
      ? `Envoyer votre dossier à ${conv.other} pour « ${annonceTitre} » ?\n\nUn lien de consultation sera généré (valide 30 jours, révocable depuis votre profil).`
      : `Envoyer votre dossier à ${conv.other} ?\n\nUn lien de consultation sera généré (valide 30 jours, révocable depuis votre profil).`
    if (!window.confirm(confirmMsg)) return

    setEnvoyantDossier(true)

    const { data: profil } = await supabase.from("profils")
      .select("prenom,nom,situation_pro,revenus_mensuels,garant,type_garant,nb_occupants,dossier_docs")
      .eq("email", myEmail).single()

    let score = 0
    if (profil) {
      if (profil.prenom || profil.nom) score += 15
      if (profil.situation_pro) score += 15
      if (profil.revenus_mensuels) score += 20
      if (profil.dossier_docs) {
        const keys = ["identite", "bulletins", "avis_imposition", "contrat", "quittances"]
        const filled = keys.filter(k => { const v = (profil.dossier_docs as any)[k]; return Array.isArray(v) ? v.length > 0 : !!v })
        score += Math.round((filled.length / keys.length) * 50)
      }
    }

    // Génère un lien de partage sécurisé (HMAC 30j) pour que le proprio
    // puisse consulter les pièces justificatives directement.
    // Label = destinataire [+ titre annonce] pour permettre au locataire de
    // retrouver/révoquer le lien depuis /parametres > partages.
    const labelBase = annonceTitre ? `${conv.other} — ${annonceTitre}` : conv.other
    const label = labelBase.slice(0, 80)
    let shareUrl: string | null = null
    try {
      const res = await fetch("/api/dossier/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 30, label }),
      })
      const json = await res.json()
      if (res.ok && json.success) shareUrl = json.url
    } catch { /* silent — le dossier est envoyé sans lien, le proprio verra juste le récap */ }

    const payload = {
      email: myEmail,
      nom: formatNomComplet(profil) || session?.user?.name || "",
      situation_pro: profil?.situation_pro || "",
      revenus_mensuels: profil?.revenus_mensuels || "",
      garant: profil?.garant || false,
      type_garant: profil?.type_garant || "",
      nb_occupants: profil?.nb_occupants || 1,
      score: Math.min(score, 100),
      shareUrl,
    }
    const msgBody: Record<string, unknown> = {
      from_email: myEmail,
      to_email: conv.other,
      contenu: DOSSIER_PREFIX + JSON.stringify(payload),
      lu: false,
      created_at: new Date().toISOString(),
    }
    if (conv.annonceId) msgBody.annonce_id = conv.annonceId
    const { data } = await supabase.from("messages").insert([msgBody]).select().single()
    if (data) {
      setMessages(prev => [...prev, data])
      setConversations(prev => prev.map(c => c.key === convActive ? { ...c, lastMsg: data } : c))
    }
    setEnvoyantDossier(false)
  }

  async function supprimerConversation(key: string) {
    setSupprimant(key)
    const conv = conversations.find(c => c.key === key)
    if (!conv || !myEmail) { setSupprimant(null); return }
    // ⚠ IMPORTANT : ne supprimer QUE les messages de CETTE conversation
    // (scopée par annonce_id). Avant, le delete étendu nuquait aussi les
    // convs des autres annonces entre les 2 mêmes emails.
    let query = supabase.from("messages")
      .delete()
      .or(`and(from_email.eq.${myEmail},to_email.eq.${conv.other}),and(from_email.eq.${conv.other},to_email.eq.${myEmail})`)
    if (conv.annonceId != null) {
      query = query.eq("annonce_id", conv.annonceId)
    } else {
      query = query.is("annonce_id", null)
    }
    const { error } = await query
    if (error) {
      alert(`Suppression échouée : ${error.message}`)
      setSupprimant(null)
      return
    }
    setConversations(prev => prev.filter(c => c.key !== key))
    if (convActive === key) { setConvActive(null); setMessages([]) }
    setSupprimant(null)
  }

  async function marquerLu(conv: any) {
    // Scope par annonce_id pour ne pas marquer lus les msgs d'autres convs
    let q = supabase.from("messages").update({ lu: true }).eq("to_email", myEmail!).eq("from_email", conv.other)
    if (conv.annonceId != null) q = q.eq("annonce_id", conv.annonceId)
    else q = q.is("annonce_id", null)
    await q
    setConversations(prev => prev.map(c => c.key === conv.key ? { ...c, unread: 0 } : c))
  }

  function archiveStorageKey(email: string) {
    return `nestmatch:archivedConvs:${email.toLowerCase()}`
  }

  function toggleArchive(key: string) {
    if (!myEmail) return
    setArchivedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      try { localStorage.setItem(archiveStorageKey(myEmail), JSON.stringify([...next])) } catch { /* quota exceeded — on ignore */ }
      return next
    })
    if (convActive === key) { setConvActive(null); setMessages([]) }
  }

  async function loadVisitesConv(otherEmail: string, annonceId?: number | null) {
    if (!myEmail) return
    const me = myEmail.toLowerCase()
    const other = otherEmail.toLowerCase()
    let query = supabase.from("visites").select("*")
    if (proprietaireActive) {
      query = query.eq("proprietaire_email", me).eq("locataire_email", other)
    } else {
      query = query.eq("locataire_email", me).eq("proprietaire_email", other)
    }
    if (annonceId) query = query.eq("annonce_id", annonceId)
    const { data } = await query
      .in("statut", ["proposée", "confirmée", "annulée"])
      .order("date_visite", { ascending: true })
    // On garde TOUTES les visites de la conv ; le split actives / annulées
    // est géré au rendu (section historique collapsible).
    setVisitesConv(data || [])
  }

  async function demanderDossier() {
    if (!convActive || !myEmail) return
    setDemandantDossier(true)
    const conv = conversations.find(c => c.key === convActive)
    if (!conv) { setDemandantDossier(false); return }
    const msg = {
      from_email: myEmail,
      to_email: conv.other,
      contenu: DEMANDE_DOSSIER_PREFIX,
      lu: false,
      annonce_id: conv.annonceId ?? null, // rattache au bien
      created_at: new Date().toISOString(),
    }
    const { data } = await supabase.from("messages").insert([msg]).select().single()
    if (data) {
      setMessages(prev => [...prev, data])
      setConversations(prev => prev.map(c => c.key === convActive ? { ...c, lastMsg: data } : c))
    }
    setDemandantDossier(false)
  }

  async function changerStatutVisite(id: string, statut: string) {
    if (!myEmail) return
    const visite = visitesConv.find(v => v.id === id)
    if (!visite) return
    const { data: rows, error } = await supabase
      .from("visites")
      .update({ statut })
      .eq("id", id)
      .select("id")
    if (error) {
      alert(`Erreur : ${error.message}`)
      return
    }
    if (!rows || rows.length === 0) {
      alert("Aucune visite mise à jour — elle a peut-être déjà été modifiée.")
      return
    }
    setVisitesConv(prev => prev.map(v => v.id === id ? { ...v, statut } : v))
    // Poster un message automatique pour informer l'autre partie
    const other = visite.proprietaire_email === myEmail ? visite.locataire_email : visite.proprietaire_email
    const dateFormatee = formatVisiteDate(visite.date_visite, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    let contenu: string
    if (statut === "confirmée") {
      // Card visuelle plutôt que texte brut — rendu via VisiteConfirmeeCard
      const payload = JSON.stringify({
        visiteId: id,
        dateVisite: visite.date_visite,
        heure: visite.heure,
        dateFormatee,
      })
      contenu = `${VISITE_CONFIRMEE_PREFIX}${payload}`
    } else {
      contenu = `Statut de visite mis à jour : ${statut}.`
    }
    const { data: msg } = await supabase.from("messages").insert([{
      from_email: myEmail, to_email: other, contenu, lu: false,
      annonce_id: visite.annonce_id ?? null,
      created_at: new Date().toISOString(),
    }]).select().single()
    if (msg) {
      setMessages(prev => [...prev, msg])
      setConversations(prev => prev.map(c => c.key === convActive ? { ...c, lastMsg: msg } : c))
    }
    // Notif cloche à l'autre partie (confirmation ou annulation)
    if (statut === "confirmée" || statut === "annulée") {
      const dateStr = visite.date_visite ? new Date(visite.date_visite).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : ""
      void postNotif({
        userEmail: other,
        type: statut === "confirmée" ? "visite_confirmee" : "visite_annulee",
        title: statut === "confirmée" ? "Visite confirmée" : "Visite annulée",
        body: `${dateStr} à ${visite.heure || ""}`,
        href: "/visites",
        relatedId: String(id),
      })
    }
  }

  async function handleAnnulerVisite(motif: string) {
    if (!visiteCancelTarget || !myEmail) return
    const v = visiteCancelTarget.v
    // Destinataire = l'autre partie de la visite
    const toEmail = v.proprietaire_email === myEmail ? v.locataire_email : v.proprietaire_email
    const res = await annulerVisite({
      visiteId: v.id,
      fromEmail: myEmail,
      toEmail,
      dateVisite: v.date_visite,
      heureVisite: v.heure,
      motif,
      statutActuel: v.statut,
      annonceId: v.annonce_id ?? null,
    })
    if (res.ok) {
      setVisitesConv(prev => prev.map(x => x.id === v.id ? { ...x, statut: "annulée" } : x))
      // Actualiser les messages pour voir le message auto-posté
      if (convActive) {
        const conv = conversations.find(c => c.key === convActive)
        if (conv) loadMessages(myEmail, conv.other, conv.annonceId)
      }
      setVisiteCancelTarget(null)
    } else {
      // Erreur visible — avant c'était un échec silencieux qui donnait l'impression
      // que le bouton ne fonctionnait pas.
      alert(res.error || "L'annulation a échoué — réessayez.")
    }
  }

  async function proposerVisite(params?: { slots?: Array<{ date: string; heure: string }>; date?: string; heure?: string; message?: string; format?: "physique" | "visio" }) {
    // R10.8 — accepte jusqu'à 5 créneaux via `slots[]`. Pour rétro-compat,
    // un couple { date, heure } isolé est promu en slot unique.
    const slots: Array<{ date: string; heure: string }> = (() => {
      if (params?.slots && params.slots.length > 0) return params.slots
      const d = params?.date ?? visiteDate
      const h = params?.heure ?? visiteHeure
      if (d && h) return [{ date: d, heure: h }]
      return []
    })()
    const primary = slots[0]
    const vMessage = params?.message ?? visiteMessage
    const vFormat: "physique" | "visio" = params?.format || "physique"
    if (!convActiveData?.annonceId || !myEmail || !primary) return
    setEnvoyantVisite(true)
    const isCounter = !!counterTarget
    const propEmail = proprietaireActive ? myEmail : convActiveData.other
    const locEmail  = proprietaireActive ? convActiveData.other : myEmail

    // Si contre-proposition : annuler l'ancienne visite (en base + local).
    if (isCounter && counterTarget?.id) {
      const { data: updated, error: updErr } = await supabase
        .from("visites")
        .update({ statut: "annulée" })
        .eq("id", counterTarget.id)
        .select("id")
      if (updErr || !updated || updated.length === 0) {
        alert(
          "Impossible d'annuler la demande initiale — la contre-proposition ne peut pas être envoyée. " +
            (updErr?.message || "Aucune ligne mise à jour."),
        )
        setEnvoyantVisite(false)
        return
      }
      setVisitesConv(prev => prev.map(v => v.id === counterTarget.id ? { ...v, statut: "annulée" } : v))
    }

    // Insert d'une visite DB avec le 1er slot comme colonne primaire. Les autres
    // créneaux voyagent dans le payload message (pas besoin de colonnes DB en
    // plus — choisirSlotVisite() mettra à jour date_visite/heure au moment du
    // choix locataire).
    const { data: visite } = await supabase.from("visites").insert([{
      annonce_id: convActiveData.annonceId,
      proprietaire_email: propEmail.toLowerCase(),
      locataire_email: locEmail.toLowerCase(),
      date_visite: primary.date,
      heure: primary.heure,
      format: vFormat,
      message: vMessage.trim() || null,
      statut: "proposée",
      propose_par: myEmail.toLowerCase(),
    }]).select().single()
    if (visite) {
      setVisitesConv(prev => [...prev, visite])
      const dateFormatee = formatVisiteDate(primary.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      // R10.8 — slots[] inclus pour rendu multi-créneaux (undefined si 1 seul
      // pour garder les anciens payloads courts).
      const payload = JSON.stringify({
        visiteId: visite.id,
        dateVisite: primary.date,
        heure: primary.heure,
        dateFormatee,
        message: vMessage.trim() || null,
        isCounter,
        format: vFormat,
        slots: slots.length > 1 ? slots : undefined,
      })
      const contenu = `${VISITE_DEMANDE_PREFIX}${payload}`
      const { data: msg } = await supabase.from("messages").insert([{
        from_email: myEmail,
        to_email: convActiveData.other,
        contenu,
        lu: false,
        annonce_id: convActiveData.annonceId,
        created_at: new Date().toISOString(),
      }]).select().single()
      if (msg) {
        setMessages(prev => [...prev, msg])
        setConversations(prev => prev.map(c => c.key === convActive ? { ...c, lastMsg: msg } : c))
      }
      const countHint = slots.length > 1 ? ` (${slots.length} créneaux)` : ""
      const formatHint = vFormat === "visio" ? " — visio" : ""
      void postNotif({
        userEmail: convActiveData.other,
        type: "visite_proposee",
        title: isCounter ? "Contre-proposition de visite" : "Nouvelle demande de visite",
        body: `${dateFormatee} à ${primary.heure}${countHint}${formatHint}`,
        href: "/visites",
        relatedId: String(visite.id),
      })
    }
    setShowVisiteForm(false)
    setCounterTarget(null)
    setVisiteDate("")
    setVisiteHeure("10:00")
    setVisiteMessage("")
    setEnvoyantVisite(false)
  }

  // R10.8 — le locataire (ou le destinataire de la proposition) choisit un slot
  // parmi ceux proposés. On met à jour la visite (statut confirmée + date/heure
  // retenues) et on émet une VISITE_CONFIRMEE. Les autres slots deviennent
  // automatiquement "non retenus" côté UI (via comparaison date/heure).
  async function choisirSlotVisite(visiteId: string, slot: { date: string; heure: string }) {
    if (!myEmail) return
    const visite = visitesConv.find(v => v.id === visiteId)
    if (!visite) return
    if (visite.statut !== "proposée") return
    const { data: rows, error } = await supabase
      .from("visites")
      .update({
        statut: "confirmée",
        date_visite: slot.date,
        heure: slot.heure,
      })
      .eq("id", visiteId)
      .select("id")
    if (error) {
      alert(`Erreur lors du choix du créneau : ${error.message}`)
      return
    }
    if (!rows || rows.length === 0) {
      alert("Aucune visite mise à jour — elle a peut-être déjà été traitée.")
      return
    }
    setVisitesConv(prev => prev.map(v =>
      v.id === visiteId ? { ...v, statut: "confirmée", date_visite: slot.date, heure: slot.heure } : v
    ))
    const other = visite.proprietaire_email === myEmail ? visite.locataire_email : visite.proprietaire_email
    const dateFormatee = formatVisiteDate(slot.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    const payload = JSON.stringify({
      visiteId,
      dateVisite: slot.date,
      heure: slot.heure,
      dateFormatee,
    })
    const contenu = `${VISITE_CONFIRMEE_PREFIX}${payload}`
    const { data: msg } = await supabase.from("messages").insert([{
      from_email: myEmail, to_email: other, contenu, lu: false,
      annonce_id: visite.annonce_id ?? null,
      created_at: new Date().toISOString(),
    }]).select().single()
    if (msg) {
      setMessages(prev => [...prev, msg])
      setConversations(prev => prev.map(c => c.key === convActive ? { ...c, lastMsg: msg } : c))
    }
    void postNotif({
      userEmail: other,
      type: "visite_confirmee",
      title: "Créneau retenu",
      body: `${dateFormatee} à ${slot.heure}`,
      href: "/visites",
      relatedId: String(visiteId),
    })
  }

  const { isMobile } = useResponsive()
  const convActiveData = conversations.find(c => c.key === convActive)
  const annonceActive = convActiveData?.annonceId ? annonces[convActiveData.annonceId] : null

  // Statut DB de la candidature active : true UNIQUEMENT si le proprio a
  // explicitement cliqué "Valider la candidature" (statut_candidature='validee'
  // posé sur le 1er message type='candidature' de cette conv).
  // BUG fix Paul 2026-04-26 : avant `candidatureValidee` retournait `true` côté
  // proprio inconditionnellement → le bouton "Valider" n'apparaissait jamais
  // (`!candidatureValidee` toujours false), et le badge "Validée" s'affichait
  // en permanence côté proprio (faux positif). Désormais cette variable
  // reflète UNIQUEMENT l'état DB ; le gating "le locataire peut proposer une
  // visite" est géré séparément via `peutProposerVisite` ci-dessous.
  const isCandidatureValideeDB = (() => {
    if (!convActiveData?.annonceId) return false
    // Côté proprio : on cherche le 1er message candidature ENTRANT (locataire → proprio).
    // Côté locataire : on cherche son propre 1er message candidature (locataire → proprio).
    const candidatLocataireEmail = proprietaireActive
      ? (convActiveData.other || "").toLowerCase()
      : (myEmail || "").toLowerCase()
    const candMsg = messages.find(m =>
      (m as { type?: string }).type === "candidature" &&
      (m.from_email || "").toLowerCase() === candidatLocataireEmail
    )
    if (!candMsg) return false
    return (candMsg as { statut_candidature?: string }).statut_candidature === "validee"
  })()

  // Gating "Proposer une visite" côté locataire : tant que la candidature
  // n'est pas validée par le proprio, le locataire ne peut pas proposer.
  // Le proprio est exempté (il propose à ses candidats sans pré-validation).
  // Si pas de candidature liée (conv libre sans annonce), pas de gating.
  const peutProposerVisite = proprietaireActive || !convActiveData?.annonceId || isCandidatureValideeDB

  // Alias pour compat des anciens callsites (locked={!candidatureValidee})
  // qui font référence au gating visite, pas au statut DB.
  const candidatureValidee = peutProposerVisite

  // Score compat de la conv active — cote locataire = annonce vs myProfile,
  // cote proprio = annonce vs profil candidat (peerProfile). Null si donnees
  // manquantes (pas d'annonce liee, ou profil vide).
  function computeConvScore(conv: { other: string; annonceId: number | null } | null | undefined): number | null {
    if (!conv || !conv.annonceId) return null
    const ann = annonces[conv.annonceId] as MatchingAnnonce | undefined
    if (!ann) return null
    const profil = proprietaireActive
      ? peerProfiles[(conv.other || "").toLowerCase()]
      : myProfile
    if (!profil) return null
    return calculerScore(ann, profil)
  }

  // Couleur score alignée sur le handoff keymatch-design-system (messages.jsx) :
  // 3 tiers stricts ≥80 vert / ≥60 orange / <60 rouge. Plus lisible que l'échelle
  // 5-tier du matching v3 pour un badge compact in-conv.
  function matchColor(pct: number): string {
    return pct >= 80 ? "#15803d" : pct >= 60 ? "#a16207" : "#b91c1c"
  }
  function compatBadge(score: number | null) {
    if (score === null) return null
    const pct = Math.round(score / 10)
    return { pct, color: matchColor(pct) }
  }

  // Dérive le statut d'une conv (handoff messages.jsx) — priorité haut→bas :
  //   bail > visite > rejete > dossier > contact
  // Règles alignées sur CLAUDE_CODE.md du handoff.
  function deriveStatut(conv: { key: string; other: string; annonceId: number | null }): StatutConv {
    const ann = conv.annonceId != null ? annonces[conv.annonceId] : null
    const meL = (myEmail || "").toLowerCase()
    const otherL = (conv.other || "").toLowerCase()
    // 1. bail — annonce louée + match locataire_email
    if (ann?.statut === "loué" && ann.locataire_email) {
      const loc = String(ann.locataire_email).toLowerCase()
      if (otherL === loc || meL === loc) return "bail"
    }
    const visites = convVisitesMap[conv.key] || []
    // 2. visite — au moins 1 visite active (proposée / confirmée / effectuée)
    const actives = visites.filter(v => v.statut === "proposée" || v.statut === "confirmée" || v.statut === "effectuée")
    if (actives.length > 0) return "visite"
    // 3. rejete — visites existent mais toutes annulées
    if (visites.length > 0 && visites.every(v => v.statut === "annulée")) return "rejete"
    // 4. validee — candidature explicitement validée par le proprio (mig 022)
    if (convCandidatureValideeFlag[conv.key]) return "validee"
    // 5. dossier — [DOSSIER_CARD] détecté
    if (convDossierFlag[conv.key]) return "dossier"
    // 6. contact — par défaut
    return "contact"
  }

  // Statut candidat (proprio side uniquement) — qualifie la relation.
  function deriveCandidateStatus(conv: { key: string; other: string; annonceId: number | null }): StatutCandidat {
    if (!proprietaireActive) return "standard"
    const ann = conv.annonceId != null ? annonces[conv.annonceId] : null
    const otherL = (conv.other || "").toLowerCase()
    if (ann?.statut === "loué" && ann.locataire_email && String(ann.locataire_email).toLowerCase() === otherL) {
      return "locataire"
    }
    const visites = convVisitesMap[conv.key] || []
    if (visites.some(v => v.statut === "confirmée" || v.statut === "effectuée")) return "confirme"
    return "standard"
  }

  // Détection "bail actif" pour la conv : annonce liée a un statut loué ou
  // bail_envoye (en attente signature) + l'autre interlocuteur EST le
  // locataire (côté proprio) OU le proprio (côté locataire).
  const me = (myEmail || "").toLowerCase()
  const isActiveBail = (conv: { other: string; annonceId: number | null }) => {
    if (!conv.annonceId) return false
    const ann = annonces[conv.annonceId]
    if (!ann) return false
    if ((ann.statut !== "loué" && ann.statut !== "bail_envoye") || !ann.locataire_email) return false
    const loc = (ann.locataire_email || "").toLowerCase()
    const prop = (ann.proprietaire_email || "").toLowerCase()
    const other = (conv.other || "").toLowerCase()
    // Proprio côté : je suis le proprio du bien ET l'autre est le locataire actif
    if (prop === me && other === loc) return true
    // Locataire côté : je suis le locataire actif ET l'autre est le proprio
    if (loc === me && other === prop) return true
    return false
  }

  // getTab() — classifie une conv dans 1 des 4 onglets (Paul 2026-04-26).
  // Sémantique "Autre" : sans annonce_id OU statut dérivé "rejete" (refus
  // historique = autre candidat a signé).
  const getTab = (conv: { key: string; other: string; annonceId: number | null }): MessagesTab => {
    if (isActiveBail(conv)) return "locataire"
    if (!conv.annonceId) return "autre"
    if (deriveStatut(conv) === "rejete") return "autre"
    if (convCandidatureValideeFlag[conv.key]) return "valide"
    return "candidat"
  }

  // Désélection automatique : si on change d'onglet et que la conv active
  // n'appartient plus à l'onglet courant, on déselectionne pour éviter le
  // cas désorientant "panneau droit affiche une conv invisible à gauche".
  // Déclenché uniquement sur changement de messagesTab via une ref de garde.
  const prevTabRef = useRef(messagesTab)
  useEffect(() => {
    if (prevTabRef.current === messagesTab) return
    prevTabRef.current = messagesTab
    if (!convActive) return
    const conv = conversations.find(c => c.key === convActive)
    if (!conv) return
    const convTab = getTab(conv)
    const stillVisible = proprietaireActive
      ? convTab === messagesTab
      : (messagesTab === "locataire" ? convTab === "locataire" : convTab !== "locataire")
    if (!stillVisible) setConvActive(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesTab])

  const convsFiltrees = conversations
    // Onglet primaire : 4 onglets stricts côté proprio (candidat/valide/locataire/autre).
    // Côté locataire on conserve la dichotomie 2-onglets en mappant
    // "locataire"=mon bail, le reste=mes candidatures (incluant validées et autre).
    .filter(c => {
      const t = getTab(c)
      if (proprietaireActive) return t === messagesTab
      // Locataire : "locataire" = mon bail, sinon = mes candidatures (toutes)
      if (messagesTab === "locataire") return t === "locataire"
      return t !== "locataire"
    })
    .filter(c => showArchived ? archivedKeys.has(c.key) : !archivedKeys.has(c.key))
    .filter(c => bienFilter === "all" ? true : c.annonceId === bienFilter)
    // Filtre par statut dérivé (pills) — pertinent surtout dans onglet "candidat"
    // ou "autre" ; dans "locataire"/"valide" le statut est implicite.
    .filter(c => statusFilter === "all" ? true : deriveStatut(c) === statusFilter)
    .filter(c => {
      if (!recherche) return true
      const needle = recherche.toLowerCase()
      // Match classique : email interlocuteur + titre annonce
      if (c.other.toLowerCase().includes(needle)) return true
      if ((annonces[c.annonceId]?.titre || "").toLowerCase().includes(needle)) return true
      // Match dans TOUS les messages de la conv (pas juste le dernier) via
      // searchIndex alimenté par loadConversations.
      if ((searchIndex[c.key] || "").includes(needle)) return true
      return false
    })
    // Tri : conversations non lues en premier, puis par date du dernier message (recent d'abord)
    .slice()
    .sort((a, b) => {
      if ((a.unread > 0) !== (b.unread > 0)) return a.unread > 0 ? -1 : 1
      const da = a.lastMsg?.created_at ? new Date(a.lastMsg.created_at).getTime() : 0
      const db = b.lastMsg?.created_at ? new Date(b.lastMsg.created_at).getTime() : 0
      return db - da
    })

  // Compteurs par onglet (Paul 2026-04-26) — exclut les archivés.
  const countByTab: Record<MessagesTab, number> = { candidat: 0, valide: 0, locataire: 0, autre: 0 }
  for (const c of conversations) {
    if (archivedKeys.has(c.key)) continue
    countByTab[getTab(c)] += 1
  }
  // Compat noms historiques utilisés ailleurs dans le fichier (auto-bascule).
  const countActifs = countByTab.locataire
  const countCandidats = countByTab.candidat + countByTab.valide + countByTab.autre
  const countArchived = conversations.filter(c => archivedKeys.has(c.key)).length

  // Pool pour compter les pills de statut — on applique tab + archive + bien,
  // mais pas la recherche ni le statusFilter lui-meme (pour afficher la vraie
  // distribution). Handoff : messages.jsx L156-161.
  const statutPool = conversations
    .filter(c => {
      const t = getTab(c)
      if (proprietaireActive) return t === messagesTab
      if (messagesTab === "locataire") return t === "locataire"
      return t !== "locataire"
    })
    .filter(c => showArchived ? archivedKeys.has(c.key) : !archivedKeys.has(c.key))
    .filter(c => bienFilter === "all" ? true : c.annonceId === bienFilter)
  const statutCounts: Record<StatutConv | "all", number> = {
    all: statutPool.length, contact: 0, dossier: 0, validee: 0, visite: 0, bail: 0, rejete: 0,
  }
  for (const c of statutPool) {
    const s = deriveStatut(c)
    statutCounts[s] = (statutCounts[s] || 0) + 1
  }

  // Default tab intelligent : priorité Locataire > Candidat > Validé > Autre
  // selon ce qui n'est pas vide. Évite la liste vide au premier load.
  // SKIP si l'user a déjà choisi un onglet (restauré depuis localStorage) —
  // l'auto-switch ne doit pas écraser une préférence explicite, même si
  // l'onglet restauré est vide (ex. plus de candidatures validées en cours).
  useEffect(() => {
    if (tabInitialized || loading || restoredFromStorage) return
    if (conversations.length > 0) {
      const order: MessagesTab[] = ["locataire", "candidat", "valide", "autre"]
      const firstNonEmpty = order.find(t => countByTab[t] > 0)
      if (firstNonEmpty && countByTab[messagesTab] === 0) {
        setMessagesTab(firstNonEmpty)
      }
      setTabInitialized(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.length, loading, tabInitialized, restoredFromStorage])

  const dossierDejaEnvoye = messages.some(m =>
    typeof m.contenu === "string" && m.contenu.startsWith(DOSSIER_PREFIX)
  )

  // Signatures : on scanne tous les [BAIL_SIGNE] messages de la conv pour construire
  // un index { annonceId → [{role, nom, dateSignature}] }.
  const signaturesParAnnonce: Record<number, BailSignatureSummary[]> = {}
  messages.forEach(m => {
    if (typeof m.contenu === "string" && m.contenu.startsWith(BAIL_SIGNE_PREFIX) && m.annonce_id) {
      try {
        const p = JSON.parse(m.contenu.slice(BAIL_SIGNE_PREFIX.length))
        if (p && typeof p === "object" && p.role) {
          const arr = signaturesParAnnonce[m.annonce_id] || []
          // Dédup : on garde la dernière signature par rôle
          const filtered = arr.filter((s: BailSignatureSummary) => s.role !== p.role)
          filtered.push({
            role: String(p.role),
            nom: String(p.nom || m.from_email || ""),
            dateSignature: String(p.dateSignature || m.created_at),
          })
          signaturesParAnnonce[m.annonce_id] = filtered
        }
      } catch { /* ignore */ }
    }
  })

  // Déterminer le rôle que l'utilisateur peut jouer pour l'annonce active.
  function getMyRoleForAnnonce(annonceId: number | null | undefined): "locataire" | "bailleur" | null {
    if (!annonceId) return null
    const ann = annonces[annonceId]
    if (!ann || !myEmail) return null
    if ((ann.locataire_email || "").toLowerCase() === myEmail) return "locataire"
    if ((ann.proprietaire_email || "").toLowerCase() === myEmail) return "bailleur"
    return null
  }

  // État de la modale de signature
  const [signatureModal, setSignatureModal] = useState<{
    open: boolean
    bailData: BailData | null
    annonceId: number | null
    role: "locataire" | "bailleur"
  }>({ open: false, bailData: null, annonceId: null, role: "locataire" })

  function requestSign(bailData: BailData, role: "locataire" | "bailleur") {
    const annId = convActiveData?.annonceId || null
    if (!annId) return
    setSignatureModal({ open: true, bailData, annonceId: annId, role })
  }

  function closeSignatureModal() {
    setSignatureModal(s => ({ ...s, open: false }))
  }

  async function onBailSigned() {
    // Recharger les messages pour voir la nouvelle [BAIL_SIGNE] card
    if (!convActiveData || !myEmail) return
    await loadMessages(myEmail, convActiveData.other, convActiveData.annonceId)
    // Recharger l'annonce associée : l'API /api/bail/signer bascule statut à
    // "loué" quand le locataire signe. Sans ce refresh, `deriveStatut` garde
    // l'ancien statut → la timeline ne passe pas à l'étape suivante
    // (cf. bug signalé par Paul 2026-04-24 : "quand le bail a été signé côté
    // locataire et proprio ça va pas à la prochaine étape dans les messages").
    // Le Realtime annonces UPDATE est en place mais peut tarder / manquer
    // selon la propagation — on force le refresh ici en synchrone.
    if (convActiveData.annonceId != null) {
      const { data: ann } = await supabase.from("annonces")
        .select("*")
        .eq("id", convActiveData.annonceId)
        .single()
      if (ann) {
        setAnnonces(prev => ({ ...prev, [ann.id as number]: { ...(prev[ann.id as number] || {}), ...ann } }))
      }
    }
  }

  async function confirmerAutoPaiement(annId: number) {
    if (!myEmail || !convActiveData) return
    const now = new Date().toISOString()
    // 1. Active sur l'annonce
    const { error: updErr } = await supabase
      .from("annonces")
      .update({ auto_paiement_actif: true, auto_paiement_confirme_at: now })
      .eq("id", annId)
    if (updErr) {
      alert(`Erreur : ${updErr.message}`)
      return
    }
    setAnnonces(prev => ({ ...prev, [annId]: { ...(prev[annId] || {}), auto_paiement_actif: true, auto_paiement_confirme_at: now } }))
    // 2. Met à jour le message de demande (ajoute confirmedAt au payload)
    // On trouve le dernier [AUTO_PAIEMENT_DEMANDE] message de cette conv et on met à jour
    const demandeMsg = messages.find(m => typeof m.contenu === "string" && m.contenu.startsWith(AUTO_PAIEMENT_DEMANDE_PREFIX) && m.annonce_id === annId)
    if (demandeMsg) {
      try {
        const payload = JSON.parse((demandeMsg.contenu as string).slice(AUTO_PAIEMENT_DEMANDE_PREFIX.length))
        payload.confirmedAt = now
        const newContenu = `${AUTO_PAIEMENT_DEMANDE_PREFIX}${JSON.stringify(payload)}`
        await supabase.from("messages").update({ contenu: newContenu }).eq("id", demandeMsg.id)
        setMessages(prev => prev.map(m => m.id === demandeMsg.id ? { ...m, contenu: newContenu } : m))
      } catch { /* ignore */ }
    }
    // 3. Notif au locataire
    void postNotif({
      userEmail: convActiveData.other,
      type: "loyer_retard", // pas de type spécifique, on recycle
      title: "Auto-paiement confirmé",
      body: "Votre propriétaire a confirmé votre virement automatique. Les prochains loyers seront validés automatiquement.",
      href: "/mon-logement",
      relatedId: String(annId),
    })
  }

  // Grouper les messages par date
  const messagesAvecSep: Array<{ type: "sep"; label: string } | { type: "msg"; msg: any }> = []
  let lastDate = ""
  messages.forEach(m => {
    const d = new Date(m.created_at).toDateString()
    if (d !== lastDate) { messagesAvecSep.push({ type: "sep", label: dateSep(m.created_at) }); lastDate = d }
    messagesAvecSep.push({ type: "msg", msg: m })
  })

  if (loading) return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "24px 16px" }} aria-busy="true">
        <div style={{ background: "white", borderRadius: 20, overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,0.04)" }}>
          {[1, 2, 3, 4, 5, 6].map(i => <MessageSkeleton key={i} />)}
        </div>
      </div>
    </main>
  )

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <AnnulerVisiteDialog
        open={!!visiteCancelTarget}
        mode={visiteCancelTarget?.mode}
        onClose={() => setVisiteCancelTarget(null)}
        onConfirm={handleAnnulerVisite}
      />
      <ProposerVisiteDialog
        open={showVisiteForm && !!convActiveData?.annonceId}
        onClose={() => { setShowVisiteForm(false); setCounterTarget(null) }}
        onConfirm={async (p) => { await proposerVisite(p) }}
        annonce={annonceActive ? {
          titre: annonceActive.titre ?? null,
          ville: annonceActive.ville ?? null,
          prix: annonceActive.prix ?? null,
          surface: annonceActive.surface ?? null,
          photos: Array.isArray(annonceActive.photos) ? annonceActive.photos : null,
        } : null}
        counterTargetLabel={counterTarget ? `${formatVisiteDate(counterTarget.date_visite)} à ${counterTarget.heure}` : null}
        envoi={envoyantVisite}
        matchPct={(() => {
          const s = computeConvScore(convActiveData ?? null)
          return typeof s === "number" ? Math.round(s / 10) : null
        })()}
        initialDate={counterTarget?.date_visite || null}
        initialHeure={counterTarget?.heure || null}
        locked={!candidatureValidee}
      />
      {signatureModal.open && signatureModal.bailData && signatureModal.annonceId && (
        <BailSignatureModal
          open={signatureModal.open}
          onClose={closeSignatureModal}
          onSigned={onBailSigned}
          bailData={signatureModal.bailData}
          annonceId={signatureModal.annonceId}
          role={signatureModal.role}
          nomDefaut={signatureModal.role === "locataire" ? (signatureModal.bailData.nomLocataire || "") : (signatureModal.bailData.nomBailleur || "")}
        />
      )}

      {/* Modale de gestion des visites de la conv active */}
      <Modal
        open={visitesModalOpen}
        onClose={() => setVisitesModalOpen(false)}
        title="Demandes de visite"
        maxWidth={640}
      >
        {(() => {
          const actives = visitesConv.filter(v => v.statut === "proposée" || v.statut === "confirmée")
          const annulees = visitesConv
            .filter(v => v.statut === "annulée")
            .sort((a, b) => new Date(b.created_at || b.date_visite || 0).getTime() - new Date(a.created_at || a.date_visite || 0).getTime())
          const renderVisite = (v: any) => {
            const s = STATUT_VISITE[v.statut] ?? STATUT_VISITE["proposée"]
            const isPending = v.statut === "proposée"
            const parMoi = (v.propose_par || "").toLowerCase() === (myEmail || "").toLowerCase()
            return (
              <div key={v.id} style={{ display: "flex", flexDirection: "column", gap: 8, background: "white", borderRadius: 12, padding: "12px 14px", border: `1px solid ${s.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>
                    {formatVisiteDate(v.date_visite, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} à {v.heure}
                  </span>
                  <span style={{ background: s.bg, color: s.color, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, border: `1px solid ${s.border}` }}>
                    {s.label}
                  </span>
                  {isPending && (
                    <span style={{ fontSize: 10, color: "#8a8477" }}>
                      {parMoi ? "Proposée par vous" : "Reçue"}
                    </span>
                  )}
                </div>
                {v.message && (
                  <p style={{ fontSize: 12, color: "#8a8477", fontStyle: "italic", margin: 0, lineHeight: 1.5 }}>
                    &ldquo;{v.message}&rdquo;
                  </p>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {isPending && !parMoi && (
                    <>
                      <button
                        onClick={async () => {
                          await changerStatutVisite(v.id, "confirmée")
                        }}
                        style={{ background: "#111", color: "white", border: "none", borderRadius: 999, padding: "6px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        ✓ Confirmer
                      </button>
                      <button
                        onClick={() => {
                          setCounterTarget(v)
                          setVisiteDate(v.date_visite || "")
                          setVisiteHeure(v.heure || "10:00")
                          setVisiteMessage("")
                          setShowVisiteForm(true)
                          setVisitesModalOpen(false)
                        }}
                        style={{ background: "white", border: "1px solid #111", color: "#111", borderRadius: 999, padding: "6px 12px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        Contre-proposer
                      </button>
                      <button
                        onClick={() => {
                          setVisiteCancelTarget({ v, mode: "refus" })
                          setVisitesModalOpen(false)
                        }}
                        style={{ background: "none", border: "1px solid #F4C9C9", color: "#b91c1c", borderRadius: 999, padding: "6px 12px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        Refuser
                      </button>
                    </>
                  )}
                  {isPending && parMoi && (
                    <button
                      onClick={() => {
                        setVisiteCancelTarget({ v, mode: "annulation" })
                        setVisitesModalOpen(false)
                      }}
                      style={{ background: "none", border: "1px solid #F4C9C9", color: "#b91c1c", borderRadius: 999, padding: "6px 12px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      Annuler ma demande
                    </button>
                  )}
                  {v.statut === "confirmée" && (
                    <button
                      onClick={() => {
                        setVisiteCancelTarget({ v, mode: "annulation" })
                        setVisitesModalOpen(false)
                      }}
                      style={{ background: "none", border: "1px solid #F4C9C9", color: "#b91c1c", borderRadius: 999, padding: "6px 12px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      Annuler la visite
                    </button>
                  )}
                  {v.statut === "annulée" && (
                    <button
                      onClick={() => {
                        setCounterTarget(null)
                        setVisiteDate("")
                        setVisiteHeure("10:00")
                        setVisiteMessage("")
                        setShowVisiteForm(true)
                        setVisitesModalOpen(false)
                        setTimeout(() => {
                          const el = document.getElementById("visite-form-anchor")
                          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
                        }, 120)
                      }}
                      style={{ background: "#111", color: "white", border: "none", borderRadius: 999, padding: "6px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      Proposer un autre créneau
                    </button>
                  )}
                </div>
              </div>
            )
          }
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Actives */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 10px" }}>
                  Actives ({actives.length})
                </p>
                {actives.length === 0 ? (
                  <div style={{ padding: "20px 14px", background: "#F7F4EF", borderRadius: 12, textAlign: "center", fontSize: 13, color: "#8a8477" }}>
                    Aucune visite active.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {actives.map(renderVisite)}
                  </div>
                )}
              </div>

              {/* Annulées — collapsible */}
              {annulees.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setHistoriqueAnnOuvert(o => !o)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 14px",
                      background: "#F7F4EF",
                      border: "1px solid #EAE6DF",
                      borderRadius: 10,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#8a8477",
                    }}
                  >
                    <span>Historique annulées ({annulees.length})</span>
                    <span style={{ fontSize: 14 }}>{historiqueAnnOuvert ? "▴" : "▾"}</span>
                  </button>
                  {historiqueAnnOuvert && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                      {annulees.map(renderVisite)}
                    </div>
                  )}
                </div>
              )}

              {/* CTA proposer une nouvelle visite */}
              {convActiveData?.annonceId && (
                <button
                  type="button"
                  onClick={() => {
                    setCounterTarget(null)
                    setVisiteDate("")
                    setVisiteHeure("10:00")
                    setVisiteMessage("")
                    setShowVisiteForm(true)
                    setVisitesModalOpen(false)
                    setTimeout(() => {
                      const el = document.getElementById("visite-form-anchor")
                      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
                    }, 120)
                  }}
                  style={{
                    background: "#EEF3FB",
                    border: "1px solid #D7E3F4",
                    color: "#1d4ed8",
                    borderRadius: 12,
                    padding: "10px 18px",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  + Proposer une nouvelle visite
                </button>
              )}
            </div>
          )
        })()}
      </Modal>
      {/* Container full-width — maxWidth 1700 (au lieu de 1400 handoff) pour
          remplir mieux les grands écrans. Padding latéral réduit 24px desktop
          au lieu de 48px → la messagerie respire vraiment edge-to-edge. */}
      <div style={{ maxWidth: isMobile && convActiveData ? "100%" : 1700, margin: "0 auto", padding: isMobile && convActiveData ? 0 : isMobile ? "20px 16px" : "24px 24px 40px" }}>
        {/* Header éditorial — calque handoff messages.jsx L131-140.
            Eyebrow "Messagerie" + titre "Conversations" 34px weight 500 +
            trust signal discret à droite (chiffré E2E + archivage 3 ans). */}
        {(!isMobile || !convActiveData) && (
          <>
            <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500&display=swap');`}</style>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: isMobile ? "flex-start" : "flex-end",
              flexDirection: isMobile ? "column" : "row",
              gap: 8,
              marginBottom: isMobile ? 16 : 22,
            }}>
              <div>
                <p style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#8a8477",
                  textTransform: "uppercase",
                  letterSpacing: "1.4px",
                  margin: 0,
                  marginBottom: 8,
                }}>
                  Messagerie
                </p>
                <h1 style={{
                  fontSize: isMobile ? 26 : 34,
                  fontWeight: 500,
                  letterSpacing: "-1px",
                  margin: 0,
                  color: "#111",
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  Conversations
                </h1>
              </div>
              {!isMobile && (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                  color: "#8a8477",
                  letterSpacing: "0.3px",
                }}>
                  <span>Chiffré de bout en bout · archivage 3 ans</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                </div>
              )}
            </div>
          </>
        )}

        {/* Wrapper unifié 3 colonnes — fidèle handoff messages.jsx l. 142.
            Avant : 3 cards séparées avec gap 16, chacune son borderRadius 20
            et son boxShadow → effet "panneaux flottants". Maintenant : 1 seul
            card unique avec border + radius 24 + shadow xs, séparateurs
            internes via borderRight/borderLeft. Donne l'aspect "messagerie
            premium intégrée" du handoff (Linear, Notion, Apple Mail-like).
            Mobile : stack inchangée (chaque panneau prend toute la largeur). */}
        <div style={{
          display: isMobile ? "flex" : "flex",
          gap: isMobile && convActiveData ? 0 : isMobile ? 16 : 0,
          height: isMobile ? "calc(100vh - 72px)" : "76vh",
          background: isMobile ? "transparent" : "#fff",
          border: isMobile ? "none" : "1px solid #EAE6DF",
          borderRadius: isMobile ? 0 : 24,
          overflow: isMobile ? "visible" : "hidden",
          boxShadow: isMobile ? "none" : "0 1px 3px rgba(0,0,0,0.04)",
        }}>

          {/* ── Colonne gauche : conversations ── */}
          <div style={{
            width: isMobile ? "100%" : 340,
            flexShrink: 0,
            background: isMobile ? "white" : "transparent",
            borderRadius: isMobile ? 0 : 0,
            borderRight: isMobile ? "none" : "1px solid #EAE6DF",
            display: isMobile && convActiveData ? "none" : "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: isMobile ? "none" : "none",
          }}>
            {/* Onglets sidebar — segmented control fidèle handoff (3) messages.jsx l. 233-255.
                Proprio : 4 onglets relations Candidat/Validé/Locataire/Anciens
                Locataire : 2 onglets historiques mappés sur la même mécanique.
                Design : grid 4 cols dans un container beige radius 12, dot
                coloré par relation, count tabular en bas.
                "Anciens locataires" → court "Anciens" pour tenir dans 4 cols. */}
            <div style={{ padding: "14px 14px 0" }}>
              {(() => {
                const tabs = proprietaireActive ? [
                  { k: "candidat" as const,  short: "Candidat",  label: "Candidats",          count: countByTab.candidat,  dot: "#9CA3AF" },
                  { k: "valide" as const,    short: "Validé",    label: "Validés",            count: countByTab.valide,    dot: "#F59E0B" },
                  { k: "locataire" as const, short: "Locataire", label: "Locataires",         count: countByTab.locataire, dot: "#16A34A" },
                  { k: "autre" as const,     short: "Anciens",   label: "Anciens locataires", count: countByTab.autre,     dot: "#9CA3AF" },
                ] : [
                  { k: "locataire" as const, short: "Mon bail",         label: "Mon bail",         count: countByTab.locataire, dot: "#16A34A" },
                  { k: "candidat" as const,  short: "Mes candidatures", label: "Mes candidatures", count: countByTab.candidat + countByTab.valide + countByTab.autre, dot: "#F59E0B" },
                ]
                return (
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
                    gap: 2,
                    background: "#F7F4EF",
                    border: "1px solid #EAE6DF",
                    borderRadius: 12,
                    padding: 3,
                  }}>
                    {tabs.map(t => {
                      const sel = messagesTab === t.k
                      return (
                        <button
                          key={t.k}
                          type="button"
                          onClick={() => setMessagesTab(t.k)}
                          title={t.label}
                          style={{
                            padding: "9px 4px",
                            borderRadius: 9,
                            border: "none",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            background: sel ? "#fff" : "transparent",
                            color: sel ? "#111" : "#8a8477",
                            boxShadow: sel ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 4,
                            transition: "all 160ms",
                            minWidth: 0,
                            position: "relative",
                          }}
                        >
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            fontSize: 11.5,
                            fontWeight: sel ? 700 : 500,
                            letterSpacing: "-0.1px",
                            maxWidth: "100%",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.dot, flexShrink: 0 }} />
                            {t.short}
                          </span>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: sel ? "#111" : "#8a8477",
                            fontVariantNumeric: "tabular-nums" as const,
                            letterSpacing: "0.3px",
                            padding: "1px 6px",
                            borderRadius: 999,
                            background: sel ? "#F7F4EF" : "transparent",
                          }}>
                            {t.count}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
            {/* Recherche + filtre par bien (proprio) + toggle archivées */}
            <div style={{ padding: "12px 16px 14px", borderBottom: "1px solid #EAE6DF", display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Input recherche avec icône loupe — palette beige handoff */}
              <div style={{ position: "relative" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a8477" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="search"
                  aria-label="Rechercher une conversation"
                  value={recherche} onChange={e => setRecherche(e.target.value)}
                  placeholder="Rechercher une conversation"
                  onFocus={e => { e.currentTarget.style.borderColor = "#111"; e.currentTarget.style.background = "#fff" }}
                  onBlur={e => { e.currentTarget.style.borderColor = "#EAE6DF"; e.currentTarget.style.background = "#F7F4EF" }}
                  style={{ width: "100%", padding: "9px 12px 9px 34px", border: "1px solid #EAE6DF", background: "#F7F4EF", color: "#111", borderRadius: 999, fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", transition: "border-color 160ms ease, background 160ms ease" }}
                />
              </div>
              {/* Filtre par statut — 7 pills (handoff messages.jsx L154-179)
                  + Validée (Paul 2026-04-26) entre Dossier et Visite */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {([
                  ["all",     "Toutes",  null as null | StatutConv],
                  ["contact", "Contact", "contact" as StatutConv],
                  ["dossier", "Dossier", "dossier" as StatutConv],
                  ["validee", "Validée", "validee" as StatutConv],
                  ["visite",  "Visite",  "visite"  as StatutConv],
                  ["bail",    "Bail",    "bail"    as StatutConv],
                  ["rejete",  "Refusé",  "rejete"  as StatutConv],
                ] as const).map(([k, label, statutKey]) => {
                  const s = statutKey ? STATUT_CONV[statutKey] : null
                  const sel = statusFilter === k
                  const n = statutCounts[k]
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setStatusFilter(k)}
                      style={{
                        padding: "5px 10px", borderRadius: 999,
                        fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                        letterSpacing: "0.2px", cursor: "pointer",
                        background: sel ? (s ? s.color : "#111") : "#fff",
                        color: sel ? "#fff" : (s ? s.color : "#8a8477"),
                        border: `1px solid ${sel ? (s ? s.color : "#111") : (s ? `${s.color}33` : "#EAE6DF")}`,
                        display: "inline-flex", alignItems: "center", gap: 5,
                      }}
                    >
                      {k !== "all" && s && (
                        <span style={{ width: 6, height: 6, borderRadius: 999, background: sel ? "#fff" : s.color }} />
                      )}
                      {label}
                      {n > 0 && <span style={{ opacity: 0.7 }}>{n}</span>}
                    </button>
                  )
                })}
              </div>
              {/* Filtre par bien — proprio uniquement, dès 2+ biens dans les convs */}
              {proprietaireActive && (() => {
                const biensFromConvs = Array.from(
                  new Map(
                    conversations
                      .filter(c => c.annonceId && annonces[c.annonceId])
                      .map(c => [c.annonceId, annonces[c.annonceId as number]])
                  ).entries(),
                )
                if (biensFromConvs.length < 2) return null
                return (
                  <select
                    value={String(bienFilter)}
                    onChange={e => {
                      const v = e.target.value
                      const next = v === "all" ? "all" : Number(v)
                      setBienFilter(next)
                      try {
                        window.localStorage.setItem("nm_msg_bien_filter", String(next))
                      } catch { /* ignore */ }
                    }}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      border: `1px solid ${bienFilter !== "all" ? "#111" : "#EAE6DF"}`,
                      borderRadius: 999,
                      fontSize: 13,
                      fontWeight: bienFilter !== "all" ? 700 : 500,
                      outline: "none",
                      fontFamily: "inherit",
                      boxSizing: "border-box",
                      background: bienFilter !== "all" ? "#F7F4EF" : "white",
                      color: "#111",
                      cursor: "pointer",
                    }}
                  >
                    <option value="all">Tous les biens ({biensFromConvs.length})</option>
                    {biensFromConvs.map(([id, ann]) => (
                      <option key={id as number} value={id as number}>
                        {ann.titre}{ann.ville ? ` — ${ann.ville}` : ""}
                      </option>
                    ))}
                  </select>
                )
              })()}
              {(countArchived > 0 || showArchived) && (
                <button
                  type="button"
                  onClick={() => setShowArchived(v => !v)}
                  style={{ background: showArchived ? "#111" : "white", color: showArchived ? "white" : "#111", border: `1px solid ${showArchived ? "#111" : "#EAE6DF"}`, borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "center" }}>
                  {showArchived ? "← Retour" : `Archivées (${countArchived})`}
                </button>
              )}
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
              {convsFiltrees.length === 0 ? (
                <div style={{ padding: "36px 20px", textAlign: "center", color: "#8a8477" }}>
                  <p style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontSize: 16, fontWeight: 500, color: "#111", margin: 0, letterSpacing: "-0.2px" }}>{recherche ? "Aucun résultat" : "Aucune conversation"}</p>
                  {!recherche && (
                    <p style={{ fontSize: 12, marginTop: 6, textAlign: "center", lineHeight: 1.6, color: "#8a8477" }}>
                      {proprietaireActive
                        ? "Les locataires vous contacteront depuis vos annonces."
                        : "Contactez un propriétaire depuis une annonce."}
                    </p>
                  )}
                </div>
              ) : convsFiltrees.map(conv => {
                const ann = annonces[conv.annonceId]
                const photo = Array.isArray(ann?.photos) && ann.photos.length > 0 ? ann.photos[0] : null
                const isActive = convActive === conv.key
                const rawPreview = conv.lastMsg?.contenu || ""
                const previewText = rawPreview.startsWith(DOSSIER_PREFIX) ? "Dossier envoyé"
                  : rawPreview.startsWith(DEMANDE_DOSSIER_PREFIX) ? "Dossier demandé"
                  : rawPreview.startsWith(EDL_PREFIX) ? "État des lieux envoyé"
                  : rawPreview.startsWith(BAIL_PREFIX) ? "Bail généré"
                  : rawPreview.startsWith(QUITTANCE_PREFIX) ? "Quittance reçue"
                  : rawPreview.startsWith(RETRAIT_PREFIX) ? "Candidature retirée"
                  : rawPreview.startsWith(DEVALIDEE_PREFIX) ? "Validation retirée"
                  : rawPreview.startsWith(REFUS_PREFIX) ? "Candidature non retenue"
                  : rawPreview.startsWith(RELANCE_PREFIX) ? "Relance : " + rawPreview.slice(RELANCE_PREFIX.length)
                  : rawPreview.startsWith(LOCATION_PREFIX) ? "Location acceptée ✓"
                  : parseReply(rawPreview).text // ignore le préfixe [REPLY:id]
                const preview = rawPreview
                  ? (previewText.length > 35 ? previewText.slice(0, 35) + "…" : previewText)
                  : "Nouvelle conversation"
                const time = conv.lastMsg?.created_at
                  ? new Date(conv.lastMsg.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
                  : ""

                // Badge de relation côté locataire : bail actif / ancienne candidature / candidat
                let relBadge: { label: string; bg: string; color: string } | null = null
                if (!proprietaireActive) {
                  if (ann?.statut === "loué" && ann?.locataire_email) {
                    const locEmail = (ann.locataire_email || "").toLowerCase()
                    const other = (conv.other || "").toLowerCase()
                    const meLower = (myEmail || "").toLowerCase()
                    if (other === locEmail || meLower === locEmail) {
                      relBadge = { label: "Bail actif", bg: "#F0FAEE", color: "#15803d" }
                    } else if (conv.annonceId) {
                      relBadge = { label: "Ancienne candidature", bg: "#F7F4EF", color: "#8a8477" }
                    }
                  } else if (conv.annonceId) {
                    relBadge = { label: "Candidat", bg: "#EEF3FB", color: "#1d4ed8" }
                  }
                }
                // Côté proprio : statut candidat (standard / confirme / locataire) via handoff
                const candStatut = proprietaireActive ? deriveCandidateStatus(conv) : null
                const cand = candStatut ? CANDIDATE_STATUS[candStatut] : null
                const ringColor = cand && cand.ring !== "transparent" ? cand.ring : "transparent"

                return (
                  <div key={conv.key}
                    onClick={() => { setConvActive(conv.key); setMenuConv(null); setVisitesConv([]); loadMessages(myEmail!, conv.other, conv.annonceId); loadVisitesConv(conv.other, conv.annonceId) }}
                    style={{ padding: "14px 16px", cursor: "pointer", background: isActive ? "#F7F4EF" : "white", borderBottom: "1px solid #F2EEE6", borderLeft: isActive ? "3px solid #111" : conv.unread > 0 ? "3px solid #b91c1c" : "3px solid transparent", position: "relative", transition: "background 160ms ease" }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#FBF8F3"; const btn = e.currentTarget.querySelector(".menu-btn") as HTMLElement; if (btn) btn.style.opacity = "1" }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "white"; if (menuConv !== conv.key) { const btn = e.currentTarget.querySelector(".menu-btn") as HTMLElement; if (btn) btn.style.opacity = "0" } }}
                  >
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      {/* Avatar annonce (ou peer si pas d'annonce) + ring candidateStatus (handoff L227-230) + badge unread */}
                      <div style={{ position: "relative", flexShrink: 0, padding: ringColor !== "transparent" ? 2 : 0, borderRadius: ringColor !== "transparent" ? 12 : 10, background: ringColor, transition: "background 200ms" }}>
                        {photo ? (
                          <img src={photo} alt="" style={{ width: ringColor !== "transparent" ? 36 : 40, height: ringColor !== "transparent" ? 36 : 40, borderRadius: ringColor !== "transparent" ? 8 : 10, objectFit: "cover", display: "block", border: ringColor !== "transparent" ? "2px solid #fff" : "none", boxSizing: "border-box" }} />
                        ) : (
                          <div style={{ border: ringColor !== "transparent" ? "2px solid #fff" : "none", borderRadius: "50%" }}>
                            <Avatar email={conv.other} image={peerImages[conv.other.toLowerCase()]} size={ringColor !== "transparent" ? 36 : 40} />
                          </div>
                        )}
                        {/* Si annonce présente, overlay peer avatar pour contexte humain */}
                        {photo && (
                          <div style={{ position: "absolute", bottom: -3, right: -3, border: "2px solid white", borderRadius: "50%" }}>
                            <Avatar email={conv.other} image={peerImages[conv.other.toLowerCase()]} size={18} />
                          </div>
                        )}
                        {conv.unread > 0 && (
                          <span style={{ position: "absolute", top: -4, right: -4, background: "#b91c1c", color: "white", borderRadius: 999, fontSize: 9, fontWeight: 800, minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", border: "2px solid white" }}>
                            {conv.unread}
                          </span>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                          <p style={{ fontWeight: conv.unread > 0 ? 800 : 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130, color: "#111" }}>
                            {ann?.titre || displayName(conv.other, ann?.proprietaire)}
                          </p>
                          <span style={{ fontSize: 10.5, color: "#8a8477", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" as const, letterSpacing: "0.2px" }}>{time}</span>
                        </div>
                        {ann?.titre && (
                          <p style={{ fontSize: 11, color: "#8a8477", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName(conv.other, ann?.proprietaire)}</p>
                        )}
                        {relBadge && (
                          <span style={{ display: "inline-block", background: relBadge.bg, color: relBadge.color, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, marginBottom: 2, marginRight: 4 }}>
                            {relBadge.label}
                          </span>
                        )}
                        {/* Statut candidat (proprio) : inline dot + label, style handoff L239-244 */}
                        {cand && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: cand.color, fontSize: 10.5, fontWeight: 700, marginRight: 6, letterSpacing: "0.1px" }}>
                            <span style={{ width: 5, height: 5, borderRadius: 999, background: cand.dot }} />
                            {cand.short}
                          </span>
                        )}
                        {(() => {
                          const c = compatBadge(computeConvScore(conv))
                          if (!c) return null
                          // Style handoff : point + texte inline, pas de pill de fond.
                          return (
                            <span
                              title={proprietaireActive ? "Score de compatibilité du candidat avec ce bien" : "Score de compatibilité du bien avec votre profil"}
                              style={{ display: "inline-flex", alignItems: "center", gap: 4, color: c.color, fontSize: 10.5, fontWeight: 700, marginBottom: 2, fontVariantNumeric: "tabular-nums" as const, letterSpacing: "0.1px" }}
                            >
                              <span style={{ width: 5, height: 5, borderRadius: 999, background: c.color }} />
                              {c.pct}% match
                            </span>
                          )
                        })()}
                        {proprietaireActive && candidatNotes[conv.key] && (
                          <p style={{ fontSize: 11, color: "#ca8a04", fontWeight: 600, margin: "2px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={candidatNotes[conv.key]}>
                            Note : {candidatNotes[conv.key]}
                          </p>
                        )}
                        <p style={{ fontSize: 12, color: conv.unread > 0 ? "#111" : "#8a8477", fontWeight: conv.unread > 0 ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.5 }}>{preview}</p>
                      </div>
                    </div>

                    {/* Bouton 3 points */}
                    <button
                      className="menu-btn"
                      onClick={e => { e.stopPropagation(); setMenuConv(menuConv === conv.key ? null : conv.key) }}
                      style={{ position: "absolute", top: 10, right: 10, opacity: menuConv === conv.key ? 1 : 0, background: "#F7F4EF", border: "none", borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontSize: 16, color: "#8a8477", transition: "opacity 0.15s", lineHeight: 1, letterSpacing: 1 }}>
                      ···
                    </button>

                    {/* Dropdown menu */}
                    {menuConv === conv.key && (
                      <>
                        <div onClick={e => { e.stopPropagation(); setMenuConv(null) }} style={{ position: "fixed", inset: 0, zIndex: 100 }} />
                        <div style={{ position: "absolute", top: 36, right: 10, background: "white", borderRadius: 14, border: "1px solid #EAE6DF", boxShadow: "0 18px 48px rgba(17,17,17,0.14)", zIndex: 200, minWidth: 180, overflow: "hidden", fontFamily: "inherit" }}>
                          {conv.unread > 0 && (
                            <button onClick={e => { e.stopPropagation(); marquerLu(conv); setMenuConv(null) }}
                              style={{ width: "100%", padding: "11px 14px", background: "none", border: "none", borderBottom: "1px solid #F2EEE6", textAlign: "left", fontSize: 13, cursor: "pointer", fontFamily: "inherit", color: "#111", display: "flex", alignItems: "center", gap: 8 }}
                              onMouseEnter={e => (e.currentTarget.style.background = "#F7F4EF")}
                              onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                              Marquer comme lu
                            </button>
                          )}
                          {ann && (
                            <button onClick={e => { e.stopPropagation(); window.location.href = `/annonces/${conv.annonceId}`; setMenuConv(null) }}
                              style={{ width: "100%", padding: "11px 14px", background: "none", border: "none", borderBottom: "1px solid #F2EEE6", textAlign: "left", fontSize: 13, cursor: "pointer", fontFamily: "inherit", color: "#111", display: "flex", alignItems: "center", gap: 8 }}
                              onMouseEnter={e => (e.currentTarget.style.background = "#F7F4EF")}
                              onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                              Voir l&apos;annonce
                            </button>
                          )}
                          <button onClick={e => { e.stopPropagation(); toggleArchive(conv.key); setMenuConv(null) }}
                            style={{ width: "100%", padding: "11px 14px", background: "none", border: "none", borderBottom: "1px solid #F2EEE6", textAlign: "left", fontSize: 13, cursor: "pointer", fontFamily: "inherit", color: "#111", display: "flex", alignItems: "center", gap: 8 }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#F7F4EF")}
                            onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                            {archivedKeys.has(conv.key) ? "Désarchiver" : "Archiver"}
                          </button>
                          <button onClick={e => { e.stopPropagation(); supprimerConversation(conv.key); setMenuConv(null) }}
                            disabled={supprimant === conv.key}
                            style={{ width: "100%", padding: "11px 14px", background: "none", border: "none", textAlign: "left", fontSize: 13, cursor: supprimant === conv.key ? "not-allowed" : "pointer", fontFamily: "inherit", color: "#b91c1c", display: "flex", alignItems: "center", gap: 8, opacity: supprimant === conv.key ? 0.5 : 1 }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#fef2f2")}
                            onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                            {supprimant === conv.key ? "Suppression…" : "Supprimer"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Colonne centrale : chat (thread) — wrapper unifié, plus de bordure individuelle ── */}
          <div style={{
            flex: 1,
            background: "white",
            borderRadius: isMobile ? 0 : 0,
            display: isMobile && !convActiveData ? "none" : "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "none",
          }}>
            {!convActiveData ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", color: "#8a8477", gap: 14, padding: 24, textAlign: "center" }}>
                {/* Icône enveloppe discrète sur pastille beige — handoff EmptyThread */}
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#F7F4EF", border: "1px solid #EAE6DF", display: "flex", alignItems: "center", justifyContent: "center" }} aria-hidden>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#8a8477" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m3 7 9 6 9-6" />
                  </svg>
                </div>
                <p style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontSize: 22, fontWeight: 500, color: "#111", letterSpacing: "-0.4px", margin: 0 }}>Sélectionnez une conversation</p>
                {!proprietaireActive ? (
                  <>
                    <p style={{ fontSize: 13, color: "#8a8477", margin: 0, maxWidth: 340, lineHeight: 1.6 }}>Contactez un propriétaire directement depuis une annonce pour commencer une discussion.</p>
                    <Link href="/annonces" style={{ marginTop: 4, padding: "10px 24px", background: "#111", color: "white", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 14, fontFamily: "inherit" }}>
                      Voir les annonces
                    </Link>
                  </>
                ) : (
                  <p style={{ fontSize: 13, color: "#8a8477", margin: 0, maxWidth: 340, lineHeight: 1.6 }}>Les locataires intéressés vous contacteront ici — chaque échange apparaîtra dans cette fenêtre.</p>
                )}
              </div>
            ) : (
              <>
                {/* Header chat — bordure alignee palette handoff (#EAE6DF hairline) */}
                <div style={{ padding: isMobile ? "12px 14px" : "16px 22px", borderBottom: "1px solid #EAE6DF", display: "flex", alignItems: "center", gap: isMobile ? 8 : 12, background: "#fff" }}>
                  {isMobile && (
                    <button onClick={() => setConvActive(null)}
                      aria-label="Retour aux conversations"
                      style={{ background: "#F7F4EF", border: "1px solid #EAE6DF", borderRadius: 999, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 18, color: "#111", flexShrink: 0, fontFamily: "inherit" }}>
                      ←
                    </button>
                  )}
                  {annonceActive ? (
                    <>
                      <Link
                        href={`/annonces/${convActiveData.annonceId}`}
                        aria-label="Voir l'annonce"
                        style={{ position: "relative", flexShrink: 0, display: "block", textDecoration: "none" }}
                      >
                        {Array.isArray(annonceActive.photos) && annonceActive.photos[0] ? (
                          <img src={annonceActive.photos[0]} alt="" style={{ width: 42, height: 42, borderRadius: 10, objectFit: "cover", display: "block" }} />
                        ) : (
                          <div style={{ width: 42, height: 42, borderRadius: 12, background: "#F7F4EF", border: "1px solid #EAE6DF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#8a8477", fontWeight: 700 }}>{(annonceActive.titre || "A")[0].toUpperCase()}</div>
                        )}
                        {/* Avatar peer en overlay pour contexte humain */}
                        <div style={{ position: "absolute", bottom: -4, right: -4, border: "2px solid white", borderRadius: "50%" }}>
                          <Avatar email={convActiveData.other} image={peerImages[convActiveData.other.toLowerCase()]} size={22} />
                        </div>
                      </Link>
                      <Link
                        href={`/annonces/${convActiveData.annonceId}`}
                        style={{ flex: 1, textDecoration: "none", color: "inherit", minWidth: 0 }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <p style={{ fontWeight: 700, fontSize: 14, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{annonceActive.titre}</p>
                          {(() => {
                            const c = compatBadge(computeConvScore(convActiveData))
                            if (!c) return null
                            // Style handoff ThreadHeader : pill fond blanc + border 33% opacity + dot
                            return (
                              <span
                                title={proprietaireActive ? "Score de compatibilité du candidat avec ce bien" : "Score de compatibilité du bien avec votre profil"}
                                style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px 3px 7px", borderRadius: 999, background: "#fff", border: `1px solid ${c.color}33`, fontSize: 11, fontWeight: 700, color: c.color, fontVariantNumeric: "tabular-nums" as const, fontFamily: "inherit" }}
                              >
                                <span style={{ width: 6, height: 6, borderRadius: 999, background: c.color }} />
                                {c.pct}% match
                              </span>
                            )
                          })()}
                          {/* Statut candidat (proprio) pill — handoff messages.jsx L277-282 */}
                          {proprietaireActive && (() => {
                            const statut = deriveCandidateStatus(convActiveData)
                            if (statut === "standard") return null
                            const cand = CANDIDATE_STATUS[statut]
                            return (
                              <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 999, border: `1px solid ${cand.dot}`, color: cand.color, fontSize: 10, fontWeight: 700, letterSpacing: "0.4px", textTransform: "uppercase" as const, background: "#fff", fontFamily: "inherit" }}>
                                <span style={{ width: 5, height: 5, borderRadius: 999, background: cand.dot }} />
                                {cand.label}
                              </span>
                            )
                          })()}
                        </div>
                        <p style={{ fontSize: 12, color: "#8a8477", margin: "2px 0 0", letterSpacing: "0.1px" }}>{annonceActive.ville} &middot; {displayName(convActiveData.other, annonceActive.proprietaire)}</p>
                      </Link>
                      {/* Bouton "Valider la candidature" — proprio uniquement, étape
                         intermédiaire qui débloque la proposition de visite côté
                         locataire (Paul 2026-04-26). Caché si déjà validée ou
                         si le bail est signé pour ce candidat. */}
                      {/* Bouton "Valider" : on n'exige PAS annonceActive (peut être null
                          si annonces map pas encore hydraté) — on a juste besoin de
                          convActiveData.annonceId. La 2e condition utilise optional
                          chaining pour ne pas crash si annonceActive null. */}
                      {proprietaireActive && convActiveData?.annonceId && !isCandidatureValideeDB && !(annonceActive?.statut === "loué" && (annonceActive?.locataire_email || "").toLowerCase() === convActiveData.other.toLowerCase()) && (
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await fetch("/api/candidatures/valider", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                annonceId: convActiveData.annonceId,
                                locataireEmail: convActiveData.other,
                              }),
                            })
                            const json = await res.json().catch(() => ({}))
                            if (!res.ok || !json.ok) {
                              alert(`Validation échouée : ${json.error || res.statusText}`)
                              return
                            }
                            // Optimistic : injecter un message [CANDIDATURE_VALIDEE]
                            // local pour mettre à jour le flag immédiatement.
                            // À défaut on recharge la conv au prochain re-render.
                            location.reload()
                          }}
                          title="Présélectionner ce candidat — débloque sa demande de visite"
                          style={{ fontSize: 12, fontWeight: 700, color: "#15803d", background: "#F0FAEE", border: "1px solid #C6E9C0", borderRadius: 999, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                          Valider la candidature
                        </button>
                      )}
                      {/* Badge "Validée" cliquable pour annuler la validation —
                          si le proprio découvre quelque chose après coup ou a
                          validé par erreur. Confirmation native + reload pour
                          refléter le nouvel état. */}
                      {proprietaireActive && isCandidatureValideeDB && annonceActive?.statut !== "loué" && (
                        <button
                          type="button"
                          aria-label="Annuler la validation de la candidature"
                          title="Cliquer pour annuler la validation — le candidat ne pourra plus proposer de visite."
                          onClick={async () => {
                            if (!convActiveData?.annonceId) return
                            const ok = window.confirm(
                              "Annuler la validation de cette candidature ?\n\n" +
                              "Le candidat ne pourra plus proposer de visite tant que vous n'aurez pas validé à nouveau."
                            )
                            if (!ok) return
                            const res = await fetch("/api/candidatures/devalider", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                annonceId: convActiveData.annonceId,
                                locataireEmail: convActiveData.other,
                              }),
                            })
                            const json = await res.json().catch(() => ({}))
                            if (!res.ok || !json.ok) {
                              alert(`Annulation échouée : ${json.error || res.statusText}`)
                              return
                            }
                            location.reload()
                          }}
                          onMouseEnter={e => {
                            const btn = e.currentTarget as HTMLButtonElement
                            btn.style.background = "#FEECEC"
                            btn.style.borderColor = "#F4C9C9"
                            btn.style.color = "#b91c1c"
                            const label = btn.querySelector<HTMLElement>(".km-validee-label")
                            const cross = btn.querySelector<HTMLElement>(".km-validee-cross")
                            if (label) label.textContent = "Annuler"
                            if (cross) cross.style.display = "inline-flex"
                            const check = btn.querySelector<HTMLElement>(".km-validee-check")
                            if (check) check.style.display = "none"
                          }}
                          onMouseLeave={e => {
                            const btn = e.currentTarget as HTMLButtonElement
                            btn.style.background = "#F0FAEE"
                            btn.style.borderColor = "#C6E9C0"
                            btn.style.color = "#15803d"
                            const label = btn.querySelector<HTMLElement>(".km-validee-label")
                            const cross = btn.querySelector<HTMLElement>(".km-validee-cross")
                            if (label) label.textContent = "Validée"
                            if (cross) cross.style.display = "none"
                            const check = btn.querySelector<HTMLElement>(".km-validee-check")
                            if (check) check.style.display = "inline-flex"
                          }}
                          style={{ fontSize: 11, fontWeight: 700, color: "#15803d", background: "#F0FAEE", border: "1px solid #C6E9C0", borderRadius: 999, padding: "5px 12px", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5, letterSpacing: "0.3px", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                        >
                          <svg className="km-validee-check" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-flex" }}><polyline points="20 6 9 17 4 12" /></svg>
                          <svg className="km-validee-cross" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: "none" }}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                          <span className="km-validee-label">Validée</span>
                        </button>
                      )}
                      {/* Bouton "Louer à ce candidat" — côté proprio uniquement.
                         Workflow strict : la candidature DOIT être validée
                         (isCandidatureValideeDB=true) avant de pouvoir louer.
                         Empêche de sauter l'étape Valider → Visite → Bail.
                         Cache aussi si location déjà actée pour ce candidat. */}
                      {proprietaireActive && annonceActive && isCandidatureValideeDB && (
                        (annonceActive.statut !== "loué" || (annonceActive.locataire_email || "").toLowerCase() !== convActiveData.other.toLowerCase()) && (
                          <button
                            type="button"
                            onClick={() => setAccepterLocationOpen(true)}
                            title="Accepter ce locataire et marquer le bien comme loué"
                            style={{ fontSize: 12, fontWeight: 800, color: "white", background: "#15803d", border: "none", borderRadius: 999, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                            Louer à ce candidat
                          </button>
                        )
                      )}
                      {/* Bouton "Appeler" — click-to-call tel:. Garde-fou vie
                         privée 2026-04-23 : visible UNIQUEMENT quand la
                         relation est avancée, c.-à-d. une visite est en cours
                         (proposée/confirmée/effectuée) OU le bail est signé
                         (statut annonce = loué ou bail_envoye, géré par
                         isActiveBail). Jamais pendant un premier contact. */}
                      {(() => {
                        const peerEmail = convActiveData.other.toLowerCase()
                        const peerPhone = peerPhones[peerEmail]
                        if (!peerPhone) return null
                        // Note : loadVisitesConv charge uniquement les visites
                        // en statut proposée/confirmée/annulée. On exclut
                        // "annulée" ici — un proprio qui a annulé n'a plus de
                        // raison d'être joignable par tél.
                        const hasActiveVisite = visitesConv.some(v =>
                          v.statut === "proposée" || v.statut === "confirmée"
                        )
                        const hasActiveBail = isActiveBail(convActiveData)
                        if (!hasActiveVisite && !hasActiveBail) return null
                        return (
                          <a
                            href={`tel:${peerPhone.replace(/\s/g, "")}`}
                            title={`Appeler ${displayName(convActiveData.other, annonceActive.proprietaire)}`}
                            aria-label="Appeler"
                            onMouseEnter={e => { e.currentTarget.style.background = "#F2EEE6" }}
                            onMouseLeave={e => { e.currentTarget.style.background = "#F7F4EF" }}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#111", textDecoration: "none", background: "#F7F4EF", border: "1px solid #EAE6DF", borderRadius: 999, padding: "7px 13px", whiteSpace: "nowrap", fontFamily: "inherit", transition: "background 160ms ease" }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                            </svg>
                            {isMobile ? null : "Appeler"}
                          </a>
                        )
                      })()}
                      <Link href={`/annonces/${convActiveData.annonceId}`}
                        onMouseEnter={e => { e.currentTarget.style.background = "#F7F4EF" }}
                        onMouseLeave={e => { e.currentTarget.style.background = "#fff" }}
                        style={{ fontSize: 12, fontWeight: 600, color: "#111", textDecoration: "none", background: "#fff", border: "1px solid #EAE6DF", borderRadius: 999, padding: "7px 14px", whiteSpace: "nowrap", transition: "background 160ms ease" }}>
                        Voir l&apos;annonce
                      </Link>
                      {/* Liens raccourcis proprio (commit 6 du flow plan) :
                          si proprietaireActive ET annonceActive est à lui,
                          accès direct à Modifier annonce + Toutes candidatures. */}
                      {proprietaireActive && annonceActive && (annonceActive.proprietaire_email || "").toLowerCase() === (myEmail || "").toLowerCase() && (
                        <>
                          <Link
                            href={`/proprietaire/annonces/${convActiveData.annonceId}/candidatures`}
                            onMouseEnter={e => { e.currentTarget.style.background = "#F7F4EF" }}
                            onMouseLeave={e => { e.currentTarget.style.background = "#fff" }}
                            style={{ fontSize: 12, fontWeight: 600, color: "#111", textDecoration: "none", background: "#fff", border: "1px solid #EAE6DF", borderRadius: 999, padding: "7px 14px", whiteSpace: "nowrap", transition: "background 160ms ease", display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                              <circle cx="9" cy="7" r="4"/>
                            </svg>
                            Candidatures
                          </Link>
                          <Link
                            href={`/proprietaire/modifier/${convActiveData.annonceId}`}
                            onMouseEnter={e => { e.currentTarget.style.background = "#F7F4EF" }}
                            onMouseLeave={e => { e.currentTarget.style.background = "#fff" }}
                            style={{ fontSize: 12, fontWeight: 600, color: "#111", textDecoration: "none", background: "#fff", border: "1px solid #EAE6DF", borderRadius: 999, padding: "7px 14px", whiteSpace: "nowrap", transition: "background 160ms ease" }}>
                            Modifier
                          </Link>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <Avatar email={convActiveData.other} image={peerImages[convActiveData.other.toLowerCase()]} size={42} />
                      <p style={{ fontWeight: 700, fontSize: 14 }}>{displayName(convActiveData.other)}</p>
                    </>
                  )}
                </div>

                {/* BienPicker — quand le même peer a 2+ conversations liées
                   à des biens différents, chips de navigation pour switcher.
                   Handoff messages.jsx l. 533-569. */}
                {convActiveData?.annonceId != null && (() => {
                  const relatedConvs = conversations.filter(c =>
                    c.other === convActiveData.other
                    && c.annonceId != null
                    && c.annonceId !== convActiveData.annonceId
                  )
                  if (relatedConvs.length === 0) return null
                  const chips = [convActiveData, ...relatedConvs]
                  return (
                    <div style={{ padding: "10px 20px", borderBottom: "1px solid #EAE6DF", background: "#fff", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase" as const, letterSpacing: "1.2px", flexShrink: 0 }}>
                        Biens concernés
                      </span>
                      <div style={{ display: "flex", gap: 6, overflowX: "auto", flex: 1 }}>
                        {chips.map(c => {
                          const sel = c.key === convActiveData.key
                          const ann = c.annonceId != null ? annonces[c.annonceId] : null
                          if (!ann) return null
                          const photo = Array.isArray(ann.photos) && ann.photos.length > 0 ? ann.photos[0] : null
                          const score = computeConvScore(c)
                          const matchPct = score !== null ? Math.round(score / 10) : null
                          return (
                            <button
                              key={c.key}
                              type="button"
                              onClick={() => {
                                if (sel) return
                                setConvActive(c.key)
                                setVisitesConv([])
                                if (myEmail) {
                                  loadMessages(myEmail, c.other, c.annonceId)
                                  loadVisitesConv(c.other, c.annonceId)
                                }
                              }}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 8,
                                padding: "4px 12px 4px 4px",
                                background: sel ? "#111" : "#FBF9F5",
                                color: sel ? "#fff" : "#111",
                                border: `1px solid ${sel ? "#111" : "#EAE6DF"}`,
                                borderRadius: 999,
                                cursor: sel ? "default" : "pointer",
                                fontFamily: "inherit",
                                flexShrink: 0,
                                transition: "all 200ms",
                              }}
                            >
                              {photo ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={photo} alt="" style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", flexShrink: 0, display: "block" }} />
                              ) : (
                                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#EAE6DF", flexShrink: 0 }} />
                              )}
                              <span style={{ fontSize: 11, fontWeight: 600 }}>{ann.ville || "—"}</span>
                              {typeof ann.prix === "number" ? (
                                <span style={{ fontSize: 10, opacity: 0.7 }}>· {ann.prix.toLocaleString("fr-FR")} €</span>
                              ) : null}
                              {matchPct !== null && (
                                <span style={{
                                  display: "inline-flex", alignItems: "center", gap: 3,
                                  padding: "1px 6px", borderRadius: 999,
                                  background: sel ? "rgba(255,255,255,0.15)" : "#fff",
                                  border: sel ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(17,17,17,0.15)",
                                  color: sel ? "#fff" : "#111",
                                  fontSize: 10, fontWeight: 700,
                                  fontVariantNumeric: "tabular-nums" as const,
                                }}>
                                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: sel ? "#fff" : "#111" }} />
                                  {matchPct}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}

                {/* Bandeau success post-acceptation — CTA fort vers /proprietaire/bail/[id] (commit 3 du flow plan) */}
                {justAcceptedAnnonceId !== null && proprietaireActive && (
                  <div style={{ background: "#15803d", color: "#fff", padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.2px" }}>
                          Locataire accepté ! Le bien est marqué loué.
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
                          Prochaine étape : générer le bail.
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <a
                        href={`/proprietaire/bail/${justAcceptedAnnonceId}`}
                        style={{ background: "#fff", color: "#15803d", padding: "9px 18px", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 12, letterSpacing: "0.3px", textTransform: "uppercase" as const, whiteSpace: "nowrap" }}
                      >
                        Générer le bail →
                      </a>
                      <button
                        type="button"
                        onClick={() => setJustAcceptedAnnonceId(null)}
                        aria-label="Fermer"
                        style={{ background: "rgba(255,255,255,0.18)", color: "#fff", border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", fontSize: 18, lineHeight: 1, fontFamily: "inherit", flexShrink: 0 }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}

                {/* Confirmation inline : louer à ce candidat — palette douce (vert subtil sur fond beige pour s'aligner sur le reste du site) */}
                {accepterLocationOpen && proprietaireActive && convActiveData && (
                  <div style={{ background: "#F7F4EF", borderBottom: "1px solid #EAE6DF", padding: "14px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#DCF5E4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} aria-hidden>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                      <p style={{ fontSize: 13, color: "#111", margin: 0, lineHeight: 1.55 }}>
                        <strong style={{ fontWeight: 700 }}>Louer à {displayName(convActiveData.other)} ?</strong> Le bien sera marqué comme loué
                        {annonceActive && (annonceActive.statut === "loué") && (annonceActive.locataire_email || "").toLowerCase() !== convActiveData.other.toLowerCase() && (
                          <> (et remplacera <em>{displayName(annonceActive.locataire_email || "")}</em>)</>
                        )}
                        . Le locataire recevra une notification et accédera à « Mon logement ». Vous pourrez générer le bail quand vous voulez depuis votre dashboard.
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingLeft: 38 }}>
                      <button
                        type="button"
                        onClick={accepterLocation}
                        disabled={accepteEnCours}
                        style={{ background: accepteEnCours ? "#8a8477" : "#111", color: "#fff", border: "none", borderRadius: 999, padding: "10px 20px", fontWeight: 600, fontSize: 12, cursor: accepteEnCours ? "wait" : "pointer", fontFamily: "inherit", letterSpacing: "0.3px" }}>
                        {accepteEnCours ? "Enregistrement…" : "Confirmer la location"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAccepterLocationOpen(false)}
                        disabled={accepteEnCours}
                        style={{ background: "#fff", color: "#111", border: "1px solid #EAE6DF", borderRadius: 999, padding: "10px 20px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.3px" }}>
                        Annuler
                      </button>
                    </div>
                  </div>
                )}

                {/* Note privée proprio (visible uniquement côté proprio) — palette editoriale + accent amber doux */}
                {proprietaireActive && convActiveData && (
                  <div style={{ background: "#FBF6EA", borderBottom: "1px solid #EADFC6", padding: "10px 20px", display: "flex", alignItems: "center", gap: 8 }}>
                    {noteEditKey === convActiveData.key ? (
                      <>
                        <input
                          autoFocus
                          value={noteDraft}
                          onChange={e => setNoteDraft(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") { saveNote(convActiveData.key, noteDraft); setNoteEditKey(null) }
                            if (e.key === "Escape") setNoteEditKey(null)
                          }}
                          placeholder="Note privée sur ce candidat (visible uniquement par vous)"
                          maxLength={240}
                          style={{ flex: 1, background: "white", border: "1px solid #EADFC6", borderRadius: 999, padding: "7px 14px", fontSize: 13, outline: "none", fontFamily: "inherit", color: "#111" }}
                        />
                        <button type="button"
                          onClick={() => { saveNote(convActiveData.key, noteDraft); setNoteEditKey(null) }}
                          style={{ background: "#a16207", color: "white", border: "none", borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                          Enregistrer
                        </button>
                        <button type="button" onClick={() => setNoteEditKey(null)}
                          style={{ background: "white", color: "#111", border: "1px solid #EADFC6", borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                          Annuler
                        </button>
                      </>
                    ) : candidatNotes[convActiveData.key] ? (
                      <>
                        <span style={{ fontSize: 12.5, color: "#6b5314", flex: 1, lineHeight: 1.5 }}>
                          <strong style={{ color: "#a16207", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.8px", fontSize: 10.5 }}>Note · </strong>
                          {candidatNotes[convActiveData.key]}
                        </span>
                        <button type="button" onClick={() => openNoteEditor(convActiveData.key)}
                          style={{ background: "none", color: "#a16207", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                          Modifier
                        </button>
                        <button type="button" onClick={() => saveNote(convActiveData.key, "")}
                          style={{ background: "none", color: "#b91c1c", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                          Supprimer
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => openNoteEditor(convActiveData.key)}
                        style={{ background: "none", color: "#a16207", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: 0, display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Ajouter une note privée sur ce candidat
                      </button>
                    )}
                  </div>
                )}

                {/* Messages — fond crème très léger pour contraster avec les bulles blanches */}
                <div ref={messagesContainerRef} style={{ flex: 1, overflowY: "auto", padding: isMobile ? "14px 14px" : "22px 24px", display: "flex", flexDirection: "column", gap: 8, background: "#FBF8F3" }}>
                  {messages.length === 0 && (
                    <div style={{ textAlign: "center", color: "#8a8477", marginTop: 48, padding: "0 24px" }}>
                      <p style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontSize: 18, fontWeight: 500, color: "#111", letterSpacing: "-0.3px", margin: 0 }}>Démarrez la conversation</p>
                      <p style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5, color: "#8a8477" }}>Votre premier message apparaîtra ici.</p>
                    </div>
                  )}
                  {messagesAvecSep.map((item, idx) => {
                    if (item.type === "sep") return (
                      // Date divider editorial — hairline + pill beige avec jour en Fraunces italic
                      <div key={`sep-${idx}`} style={{ display: "flex", alignItems: "center", gap: 14, margin: "18px 0 10px", padding: "0 4px" }}>
                        <div style={{ flex: 1, height: 1, background: "#EAE6DF" }} />
                        <span style={{ fontSize: 11, color: "#8a8477", fontWeight: 700, whiteSpace: "nowrap", textTransform: "uppercase" as const, letterSpacing: "1.4px", background: "#F7F4EF", border: "1px solid #EAE6DF", borderRadius: 999, padding: "4px 12px" }}>{item.label}</span>
                        <div style={{ flex: 1, height: 1, background: "#EAE6DF" }} />
                      </div>
                    )
                    const m = item.msg
                    const isMine = m.from_email === myEmail
                    const isDossier = typeof m.contenu === "string" && m.contenu.startsWith(DOSSIER_PREFIX)
                    const isDemande = typeof m.contenu === "string" && m.contenu === DEMANDE_DOSSIER_PREFIX
                    const isEdl = typeof m.contenu === "string" && m.contenu.startsWith(EDL_PREFIX)
                    const isBail = typeof m.contenu === "string" && m.contenu.startsWith(BAIL_PREFIX)
                    const isBailSigne = typeof m.contenu === "string" && m.contenu.startsWith(BAIL_SIGNE_PREFIX)
                    const isEdlAPlanifier = typeof m.contenu === "string" && m.contenu.startsWith(EDL_A_PLANIFIER_PREFIX)
                    const isVisiteConfirmee = typeof m.contenu === "string" && m.contenu.startsWith(VISITE_CONFIRMEE_PREFIX)
                    const isVisiteDemande = typeof m.contenu === "string" && m.contenu.startsWith(VISITE_DEMANDE_PREFIX)
                    const isAutoPaiement = typeof m.contenu === "string" && m.contenu.startsWith(AUTO_PAIEMENT_DEMANDE_PREFIX)
                    const isLoyerPaye = typeof m.contenu === "string" && m.contenu.startsWith(LOYER_PAYE_PREFIX)
                    const isQuittance = typeof m.contenu === "string" && m.contenu.startsWith(QUITTANCE_PREFIX)
                    const isRetrait = typeof m.contenu === "string" && m.contenu.startsWith(RETRAIT_PREFIX)
                    const isDevalidee = typeof m.contenu === "string" && m.contenu.startsWith(DEVALIDEE_PREFIX)
                    const isRefus = typeof m.contenu === "string" && m.contenu.startsWith(REFUS_PREFIX)
                    const isLocation = typeof m.contenu === "string" && m.contenu.startsWith(LOCATION_PREFIX)
                    return (
                      <div key={m.id} style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start" }}>
                        {isDossier ? (() => {
                          // Ne pas reproposer "Accepter & générer le bail" si
                          // le bail a déjà été généré ou envoyé — on bascule
                          // sur "Voir le bail" dans ce cas.
                          const effId = (m.annonce_id || convActiveData?.annonceId || null) as number | null
                          const annCur = effId != null ? annonces[effId] : null
                          const bailDejaGenere = !!(annCur && (annCur.bail_genere_at || annCur.statut === "loué" || annCur.statut === "bail_envoye"))
                          return (
                          <div>
                            <DossierCard contenu={m.contenu} isMine={isMine} annonceId={effId} bailDejaGenere={bailDejaGenere} />
                            <p style={{ fontSize: 10, color: "#8a8477", marginTop: 4, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                          )
                        })() : isDemande ? (
                          <div>
                            <DemandeDossierCard
                              isMine={isMine}
                              dossierRecu={dossierDejaEnvoye}
                              onEnvoyer={envoyerDossier}
                              envoyant={envoyantDossier}
                            />
                            <p style={{ fontSize: 10, color: "#8a8477", marginTop: 4, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : isEdl ? (
                          <div>
                            <EdlCard
                              contenu={m.contenu}
                              isMine={isMine}
                              signatures={(() => {
                                try {
                                  const p = JSON.parse(m.contenu.slice(EDL_PREFIX.length))
                                  return p?.edlId ? edlSignatures[Number(p.edlId)] : undefined
                                } catch { return undefined }
                              })()}
                            />
                            <p style={{ fontSize: 10, color: "#8a8477", marginTop: 4, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : isBail ? (
                          <div>
                            <BailCard
                              contenu={m.contenu}
                              isMine={isMine}
                              annonceId={m.annonce_id || convActiveData?.annonceId || null}
                              signatures={
                                m.annonce_id ? signaturesParAnnonce[m.annonce_id] || [] : []
                              }
                              canSignAsRole={getMyRoleForAnnonce(m.annonce_id || convActiveData?.annonceId)}
                              onRequestSign={requestSign}
                            />
                            <p style={{ fontSize: 10, color: "#8a8477", marginTop: 4, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : isBailSigne ? (
                          <div>
                            <BailSigneCard contenu={m.contenu} isMine={isMine} />
                            <p style={{ fontSize: 10, color: "#8a8477", marginTop: 4, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : isEdlAPlanifier ? (
                          <div>
                            <EdlAPlanifierCard
                              annonceId={m.annonce_id || convActiveData?.annonceId || null}
                              proprietaireActive={!!proprietaireActive}
                              isMine={isMine}
                            />
                            <p style={{ fontSize: 10, color: "#8a8477", marginTop: 4, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : isVisiteConfirmee ? (
                          <div>
                            <VisiteConfirmeeCard contenu={m.contenu} isMine={isMine} />
                            <p style={{ fontSize: 10, color: "#8a8477", marginTop: 4, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : isVisiteDemande ? (
                          <div>
                            <VisiteDemandeCard
                              contenu={m.contenu}
                              isMine={isMine}
                              visitesConv={visitesConv}
                              onOuvrirGestion={() => setVisitesModalOpen(true)}
                              onChooseSlot={(visiteId, slot) => choisirSlotVisite(visiteId, slot)}
                            />
                            <p style={{ fontSize: 10, color: "#8a8477", marginTop: 4, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : isLoyerPaye ? (
                          <div>
                            <LoyerPayeCard contenu={m.contenu} isMine={isMine} />
                            <p style={{ fontSize: 10, color: "#8a8477", marginTop: 4, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : isAutoPaiement ? (
                          <div>
                            <AutoPaiementDemandeCard
                              contenu={m.contenu}
                              isMine={isMine}
                              annonceId={m.annonce_id || convActiveData?.annonceId || null}
                              proprietaireActive={!!proprietaireActive}
                              onConfirme={confirmerAutoPaiement}
                            />
                            <p style={{ fontSize: 10, color: "#8a8477", marginTop: 4, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : isQuittance ? (
                          <div>
                            <QuittanceCard contenu={m.contenu} isMine={isMine} />
                            <p style={{ fontSize: 10, color: "#8a8477", marginTop: 4, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : isRetrait ? (
                          <div>
                            <CandidatureRetireeCard contenu={m.contenu} isMine={isMine} />
                            <p style={{ fontSize: 10, color: "#8a8477", marginTop: 4, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : isRefus ? (
                          <div>
                            <CandidatureNonRetenueCard contenu={m.contenu} isMine={isMine} />
                            <p style={{ fontSize: 10, color: "#8a8477", marginTop: 4, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : isDevalidee ? (
                          <div>
                            <CandidatureDevalideeCard contenu={m.contenu} isMine={isMine} />
                            <p style={{ fontSize: 10, color: "#8a8477", marginTop: 4, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : isLocation ? (() => {
                          // Idem DossierCard : masquer "Générer le bail" si déjà fait.
                          let locAnnId: number | null = null
                          try { const p = JSON.parse(m.contenu.slice(LOCATION_PREFIX.length)); if (p?.annonceId) locAnnId = Number(p.annonceId) } catch { /* ignore */ }
                          const effId = (locAnnId ?? m.annonce_id ?? convActiveData?.annonceId ?? null) as number | null
                          const annCur = effId != null ? annonces[effId] : null
                          const bailDejaGenere = !!(annCur && (annCur.bail_genere_at || annCur.statut === "loué" || annCur.statut === "bail_envoye"))
                          return (
                          <div>
                            <LocationAccepteeCard contenu={m.contenu} isMine={isMine} bailDejaGenere={bailDejaGenere} />
                            <p style={{ fontSize: 10, color: "#8a8477", marginTop: 4, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                          )
                        })() : (() => {
                          // Parse reply-to : si le message est une réponse, afficher la quote au-dessus
                          const { replyToId, text: rawText } = parseReply(m.contenu || "")
                          const isRelance = rawText.startsWith(RELANCE_PREFIX)
                          const text = isRelance ? rawText.slice(RELANCE_PREFIX.length) : rawText
                          const quoted = replyToId ? messages.find(x => x.id === replyToId) : null
                          const quotedText = quoted ? parseReply(quoted.contenu || "").text : null
                          const quotedLabel = quoted ? (quoted.from_email === myEmail ? "Vous" : displayName(quoted.from_email)) : null

                          return (
                            <div
                              style={{ position: "relative", maxWidth: "68%" }}
                              onMouseEnter={() => {
                                const el = document.getElementById(`msg-actions-${m.id}`)
                                if (el) el.style.opacity = "1"
                              }}
                              onMouseLeave={() => {
                                if (menuMsgId !== m.id) {
                                  const el = document.getElementById(`msg-actions-${m.id}`)
                                  if (el) el.style.opacity = "0"
                                }
                              }}
                            >
                              <div style={{ padding: "10px 14px", borderRadius: isMine ? "18px 18px 4px 18px" : "18px 18px 18px 4px", background: isMine ? "#111" : "#fff", color: isMine ? "white" : "#111", border: isMine ? "none" : "1px solid #EAE6DF", boxShadow: isMine ? "none" : "0 1px 2px rgba(0,0,0,0.03)", letterSpacing: "-0.1px" }}>
                                {/* Quote du message auquel on répond */}
                                {quoted && quotedText && (
                                  <div
                                    onClick={() => {
                                      const el = document.getElementById(`msg-${quoted.id}`)
                                      if (el) {
                                        el.scrollIntoView({ behavior: "smooth", block: "center" })
                                        el.style.transition = "background 0.3s"
                                        el.style.background = "rgba(255,200,0,0.2)"
                                        setTimeout(() => { el.style.background = "" }, 1000)
                                      }
                                    }}
                                    style={{
                                      borderLeft: `3px solid ${isMine ? "rgba(255,255,255,0.5)" : "#8a8477"}`,
                                      padding: "4px 10px",
                                      marginBottom: 6,
                                      opacity: 0.75,
                                      fontSize: 12,
                                      lineHeight: 1.4,
                                      cursor: "pointer",
                                      background: isMine ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)",
                                      borderRadius: 6,
                                    }}
                                  >
                                    <p style={{ fontSize: 10, fontWeight: 700, margin: 0, marginBottom: 2, opacity: 0.9 }}>{quotedLabel}</p>
                                    <p style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
                                      {quotedText.length > 120 ? quotedText.slice(0, 120) + "…" : quotedText}
                                    </p>
                                  </div>
                                )}
                                {isRelance && (
                                  <span style={{ display: "inline-block", background: isMine ? "rgba(255,255,255,0.2)" : "#fef3c7", color: isMine ? "white" : "#a16207", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.4px" }}>
                                    Relance
                                  </span>
                                )}
                                <p id={`msg-${m.id}`} style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>{text}</p>
                                <p style={{ fontSize: 10, opacity: 0.5, marginTop: 4, textAlign: "right", margin: "4px 0 0" }}>
                                  {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                                  {isMine && <span style={{ marginLeft: 4 }}>{m.lu ? "✓✓" : "✓"}</span>}
                                </p>
                              </div>

                              {/* Bouton actions (...) + menu */}
                              <div
                                id={`msg-actions-${m.id}`}
                                style={{
                                  position: "absolute",
                                  top: 4,
                                  [isMine ? "left" : "right"]: -30,
                                  opacity: menuMsgId === m.id ? 1 : 0,
                                  transition: "opacity 0.15s",
                                } as React.CSSProperties}
                              >
                                <button
                                  onClick={e => {
                                    e.stopPropagation()
                                    if (menuMsgId === m.id) {
                                      setMenuMsgId(null)
                                      setMenuAnchor(null)
                                    } else {
                                      const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                                      setMenuAnchor({
                                        top: rect.bottom + 6,
                                        left: rect.left,
                                        right: window.innerWidth - rect.right,
                                        isMine,
                                      })
                                      setMenuMsgId(m.id)
                                    }
                                  }}
                                  aria-label="Actions sur le message"
                                  style={{ background: "white", border: "1px solid #EAE6DF", borderRadius: "50%", width: 26, height: 26, cursor: "pointer", fontSize: 14, color: "#8a8477", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontFamily: "inherit", lineHeight: 1, boxShadow: "0 2px 6px rgba(0,0,0,0.1)" }}
                                >
                                  ⋯
                                </button>
                                {/* Menu rendu via portal en bas de page pour échapper overflow chat */}
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })}
                  <div ref={bottomRef} />
                </div>

                {/* Visites : barre résumé compacte + modale de gestion */}
                {visitesConv.length > 0 && (() => {
                  const actives = visitesConv.filter(v => v.statut === "proposée" || v.statut === "confirmée")
                  const annulees = visitesConv.filter(v => v.statut === "annulée")
                  const enAttente = actives.filter(v => v.statut === "proposée" &&
                    (v.propose_par || "").toLowerCase() !== (myEmail || "").toLowerCase()).length
                  const barBg = enAttente > 0 ? "#FBF6EA" : actives.length > 0 ? "#F0FAEE" : "#F7F4EF"
                  const barBorder = enAttente > 0 ? "#EADFC6" : actives.length > 0 ? "#C6E9C0" : "#EAE6DF"
                  return (
                    <div
                      style={{
                        borderTop: "1px solid #F7F4EF",
                        padding: "10px 20px",
                        background: barBg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#111" }}>
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                          <line x1="16" y1="2" x2="16" y2="6"/>
                          <line x1="8" y1="2" x2="8" y2="6"/>
                          <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        <span style={{ fontWeight: 700, color: "#111" }}>
                          {actives.length} visite{actives.length !== 1 ? "s" : ""} active{actives.length !== 1 ? "s" : ""}
                        </span>
                        {enAttente > 0 && (
                          <span style={{ background: "#a16207", color: "white", padding: "1px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700 }}>
                            {enAttente} à traiter
                          </span>
                        )}
                        {annulees.length > 0 && (
                          <span style={{ color: "#8a8477", fontSize: 11 }}>
                            · {annulees.length} annulée{annulees.length > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setVisitesModalOpen(true)}
                        style={{
                          background: "white",
                          border: `1px solid ${barBorder}`,
                          color: "#111",
                          borderRadius: 999,
                          padding: "6px 14px",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        Gérer les visites →
                      </button>
                    </div>
                  )
                })()}

                {/* Zone saisie */}
                <div style={{ borderTop: "1px solid #EAE6DF", padding: isMobile ? "12px 12px 14px" : "14px 20px 16px", background: "white" }}>
                  {/* Chips d'actions + réponses rapides — calque handoff QuickReply L432-438.
                      Actions sémantiques en pill 999, couleurs d'accent préservées mais adoucies.
                      Séparateur vertical remplacé par gap naturel. */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
                    {!proprietaireActive && (
                      <button onClick={envoyerDossier} disabled={envoyantDossier}
                        style={{ background: "#fff", border: "1px solid #C6E9C0", color: "#15803d", borderRadius: 999, padding: "6px 14px", fontSize: 11.5, fontWeight: 600, cursor: envoyantDossier ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, opacity: envoyantDossier ? 0.6 : 1, letterSpacing: "0.1px" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#15803d" }} />
                        {envoyantDossier ? "Envoi…" : "Envoyer mon dossier"}
                      </button>
                    )}
                    {proprietaireActive && (
                      <button onClick={demanderDossier} disabled={demandantDossier}
                        style={{ background: "#fff", border: "1px solid #EADFC6", color: "#b45309", borderRadius: 999, padding: "6px 14px", fontSize: 11.5, fontWeight: 600, cursor: demandantDossier ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, opacity: demandantDossier ? 0.6 : 1, letterSpacing: "0.1px" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b" }} />
                        {demandantDossier ? "Envoi…" : "Demander le dossier"}
                      </button>
                    )}
                    {convActiveData?.annonceId && (
                      candidatureValidee ? (
                        <button onClick={() => {
                          // Bouton = ouvre la modale (ProposerVisiteDialog en bas de page).
                          setCounterTarget(null)
                          setShowVisiteForm(true)
                        }}
                          style={{ background: "#fff", border: "1px solid #D7E3F4", color: "#1d4ed8", borderRadius: 999, padding: "6px 14px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, letterSpacing: "0.1px" }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1d4ed8" }} />
                          Proposer une visite
                        </button>
                      ) : (
                        // Locataire avec candidature non validée : bouton grisé qui
                        // ouvre la même modale en mode locked (popup explicatif).
                        <button onClick={() => {
                          setCounterTarget(null)
                          setShowVisiteForm(true)
                        }}
                          aria-label="Proposer une visite — verrouillé tant que la candidature n'est pas validée"
                          title="Le propriétaire doit d'abord valider votre candidature"
                          style={{ background: "#F7F4EF", border: "1px solid #EAE6DF", color: "#8a8477", borderRadius: 999, padding: "6px 14px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, letterSpacing: "0.1px" }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="3" y="11" width="18" height="11" rx="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                          Proposer une visite
                        </button>
                      )
                    )}
                    {/* QuickReply "Question sur le loyer" — handoff messages.jsx l. 399.
                       Pré-remplit le composer pour aider l'user à formuler une
                       question récurrente. Visible des deux côtés (locataire qui
                       demande un détail, proprio qui clarifie). Garde-fou : ne
                       remplace pas le draft si déjà tapé (concat seulement si vide). */}
                  {convActiveData && (
                    <button
                      type="button"
                      onClick={() => {
                        if (nouveau.trim().length === 0) {
                          setNouveau("Bonjour, j'aurais une question concernant le loyer et les charges. ")
                          inputRef.current?.focus()
                        }
                      }}
                      title="Insérer une question type sur le loyer"
                      style={{ background: "#fff", border: "1px solid #EAE6DF", color: "#6b6b6b", borderRadius: 999, padding: "6px 14px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, letterSpacing: "0.1px" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#6b6b6b" }} />
                      Question sur le loyer
                    </button>
                  )}
                  </div>
                  {/* NOTE : Formulaire visite inline retiré — migré vers <ProposerVisiteDialog>
                      monté en bas de page (calque handoff modals.jsx VisitRequestModal). */}
                  {/* Preview du message auquel on répond — palette beige handoff */}
                  {replyTo && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#F7F4EF", borderLeft: "3px solid #111", borderRadius: 12, padding: "10px 14px", marginBottom: 10, border: "1px solid #EAE6DF", borderLeftWidth: 3 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: "#111", margin: 0, marginBottom: 2, letterSpacing: "0.2px" }}>
                          Répondre à {replyTo.from === myEmail ? "vous-même" : displayName(replyTo.from)}
                        </p>
                        <p style={{ fontSize: 12, color: "#8a8477", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.5 }}>
                          {replyTo.contenu.slice(0, 100)}{replyTo.contenu.length > 100 ? "…" : ""}
                        </p>
                      </div>
                      <button onClick={() => setReplyTo(null)}
                        aria-label="Annuler la réponse"
                        style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#8a8477", padding: 4, fontFamily: "inherit", lineHeight: 1 }}>
                        ×
                      </button>
                    </div>
                  )}
                  {peerTyping && (
                    <div aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, paddingLeft: 4 }}>
                      <style>{`@keyframes km-typing { 0%,60%,100%{opacity:0.3;transform:translateY(0)} 30%{opacity:1;transform:translateY(-3px)} }`}</style>
                      <span style={{ display: "inline-flex", gap: 4, padding: "8px 12px", background: "#F7F4EF", border: "1px solid #EAE6DF", borderRadius: 14 }}>
                        {[0, 1, 2].map(i => (
                          <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#8a8477", animation: "km-typing 1.2s ease-in-out infinite", animationDelay: `${i * 150}ms` }} />
                        ))}
                      </span>
                      <span style={{ fontSize: 11, color: "#8a8477" }}>En train d&apos;écrire…</span>
                    </div>
                  )}
                  {/* Composer handoff L401-419 : container beige pill avec input transparent + bouton rond */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F7F4EF", borderRadius: 24, padding: "6px 6px 6px 18px", border: "1px solid #EAE6DF" }}>
                    <input ref={inputRef} value={nouveau} onChange={e => { setNouveau(e.target.value); signalTyping() }}
                      onKeyDown={e => e.key === "Enter" && !e.shiftKey && envoyer()}
                      aria-label={replyTo ? "Saisir votre réponse" : "Saisir un message"}
                      placeholder={replyTo ? "Votre réponse…" : "Votre message… (↵ pour envoyer)"}
                      style={{ flex: 1, padding: "10px 0", border: "none", background: "transparent", fontSize: 14, outline: "none", fontFamily: "inherit", color: "#111", letterSpacing: "-0.1px" }} />
                    <button onClick={envoyer} disabled={envoi || !nouveau.trim()}
                      aria-label="Envoyer le message"
                      style={{ background: nouveau.trim() && !envoi ? "#111" : "#EAE6DF", color: nouveau.trim() && !envoi ? "white" : "#8a8477", border: "none", borderRadius: "50%", width: 38, height: 38, cursor: envoi || !nouveau.trim() ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 200ms ease" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── Colonne droite : détails bien + docs + timeline (handoff L448-505) ── */}
          {!isMobile && convActiveData && (() => {
            const ann = annonceActive
            const photo = Array.isArray(ann?.photos) && ann.photos.length > 0 ? ann.photos[0] : null
            const statut = deriveStatut(convActiveData)
            const matchPct = compatBadge(computeConvScore(convActiveData))?.pct ?? null
            // Étapes timeline dérivées du statut (handoff L489-493)
            // EDL d'entrée ajouté entre "Bail signé" et "Emménagement" — étape
            // légale obligatoire. On détecte son état via les [EDL_CARD] de la
            // conv + edlSignatures (double signature locataire + bailleur).
            type Step = { n: number; label: string; state: "done" | "active" | "todo" }
            const stepsOrder: Array<{ n: number; label: string }> = [
              { n: 1, label: "Candidature envoyée" },
              { n: 2, label: "Dossier partagé" },
              { n: 3, label: "Visite programmée" },
              { n: 4, label: "Bail signé" },
              { n: 5, label: "État des lieux" },
              { n: 6, label: "Emménagement" },
            ]
            // Scan des [EDL_CARD] de la conv courante + leurs signatures
            let edlFullySigned = false
            for (const m of messages) {
              if (typeof m.contenu === "string" && m.contenu.startsWith(EDL_PREFIX)) {
                try {
                  const payload = JSON.parse(m.contenu.slice(EDL_PREFIX.length))
                  const edlId = payload?.edlId ? Number(payload.edlId) : null
                  if (edlId) {
                    const sig = edlSignatures[edlId]
                    if (sig?.locataire && sig?.bailleur) { edlFullySigned = true; break }
                  }
                } catch { /* ignore */ }
              }
            }
            // Quand le bail est signé (statut="bail") :
            //   - EDL non lancé → étape 4 (Bail signé) marquée "done", étape 5 (EDL) active
            //   - EDL lancé mais non doublement signé → étape 5 active
            //   - EDL validé par les 2 parties → étape 6 (Emménagement) active
            const bailActiveIdx = edlFullySigned ? 5 : 4
            const activeIdxByStatut: Record<StatutConv, number> = {
              contact: 0, dossier: 1, validee: 1, visite: 2, bail: bailActiveIdx, rejete: 0,
            }
            const activeIdx = activeIdxByStatut[statut]
            const steps: Step[] = stepsOrder.map((s, i) => ({
              n: s.n,
              label: s.label,
              state: i < activeIdx ? "done" : i === activeIdx ? "active" : "todo",
            }))
            // Documents partagés = [DOSSIER_CARD] messages de la conv courante
            type Doc = { label: string; sub: string; href: string | null }
            const docs: Doc[] = []
            for (const m of messages) {
              if (typeof m.contenu === "string" && m.contenu.startsWith(DOSSIER_PREFIX)) {
                try {
                  const d = JSON.parse(m.contenu.slice(DOSSIER_PREFIX.length))
                  const isSender = m.from_email?.toLowerCase() === myEmail
                  docs.push({
                    label: `Dossier · ${d.nom || d.email || (isSender ? "Vous" : "Candidat")}`,
                    sub: d.score != null ? `Score ${d.score}% · chiffré` : "chiffré",
                    href: d.shareUrl || null,
                  })
                } catch { /* ignore */ }
              }
            }
            return (
              <aside style={{
                width: 320,
                flexShrink: 0,
                background: "white",
                borderRadius: 0,
                borderLeft: "1px solid #EAE6DF",
                overflow: "hidden",
                boxShadow: "none",
                display: "flex",
                flexDirection: "column",
                overflowY: "auto",
              }}>
                {ann ? (
                  <>
                    {/* Photo 4/3 + badge MATCH overlay (handoff L453-455) */}
                    <div style={{ position: "relative", aspectRatio: "4/3", background: photo ? `#000 url(${photo}) center/cover no-repeat` : "#F7F4EF" }}>
                      {matchPct !== null && (
                        <div style={{ position: "absolute", top: 12, left: 12, padding: "4px 10px", background: "rgba(255,255,255,0.95)", borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: "1px", color: "#111" }}>
                          {matchPct}% MATCH
                        </div>
                      )}
                    </div>
                    {/* Listing card (handoff L456-467) */}
                    <div style={{ padding: "18px 20px" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase" as const, letterSpacing: "1.4px", marginBottom: 6 }}>
                        {ann.ville || "—"}
                      </div>
                      <h3 style={{ fontSize: 16, fontWeight: 500, margin: 0, marginBottom: 14, letterSpacing: "-0.2px", lineHeight: 1.3, color: "#111" }}>
                        {ann.titre}
                      </h3>
                      {typeof ann.prix === "number" && (
                        <>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                            <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.5px", color: "#111" }}>
                              {ann.prix.toLocaleString("fr-FR")} €
                            </span>
                            <span style={{ fontSize: 12, color: "#8a8477" }}>/mois</span>
                          </div>
                          <div style={{ fontSize: 12, color: "#8a8477", letterSpacing: "0.1px" }}>
                            {ann.surface ? `${ann.surface} m²` : ""}{ann.pieces ? ` · ${ann.pieces} p.` : ""}
                          </div>
                        </>
                      )}
                      <Link href={`/annonces/${convActiveData.annonceId}`} style={{ display: "block", width: "100%", marginTop: 16, padding: "10px 14px", background: "#fff", border: "1px solid #111", borderRadius: 999, fontSize: 12, fontWeight: 600, fontFamily: "inherit", color: "#111", textAlign: "center" as const, textDecoration: "none", boxSizing: "border-box" }}>
                        Voir l&apos;annonce →
                      </Link>
                    </div>
                    {/* Documents partagés (handoff L468-486) */}
                    <div style={{ padding: "16px 20px", borderTop: "1px solid #EAE6DF" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase" as const, letterSpacing: "1.4px", marginBottom: 12 }}>
                        Documents partagés
                      </div>
                      {docs.length === 0 ? (
                        <p style={{ fontSize: 12, color: "#8a8477", fontStyle: "italic" as const, margin: 0, lineHeight: 1.5 }}>Aucun document partagé dans cette conversation.</p>
                      ) : docs.map((d, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i === 0 ? "none" : "1px solid #EAE6DF" }}>
                          <div style={{ width: 28, height: 28, borderRadius: 8, background: "#F7F4EF", border: "1px solid #EAE6DF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</div>
                            <div style={{ fontSize: 10.5, color: "#8a8477", letterSpacing: "0.1px" }}>{d.sub}</div>
                          </div>
                          {d.href && (
                            <a href={d.href} target="_blank" rel="noopener noreferrer" title="Ouvrir" style={{ width: 26, height: 26, border: "none", background: "transparent", cursor: "pointer", color: "#8a8477", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/>
                                <line x1="12" y1="15" x2="12" y2="3"/>
                              </svg>
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                    {/* Timeline 5 steps (handoff L487-494 + Step component L507-525) */}
                    <div style={{ padding: "16px 20px", borderTop: "1px solid #EAE6DF" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase" as const, letterSpacing: "1.4px", marginBottom: 12 }}>
                        État
                      </div>
                      {steps.map((s, i) => {
                        const last = i === steps.length - 1
                        const done = s.state === "done"
                        const active = s.state === "active"
                        return (
                          <div key={s.n} style={{ display: "flex", gap: 12, paddingBottom: last ? 0 : 12 }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                              <div style={{
                                width: 22, height: 22, borderRadius: "50%",
                                background: done ? "#111" : "#fff",
                                border: active ? "2px solid #111" : done ? "none" : "1px solid #EAE6DF",
                                color: done ? "#fff" : active ? "#111" : "#8a8477",
                                fontSize: 10, fontWeight: 700,
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}>
                                {done ? (
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"/>
                                  </svg>
                                ) : s.n}
                              </div>
                              {!last && <div style={{ width: 1, flex: 1, background: done ? "#111" : "#EAE6DF", minHeight: 18, marginTop: 2 }} />}
                            </div>
                            <div style={{ paddingTop: 2, paddingBottom: 8, fontSize: 12, fontWeight: active ? 600 : 400, color: active ? "#111" : done ? "#8a8477" : "#8a8477", lineHeight: 1.3 }}>
                              {s.label}
                            </div>
                          </div>
                        )
                      })}
                      {statut === "rejete" && (
                        <p style={{ marginTop: 10, fontSize: 11, fontWeight: 600, color: "#b91c1c" }}>
                          Candidature refusée.
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ padding: 30, textAlign: "center" as const, color: "#8a8477", fontSize: 13 }}>
                    <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#F7F4EF", display: "flex", alignItems: "center", justifyContent: "center", margin: "40px auto 16px" }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#8a8477" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s-8-4.5-8-11.8a8 8 0 0 1 16 0c0 7.3-8 11.8-8 11.8z"/>
                        <circle cx="12" cy="10" r="3"/>
                      </svg>
                    </div>
                    Aucune annonce liée à cette conversation
                  </div>
                )}
              </aside>
            )
          })()}
        </div>
      </div>
      {/* Menu actions message — portal body pour échapper overflow-hidden du chat */}
      {menuMsgId !== null && menuAnchor && typeof document !== "undefined" && (() => {
        const m = messages.find(x => x.id === menuMsgId)
        if (!m) return null
        const close = () => { setMenuMsgId(null); setMenuAnchor(null) }
        const menuStyle: React.CSSProperties = menuAnchor.isMine
          ? { position: "fixed", top: menuAnchor.top, left: menuAnchor.left, zIndex: 10001, background: "white", border: "1px solid #EAE6DF", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", minWidth: 170, overflow: "hidden" }
          : { position: "fixed", top: menuAnchor.top, right: menuAnchor.right, zIndex: 10001, background: "white", border: "1px solid #EAE6DF", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", minWidth: 170, overflow: "hidden" }
        return createPortal(
          <>
            <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 10000 }} />
            <div style={menuStyle}>
              <button onClick={() => { repondreMessage(m); close() }}
                style={{ display: "block", width: "100%", padding: "10px 14px", background: "white", border: "none", textAlign: "left", fontSize: 13, color: "#111", cursor: "pointer", fontFamily: "inherit" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#F7F4EF")}
                onMouseLeave={e => (e.currentTarget.style.background = "white")}>
                Répondre
              </button>
              <button onClick={() => { copierMessage(m.contenu); close() }}
                style={{ display: "block", width: "100%", padding: "10px 14px", background: "white", border: "none", textAlign: "left", fontSize: 13, color: "#111", cursor: "pointer", fontFamily: "inherit" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#F7F4EF")}
                onMouseLeave={e => (e.currentTarget.style.background = "white")}>
                Copier le texte
              </button>
              {menuAnchor.isMine && (
                <button onClick={() => { supprimerMessage(m.id); close() }}
                  style={{ display: "block", width: "100%", padding: "10px 14px", background: "white", border: "none", textAlign: "left", fontSize: 13, color: "#b91c1c", cursor: "pointer", fontFamily: "inherit", borderTop: "1px solid #F7F4EF" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#fef2f2")}
                  onMouseLeave={e => (e.currentTarget.style.background = "white")}>
                  Supprimer
                </button>
              )}
            </div>
          </>,
          document.body
        )
      })()}
    </main>
  )
}

export default function Messages() {
  return (
    <Suspense fallback={<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>Chargement...</div>}>
      <MessagesInner />
    </Suspense>
  )
}
