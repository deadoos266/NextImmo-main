"use client"

import { useEffect, useState, use as usePromise } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useSession, signIn } from "next-auth/react"
import Link from "next/link"
import { km } from "../../components/ui/km"

interface InvitationData {
  id: string
  statut: "pending" | "accepted" | "declined" | "expired" | "cancelled"
  proprietaireEmail: string
  proprietaireName: string
  locataireEmail: string
  loyerHC: number
  charges: number | null
  messageProprio: string | null
  expiresAt: string
  respondedAt: string | null
  annonce: {
    id: number
    titre: string
    ville: string | null
    adresse: string | null
    surface: number | null
    pieces: number | null
    meuble: boolean
    prix: number
    charges: number | null
  } | null
}

const T = {
  bg: km.beige,
  card: km.white,
  ink: km.ink,
  muted: km.muted,
  line: km.line,
}

function formatDateFr(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
  } catch { return iso }
}

function StatusBadge({ statut }: { statut: InvitationData["statut"] }) {
  const map: Record<string, { bg: string; bd: string; fg: string; label: string }> = {
    pending: { bg: km.warnBg, bd: km.warnLine, fg: km.warnText, label: "En attente" },
    accepted: { bg: km.successBg, bd: km.successLine, fg: km.successText, label: "Acceptée" },
    declined: { bg: km.errBg, bd: km.errLine, fg: km.errText, label: "Refusée" },
    expired: { bg: km.errBg, bd: km.errLine, fg: km.errText, label: "Expirée" },
    cancelled: { bg: km.beige, bd: km.line, fg: km.muted, label: "Annulée" },
  }
  const s = map[statut] || map.pending
  return (
    <span style={{ display: "inline-block", background: s.bg, border: `1px solid ${s.bd}`, color: s.fg, padding: "4px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px" }}>
      {s.label}
    </span>
  )
}

