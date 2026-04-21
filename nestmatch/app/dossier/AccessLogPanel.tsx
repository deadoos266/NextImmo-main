"use client"
import { useEffect, useState } from "react"
import { parseUserAgent } from "../../lib/dossierAccessLog"

type AccessLog = {
  token_hash: string
  ip_hash: string | null
  user_agent: string | null
  accessed_at: string
  document_key: string | null
}

const DOC_KEY_LABELS: Record<string, string> = {
  identite: "Pièce d'identité",
  bulletins: "Bulletins de salaire",
  avis_imposition: "Avis d'imposition",
  contrat: "Contrat de travail",
  quittances: "Quittances",
  identite_garant: "Identité garant",
  bulletins_garant: "Bulletins garant",
  avis_garant: "Avis garant",
  certificat_scolarite: "Certificat scolarité",
  attestation_caf: "Attestation CAF",
  attestation_assurance: "Attestation assurance",
  attestation_employeur: "Attestation employeur",
  zip: "Dossier ZIP complet",
}

const T = {
  white: "#fff",
  ink: "#111",
  line: "#EAE6DF",
  hairline: "#F0EAE0",
  meta: "#666",
  soft: "#8a8477",
  mutedBg: "#FAF8F3",
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
  // + collecte les docs consultés pour afficher un résumé dans le bloc.
  const grouped: Record<string, { log: AccessLog; count: number; docs: Set<string> }> = {}
  for (const l of logs) {
    const k = l.token_hash
    if (!grouped[k]) grouped[k] = { log: l, count: 1, docs: new Set() }
    else grouped[k].count++
    if (l.document_key) grouped[k].docs.add(l.document_key)
  }
  const sessions = Object.values(grouped).sort((a, b) =>
    new Date(b.log.accessed_at).getTime() - new Date(a.log.accessed_at).getTime()
  )

  return (
    <div style={{ background: T.white, borderRadius: 20, padding: 28, marginBottom: 20, border: `1px solid ${T.line}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.8px", textTransform: "uppercase", color: T.soft }}>
          Consultations
        </span>
        <div style={{ flex: 1, height: 1, background: T.hairline }} />
      </div>

      <h3 style={{ fontSize: 22, fontWeight: 500, fontStyle: "italic", letterSpacing: "-0.4px", margin: "0 0 10px", color: T.ink, lineHeight: 1.15 }}>
        Qui a consulté votre dossier
      </h3>
      <p style={{ fontSize: 12, color: T.meta, margin: "0 0 18px", lineHeight: 1.6 }}>
        Liste des accès récents aux liens de partage. Les données sont anonymisées (conforme RGPD) et purgées après 90 jours.
      </p>
      {loading ? (
        <p style={{ fontSize: 12, color: T.soft, fontStyle: "italic" }}>Chargement…</p>
      ) : sessions.length === 0 ? (
        <p style={{ fontSize: 12, color: T.soft, fontStyle: "italic" }}>Aucune consultation enregistrée pour l&apos;instant.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sessions.slice(0, 10).map((s, idx) => (
            <div key={s.log.token_hash + idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", border: `1px solid ${T.hairline}`, borderRadius: 12, background: T.mutedBg }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: T.ink }}>{parseUserAgent(s.log.user_agent || "")}</p>
                <p style={{ fontSize: 11, color: T.soft, margin: "3px 0 0", fontVariantNumeric: "tabular-nums" }}>
                  Lien #{s.log.token_hash.slice(0, 6)} · {s.count} {s.count > 1 ? "visites" : "visite"}
                </p>
                {s.docs.size > 0 && (
                  <p style={{ fontSize: 11, color: T.meta, margin: "3px 0 0", fontStyle: "italic" }}>
                    Pièces ouvertes : {Array.from(s.docs).map(k => DOC_KEY_LABELS[k] || k).join(", ")}
                  </p>
                )}
              </div>
              <span style={{ fontSize: 11, color: T.meta, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                {new Date(s.log.accessed_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
