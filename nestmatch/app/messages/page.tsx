"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../lib/supabase"
import { useRole } from "../providers"
import { Suspense } from "react"
import { useResponsive } from "../hooks/useResponsive"
import { displayName } from "../../lib/privacy"
import AnnulerVisiteDialog from "../components/AnnulerVisiteDialog"
import { annulerVisite, STATUT_VISITE_STYLE as STATUT_VISITE } from "../../lib/visitesHelpers"
import { postNotif } from "../../lib/notificationsClient"
import MessageSkeleton from "../components/ui/MessageSkeleton"
import BailSignatureModal from "../components/BailSignatureModal"
import Modal from "../components/ui/Modal"
import type { BailData } from "../../lib/bailPDF"

const DOSSIER_PREFIX = "[DOSSIER_CARD]"
const BAIL_PREFIX = "[BAIL_CARD]"
const BAIL_SIGNE_PREFIX = "[BAIL_SIGNE]"
const EDL_A_PLANIFIER_PREFIX = "[EDL_A_PLANIFIER]"
const DEMANDE_DOSSIER_PREFIX = "[DEMANDE_DOSSIER]"
const EDL_PREFIX = "[EDL_CARD]"
const RETRAIT_PREFIX = "[CANDIDATURE_RETIREE]"
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

