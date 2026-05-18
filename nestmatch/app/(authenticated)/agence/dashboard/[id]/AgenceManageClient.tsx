"use client"

/**
 * V97.39.34 — UI gestion d'une agence : tabs Settings + Membres
 *
 * MVP : settings editable inline (logo, couleur, bio), liste des membres
 * avec invite par email, change role, remove member.
 */

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"

interface Agence {
  id: string
  slug: string
  name: string
  raison_sociale: string
  siret: string
  carte_t_numero: string
  email: string
  telephone: string | null
  adresse: string
  code_postal: string | null
  ville: string | null
  logo_url: string | null
  couleur_primaire: string | null
  bio: string | null
  statut: string
}

interface Membre {
  id: string
  user_email: string
  role: "owner" | "admin" | "agent" | "viewer"
  invited_at: string
  joined_at: string | null
  invited_by: string | null
}

export default function AgenceManageClient({ agenceId }: { agenceId: string }) {
  const [agence, setAgence] = useState<Agence | null>(null)
  const [membres, setMembres] = useState<Membre[]>([])
  const [nbAnnonces, setNbAnnonces] = useState(0)
  const [currentRole, setCurrentRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<"settings" | "membres">("settings")
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/agences/${agenceId}`, { cache: "no-store" })
      const j = await r.json()
      if (!j.ok) {
        setError(j.error || "Erreur")
        return
      }
      setAgence(j.agence)
      setMembres(j.membres || [])
      setNbAnnonces(j.nbAnnonces || 0)
      setCurrentRole(j.currentUserRole)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau")
    } finally {
      setLoading(false)
    }
  }, [agenceId])

  useEffect(() => { void fetchData() }, [fetchData])

  const canEdit = currentRole === "owner" || currentRole === "admin"

  const handleSaveSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!canEdit) return
    setSaving(true)
    setSavedMessage(null)
    const fd = new FormData(e.currentTarget)
    const payload = {
      bio: String(fd.get("bio") || "") || null,
      couleur_primaire: String(fd.get("couleur_primaire") || "") || null,
      telephone: String(fd.get("telephone") || "") || null,
      adresse: String(fd.get("adresse") || ""),
      code_postal: String(fd.get("code_postal") || "") || null,
      ville: String(fd.get("ville") || "") || null,
      email: String(fd.get("email") || ""),
    }
    try {
      const r = await fetch(`/api/agences/${agenceId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      const j = await r.json()
      if (!j.ok) setError(j.error || "Erreur")
      else {
        setSavedMessage("✓ Modifications enregistrées")
        setTimeout(() => setSavedMessage(null), 3000)
        void fetchData()
      }
    } finally {
      setSaving(false)
    }
  }

  const handleInvite = async () => {
    const email = window.prompt("Email de la personne à inviter :")
    if (!email) return
    const role = window.prompt("Role : owner / admin / agent / viewer (défaut: agent)", "agent") || "agent"
    try {
      const r = await fetch(`/api/agences/${agenceId}/membres`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role }),
      })
      const j = await r.json()
      if (!j.ok) alert(`Erreur : ${j.error}`)
      else void fetchData()
    } catch (e) {
      alert(`Erreur : ${e instanceof Error ? e.message : "réseau"}`)
    }
  }

  const handleChangeRole = async (member_id: string, newRole: string) => {
    if (!confirm(`Changer le role en ${newRole} ?`)) return
    const r = await fetch(`/api/agences/${agenceId}/membres`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ member_id, role: newRole }),
    })
    const j = await r.json()
    if (!j.ok) alert(`Erreur : ${j.error}`)
    else void fetchData()
  }

  const handleRemove = async (member_id: string, email: string) => {
    if (!confirm(`Retirer ${email} de l'agence ?`)) return
    const r = await fetch(`/api/agences/${agenceId}/membres`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ member_id }),
    })
    const j = await r.json()
    if (!j.ok) alert(`Erreur : ${j.error}`)
    else void fetchData()
  }

  if (loading) {
    return <div style={{ maxWidth: 1000, margin: "60px auto", padding: 32, textAlign: "center", color: "#666" }}>Chargement…</div>
  }
  if (error || !agence) {
    return (
      <div style={{ maxWidth: 600, margin: "60px auto", padding: 32, background: "#FEE", border: "1px solid #FCC", borderRadius: 12, color: "#900" }}>
        {error || "Agence introuvable"}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: "0 20px 80px" }}>
      <Link href="/agence/dashboard" style={{ fontSize: 13, color: "#666", textDecoration: "underline" }}>
        ← Toutes mes agences
      </Link>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginTop: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-fraunces), serif", fontStyle: "italic", fontWeight: 400, fontSize: 32, color: "#111", margin: 0 }}>
            {agence.name}
          </h1>
          <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
            {agence.raison_sociale} · {nbAnnonces} annonce{nbAnnonces > 1 ? "s" : ""}
          </div>
        </div>
        {agence.statut === "active" && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href={`/agence/dashboard/${agence.id}/import`} style={{ padding: "8px 14px", background: "#111", color: "white", borderRadius: 10, fontSize: 13, textDecoration: "none", fontWeight: 500 }}>
              + Import XML/CSV
            </Link>
            <Link href={`/agence/dashboard/${agence.id}/api-keys`} style={{ padding: "8px 14px", border: "1px solid #EAE6DF", background: "white", color: "#111", borderRadius: 10, fontSize: 13, textDecoration: "none" }}>
              🔑 Clés API
            </Link>
            <Link href={`/agence/${agence.slug}`} style={{ padding: "8px 14px", border: "1px solid #EAE6DF", background: "white", color: "#111", borderRadius: 10, fontSize: 13, textDecoration: "none" }}>
              Page publique →
            </Link>
          </div>
        )}
      </div>

      {agence.statut !== "active" && (
        <div style={{ padding: 16, background: "#FFF7E0", border: "1px solid #F5D982", borderRadius: 12, marginBottom: 24, fontSize: 13, color: "#7a5a00" }}>
          Votre agence est en statut <strong>{agence.statut}</strong>. Les annonces ne peuvent
          pas être publiées tant que la validation KeyMatch n&apos;est pas effective.
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, background: "white", padding: 4, borderRadius: 12, border: "1px solid #EAE6DF", marginBottom: 24, width: "fit-content" }}>
        <button onClick={() => setTab("settings")} style={tab === "settings" ? tabActive : tabInactive}>Paramètres</button>
        <button onClick={() => setTab("membres")} style={tab === "membres" ? tabActive : tabInactive}>Membres ({membres.length})</button>
      </div>

      {/* Tab settings */}
      {tab === "settings" && (
        <form onSubmit={handleSaveSettings} style={{ background: "white", border: "1px solid #EAE6DF", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          {savedMessage && (
            <div style={{ padding: 10, background: "#dcfce7", borderRadius: 8, fontSize: 13, color: "#166534" }}>{savedMessage}</div>
          )}

          <Field label="Email contact" name="email" type="email" defaultValue={agence.email} required disabled={!canEdit} />
          <Field label="Téléphone" name="telephone" type="tel" defaultValue={agence.telephone || ""} disabled={!canEdit} />
          <Field label="Adresse" name="adresse" defaultValue={agence.adresse} required disabled={!canEdit} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
            <Field label="Code postal" name="code_postal" defaultValue={agence.code_postal || ""} disabled={!canEdit} />
            <Field label="Ville" name="ville" defaultValue={agence.ville || ""} disabled={!canEdit} />
          </div>
          <Field
            label="Couleur primaire (hex, ex: #c5352e)"
            name="couleur_primaire"
            defaultValue={agence.couleur_primaire || ""}
            placeholder="#0a7c3e"
            disabled={!canEdit}
            hint="Utilisée pour le badge Pro sur les annonces et la page publique."
          />
          <FieldTextarea
            label="Présentation de votre agence (500 caractères max)"
            name="bio"
            defaultValue={agence.bio || ""}
            disabled={!canEdit}
          />

          {canEdit ? (
            <button type="submit" disabled={saving} style={{ padding: "12px 20px", background: "#111", color: "white", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: saving ? "not-allowed" : "pointer", width: "fit-content", fontFamily: "inherit" }}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          ) : (
            <div style={{ fontSize: 12, color: "#888" }}>
              Vous n&apos;avez pas les droits pour modifier (role : {currentRole}).
            </div>
          )}
        </form>
      )}

      {/* Tab membres */}
      {tab === "membres" && (
        <div style={{ background: "white", border: "1px solid #EAE6DF", borderRadius: 16, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ fontFamily: "var(--font-fraunces), serif", fontStyle: "italic", fontWeight: 400, fontSize: 20, color: "#111", margin: 0 }}>
              Équipe de l&apos;agence
            </h2>
            {canEdit && (
              <button onClick={handleInvite} style={{ padding: "8px 14px", background: "#111", color: "white", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                + Inviter
              </button>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {membres.map(m => (
              <div key={m.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: 12, background: "#F7F4EF", borderRadius: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "#111", wordBreak: "break-word" }}>{m.user_email}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    role: <strong>{m.role}</strong> · invité{m.joined_at ? " et rejoint" : ""}{" "}
                    {new Date(m.invited_at).toLocaleDateString("fr-FR")}
                  </div>
                </div>
                {canEdit && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <select
                      value={m.role}
                      onChange={(e) => handleChangeRole(m.id, e.target.value)}
                      style={{ padding: "6px 10px", border: "1px solid #EAE6DF", borderRadius: 8, fontSize: 12, background: "white" }}
                    >
                      <option value="owner">owner</option>
                      <option value="admin">admin</option>
                      <option value="agent">agent</option>
                      <option value="viewer">viewer</option>
                    </select>
                    <button
                      onClick={() => handleRemove(m.id, m.user_email)}
                      style={{ padding: "6px 10px", background: "white", border: "1px solid #FCC", color: "#900", borderRadius: 8, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      Retirer
                    </button>
                  </div>
                )}
              </div>
            ))}
            {membres.length === 0 && (
              <div style={{ textAlign: "center", padding: 24, color: "#666", fontSize: 13 }}>
                Aucun membre. Le premier (vous) sera créé en owner automatiquement à l&apos;inscription.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const tabActive: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 8, border: "none",
  background: "#111", color: "white", fontSize: 13, fontWeight: 500,
  cursor: "pointer", fontFamily: "inherit",
}
const tabInactive: React.CSSProperties = {
  ...tabActive, background: "transparent", color: "#666",
}

function Field({ label, name, type = "text", defaultValue, placeholder, required, disabled, hint }: {
  label: string; name: string; type?: string; defaultValue?: string; placeholder?: string; required?: boolean; disabled?: boolean; hint?: string
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 13, color: "#111", fontWeight: 500 }}>{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        style={{
          padding: "10px 14px", border: "1px solid #EAE6DF", borderRadius: 10,
          fontSize: 14, fontFamily: "inherit",
          background: disabled ? "#F7F4EF" : "white",
        }}
      />
      {hint && <span style={{ fontSize: 12, color: "#888" }}>{hint}</span>}
    </label>
  )
}

function FieldTextarea({ label, name, defaultValue, disabled }: {
  label: string; name: string; defaultValue?: string; disabled?: boolean
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 13, color: "#111", fontWeight: 500 }}>{label}</span>
      <textarea
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        rows={4}
        maxLength={500}
        style={{
          padding: "10px 14px", border: "1px solid #EAE6DF", borderRadius: 10,
          fontSize: 14, fontFamily: "inherit",
          background: disabled ? "#F7F4EF" : "white",
          resize: "vertical",
        }}
      />
    </label>
  )
}
