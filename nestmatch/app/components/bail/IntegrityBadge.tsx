"use client"
// V34.2 — Badge "Intégrité vérifiée" qui appelle /api/bail/[id]/verify-integrity
// au mount et affiche le statut. Compatible audit V31 R3.2 anti-tampering.

import { useEffect, useState } from "react"

interface Props {
  annonceId: number
  /** Affiche le badge même quand status = legacy (signature avant V34). */
  showLegacy?: boolean
}

type IntegrityStatus =
  | { ok: true; status: "verified"; signedAt: string }
  | { ok: true; status: "no_signature" }
  | { ok: true; status: "legacy"; signedAt: string; message: string }
  | { ok: false; status: "tampered"; signedAt: string; message: string }
  | { ok: false; status: "no_payload"; error: string }
  | { ok: false; error: string }

export default function IntegrityBadge({ annonceId, showLegacy = false }: Props) {
  const [data, setData] = useState<IntegrityStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void fetch(`/api/bail/${annonceId}/verify-integrity`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setData(d as IntegrityStatus) })
      .catch(() => { if (!cancelled) setData({ ok: false, error: "Vérification impossible" }) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [annonceId])

  if (loading) return null
  if (!data) return null
  // Caché si pas de signature OU legacy (sauf showLegacy=true)
  if (data.ok && data.status === "no_signature") return null
  if (data.ok && data.status === "legacy" && !showLegacy) return null

  const isVerified = data.ok && "status" in data && data.status === "verified"
  const isTampered = !data.ok && "status" in data && data.status === "tampered"
  const isLegacy = data.ok && "status" in data && data.status === "legacy"

  const bg = isVerified ? "#F0FAEE" : isTampered ? "#FEECEC" : "#F7F4EF"
  const border = isVerified ? "#C6E9C0" : isTampered ? "#F4C9C9" : "#EAE6DF"
  const color = isVerified ? "#15803d" : isTampered ? "#b91c1c" : "#8a8477"

  const label = isVerified
    ? "✓ Intégrité vérifiée"
    : isTampered
      ? "⚠ Modifications détectées post-signature"
      : isLegacy
        ? "Signature antérieure à V34"
        : "Vérification indisponible"

  const tooltip = isVerified
    ? `Le bail courant correspond exactement au document signé. SHA-256 vérifié.${"signedAt" in data ? ` Signé le ${new Date(data.signedAt).toLocaleDateString("fr-FR")}.` : ""}`
    : isTampered
      ? "Le contenu du bail a été modifié après la signature. Une vérification manuelle s'impose."
      : isLegacy
        ? "La vérification SHA-256 n'est disponible que pour les baux signés à partir de V34 (avril 2026)."
        : "error" in data ? data.error : ""

  return (
    <span
      title={tooltip}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: bg,
        border: `1px solid ${border}`,
        color,
        padding: "4px 12px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "1.2px",
        fontFamily: "'DM Sans', sans-serif",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  )
}
