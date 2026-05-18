"use client"

/**
 * V97.39.34 — UI Upload XML/CSV avec preview avant commit
 *
 * Workflow :
 *   1. User sélectionne fichier
 *   2. POST avec mode=preview → affiche les 5 premiers détectés + warnings
 *   3. Si OK : POST avec mode=commit → INSERT bulk + résumé final
 */

import { useState } from "react"
import Link from "next/link"

interface PreviewAnnonce {
  external_ref?: string | null
  titre: string
  ville?: string | null
  prix?: number | null
  surface?: number | null
  pieces?: number | null
  type_bien?: string | null
  photos?: string[] | null
}

interface PreviewResp {
  ok: boolean
  format?: string
  total?: number
  preview?: PreviewAnnonce[]
  warnings?: string[]
  errors?: string[]
  imported?: number
  updated?: number
  failed?: number
  skipped?: number
  summary?: string
  error?: string
}

export default function ImportClient({ agenceId }: { agenceId: string }) {
  const [file, setFile] = useState<File | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [preview, setPreview] = useState<PreviewResp | null>(null)
  const [committed, setCommitted] = useState<PreviewResp | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handlePreview = async () => {
    if (!file) return
    setError(null)
    setPreviewing(true)
    setCommitted(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("mode", "preview")
      const r = await fetch(`/api/agences/${agenceId}/import`, { method: "POST", body: fd })
      const j = (await r.json()) as PreviewResp
      if (!j.ok) {
        setError(j.error || "Erreur preview")
        setPreview(null)
      } else {
        setPreview(j)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau")
    } finally {
      setPreviewing(false)
    }
  }

  const handleCommit = async () => {
    if (!file) return
    setError(null)
    setCommitting(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("mode", "commit")
      const r = await fetch(`/api/agences/${agenceId}/import`, { method: "POST", body: fd })
      const j = (await r.json()) as PreviewResp
      if (!j.ok) {
        setError(j.error || "Erreur import")
      } else {
        setCommitted(j)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau")
    } finally {
      setCommitting(false)
    }
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
        Import bulk d&apos;annonces
      </h1>

      <p style={{ fontSize: 14, color: "#444", marginBottom: 24 }}>
        Importez vos annonces depuis votre logiciel métier en quelques secondes.
        Formats supportés : <strong>Apimo XML</strong> (Century 21, Orpi, Laforêt…),
        <strong>CSV</strong> (toutes colonnes), <strong>Hektor</strong> (bientôt).
      </p>

      {/* Étape 1 — Upload + preview */}
      <section style={{ background: "white", border: "1px solid #EAE6DF", borderRadius: 16, padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 500, color: "#111", marginTop: 0, marginBottom: 16 }}>
          1. Sélectionner un fichier
        </h2>
        <input
          type="file"
          accept=".xml,.csv,.txt,application/xml,text/xml,text/csv,application/csv,text/plain"
          onChange={(e) => {
            setFile(e.target.files?.[0] || null)
            setPreview(null)
            setCommitted(null)
            setError(null)
          }}
          style={{
            padding: "10px 14px", border: "1px solid #EAE6DF", borderRadius: 10,
            fontSize: 14, fontFamily: "inherit", background: "white", width: "100%",
          }}
        />
        {file && (
          <div style={{ fontSize: 13, color: "#0a7c3e", marginTop: 8 }}>
            ✓ {file.name} ({(file.size / 1024).toFixed(1)} KB)
          </div>
        )}
        {file && !preview && !committed && (
          <button
            onClick={handlePreview}
            disabled={previewing}
            style={{
              marginTop: 16, padding: "12px 24px", background: "#111", color: "white",
              border: "none", borderRadius: 10, fontSize: 14, fontWeight: 500,
              cursor: previewing ? "not-allowed" : "pointer", fontFamily: "inherit",
            }}
          >
            {previewing ? "Analyse en cours…" : "Analyser le fichier"}
          </button>
        )}
      </section>

      {/* Erreur */}
      {error && (
        <div style={{ padding: 16, background: "#FEE", border: "1px solid #FCC", borderRadius: 12, color: "#900", marginBottom: 24 }}>
          <strong>Erreur :</strong> {error}
        </div>
      )}

      {/* Étape 2 — Preview */}
      {preview && !committed && (
        <section style={{ background: "white", border: "1px solid #EAE6DF", borderRadius: 16, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 500, color: "#111", marginTop: 0, marginBottom: 8 }}>
            2. Aperçu de l&apos;import
          </h2>
          <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
            Format détecté : <strong>{preview.format}</strong> · {preview.total} annonce{(preview.total || 0) > 1 ? "s" : ""} prête{(preview.total || 0) > 1 ? "s" : ""} à l&apos;import.
          </p>

          {/* Warnings */}
          {(preview.warnings?.length || 0) > 0 && (
            <div style={{ padding: 12, background: "#FFF7E0", borderRadius: 8, marginBottom: 12, fontSize: 13, color: "#7a5a00" }}>
              <strong>{preview.warnings!.length} avertissement{preview.warnings!.length > 1 ? "s" : ""} :</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                {preview.warnings!.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
                {preview.warnings!.length > 5 && <li>… et {preview.warnings!.length - 5} autres</li>}
              </ul>
            </div>
          )}

          {/* Errors */}
          {(preview.errors?.length || 0) > 0 && (
            <div style={{ padding: 12, background: "#FEE", borderRadius: 8, marginBottom: 12, fontSize: 13, color: "#900" }}>
              <strong>{preview.errors!.length} erreur{preview.errors!.length > 1 ? "s" : ""} bloquante{preview.errors!.length > 1 ? "s" : ""} :</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                {preview.errors!.slice(0, 5).map((er, i) => <li key={i}>{er}</li>)}
              </ul>
            </div>
          )}

          <p style={{ fontSize: 13, fontWeight: 500, color: "#111", marginBottom: 8 }}>
            5 premiers biens détectés :
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {(preview.preview || []).map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: 12, background: "#F7F4EF", borderRadius: 8, alignItems: "center" }}>
                {a.photos && a.photos[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.photos[0]} alt="" style={{ width: 50, height: 50, borderRadius: 6, objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 50, height: 50, borderRadius: 6, background: "#EAE6DF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#999" }}>?</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {a.titre}
                  </div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {a.type_bien || "?"} · {a.ville || "?"} · {a.surface ? `${a.surface} m²` : "? m²"} · {a.pieces || "?"} pièces · <strong style={{ color: "#111" }}>{a.prix || "?"} €</strong>
                  </div>
                </div>
                {a.external_ref && (
                  <div style={{ fontSize: 11, color: "#888", fontFamily: "monospace" }}>{a.external_ref}</div>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={handleCommit}
              disabled={committing || (preview.total || 0) === 0}
              style={{
                padding: "12px 24px", background: "#0a7c3e", color: "white",
                border: "none", borderRadius: 10, fontSize: 14, fontWeight: 500,
                cursor: committing ? "not-allowed" : "pointer", fontFamily: "inherit",
              }}
            >
              {committing ? "Import en cours…" : `Importer ces ${preview.total} annonce${(preview.total || 0) > 1 ? "s" : ""}`}
            </button>
            <button
              onClick={() => { setFile(null); setPreview(null) }}
              style={{
                padding: "12px 24px", background: "white", color: "#111",
                border: "1px solid #EAE6DF", borderRadius: 10, fontSize: 14, fontWeight: 500,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Annuler
            </button>
          </div>

          <p style={{ fontSize: 11, color: "#888", marginTop: 12 }}>
            Les annonces existantes (même titre ou même adresse+surface+type) seront
            mises à jour. Les nouvelles seront créées. Aucune annonce n&apos;est jamais
            supprimée par un import.
          </p>
        </section>
      )}

      {/* Étape 3 — Résumé après commit */}
      {committed && (
        <section style={{ background: "white", border: "1px solid #EAE6DF", borderRadius: 16, padding: 24 }}>
          <div style={{ fontSize: 48, textAlign: "center", marginBottom: 8 }}>✓</div>
          <h2 style={{ fontSize: 20, fontWeight: 500, color: "#111", textAlign: "center", marginTop: 0, marginBottom: 16 }}>
            Import terminé
          </h2>
          <div style={{ textAlign: "center", fontSize: 14, color: "#444", marginBottom: 16 }}>
            {committed.summary}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
            <Stat label="Créées" value={committed.imported || 0} color="#0a7c3e" />
            <Stat label="Mises à jour" value={committed.updated || 0} color="#0a4a7c" />
            <Stat label="Échecs" value={committed.failed || 0} color="#c5352e" />
            <Stat label="Total" value={(committed.imported || 0) + (committed.updated || 0) + (committed.failed || 0)} color="#111" />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href={`/agence/dashboard/${agenceId}`} style={btnSec}>
              ← Retour au dashboard
            </Link>
            <button
              onClick={() => { setFile(null); setPreview(null); setCommitted(null) }}
              style={btnPrimary}
            >
              Importer un autre fichier
            </button>
          </div>
        </section>
      )}

      {/* Aide */}
      <details style={{ marginTop: 32, padding: 16, background: "#F7F4EF", borderRadius: 12, fontSize: 13 }}>
        <summary style={{ cursor: "pointer", fontWeight: 500 }}>Aide — formats de fichier supportés</summary>
        <div style={{ marginTop: 12, color: "#444", lineHeight: 1.6 }}>
          <p><strong>Apimo XML</strong> : exportez depuis Apimo via Configuration → Portails → Export XML. Le fichier doit contenir une balise racine <code>&lt;export&gt;&lt;listings&gt;&lt;listing&gt;…</code></p>
          <p><strong>CSV</strong> : 1 ligne header + 1 ligne par bien. Colonnes reconnues : titre, ville, prix, surface, pieces, chambres, type_bien, adresse, code_postal, dpe, photos (séparées par <code>|</code>), meuble/parking/jardin/balcon/terrasse/cave/ascenseur/fibre (oui/non). Référence externe : <code>reference</code> ou <code>id</code>.</p>
          <p><strong>Hektor</strong> : pas encore supporté. Contacte <a href="mailto:contact@keymatch-immo.fr">contact@keymatch-immo.fr</a> avec un échantillon de fichier export pour qu&apos;on l&apos;ajoute.</p>
          <p><strong>Limites</strong> : 20 MB max par fichier, 500 annonces max par import.</p>
        </div>
      </details>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: 12, background: "#F7F4EF", borderRadius: 10, textAlign: "center" }}>
      <div style={{ fontSize: 24, fontWeight: 600, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>
        {label}
      </div>
    </div>
  )
}

const btnPrimary: React.CSSProperties = {
  padding: "10px 20px", background: "#111", color: "white", border: "none",
  borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: "pointer",
  textDecoration: "none", fontFamily: "inherit",
}
const btnSec: React.CSSProperties = {
  padding: "10px 20px", background: "white", color: "#111", border: "1px solid #EAE6DF",
  borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: "pointer",
  textDecoration: "none", fontFamily: "inherit",
}
