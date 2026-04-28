"use client"
import { useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { supabase } from "../../lib/supabase"
import PhoneInput from "../components/PhoneInput"
import HelpIcon, { PhoneHelpContent } from "../components/ui/HelpIcon"

/**
 * Onglet Profil : photo avatar + bio publique + telephone (Paul 2026-04-27).
 * Le nom complet reste verrouille apres confirmation. Le telephone est
 * editable ici ET dans /dossier (meme colonne `profils.telephone`, source de
 * verite unique). User : "dans les parametres faut pouvoir mettre son numero
 * de tel cote proprio ou locataire" — section visible quel que soit le role.
 */
export default function OngletProfil() {
  const { data: session } = useSession()
  const [photo, setPhoto] = useState<string | null>(null)
  const [bio, setBio] = useState("")
  const [initialBio, setInitialBio] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  // Telephone — source de verite `profils.telephone` (Paul 2026-04-27).
  // Editable ici + dans /dossier, meme colonne donc cherche-cherche.
  const [telephone, setTelephone] = useState("")
  const [initialTel, setInitialTel] = useState("")
  const [savingTel, setSavingTel] = useState(false)
  const [savedTel, setSavedTel] = useState(false)
  const [telError, setTelError] = useState<string | null>(null)

  useEffect(() => {
    const email = session?.user?.email
    if (!email) return
    supabase.from("profils").select("photo_url_custom, bio_publique, telephone").eq("email", email).single().then(({ data, error }) => {
      if (error) {
        // Probable cause : migration 008 pas encore appliquée (colonnes absentes).
        setSaveError(
          error.message.includes("column") || error.code === "42703"
            ? "Configuration incomplète : la migration 008_parametres_profil_public.sql n'a pas été appliquée. Contactez un administrateur."
            : `Erreur de chargement : ${error.message}`
        )
        return
      }
      setPhoto(data?.photo_url_custom || null)
      setBio(data?.bio_publique || "")
      setInitialBio(data?.bio_publique || "")
      const tel = (data as { telephone?: string | null })?.telephone || ""
      setTelephone(tel)
      setInitialTel(tel)
    })
  }, [session?.user?.email])

  async function sauverTel() {
    const email = session?.user?.email
    if (!email) return
    setSavingTel(true)
    setTelError(null)
    const trimmed = telephone.trim().slice(0, 25)
    // V24.3 — via /api/profil/save
    let errMsg: string | null = null
    try {
      const res = await fetch("/api/profil/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telephone: trimmed || null }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) errMsg = json.error || res.statusText
    } catch (e) {
      errMsg = e instanceof Error ? e.message : "réseau"
    }
    setSavingTel(false)
    if (errMsg) {
      setTelError(`Enregistrement impossible : ${errMsg}`)
      return
    }
    setInitialTel(trimmed)
    setSavedTel(true)
    setTimeout(() => setSavedTel(false), 2400)
  }

  const currentPhotoSrc = photo || session?.user?.image || null
  const initial = (session?.user?.name || session?.user?.email || "?").slice(0, 1).toUpperCase()

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/account/avatar", { method: "POST", body: form })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setUploadError(json.error || "Upload échoué")
      } else {
        setPhoto(json.url)
      }
    } catch {
      setUploadError("Erreur réseau")
    }
    setUploading(false)
  }

  async function supprimerPhoto() {
    setUploading(true)
    setUploadError(null)
    try {
      const res = await fetch("/api/account/avatar", { method: "DELETE" })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setUploadError(json.error || "Suppression échouée")
      } else {
        setPhoto(null)
      }
    } catch {
      setUploadError("Erreur réseau")
    }
    setUploading(false)
  }

  async function sauverBio() {
    const email = session?.user?.email
    if (!email) return
    setSaving(true)
    setSaveError(null)
    const trimmed = bio.trim().slice(0, 300)
    // V24.3 — via /api/profil/save
    let errMsg: string | null = null
    try {
      const res = await fetch("/api/profil/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio_publique: trimmed || null }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) errMsg = json.error || res.statusText
    } catch (e) {
      errMsg = e instanceof Error ? e.message : "réseau"
    }
    setSaving(false)
    if (errMsg) {
      setSaveError(`Enregistrement impossible : ${errMsg}`)
      return
    }
    setInitialBio(trimmed)
    setSaved(true)
    setTimeout(() => setSaved(false), 2400)
  }

  const bioChanged = bio.trim() !== initialBio.trim()

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500&display=swap');`}</style>
      <section style={{ background: "white", border: "1px solid #EAE6DF", borderRadius: 20, padding: 28, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
        <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, letterSpacing: "-0.3px", color: "#111", margin: "0 0 6px" }}>Photo de profil</h2>
        <p style={{ fontSize: 13, color: "#8a8477", margin: "0 0 18px" }}>
          Visible dans vos messages et sur vos candidatures. JPEG, PNG ou WebP, 2 Mo max.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ width: 84, height: 84, borderRadius: "50%", background: "#F7F4EF", border: "1px solid #EAE6DF", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
            {currentPhotoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentPhotoSrc} alt="Photo de profil" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontSize: 34, fontWeight: 500, color: "#111" }}>{initial}</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} style={{ display: "none" }} />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              style={{ background: "#111", color: "white", border: "none", borderRadius: 999, padding: "10px 20px", fontWeight: 600, fontSize: 11, cursor: uploading ? "wait" : "pointer", fontFamily: "inherit", opacity: uploading ? 0.6 : 1, textTransform: "uppercase", letterSpacing: "0.3px" }}>
              {uploading ? "Envoi…" : photo ? "Remplacer" : "Téléverser une photo"}
            </button>
            {photo && (
              <button
                type="button"
                disabled={uploading}
                onClick={supprimerPhoto}
                style={{ background: "#F7F4EF", color: "#111", border: "1px solid #EAE6DF", borderRadius: 999, padding: "10px 20px", fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                {session?.user?.image ? "Utiliser ma photo Google" : "Supprimer la photo"}
              </button>
            )}
          </div>
        </div>
        {uploadError && <p style={{ color: "#b91c1c", fontSize: 13, margin: "12px 0 0", background: "#FEECEC", border: "1px solid #F4C9C9", borderRadius: 12, padding: "8px 12px" }}>{uploadError}</p>}
      </section>

      <section style={{ background: "white", border: "1px solid #EAE6DF", borderRadius: 20, padding: 28, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
        <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, letterSpacing: "-0.3px", color: "#111", margin: "0 0 6px" }}>Bio publique</h2>
        <p style={{ fontSize: 13, color: "#8a8477", margin: "0 0 14px" }}>
          Courte présentation visible par les propriétaires à qui vous candidatez. Facultative, 300 caractères max.
        </p>
        <textarea
          value={bio}
          onChange={e => setBio(e.target.value.slice(0, 300))}
          placeholder="Exemple : Jeune actif en CDI, passionné par la musique, à la recherche d'un logement calme proche des transports."
          rows={4}
          style={{ width: "100%", padding: "11px 14px", border: "1px solid #EAE6DF", borderRadius: 12, fontSize: 14, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box", lineHeight: 1.5, background: "#fff" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#8a8477" }}>{bio.length}/300</span>
          <button
            type="button"
            disabled={!bioChanged || saving}
            onClick={sauverBio}
            style={{ background: "#111", color: "white", border: "none", borderRadius: 999, padding: "10px 22px", fontWeight: 600, fontSize: 11, cursor: !bioChanged || saving ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: !bioChanged || saving ? 0.5 : 1, textTransform: "uppercase", letterSpacing: "0.3px", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {saving ? "Enregistrement…" : saved ? (
              <>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12"/></svg>
                Enregistré
              </>
            ) : "Enregistrer"}
          </button>
        </div>
        {saveError && (
          <p style={{ fontSize: 12, color: "#b91c1c", margin: "10px 0 0", background: "#FEECEC", border: "1px solid #F4C9C9", borderRadius: 12, padding: "8px 12px", lineHeight: 1.5 }}>{saveError}</p>
        )}
      </section>

      {/* Coordonnees — email + telephone rassembles dans une seule section
          (Paul 2026-04-27 v2). Avant : email dans OngletSecurite section
          Authentification, telephone ici. User : "rassembler email +
          telephone dans une seule section Coordonnees coherente". */}
      <section style={{ background: "white", border: "1px solid #EAE6DF", borderRadius: 20, padding: 28, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
        <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, letterSpacing: "-0.3px", color: "#111", margin: "0 0 6px" }}>Coordonnées</h2>
        <p style={{ fontSize: 13, color: "#8a8477", margin: "0 0 20px" }}>
          Email pour la connexion + téléphone pour les appels/visio dans la messagerie. Le téléphone n&apos;est jamais affiché publiquement.
        </p>

        {/* Adresse e-mail — read-only (changement bientot via flow re-verif) */}
        <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#111", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>
          Adresse e-mail
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 14px", border: "1px solid #EAE6DF", borderRadius: 12, background: "#F7F4EF", flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, color: "#111", fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 200px" }}>
            {session?.user?.email || "—"}
          </span>
          <button
            type="button"
            disabled
            title="Le changement d'adresse e-mail (avec re-verification) sera bientôt disponible."
            style={{ background: "white", border: "1px solid #EAE6DF", color: "#8a8477", borderRadius: 999, padding: "7px 16px", fontWeight: 600, fontSize: 11, cursor: "not-allowed", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px", flexShrink: 0 }}
          >
            Modifier · Bientôt
          </button>
        </div>

        <div style={{ height: 20 }} />

        <div style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#111", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 8 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            Numéro de téléphone
            <span style={{ fontWeight: 400, color: "#8a8477", textTransform: "none", letterSpacing: 0 }}>(recommandé)</span>
            <HelpIcon><PhoneHelpContent /></HelpIcon>
          </span>
        </div>

        <PhoneInput value={telephone} onChange={v => { setTelephone(v); if (telError) setTelError(null) }} placeholder="6 12 34 56 78" />

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button
            type="button"
            disabled={savingTel || telephone.trim() === initialTel.trim()}
            onClick={sauverTel}
            style={{ background: "#111", color: "white", border: "none", borderRadius: 999, padding: "10px 22px", fontWeight: 600, fontSize: 11, cursor: savingTel || telephone.trim() === initialTel.trim() ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: savingTel || telephone.trim() === initialTel.trim() ? 0.5 : 1, textTransform: "uppercase", letterSpacing: "0.3px", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {savingTel ? "Enregistrement…" : savedTel ? (
              <>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12"/></svg>
                Enregistré
              </>
            ) : "Enregistrer"}
          </button>
        </div>
        {telError && (
          <p style={{ fontSize: 12, color: "#b91c1c", margin: "10px 0 0", background: "#FEECEC", border: "1px solid #F4C9C9", borderRadius: 12, padding: "8px 12px", lineHeight: 1.5 }}>{telError}</p>
        )}
      </section>

      <section style={{ background: "#F7F4EF", border: "1px solid #EAE6DF", borderRadius: 16, padding: 18 }}>
        <p style={{ fontSize: 13, color: "#111", margin: 0, lineHeight: 1.6 }}>
          <strong>Prénom et nom</strong> sont verrouillés après confirmation pour garantir la cohérence avec votre pièce d&apos;identité et vos documents officiels (dossier, bail, état des lieux).
          {" "}
          <a href="/dossier" style={{ color: "#111", fontWeight: 600, textDecoration: "underline", textDecorationColor: "#EAE6DF", textUnderlineOffset: "3px" }}>Gérer mon dossier complet →</a>
        </p>
      </section>
    </div>
  )
}
