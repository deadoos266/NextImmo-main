"use client"

import { useState, FormEvent, ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { km } from "../../../components/ui/km"

interface ImporterForm {
  titre: string
  ville: string
  adresse: string
  surface: string
  pieces: string
  meuble: boolean
  loyerHC: string
  charges: string
  depotGarantie: string
  dateSignature: string
  dateDebut: string
  dureeMois: string
  locataireEmail: string
  messageProprio: string
}

const EMPTY_FORM: ImporterForm = {
  titre: "",
  ville: "",
  adresse: "",
  surface: "",
  pieces: "",
  meuble: false,
  loyerHC: "",
  charges: "",
  depotGarantie: "",
  dateSignature: "",
  dateDebut: "",
  dureeMois: "36",
  locataireEmail: "",
  messageProprio: "",
}

const T = {
  bg: km.beige,
  card: km.white,
  ink: km.ink,
  muted: km.muted,
  line: km.line,
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: T.ink,
  textTransform: "uppercase",
  letterSpacing: "0.4px",
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid ${T.line}`,
  background: T.card,
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 14,
  color: T.ink,
  fontFamily: "inherit",
  outline: "none",
}

function Field({ label, hint, children }: { label: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 11, color: T.muted, margin: "4px 0 0", lineHeight: 1.45 }}>{hint}</p>}
    </div>
  )
}

export default function ImporterBailPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [form, setForm] = useState<ImporterForm>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<{ annonceId: number; emailSent: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (status === "loading") {
    return (
      <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", background: T.bg }}>
        <p style={{ color: T.muted, fontSize: 14 }}>Chargement…</p>
      </main>
    )
  }

  if (!session?.user?.email) {
    return (
      <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", background: T.bg, padding: 16 }}>
        <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 20, padding: 28, maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800 }}>Connexion requise</h1>
          <p style={{ color: T.muted, fontSize: 14, margin: "0 0 18px", lineHeight: 1.55 }}>
            Connectez-vous pour importer un bail existant.
          </p>
          <Link href="/auth" style={{ display: "inline-block", background: T.ink, color: "#fff", padding: "10px 22px", borderRadius: 999, textDecoration: "none", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px" }}>
            Se connecter
          </Link>
        </div>
      </main>
    )
  }

  function update<K extends keyof ImporterForm>(k: K, v: ImporterForm[K]) {
    setForm(f => ({ ...f, [k]: v }))
    if (error) setError(null)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)

    if (form.titre.trim().length < 3) { setError("Donnez un titre clair au bien (ex : 2 pièces Bastille 42m²)"); return }
    if (form.ville.trim().length < 2) { setError("Renseignez la ville"); return }
    if (!Number(form.loyerHC) || Number(form.loyerHC) < 1) { setError("Loyer hors charges requis"); return }
    if (!form.locataireEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.locataireEmail.trim())) {
      setError("Email du locataire invalide"); return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/bail/importer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titre: form.titre.trim(),
          ville: form.ville.trim(),
          adresse: form.adresse.trim() || undefined,
          surface: Number(form.surface) || undefined,
          pieces: Number(form.pieces) || undefined,
          meuble: form.meuble,
          loyerHC: Number(form.loyerHC),
          charges: Number(form.charges) || 0,
          depotGarantie: Number(form.depotGarantie) || 0,
          dateSignature: form.dateSignature || undefined,
          dateDebut: form.dateDebut || undefined,
          dureeMois: Number(form.dureeMois) || 36,
          locataireEmail: form.locataireEmail.trim().toLowerCase(),
          messageProprio: form.messageProprio.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || "Import a échoué.")
        return
      }
      setSuccess({ annonceId: data.annonceId, emailSent: data.emailSent === true })
      setForm(EMPTY_FORM)
    } catch (err) {
      console.error("[importer] submit failed", err)
      setError("Erreur réseau, réessayez.")
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <main style={{ minHeight: "calc(100vh - 64px)", background: T.bg, padding: "32px 16px" }}>
        <div style={{ maxWidth: 520, margin: "0 auto" }}>
          <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 20, padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 44, marginBottom: 14, lineHeight: 1 }} aria-hidden>✉️</div>
            <p style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 8px" }}>Invitation envoyée</p>
            <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 28, color: T.ink, margin: "0 0 12px" }}>
              Votre locataire est invité
            </h1>
            <p style={{ color: T.muted, fontSize: 14, lineHeight: 1.6, margin: "0 0 8px" }}>
              {success.emailSent
                ? "Un email vient de partir avec un lien d'acceptation. L'invitation expire dans 14 jours."
                : "L'invitation est créée. L'envoi de l'email est en cours — il peut prendre quelques minutes."}
            </p>
            <p style={{ color: T.muted, fontSize: 13, lineHeight: 1.6, margin: "0 0 24px" }}>
              Tant que le locataire n'a pas accepté, le bien n'apparaît pas dans les annonces publiques.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Link href="/proprietaire" style={{ display: "block", background: T.ink, color: "#fff", padding: "12px 24px", borderRadius: 999, textDecoration: "none", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px" }}>
                Retour au tableau de bord
              </Link>
              <button onClick={() => setSuccess(null)} style={{ background: "transparent", border: `1px solid ${T.line}`, color: T.ink, padding: "12px 24px", borderRadius: 999, fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                Importer un autre bail
              </button>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main style={{ minHeight: "calc(100vh - 64px)", background: T.bg, padding: "32px 16px 64px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500&display=swap');`}</style>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <Link href="/proprietaire" style={{ fontSize: 12, color: T.muted, textDecoration: "none" }}>
            ← Retour
          </Link>
        </div>

        <p style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 10px" }}>Bail existant</p>
        <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 36, letterSpacing: "-0.5px", color: T.ink, margin: "0 0 8px", lineHeight: 1.15 }}>
          Importer un bail signé hors plateforme
        </h1>
        <p style={{ fontSize: 14, color: T.muted, margin: "0 0 28px", lineHeight: 1.6, maxWidth: 560 }}>
          Renseignez les informations clés du bail. Votre locataire recevra un email l'invitant à rejoindre KeyMatch — une fois accepté, vous pourrez générer ses quittances et utiliser tous les outils de gestion locative.
        </p>

        <form onSubmit={onSubmit} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 20, padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
            <Field label="Titre du bien" hint="Ex : 2 pièces Bastille 42 m²">
              <input style={inputStyle} value={form.titre} onChange={e => update("titre", e.target.value)} placeholder="2 pièces Bastille 42 m²" maxLength={200} required />
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Ville">
                <input style={inputStyle} value={form.ville} onChange={e => update("ville", e.target.value)} placeholder="Paris" maxLength={100} required />
              </Field>
              <Field label="Adresse" hint="(privée — non publiée)">
                <input style={inputStyle} value={form.adresse} onChange={e => update("adresse", e.target.value)} placeholder="12 rue Saint-Antoine" maxLength={300} />
              </Field>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Field label="Surface (m²)">
                <input style={inputStyle} type="number" min={0} max={2000} value={form.surface} onChange={e => update("surface", e.target.value)} placeholder="42" />
              </Field>
              <Field label="Pièces">
                <input style={inputStyle} type="number" min={0} max={20} value={form.pieces} onChange={e => update("pieces", e.target.value)} placeholder="2" />
              </Field>
              <Field label="Meublé">
                <select style={inputStyle} value={form.meuble ? "oui" : "non"} onChange={e => update("meuble", e.target.value === "oui")}>
                  <option value="non">Non</option>
                  <option value="oui">Oui</option>
                </select>
              </Field>
            </div>
          </div>

          <div style={{ height: 1, background: T.line, margin: "4px 0" }} />

          <p style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: 0 }}>Conditions financières</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="Loyer HC (€)">
              <input style={inputStyle} type="number" min={1} max={50000} value={form.loyerHC} onChange={e => update("loyerHC", e.target.value)} placeholder="1100" required />
            </Field>
            <Field label="Charges (€)">
              <input style={inputStyle} type="number" min={0} max={5000} value={form.charges} onChange={e => update("charges", e.target.value)} placeholder="80" />
            </Field>
            <Field label="Dépôt de garantie (€)">
              <input style={inputStyle} type="number" min={0} max={50000} value={form.depotGarantie} onChange={e => update("depotGarantie", e.target.value)} placeholder="1100" />
            </Field>
          </div>

          <div style={{ height: 1, background: T.line, margin: "4px 0" }} />

          <p style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: 0 }}>Dates du bail</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="Signature">
              <input style={inputStyle} type="date" value={form.dateSignature} onChange={e => update("dateSignature", e.target.value)} />
            </Field>
            <Field label="Début">
              <input style={inputStyle} type="date" value={form.dateDebut} onChange={e => update("dateDebut", e.target.value)} />
            </Field>
            <Field label="Durée (mois)">
              <select style={inputStyle} value={form.dureeMois} onChange={e => update("dureeMois", e.target.value)}>
                <option value="12">12 (meublé)</option>
                <option value="36">36 (vide)</option>
                <option value="9">9 (étudiant)</option>
              </select>
            </Field>
          </div>

          <div style={{ height: 1, background: T.line, margin: "4px 0" }} />

          <p style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: 0 }}>Locataire</p>

          <Field label="Email du locataire" hint="Il recevra un email l'invitant à valider le bail. Vous pouvez le notifier oralement à l'avance.">
            <input style={inputStyle} type="email" value={form.locataireEmail} onChange={e => update("locataireEmail", e.target.value)} placeholder="locataire@email.com" required />
          </Field>

          <Field label="Message d'accompagnement (optionnel)" hint="Quelques mots pour mettre votre locataire en confiance — affichés dans l'email d'invitation.">
            <textarea
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.55, padding: "10px 14px" }}
              rows={4}
              maxLength={800}
              value={form.messageProprio}
              onChange={e => update("messageProprio", e.target.value)}
              placeholder="Bonjour Marie, comme convenu je viens d'importer notre bail sur KeyMatch — tu pourras y récupérer tes quittances chaque mois. À très vite !"
            />
          </Field>

          {error && (
            <div style={{ background: km.errBg, border: `1px solid ${km.errLine}`, color: km.errText, padding: "10px 14px", borderRadius: 12, fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button type="button" onClick={() => router.push("/proprietaire")}
              style={{ background: "#F7F4EF", border: `1px solid ${T.line}`, color: T.ink, borderRadius: 999, padding: "12px 22px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}>
              Annuler
            </button>
            <button type="submit" disabled={submitting}
              style={{ background: submitting ? T.muted : T.ink, color: "#fff", border: "none", borderRadius: 999, padding: "12px 28px", fontSize: 12, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}>
              {submitting ? "Envoi…" : "Envoyer l'invitation"}
            </button>
          </div>
        </form>

        <p style={{ fontSize: 12, color: T.muted, textAlign: "center", margin: "20px 0 0", lineHeight: 1.6 }}>
          Le locataire reçoit un email avec un lien à usage unique. Tant qu'il n'a pas accepté, le bien n'est pas visible publiquement.
        </p>
      </div>
    </main>
  )
}
