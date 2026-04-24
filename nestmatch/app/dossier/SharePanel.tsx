"use client"
import { useEffect, useState, useCallback } from "react"

/**
 * Panneau de partage : génère et gère des liens sécurisés (7 jours par défaut)
 * du dossier locataire. Chaque lien a un label (ex : "Mr Dupont — Paris 11")
 * pour les retrouver + peut être révoqué à la demande.
 *
 * Le token JWT complet n'est affiché qu'UNE SEULE FOIS après génération,
 * dans une modale. Ensuite seul le label + les compteurs restent visibles.
 */

const T = {
  white: "#fff",
  ink: "#111",
  line: "#EAE6DF",
  hairline: "#F0EAE0",
  meta: "#666",
  soft: "#8a8477",
  mutedBg: "#FAF8F3",
  success: "#15803d",
  danger: "#b91c1c",
  warnBg: "#FFF8E6",
  warnBorder: "#E9D89B",
  warnText: "#8A6B00",
}

type ShareRow = {
  id: string
  label: string
  created_at: string
  expires_at: string
  revoked_at: string | null
  consultation_count: number
  last_consulted_at: string | null
}

function fmtDateShort(s: string | null | undefined): string {
  if (!s) return "—"
  try { return new Date(s).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) } catch { return s }
}
function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—"
  try { return new Date(s).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) } catch { return s }
}
function linkStatus(row: ShareRow): { label: string; color: string } {
  if (row.revoked_at) return { label: "Révoqué", color: T.danger }
  if (new Date(row.expires_at).getTime() < Date.now()) return { label: "Expiré", color: T.soft }
  return { label: "Actif", color: T.success }
}

