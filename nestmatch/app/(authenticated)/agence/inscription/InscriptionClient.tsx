"use client"

/**
 * V97.39.34 — UI inscription agence
 *
 * Form 1-page avec sections : Identité commerciale / Carte T / Coordonnées /
 * Description. Upload doc carte T inline. POST multipart/form-data.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

export default function InscriptionClient() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const formData = new FormData(e.currentTarget)
    try {
      const r = await fetch("/api/agences/inscription", {
        method: "POST",
        body: formData,
      })
      const j = await r.json()
      if (!j.ok) {
        setError(j.error || "Erreur inconnue")
      } else {
        setSuccess(j.message || "Inscription enregistrée. En attente de validation.")
        // Redirige vers une page de confirmation simple après 2s
        setTimeout(() => router.push(`/agence/${j.slug}?signup_pending=1`), 2500)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau")
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div style={{ maxWidth: 600, margin: "80px auto", padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>✓</div>
        <h1 style={{
          fontFamily: "var(--font-fraunces), serif",
          fontStyle: "italic",
          fontWeight: 400,
          fontSize: 32,
          color: "#111",
          marginBottom: 16,
        }}>
          Inscription enregistrée
        </h1>
        <p style={{ fontSize: 15, color: "#444", marginBottom: 16 }}>{success}</p>
        <p style={{ fontSize: 13, color: "#888" }}>Redirection en cours…</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 20px 80px" }}>
      <Link href="/proprietaire" style={{ fontSize: 13, color: "#666", textDecoration: "underline" }}>
        ← Retour
      </Link>

      <h1 style={{
        fontFamily: "var(--font-fraunces), 'Fraunces', serif",
        fontStyle: "italic",
        fontWeight: 400,
        fontSize: 36,
        color: "#111",
        margin: "16px 0 8px",
      }}>
        Inscrire votre agence
      </h1>

      <p style={{ fontSize: 14, color: "#444", marginBottom: 24 }}>
        Réservé aux agences immobilières titulaires d&apos;une carte professionnelle T (loi
        Hoguet). Validation manuelle sous 48h ouvrées par l&apos;équipe KeyMatch.
      </p>

      <form onSubmit={handleSubmit} style={{
        background: "white",
        border: "1px solid #EAE6DF",
        borderRadius: 20,
        padding: 32,
        display: "flex",
        flexDirection: "column",
        gap: 28,
      }}>
        {/* Identité commerciale */}
        <Section title="Identité commerciale">
          <Field label="Nom commercial *" name="name" placeholder="Century 21 Bastille" required />
          <Field label="Raison sociale *" name="raison_sociale" placeholder="BASTILLE IMMO SAS" required />
          <Field label="SIRET *" name="siret" placeholder="44306184100047" required maxLength={20} hint="14 chiffres (espaces autorisés)" />
        </Section>

        {/* Carte T */}
        <Section title="Carte professionnelle T (loi Hoguet)">
          <Field
            label="Numéro de carte T *"
            name="carte_t_numero"
            placeholder="CPI 7501 2018 000 042 069"
            required
            hint="Format CPI suivi de 12-16 chiffres. L'original sera vérifié par l'équipe KeyMatch."
          />
          <FieldFile
            label="Justificatif carte T (PDF ou photo) *"
            name="carte_t_doc"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            required
            hint="10 MB max. PDF préféré. Sera stocké en stockage privé chiffré, accessible uniquement à l'équipe de validation KeyMatch."
          />
        </Section>

        {/* Coordonnées */}
        <Section title="Coordonnées">
          <Field label="Adresse *" name="adresse" placeholder="12 rue de la Roquette" required />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
            <Field label="Code postal" name="code_postal" placeholder="75011" maxLength={5} />
            <Field label="Ville" name="ville" placeholder="Paris" />
          </div>
          <Field label="Email contact *" name="email" type="email" placeholder="contact@century21-bastille.fr" required />
          <Field label="Téléphone" name="telephone" type="tel" placeholder="01 23 45 67 89" />
        </Section>

        {/* Description */}
        <Section title="Description (optionnel)">
          <FieldTextarea
            label="Présentation de votre agence"
            name="bio"
            placeholder="Spécialiste de la location dans le 11e arrondissement depuis 2005..."
            hint="Affichée sur votre page agence publique. 500 caractères max."
            maxLength={500}
          />
        </Section>

        {/* Submit */}
        {error && (
          <div style={{
            padding: 14,
            background: "#FEE",
            border: "1px solid #FCC",
            borderRadius: 10,
            color: "#900",
            fontSize: 14,
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "14px 28px",
            background: submitting ? "#888" : "#111",
            color: "white",
            border: "none",
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 500,
            cursor: submitting ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {submitting ? "Envoi en cours…" : "Soumettre l'inscription"}
        </button>

        <p style={{ fontSize: 12, color: "#888", lineHeight: 1.5 }}>
          En soumettant ce formulaire, vous acceptez les{" "}
          <Link href="/cgu" style={{ color: "#111", textDecoration: "underline" }}>CGU</Link> et{" "}
          <Link href="/confidentialite" style={{ color: "#111", textDecoration: "underline" }}>la politique de
            confidentialité</Link>. Votre carte T sera vérifiée manuellement par
          l&apos;équipe KeyMatch (délai 48h ouvrées). Vous serez notifié par email à
          l&apos;adresse contact fournie.
        </p>
      </form>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 style={{
        fontSize: 13,
        textTransform: "uppercase",
        letterSpacing: 1.2,
        color: "#666",
        fontWeight: 600,
        marginBottom: 14,
        paddingBottom: 8,
        borderBottom: "1px solid #EAE6DF",
      }}>
        {title}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {children}
      </div>
    </div>
  )
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  required,
  maxLength,
  hint,
}: {
  label: string
  name: string
  type?: string
  placeholder?: string
  required?: boolean
  maxLength?: number
  hint?: string
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 13, color: "#111", fontWeight: 500 }}>{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        style={{
          padding: "10px 14px",
          border: "1px solid #EAE6DF",
          borderRadius: 10,
          fontSize: 14,
          fontFamily: "inherit",
          background: "white",
        }}
      />
      {hint && <span style={{ fontSize: 12, color: "#888" }}>{hint}</span>}
    </label>
  )
}

