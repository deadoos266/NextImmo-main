"use client"
import { useEffect, useState } from "react"
import { parseUserAgent } from "../../lib/dossierAccessLog"

type AccessLog = {
  token_hash: string
  ip_hash: string | null
  user_agent: string | null
  accessed_at: string
}

/**
 * Affiche les accès récents au dossier partagé du locataire.
 * Groupe par token_hash pour dédupliquer les refresh/visite multiple d'un même lien.
 */
export default function AccessLogPanel() {
  const [logs, setLogs] = useState<AccessLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/dossier/access-log", { cache: "no-store" })
      .then(r => r.ok ? r.json() : { logs: [] })
      .then(json => setLogs(json.logs || []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false))
  }, [])

  // Groupage par token_hash — garde la dernière visite de chaque session
  const grouped: Record<string, { log: AccessLog; count: number }> = {}
  for (const l of logs) {
    const k = l.token_hash
    if (!grouped[k]) grouped[k] = { log: l, count: 1 }
    else grouped[k].count++
  }
  const sessions = Object.values(grouped).sort((a, b) =>
    new Date(b.log.accessed_at).getTime() - new Date(a.log.accessed_at).getTime()
  )

  return (
    <div style={{ background: "white", borderRadius: 20, padding: 24, marginBottom: 20 }}>
      <h3 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 4px" }}>Qui a consulté votre dossier</h3>
      <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 14px", lineHeight: 1.5 }}>
        Liste des accès récents aux liens de partage. Les données sont anonymisées (conforme RGPD) et purgées après 90 jours.
      </p>
      {loading ? (
        <p style={{ fontSize: 12, color: "#9ca3af" }}>Chargement…</p>
      ) : sessions.length === 0 ? (
        <p style={{ fontSize: 12, color: "#9ca3af" }}>Aucune consultation enregistrée pour l&apos;instant.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {sessions.slice(0, 10).map((s, idx) => (
            <div key={s.log.token_hash + idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", border: "1px solid #f3f4f6", borderRadius: 10, background: "#fafafa" }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 700, margin: 0 }}>{parseUserAgent(s.log.user_agent || "")}</p>
                <p style={{ fontSize: 11, color: "#9ca3af", margin: "2px 0 0" }}>
                  Lien #{s.log.token_hash.slice(0, 6)} · {s.count} {s.count > 1 ? "visites" : "visite"}
                </p>
              </div>
              <span style={{ fontSize: 11, color: "#6b7280", whiteSpace: "nowrap" }}>
                {new Date(s.log.accessed_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
