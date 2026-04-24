"use client"
import { useSession } from "next-auth/react"
import { useState, useRef, useEffect, ReactNode } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import { validateImage } from "../../../lib/fileValidation"
import { useResponsive } from "../../hooks/useResponsive"
import LocataireEmailField from "../../components/LocataireEmailField"
import CityAutocomplete from "../../components/CityAutocomplete"
import AddressAutocomplete from "../../components/AddressAutocomplete"
import Tooltip from "../../components/Tooltip"
import MarketRentHint from "./MarketRentHint"

import { Toggle, F } from "../../components/FormHelpers"
import { km, KMButton, KMButtonOutline, KMEyebrow, KMHeading } from "../../components/ui/km"
import { StepBar } from "../../components/ui/StepBar"
import Lightbox from "../../components/ui/Lightbox"
import ImageCropModal from "../../components/ui/ImageCropModal"

// ─── Draft storage (compat v1 — pas de bump pour préserver les brouillons) ──
const DRAFT_VERSION = 1
function draftStorageKey(email: string) {
  return `nestmatch:draftAnnonce:v${DRAFT_VERSION}:${email.toLowerCase()}`
}

// ─── Types partagés ────────────────────────────────────────────────────────
type AnnonceForm = {
  titre: string; ville: string; adresse: string; prix: string; charges: string; caution: string
  surface: string; pieces: string; chambres: string; etage: string; dpe: string
  dispo: string; statut: string; description: string; type_bien: string
  locataire_email: string; date_debut_bail: string; mensualite_credit: string; valeur_bien: string
  duree_credit: string; taxe_fonciere: string; assurance_pno: string; charges_copro_annuelles: string
  lat: number | null; lng: number | null
  // Critères candidats (handoff publish.jsx step 6) — non discriminants, servent au matching.
  min_revenus_ratio: number; garants_acceptes: string[]; profils_acceptes: string[]; message_proprietaire: string
}

const GARANTS_OPTIONS = ["Visale", "Garantme", "Parents CDI", "Caution bancaire", "Indifférent"] as const
const PROFILS_OPTIONS = ["CDI", "CDD", "Étudiant", "Fonctionnaire", "Freelance / Indépendant", "Retraité"] as const

type AnnonceToggles = {
  meuble: boolean; animaux: boolean; parking: boolean; cave: boolean
  fibre: boolean; balcon: boolean; terrasse: boolean; jardin: boolean; ascenseur: boolean
  localisation_exacte: boolean
}

// ─── Définition des étapes (source de vérité du wizard) ────────────────────
// 7 étapes, fidèle au handoff publish.jsx. Étape 6 « Critères » — slider
// ratio revenus + chips garants/profils + message candidats + disclaimer
// non-discrimination, non bloquante.
const STEPS = [
  { n: 1, label: "Nature",      eyebrow: "Étape 1 sur 7", title: "Quel bien voulez-vous publier ?", sub: "Le type de logement et son statut actuel." },
  { n: 2, label: "Adresse",     eyebrow: "Étape 2 sur 7", title: "Où se trouve-t-il ?",             sub: "Titre, ville et adresse — l'adresse précise reste privée par défaut." },
  { n: 3, label: "Dimensions",  eyebrow: "Étape 3 sur 7", title: "Ses caractéristiques",             sub: "Surface, pièces, chambres, étage et DPE." },
  { n: 4, label: "Équipements", eyebrow: "Étape 4 sur 7", title: "Ce qui le distingue",              sub: "Cochez les équipements présents. Plus c'est précis, mieux c'est matché." },
  { n: 5, label: "Récit",       eyebrow: "Étape 5 sur 7", title: "Donnez-lui vie",                   sub: "Photos et description. C'est ce qui déclenche le clic." },
  { n: 6, label: "Critères",    eyebrow: "Étape 6 sur 7", title: "Quel locataire recherchez-vous ?", sub: "Non discriminants — servent à prioriser les dossiers compatibles." },
  { n: 7, label: "Publier",     eyebrow: "Étape 7 sur 7", title: "Loyer et dernier regard",          sub: "Fixez le loyer, relisez l'ensemble, publiez." },
] as const

type StepNum = 1 | 2 | 3 | 4 | 5 | 6 | 7

const SEL_STATUT = [
  { v: "disponible", label: "Disponible — à louer" },
  { v: "loué",       label: "Déjà loué — gestion uniquement" },
  { v: "en visite",  label: "En cours de visite" },
  { v: "réservé",    label: "Réservé" },
] as const

