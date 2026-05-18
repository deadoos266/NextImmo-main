"use client"

/**
 * V97.39.34 — UI admin agences
 *
 * - Liste filtrée par statut (pending / active / refused / banned)
 * - Modal détail avec aperçu carte T (signed URL 1h)
 * - Actions : Valider / Refuser (avec motif) / Bannir / Reset pending
 */

import { useEffect, useState, useCallback } from "react"

interface Agence {
  id: string
  slug: string
  name: string
  raison_sociale: string
  siret: string
  carte_t_numero: string
  carte_t_doc_path: string | null
  carte_t_signed_url: string | null
  email: string
  telephone: string | null
  adresse: string
  code_postal: string | null
  ville: string | null
  statut: "pending" | "active" | "refused" | "banned"
  validated_at: string | null
  validated_by: string | null
  refused_reason: string | null
  created_at: string
}

const STATUTS = ["pending", "active", "refused", "banned"] as const
type Statut = (typeof STATUTS)[number]

export default function AgencesAdminClient() {
  const [statut, setStatut] = useState<Statut>("pending")
  const [agences, setAgences] = useState<Agence[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Agence | null>(null)
  const [actionPending, setActionPending] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/admin/agences?statut=${statut}`, { cache: "no-store" })
      const j = await r.json()
      if (!j.ok) {
        setError(j.error || "Erreur inconnue")
      } else {
        setAgences(j.agences || [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau")
    } finally {
      setLoading(false)
    }
  }, [statut])

  useEffect(() => { void fetchData() }, [fetchData])

  const handleAction = async (action: "valider" | "refuser" | "banir" | "reset_pending") => {
    if (!selected) return
    let reason: string | undefined
    if (action === "refuser" || action === "banir") {
      const prompted = window.prompt(`Motif du ${action === "refuser" ? "refus" : "bannissement"} (sera envoyé par email à l'agence) :`)
      if (!prompted) return
      reason = prompted
    }
    setActionPending(true)
    try {
      const r = await fetch(`/api/admin/agences/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason }),
      })
      const j = await r.json()
      if (!j.ok) {
        alert(`Erreur : ${j.error}`)
      } else {
        setSelected(null)
        void fetchData()
      }
    } finally {
      setActionPending(false)
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{
        fontFamily: "var(--font-fraunces), 'Fraunces', serif",
        fontStyle: "italic",
        fontWeight: 400,
        fontSize: 32,
        color: "#111",
        margin: "0 0 8px",
      }}>
        Agences immobilières
      </h1>
      <p style={{ fontSize: 14, color: "#444", marginTop: 0, marginBottom: 24 }}>
        Validation manuelle des inscriptions agence. Vérifier la carte professionnelle T uploadée
        avant validation.
      </p>

      {/* Filtre statut */}
      <div style={{ display: "flex", gap: 4, background: "white", padding: 4, borderRadius: 12, border: "1px solid #EAE6DF", marginBottom: 24, width: "fit-content" }}>
        {STATUTS.map(s => (
          <button
            key={s}
            onClick={() => setStatut(s)}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              background: statut === s ? "#111" : "transparent",
              color: statut === s ? "white" : "#666",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {s === "pending" ? "En attente" : s === "active" ? "Actives" : s === "refused" ? "Refusées" : "Bannies"}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ padding: 16, background: "#FEE", border: "1px solid #FCC", borderRadius: 12, color: "#900", marginBottom: 24 }}>
          {error}
        </div>
      )}

      {loading && <div style={{ padding: 32, textAlign: "center", color: "#666" }}>Chargement…</div>}

      {!loading && agences.length === 0 && (
        <div style={{ padding: 32, background: "white", border: "1px solid #EAE6DF", borderRadius: 16, textAlign: "center", color: "#666" }}>
          Aucune agence avec ce statut.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {agences.map(a => (
          <article key={a.id} style={{ background: "white", border: "1px solid #EAE6DF", borderRadius: 16, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 500, color: "#111", marginBottom: 4 }}>
                  {a.name}
                </div>
                <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>
                  {a.raison_sociale} · SIRET {a.siret}
                </div>
                <div style={{ fontSize: 12, color: "#888" }}>
                  Carte T : <strong style={{ color: "#111" }}>{a.carte_t_numero}</strong>
                  {" · "}{a.adresse}{a.ville && `, ${a.ville}`}
                  {" · "}{a.email}
                </div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                  Inscrite le {new Date(a.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                </div>
                {a.refused_reason && (
                  <div style={{ fontSize: 12, color: "#900", marginTop: 6, padding: "6px 10px", background: "#FEE", borderRadius: 6 }}>
                    Refus : {a.refused_reason}
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelected(a)}
                style={{
                  padding: "8px 16px",
                  background: "#111",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Examiner →
              </button>
            </div>
          </article>
        ))}
      </div>

      {/* Modal détail */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: 20,
              maxWidth: 800,
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: 32,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <h2 style={{ fontFamily: "var(--font-fraunces), serif", fontStyle: "italic", fontWeight: 400, fontSize: 24, color: "#111", margin: 0 }}>
                {selected.name}
              </h2>
              <button
                onClick={() => setSelected(null)}
                style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#888" }}
              >
                ×
              </button>
            </div>

            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", fontSize: 13, marginBottom: 20 }}>
              <dt style={{ color: "#666" }}>Statut</dt>
              <dd style={{ margin: 0, color: "#111", fontWeight: 500 }}>{selected.statut}</dd>
              <dt style={{ color: "#666" }}>Slug</dt>
              <dd style={{ margin: 0, color: "#111", fontFamily: "monospace" }}>/agence/{selected.slug}</dd>
              <dt style={{ color: "#666" }}>Raison sociale</dt>
              <dd style={{ margin: 0, color: "#111" }}>{selected.raison_sociale}</dd>
              <dt style={{ color: "#666" }}>SIRET</dt>
              <dd style={{ margin: 0, color: "#111", fontFamily: "monospace" }}>{selected.siret}</dd>
              <dt style={{ color: "#666" }}>Carte T</dt>
              <dd style={{ margin: 0, color: "#111", fontFamily: "monospace" }}>{selected.carte_t_numero}</dd>
              <dt style={{ color: "#666" }}>Adresse</dt>
              <dd style={{ margin: 0, color: "#111" }}>{selected.adresse}{selected.code_postal && `, ${selected.code_postal}`}{selected.ville && ` ${selected.ville}`}</dd>
              <dt style={{ color: "#666" }}>Email</dt>
              <dd style={{ margin: 0, color: "#111" }}>{selected.email}</dd>
              <dt style={{ color: "#666" }}>Téléphone</dt>
              <dd style={{ margin: 0, color: "#111" }}>{selected.telephone || "—"}</dd>
            </dl>

            {/* Carte T preview */}
            {selected.carte_t_signed_url ? (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#111", marginBottom: 8 }}>Carte T uploadée :</div>
                <a
                  href={selected.carte_t_signed_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-block",
                    padding: "10px 16px",
                    background: "#F7F4EF",
                    border: "1px solid #EAE6DF",
                    borderRadius: 10,
                    fontSize: 13,
                    color: "#111",
                    textDecoration: "none",
                  }}
                >
                  📄 Ouvrir le document
                </a>
                <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                  Lien signé valable 1h. Vérifier que le numéro carte T saisi ({selected.carte_t_numero}) correspond à celui du document.
                </div>
              </div>
            ) : (
              <div style={{ padding: 12, background: "#FFF7E0", borderRadius: 8, fontSize: 13, color: "#7a5a00", marginBottom: 20 }}>
                ⚠ Aucun document carte T uploadé.
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {selected.statut === "pending" && (
                <>
                  <button
                    onClick={() => handleAction("valider")}
                    disabled={actionPending}
                    style={{ padding: "10px 18px", background: "#0a7c3e", color: "white", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: actionPending ? "not-allowed" : "pointer", fontFamily: "inherit" }}
                  >
                    ✓ Valider
                  </button>
                  <button
                    onClick={() => handleAction("refuser")}
                    disabled={actionPending}
                    style={{ padding: "10px 18px", background: "#c5352e", color: "white", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: actionPending ? "not-allowed" : "pointer", fontFamily: "inherit" }}
                  >
                    ✗ Refuser
                  </button>
                </>
              )}
              {selected.statut === "active" && (
                <button
                  onClick={() => handleAction("banir")}
                  disabled={actionPending}
                  style={{ padding: "10px 18px", background: "#c5352e", color: "white", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: actionPending ? "not-allowed" : "pointer", fontFamily: "inherit" }}
                >
                  ⛔ Bannir
                </button>
              )}
              {(selected.statut === "refused" || selected.statut === "banned") && (
                <button
                  onClick={() => handleAction("reset_pending")}
                  disabled={actionPending}
                  style={{ padding: "10px 18px", background: "#111", color: "white", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: actionPending ? "not-allowed" : "pointer", fontFamily: "inherit" }}
                >
                  ↻ Remettre en attente
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
