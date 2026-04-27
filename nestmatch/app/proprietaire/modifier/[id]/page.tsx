"use client"
import { useSession } from "next-auth/react"
import { useState, useRef, useEffect } from "react"
import dynamic from "next/dynamic"
import { useRouter, useParams } from "next/navigation"
import { supabase } from "../../../../lib/supabase"
import { validateImage } from "../../../../lib/fileValidation"
import { useResponsive } from "../../../hooks/useResponsive"
import LocataireEmailField from "../../../components/LocataireEmailField"
import CityAutocomplete from "../../../components/CityAutocomplete"
import AddressAutocomplete from "../../../components/AddressAutocomplete"
import Tooltip from "../../../components/Tooltip"

import { Toggle, Sec, F } from "../../../components/FormHelpers"
import Lightbox from "../../../components/ui/Lightbox"

// ImageCropModal lazy : embarque react-easy-crop (~50 kB minified). La modale
// n'apparaît qu'au clic sur "recadrer" → évite de le charger d'emblée.
// Audit perf #3.
const ImageCropModal = dynamic(() => import("../../../components/ui/ImageCropModal"), {
  ssr: false,
})

// R10.6 — tri-state côté propriétaire (Indifférent / Oui / Non).
type TriPolitique = "indifferent" | "oui" | "non"

// R10.6 — étages courants (pills) + saisie libre acceptée.
const ETAGES_COMMUNS = ["Sous-sol", "Rez-de-chaussée", "1er", "2e", "3e", "4e", "5e", "6e", "7e+"] as const
// R10.6 — DPE : pills A-G + « Non renseigné ». Saisie libre si valeur non standard.
const DPE_VALUES = ["A", "B", "C", "D", "E", "F", "G", "Non renseigné"] as const

// R10.6 — équipements étendus (stockés dans jsonb equipements_extras).
// Source unique de vérité partagée — cf lib/equipements.ts
import { EQUIP_EXTRAS_GROUPS } from "../../../../lib/equipements"