export default function BailInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = usePromise(params)
  const searchParams = useSearchParams()
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()

  const [invit, setInvit] = useState<InvitationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<"accepter" | "refuser" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsLogin, setNeedsLogin] = useState<{ targetEmail: string; reason: "not-logged" | "wrong-account" } | null>(null)
  // V33.6 — Modale de refus avec raison
  const [refusModalOpen, setRefusModalOpen] = useState(false)
  const [refusRaison, setRefusRaison] = useState<"loyer_eleve" | "surface_insuffisante" | "changement_situation" | "pas_mon_bail" | "autre">("loyer_eleve")
  const [refusMotif, setRefusMotif] = useState("")

  // Action préselectionnée par querystring (?action=refuser depuis l'email)
  const presetAction = searchParams.get("action")

  useEffect(() => {
    let cancelled = false
    void fetch(`/api/bail/accepter/${token}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (d.ok && d.invitation) {
          setInvit(d.invitation)
        } else {
          setError(d.error || "Invitation introuvable.")
        }
      })
      .catch(() => { if (!cancelled) setError("Erreur réseau, réessayez.") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])

  async function handleAccepter() {
    if (actionLoading) return
    setActionLoading("accepter")
    setError(null)
    try {
      const res = await fetch(`/api/bail/accepter/${token}`, { method: "POST" })
      const d = await res.json()
      if (d.ok) {
        // Refetch pour afficher l'état acceptée
        const refreshed = await fetch(`/api/bail/accepter/${token}`).then(r => r.json())
        if (refreshed.ok) setInvit(refreshed.invitation)
        return
      }
      if (d.requireLogin) {
        setNeedsLogin({ targetEmail: d.targetEmail, reason: "not-logged" })
        return
      }
      if (d.wrongAccount) {
        setNeedsLogin({ targetEmail: d.targetEmail, reason: "wrong-account" })
        return
      }
      setError(d.error || "Acceptation a échoué.")
    } catch {
      setError("Erreur réseau, réessayez.")
    } finally {
      setActionLoading(null)
    }
  }

  // V33.6 — Ouvre la modale au lieu d'un confirm() natif fragile.
  function handleRefuser() {
    if (actionLoading) return
    setRefusModalOpen(true)
  }

  async function confirmerRefus() {
    setActionLoading("refuser")
    setError(null)
    try {
      const res = await fetch(`/api/bail/refuser/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raison: refusRaison, motif: refusMotif.trim() }),
      })
      const d = await res.json()
      if (d.ok) {
        setRefusModalOpen(false)
        const refreshed = await fetch(`/api/bail/accepter/${token}`).then(r => r.json())
        if (refreshed.ok) setInvit(refreshed.invitation)
        return
      }
      setError(d.error || "Refus a échoué.")
    } catch {
      setError("Erreur réseau, réessayez.")
    } finally {
      setActionLoading(null)
    }
  }

  if (loading || sessionStatus === "loading") {
    return (
      <main style={{ minHeight: "calc(100vh - 64px)", background: T.bg, display: "grid", placeItems: "center" }}>
        <p style={{ color: T.muted, fontSize: 14 }}>Chargement…</p>
      </main>
    )
  }

  if (error && !invit) {
    return (
      <main style={{ minHeight: "calc(100vh - 64px)", background: T.bg, padding: "32px 16px", display: "grid", placeItems: "center" }}>
        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 20, padding: 32, maxWidth: 480, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>Invitation introuvable</h1>
          <p style={{ color: T.muted, fontSize: 14, margin: "0 0 18px", lineHeight: 1.55 }}>{error}</p>
          <Link href="/" style={{ display: "inline-block", background: T.ink, color: "#fff", padding: "10px 22px", borderRadius: 999, textDecoration: "none", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px" }}>
            Retour à KeyMatch
          </Link>
        </div>
      </main>
    )
  }

  if (!invit) return null

  const isPending = invit.statut === "pending" && new Date(invit.expiresAt).getTime() > Date.now()
  const totalCC = invit.loyerHC + (invit.charges || 0)

  return (
    <main style={{ minHeight: "calc(100vh - 64px)", background: T.bg, padding: "32px 16px 64px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500&display=swap');`}</style>
      <div style={{ maxWidth: 580, margin: "0 auto" }}>

        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 20, padding: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: 0 }}>
              Invitation à valider votre bail
            </p>
            <StatusBadge statut={invit.statut} />
          </div>

          <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 30, letterSpacing: "-0.4px", color: T.ink, margin: "0 0 16px", lineHeight: 1.2 }}>
            {invit.proprietaireName} vous invite sur KeyMatch
          </h1>

          <p style={{ color: T.muted, fontSize: 14, margin: "0 0 24px", lineHeight: 1.65 }}>
            Votre propriétaire a importé votre bail sur KeyMatch et vous invite à le valider.
            En acceptant, vous pourrez recevoir vos quittances PDF chaque mois, signaler des entretiens et discuter avec votre propriétaire — gratuitement.
          </p>

          {invit.annonce && (
            <div style={{ background: T.bg, borderRadius: 14, padding: "16px 18px", margin: "0 0 18px" }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.4px", margin: "0 0 6px" }}>Le bien</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: T.ink, margin: "0 0 4px" }}>{invit.annonce.titre}</p>
              <p style={{ fontSize: 13, color: T.muted, margin: 0 }}>
                {[invit.annonce.ville, invit.annonce.surface ? `${invit.annonce.surface} m²` : null, invit.annonce.pieces ? `${invit.annonce.pieces} pièces` : null, invit.annonce.meuble ? "meublé" : null].filter(Boolean).join(" · ")}
              </p>
            </div>
          )}

          <div style={{ background: T.bg, borderRadius: 14, padding: "16px 18px", margin: "0 0 18px" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.4px", margin: "0 0 6px" }}>Loyer mensuel</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: T.ink, margin: "0 0 4px" }}>
              {totalCC.toLocaleString("fr-FR")} € <span style={{ fontSize: 13, fontWeight: 600, color: T.muted }}>CC</span>
            </p>
            <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>
              {invit.loyerHC.toLocaleString("fr-FR")} € HC{invit.charges && invit.charges > 0 ? ` + ${invit.charges.toLocaleString("fr-FR")} € de charges` : ""}
            </p>
          </div>

          {invit.messageProprio && (
            <div style={{ background: T.bg, borderLeft: `3px solid ${km.warnText}`, borderRadius: 10, padding: "14px 16px", margin: "0 0 22px" }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.4px", margin: "0 0 6px" }}>
                Mot de {invit.proprietaireName}
              </p>
              <p style={{ fontSize: 14, color: T.ink, margin: 0, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{invit.messageProprio}</p>
            </div>
          )}

          {error && (
            <div style={{ background: km.errBg, border: `1px solid ${km.errLine}`, color: km.errText, padding: "10px 14px", borderRadius: 12, fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}

          {needsLogin && (
            <div style={{ background: km.infoBg, border: `1px solid ${km.infoLine}`, color: km.infoText, padding: "14px 16px", borderRadius: 12, fontSize: 13, marginBottom: 16, lineHeight: 1.55 }}>
              {needsLogin.reason === "wrong-account" ? (
                <p style={{ margin: "0 0 10px" }}>
                  Cette invitation a été envoyée à <strong>{needsLogin.targetEmail}</strong>. Vous êtes connecté avec un autre compte.
                </p>
              ) : (
                <p style={{ margin: "0 0 10px" }}>
                  Pour accepter, connectez-vous (ou créez un compte) avec <strong>{needsLogin.targetEmail}</strong>.
                </p>
              )}
              <button onClick={() => signIn(undefined, { callbackUrl: window.location.href })}
                style={{ background: km.infoText, color: "#fff", border: "none", borderRadius: 999, padding: "8px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                Se connecter / S'inscrire
              </button>
            </div>
          )}

          {isPending ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button onClick={handleAccepter} disabled={actionLoading !== null}
                  style={{ background: actionLoading ? T.muted : T.ink, color: "#fff", border: "none", borderRadius: 999, padding: "14px 24px", fontSize: 13, fontWeight: 700, cursor: actionLoading ? "not-allowed" : "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                  {actionLoading === "accepter" ? "…" : (session?.user?.email?.toLowerCase() === invit.locataireEmail.toLowerCase() ? "Accepter cette invitation" : "Accepter et créer mon compte")}
                </button>
                <button onClick={handleRefuser} disabled={actionLoading !== null}
                  style={{ background: "transparent", border: `1px solid ${T.line}`, color: T.muted, borderRadius: 999, padding: "12px 24px", fontSize: 13, fontWeight: 600, cursor: actionLoading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                  {actionLoading === "refuser" ? "…" : "Ce n'est pas mon bail / refuser"}
                </button>
              </div>

              <p style={{ fontSize: 12, color: T.muted, textAlign: "center", margin: "20px 0 0", lineHeight: 1.55 }}>
                Cette invitation expire le <strong>{formatDateFr(invit.expiresAt)}</strong>.<br/>
                En acceptant, vous validez l'existence d'un bail et acceptez les conditions générales de KeyMatch.
              </p>

              {presetAction === "refuser" && actionLoading === null && (
                <p style={{ fontSize: 12, color: km.warnText, textAlign: "center", margin: "10px 0 0" }}>
                  Vous arrivez avec un lien « refuser » — confirmez en cliquant sur le bouton.
                </p>
              )}
            </>
          ) : invit.statut === "accepted" ? (
            <div style={{ background: km.successBg, border: `1px solid ${km.successLine}`, borderRadius: 14, padding: "20px 22px", textAlign: "center" }}>
              <p style={{ fontSize: 14, color: km.successText, margin: "0 0 14px", lineHeight: 1.55 }}>
                Vous avez accepté cette invitation{invit.respondedAt ? ` le ${formatDateFr(invit.respondedAt)}` : ""}.<br/>
                Vous pouvez maintenant accéder à votre espace KeyMatch.
              </p>
              <Link href="/messages" style={{ display: "inline-block", background: T.ink, color: "#fff", padding: "10px 22px", borderRadius: 999, textDecoration: "none", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px" }}>
                Accéder à mon espace
              </Link>
            </div>
          ) : invit.statut === "declined" ? (
            <p style={{ fontSize: 14, color: T.muted, textAlign: "center", margin: 0, lineHeight: 1.55 }}>
              Vous avez refusé cette invitation. Votre propriétaire a été notifié et pourra vous renvoyer une nouvelle invitation si besoin.
            </p>
          ) : invit.statut === "expired" ? (
            <p style={{ fontSize: 14, color: T.muted, textAlign: "center", margin: 0, lineHeight: 1.55 }}>
              Cette invitation a expiré. Demandez à votre propriétaire de vous en envoyer une nouvelle.
            </p>
          ) : (
            <p style={{ fontSize: 14, color: T.muted, textAlign: "center", margin: 0, lineHeight: 1.55 }}>
              Cette invitation a été annulée.
            </p>
          )}
        </div>

        <p style={{ fontSize: 12, color: T.muted, textAlign: "center", margin: "20px 0 0", lineHeight: 1.6 }}>
          KeyMatch est gratuit pour les locataires. Si vous n&apos;attendez pas d&apos;invitation, ignorez cet email — aucune action ne sera prise.
        </p>
      </div>

      {/* V33.6 — Modale de refus avec raison */}
      {refusModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmer le refus"
          style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.55)", zIndex: 13000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'DM Sans', sans-serif" }}
          onClick={(e) => { if (e.target === e.currentTarget && !actionLoading) setRefusModalOpen(false) }}
        >
          <div style={{ background: "#fff", borderRadius: 20, padding: 28, maxWidth: 480, width: "100%", boxShadow: "0 24px 64px rgba(0,0,0,0.25)" }}>
            <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 24, margin: "0 0 8px", color: T.ink, letterSpacing: "-0.4px" }}>
              Refuser cette invitation ?
            </h2>
            <p style={{ fontSize: 13, color: T.muted, margin: "0 0 18px", lineHeight: 1.55 }}>
              Votre propriétaire en sera informé. Indiquez la raison principale — il pourra ajuster et vous renvoyer une nouvelle proposition s&apos;il le souhaite.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {([
                { v: "loyer_eleve", label: "Loyer trop élevé" },
                { v: "surface_insuffisante", label: "Surface ou nombre de pièces insuffisants" },
                { v: "changement_situation", label: "Changement de situation personnelle" },
                { v: "pas_mon_bail", label: "Ce n'est pas mon bail / mauvais destinataire" },
                { v: "autre", label: "Autre raison" },
              ] as const).map(opt => (
                <label key={opt.v} style={{
                  display: "flex", gap: 10, padding: "11px 14px",
                  border: `1.5px solid ${refusRaison === opt.v ? "#111" : T.line}`,
                  borderRadius: 12, cursor: "pointer", alignItems: "center", fontSize: 13.5, color: T.ink,
                  background: refusRaison === opt.v ? "#F7F4EF" : "#fff",
                }}>
                  <input
                    type="radio"
                    name="refus-raison"
                    value={opt.v}
                    checked={refusRaison === opt.v}
                    onChange={() => setRefusRaison(opt.v)}
                    style={{ accentColor: "#111" }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>

            <label style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.3px", display: "block", marginBottom: 6 }}>
              Précisions (optionnel)
            </label>
            <textarea
              value={refusMotif}
              onChange={e => setRefusMotif(e.target.value.slice(0, 500))}
              placeholder="Ex : Le loyer dépasse 30% de mes revenus."
              rows={3}
              style={{
                width: "100%", padding: "10px 14px",
                border: `1px solid ${T.line}`, borderRadius: 10,
                fontSize: 13, fontFamily: "inherit", color: T.ink,
                resize: "vertical", boxSizing: "border-box", outline: "none",
              }}
            />
            <p style={{ fontSize: 10, color: T.muted, margin: "4px 0 18px", textAlign: "right" }}>
              {refusMotif.length}/500
            </p>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setRefusModalOpen(false)}
                disabled={actionLoading === "refuser"}
                style={{ background: "#fff", color: T.ink, border: `1px solid ${T.line}`, borderRadius: 999, padding: "10px 22px", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmerRefus}
                disabled={actionLoading === "refuser"}
                style={{ background: "#b91c1c", color: "#fff", border: "none", borderRadius: 999, padding: "10px 22px", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", opacity: actionLoading === "refuser" ? 0.5 : 1 }}
              >
                {actionLoading === "refuser" ? "Envoi…" : "Confirmer le refus"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