function FieldFile({
  label,
  name,
  accept,
  required,
  hint,
}: {
  label: string
  name: string
  accept?: string
  required?: boolean
  hint?: string
}) {
  const [fileName, setFileName] = useState<string | null>(null)
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 13, color: "#111", fontWeight: 500 }}>{label}</span>
      <input
        name={name}
        type="file"
        accept={accept}
        required={required}
        onChange={(e) => setFileName(e.target.files?.[0]?.name || null)}
        style={{
          padding: "10px 14px",
          border: "1px solid #EAE6DF",
          borderRadius: 10,
          fontSize: 14,
          fontFamily: "inherit",
          background: "white",
        }}
      />
      {fileName && <span style={{ fontSize: 12, color: "#0a7c3e" }}>✓ {fileName}</span>}
      {hint && <span style={{ fontSize: 12, color: "#888" }}>{hint}</span>}
    </label>
  )
}

function FieldTextarea({
  label,
  name,
  placeholder,
  hint,
  maxLength,
}: {
  label: string
  name: string
  placeholder?: string
  hint?: string
  maxLength?: number
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 13, color: "#111", fontWeight: 500 }}>{label}</span>
      <textarea
        name={name}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={4}
        style={{
          padding: "10px 14px",
          border: "1px solid #EAE6DF",
          borderRadius: 10,
          fontSize: 14,
          fontFamily: "inherit",
          background: "white",
          resize: "vertical",
        }}
      />
      {hint && <span style={{ fontSize: 12, color: "#888" }}>{hint}</span>}
    </label>
  )
}