function DossierCard({ contenu, isMine, annonceId }: { contenu: string; isMine: boolean; annonceId?: number | null }) {
  let data: any = {}
  try { data = JSON.parse(contenu.slice(DOSSIER_PREFIX.length)) } catch {}
  const scoreColor = data.score >= 80 ? "#15803d" : data.score >= 50 ? "#c2410c" : "#b91c1c"
  const scoreBg   = data.score >= 80 ? "#dcfce7" : data.score >= 50 ? "#fff7ed" : "#fee2e2"
  return (
    <div style={{ background: isMine ? "#1a1a1a" : "#f9fafb", border: `1.5px solid ${isMine ? "#333" : "#e5e7eb"}`, borderRadius: 14, padding: "14px 18px", minWidth: 220, maxWidth: 280 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 700, fontSize: 13, color: isMine ? "white" : "#111", margin: 0 }}>Dossier locataire</p>
          <p style={{ fontSize: 11, color: isMine ? "#9ca3af" : "#6b7280", margin: 0 }}>{data.email}</p>
        </div>
        {data.score != null && (
          <span style={{ background: scoreBg, color: scoreColor, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>{data.score}%</span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {data.nom           && <Row label="Nom"       val={data.nom}                                                   isMine={isMine} />}
        {data.situation_pro && <Row label="Situation" val={data.situation_pro}                                         isMine={isMine} />}
        {data.revenus_mensuels && <Row label="Revenus" val={`${Number(data.revenus_mensuels).toLocaleString("fr-FR")} €/mois`} isMine={isMine} />}
        {data.garant        && <Row label="Garant"    val={data.type_garant || "Oui"}                                  isMine={isMine} />}
      </div>
      {!isMine && data.shareUrl && (
        <a href={data.shareUrl} target="_blank" rel="noopener noreferrer"
          style={{ display: "block", marginTop: 10, background: "#111", color: "white", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, textAlign: "center", textDecoration: "none", fontFamily: "inherit" }}>
          Voir les pièces du dossier →
        </a>
      )}
      {!isMine && annonceId && data.email && (
        <a href={`/proprietaire/bail/${annonceId}?locataire=${encodeURIComponent(data.email)}`}
          style={{ display: "block", marginTop: 6, background: "#16a34a", color: "white", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, textAlign: "center", textDecoration: "none", fontFamily: "inherit" }}>
          Accepter &amp; générer le bail →
        </a>
      )}
      {isMine && data.shareUrl && (
        <p style={{ marginTop: 8, fontSize: 10, color: "#9ca3af" }}>Lien de partage 30 j inclus pour le propriétaire.</p>
      )}
    </div>
  )
}
function Row({ label, val, isMine }: { label: string; val: string; isMine: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span style={{ fontSize: 11, color: isMine ? "#9ca3af" : "#6b7280" }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: isMine ? "white" : "#111" }}>{val}</span>
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
      <div style={{ background: "#1a1a1a", border: "1.5px solid #333", borderRadius: 14, padding: "14px 18px", minWidth: 220, maxWidth: 280 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: 13, color: "white", margin: 0 }}>Dossier demandé</p>
            <p style={{ fontSize: 11, color: dossierRecu ? "#86efac" : "#9ca3af", margin: "2px 0 0" }}>
              {dossierRecu ? "Dossier reçu" : "En attente de réponse..."}
            </p>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div style={{ background: "#f9fafb", border: "1.5px solid #e5e7eb", borderRadius: 14, padding: "14px 18px", minWidth: 220, maxWidth: 280 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 13, color: "#111", margin: 0 }}>Demande de dossier</p>
          <p style={{ fontSize: 11, color: "#6b7280", margin: "2px 0 0" }}>Le propriétaire souhaite voir votre dossier</p>
        </div>
      </div>
      {dossierRecu ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#dcfce7", borderRadius: 8, padding: "7px 12px" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#15803d" }}>Dossier envoyé</span>
        </div>
      ) : (
        <button onClick={onEnvoyer} disabled={envoyant}
          style={{ width: "100%", background: envoyant ? "#e5e7eb" : "#111", color: envoyant ? "#9ca3af" : "white", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: envoyant ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
          {envoyant ? "Envoi en cours..." : "Envoyer mon dossier"}
        </button>
      )}
    </div>
  )
}

// ─── EDL Card ───────────────────────────────────────────────────────────────

function EdlCard({ contenu, isMine }: { contenu: string; isMine: boolean }) {
  let data: any = {}
  try { data = JSON.parse(contenu.slice(EDL_PREFIX.length)) } catch {}
  const typeLabel = data.type === "entree" ? "entree" : "sortie"
  const dateLabel = data.dateEdl ? new Date(data.dateEdl).toLocaleDateString("fr-FR") : ""

  if (isMine) {
    return (
      <div style={{ background: "#1a1a1a", border: "1.5px solid #333", borderRadius: 14, padding: "14px 18px", minWidth: 220, maxWidth: 280 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: data.edlId ? 10 : 0 }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: 13, color: "white", margin: 0 }}>État des lieux envoyé</p>
            <p style={{ fontSize: 11, color: "#9ca3af", margin: "2px 0 0" }}>
              {data.bienTitre || "Bien"} — {dateLabel}
            </p>
          </div>
        </div>
        {data.edlId && (
          <a href={`/edl/consulter/${data.edlId}`}
            style={{ display: "block", background: "white", color: "#111", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, textAlign: "center", textDecoration: "none", fontFamily: "inherit" }}>
            Consulter l&apos;EDL →
          </a>
        )}
      </div>
    )
  }

  return (
    <div style={{ background: "#f9fafb", border: "1.5px solid #e5e7eb", borderRadius: 14, padding: "14px 18px", minWidth: 220, maxWidth: 280 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 13, color: "#111", margin: 0 }}>État des lieux d'{typeLabel}</p>
          <p style={{ fontSize: 11, color: "#6b7280", margin: "2px 0 0" }}>
            {data.bienTitre || "Bien"} — {dateLabel}
          </p>
        </div>
      </div>
      {data.edlId && (
        <a href={`/edl/consulter/${data.edlId}`}
          style={{
            display: "block", width: "100%", background: "#111", color: "white",
            border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13,
            fontWeight: 700, textAlign: "center", textDecoration: "none",
            fontFamily: "inherit",
          }}>
          Consulter l'EDL →
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
    const statutColor = sigLocataire && sigBailleur ? "#a7f3d0" : sigLocataire ? "#fcd34d" : "#fde68a"
    return (
      <div style={{ background: "#1a1a1a", border: "1.5px solid #333", borderRadius: 14, padding: "14px 18px", minWidth: 240, maxWidth: 320 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: statutColor, textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 6px" }}>
          {statutLabel}
        </p>
        <p style={{ fontWeight: 700, fontSize: 13, color: "white", margin: 0 }}>{data.titreBien || "Bien"} — {data.villeBien}</p>
        <p style={{ fontSize: 11, color: "#9ca3af", margin: "4px 0 8px" }}>Début {dateStr}{loyer > 0 ? ` · ${loyer} €/mois` : ""}</p>

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
    <div style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 14, padding: "14px 18px", minWidth: 240, maxWidth: 320 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 6px" }}>
        {dejaSigneParMoi ? "Bail signé" : "Bail à signer"}
      </p>
      <p style={{ fontWeight: 700, fontSize: 14, color: "#111", margin: 0 }}>{data.titreBien || "Bien"}</p>
      <p style={{ fontSize: 12, color: "#6b7280", margin: "2px 0 10px" }}>{data.villeBien || ""}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151" }}>
        {dateStr && <div>Début : <strong>{dateStr}</strong></div>}
        {loyer > 0 && <div>Loyer : <strong>{loyer} €/mois</strong></div>}
        {data.duree && <div>Durée : <strong>{data.duree} mois</strong></div>}
      </div>

      {sigLocataire && (
        <div style={{ marginTop: 10, padding: "6px 10px", background: "#dcfce7", borderRadius: 8, fontSize: 11, color: "#15803d", fontWeight: 700 }}>
          {signatureBadge(sigLocataire)}
        </div>
      )}
      {sigBailleur && (
        <div style={{ marginTop: 6, padding: "6px 10px", background: "#dcfce7", borderRadius: 8, fontSize: 11, color: "#15803d", fontWeight: 700 }}>
          {signatureBadge(sigBailleur)}
        </div>
      )}

      {/* CTA signature — priorité sur tout */}
      {canSignAsRole === "locataire" && !dejaSigneParMoi && (
        <button onClick={signer}
          style={{ display: "block", width: "100%", marginTop: 12, background: "#15803d", color: "white", border: "none", borderRadius: 8, padding: "12px 16px", fontSize: 14, fontWeight: 800, textAlign: "center", cursor: "pointer", fontFamily: "inherit" }}>
          ✍ Signer le bail
        </button>
      )}

      {canDownload && (
        <button onClick={telecharger} disabled={downloading}
          style={{ display: "block", width: "100%", marginTop: 8, background: "white", color: "#15803d", border: "1.5px solid #15803d", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, textAlign: "center", cursor: downloading ? "wait" : "pointer", fontFamily: "inherit" }}>
          {downloading ? "Génération…" : "Télécharger le PDF"}
        </button>
      )}
      <a href="/mon-logement"
        style={{ display: "block", marginTop: 6, background: "white", color: "#6b7280", border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "7px 16px", fontSize: 11, fontWeight: 600, textAlign: "center", textDecoration: "none", fontFamily: "inherit" }}>
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
    <div style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 14, padding: "14px 18px", minWidth: 240, maxWidth: 340 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#1e40af", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 6px" }}>
        Prochaine étape — État des lieux
      </p>
      <p style={{ fontSize: 13, color: "#111", margin: 0, fontWeight: 600, lineHeight: 1.5 }}>
        Le bail est signé par les deux parties ✓
      </p>
      <p style={{ fontSize: 12, color: "#1e40af", margin: "6px 0 10px", lineHeight: 1.5 }}>
        {proprietaireActive
          ? "Planifiez l'état des lieux d'entrée avec votre locataire."
          : "Votre bailleur va maintenant créer l'état des lieux d'entrée — vous serez notifié."}
      </p>
      <a
        href={href}
        style={{
          display: "inline-block",
          background: "#1d4ed8",
          color: "white",
          borderRadius: 8,
          padding: "9px 16px",
          fontSize: 13,
          fontWeight: 700,
          textDecoration: "none",
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
    <div style={{ background: confirmed ? "#dcfce7" : "#eff6ff", border: `1.5px solid ${confirmed ? "#86efac" : "#bfdbfe"}`, borderRadius: 14, padding: "14px 18px", minWidth: 240, maxWidth: 340 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: confirmed ? "#15803d" : "#1e40af", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 6px" }}>
        {confirmed ? "Auto-paiement actif ✓" : "Demande d'auto-paiement"}
      </p>
      <p style={{ fontSize: 13, color: "#111", margin: 0, fontWeight: 600, lineHeight: 1.5 }}>
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
          style={{ marginTop: 10, background: "#1d4ed8", color: "white", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
        >
          ✓ Confirmer l&apos;auto-paiement
        </button>
      )}
      {confirmed && (
        <p style={{ fontSize: 11, color: "#15803d", margin: "8px 0 0", lineHeight: 1.5 }}>
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
    <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 14, padding: "14px 18px", minWidth: 240, maxWidth: 320 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M16 12l-4 4-4-4M12 8v8"/>
        </svg>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 }}>
          Paiement signalé
        </p>
      </div>
      <p style={{ fontWeight: 700, fontSize: 14, color: "#111", margin: 0, textTransform: "capitalize" }}>
        Loyer de {moisLabel}
      </p>
      <p style={{ fontSize: 13, color: "#15803d", margin: "4px 0 0", fontWeight: 600 }}>
        {montant.toLocaleString("fr-FR")} € payé{isMine ? "" : "s"}
      </p>
      <p style={{ fontSize: 12, color: "#166534", margin: "8px 0 0", lineHeight: 1.5 }}>
        {isMine
          ? "En attente de la quittance du propriétaire."
          : "Le locataire signale avoir payé. Envoyez-lui la quittance depuis l'onglet Statistiques."}
      </p>
    </div>
  )
}

// Carte "Demande de visite" ou "Contre-proposition" — envoyée quand on propose
// une visite. Statut dynamique via visitesConv (proposée/confirmée/annulée).
function VisiteDemandeCard({
  contenu,
  isMine,
  visitesConv,
  onOuvrirGestion,
}: {
  contenu: string
  isMine: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visitesConv: any[]
  onOuvrirGestion: () => void
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = {}
  try { data = JSON.parse(contenu.slice(VISITE_DEMANDE_PREFIX.length)) } catch { /* ignore */ }
  const dateStr = data.dateFormatee || (data.dateVisite ? formatVisiteDate(data.dateVisite, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "")
  // Trouve le statut réel de la visite (si toujours en DB)
  const visite = data.visiteId ? visitesConv.find(v => v.id === data.visiteId) : null
  const statut = visite?.statut || "proposée"
  const title = data.isCounter ? "Contre-proposition" : "Demande de visite"
  // Palette selon le statut
  const palette =
    statut === "confirmée" ? { bg: "#dcfce7", border: "#86efac", accent: "#15803d", badge: "Confirmée" }
    : statut === "annulée" ? { bg: "#fee2e2", border: "#fecaca", accent: "#dc2626", badge: "Annulée" }
    : { bg: "#eff6ff", border: "#bfdbfe", accent: "#1d4ed8", badge: "En attente" }
  return (
    <div style={{ background: palette.bg, border: `1.5px solid ${palette.border}`, borderRadius: 14, padding: "14px 18px", minWidth: 240, maxWidth: 320 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: palette.accent, textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 }}>
          {title}
        </p>
        <span style={{ background: "white", color: palette.accent, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, border: `1px solid ${palette.border}` }}>
          {palette.badge}
        </span>
      </div>
      <p style={{ fontWeight: 700, fontSize: 14, color: "#111", margin: 0, textTransform: "capitalize" }}>
        {dateStr}
      </p>
      {data.heure && (
        <p style={{ fontSize: 12, color: "#6b7280", margin: "2px 0 0" }}>à {data.heure}</p>
      )}
      {data.message && (
        <p style={{ fontSize: 12, color: "#374151", margin: "8px 0 0", fontStyle: "italic", lineHeight: 1.5 }}>
          « {data.message} »
        </p>
      )}
      {statut === "proposée" && (
        <button
          type="button"
          onClick={onOuvrirGestion}
          style={{ marginTop: 10, width: "100%", background: isMine ? "white" : palette.accent, color: isMine ? palette.accent : "white", border: isMine ? `1.5px solid ${palette.border}` : "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
        >
          {isMine ? "Gérer" : "Répondre"} →
        </button>
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
    <div style={{ background: "#dcfce7", border: "1.5px solid #86efac", borderRadius: 14, padding: "12px 16px", minWidth: 240, maxWidth: 320 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5"/>
        </svg>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 }}>
          Visite confirmée
        </p>
      </div>
      <p style={{ fontSize: 13, color: "#111", margin: 0, fontWeight: 600, lineHeight: 1.5 }}>
        {isMine ? "Vous avez confirmé la visite" : "La visite est confirmée"}
      </p>
      <p style={{ fontSize: 12, color: "#15803d", margin: "4px 0 0", lineHeight: 1.5 }}>
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
    <div style={{ background: "#dcfce7", border: "1.5px solid #86efac", borderRadius: 14, padding: "12px 16px", minWidth: 240, maxWidth: 320 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 4px" }}>
        Bail signé ✓
      </p>
      <p style={{ fontSize: 13, color: "#111", margin: 0, fontWeight: 600 }}>
        {isMine ? `Vous avez signé le bail` : `${data.nom || "La partie"} a signé en tant que ${roleLabel}`}
      </p>
      {d && (
        <p style={{ fontSize: 11, color: "#15803d", margin: "4px 0 0" }}>{d}</p>
      )}
    </div>
  )
}

// ─── Location acceptée Card ──────────────────────────────────────────────────

function LocationAccepteeCard({ contenu, isMine }: { contenu: string; isMine: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = {}
  try { data = JSON.parse(contenu.slice(LOCATION_PREFIX.length)) } catch { /* ignore */ }
  const dateStr = data.accepteLe
    ? new Date(data.accepteLe).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : ""
  return (
    <div style={{ background: "#dcfce7", border: "1.5px solid #86efac", borderRadius: 14, padding: "14px 18px", minWidth: 240, maxWidth: 340 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 6px" }}>
        {isMine ? "Location confirmée" : "Félicitations !"}
      </p>
      <p style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: 0, lineHeight: 1.4 }}>
        {isMine ? "Vous avez accepté cette candidature." : "Votre candidature a été acceptée."}
        {data.bienTitre ? ` (${data.bienTitre})` : ""}
      </p>
      <p style={{ fontSize: 12, color: "#166534", margin: "6px 0 0", lineHeight: 1.5 }}>
        {isMine
          ? "Le locataire peut désormais accéder à « Mon logement ». Générez le bail quand vous êtes prêt."
          : "Retrouvez votre logement, vos quittances et l'état des lieux dans « Mon logement »."}
      </p>
      {dateStr && <p style={{ fontSize: 11, color: "#15803d", margin: "6px 0 0" }}>{dateStr}</p>}
      {!isMine && (
        <a href="/mon-logement" style={{ display: "inline-block", marginTop: 10, background: "#15803d", color: "white", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
          Voir mon logement →
        </a>
      )}
      {/* CTA proprio : générer le bail direct après acceptation */}
      {isMine && data.annonceId && (
        <a
          href={`/proprietaire/bail/${data.annonceId}`}
          style={{ display: "block", marginTop: 10, background: "#15803d", color: "white", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 700, textDecoration: "none", textAlign: "center", fontFamily: "inherit" }}
        >
          📄 Générer le bail maintenant →
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
      <div style={{ background: "#1a1a1a", border: "1.5px solid #333", borderRadius: 14, padding: "14px 18px", minWidth: 220, maxWidth: 300 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#a7f3d0", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 6px" }}>Quittance envoyée</p>
        <p style={{ fontWeight: 700, fontSize: 14, color: "white", margin: 0 }}>{data.bienTitre || "Bien"}</p>
        <p style={{ fontSize: 12, color: "#9ca3af", margin: "4px 0 0" }}>
          {moisLabel}{montant > 0 ? ` · ${montant} €` : ""}
        </p>
      </div>
    )
  }

  return (
    <div style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 14, padding: "14px 18px", minWidth: 220, maxWidth: 320 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 6px" }}>Quittance reçue</p>
      <p style={{ fontWeight: 700, fontSize: 14, color: "#111", margin: 0 }}>{data.bienTitre || "Bien"}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151", marginTop: 8 }}>
        {moisLabel && <div>Mois : <strong>{moisLabel}</strong></div>}
        {montant > 0 && <div>Loyer : <strong>{montant} €</strong></div>}
        {dateConf && <div>Confirmé le <strong>{dateConf}</strong></div>}
      </div>
      <a href="/mon-logement"
        style={{ display: "block", marginTop: 12, background: "#15803d", color: "white", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700, textAlign: "center", textDecoration: "none", fontFamily: "inherit" }}>
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
    <div style={{ background: "#fef2f2", border: "1.5px dashed #fca5a5", borderRadius: 14, padding: "12px 16px", minWidth: 220, maxWidth: 320 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#b91c1c", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 4px" }}>Candidature retirée</p>
      <p style={{ fontSize: 13, color: "#991b1b", margin: 0, lineHeight: 1.4 }}>
        {isMine ? "Vous avez retiré votre candidature" : "Le candidat a retiré sa candidature"}
        {data.bienTitre ? ` pour « ${data.bienTitre} »` : ""}.
      </p>
      {dateStr && <p style={{ fontSize: 11, color: "#b91c1c", margin: "4px 0 0" }}>{dateStr}</p>}
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
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, background: "#e5e7eb" }}
        referrerPolicy="no-referrer"
      />
    )
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "#e5e7eb", color: "#374151", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.42), fontWeight: 700, flexShrink: 0 }}>
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

  const MESSAGES_RAPIDES = proprietaireActive ? [
    "Bien toujours disponible, n'hésitez pas à proposer une visite.",
    "Pourriez-vous m'envoyer votre dossier locataire ?",
    "Votre candidature a retenu notre attention, pouvons-nous convenir d'une visite ?",
    "Suite donnée à une autre candidature. Bonne recherche !",
    "Quelles sont vos disponibilités pour visiter le bien ?",
  ] : [
    "Je suis toujours intéressé(e) par votre bien.",
    "Mon dossier est complet, je peux vous l'envoyer.",
    "Quelles sont vos disponibilités pour une visite ?",
    "Avez-vous d'autres biens disponibles ?",
    "Pouvez-vous me confirmer que le bien est encore disponible ?",
  ]

  const [conversations, setConversations] = useState<any[]>([])
  const [annonces, setAnnonces] = useState<Record<number, any>>({})
  // Photos de profil des interlocuteurs (keyed par email lower). Chargé après
  // la liste de conv pour afficher un avatar dans la liste et dans le header chat.
  const [peerImages, setPeerImages] = useState<Record<string, string>>({})
  const [convActive, setConvActive] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [nouveau, setNouveau] = useState("")
  const [loading, setLoading] = useState(true)
  const [envoi, setEnvoi] = useState(false)
  // Indicateur "en train d'écrire" — broadcast Supabase Realtime (pas de DB).
  // peerTyping = l'autre est en train d'écrire (affiché au-dessus de l'input).
  const [peerTyping, setPeerTyping] = useState(false)
  const [envoyantDossier, setEnvoyantDossier] = useState(false)
  const [recherche, setRecherche] = useState("")
  // Onglet de filtrage des conversations : "actifs" (bail en cours) vs
  // "candidats" (visite/dossier en cours). Côté proprio : biens loués vs
  // candidatures. Côté locataire : son logement vs ses candidatures.
  const [messagesTab, setMessagesTab] = useState<"actifs" | "candidats">("actifs")
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
  useEffect(() => { setHistoriqueAnnOuvert(false) }, [convActive])
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
      // refresh BailCard (qui lit les signatures via signaturesParAnnonce).
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bail_signatures" }, (payload) => {
        const sig = payload.new as { annonce_id?: number }
        if (!sig?.annonce_id || sig.annonce_id !== convAnnId) return
        if (myEmail) void loadMessages(myEmail, conv.other, convAnnId)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [convActive, myEmail, conversations])

  async function loadConversations() {
    const email = session!.user!.email!
    const { data } = await supabase.from("messages")
      .select("*")
      .or(`from_email.eq.${email},to_email.eq.${email}`)
      .order("created_at", { ascending: false })

    const convMap = new Map<string, any>()
    const searchBuckets = new Map<string, string[]>()
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
      const [usersRes, profilsRes] = await Promise.all([
        supabase.from("users").select("email, image").in("email", peerEmails),
        supabase.from("profils").select("email, photo_url_custom").in("email", peerEmails),
      ])
      const map: Record<string, string> = {}
      // Fallback : Google / provider image
      for (const u of usersRes.data || []) {
        const e = (u as { email?: string | null }).email?.toLowerCase()
        const img = (u as { image?: string | null }).image
        if (e && img) map[e] = img
      }
      // Priorité : avatar custom uploadé par l'user (si colonne présente)
      if (!profilsRes.error) {
        for (const p of profilsRes.data || []) {
          const e = (p as { email?: string | null }).email?.toLowerCase()
          const img = (p as { photo_url_custom?: string | null }).photo_url_custom
          if (e && img) map[e] = img
        }
      }
      setPeerImages(map)
    }

    // Fetch les annonces liées (avec locataire_email + statut pour badges)
    const ids = [...new Set(convList.map(c => c.annonceId).filter(Boolean))]
    if (ids.length > 0) {
      const { data: ann } = await supabase.from("annonces").select("id, titre, ville, photos, proprietaire_email, locataire_email, statut").in("id", ids)
      if (ann) {
        const map: Record<number, any> = {}
        ann.forEach((a: any) => { map[a.id] = a })
        setAnnonces(map)
      }
    }

    // On n'auto-sélectionne une conversation QUE si l'URL contient ?with=X
    // (arrivée depuis une annonce / un lien direct). Sinon, au reload normal,
    // l'utilisateur arrive sur la liste sans conv ouverte — il choisit.
    if (withEmail) {
      const target = convList.find(c => c.other === withEmail)
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
    const { data } = await supabase.from("messages").insert([msg]).select().single()
    if (data) {
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
    }
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
    setEnvoyantDossier(true)
    const conv = conversations.find(c => c.key === convActive)
    if (!conv) { setEnvoyantDossier(false); return }

    const { data: profil } = await supabase.from("profils")
      .select("nom,situation_pro,revenus_mensuels,garant,type_garant,nb_occupants,dossier_docs")
      .eq("email", myEmail).single()

    let score = 0
    if (profil) {
      if (profil.nom) score += 15
      if (profil.situation_pro) score += 15
      if (profil.revenus_mensuels) score += 20
      if (profil.dossier_docs) {
        const keys = ["identite", "bulletins", "avis_imposition", "contrat", "rib"]
        const filled = keys.filter(k => { const v = (profil.dossier_docs as any)[k]; return Array.isArray(v) ? v.length > 0 : !!v })
        score += Math.round((filled.length / keys.length) * 50)
      }
    }

    // Génère un lien de partage sécurisé (HMAC 7j) pour que le proprio
    // puisse consulter les pièces justificatives directement.
    let shareUrl: string | null = null
    try {
      const res = await fetch("/api/dossier/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: 30 }) })
      const json = await res.json()
      if (res.ok && json.success) shareUrl = json.url
    } catch { /* silent — le dossier est envoyé sans lien, le proprio verra juste le récap */ }

    const payload = {
      email: myEmail,
      nom: profil?.nom || session?.user?.name || "",
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

  async function proposerVisite() {
    if (!convActiveData?.annonceId || !myEmail || !visiteDate || !visiteHeure) return
    setEnvoyantVisite(true)
    const isCounter = !!counterTarget
    const propEmail = proprietaireActive ? myEmail : convActiveData.other
    const locEmail  = proprietaireActive ? convActiveData.other : myEmail

    // Si contre-proposition : annuler l'ancienne visite (en base + local).
    // IMPORTANT : on utilise .select() pour vérifier que l'UPDATE a bien
    // affecté la row (sinon l'ancienne demande réapparaissait comme "à traiter"
    // au prochain reload / realtime).
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

    const { data: visite } = await supabase.from("visites").insert([{
      annonce_id: convActiveData.annonceId,
      proprietaire_email: propEmail.toLowerCase(),
      locataire_email: locEmail.toLowerCase(),
      date_visite: visiteDate,
      heure: visiteHeure,
      message: visiteMessage.trim() || null,
      statut: "proposée",
      propose_par: myEmail.toLowerCase(),
    }]).select().single()
    if (visite) {
      setVisitesConv(prev => [...prev, visite])
      const dateFormatee = formatVisiteDate(visiteDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      // Card visuelle plutôt que texte brut — rendu par VisiteDemandeCard
      const payload = JSON.stringify({
        visiteId: visite.id,
        dateVisite: visiteDate,
        heure: visiteHeure,
        dateFormatee,
        message: visiteMessage.trim() || null,
        isCounter,
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
      // Notif cloche à l'autre partie (proposition ou contre-proposition)
      void postNotif({
        userEmail: convActiveData.other,
        type: "visite_proposee",
        title: isCounter ? "Contre-proposition de visite" : "Nouvelle demande de visite",
        body: `${dateFormatee} à ${visiteHeure}`,
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

  const { isMobile } = useResponsive()
  const convActiveData = conversations.find(c => c.key === convActive)
  const annonceActive = convActiveData?.annonceId ? annonces[convActiveData.annonceId] : null

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

  const convsFiltrees = conversations
    .filter(c => messagesTab === "actifs" ? isActiveBail(c) : !isActiveBail(c))
    .filter(c => showArchived ? archivedKeys.has(c.key) : !archivedKeys.has(c.key))
    .filter(c => bienFilter === "all" ? true : c.annonceId === bienFilter)
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

  const countActifs = conversations.filter(c => isActiveBail(c) && !archivedKeys.has(c.key)).length
  const countCandidats = conversations.filter(c => !isActiveBail(c) && !archivedKeys.has(c.key)).length
  const countArchived = conversations.filter(c => archivedKeys.has(c.key)).length

  // Default tab intelligent : au premier load, si aucun bail actif → candidatures
  useEffect(() => {
    if (tabInitialized || loading) return
    if (conversations.length > 0) {
      if (countActifs === 0 && countCandidats > 0) setMessagesTab("candidats")
      setTabInitialized(true)
    }
  }, [conversations.length, countActifs, countCandidats, loading, tabInitialized])

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
    if (convActiveData && myEmail) {
      await loadMessages(myEmail, convActiveData.other, convActiveData.annonceId)
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
              <div key={v.id} style={{ display: "flex", flexDirection: "column", gap: 8, background: "white", borderRadius: 12, padding: "12px 14px", border: `1.5px solid ${s.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>
                    {formatVisiteDate(v.date_visite, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} à {v.heure}
                  </span>
                  <span style={{ background: s.bg, color: s.color, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, border: `1px solid ${s.border}` }}>
                    {s.label}
                  </span>
                  {isPending && (
                    <span style={{ fontSize: 10, color: "#6b7280" }}>
                      {parMoi ? "Proposée par vous" : "Reçue"}
                    </span>
                  )}
                </div>
                {v.message && (
                  <p style={{ fontSize: 12, color: "#6b7280", fontStyle: "italic", margin: 0, lineHeight: 1.5 }}>
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
                        style={{ background: "white", border: "1.5px solid #111", color: "#111", borderRadius: 999, padding: "6px 12px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        Contre-proposer
                      </button>
                      <button
                        onClick={() => {
                          setVisiteCancelTarget({ v, mode: "refus" })
                          setVisitesModalOpen(false)
                        }}
                        style={{ background: "none", border: "1.5px solid #fecaca", color: "#dc2626", borderRadius: 999, padding: "6px 12px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
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
                      style={{ background: "none", border: "1.5px solid #fecaca", color: "#dc2626", borderRadius: 999, padding: "6px 12px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
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
                      style={{ background: "none", border: "1.5px solid #fecaca", color: "#dc2626", borderRadius: 999, padding: "6px 12px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
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
                <p style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 10px" }}>
                  Actives ({actives.length})
                </p>
                {actives.length === 0 ? (
                  <div style={{ padding: "20px 14px", background: "#fafafa", borderRadius: 12, textAlign: "center", fontSize: 13, color: "#9ca3af" }}>
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
                      background: "#f9fafb",
                      border: "1.5px solid #e5e7eb",
                      borderRadius: 10,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#6b7280",
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
                    background: "#eff6ff",
                    border: "1.5px solid #bfdbfe",
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
      <div style={{ maxWidth: isMobile && convActiveData ? "100%" : 1140, margin: "0 auto", padding: isMobile && convActiveData ? 0 : isMobile ? "20px 16px" : "32px 48px" }}>
        {(!isMobile || !convActiveData) && (
          <h1 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 800, marginBottom: isMobile ? 16 : 24, letterSpacing: "-0.5px", padding: isMobile ? 0 : undefined }}>Messages</h1>
        )}

        <div style={{ display: "flex", gap: isMobile && convActiveData ? 0 : 16, height: isMobile ? "calc(100vh - 72px)" : "76vh" }}>

          {/* ── Colonne gauche : conversations ── */}
          <div style={{ width: isMobile ? "100%" : 300, flexShrink: 0, background: "white", borderRadius: isMobile ? 0 : 20, display: isMobile && convActiveData ? "none" : "flex", flexDirection: "column", overflow: "hidden", boxShadow: isMobile ? "none" : "0 2px 12px rgba(0,0,0,0.06)" }}>
            {/* Onglets Biens loués / Candidatures */}
            <div style={{ display: "flex", padding: "10px 10px 0", gap: 6, borderBottom: "1px solid #f3f4f6" }}>
              {([
                { k: "actifs" as const,    label: proprietaireActive ? "Biens loués" : "Mon bail", count: countActifs },
                { k: "candidats" as const, label: proprietaireActive ? "Candidatures" : "Mes candidatures", count: countCandidats },
              ]).map(t => {
                const active = messagesTab === t.k
                return (
                  <button
                    key={t.k}
                    onClick={() => setMessagesTab(t.k)}
                    style={{
                      flex: 1,
                      padding: "9px 8px",
                      background: active ? "#111" : "white",
                      color: active ? "white" : "#374151",
                      border: `1.5px solid ${active ? "#111" : "#e5e7eb"}`,
                      borderRadius: 10,
                      fontSize: 12,
                      fontWeight: active ? 800 : 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      marginBottom: 10,
                    }}
                  >
                    {t.label}{t.count > 0 && <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.8 }}>({t.count})</span>}
                  </button>
                )
              })}
            </div>
            {/* Recherche + filtre par bien (proprio) + toggle archivées */}
            <div style={{ padding: "10px 16px 12px", borderBottom: "1px solid #f3f4f6", display: "flex", flexDirection: "column", gap: 8 }}>
              <input
                value={recherche} onChange={e => setRecherche(e.target.value)}
                placeholder="Rechercher..."
                style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
              />
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
                      padding: "8px 12px",
                      border: `1.5px solid ${bienFilter !== "all" ? "#111" : "#e5e7eb"}`,
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: bienFilter !== "all" ? 700 : 500,
                      outline: "none",
                      fontFamily: "inherit",
                      boxSizing: "border-box",
                      background: "white",
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
                  style={{ background: showArchived ? "#111" : "white", color: showArchived ? "white" : "#374151", border: `1.5px solid ${showArchived ? "#111" : "#e5e7eb"}`, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "center" }}>
                  {showArchived ? "← Retour" : `Archivées (${countArchived})`}
                </button>
              )}
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
              {convsFiltrees.length === 0 ? (
                <div style={{ padding: "32px 20px", textAlign: "center", color: "#9ca3af" }}>
                  <p style={{ fontSize: 13, fontWeight: 600 }}>{recherche ? "Aucun résultat" : "Aucun message"}</p>
                  {!recherche && (
                    <p style={{ fontSize: 12, marginTop: 4, textAlign: "center", lineHeight: 1.5 }}>
                      {proprietaireActive
                        ? "Les locataires vous contacteront depuis vos annonces"
                        : "Contactez un propriétaire depuis une annonce"}
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
                  : rawPreview.startsWith(RELANCE_PREFIX) ? "Relance : " + rawPreview.slice(RELANCE_PREFIX.length)
                  : rawPreview.startsWith(LOCATION_PREFIX) ? "Location acceptée ✓"
                  : parseReply(rawPreview).text // ignore le préfixe [REPLY:id]
                const preview = rawPreview
                  ? (previewText.length > 35 ? previewText.slice(0, 35) + "…" : previewText)
                  : "Nouvelle conversation"
                const time = conv.lastMsg?.created_at
                  ? new Date(conv.lastMsg.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
                  : ""

                // Badge de relation : locataire actif (bail actif), candidat, autre
                let relBadge: { label: string; bg: string; color: string } | null = null
                if (ann?.statut === "loué" && ann?.locataire_email) {
                  const locEmail = (ann.locataire_email || "").toLowerCase()
                  const other = (conv.other || "").toLowerCase()
                  const me = (myEmail || "").toLowerCase()
                  // Côté proprio : l'autre est le locataire si locataire_email === other
                  // Côté locataire : l'autre est le proprio si locataire_email === me
                  if (other === locEmail || me === locEmail) {
                    relBadge = { label: "Bail actif", bg: "#dcfce7", color: "#15803d" }
                  } else if (conv.annonceId) {
                    relBadge = { label: "Ancienne candidature", bg: "#f3f4f6", color: "#6b7280" }
                  }
                } else if (conv.annonceId) {
                  relBadge = { label: "Candidat", bg: "#eff6ff", color: "#1d4ed8" }
                }

                return (
                  <div key={conv.key}
                    onClick={() => { setConvActive(conv.key); setMenuConv(null); setVisitesConv([]); loadMessages(myEmail!, conv.other, conv.annonceId); loadVisitesConv(conv.other, conv.annonceId) }}
                    style={{ padding: "12px 16px", cursor: "pointer", background: isActive ? "#f9fafb" : "white", borderBottom: "1px solid #f3f4f6", borderLeft: isActive ? "3px solid #111" : conv.unread > 0 ? "3px solid #ef4444" : "3px solid transparent", position: "relative" }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#fafafa"; const btn = e.currentTarget.querySelector(".menu-btn") as HTMLElement; if (btn) btn.style.opacity = "1" }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "white"; if (menuConv !== conv.key) { const btn = e.currentTarget.querySelector(".menu-btn") as HTMLElement; if (btn) btn.style.opacity = "0" } }}
                  >
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      {/* Avatar annonce (ou peer si pas d'annonce) + badge unread */}
                      <div style={{ position: "relative", flexShrink: 0 }}>
                        {photo ? (
                          <img src={photo} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover", display: "block" }} />
                        ) : (
                          <Avatar email={conv.other} image={peerImages[conv.other.toLowerCase()]} size={40} />
                        )}
                        {/* Si annonce présente, overlay peer avatar pour contexte humain */}
                        {photo && (
                          <div style={{ position: "absolute", bottom: -3, right: -3, border: "2px solid white", borderRadius: "50%" }}>
                            <Avatar email={conv.other} image={peerImages[conv.other.toLowerCase()]} size={18} />
                          </div>
                        )}
                        {conv.unread > 0 && (
                          <span style={{ position: "absolute", top: -4, right: -4, background: "#ef4444", color: "white", borderRadius: 999, fontSize: 9, fontWeight: 800, minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", border: "2px solid white" }}>
                            {conv.unread}
                          </span>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                          <p style={{ fontWeight: conv.unread > 0 ? 800 : 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130, color: "#111" }}>
                            {ann?.titre || displayName(conv.other, ann?.proprietaire)}
                          </p>
                          <span style={{ fontSize: 10, color: "#9ca3af", whiteSpace: "nowrap" }}>{time}</span>
                        </div>
                        {ann?.titre && (
                          <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName(conv.other, ann?.proprietaire)}</p>
                        )}
                        {relBadge && (
                          <span style={{ display: "inline-block", background: relBadge.bg, color: relBadge.color, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, marginBottom: 2 }}>
                            {relBadge.label}
                          </span>
                        )}
                        {proprietaireActive && candidatNotes[conv.key] && (
                          <p style={{ fontSize: 11, color: "#ca8a04", fontWeight: 600, margin: "2px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={candidatNotes[conv.key]}>
                            Note : {candidatNotes[conv.key]}
                          </p>
                        )}
                        <p style={{ fontSize: 12, color: conv.unread > 0 ? "#374151" : "#9ca3af", fontWeight: conv.unread > 0 ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview}</p>
                      </div>
                    </div>

                    {/* Bouton 3 points */}
                    <button
                      className="menu-btn"
                      onClick={e => { e.stopPropagation(); setMenuConv(menuConv === conv.key ? null : conv.key) }}
                      style={{ position: "absolute", top: 10, right: 10, opacity: menuConv === conv.key ? 1 : 0, background: "#f3f4f6", border: "none", borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontSize: 16, color: "#6b7280", transition: "opacity 0.15s", lineHeight: 1, letterSpacing: 1 }}>
                      ···
                    </button>

                    {/* Dropdown menu */}
                    {menuConv === conv.key && (
                      <>
                        <div onClick={e => { e.stopPropagation(); setMenuConv(null) }} style={{ position: "fixed", inset: 0, zIndex: 100 }} />
                        <div style={{ position: "absolute", top: 36, right: 10, background: "white", borderRadius: 12, border: "1.5px solid #e5e7eb", boxShadow: "0 6px 20px rgba(0,0,0,0.12)", zIndex: 200, minWidth: 170, overflow: "hidden" }}>
                          {conv.unread > 0 && (
                            <button onClick={e => { e.stopPropagation(); marquerLu(conv); setMenuConv(null) }}
                              style={{ width: "100%", padding: "10px 14px", background: "none", border: "none", borderBottom: "1px solid #f3f4f6", textAlign: "left", fontSize: 13, cursor: "pointer", fontFamily: "inherit", color: "#374151", display: "flex", alignItems: "center", gap: 8 }}
                              onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                              onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                              Marquer comme lu
                            </button>
                          )}
                          {ann && (
                            <button onClick={e => { e.stopPropagation(); window.location.href = `/annonces/${conv.annonceId}`; setMenuConv(null) }}
                              style={{ width: "100%", padding: "10px 14px", background: "none", border: "none", borderBottom: "1px solid #f3f4f6", textAlign: "left", fontSize: 13, cursor: "pointer", fontFamily: "inherit", color: "#374151", display: "flex", alignItems: "center", gap: 8 }}
                              onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                              onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                              Voir l'annonce
                            </button>
                          )}
                          <button onClick={e => { e.stopPropagation(); toggleArchive(conv.key); setMenuConv(null) }}
                            style={{ width: "100%", padding: "10px 14px", background: "none", border: "none", borderBottom: "1px solid #f3f4f6", textAlign: "left", fontSize: 13, cursor: "pointer", fontFamily: "inherit", color: "#374151", display: "flex", alignItems: "center", gap: 8 }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                            onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                            {archivedKeys.has(conv.key) ? "Désarchiver" : "Archiver"}
                          </button>
                          <button onClick={e => { e.stopPropagation(); supprimerConversation(conv.key); setMenuConv(null) }}
                            disabled={supprimant === conv.key}
                            style={{ width: "100%", padding: "10px 14px", background: "none", border: "none", textAlign: "left", fontSize: 13, cursor: supprimant === conv.key ? "not-allowed" : "pointer", fontFamily: "inherit", color: "#dc2626", display: "flex", alignItems: "center", gap: 8, opacity: supprimant === conv.key ? 0.5 : 1 }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#fee2e2")}
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

          {/* ── Colonne droite : chat ── */}
          <div style={{ flex: 1, background: "white", borderRadius: isMobile ? 0 : 20, display: isMobile && !convActiveData ? "none" : "flex", flexDirection: "column", overflow: "hidden", boxShadow: isMobile ? "none" : "0 2px 12px rgba(0,0,0,0.06)" }}>
            {!convActiveData ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", color: "#9ca3af", gap: 12 }}>
                <p style={{ fontSize: 16, fontWeight: 600, color: "#374151" }}>Sélectionnez une conversation</p>
                {!proprietaireActive ? (
                  <>
                    <p style={{ fontSize: 13 }}>Contactez un propriétaire depuis une annonce</p>
                    <Link href="/annonces" style={{ marginTop: 8, padding: "10px 24px", background: "#111", color: "white", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 14 }}>
                      Voir les annonces
                    </Link>
                  </>
                ) : (
                  <p style={{ fontSize: 13 }}>Les locataires intéressés vous contacteront ici</p>
                )}
              </div>
            ) : (
              <>
                {/* Header chat */}
                <div style={{ padding: isMobile ? "10px 14px" : "14px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: isMobile ? 8 : 12 }}>
                  {isMobile && (
                    <button onClick={() => setConvActive(null)}
                      style={{ background: "#f3f4f6", border: "none", borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 18, flexShrink: 0 }}>
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
                          <div style={{ width: 42, height: 42, borderRadius: 10, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#6b7280", fontWeight: 700 }}>{(annonceActive.titre || "A")[0].toUpperCase()}</div>
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
                        <p style={{ fontWeight: 700, fontSize: 14, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{annonceActive.titre}</p>
                        <p style={{ fontSize: 12, color: "#9ca3af", margin: "2px 0 0" }}>{annonceActive.ville} &middot; {displayName(convActiveData.other, annonceActive.proprietaire)}</p>
                      </Link>
                      {/* Bouton "Louer à ce candidat" — côté proprio uniquement.
                         Cache si la location est déjà actée pour ce candidat. */}
                      {proprietaireActive && annonceActive && (
                        (annonceActive.statut !== "loué" || (annonceActive.locataire_email || "").toLowerCase() !== convActiveData.other.toLowerCase()) && (
                          <button
                            type="button"
                            onClick={() => setAccepterLocationOpen(true)}
                            title="Accepter ce locataire et marquer le bien comme loué"
                            style={{ fontSize: 12, fontWeight: 800, color: "white", background: "#16a34a", border: "none", borderRadius: 999, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                            Louer à ce candidat
                          </button>
                        )
                      )}
                      <Link href={`/annonces/${convActiveData.annonceId}`}
                        style={{ fontSize: 12, fontWeight: 600, color: "#111", textDecoration: "none", border: "1.5px solid #e5e7eb", borderRadius: 999, padding: "6px 14px", whiteSpace: "nowrap" }}>
                        Voir l&apos;annonce
                      </Link>
                    </>
                  ) : (
                    <>
                      <Avatar email={convActiveData.other} image={peerImages[convActiveData.other.toLowerCase()]} size={42} />
                      <p style={{ fontWeight: 700, fontSize: 14 }}>{displayName(convActiveData.other)}</p>
                    </>
                  )}
                </div>

                {/* Confirmation inline : louer à ce candidat */}
                {accepterLocationOpen && proprietaireActive && convActiveData && (
                  <div style={{ background: "#f0fdf4", borderBottom: "1px solid #bbf7d0", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                    <p style={{ fontSize: 13, color: "#166534", margin: 0, lineHeight: 1.5 }}>
                      <strong>Louer à {displayName(convActiveData.other)} ?</strong> Le bien sera marqué comme loué
                      {annonceActive && (annonceActive.statut === "loué") && (annonceActive.locataire_email || "").toLowerCase() !== convActiveData.other.toLowerCase() && (
                        <> (et remplacera <em>{displayName(annonceActive.locataire_email || "")}</em>)</>
                      )}
                      . Le locataire recevra une notification et accédera à « Mon logement ». Vous pourrez générer le bail quand vous voulez depuis votre dashboard.
                    </p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={accepterLocation}
                        disabled={accepteEnCours}
                        style={{ background: accepteEnCours ? "#9ca3af" : "#16a34a", color: "white", border: "none", borderRadius: 999, padding: "8px 18px", fontWeight: 800, fontSize: 13, cursor: accepteEnCours ? "wait" : "pointer", fontFamily: "inherit" }}>
                        {accepteEnCours ? "Enregistrement…" : "Confirmer la location"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAccepterLocationOpen(false)}
                        disabled={accepteEnCours}
                        style={{ background: "white", color: "#111", border: "1.5px solid #e5e7eb", borderRadius: 999, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                        Annuler
                      </button>
                    </div>
                  </div>
                )}

                {/* Note privée proprio (visible uniquement côté proprio) */}
                {proprietaireActive && convActiveData && (
                  <div style={{ background: "#fefce8", borderBottom: "1px solid #fef08a", padding: "8px 16px", display: "flex", alignItems: "center", gap: 8 }}>
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
                          style={{ flex: 1, background: "white", border: "1.5px solid #fde68a", borderRadius: 8, padding: "6px 10px", fontSize: 13, outline: "none", fontFamily: "inherit" }}
                        />
                        <button type="button"
                          onClick={() => { saveNote(convActiveData.key, noteDraft); setNoteEditKey(null) }}
                          style={{ background: "#ca8a04", color: "white", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                          Enregistrer
                        </button>
                        <button type="button" onClick={() => setNoteEditKey(null)}
                          style={{ background: "white", color: "#713f12", border: "1.5px solid #fde68a", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                          Annuler
                        </button>
                      </>
                    ) : candidatNotes[convActiveData.key] ? (
                      <>
                        <span style={{ fontSize: 12, color: "#713f12", flex: 1, lineHeight: 1.4 }}>
                          <strong style={{ color: "#a16207", fontWeight: 700 }}>Note : </strong>
                          {candidatNotes[convActiveData.key]}
                        </span>
                        <button type="button" onClick={() => openNoteEditor(convActiveData.key)}
                          style={{ background: "none", color: "#ca8a04", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                          Modifier
                        </button>
                        <button type="button" onClick={() => saveNote(convActiveData.key, "")}
                          style={{ background: "none", color: "#b91c1c", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                          Supprimer
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => openNoteEditor(convActiveData.key)}
                        style={{ background: "none", color: "#a16207", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
                        + Ajouter une note privée sur ce candidat
                      </button>
                    )}
                  </div>
                )}

                {/* Messages */}
                <div ref={messagesContainerRef} style={{ flex: 1, overflowY: "auto", padding: isMobile ? "12px 14px" : "20px 24px", display: "flex", flexDirection: "column", gap: 8, background: isMobile ? "#fafafa" : "white" }}>
                  {messages.length === 0 && (
                    <div style={{ textAlign: "center", color: "#9ca3af", marginTop: 40 }}>
                      <p style={{ fontSize: 14 }}>Démarrez la conversation</p>
                    </div>
                  )}
                  {messagesAvecSep.map((item, idx) => {
                    if (item.type === "sep") return (
                      <div key={`sep-${idx}`} style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0" }}>
                        <div style={{ flex: 1, height: 1, background: "#f3f4f6" }} />
                        <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, whiteSpace: "nowrap" }}>{item.label}</span>
                        <div style={{ flex: 1, height: 1, background: "#f3f4f6" }} />
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
                    const isLocation = typeof m.contenu === "string" && m.contenu.startsWith(LOCATION_PREFIX)
                    return (
                      <div key={m.id} style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start" }}>
                        {isDossier ? (
                          <div>
                            <DossierCard contenu={m.contenu} isMine={isMine} annonceId={m.annonce_id || convActiveData?.annonceId || null} />
                            <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 3, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : isDemande ? (
                          <div>
                            <DemandeDossierCard
                              isMine={isMine}
                              dossierRecu={dossierDejaEnvoye}
                              onEnvoyer={envoyerDossier}
                              envoyant={envoyantDossier}
                            />
                            <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 3, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : isEdl ? (
                          <div>
                            <EdlCard contenu={m.contenu} isMine={isMine} />
                            <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 3, textAlign: isMine ? "right" : "left" }}>
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
                            <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 3, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : isBailSigne ? (
                          <div>
                            <BailSigneCard contenu={m.contenu} isMine={isMine} />
                            <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 3, textAlign: isMine ? "right" : "left" }}>
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
                            <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 3, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : isVisiteConfirmee ? (
                          <div>
                            <VisiteConfirmeeCard contenu={m.contenu} isMine={isMine} />
                            <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 3, textAlign: isMine ? "right" : "left" }}>
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
                            />
                            <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 3, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : isLoyerPaye ? (
                          <div>
                            <LoyerPayeCard contenu={m.contenu} isMine={isMine} />
                            <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 3, textAlign: isMine ? "right" : "left" }}>
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
                            <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 3, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : isQuittance ? (
                          <div>
                            <QuittanceCard contenu={m.contenu} isMine={isMine} />
                            <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 3, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : isRetrait ? (
                          <div>
                            <CandidatureRetireeCard contenu={m.contenu} isMine={isMine} />
                            <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 3, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : isLocation ? (
                          <div>
                            <LocationAccepteeCard contenu={m.contenu} isMine={isMine} />
                            <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 3, textAlign: isMine ? "right" : "left" }}>
                              {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : (() => {
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
                              <div style={{ padding: "10px 14px", borderRadius: isMine ? "18px 18px 4px 18px" : "18px 18px 18px 4px", background: isMine ? "#111" : "#f3f4f6", color: isMine ? "white" : "#111" }}>
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
                                      borderLeft: `3px solid ${isMine ? "rgba(255,255,255,0.5)" : "#9ca3af"}`,
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
                                  <span style={{ display: "inline-block", background: isMine ? "rgba(255,255,255,0.2)" : "#fef3c7", color: isMine ? "white" : "#92400e", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.4px" }}>
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
                                  style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "50%", width: 26, height: 26, cursor: "pointer", fontSize: 14, color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontFamily: "inherit", lineHeight: 1, boxShadow: "0 2px 6px rgba(0,0,0,0.1)" }}
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
                  const barBg = enAttente > 0 ? "#fff7ed" : actives.length > 0 ? "#f0fdf4" : "#f9fafb"
                  const barBorder = enAttente > 0 ? "#fed7aa" : actives.length > 0 ? "#bbf7d0" : "#e5e7eb"
                  return (
                    <div
                      style={{
                        borderTop: "1px solid #f3f4f6",
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
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#374151" }}>
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                          <line x1="16" y1="2" x2="16" y2="6"/>
                          <line x1="8" y1="2" x2="8" y2="6"/>
                          <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        <span style={{ fontWeight: 700, color: "#111" }}>
                          {actives.length} visite{actives.length !== 1 ? "s" : ""} active{actives.length !== 1 ? "s" : ""}
                        </span>
                        {enAttente > 0 && (
                          <span style={{ background: "#ea580c", color: "white", padding: "1px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700 }}>
                            {enAttente} à traiter
                          </span>
                        )}
                        {annulees.length > 0 && (
                          <span style={{ color: "#9ca3af", fontSize: 11 }}>
                            · {annulees.length} annulée{annulees.length > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setVisitesModalOpen(true)}
                        style={{
                          background: "white",
                          border: `1.5px solid ${barBorder}`,
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
                <div style={{ borderTop: "1px solid #f3f4f6", padding: isMobile ? "10px 12px 12px" : "10px 20px 14px", background: "white" }}>
                  {/* Bouton dossier + réponses rapides */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                    {!proprietaireActive && (
                      <button onClick={envoyerDossier} disabled={envoyantDossier}
                        style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0", color: "#15803d", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: envoyantDossier ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, opacity: envoyantDossier ? 0.6 : 1 }}>
                        {envoyantDossier ? "Envoi..." : "Mon dossier"}
                      </button>
                    )}
                    {proprietaireActive && (
                      <button onClick={demanderDossier} disabled={demandantDossier}
                        style={{ background: "#fef3c7", border: "1.5px solid #fde68a", color: "#d97706", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: demandantDossier ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, opacity: demandantDossier ? 0.6 : 1 }}>
                        {demandantDossier ? "Envoi..." : "Demander le dossier"}
                      </button>
                    )}
                    {convActiveData?.annonceId && (
                      <button onClick={() => {
                        if (showVisiteForm) {
                          setShowVisiteForm(false)
                          setCounterTarget(null)
                        } else {
                          setShowVisiteForm(true)
                        }
                      }}
                        style={{ background: showVisiteForm ? "#111" : "#eff6ff", border: "1.5px solid " + (showVisiteForm ? "#111" : "#bfdbfe"), color: showVisiteForm ? "white" : "#1d4ed8", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
                        {showVisiteForm ? "Fermer" : "Proposer une visite"}
                      </button>
                    )}
                    <div style={{ width: 1, height: 16, background: "#e5e7eb" }} />
                    {MESSAGES_RAPIDES.map((msg, i) => (
                      <button key={i} onClick={() => setNouveau(msg)}
                        style={{ background: "#f3f4f6", border: "none", borderRadius: 999, padding: "5px 11px", fontSize: 11, fontWeight: 500, cursor: "pointer", color: "#374151", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                        {msg.slice(0, 30)}{msg.length > 30 ? "…" : ""}
                      </button>
                    ))}
                  </div>
                  {showVisiteForm && convActiveData?.annonceId && (
                    <div id="visite-form-anchor" style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 14, padding: "14px 16px", marginBottom: 10 }}>
                      <p style={{ fontSize: 12, fontWeight: 800, color: "#1d4ed8", marginBottom: 12 }}>
                        {counterTarget ? "Contre-proposer un autre créneau" : "Proposer une visite"}
                      </p>
                      {counterTarget && (
                        <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 10, lineHeight: 1.5 }}>
                          La proposition initiale (<strong>{formatVisiteDate(counterTarget.date_visite)} à {counterTarget.heure}</strong>) sera annulée et remplacée par votre nouveau créneau.
                        </p>
                      )}
                      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 4, textTransform: "uppercase" as const }}>Date</label>
                          <input type="date" min={new Date().toISOString().split("T")[0]} value={visiteDate} onChange={e => setVisiteDate(e.target.value)}
                            style={{ width: "100%", padding: "7px 10px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 4, textTransform: "uppercase" as const }}>Heure</label>
                          <select value={visiteHeure} onChange={e => setVisiteHeure(e.target.value)}
                            style={{ padding: "7px 10px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", background: "white" }}>
                            {["08:00","09:00","10:00","11:00","12:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"].map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                      </div>
                      <input value={visiteMessage} onChange={e => setVisiteMessage(e.target.value)}
                        placeholder="Message pour le propriétaire (optionnel)..."
                        style={{ width: "100%", padding: "7px 10px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", marginBottom: 10, boxSizing: "border-box" as const }} />
                      <button onClick={proposerVisite} disabled={!visiteDate || !visiteHeure || envoyantVisite}
                        style={{ background: visiteDate && visiteHeure && !envoyantVisite ? "#111" : "#e5e7eb", color: visiteDate && visiteHeure && !envoyantVisite ? "white" : "#9ca3af", border: "none", borderRadius: 999, padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: visiteDate && visiteHeure ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
                        {envoyantVisite ? "Envoi..." : "Envoyer la demande"}
                      </button>
                    </div>
                  )}
                  {/* Preview du message auquel on répond */}
                  {replyTo && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f9fafb", borderLeft: "3px solid #111", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: "#111", margin: 0, marginBottom: 2 }}>
                          Répondre à {replyTo.from === myEmail ? "vous-même" : displayName(replyTo.from)}
                        </p>
                        <p style={{ fontSize: 12, color: "#6b7280", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {replyTo.contenu.slice(0, 100)}{replyTo.contenu.length > 100 ? "…" : ""}
                        </p>
                      </div>
                      <button onClick={() => setReplyTo(null)}
                        aria-label="Annuler la réponse"
                        style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#9ca3af", padding: 4, fontFamily: "inherit", lineHeight: 1 }}>
                        ×
                      </button>
                    </div>
                  )}
                  {peerTyping && (
                    <div aria-live="polite" style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6, fontStyle: "italic", paddingLeft: 4 }}>
                      En train d&apos;écrire…
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 10 }}>
                    <input ref={inputRef} value={nouveau} onChange={e => { setNouveau(e.target.value); signalTyping() }}
                      onKeyDown={e => e.key === "Enter" && !e.shiftKey && envoyer()}
                      placeholder={replyTo ? "Votre réponse…" : "Votre message…"}
                      style={{ flex: 1, padding: "11px 16px", border: "1.5px solid #e5e7eb", borderRadius: 999, fontSize: 16, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                    <button onClick={envoyer} disabled={envoi || !nouveau.trim()}
                      style={{ background: "#111", color: "white", border: "none", borderRadius: 999, padding: "0 22px", fontWeight: 700, fontSize: 14, cursor: envoi || !nouveau.trim() ? "not-allowed" : "pointer", opacity: envoi || !nouveau.trim() ? 0.4 : 1, fontFamily: "inherit" }}>
                      Envoyer
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {/* Menu actions message — portal body pour échapper overflow-hidden du chat */}
      {menuMsgId !== null && menuAnchor && typeof document !== "undefined" && (() => {
        const m = messages.find(x => x.id === menuMsgId)
        if (!m) return null
        const close = () => { setMenuMsgId(null); setMenuAnchor(null) }
        const menuStyle: React.CSSProperties = menuAnchor.isMine
          ? { position: "fixed", top: menuAnchor.top, left: menuAnchor.left, zIndex: 10001, background: "white", border: "1px solid #e5e7eb", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", minWidth: 170, overflow: "hidden" }
          : { position: "fixed", top: menuAnchor.top, right: menuAnchor.right, zIndex: 10001, background: "white", border: "1px solid #e5e7eb", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", minWidth: 170, overflow: "hidden" }
        return createPortal(
          <>
            <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 10000 }} />
            <div style={menuStyle}>
              <button onClick={() => { repondreMessage(m); close() }}
                style={{ display: "block", width: "100%", padding: "10px 14px", background: "white", border: "none", textAlign: "left", fontSize: 13, color: "#111", cursor: "pointer", fontFamily: "inherit" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                onMouseLeave={e => (e.currentTarget.style.background = "white")}>
                Répondre
              </button>
              <button onClick={() => { copierMessage(m.contenu); close() }}
                style={{ display: "block", width: "100%", padding: "10px 14px", background: "white", border: "none", textAlign: "left", fontSize: 13, color: "#111", cursor: "pointer", fontFamily: "inherit" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                onMouseLeave={e => (e.currentTarget.style.background = "white")}>
                Copier le texte
              </button>
              {menuAnchor.isMine && (
                <button onClick={() => { supprimerMessage(m.id); close() }}
                  style={{ display: "block", width: "100%", padding: "10px 14px", background: "white", border: "none", textAlign: "left", fontSize: 13, color: "#dc2626", cursor: "pointer", fontFamily: "inherit", borderTop: "1px solid #f3f4f6" }}
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