export default function ModifierBien() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { isMobile } = useResponsive()
  const params = useParams()
  const bienId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [photos, setPhotos] = useState<string[]>([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  // Toggle "Améliorer auto" — Paul 2026-04-27. Default ON. Cf /ajouter.
  const [enhancePhotos, setEnhancePhotos] = useState(true)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    titre: "", ville: "", adresse: "", prix: "", charges: "", caution: "",
    surface: "", pieces: "", chambres: "", etage: "", dpe: "C",
    dispo: "Disponible maintenant", statut: "disponible",
    description: "", type_bien: "Appartement",
    locataire_email: "", date_debut_bail: "", mensualite_credit: "", valeur_bien: "", duree_credit: "",
    taxe_fonciere: "", assurance_pno: "", charges_copro_annuelles: "",
    lat: null as number | null, lng: null as number | null,
    // R10.6 — critères candidats v2 (non discriminants, bonus matching).
    age_min: "", age_max: "", max_occupants: "",
    animaux_politique: "indifferent" as TriPolitique,
    fumeur_politique: "indifferent" as TriPolitique,
  })
  const [toggles, setToggles] = useState({
    meuble: false, animaux: false, parking: false, cave: false,
    fibre: false, balcon: false, terrasse: false, jardin: false, ascenseur: false,
    localisation_exacte: false,
  })
  // is_test : flag de modération vitrine publique. Si true, l'annonce est
  // masquée des pages publiques (accueil, /annonces, /location/X, sitemap,
  // OG, agent IA) mais reste visible/éditable côté proprio (cette page,
  // /proprietaire, /proprietaire/stats). Migration `annonces.is_test`
  // appliquée 2026-04-26.
  const [isTest, setIsTest] = useState(false)
  // R10.6 — équipements étendus jsonb (indépendants des colonnes boolean historiques).
  const [equipExtras, setEquipExtras] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/auth"); return }
    if (session?.user?.email && bienId) loadBien()
  }, [session, status, bienId])

  async function loadBien() {
    // Admin peut éditer n'importe quelle annonce ; proprio ne peut éditer que les siennes
    const isAdmin = session?.user?.isAdmin === true
    let query = supabase.from("annonces").select("*").eq("id", bienId)
    if (!isAdmin) {
      query = query.eq("proprietaire_email", session!.user!.email!)
    }
    const { data, error } = await query.single()

    if (error || !data) { setNotFound(true); setLoading(false); return }

    setForm({
      titre: data.titre || "",
      ville: data.ville || "",
      adresse: data.adresse || "",
      prix: data.prix ? String(data.prix) : "",
      charges: data.charges ? String(data.charges) : "",
      caution: data.caution ? String(data.caution) : "",
      surface: data.surface ? String(data.surface) : "",
      pieces: data.pieces ? String(data.pieces) : "",
      chambres: data.chambres !== null && data.chambres !== undefined ? String(data.chambres) : "",
      etage: data.etage || "",
      dpe: data.dpe || "C",
      dispo: data.dispo || "Disponible maintenant",
      statut: data.statut || "disponible",
      description: data.description || "",
      type_bien: data.type_bien || "Appartement",
      locataire_email: data.locataire_email || "",
      date_debut_bail: data.date_debut_bail || "",
      mensualite_credit: data.mensualite_credit ? String(data.mensualite_credit) : "",
      valeur_bien: data.valeur_bien ? String(data.valeur_bien) : "",
      duree_credit: data.duree_credit ? String(data.duree_credit) : "",
      taxe_fonciere: data.taxe_fonciere ? String(data.taxe_fonciere) : "",
      assurance_pno: data.assurance_pno ? String(data.assurance_pno) : "",
      charges_copro_annuelles: data.charges_copro_annuelles ? String(data.charges_copro_annuelles) : "",
      lat: typeof data.lat === "number" ? data.lat : null,
      lng: typeof data.lng === "number" ? data.lng : null,
      age_min: data.age_min != null ? String(data.age_min) : "",
      age_max: data.age_max != null ? String(data.age_max) : "",
      max_occupants: data.max_occupants != null ? String(data.max_occupants) : "",
      animaux_politique: (["oui", "non", "indifferent"].includes(data.animaux_politique)
        ? data.animaux_politique
        : "indifferent") as TriPolitique,
      fumeur_politique: (["oui", "non", "indifferent"].includes(data.fumeur_politique)
        ? data.fumeur_politique
        : "indifferent") as TriPolitique,
    })
    setToggles({
      meuble: !!data.meuble, animaux: !!data.animaux, parking: !!data.parking,
      cave: !!data.cave, fibre: !!data.fibre, balcon: !!data.balcon,
      terrasse: !!data.terrasse, jardin: !!data.jardin, ascenseur: !!data.ascenseur,
      localisation_exacte: !!data.localisation_exacte,
    })
    setIsTest(!!data.is_test)
    // R10.6 — équipements jsonb (si colonne absente en DB, reste vide sans casser).
    if (data.equipements_extras && typeof data.equipements_extras === "object") {
      setEquipExtras(data.equipements_extras as Record<string, boolean>)
    }
    if (Array.isArray(data.photos)) setPhotos(data.photos)
    setLoading(false)
  }

  const set = (key: string) => (e: any) => setForm(f => ({ ...f, [key]: e.target.value }))
  const toInt = (v: string) => v ? parseInt(v) : null
  const inp: any = { width: "100%", padding: "11px 14px", border: "1px solid #EAE6DF", borderRadius: 10, fontSize: 16, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }
  const sel: any = { ...inp, background: "white" }
  const dejaLoue = form.statut === "loué"

  // Verrou synchrone anti double-click — meme pattern que /proprietaire/ajouter
  // (Paul 2026-04-27). Defense en profondeur en plus du verrou ImageCropModal.
  const uploadingRef = useRef(false)

  async function uploadPhoto(file: File) {
    if (!session?.user?.email) return
    if (uploadingRef.current) return
    uploadingRef.current = true
    setUploadingPhoto(true)
    setPhotoError(null)

    const check = await validateImage(file)
    if (!check.ok) {
      setPhotoError(check.error)
      setUploadingPhoto(false)
      uploadingRef.current = false
      return
    }

    // Passe par l'API serveur : strip EXIF/GPS + resize + re-encode JPEG.
    const fd = new FormData()
    fd.append("file", file)
    fd.append("enhance", enhancePhotos ? "true" : "false")
    let json: { ok?: boolean; url?: string; error?: string } = {}
    try {
      const res = await fetch("/api/proprietaire/photo", { method: "POST", body: fd })
      json = await res.json()
      if (!res.ok || !json.ok || !json.url) {
        setPhotoError(json.error || "L'envoi de la photo a échoué, veuillez réessayer.")
        setUploadingPhoto(false)
        uploadingRef.current = false
        return
      }
    } catch {
      setPhotoError("L'envoi de la photo a échoué, veuillez réessayer.")
      setUploadingPhoto(false)
      uploadingRef.current = false
      return
    }
    // De-dup paranoia : eviter d'ajouter 2x la meme URL (race conditions).
    setPhotos(prev => prev.includes(json.url!) ? prev : [...prev, json.url!])
    setUploadingPhoto(false)
    uploadingRef.current = false
  }

  function removePhoto(idx: number) {
    setPhotos(prev => prev.filter((_, i) => i !== idx))
  }

  // Crop upload queue (R10.5) : traite les fichiers sélectionnés 1 par 1,
  // chaque un passant par ImageCropModal avant l'upload.
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [cropQueue, setCropQueue] = useState<File[]>([])
  const [lightbox, setLightbox] = useState<{ open: boolean; index: number }>({ open: false, index: 0 })

  function advanceCropQueue() {
    setCropQueue(q => {
      if (q.length === 0) { setCropFile(null); return [] }
      setCropFile(q[0])
      return q.slice(1)
    })
  }

  async function onCropValidated(blob: Blob, originalName: string) {
    const ext = blob.type === "image/jpeg" ? ".jpg" : blob.type === "image/png" ? ".png" : ".jpg"
    const base = originalName.replace(/\.[^.]+$/, "")
    const croppedFile = new File([blob], `${base}-crop${ext}`, { type: blob.type })
    await uploadPhoto(croppedFile)
    advanceCropQueue()
  }

  async function onSkipCrop() {
    if (cropFile) await uploadPhoto(cropFile)
    advanceCropQueue()
  }

  function onCancelCrop() {
    advanceCropQueue()
  }

  async function sauvegarder() {
    if (!form.titre || !form.ville || !form.prix) { alert("Remplis au minimum le titre, la ville et le loyer."); return }
    if (form.titre.length > 120) { alert("Le titre doit faire 120 caractères maximum."); return }
    if ((form.description || "").length > 10000) { alert("La description doit faire 10 000 caractères maximum."); return }
    const prix = parseInt(form.prix || "0", 10) || 0
    if (prix <= 0 || prix > 50000) { alert("Le loyer doit être compris entre 1 et 50 000 €."); return }
    const surface = parseInt(form.surface || "0", 10) || 0
    if (surface < 0 || surface > 1000) { alert("La surface doit être comprise entre 0 et 1000 m²."); return }
    if (dejaLoue && form.locataire_email) {
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRe.test(form.locataire_email.trim())) {
        alert("L'email du locataire n'est pas valide.")
        return
      }
      if (form.locataire_email.trim().toLowerCase() === (session?.user?.email || "").toLowerCase()) {
        alert("L'email du locataire ne peut pas être le vôtre.")
        return
      }
    }
    setSaving(true)

    const updates: any = {
      titre: form.titre, ville: form.ville, adresse: form.adresse,
      prix: toInt(form.prix), charges: toInt(form.charges), caution: toInt(form.caution),
      surface: toInt(form.surface), pieces: toInt(form.pieces), chambres: toInt(form.chambres),
      etage: form.etage || null, dpe: form.dpe, dispo: form.dispo, statut: form.statut,
      description: form.description, type_bien: form.type_bien,
      photos: photos.length > 0 ? photos : null,
      lat: form.lat, lng: form.lng,
      is_test: isTest,
      // R10.6 — critères candidats v2 (fallback si migration 025 pas appliquée).
      age_min: toInt(form.age_min),
      age_max: toInt(form.age_max),
      max_occupants: toInt(form.max_occupants),
      animaux_politique: form.animaux_politique === "indifferent" ? null : form.animaux_politique,
      fumeur_politique: form.fumeur_politique === "indifferent" ? null : form.fumeur_politique,
      equipements_extras: Object.keys(equipExtras).length > 0 ? equipExtras : null,
      ...toggles,
    }
    // R10.6 — dérive la colonne legacy boolean `animaux` de la politique tri-state.
    if (form.animaux_politique === "oui") updates.animaux = true
    else if (form.animaux_politique === "non") updates.animaux = false

    if (dejaLoue) {
      updates.locataire_email = form.locataire_email ? form.locataire_email.trim().toLowerCase() : null
      updates.date_debut_bail = form.date_debut_bail || null
      updates.mensualite_credit = toInt(form.mensualite_credit)
      updates.valeur_bien = toInt(form.valeur_bien)
      updates.duree_credit = toInt(form.duree_credit)
      updates.taxe_fonciere = toInt(form.taxe_fonciere)
      updates.assurance_pno = toInt(form.assurance_pno)
      updates.charges_copro_annuelles = toInt(form.charges_copro_annuelles)
    }

    // Fallback progressif si colonnes absentes :
    //   (1) update complet → (2) sans lat/lng → (3) sans critères R10.6 v2.
    let { error } = await supabase.from("annonces").update(updates).eq("id", bienId)
    if (error && /lat|lng|column.*does not exist/i.test(error.message || "")) {
      const updatesNoCoords = { ...updates }
      delete updatesNoCoords.lat
      delete updatesNoCoords.lng
      const retry = await supabase.from("annonces").update(updatesNoCoords).eq("id", bienId)
      error = retry.error
    }
    if (error && /age_min|age_max|max_occupants|animaux_politique|fumeur_politique|equipements_extras|column.*does not exist/i.test(error.message || "")) {
      const updatesNoV2 = { ...updates }
      delete updatesNoV2.age_min
      delete updatesNoV2.age_max
      delete updatesNoV2.max_occupants
      delete updatesNoV2.animaux_politique
      delete updatesNoV2.fumeur_politique
      delete updatesNoV2.equipements_extras
      delete updatesNoV2.lat
      delete updatesNoV2.lng
      const retry = await supabase.from("annonces").update(updatesNoV2).eq("id", bienId)
      error = retry.error
    }
    setSaving(false)
    if (error) { alert("La sauvegarde a échoué. Veuillez réessayer."); return }
    setSaved(true)
    setTimeout(() => { setSaved(false); router.push("/proprietaire") }, 1500)
  }

  if (status === "loading" || loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#8a8477" }}>Chargement...</div>
  )

  if (notFound) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'DM Sans', sans-serif", flexDirection: "column", gap: 16 }}>
      <p style={{ fontSize: 18, fontWeight: 700 }}>Annonce introuvable</p>
      <a href="/proprietaire" style={{ color: "#111", fontWeight: 600 }}>← Retour au dashboard</a>
    </div>
  )

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: isMobile ? "24px 16px" : "40px 48px" }}>
        <a href="/proprietaire" style={{ fontSize: 14, color: "#8a8477", textDecoration: "none" }}>← Retour au dashboard</a>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "16px 0 4px" }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.5px" }}>Modifier l'annonce</h1>
          <a href={`/annonces/${bienId}`} style={{ fontSize: 13, color: "#8a8477", textDecoration: "none", padding: "7px 14px", border: "1px solid #EAE6DF", borderRadius: 999, fontWeight: 600 }}>
            Voir l'annonce publiée →
          </a>
        </div>
        <p style={{ color: "#8a8477", marginBottom: 32, fontSize: 14 }}>Les modifications sont appliquées immédiatement après sauvegarde.</p>

        <Sec t="Informations générales">
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            <F l="Type de bien">
              <select style={sel} value={form.type_bien} onChange={set("type_bien")}>
                {["Appartement","Maison","Studio","Chambre","Colocation","Loft","Villa","Autre"].map(v => <option key={v}>{v}</option>)}
              </select>
            </F>
            <F l="Statut du bien">
              <select style={sel} value={form.statut} onChange={set("statut")}>
                <option value="disponible">Disponible — à louer</option>
                <option value="loué">Déjà loué — gestion uniquement</option>
                <option value="en visite">En cours de visite</option>
                <option value="réservé">Réservé</option>
              </select>
            </F>
            <F l="Titre de l'annonce">
              <input style={inp} value={form.titre} onChange={set("titre")} placeholder="Ex: Bel appartement T2 lumineux" />
            </F>
            <F l="Ville">
              <CityAutocomplete value={form.ville} onChange={v => setForm(f => ({ ...f, ville: v }))} placeholder="Commencez à taper..." />
            </F>
            <F l="Adresse">
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
                onChange={e => setForm(f => ({ ...f, dispo: e.target.value || "Disponible maintenant" }))}
              />
              <p style={{ fontSize: 11, color: "#8a8477", marginTop: 6 }}>
                Laisser vide = &quot;Disponible maintenant&quot;
              </p>
            </F>
          </div>
        </Sec>

        {/* Visibilité publique — toggle is_test pour masquer les annonces de
            test (modération vitrine, migration 2026-04-26). */}
        <Sec t="Visibilité publique">
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "flex-start",
            gap: 14, padding: "14px 16px",
            background: isTest ? "#FBF6EA" : "#F7F4EF",
            border: `1px solid ${isTest ? "#EADFC6" : "#EAE6DF"}`,
            borderRadius: 12,
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#111", margin: 0, marginBottom: 4 }}>
                Annonce de test (masquée du public)
              </p>
              <p style={{ fontSize: 12, color: "#666", lineHeight: 1.55, margin: 0 }}>
                {isTest
                  ? "Cette annonce est masquée des pages publiques (accueil, recherche, fiches similaires, sitemap, partages sociaux). Elle reste visible et éditable depuis votre espace propriétaire."
                  : "L'annonce est visible publiquement. Activez ce toggle si c'est un bien de test, une démo ou un brouillon que vous ne voulez pas exposer."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsTest(!isTest)}
              role="switch"
              aria-checked={isTest}
              style={{
                width: 44, height: 24, borderRadius: 999,
                background: isTest ? "#a16207" : "#EAE6DF",
                cursor: "pointer", position: "relative",
                transition: "background 0.2s",
                border: "none", padding: 0, flexShrink: 0,
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: "50%",
                background: "#fff",
                position: "absolute", top: 3, left: isTest ? 23 : 3,
                transition: "left 0.2s",
                boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
              }} />
            </button>
          </div>
        </Sec>

        {/* Photos */}
        <Sec t="Photos du bien">
          {/* Toggle "Améliorer auto" — Paul 2026-04-27. Default ON.
              Pipeline server-side : normalize + modulate + sharpen Sharp. */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "#111", fontWeight: 500 }}
              title="Auto-contraste, légère exposition + saturation, sharpening doux. Désactivez si vos photos sont déjà retouchées.">
              <span style={{ color: "#8a8477" }}>Améliorer auto</span>
              <span aria-hidden style={{ position: "relative", display: "inline-block", width: 36, height: 20, borderRadius: 999, background: enhancePhotos ? "#111" : "#EAE6DF", transition: "background 200ms" }}>
                <span style={{ position: "absolute", top: 2, left: enhancePhotos ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 200ms", boxShadow: "0 1px 2px rgba(0,0,0,0.15)" }} />
              </span>
              <input type="checkbox" checked={enhancePhotos} onChange={e => setEnhancePhotos(e.target.checked)} style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }} />
            </label>
          </div>
          {photoError && (
            <div style={{ background: "#FEECEC", border: "1px solid #F4C9C9", borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ fontSize: 13, color: "#b91c1c" }}>{photoError}</p>
              <button type="button" aria-label="Fermer le message d'erreur" onClick={() => setPhotoError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#b91c1c", fontSize: 18 }}>×</button>
            </div>
          )}

          {photos.length > 0 && (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              {photos.map((url, idx) => (
                <div key={idx}
                  onClick={() => setLightbox({ open: true, index: idx })}
                  style={{ position: "relative", width: 120, height: 90, borderRadius: 10, overflow: "hidden", border: "1px solid #EAE6DF", cursor: "zoom-in" }}>
                  <img src={url} alt={`Photo ${idx + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button onClick={(e) => { e.stopPropagation(); removePhoto(idx) }}
                    style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: 22, height: 22, cursor: "pointer", color: "white", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    ×
                  </button>
                  {idx === 0 && (
                    <span style={{ position: "absolute", bottom: 4, left: 4, background: "#111", color: "white", fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, pointerEvents: "none" }}>Principale</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            style={{ display: "none" }}
            ref={photoInputRef}
            onChange={e => {
              const files = Array.from(e.target.files || [])
              if (files.length === 0) return
              setCropFile(files[0])
              setCropQueue(files.slice(1))
              e.target.value = ""
            }}
          />
          <button
            onClick={() => photoInputRef.current?.click()}
            disabled={uploadingPhoto}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", border: "2px dashed #EAE6DF", borderRadius: 12, background: "transparent", cursor: uploadingPhoto ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 600, color: "#8a8477", opacity: uploadingPhoto ? 0.6 : 1 }}>
            {uploadingPhoto ? <span>Upload en cours...</span> : <><span style={{ fontSize: 20 }}>+</span><span>Ajouter des photos — {photos.length}/10</span></>}
          </button>
          <p style={{ fontSize: 12, color: "#8a8477", marginTop: 8 }}>
            Après sélection, vous pourrez recadrer chaque image (4:3 recommandé).
          </p>

          <Lightbox
            photos={photos}
            initialIndex={lightbox.index}
            open={lightbox.open}
            onClose={() => setLightbox(s => ({ ...s, open: false }))}
          />
          <ImageCropModal
            file={cropFile}
            onCancel={onCancelCrop}
            onCropped={onCropValidated}
            onSkipCrop={onSkipCrop}
            defaultRatio={4 / 3}
          />
        </Sec>

        {/* Champs loué */}
        {dejaLoue && (
          <Sec t="Informations de location en cours">
            <div style={{ background: "#F0FAEE", border: "1px solid #C6E9C0", borderRadius: 12, padding: "12px 16px", marginBottom: 20 }}>
              <p style={{ fontSize: 13, color: "#15803d", fontWeight: 600 }}>Ce bien est géré en mode privé et n'apparaît pas dans les annonces publiques.</p>
            </div>
            <div style={{ marginBottom: 20 }}>
              <LocataireEmailField value={form.locataire_email} onChange={v => setForm(f => ({ ...f, locataire_email: v }))} inputStyle={inp} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
              <F l="Date de début du bail">
                <input style={inp} value={form.date_debut_bail} onChange={set("date_debut_bail")} type="date" />
              </F>
              <F l="Mensualité crédit (€)">
                <input style={inp} value={form.mensualite_credit} onChange={set("mensualite_credit")} type="number" placeholder="800" />
              </F>
              <F l="Durée du crédit (mois)">
                <input style={inp} value={form.duree_credit} onChange={set("duree_credit")} type="number" placeholder="240" />
              </F>
              <F l="Valeur estimée du bien (€)">
                <input style={inp} value={form.valeur_bien} onChange={set("valeur_bien")} type="number" placeholder="250000" />
              </F>
            </div>
            <div style={{ borderTop: "1px solid #F7F4EF", paddingTop: 20, marginTop: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 14, color: "#111" }}>Charges annuelles du propriétaire</p>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
                <F l="Taxe foncière (€/an)">
                  <input style={inp} value={form.taxe_fonciere} onChange={set("taxe_fonciere")} type="number" placeholder="1200" />
                </F>
                <F l="Assurance PNO (€/an)">
                  <input style={inp} value={form.assurance_pno} onChange={set("assurance_pno")} type="number" placeholder="350" />
                </F>
                <F l="Charges copro non recup. (€/an)">
                  <input style={inp} value={form.charges_copro_annuelles} onChange={set("charges_copro_annuelles")} type="number" placeholder="600" />
                </F>
              </div>
            </div>
          </Sec>
        )}

        <Sec t="Prix & charges">
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 16 }}>
            <F l="Loyer mensuel (€)"><input style={inp} type="number" value={form.prix} onChange={set("prix")} placeholder="1100" /></F>
            <F l="Charges (€/mois)"><input style={inp} type="number" value={form.charges} onChange={set("charges")} placeholder="80" /></F>
            <F l="Dépôt de garantie (€)"><input style={inp} type="number" value={form.caution} onChange={set("caution")} placeholder="1100" /></F>
          </div>
        </Sec>

        <Sec t="Caractéristiques">
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 16, marginBottom: 22 }}>
            <F l="Surface (m²)"><input style={inp} type="number" min={0} value={form.surface} onChange={set("surface")} placeholder="38" /></F>
            <F l="Pièces"><input style={inp} type="number" min={0} max={20} value={form.pieces} onChange={set("pieces")} placeholder="Ex : 2" /></F>
            <F l="Chambres"><input style={inp} type="number" min={0} max={20} value={form.chambres} onChange={set("chambres")} placeholder="Ex : 1" /></F>
          </div>

          <div style={{ marginBottom: 22 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 10px" }}>Étage</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {ETAGES_COMMUNS.map(v => {
                const active = form.etage === v
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, etage: v }))}
                    style={{
                      padding: "8px 14px", borderRadius: 999, fontFamily: "inherit", fontSize: 12.5, fontWeight: 500, cursor: "pointer",
                      border: `1.5px solid ${active ? "#111" : "#EAE6DF"}`,
                      background: active ? "#111" : "white",
                      color: active ? "white" : "#111",
                    }}
                  >{v}</button>
                )
              })}
            </div>
            <input
              style={{ ...inp, maxWidth: 240 }}
              type="text"
              placeholder="Ou saisie libre (ex : 12e)"
              value={(ETAGES_COMMUNS as readonly string[]).includes(form.etage) ? "" : form.etage}
              onChange={set("etage")}
            />
          </div>

          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 10px" }}>
              DPE
              {" "}<Tooltip text="Le DPE est obligatoire depuis 2007. A = très économe, G = passoire thermique. Les logements F et G sont progressivement interdits à la location." />
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {DPE_VALUES.map((v, i) => {
                const active = form.dpe === v
                const isLetter = v.length === 1
                const letterColors = ["#2E7D32", "#66BB6A", "#AED581", "#FFEE58", "#FFA726", "#EF5350", "#C62828"]
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, dpe: v }))}
                    style={{
                      padding: isLetter ? "10px 18px" : "10px 14px",
                      borderRadius: 10,
                      fontFamily: "inherit",
                      fontSize: isLetter ? 14 : 12.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      border: `2px solid ${active ? "#111" : "transparent"}`,
                      background: isLetter ? letterColors[i] : "white",
                      color: isLetter ? "white" : "#111",
                      boxShadow: active ? "0 0 0 1px inset rgba(255,255,255,0.3)" : "none",
                      letterSpacing: isLetter ? "0.5px" : "0.3px",
                      minWidth: isLetter ? 44 : "auto",
                      textAlign: "center",
                      outline: !isLetter ? `1px solid ${active ? "#111" : "#EAE6DF"}` : "none",
                    }}
                  >{v}</button>
                )
              })}
            </div>
            {!(DPE_VALUES as readonly string[]).includes(form.dpe) && (
              <input
                style={{ ...inp, maxWidth: 280 }}
                type="text"
                placeholder="Ou saisie libre (ex : En attente)"
                value={form.dpe}
                onChange={set("dpe")}
              />
            )}
          </div>
        </Sec>

        <Sec t="Équipements">
          <div style={{ marginBottom: 22 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 14px" }}>Général</p>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 4 }}>
              <Toggle label="Meublé" k="meuble" toggles={toggles} setToggles={setToggles} />
              <Toggle label="Parking" k="parking" toggles={toggles} setToggles={setToggles} />
              <Toggle label="Cave" k="cave" toggles={toggles} setToggles={setToggles} />
              <Toggle label="Fibre optique" k="fibre" toggles={toggles} setToggles={setToggles} />
              <Toggle label="Balcon" k="balcon" toggles={toggles} setToggles={setToggles} />
              <Toggle label="Terrasse" k="terrasse" toggles={toggles} setToggles={setToggles} />
              <Toggle label="Jardin" k="jardin" toggles={toggles} setToggles={setToggles} />
              <Toggle label="Ascenseur" k="ascenseur" toggles={toggles} setToggles={setToggles} />
            </div>
          </div>

          {EQUIP_EXTRAS_GROUPS.map(group => (
            <div key={group.title} style={{ marginBottom: 22 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 10px" }}>{group.title}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {group.items.map(it => {
                  const active = !!equipExtras[it.k]
                  return (
                    <button
                      key={it.k}
                      type="button"
                      onClick={() => setEquipExtras(prev => ({ ...prev, [it.k]: !prev[it.k] }))}
                      style={{
                        padding: "8px 14px", borderRadius: 999, fontFamily: "inherit", fontSize: 12.5, fontWeight: 500, cursor: "pointer",
                        border: `1.5px solid ${active ? "#111" : "#EAE6DF"}`,
                        background: active ? "#111" : "white",
                        color: active ? "white" : "#111",
                      }}
                    >{it.label}</button>
                  )
                })}
              </div>
            </div>
          ))}

          <p style={{ fontSize: 11, color: "#8a8477", lineHeight: 1.5, margin: 0, fontStyle: "italic" }}>
            Plus vous cochez d&apos;équipements, plus le matching locataire est précis.
          </p>
        </Sec>

        <Sec t="Critères candidats (optionnel)">
          <div style={{
            padding: "14px 18px", background: "#F7F4EF", border: "1px solid #EAE6DF",
            borderRadius: 14, fontSize: 12.5, color: "#111", lineHeight: 1.6, marginBottom: 20,
          }}>
            Ces critères ne sont <strong>pas discriminants</strong> — ils nous aident simplement à calculer le score de match et à prioriser les dossiers compatibles.
          </div>

          <div style={{ marginBottom: 22 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#111", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 10px" }}>Nombre maximum d&apos;occupants</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {[
                { v: "", label: "Indifférent" },
                { v: "1", label: "1" }, { v: "2", label: "2" }, { v: "3", label: "3" }, { v: "4", label: "4" }, { v: "5", label: "5 +" },
              ].map(p => {
                const active = form.max_occupants === p.v
                return (
                  <button
                    key={p.v || "any"}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, max_occupants: p.v }))}
                    style={{
                      padding: "9px 16px", borderRadius: 999, fontFamily: "inherit", fontSize: 12.5, fontWeight: 500, cursor: "pointer",
                      border: `1.5px solid ${active ? "#111" : "#EAE6DF"}`,
                      background: active ? "#111" : "white",
                      color: active ? "white" : "#111",
                      minWidth: p.v === "" ? "auto" : 48,
                    }}
                  >{p.label}</button>
                )
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 22 }}>
            <F l="Âge minimum candidat">
              <input style={inp} type="number" min={18} max={99} value={form.age_min} onChange={set("age_min")} placeholder="18" />
            </F>
            <F l="Âge maximum candidat">
              <input style={inp} type="number" min={18} max={99} value={form.age_max} onChange={set("age_max")} placeholder="99" />
            </F>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 18 }}>
            {(["animaux_politique", "fumeur_politique"] as const).map(key => {
              const label = key === "animaux_politique" ? "Animaux" : "Fumeur toléré"
              return (
                <div key={key}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#111", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 10px" }}>{label}</p>
                  <div style={{ display: "flex", gap: 6 }}>
                    {([
                      { v: "indifferent", label: "Indifférent" },
                      { v: "oui", label: "Oui" },
                      { v: "non", label: "Non" },
                    ] as Array<{ v: TriPolitique; label: string }>).map(o => {
                      const active = form[key] === o.v
                      return (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, [key]: o.v }))}
                          style={{
                            flex: 1, padding: "9px 12px", borderRadius: 10, fontFamily: "inherit", fontSize: 12.5, fontWeight: 500, cursor: "pointer",
                            border: `1.5px solid ${active ? "#111" : "#EAE6DF"}`,
                            background: active ? "#111" : "white",
                            color: active ? "white" : "#111",
                          }}
                        >{o.label}</button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          <p style={{ fontSize: 11, color: "#8a8477", lineHeight: 1.5, margin: "18px 0 0", fontStyle: "italic" }}>
            La loi française interdit toute discrimination sur l&apos;origine, le sexe, la situation familiale, l&apos;apparence, le handicap, les opinions politiques ou religieuses, l&apos;orientation sexuelle, l&apos;âge ou le patronyme (loi 2002-73). Les filtres ci-dessus ne génèrent que des préférences de matching, jamais de rejet automatique.
          </p>
        </Sec>

        <Sec t={<>Confidentialité de la localisation <Tooltip text="Par défaut, seul un cercle autour de la ville est affiché sur la carte publique, ce qui protège votre adresse exacte. Activez cette option uniquement si vous souhaitez afficher la position précise du bien à tous les visiteurs de l'annonce." /></>}>
          <Toggle label="Afficher la localisation exacte du bien sur la carte publique" k="localisation_exacte" toggles={toggles} setToggles={setToggles} />
          <p style={{ fontSize: 12, color: "#8a8477", marginTop: 6, lineHeight: 1.5 }}>
            {toggles.localisation_exacte
              ? "Les visiteurs verront un marqueur précis à l'adresse du bien."
              : "Les visiteurs verront uniquement une zone approximative (cercle de 400 m autour de la ville). Recommandé."}
          </p>
        </Sec>

        <Sec t="Description">
          <textarea style={{ ...inp, minHeight: 120, resize: "vertical" }} value={form.description} onChange={set("description")} placeholder="Décrivez votre bien..." />
        </Sec>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <a href="/proprietaire" style={{ padding: "14px 28px", border: "1px solid #EAE6DF", borderRadius: 999, textDecoration: "none", color: "#111", fontWeight: 600, fontSize: 14 }}>
            Annuler
          </a>
          <button onClick={sauvegarder} disabled={saving || saved}
            style={{ background: saved ? "#15803d" : saving ? "#8a8477" : "#111", color: "white", border: "none", borderRadius: 999, padding: "14px 36px", fontWeight: 700, fontSize: 15, cursor: saving || saved ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "background 0.2s" }}>
            {saved ? "Sauvegardé ✓" : saving ? "Sauvegarde..." : "Sauvegarder les modifications"}
          </button>
        </div>
      </div>
    </main>
  )
}
