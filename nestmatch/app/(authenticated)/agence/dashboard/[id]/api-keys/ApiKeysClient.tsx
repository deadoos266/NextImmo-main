"use client"

/**
 * V97.39.34 — UI gestion clés API agence
 *
 * Permet à un admin agence de générer/révoquer des clés API pour intégrer
 * son logiciel métier (Apimo, Hektor, n8n, Zapier, script custom).
 *
 * IMPORTANT : la clé en clair est affichée 1× seulement, à la création.
 * Ensuite seulement le prefix (km_live_xxxxxxxx) est visible.
 */

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"

interface ApiKey {
  id: string
  label: string
  key_prefix: string
  scopes: string[]
  created_by: string
  created_at: string
  last_used_at: string | null
  last_used_ip: string | null
  revoked_at: string | null
  revoked_by: string | null
}

export default function ApiKeysClient({ agenceId }: { agenceId: string }) {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newKey, setNewKey] = useState<{ full_key: string; label: string } | null>(null)
  const [generating, setGenerating] = useState(false)

  const fetchKeys = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/agences/${agenceId}/api-keys`, { cache: "no-store" })
      const j = await r.json()
      if (!j.ok) setError(j.error || "Erreur")
      else setKeys(j.keys || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau")
    } finally {
      setLoading(false)
    }
  }, [agenceId])

  useEffect(() => { void fetchKeys() }, [fetchKeys])

  const handleGenerate = async () => {
    const label = window.prompt("Label pour cette clé (ex: 'Apimo prod', 'n8n test') :")
    if (!label || label.length < 3) return
    setGenerating(true)
    try {
      const r = await fetch(`/api/agences/${agenceId}/api-keys`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label }),
      })
      const j = await r.json()
      if (!j.ok) {
        alert(`Erreur : ${j.error}`)
      } else {
        setNewKey({ full_key: j.full_key, label: j.key.label })
        void fetchKeys()
      }
    } finally {
      setGenerating(false)
    }
  }

  const handleRevoke = async (key_id: string, label: string) => {
    if (!confirm(`Révoquer la clé "${label}" ? Toute requête avec cette clé échouera immédiatement.`)) return
    const r = await fetch(`/api/agences/${agenceId}/api-keys`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key_id }),
    })
    const j = await r.json()
    if (!j.ok) alert(`Erreur : ${j.error}`)
    else void fetchKeys()
  }

  const copyToClipboard = async (text: string) => {
    try { await navigator.clipboard.writeText(text); alert("Clé copiée !") } catch { /* */ }
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
        Clés API
      </h1>

      <p style={{ fontSize: 14, color: "#444", marginBottom: 24 }}>
        Générez des clés API pour intégrer votre logiciel métier (Apimo, Hektor)
        ou un middleware (n8n, Zapier, script). Documentation complète sur{" "}
        <Link href="/api-docs" style={{ color: "#111", textDecoration: "underline" }}>
          /api-docs
        </Link>.
      </p>

      {/* Nouvelle clé créée — affichée 1× */}
      {newKey && (
        <div style={{
          padding: 20, background: "#dcfce7", border: "1px solid #86efac",
          borderRadius: 16, marginBottom: 24,
        }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: "#166534", marginBottom: 8 }}>
            ✓ Clé « {newKey.label} » créée. <strong>Copiez-la MAINTENANT</strong> — elle ne sera plus jamais affichée.
          </div>
          <div style={{
            padding: 12, background: "white", border: "1px solid #86efac",
            borderRadius: 8, fontFamily: "ui-monospace, monospace",
            fontSize: 12, wordBreak: "break-all", marginBottom: 8,
          }}>
            {newKey.full_key}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => copyToClipboard(newKey.full_key)} style={btnPrimary}>
              📋 Copier
            </button>
            <button onClick={() => setNewKey(null)} style={btnSec}>J&apos;ai noté la clé</button>
          </div>
        </div>
      )}

      {/* Bouton générer */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            padding: "12px 20px", background: "#111", color: "white",
            border: "none", borderRadius: 10, fontSize: 14, fontWeight: 500,
            cursor: generating ? "not-allowed" : "pointer", fontFamily: "inherit",
          }}
        >
          {generating ? "Génération…" : "+ Générer une nouvelle clé"}
        </button>
      </div>

      {error && (
        <div style={{ padding: 16, background: "#FEE", border: "1px solid #FCC", borderRadius: 12, color: "#900", marginBottom: 24 }}>
          {error}
        </div>
      )}

      {loading && <div style={{ padding: 32, textAlign: "center", color: "#666" }}>Chargement…</div>}

      {/* Liste des clés */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {keys.map(k => (
          <article key={k.id} style={{
            background: "white", border: "1px solid #EAE6DF", borderRadius: 12,
            padding: 16, opacity: k.revoked_at ? 0.5 : 1,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 500, color: "#111", marginBottom: 4 }}>
                  {k.label}
                  {k.revoked_at && <span style={{ marginLeft: 8, fontSize: 11, color: "#900", padding: "2px 8px", background: "#FEE", borderRadius: 4 }}>Révoquée</span>}
                </div>
                <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#666", marginBottom: 6 }}>
                  {k.key_prefix}••••••••••••••••••••••••
                </div>
                <div style={{ fontSize: 11, color: "#888" }}>
                  Scopes : {k.scopes.join(", ")} · Créée par {k.created_by} le {new Date(k.created_at).toLocaleDateString("fr-FR")}
                </div>
                {k.last_used_at && (
                  <div style={{ fontSize: 11, color: "#888" }}>
                    Dernière utilisation : {new Date(k.last_used_at).toLocaleString("fr-FR")} {k.last_used_ip && `(IP ${k.last_used_ip})`}
                  </div>
                )}
              </div>
              {!k.revoked_at && (
                <button
                  onClick={() => handleRevoke(k.id, k.label)}
                  style={{
                    padding: "8px 14px", background: "white", border: "1px solid #FCC",
                    color: "#900", borderRadius: 8, fontSize: 12, cursor: "pointer",
                    fontFamily: "inherit", height: "fit-content",
                  }}
                >
                  Révoquer
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      {!loading && keys.length === 0 && (
        <div style={{ padding: 32, textAlign: "center", background: "white", border: "1px solid #EAE6DF", borderRadius: 12, color: "#666" }}>
          Aucune clé API. Cliquez « Générer une nouvelle clé » pour commencer.
        </div>
      )}

      {/* Quickstart */}
      <details style={{ marginTop: 32, padding: 16, background: "#F7F4EF", borderRadius: 12, fontSize: 13 }}>
        <summary style={{ cursor: "pointer", fontWeight: 500 }}>Exemple d&apos;utilisation (curl)</summary>
        <div style={{ marginTop: 12, lineHeight: 1.6 }}>
          <p>Une fois votre clé générée, vous pouvez la tester :</p>
          <pre style={{ background: "#111", color: "#dcfce7", padding: 12, borderRadius: 8, fontSize: 11, overflowX: "auto" }}>
{`# Liste vos annonces
curl -H "Authorization: Bearer km_live_xxx..." \\
     https://keymatch-immo.fr/api/v1/agences/${agenceId}/annonces

# Créer une annonce
curl -X POST \\
     -H "Authorization: Bearer km_live_xxx..." \\
     -H "Content-Type: application/json" \\
     -d '{"titre":"Studio Paris 11","ville":"Paris","prix":900,"surface":22,"type_bien":"Studio","external_ref":"APIMO-12345"}' \\
     https://keymatch-immo.fr/api/v1/agences/${agenceId}/annonces`}
          </pre>
          <p>Documentation complète : <Link href="/api-docs" style={{ color: "#111", textDecoration: "underline" }}>/api-docs</Link></p>
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