export default function AjouterBien() {
  const { data: session } = useSession()
  const router = useRouter()
  const { isMobile } = useResponsive()

  const [step, setStep] = useState<StepNum>(1)
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [photos, setPhotos] = useState<string[]>([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<AnnonceForm>({
    titre: "", ville: "", adresse: "", prix: "", charges: "", caution: "",
    surface: "", pieces: "", chambres: "", etage: "", dpe: "C",
    dispo: "Disponible maintenant", statut: "disponible",
    description: "", type_bien: "Appartement",
    locataire_email: "", date_debut_bail: "", mensualite_credit: "", valeur_bien: "",
    duree_credit: "",
    taxe_fonciere: "", assurance_pno: "", charges_copro_annuelles: "",
    lat: null, lng: null,
    min_revenus_ratio: 3, garants_acceptes: ["Visale"], profils_acceptes: ["CDI", "Fonctionnaire"], message_proprietaire: "",
  })
  const [toggles, setToggles] = useState<AnnonceToggles>({
    meuble: false, animaux: false, parking: false, cave: false,
    fibre: false, balcon: false, terrasse: false, jardin: false, ascenseur: false,
    localisation_exacte: false,
  })

  // Draft localStorage : au mount, on propose la reprise si existant.
  const [draftPromptOpen, setDraftPromptOpen] = useState(false)
  const [draftLoadedAt, setDraftLoadedAt] = useState<string | null>(null)
  const [savedHint, setSavedHint] = useState(false)

  useEffect(() => {
    if (!session?.user?.email) return
    try {
      const raw = localStorage.getItem(draftStorageKey(session.user.email))
      if (!raw) return
      const draft = JSON.parse(raw)
      if (draft && draft.form && typeof draft.form.titre === "string") {
        setDraftLoadedAt(draft.savedAt || null)
        setDraftPromptOpen(true)
      }
    } catch { /* corrupted — ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email])

  // Auto-save debounced : form + toggles + photos + step (reprise à bonne étape).
  useEffect(() => {
    if (!session?.user?.email) return
    const hasContent = form.titre || form.ville || form.prix || form.description || photos.length > 0
    if (!hasContent) return
    const t = setTimeout(() => {
      try {
        const payload = { form, toggles, photos, step, savedAt: new Date().toISOString() }
        localStorage.setItem(draftStorageKey(session.user!.email!), JSON.stringify(payload))
        setSavedHint(true)
        setTimeout(() => setSavedHint(false), 1400)
      } catch { /* quota — silencieux */ }
    }, 900)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, toggles, photos, step, session?.user?.email])

  function restaurerBrouillon() {
    if (!session?.user?.email) return
    try {
      const raw = localStorage.getItem(draftStorageKey(session.user.email))
      if (!raw) { setDraftPromptOpen(false); return }
      const draft = JSON.parse(raw)
      if (draft.form) setForm((f) => ({ ...f, ...draft.form }))
      if (draft.toggles) setToggles((t) => ({ ...t, ...draft.toggles }))
      if (Array.isArray(draft.photos)) setPhotos(draft.photos)
      // Compat v1 : l'ancien draft n'avait pas de champ `step` — fallback 1.
      const parsedStep = Number(draft.step)
      if (parsedStep >= 1 && parsedStep <= STEPS.length) setStep(parsedStep as StepNum)
    } catch { /* noop */ }
    setDraftPromptOpen(false)
  }

  function repartirDeZero() {
    if (!session?.user?.email) return
    try { localStorage.removeItem(draftStorageKey(session.user.email)) } catch { /* noop */ }
    setDraftPromptOpen(false)
  }

  const set = (key: keyof AnnonceForm) => (e: { target: { value: string } }) =>
    setForm(f => ({ ...f, [key]: e.target.value }))
  const toInt = (v: string) => v ? parseInt(v) : null

  const dejaLoue = form.statut === "loué"

  async function uploadPhoto(file: File) {
    if (!session?.user?.email) return
    setUploadingPhoto(true)
    setPhotoError(null)

    const check = await validateImage(file)
    if (!check.ok) {
      setPhotoError(check.error)
      setUploadingPhoto(false)
      return
    }

    const fd = new FormData()
    fd.append("file", file)
    let json: { ok?: boolean; url?: string; error?: string } = {}
    try {
      const res = await fetch("/api/proprietaire/photo", { method: "POST", body: fd })
      json = await res.json()
      if (!res.ok || !json.ok || !json.url) {
        setPhotoError(json.error || "L'envoi de la photo a échoué, veuillez réessayer.")
        setUploadingPhoto(false)
        return
      }
    } catch {
      setPhotoError("L'envoi de la photo a échoué, veuillez réessayer.")
      setUploadingPhoto(false)
      return
    }
    setPhotos(prev => [...prev, json.url!])
    setUploadingPhoto(false)
  }

  function removePhoto(idx: number) {
    setPhotos(prev => prev.filter((_, i) => i !== idx))
  }

  async function publier() {
    try {
      if (!form.titre || !form.ville || !form.prix) {
        alert("Remplis au minimum le titre, la ville et le loyer.")
        return
      }
      if (form.titre.length > 120) {
        alert("Le titre doit faire 120 caractères maximum.")
        return
      }
      if ((form.description || "").length > 10000) {
        alert("La description doit faire 10 000 caractères maximum.")
        return
      }
      const prix = parseInt(form.prix || "0", 10) || 0
      if (prix <= 0 || prix > 50000) {
        alert("Le loyer doit être compris entre 1 et 50 000 €.")
        return
      }
      const surface = parseInt(form.surface || "0", 10) || 0
      if (surface < 0 || surface > 1000) {
        alert("La surface doit être comprise entre 0 et 1000 m².")
        return
      }
      setSaving(true)

      const data: Record<string, unknown> = {
        titre: form.titre, ville: form.ville, adresse: form.adresse,
        prix: toInt(form.prix), charges: toInt(form.charges), caution: toInt(form.caution),
        surface: toInt(form.surface), pieces: toInt(form.pieces), chambres: toInt(form.chambres),
        etage: form.etage, dpe: form.dpe, dispo: form.dispo, statut: form.statut,
        description: form.description, type_bien: form.type_bien,
        proprietaire: session?.user?.name, proprietaire_email: session?.user?.email,
        membre: "Membre depuis " + new Date().getFullYear(), verifie: true,
        photos: photos.length > 0 ? photos : null,
        lat: form.lat, lng: form.lng,
        // Critères candidats — handoff publish.jsx. Colonnes optionnelles :
        // fallback « sans ces cols » déclenché si la migration n'a pas tourné.
        min_revenus_ratio: form.min_revenus_ratio,
        garants_acceptes: form.garants_acceptes.length > 0 ? form.garants_acceptes : null,
        profils_acceptes: form.profils_acceptes.length > 0 ? form.profils_acceptes : null,
        message_proprietaire: form.message_proprietaire || null,
        ...toggles,
      }

      if (dejaLoue) {
        data.locataire_email = form.locataire_email ? form.locataire_email.trim().toLowerCase() : null
        data.date_debut_bail = form.date_debut_bail || null
        data.mensualite_credit = toInt(form.mensualite_credit)
        data.valeur_bien = toInt(form.valeur_bien)
        data.duree_credit = toInt(form.duree_credit)
        data.taxe_fonciere = toInt(form.taxe_fonciere)
        data.assurance_pno = toInt(form.assurance_pno)
        data.charges_copro_annuelles = toInt(form.charges_copro_annuelles)
      }

      Object.keys(data).forEach(k => { if (data[k] === null || data[k] === "") delete data[k] })

      // Fallback progressif si colonnes absentes (migration non lancée).
      // Ordre : (1) insert complet → (2) retry sans lat/lng → (3) retry sans
      // critères candidats (colonnes `min_revenus_ratio`, `garants_acceptes`,
      // `profils_acceptes`, `message_proprietaire` optionnelles).
      const { data: inserted, error: errIns } = await supabase.from("annonces").insert([data]).select("id")
      let error = errIns
      let insertedRows = inserted
      if (error && /lat|lng|column.*does not exist/i.test(error.message || "")) {
        const dataNoCoords = { ...data }
        delete dataNoCoords.lat
        delete dataNoCoords.lng
        const retry = await supabase.from("annonces").insert([dataNoCoords]).select("id")
        error = retry.error
        insertedRows = retry.data
      }
      if (error && /min_revenus_ratio|garants_acceptes|profils_acceptes|message_proprietaire|column.*does not exist/i.test(error.message || "")) {
        const dataNoCriteria = { ...data }
        delete dataNoCriteria.min_revenus_ratio
        delete dataNoCriteria.garants_acceptes
        delete dataNoCriteria.profils_acceptes
        delete dataNoCriteria.message_proprietaire
        delete dataNoCriteria.lat
        delete dataNoCriteria.lng
        const retry = await supabase.from("annonces").insert([dataNoCriteria]).select("id")
        error = retry.error
        insertedRows = retry.data
      }
      if (!error && insertedRows && insertedRows.length > 0) {
        await supabase.from("profils").upsert({
          email: session!.user!.email!,
          is_proprietaire: true,
        }, { onConflict: "email" })
        try { localStorage.removeItem(draftStorageKey(session!.user!.email!)) } catch { /* noop */ }
        router.push("/proprietaire")
      } else if (error) {
        console.error("[publier] insert error:", error)
        alert(`La publication a échoué : ${error.message || "erreur inconnue"}. Code : ${error.code || "?"}`)
      } else {
        alert(
          "La publication a échoué silencieusement : aucune ligne créée. " +
            "Contactez le support si le problème persiste.",
        )
      }
    } catch (err) {
      console.error("[publier] exception:", err)
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      alert(`Erreur inattendue lors de la publication :\n${msg}`)
    } finally {
      setSaving(false)
    }
  }

  // ─── Validation par étape — bloque « Suivant » si manquant ────────────────
  // Étape 6 (Critères) est volontairement non bloquante : tous les champs sont
  // optionnels conformément au handoff (disclaimer non-discrimination).
  const canAdvance = (() => {
    if (step === 2) return form.titre.trim().length > 0 && form.ville.trim().length > 0
    if (step === 7) return form.prix.trim().length > 0 && parseInt(form.prix, 10) > 0
    return true
  })()

  // Récap visuel étape 7 — checklist réutilisée pour aider le proprio.
  const checks = [
    { key: "titre",       label: "Titre",          ok: !!form.titre.trim(),                                        editStep: 2 as StepNum },
    { key: "type",        label: "Type de bien",   ok: !!form.type_bien,                                           editStep: 1 as StepNum },
    { key: "ville",       label: "Ville",          ok: !!form.ville,                                               editStep: 2 as StepNum },
    { key: "prix",        label: "Loyer",          ok: !!form.prix,                                                editStep: 7 as StepNum },
    { key: "surface",     label: "Surface",        ok: !!form.surface,                                             editStep: 3 as StepNum },
    { key: "pieces",      label: "Pièces",         ok: !!form.pieces,                                              editStep: 3 as StepNum },
    { key: "description", label: "Description",    ok: (form.description || "").trim().length >= 80,               editStep: 5 as StepNum },
    { key: "photos",      label: "Photos",         ok: photos.length >= 1,                                         editStep: 5 as StepNum },
    { key: "dpe",         label: "DPE",            ok: !!form.dpe,                                                 editStep: 1 as StepNum },
  ]
  const nOk = checks.filter(c => c.ok).length
  const completion = Math.round((nOk / checks.length) * 100)

  const current = STEPS.find(s => s.n === step)!

  return (
    <main style={{
      minHeight: "100vh",
      background: km.beige,
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
    }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: isMobile ? "24px 16px 48px" : "40px 48px 60px" }}>
        <a href="/proprietaire" style={{
          fontSize: 11, color: km.muted, textDecoration: "none",
          textTransform: "uppercase", letterSpacing: "1.2px", fontWeight: 700,
        }}>← Retour au dashboard</a>

        <div style={{ marginTop: 18, marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <KMEyebrow>Publication · Nouveau bien</KMEyebrow>
            {savedHint && (
              <span style={{
                fontSize: 10, fontWeight: 700, color: km.successText,
                textTransform: "uppercase", letterSpacing: "1.4px",
              }}>Brouillon sauvegardé</span>
            )}
          </div>
        </div>

        {draftPromptOpen && (
          <div style={{
            background: km.infoBg, border: `1px solid ${km.infoLine}`,
            borderRadius: 14, padding: "14px 18px", marginBottom: 20,
            display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap",
          }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: km.infoText, margin: 0 }}>Brouillon détecté</p>
              <p style={{ fontSize: 12, color: km.infoText, margin: "4px 0 0", lineHeight: 1.5 }}>
                Vous avez commencé à rédiger une annonce{draftLoadedAt ? ` le ${new Date(draftLoadedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}` : ""}. Voulez-vous la reprendre ?
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <KMButton onClick={restaurerBrouillon} size="sm">Reprendre</KMButton>
              <KMButtonOutline onClick={repartirDeZero} size="sm">Repartir de zéro</KMButtonOutline>
            </div>
          </div>
        )}

        <StepBar
          steps={STEPS.map(s => ({ n: s.n, label: s.label }))}
          current={step}
          isMobile={isMobile}
          onStepClick={(n) => setStep(n as StepNum)}
        />

        <KMEyebrow style={{ marginBottom: 10 }}>{current.eyebrow}</KMEyebrow>
        <KMHeading size={isMobile ? 28 : 36} style={{ marginBottom: 8 }}>{current.title}</KMHeading>
        <p style={{ fontSize: 14, color: km.muted, margin: "0 0 24px", lineHeight: 1.6 }}>{current.sub}</p>

        {/* Carte principale de l'étape */}
        <div style={{
          background: km.white, border: `1px solid ${km.line}`,
          borderRadius: 20, padding: isMobile ? "22px 18px" : "32px",
          marginBottom: 20, boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
        }}>
          {step === 1 && <Step1Nature form={form} setForm={setForm} isMobile={isMobile} />}
          {step === 2 && <Step2Adresse form={form} setForm={setForm} isMobile={isMobile} />}
          {step === 3 && <Step3Dimensions form={form} setForm={setForm} isMobile={isMobile} />}
          {step === 4 && <Step4Equipements toggles={toggles} setToggles={setToggles} isMobile={isMobile} />}
          {step === 5 && (
            <Step5Recit
              form={form}
              setForm={setForm}
              photos={photos}
              photoError={photoError}
              setPhotoError={setPhotoError}
              uploadingPhoto={uploadingPhoto}
              uploadPhoto={uploadPhoto}
              removePhoto={removePhoto}
              photoInputRef={photoInputRef}
            />
          )}
          {step === 6 && (
            <Step6Criteres form={form} setForm={setForm} isMobile={isMobile} />
          )}
          {step === 7 && (
            <Step7Publier
              form={form}
              setForm={setForm}
              toggles={toggles}
              setToggles={setToggles}
              photos={photos}
              checks={checks}
              completion={completion}
              goToStep={(n) => setStep(n)}
              dejaLoue={dejaLoue}
              isMobile={isMobile}
            />
          )}
        </div>

        {/* Navigation bas : Précédent / Suivant ou Publier */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <KMButtonOutline
            size="lg"
            onClick={() => step > 1 ? setStep((step - 1) as StepNum) : router.push("/proprietaire")}
            disabled={saving}
          >
            {step > 1 ? "← Précédent" : "Annuler"}
          </KMButtonOutline>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {step === 7 && (
              <KMButtonOutline
                onClick={() => setShowPreview(true)}
                disabled={!form.titre || !form.ville || !form.prix}
                size="lg"
              >
                Prévisualiser
              </KMButtonOutline>
            )}
            {step < STEPS.length ? (
              <KMButton
                size="lg"
                onClick={() => setStep((step + 1) as StepNum)}
                disabled={!canAdvance}
              >
                Suivant →
              </KMButton>
            ) : (
              <KMButton size="lg" onClick={publier} disabled={saving || !canAdvance}>
                {saving ? "Publication…" : dejaLoue ? "Enregistrer le bien" : "Publier l'annonce"}
              </KMButton>
            )}
          </div>
        </div>

        {/* Hint de validation si bouton grisé */}
        {!canAdvance && step === 2 && (
          <p style={{ fontSize: 12, color: km.errText, marginTop: 10, textAlign: "right" }}>
            Titre et ville sont requis pour continuer.
          </p>
        )}
        {!canAdvance && step === 7 && (
          <p style={{ fontSize: 12, color: km.errText, marginTop: 10, textAlign: "right" }}>
            Le loyer est requis pour publier.
          </p>
        )}

        {showPreview && (
          <PreviewModal form={form} toggles={toggles} photos={photos} onClose={() => setShowPreview(false)} />
        )}
      </div>
    </main>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers d'étapes — définis HORS du composant parent (convention CLAUDE.md :
// sinon les inputs perdent le focus à chaque render).
// ═══════════════════════════════════════════════════════════════════════════

const inp: React.CSSProperties = {
  width: "100%", padding: "12px 14px",
  border: `1px solid ${km.line}`, borderRadius: 12,
  fontSize: 15, outline: "none", boxSizing: "border-box",
  fontFamily: "inherit", background: km.white, color: km.ink,
}
const sel: React.CSSProperties = { ...inp, background: km.white }

function Grid2({ children, isMobile }: { children: ReactNode; isMobile: boolean }) {
  return <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>{children}</div>
}

// ─── Étape 1 — Nature ──────────────────────────────────────────────────────
function Step1Nature({
  form, setForm, isMobile,
}: {
  form: AnnonceForm
  setForm: React.Dispatch<React.SetStateAction<AnnonceForm>>
  isMobile: boolean
}) {
  const set = (key: keyof AnnonceForm) => (e: { target: { value: string } }) =>
    setForm(f => ({ ...f, [key]: e.target.value }))
  return (
    <Grid2 isMobile={isMobile}>
      <F l="Type de bien">
        <select style={sel} value={form.type_bien} onChange={set("type_bien")}>
          {["Appartement","Maison","Studio","Chambre","Colocation","Loft","Villa","Autre"].map(v => <option key={v}>{v}</option>)}
        </select>
      </F>
      <F l={<>Statut du bien <Tooltip text="« Déjà loué » crée le bien pour gestion (bail, quittances, EDL) sans le publier publiquement." /></>}>
        <select style={sel} value={form.statut} onChange={set("statut")}>
          {SEL_STATUT.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
        </select>
      </F>
    </Grid2>
  )
}

// ─── Étape 2 — Localisation ────────────────────────────────────────────────
function Step2Adresse({
  form, setForm, isMobile,
}: {
  form: AnnonceForm
  setForm: React.Dispatch<React.SetStateAction<AnnonceForm>>
  isMobile: boolean
}) {
  const set = (key: keyof AnnonceForm) => (e: { target: { value: string } }) =>
    setForm(f => ({ ...f, [key]: e.target.value }))
  return (
    <Grid2 isMobile={isMobile}>
      <F l="Titre de l'annonce">
        <input style={inp} value={form.titre} onChange={set("titre")} maxLength={120} placeholder="Ex : Bel appartement T2 lumineux" />
      </F>
      <F l="Ville">
        <CityAutocomplete value={form.ville} onChange={v => setForm(f => ({ ...f, ville: v }))} placeholder="Commencez à taper…" />
      </F>
      <F l={<>Adresse <Tooltip text="L'adresse reste privée par défaut. Vous pourrez exposer la position précise à l'étape 4." /></>}>
        <AddressAutocomplete
          value={form.adresse}
          onChange={v => setForm(f => ({ ...f, adresse: v }))}
          onSelect={a => {
            setForm(f => ({
              ...f,
              adresse: a.street || a.label,
              ville: a.city || f.ville,
              lat: a.lat,
              lng: a.lng,
            }))
          }}
          city={form.ville || undefined}
          placeholder="Ex : 6 rue de Rivoli"
        />
      </F>
      <F l="Disponible à partir du">
        <input
          type="date"
          style={inp}
          value={form.dispo && form.dispo !== "Disponible maintenant" && /^\d{4}-\d{2}-\d{2}$/.test(form.dispo) ? form.dispo : ""}
          min={new Date().toISOString().split("T")[0]}
          onChange={e => setForm(f => ({ ...f, dispo: e.target.value || "Disponible maintenant" }))}
        />
        <p style={{ fontSize: 11, color: km.muted, marginTop: 6 }}>
          Laisser vide = « Disponible maintenant ».
        </p>
      </F>
    </Grid2>
  )
}

// ─── Étape 3 — Dimensions ──────────────────────────────────────────────────
function Step3Dimensions({
  form, setForm, isMobile,
}: {
  form: AnnonceForm
  setForm: React.Dispatch<React.SetStateAction<AnnonceForm>>
  isMobile: boolean
}) {
  const set = (key: keyof AnnonceForm) => (e: { target: { value: string } }) =>
    setForm(f => ({ ...f, [key]: e.target.value }))
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 16 }}>
      <F l="Surface (m²)"><input style={inp} type="number" value={form.surface} onChange={set("surface")} placeholder="38" /></F>
      <F l="Pièces">
        <select style={sel} value={form.pieces} onChange={set("pieces")}>
          {["","1","2","3","4","5","6","7+"].map(v => <option key={v} value={v}>{v || "Sélectionner"}</option>)}
        </select>
      </F>
      <F l="Chambres">
        <select style={sel} value={form.chambres} onChange={set("chambres")}>
          {["","0","1","2","3","4","5+"].map(v => <option key={v} value={v}>{v === "" ? "Sélectionner" : v}</option>)}
        </select>
      </F>
      <F l="Étage">
        <select style={sel} value={form.etage} onChange={set("etage")}>
          {["","Rez-de-chaussée","1er","2e","3e","4e","5e","6e","7e","8e","9e","10e+"].map(v => <option key={v} value={v}>{v || "Sélectionner"}</option>)}
        </select>
      </F>
      <F l={<>DPE <Tooltip text="Le DPE est obligatoire depuis 2007. A = très économe, G = passoire thermique. Les logements F et G sont progressivement interdits à la location." /></>}>
        <select style={sel} value={form.dpe} onChange={set("dpe")}>
          {["A","B","C","D","E","F","G"].map(v => <option key={v}>{v}</option>)}
        </select>
      </F>
    </div>
  )
}

// ─── Étape 4 — Équipements ─────────────────────────────────────────────────
function Step4Equipements({
  toggles, setToggles, isMobile,
}: {
  toggles: AnnonceToggles
  setToggles: React.Dispatch<React.SetStateAction<AnnonceToggles>>
  isMobile: boolean
}) {
  return (
    <>
      <p style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 14px" }}>Équipements</p>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 4, marginBottom: 24 }}>
        <Toggle label="Meublé" k="meuble" toggles={toggles} setToggles={setToggles} />
        <Toggle label="Animaux acceptés" k="animaux" toggles={toggles} setToggles={setToggles} />
        <Toggle label="Parking" k="parking" toggles={toggles} setToggles={setToggles} />
        <Toggle label="Cave" k="cave" toggles={toggles} setToggles={setToggles} />
        <Toggle label="Fibre optique" k="fibre" toggles={toggles} setToggles={setToggles} />
        <Toggle label="Balcon" k="balcon" toggles={toggles} setToggles={setToggles} />
        <Toggle label="Terrasse" k="terrasse" toggles={toggles} setToggles={setToggles} />
        <Toggle label="Jardin" k="jardin" toggles={toggles} setToggles={setToggles} />
        <Toggle label="Ascenseur" k="ascenseur" toggles={toggles} setToggles={setToggles} />
      </div>

      <p style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 14px" }}>
        Confidentialité de la localisation
        {" "}<Tooltip text="Par défaut, un cercle de 400 m est affiché autour de la ville — votre adresse exacte reste privée. Activez uniquement si vous souhaitez exposer la position précise sur la carte publique." />
      </p>
      <Toggle label="Afficher la localisation exacte sur la carte publique" k="localisation_exacte" toggles={toggles} setToggles={setToggles} />
      <p style={{ fontSize: 12, color: km.muted, marginTop: 6, lineHeight: 1.5 }}>
        {toggles.localisation_exacte
          ? "Les visiteurs verront un marqueur précis à l'adresse du bien."
          : "Les visiteurs verront uniquement une zone approximative (cercle de 400 m). Recommandé."}
      </p>
    </>
  )
}

// ─── Étape 5 — Photos + description ────────────────────────────────────────
function Step5Recit({
  form, setForm, photos, photoError, setPhotoError, uploadingPhoto, uploadPhoto, removePhoto, photoInputRef,
}: {
  form: AnnonceForm
  setForm: React.Dispatch<React.SetStateAction<AnnonceForm>>
  photos: string[]
  photoError: string | null
  setPhotoError: (e: string | null) => void
  uploadingPhoto: boolean
  uploadPhoto: (f: File) => Promise<void>
  removePhoto: (idx: number) => void
  photoInputRef: React.RefObject<HTMLInputElement | null>
}) {
  const set = (key: keyof AnnonceForm) => (e: { target: { value: string } }) =>
    setForm(f => ({ ...f, [key]: e.target.value }))
  const descLen = (form.description || "").length
  const [lightbox, setLightbox] = useState<{ open: boolean; index: number }>({ open: false, index: 0 })
  // File d'attente pour crop : user peut sélectionner plusieurs fichiers,
  // on les traite 1 par 1. `cropFile` = fichier en cours de crop, `cropQueue`
  // = les suivants à traiter séquentiellement.
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [cropQueue, setCropQueue] = useState<File[]>([])

  async function handleFilesSelected(files: File[]) {
    if (files.length === 0) return
    setCropFile(files[0])
    setCropQueue(files.slice(1))
  }

  function advanceQueue() {
    setCropQueue(q => {
      if (q.length === 0) { setCropFile(null); return [] }
      setCropFile(q[0])
      return q.slice(1)
    })
  }

  async function onCropValidated(blob: Blob, originalName: string) {
    const ext = blob.type === "image/jpeg" ? ".jpg" : blob.type === "image/png" ? ".png" : ".jpg"
    const base = originalName.replace(/\.[^.]+$/, "")
    const file = new File([blob], `${base}-crop${ext}`, { type: blob.type })
    await uploadPhoto(file)
    advanceQueue()
  }

  async function onSkipCrop() {
    if (cropFile) await uploadPhoto(cropFile)
    advanceQueue()
  }

  function onCancelCrop() {
    // Annuler ne upload pas le fichier courant, mais poursuit la file
    advanceQueue()
  }

  return (
    <>
      <p style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 14px" }}>
        Photos — {photos.length}/10
      </p>

      {photoError && (
        <div style={{ background: km.errBg, border: `1px solid ${km.errLine}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontSize: 13, color: km.errText }}>{photoError}</p>
          <button type="button" aria-label="Fermer le message d'erreur" onClick={() => setPhotoError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: km.errText, fontSize: 18, lineHeight: 1, fontFamily: "inherit" }}>×</button>
        </div>
      )}

      {photos.length > 0 && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          {photos.map((url, idx) => (
            <div key={idx} style={{ position: "relative", width: 120, height: 90, borderRadius: 10, overflow: "hidden", border: `1px solid ${km.line}`, cursor: "zoom-in" }}
              onClick={() => setLightbox({ open: true, index: idx })}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Photo ${idx + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button onClick={(e) => { e.stopPropagation(); removePhoto(idx) }}
                aria-label={`Supprimer la photo ${idx + 1}`}
                style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: 22, height: 22, cursor: "pointer", color: km.white, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>
                ×
              </button>
              {idx === 0 && (
                <span style={{ position: "absolute", bottom: 4, left: 4, background: km.ink, color: km.white, fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.8px", pointerEvents: "none" }}>Principale</span>
              )}
            </div>
          ))}
        </div>
      )}

      <Lightbox
        photos={photos}
        initialIndex={lightbox.index}
        open={lightbox.open}
        onClose={() => setLightbox(s => ({ ...s, open: false }))}
      />

      <input
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        multiple
        style={{ display: "none" }}
        ref={photoInputRef}
        onChange={e => {
          const files = Array.from(e.target.files || [])
          handleFilesSelected(files)
          e.target.value = ""
        }}
      />
      <button
        onClick={() => photoInputRef.current?.click()}
        disabled={uploadingPhoto}
        style={{
          display: "flex", alignItems: "center", gap: 10, padding: "12px 20px",
          border: `1px dashed ${km.line}`, borderRadius: 12,
          background: "transparent", cursor: uploadingPhoto ? "not-allowed" : "pointer",
          fontFamily: "inherit", fontSize: 14, fontWeight: 600, color: km.muted,
          opacity: uploadingPhoto ? 0.6 : 1,
        }}>
        {uploadingPhoto ? <span>Upload en cours…</span> : <><span style={{ fontSize: 20 }}>+</span><span>Ajouter des photos (JPG, PNG)</span></>}
      </button>
      <p style={{ fontSize: 12, color: km.muted, marginTop: 8 }}>
        La première photo sera la photo principale. Après sélection, vous pourrez recadrer chaque image (4:3 recommandé).
      </p>

      <ImageCropModal
        file={cropFile}
        onCancel={onCancelCrop}
        onCropped={onCropValidated}
        onSkipCrop={onSkipCrop}
        defaultRatio={4 / 3}
      />

      <div style={{ borderTop: `1px solid ${km.beige}`, paddingTop: 22, marginTop: 28 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 14px" }}>Description</p>
        <textarea
          style={{ ...inp, minHeight: 140, resize: "vertical" }}
          value={form.description}
          onChange={set("description")}
          maxLength={10000}
          placeholder="Décrivez votre bien : luminosité, quartier, transports, atouts spécifiques…"
        />
        <p style={{ fontSize: 11, color: descLen >= 80 ? km.successText : km.muted, marginTop: 8, textTransform: "uppercase", letterSpacing: "1.2px", fontWeight: 700 }}>
          {descLen} / 80 caractères minimum recommandés
        </p>
      </div>
    </>
  )
}

// ─── Étape 6 — Critères candidats (handoff publish.jsx) ────────────────────
// Non discriminants : servent au matching. Slider ratio revenus 2×-4×,
// chips garants + profils multi-select, message visible en haut de l'annonce,
// disclaimer non-discrimination permanent.
function Step6Criteres({
  form, setForm, isMobile,
}: {
  form: AnnonceForm
  setForm: React.Dispatch<React.SetStateAction<AnnonceForm>>
  isMobile: boolean
}) {
  const loyer = parseInt(form.prix || "0", 10) || 1000
  const minIncome = Math.round(loyer * form.min_revenus_ratio)
  const toggleArr = (key: "garants_acceptes" | "profils_acceptes", val: string) => {
    setForm(f => {
      const has = f[key].includes(val)
      return { ...f, [key]: has ? f[key].filter(v => v !== val) : [...f[key], val] }
    })
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{
        padding: "14px 18px", background: km.infoBg, border: `1px solid ${km.infoLine}`,
        borderRadius: 14, fontSize: 12.5, color: km.infoText, lineHeight: 1.6,
      }}>
        Ces critères ne sont <strong>pas discriminants</strong> — ils nous aident simplement à calculer le score de match et à prioriser les dossiers compatibles.
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: km.ink, textTransform: "uppercase", letterSpacing: "1.2px" }}>Ratio revenus / loyer minimum</span>
          <span style={{ fontSize: 11, color: km.muted }}>
            {form.min_revenus_ratio.toFixed(1).replace(/\.0$/, "")}× le loyer — soit {minIncome.toLocaleString("fr-FR")} €/mois net
          </span>
        </div>
        <input
          type="range"
          min={2}
          max={4}
          step={0.5}
          value={form.min_revenus_ratio}
          onChange={(e) => setForm(f => ({ ...f, min_revenus_ratio: parseFloat(e.target.value) }))}
          style={{ width: "100%", accentColor: km.ink }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: km.muted, marginTop: 6 }}>
          <span>2×</span><span>2,5×</span><span>3× (standard)</span><span>3,5×</span><span>4×</span>
        </div>
      </div>

      <div>
        <p style={{ fontSize: 12, fontWeight: 700, color: km.ink, textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 10px" }}>Garants acceptés</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {GARANTS_OPTIONS.map(g => {
            const active = form.garants_acceptes.includes(g)
            return (
              <button
                key={g}
                type="button"
                onClick={() => toggleArr("garants_acceptes", g)}
                style={{
                  padding: "9px 16px", borderRadius: 999, fontFamily: "inherit", fontSize: 12.5, fontWeight: 500, cursor: "pointer",
                  border: `1.5px solid ${active ? km.ink : km.line}`,
                  background: active ? km.ink : km.white,
                  color: active ? km.white : km.ink,
                }}
              >{g}</button>
            )
          })}
        </div>
      </div>

      <div>
        <p style={{ fontSize: 12, fontWeight: 700, color: km.ink, textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 10px" }}>Profils professionnels</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {PROFILS_OPTIONS.map(p => {
            const active = form.profils_acceptes.includes(p)
            return (
              <button
                key={p}
                type="button"
                onClick={() => toggleArr("profils_acceptes", p)}
                style={{
                  padding: "9px 16px", borderRadius: 999, fontFamily: "inherit", fontSize: 12.5, fontWeight: 500, cursor: "pointer",
                  border: `1.5px solid ${active ? km.ink : km.line}`,
                  background: active ? km.ink : km.white,
                  color: active ? km.white : km.ink,
                }}
              >{p}</button>
            )
          })}
        </div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: km.ink, textTransform: "uppercase", letterSpacing: "1.2px" }}>Message aux candidats (optionnel)</span>
          <span style={{ fontSize: 11, color: km.muted }}>{form.message_proprietaire.length}/500 — visible en haut de l'annonce</span>
        </div>
        <textarea
          style={{ ...inp, minHeight: 96, resize: "vertical" }}
          value={form.message_proprietaire}
          onChange={(e) => setForm(f => ({ ...f, message_proprietaire: e.target.value.slice(0, 500) }))}
          placeholder="Bonjour ! Je cherche un locataire calme et sérieux…"
          rows={3}
        />
      </div>

      <p style={{ fontSize: 11, color: km.muted, lineHeight: 1.5, margin: 0, fontStyle: "italic" }}>
        La loi française interdit toute discrimination sur l'origine, le sexe, la situation familiale, l'apparence, le handicap, les opinions politiques ou religieuses, l'orientation sexuelle, l'âge ou le patronyme{isMobile ? "." : " (article 1er loi 2002-73)."}
      </p>
    </div>
  )
}

// ─── Étape 7 — Conditions + récap + publication ────────────────────────────
function Step7Publier({
  form, setForm, toggles, setToggles, photos, checks, completion, goToStep, dejaLoue, isMobile,
}: {
  form: AnnonceForm
  setForm: React.Dispatch<React.SetStateAction<AnnonceForm>>
  toggles: AnnonceToggles
  setToggles: React.Dispatch<React.SetStateAction<AnnonceToggles>>
  photos: string[]
  checks: Array<{ key: string; label: string; ok: boolean; editStep: StepNum }>
  completion: number
  goToStep: (n: StepNum) => void
  dejaLoue: boolean
  isMobile: boolean
}) {
  const set = (key: keyof AnnonceForm) => (e: { target: { value: string } }) =>
    setForm(f => ({ ...f, [key]: e.target.value }))
  return (
    <>
      <p style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 14px" }}>Loyer & charges</p>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 16 }}>
        <F l="Loyer mensuel (€)"><input style={inp} type="number" value={form.prix} onChange={set("prix")} placeholder="1100" /></F>
        <F l="Charges (€/mois)"><input style={inp} type="number" value={form.charges} onChange={set("charges")} placeholder="80" /></F>
        <F l="Dépôt de garantie (€)"><input style={inp} type="number" value={form.caution} onChange={set("caution")} placeholder="1100" /></F>
      </div>
      <MarketRentHint ville={form.ville} surface={form.surface} pieces={form.pieces} prix={form.prix} />

      {/* Bloc gestion locative si statut = déjà loué */}
      {dejaLoue && (
        <div style={{ borderTop: `1px solid ${km.beige}`, paddingTop: 22, marginTop: 28 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 14px" }}>
            Gestion locative en cours
          </p>
          <div style={{ background: km.successBg, border: `1px solid ${km.successLine}`, borderRadius: 12, padding: "12px 16px", marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: km.successText, fontWeight: 600 }}>
              Ce bien sera géré dans votre dashboard mais n'apparaîtra pas dans les annonces publiques.
            </p>
          </div>
          <div style={{ marginBottom: 20 }}>
            <LocataireEmailField value={form.locataire_email} onChange={v => setForm(f => ({ ...f, locataire_email: v }))} inputStyle={inp} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            <F l="Date de début du bail"><input style={inp} value={form.date_debut_bail} onChange={set("date_debut_bail")} type="date" /></F>
            <F l="Mensualité crédit (€)"><input style={inp} value={form.mensualite_credit} onChange={set("mensualite_credit")} type="number" placeholder="800" /></F>
            <F l="Durée du crédit (mois)"><input style={inp} value={form.duree_credit} onChange={set("duree_credit")} type="number" placeholder="240" /></F>
            <F l="Valeur estimée du bien (€)"><input style={inp} value={form.valeur_bien} onChange={set("valeur_bien")} type="number" placeholder="250000" /></F>
          </div>
          <div style={{ borderTop: `1px solid ${km.beige}`, paddingTop: 20, marginTop: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, marginBottom: 12, color: km.ink, textTransform: "uppercase", letterSpacing: "1.2px" }}>Charges annuelles du propriétaire</p>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
              <F l="Taxe foncière (€/an)"><input style={inp} value={form.taxe_fonciere} onChange={set("taxe_fonciere")} type="number" placeholder="1200" /></F>
              <F l="Assurance PNO (€/an)"><input style={inp} value={form.assurance_pno} onChange={set("assurance_pno")} type="number" placeholder="350" /></F>
              <F l="Charges copro non recup. (€/an)"><input style={inp} value={form.charges_copro_annuelles} onChange={set("charges_copro_annuelles")} type="number" placeholder="600" /></F>
            </div>
          </div>
        </div>
      )}

      {/* Récap visuel — checklist complétude avec lien « Modifier » vers l'étape */}
      <div style={{ borderTop: `1px solid ${km.beige}`, paddingTop: 22, marginTop: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: 0 }}>
            Dernier regard · {completion}% complet
          </p>
          <span style={{ fontSize: 11, color: completion === 100 ? km.successText : km.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px" }}>
            {completion === 100 ? "Annonce complète" : `${checks.filter(c => !c.ok).length} éléments manquants`}
          </span>
        </div>
        <div style={{ height: 4, background: km.line, borderRadius: 999, overflow: "hidden", marginBottom: 18 }}>
          <div style={{ width: `${completion}%`, height: "100%", background: completion === 100 ? km.successText : km.ink, transition: "width 320ms cubic-bezier(0.4,0,0.2,1)" }} />
        </div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
          {checks.map(c => (
            <li key={c.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 12px", background: km.beige, borderRadius: 10 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span
                  aria-hidden
                  style={{
                    width: 16, height: 16, borderRadius: "50%",
                    background: c.ok ? km.successText : km.line,
                    color: km.white,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {c.ok && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                </span>
                <span style={{ fontSize: 13, color: km.ink, fontWeight: 500 }}>{c.label}</span>
              </span>
              {!c.ok && (
                <button
                  type="button"
                  onClick={() => goToStep(c.editStep)}
                  style={{ background: "transparent", border: "none", color: km.ink, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3, fontFamily: "inherit" }}
                >
                  Modifier
                </button>
              )}
            </li>
          ))}
        </ul>

        {toggles.localisation_exacte && (
          <p style={{ fontSize: 12, color: km.warnText, marginTop: 14, lineHeight: 1.5 }}>
            La localisation exacte sera visible publiquement sur la carte. Modifiable à l'étape 4.
          </p>
        )}
      </div>
    </>
  )
}

// ─── Modal de prévisualisation (inchangée, migrée aux tokens km) ───────────
function PreviewModal({ form, toggles, photos, onClose }: { form: AnnonceForm; toggles: AnnonceToggles; photos: string[]; onClose: () => void }) {
  const loyerTotal = (parseInt(form.prix || "0", 10) || 0) + (parseInt(form.charges || "0", 10) || 0)
  const [lightbox, setLightbox] = useState<{ open: boolean; index: number }>({ open: false, index: 0 })
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflow: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: km.white, borderRadius: 20, width: "min(720px, 100%)", maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)", fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
        <div style={{ position: "sticky", top: 0, background: km.white, padding: "18px 24px", borderBottom: `1px solid ${km.beige}`, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 1 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: 0 }}>Aperçu de votre annonce</p>
          <button type="button" aria-label="Fermer l'aperçu" onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: km.muted, padding: 0, lineHeight: 1, fontFamily: "inherit" }}>×</button>
        </div>
        <div style={{ padding: "20px 24px" }}>
          {photos.length > 0 ? (
            <div
              onClick={() => setLightbox({ open: true, index: 0 })}
              style={{ height: 280, background: `url(${photos[0]}) center/cover no-repeat`, borderRadius: 14, marginBottom: 18, cursor: "zoom-in" }}
              role="button"
              aria-label="Agrandir la photo principale"
            />
          ) : (
            <div style={{ height: 280, background: `linear-gradient(135deg, ${km.beige}, ${km.line})`, borderRadius: 14, marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "center", color: km.muted, fontSize: 13 }}>
              Aucune photo — ajoutez-en pour maximiser l&apos;intérêt
            </div>
          )}
          <KMHeading as="h2" size={24} style={{ marginBottom: 6 }}>{form.titre || "Titre de l'annonce"}</KMHeading>
          <p style={{ fontSize: 14, color: km.muted, margin: "0 0 14px" }}>
            {form.adresse && toggles.localisation_exacte ? `${form.adresse} · ` : ""}{form.ville}
          </p>
          <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap", fontSize: 14, color: km.ink }}>
            {form.surface && <span><strong>{form.surface} m²</strong></span>}
            {form.pieces && <span><strong>{form.pieces}</strong> pièces</span>}
            {form.chambres && <span><strong>{form.chambres}</strong> chambres</span>}
            {form.dpe && <span>DPE <strong>{form.dpe}</strong></span>}
            {form.type_bien && <span style={{ color: km.muted }}>{form.type_bien}</span>}
          </div>
          <div style={{ background: km.beige, borderRadius: 12, padding: "14px 18px", marginBottom: 18 }}>
            <p style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>{loyerTotal} €<span style={{ fontSize: 14, color: km.muted, fontWeight: 500 }}> / mois</span></p>
            {form.charges && <p style={{ fontSize: 12, color: km.muted, margin: "4px 0 0" }}>dont {form.charges} € de charges</p>}
          </div>
          {form.description && (
            <div style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 10px" }}>Description</p>
              <p style={{ fontSize: 14, color: "#3f3c37", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{form.description}</p>
            </div>
          )}
          <p style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 10px" }}>Équipements</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
            {Object.entries(toggles).filter(([, v]) => v).map(([k]) => (
              <span key={k} style={{ background: km.successBg, color: km.successText, padding: "4px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", border: `1px solid ${km.successLine}` }}>{k.replace(/_/g, " ")}</span>
            ))}
            {Object.entries(toggles).filter(([, v]) => v).length === 0 && (
              <span style={{ fontSize: 13, color: km.muted }}>Aucun équipement coché.</span>
            )}
          </div>
          <p style={{ fontSize: 11, color: km.muted, textAlign: "center", margin: "20px 0 0", textTransform: "uppercase", letterSpacing: "1.2px", fontWeight: 600 }}>
            Aperçu indicatif — le rendu public peut légèrement varier.
          </p>
        </div>
      </div>
      <Lightbox
        photos={photos}
        initialIndex={lightbox.index}
        open={lightbox.open}
        onClose={() => setLightbox(s => ({ ...s, open: false }))}
      />
    </div>
  )
}
