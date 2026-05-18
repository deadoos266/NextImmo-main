"use client"

/**
 * V97.39.34 — /admin/erreurs UI
 *
 * Affiche les issues GlitchTip avec :
 *  - Filtre période (24h / 7d / 30d / 90d)
 *  - Auto-refresh toutes les 60s
 *  - Bouton "📋 Copier markdown pour Claude" qui copie un résumé formaté
 *    dans le presse-papier (Paul colle dans la conversation Claude).
 *  - Lien direct vers chaque issue sur GlitchTip dashboard.
 *
 * Style cohérent /admin/* : palette beige #F7F4EF, hairline #EAE6DF, Fraunces italic titles.
 */

import { useEffect, useState, useCallback } from "react"

type Issue = {
  id: string
  shortId?: string
  title: string
  culprit?: string
  level?: string
  count: number
  userCount: number
  lastSeen?: string
  firstSeen?: string
  status?: string
  permalink?: string
  type?: string
  value?: string
  filename?: string
}

type Response = {
  ok: boolean
  period: string
  count: number
  issues: Issue[]
  dashboardUrl: string
  error?: string
}

const PERIODS = ["24h", "7d", "30d", "90d"] as const
type Period = (typeof PERIODS)[number]

export default function ErreursClient() {
  const [period, setPeriod] = useState<Period>("24h")
  const [data, setData] = useState<Response | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/admin/glitchtip?period=${period}`, { cache: "no-store" })
      const j = (await r.json()) as Response
      if (!j.ok) {
        setError(j.error || "Erreur inconnue")
        setData(null)
      } else {
        setData(j)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau")
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    void fetchData()
    // Auto-refresh toutes les 60s
    const t = setInterval(() => void fetchData(), 60_000)
    return () => clearInterval(t)
  }, [fetchData])

  const handleCopyMarkdown = async () => {
    if (!data || data.issues.length === 0) return

    const lines: string[] = []
    lines.push(`# Bugs KeyMatch — GlitchTip ${data.period} (${data.count} issues)`)
    lines.push("")
    lines.push(`Source : ${data.dashboardUrl}`)
    lines.push("")

    data.issues.forEach((i, idx) => {
      lines.push(`## ${idx + 1}. ${i.title}`)
      if (i.shortId) lines.push(`**Short ID** : \`${i.shortId}\``)
      if (i.level) lines.push(`**Niveau** : ${i.level}`)
      lines.push(`**Occurrences** : ${i.count} (sur ${i.userCount} user${i.userCount > 1 ? "s" : ""})`)
      if (i.firstSeen) lines.push(`**First seen** : ${new Date(i.firstSeen).toLocaleString("fr-FR")}`)
      if (i.lastSeen) lines.push(`**Last seen** : ${new Date(i.lastSeen).toLocaleString("fr-FR")}`)
      if (i.type && i.value) lines.push(`**Exception** : \`${i.type}: ${i.value}\``)
      if (i.culprit) lines.push(`**Culprit** : \`${i.culprit}\``)
      if (i.filename) lines.push(`**Fichier** : \`${i.filename}\``)
      if (i.permalink) lines.push(`**Détail GlitchTip** : ${i.permalink}`)
      lines.push("")
    })

    const md = lines.join("\n")
    try {
      await navigator.clipboard.writeText(md)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback : show in textarea pour copy manuel
      const ta = document.createElement("textarea")
      ta.value = md
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand("copy")
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      } catch {
        alert("Impossible de copier automatiquement. Voici le markdown :\n\n" + md)
      } finally {
        document.body.removeChild(ta)
      }
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
        <h1 style={{
          fontFamily: "var(--font-fraunces), 'Fraunces', serif",
          fontStyle: "italic",
          fontWeight: 400,
          fontSize: 32,
          color: "#111",
          margin: 0,
        }}>
          Erreurs runtime
        </h1>
        <div style={{ fontSize: 13, color: "#666" }}>
          Source : <a href="https://sentry.keymatch-immo.fr" target="_blank" rel="noopener noreferrer" style={{ color: "#111", textDecoration: "underline" }}>GlitchTip self-host</a>
        </div>
      </div>

      <p style={{ fontSize: 14, color: "#444", marginTop: 0, marginBottom: 24 }}>
        Erreurs captées automatiquement chez les utilisateurs. Auto-refresh 60s.
      </p>

      {/* Filtre période + bouton copy */}
      <div style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        marginBottom: 24,
        flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", gap: 4, background: "white", padding: 4, borderRadius: 12, border: "1px solid #EAE6DF" }}>
          {PERIODS.map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "none",
                background: period === p ? "#111" : "transparent",
                color: period === p ? "white" : "#666",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {p === "24h" ? "24 h" : p === "7d" ? "7 jours" : p === "30d" ? "30 jours" : "90 jours"}
            </button>
          ))}
        </div>

        <button
          onClick={() => void fetchData()}
          disabled={loading}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: "1px solid #EAE6DF",
            background: "white",
            color: "#111",
            fontSize: 13,
            cursor: loading ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Chargement…" : "↻ Rafraîchir"}
        </button>

        {data && data.issues.length > 0 && (
          <button
            onClick={() => void handleCopyMarkdown()}
            style={{
              marginLeft: "auto",
              padding: "10px 18px",
              borderRadius: 10,
              border: "none",
              background: copied ? "#0a7c3e" : "#111",
              color: "white",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "background 0.15s",
            }}
          >
            {copied ? "✓ Copié !" : "📋 Copier markdown pour Claude"}
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: 16,
          background: "#FEE",
          border: "1px solid #FCC",
          borderRadius: 12,
          color: "#900",
          marginBottom: 24,
        }}>
          <strong>Erreur :</strong> {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && data && data.count === 0 && (
        <div style={{
          padding: 32,
          background: "white",
          border: "1px solid #EAE6DF",
          borderRadius: 20,
          textAlign: "center",
          color: "#444",
        }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 16, fontWeight: 500, color: "#111" }}>
            Aucune erreur sur {data.period === "24h" ? "les dernières 24 h" : `les ${data.period}`}
          </div>
          <div style={{ fontSize: 13, marginTop: 8 }}>
            Tout va bien côté production.
          </div>
        </div>
      )}

      {/* Liste des issues */}
      {data && data.count > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {data.issues.map((i, idx) => (
            <article key={i.id} style={{
              background: "white",
              border: "1px solid #EAE6DF",
              borderRadius: 16,
              padding: 20,
            }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                    <span style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: i.level === "error" || i.level === "fatal" ? "#FEE" : i.level === "warning" ? "#FFF7E0" : "#F0F0F0",
                      color: i.level === "error" || i.level === "fatal" ? "#900" : i.level === "warning" ? "#7a5a00" : "#666",
                      fontWeight: 500,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}>
                      {i.level || "info"}
                    </span>
                    {i.shortId && (
                      <span style={{ fontSize: 12, color: "#888", fontFamily: "ui-monospace, monospace" }}>
                        {i.shortId}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: "#888" }}>#{idx + 1}</span>
                  </div>
                  <div style={{
                    fontSize: 16,
                    fontWeight: 500,
                    color: "#111",
                    marginBottom: 6,
                    wordBreak: "break-word",
                  }}>
                    {i.title}
                  </div>
                  {i.culprit && (
                    <div style={{
                      fontSize: 13,
                      color: "#666",
                      fontFamily: "ui-monospace, monospace",
                      marginBottom: 8,
                    }}>
                      {i.culprit}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#666", flexWrap: "wrap" }}>
                    <span><strong style={{ color: "#111" }}>{i.count}</strong> occurrence{i.count > 1 ? "s" : ""}</span>
                    <span><strong style={{ color: "#111" }}>{i.userCount}</strong> user{i.userCount > 1 ? "s" : ""}</span>
                    {i.lastSeen && (
                      <span>
                        Dernière : {new Date(i.lastSeen).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    )}
                  </div>
                </div>
                {i.permalink && (
                  <a
                    href={i.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #EAE6DF",
                      background: "white",
                      color: "#111",
                      fontSize: 12,
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Détail →
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Loading initial */}
      {loading && !data && (
        <div style={{
          padding: 32,
          textAlign: "center",
          color: "#666",
        }}>
          Chargement des erreurs…
        </div>
      )}
    </div>
  )
}