export default function SharePanel() {
  const [links, setLinks] = useState<ShareRow[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [label, setLabel] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")
  const [revokingId, setRevokingId] = useState<string | null>(null)

  // Modale one-shot : affiche le token complet juste après création
  const [showModal, setShowModal] = useState(false)
  const [modalUrl, setModalUrl] = useState("")
  const [modalLabel, setModalLabel] = useState("")
  const [modalExpiresAt, setModalExpiresAt] = useState("")
  const [copied, setCopied] = useState(false)

  const fetchLinks = useCallback(async () => {
    try {
      const res = await fetch("/api/dossier/share/list", { cache: "no-store" })
      const json = await res.json()
      if (res.ok && json.success) setLinks(json.tokens || [])
    } catch { /* silent */ }
    setLoadingList(false)
  }, [])

  useEffect(() => { fetchLinks() }, [fetchLinks])

  async function create() {
    const trimmed = label.trim()
    if (trimmed.length < 2 || trimmed.length > 80) {
      setError("Le nom du lien doit faire entre 2 et 80 caractères.")
      return
    }
    setCreating(true)
    setError("")
    try {
      const res = await fetch("/api/dossier/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: trimmed, days: 7 }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error || "Impossible de générer le lien.")
      } else {
        setModalUrl(json.url)
        setModalLabel(json.label || trimmed)
        setModalExpiresAt(json.expiresAt)
        setShowModal(true)
        setLabel("")
        fetchLinks()
      }
    } catch {
      setError("Erreur réseau. Veuillez réessayer.")
    }
    setCreating(false)
  }

  async function revoke(id: string, linkLabel: string) {
    if (!confirm(`Révoquer le lien "${linkLabel}" ?\n\nLes personnes qui ont ce lien ne pourront plus y accéder.`)) return
    setRevokingId(id)
    try {
      const res = await fetch(`/api/dossier/share/${id}`, { method: "DELETE" })
      const json = await res.json()
      if (!res.ok || !json.success) {
        alert(json.error || "Échec de la révocation")
      } else {
        fetchLinks()
      }
    } catch {
      alert("Erreur réseau")
    }
    setRevokingId(null)
  }

  async function copyModalLink() {
    try {
      await navigator.clipboard.writeText(modalUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch { /* noop */ }
  }

  function closeModal() {
    setShowModal(false)
    setModalUrl("")
    setModalLabel("")
    setModalExpiresAt("")
    setCopied(false)
  }

  const modalExp = modalExpiresAt ? new Date(modalExpiresAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : null

  return (
    <>
      <div style={{ background: T.white, borderRadius: 20, padding: 28, marginBottom: 16, border: `1px solid ${T.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.8px", textTransform: "uppercase", color: T.soft }}>
            Partage
          </span>
          <div style={{ flex: 1, height: 1, background: T.hairline }} />
        </div>

        <h3 style={{ fontSize: 22, fontWeight: 500, fontStyle: "italic", letterSpacing: "-0.4px", margin: "0 0 10px", color: T.ink, lineHeight: 1.15 }}>
          Partager mon dossier
        </h3>
        <p style={{ fontSize: 13, color: T.meta, lineHeight: 1.6, marginBottom: 18 }}>
          Génère un lien unique valable 7 jours. Chaque lien porte un nom (ex : destinataire) pour le retrouver et le révoquer à tout moment.
        </p>

        {/* Création d'un nouveau lien */}
        <div style={{ background: T.mutedBg, borderRadius: 14, padding: 16, border: `1px solid ${T.hairline}`, marginBottom: 18 }}>
          <label htmlFor="share-label" style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "1.4px", textTransform: "uppercase", color: T.soft, marginBottom: 8 }}>
            Nom du lien
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              id="share-label"
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Ex : Mr Dupont — appartement Paris 11"
              maxLength={80}
              disabled={creating}
              style={{ flex: 1, minWidth: 200, padding: "10px 14px", border: `1px solid ${T.line}`, borderRadius: 10, fontSize: 14, fontFamily: "inherit", background: T.white, color: T.ink, outline: "none" }}
            />
            <button
              onClick={create}
              disabled={creating || label.trim().length < 2}
              style={{ background: T.ink, color: T.white, border: "none", borderRadius: 999, padding: "11px 22px", fontWeight: 600, fontSize: 13, cursor: (creating || label.trim().length < 2) ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: (creating || label.trim().length < 2) ? 0.5 : 1, letterSpacing: "0.3px", whiteSpace: "nowrap" }}
            >
              {creating ? "Génération…" : "Générer un lien"}
            </button>
          </div>
          {error && <p style={{ color: T.danger, fontSize: 12, marginTop: 10, marginBottom: 0 }}>{error}</p>}
        </div>

        {/* Liste des liens existants */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.4px", textTransform: "uppercase", color: T.soft }}>
            Mes liens actifs
          </span>
          <div style={{ flex: 1, height: 1, background: T.hairline }} />
        </div>
        {loadingList ? (
          <p style={{ fontSize: 13, color: T.soft, fontStyle: "italic", margin: 0 }}>Chargement…</p>
        ) : links.length === 0 ? (
          <p style={{ fontSize: 13, color: T.soft, fontStyle: "italic", margin: 0 }}>
            Aucun lien généré. Créez-en un ci-dessus pour commencer.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {links.map(link => {
              const status = linkStatus(link)
              const isActive = !link.revoked_at && new Date(link.expires_at).getTime() >= Date.now()
              return (
                <div key={link.id} style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: 14, border: `1px solid ${T.line}`, borderRadius: 12, background: T.white }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: T.ink, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {link.label}
                      </p>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: status.color, border: `1px solid ${status.color}`, borderRadius: 999, padding: "2px 8px" }}>
                        {status.label}
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: T.meta, margin: 0, lineHeight: 1.6 }}>
                      Créé le {fmtDateShort(link.created_at)} · Expire le {fmtDateShort(link.expires_at)}
                      <br />
                      {link.consultation_count > 0
                        ? <>Consulté <strong>{link.consultation_count}</strong> fois{link.last_consulted_at ? ` — dernière consultation le ${fmtDateTime(link.last_consulted_at)}` : ""}</>
                        : <>Jamais consulté</>
                      }
                    </p>
                  </div>
                  {isActive && (
                    <button
                      onClick={() => revoke(link.id, link.label)}
                      disabled={revokingId === link.id}
                      style={{ background: T.white, color: T.danger, border: `1px solid ${T.danger}`, borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: revokingId === link.id ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: revokingId === link.id ? 0.5 : 1, whiteSpace: "nowrap" }}
                    >
                      {revokingId === link.id ? "…" : "Révoquer"}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modale one-shot : affiche le lien + warning */}
      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-modal-title"
          onClick={closeModal}
          style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: T.white, borderRadius: 20, padding: 28, maxWidth: 520, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
          >
            <h3 id="share-modal-title" style={{ fontSize: 20, fontWeight: 500, fontStyle: "italic", letterSpacing: "-0.4px", margin: "0 0 6px", color: T.ink }}>
              Votre lien est prêt
            </h3>
            <p style={{ fontSize: 13, color: T.meta, margin: "0 0 16px" }}>
              <strong style={{ color: T.ink, fontWeight: 600 }}>{modalLabel}</strong>{modalExp ? ` · expire le ${modalExp}` : ""}
            </p>

            <div style={{ background: T.warnBg, borderRadius: 12, padding: "10px 14px", border: `1px solid ${T.warnBorder}`, marginBottom: 14, fontSize: 12, color: T.warnText, lineHeight: 1.55 }}>
              <strong style={{ fontWeight: 700 }}>À copier maintenant.</strong> Ce lien ne sera plus visible après la fermeture de cette fenêtre. Vous pourrez le révoquer depuis la liste mais pas le récupérer à nouveau.
            </div>

            <div style={{ background: T.mutedBg, borderRadius: 12, padding: "10px 14px", display: "flex", gap: 8, alignItems: "center", border: `1px solid ${T.hairline}`, marginBottom: 16 }}>
              <input
                readOnly
                value={modalUrl}
                onFocus={e => e.currentTarget.select()}
                style={{ flex: 1, border: "none", background: "transparent", fontSize: 12, color: T.ink, outline: "none", fontFamily: "inherit", minWidth: 0 }}
              />
              <button
                onClick={copyModalLink}
                style={{ background: copied ? T.success : T.ink, color: T.white, border: "none", borderRadius: 999, padding: "6px 14px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
              >
                {copied ? "Copié" : "Copier"}
              </button>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={closeModal}
                style={{ background: T.ink, color: T.white, border: "none", borderRadius: 999, padding: "10px 20px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.3px" }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
