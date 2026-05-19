"use client"

/**
 * V97.39.34 — UI gestion webhooks agence
 *
 * - Liste webhooks configurés (URL + events + stats delivery)
 * - Bouton "+ Ajouter" : prompt URL + events checkboxes → POST. Affiche
 *   le secret HMAC UNE FOIS (à copier pour vérif signature côté agence).
 * - Bouton "Tester" sur chaque webhook : envoie ping de test sync.
 * - Bouton "Désactiver/Activer" sur chaque (PATCH active toggle).
 * - Bouton "Supprimer" sur chaque.
 */

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"

interface Webhook {
  id: string
  url: string
  events: string[]
  active: boolean
  label: string | null
  created_by: string
  created_at: string
  total_deliveries: number
  total_failures: number
  last_delivered_at: string | null
  last_failed_at: string | null
  last_status: number | null
}

const AVAILABLE_EVENTS = [
  "candidature.created",
  "candidature.refused",
  "visite.confirmee",
  "bail.signed",
  "message.received",
  "annonce.created",
  "annonce.updated",
  "annonce.deleted",
]

export default function WebhooksClient({ agenceId }: { agenceId: string }) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newWebhook, setNewWebhook] = useState<{ secret: string; url: string; label: string | null } | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createUrl, setCreateUrl] = useState("")
  const [createLabel, setCreateLabel] = useState("")
  const [createEvents, setCreateEvents] = useState<string[]>(["candidature.created"])
  const [creating, setCreating] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/agences/${agenceId}/webhooks`, { cache: "no-store" })
      const j = await r.json()
      if (!j.ok) setError(j.error || "Erreur")
      else setWebhooks(j.webhooks || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau")
    } finally {
      setLoading(false)
    }
  }, [agenceId])

  useEffect(() => { void fetchData() }, [fetchData])

  const handleCreate = async () => {
    if (!createUrl.startsWith("https://")) {
      alert("L'URL doit commencer par https://")
      return
    }
    if (createEvents.length === 0) {
      alert("Sélectionne au moins un event")
      return
    }
    setCreating(true)
    try {
      const r = await fetch(`/api/agences/${agenceId}/webhooks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: createUrl,
          events: createEvents,
          label: createLabel || null,
        }),
      })
      const j = await r.json()
      if (!j.ok) {
        alert(`Erreur : ${j.error}`)
      } else {
        setNewWebhook({ secret: j.secret, url: j.webhook.url, label: j.webhook.label })
        setShowCreate(false)
        setCreateUrl(""); setCreateLabel(""); setCreateEvents(["candidature.created"])
        void fetchData()
      }
    } finally {
      setCreating(false)
    }
  }

  const handleToggle = async (id: string, currentActive: boolean) => {
    await fetch(`/api/agences/${agenceId}/webhooks`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ webhook_id: id, active: !currentActive }),
    })
    void fetchData()
  }

  const handleDelete = async (id: string, url: string) => {
    if (!confirm(`Supprimer le webhook vers ${url} ?`)) return
    await fetch(`/api/agences/${agenceId}/webhooks`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ webhook_id: id }),
    })
    void fetchData()
  }

  const handleTest = async (id: string) => {
    const r = await fetch(`/api/agences/${agenceId}/webhooks/${id}`, { method: "POST" })
    const j = await r.json()
    alert(
      j.ok
        ? `✓ Test OK\nStatus: ${j.status_code}\nDurée: ${j.duration_ms} ms\n\nRéponse:\n${j.response_body?.substring(0, 200) || "(empty)"}`
        : `✗ Test échoué\nStatus: ${j.status_code || "(network)"}\nErreur: ${j.error}\nDurée: ${j.duration_ms} ms`,
    )
  }

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: "0 20px 80px" }}>
      <Link href={`/agence/dashboard/${agenceId}`} style={{ fontSize: 13, color: "#666", textDecoration: "underline" }}>
        ← Retour gestion agence
      </Link>

      <h1 style={{
        fontFamily: "var(--font-fraunces), 'Fraunces', serif",
        fontStyle: "italic", fontWeight: 400, fontSize: 32, color: "#111",
        margin: "16px 0 8px",
      }}>
        Webhooks
      </h1>

      <p style={{ fontSize: 14, color: "#444", marginBottom: 24 }}>
        Recevez des events KeyMatch en temps réel (candidature, visite, bail signé)
        directement dans votre CRM ou logiciel métier via HTTPS POST.
        Signature HMAC SHA256 — doc complète sur{" "}
        <Link href="/api-docs" style={{ color: "#111", textDecoration: "underline" }}>/api-docs</Link>.
      </p>

      {/* Secret de webhook frais */}
      {newWebhook && (
        <div style={{ padding: 20, background: "#dcfce7", border: "1px solid #86efac", borderRadius: 16, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: "#166534", marginBottom: 8 }}>
            ✓ Webhook {newWebhook.label || newWebhook.url} créé.
          </div>
          <div style={{ fontSize: 13, color: "#166534", marginBottom: 8 }}>
            Voici le secret HMAC à utiliser pour vérifier les signatures :
          </div>
          <div style={{
            padding: 12, background: "white", border: "1px solid #86efac",
            borderRadius: 8, fontFamily: "ui-monospace, monospace",
            fontSize: 12, wordBreak: "break-all", marginBottom: 8,
          }}>
            {newWebhook.secret}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={async () => { await navigator.clipboard.writeText(newWebhook.secret); alert("Secret copié") }} style={btnPrimary}>
              📋 Copier le secret
            </button>
            <button onClick={() => setNewWebhook(null)} style={btnSec}>OK noté</button>
          </div>
        </div>
      )}

      {/* Bouton ajouter / form */}
      {!showCreate ? (
        <button onClick={() => setShowCreate(true)} style={{ ...btnPrimary, padding: "12px 20px", marginBottom: 24 }}>
          + Ajouter un webhook
        </button>
      ) : (
        <div style={{ padding: 20, background: "white", border: "1px solid #EAE6DF", borderRadius: 16, marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 500, marginTop: 0, marginBottom: 16 }}>Nouveau webhook</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>URL (HTTPS obligatoire)</span>
              <input
                type="url"
                value={createUrl}
                onChange={(e) => setCreateUrl(e.target.value)}
                placeholder="https://api.agence.fr/webhooks/keymatch"
                style={inpStyle}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>Label (optionnel)</span>
              <input
                type="text"
                value={createLabel}
                onChange={(e) => setCreateLabel(e.target.value)}
                placeholder="n8n prod"
                style={inpStyle}
              />
            </label>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Events à recevoir :</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {AVAILABLE_EVENTS.map(ev => (
                  <label key={ev} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={createEvents.includes(ev)}
                      onChange={(e) => {
                        if (e.target.checked) setCreateEvents(prev => [...prev, ev])
                        else setCreateEvents(prev => prev.filter(x => x !== ev))
                      }}
                    />
                    <code style={{ fontSize: 12 }}>{ev}</code>
                    <span style={{ color: "#888", fontSize: 11 }}>
                      {ev === "candidature.created" && "Visite proposée par un locataire"}
                      {ev === "candidature.refused" && "Visite annulée ou refusée"}
                      {ev === "visite.confirmee" && "Visite confirmée par les 2 parties"}
                      {ev === "bail.signed" && "Bail signé électroniquement par les 2 parties"}
                      {ev === "message.received" && "Message reçu sur une annonce"}
                      {ev === "annonce.created" && "Nouvelle annonce associée à l'agence"}
                      {ev === "annonce.updated" && "Annonce modifiée (titre, prix, photos…)"}
                      {ev === "annonce.deleted" && "Annonce archivée (statut → loué)"}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleCreate} disabled={creating} style={btnPrimary}>
                {creating ? "Création…" : "Créer"}
              </button>
              <button onClick={() => setShowCreate(false)} style={btnSec}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: 16, background: "#FEE", border: "1px solid #FCC", borderRadius: 12, color: "#900", marginBottom: 24 }}>
          {error}
        </div>
      )}

      {loading && <div style={{ padding: 32, textAlign: "center", color: "#666" }}>Chargement…</div>}

      {/* Liste webhooks */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {webhooks.map(w => (
          <article key={w.id} style={{
            background: "white", border: "1px solid #EAE6DF", borderRadius: 12,
            padding: 16, opacity: w.active ? 1 : 0.6,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: "#111", marginBottom: 4 }}>
                  {w.label || "Webhook sans label"}
                  {!w.active && <span style={{ marginLeft: 8, fontSize: 11, color: "#7a5a00", padding: "2px 6px", background: "#FFF7E0", borderRadius: 4 }}>Désactivé</span>}
                </div>
                <div style={{ fontSize: 12, color: "#666", fontFamily: "ui-monospace, monospace", wordBreak: "break-all", marginBottom: 6 }}>
                  {w.url}
                </div>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
                  Events : {w.events.map(e => <code key={e} style={{ fontSize: 11, background: "#F7F4EF", padding: "1px 6px", borderRadius: 4, marginRight: 4 }}>{e}</code>)}
                </div>
                <div style={{ fontSize: 11, color: "#888" }}>
                  {w.total_deliveries} delivery{w.total_deliveries > 1 ? "s" : ""} ·
                  {w.total_failures > 0 && ` ${w.total_failures} échec(s) · `}
                  {w.last_delivered_at && ` Dernière OK ${new Date(w.last_delivered_at).toLocaleString("fr-FR")}`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
                <button onClick={() => handleTest(w.id)} style={btnSec}>Ping test</button>
                <button onClick={() => handleToggle(w.id, w.active)} style={btnSec}>
                  {w.active ? "Désactiver" : "Activer"}
                </button>
                <button onClick={() => handleDelete(w.id, w.url)} style={{ ...btnSec, color: "#900", borderColor: "#FCC" }}>
                  Supprimer
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {!loading && webhooks.length === 0 && (
        <div style={{ padding: 32, textAlign: "center", background: "white", border: "1px solid #EAE6DF", borderRadius: 12, color: "#666" }}>
          Aucun webhook configuré.
        </div>
      )}

      {/* Doc inline */}
      <details style={{ marginTop: 32, padding: 16, background: "#F7F4EF", borderRadius: 12, fontSize: 13 }}>
        <summary style={{ cursor: "pointer", fontWeight: 500 }}>Vérifier la signature côté agence (Node.js)</summary>
        <div style={{ marginTop: 12, lineHeight: 1.6 }}>
          <p>Lorsque KeyMatch POST un event vers ton URL, il envoie un header
            <code> X-KeyMatch-Signature: sha256=&lt;hex&gt;</code>. Tu dois le vérifier :</p>
          <pre style={{ background: "#111", color: "#dcfce7", padding: 12, borderRadius: 8, fontSize: 11, overflowX: "auto" }}>
{`import crypto from "crypto"

app.post("/webhooks/keymatch", (req, res) => {
  const secret = process.env.KEYMATCH_WEBHOOK_SECRET
  const presented = req.headers["x-keymatch-signature"] || ""
  const expected = "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(req.body))
    .digest("hex")

  if (!crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(expected))) {
    return res.status(401).send("Invalid signature")
  }

  const { event, data } = req.body
  console.log(event, data)
  res.status(200).send("ok")
})`}
          </pre>
        </div>
      </details>
    </div>
  )
}

const btnPrimary: React.CSSProperties = {
  padding: "8px 14px", background: "#111", color: "white", border: "none",
  borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
}
const btnSec: React.CSSProperties = {
  padding: "8px 14px", background: "white", color: "#111", border: "1px solid #EAE6DF",
  borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
}
const inpStyle: React.CSSProperties = {
  padding: "10px 14px", border: "1px solid #EAE6DF", borderRadius: 10,
  fontSize: 14, fontFamily: "inherit", background: "white",
}
