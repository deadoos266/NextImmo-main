"use client"
import { useSession } from "next-auth/react"
import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import { validateImage } from "../../../lib/fileValidation"
import { useResponsive } from "../../hooks/useResponsive"
import LocataireEmailField from "../../components/LocataireEmailField"
import CityAutocomplete from "../../components/CityAutocomplete"
import AddressAutocomplete from "../../components/AddressAutocomplete"
import Tooltip from "../../components/Tooltip"
import MarketRentHint from "./MarketRentHint"

import { Toggle, Sec, F } from "../../components/FormHelpers"

const DRAFT_VERSION = 1
function draftStorageKey(email: string) {
  return `nestmatch:draftAnnonce:v${DRAFT_VERSION}:${email.toLowerCase()}`
}

export default function AjouterBien() {
  const { data: session } = useSession()
  const router = useRouter()
  const { isMobile } = useResponsive()
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [photos, setPhotos] = useState<string[]>([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    titre: "", ville: "", adresse: "", prix: "", charges: "", caution: "",
    surface: "", pieces: "", chambres: "", etage: "", dpe: "C",
    dispo: "Disponible maintenant", statut: "disponible",
    description: "", type_bien: "Appartement",
    locataire_email: "", date_debut_bail: "", mensualite_credit: "", valeur_bien: "",
    duree_credit: "",
    taxe_fonciere: "", assurance_pno: "", charges_copro_annuelles: "",
    lat: null as number | null, lng: null as number | null,
  })
  const [toggles, setToggles] = useState({
    meuble: false, animaux: false, parking: false, cave: false,
    fibre: false, balcon: false, terrasse: false, jardin: false, ascenseur: false,
    localisation_exacte: false,
  })
  // Auto-save : on propose la restauration au premier load s'il y a un brouillon
  // non publié. Sinon auto-save silencieux à chaque frappe (debounced).
  const [draftPromptOpen, setDraftPromptOpen] = useState(false)
  const [draftLoadedAt, setDraftLoadedAt] = useState<string | null>(null)
  const [savedHint, setSavedHint] = useState(false)

  // Au mount : check localStorage pour un brouillon existant.
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
    } catch { /* corrupted — on ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email])

  // Auto-save debounced à chaque changement form/toggles/photos.
  useEffect(() => {
    if (!session?.user?.email) return
    // Ne sauvegarde pas un form vide (évite d'écraser si l'user revient)
    const hasContent = form.titre || form.ville || form.prix || form.description || photos.length > 0
    if (!hasContent) return
    const t = setTimeout(() => {
      try {
        const payload = { form, toggles, photos, savedAt: new Date().toISOString() }
        localStorage.setItem(draftStorageKey(session.user!.email!), JSON.stringify(payload))
        setSavedHint(true)
        setTimeout(() => setSavedHint(false), 1400)
      } catch { /* quota — silencieux */ }
    }, 900)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, toggles, photos, session?.user?.email])

  function restaurerBrouillon() {
    if (!session?.user?.email) return
    try {
      const raw = localStorage.getItem(draftStorageKey(session.user.email))
      if (!raw) { setDraftPromptOpen(false); return }
      const draft = JSON.parse(raw)
      if (draft.form) setForm((f) => ({ ...f, ...draft.form }))
      if (draft.toggles) setToggles((t) => ({ ...t, ...draft.toggles }))
      if (Array.isArray(draft.photos)) setPhotos(draft.photos)
    } catch { /* noop */ }
    setDraftPromptOpen(false)
  }

  function repartirDeZero() {
    if (!session?.user?.email) return
    try { localStorage.removeItem(draftStorageKey(session.user.email)) } catch { /* noop */ }
    setDraftPromptOpen(false)
  }

  const set = (key: string) => (e: any) => setForm(f => ({ ...f, [key]: e.target.value }))
  const toInt = (v: string) => v ? parseInt(v) : null
  const inp: any = { width: "100%", padding: "11px 14px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 16, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }
  const sel: any = { ...inp, background: "white" }

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

    // Passe par l'API serveur : strip EXIF/GPS + resize + re-encode JPEG.
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
    if (!form.titre || !form.ville || !form.prix) { alert("Remplis au minimum le titre, la ville et le loyer."); return }
    if (form.titre.length > 120) { alert("Le titre doit faire 120 caractères maximum."); return }
    if ((form.description || "").length > 10000) { alert("La description doit faire 10 000 caractères maximum."); return }
    const prix = parseInt(form.prix || "0", 10) || 0
    if (prix <= 0 || prix > 50000) { alert("Le loyer doit être compris entre 1 et 50 000 €."); return }
    const surface = parseInt(form.surface || "0", 10) || 0
    if (surface < 0 || surface > 1000) { alert("La surface doit être comprise entre 0 et 1000 m²."); return }
    setSaving(true)

    const data: any = {
      titre: form.titre, ville: form.ville, adresse: form.adresse,
      prix: toInt(form.prix), charges: toInt(form.charges), caution: toInt(form.caution),
      surface: toInt(form.surface), pieces: toInt(form.pieces), chambres: toInt(form.chambres),
      etage: form.etage, dpe: form.dpe, dispo: form.dispo, statut: form.statut,
      description: form.description, type_bien: form.type_bien,
      proprietaire: session?.user?.name, proprietaire_email: (session?.user?.email || "").toLowerCase().trim(),
      membre: "Membre depuis " + new Date().getFullYear(), verifie: true,
      photos: photos.length > 0 ? photos : null,
      lat: form.lat, lng: form.lng,
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

    // Tentative avec lat/lng. Si colonnes absentes en DB (migration pas lancée),
    // on retire et on retente pour ne pas bloquer la publication.
    let { error } = await supabase.from("annonces").insert([data])
    if (error && /lat|lng|column.*does not exist/i.test(error.message || "")) {
      const dataNoCoords = { ...data }
      delete dataNoCoords.lat
      delete dataNoCoords.lng
      const retry = await supabase.from("annonces").insert([dataNoCoords])
      error = retry.error
    }
    if (!error) {
      // Marquer le compte comme propriétaire actif
      await supabase.from("profils").upsert({
        email: session!.user!.email!,
        is_proprietaire: true,
      }, { onConflict: "email" })
      try { localStorage.removeItem(draftStorageKey(session!.user!.email!)) } catch { /* noop */ }
      router.push("/proprietaire")
    } else {
      alert("La publication a échoué. Veuillez vérifier les champs et réessayer.")
    }
    setSaving(false)
  }

  // Checklist de complétude (inspirée SeLoger) — aide le proprio à voir ce qui manque
  const checks = [
    { key: "titre", label: "Titre", ok: !!form.titre.trim() },
    { key: "type", label: "Type de bien", ok: !!form.type_bien },
    { key: "ville", label: "Ville", ok: !!form.ville },
    { key: "prix", label: "Loyer", ok: !!form.prix },
    { key: "surface", label: "Surface", ok: !!form.surface },
    { key: "pieces", label: "Pièces", ok: !!form.pieces },
    { key: "description", label: "Description (80+ car.)", ok: (form.description || "").trim().length >= 80 },
    { key: "photos", label: "Photos (1+ recommandé)", ok: photos.length >= 1 },
    { key: "dpe", label: "DPE", ok: !!form.dpe },
  ]
  const nOk = checks.filter(c => c.ok).length
  const completion = Math.round((nOk / checks.length) * 100)
  const manquants = checks.filter(c => !c.ok).map(c => c.label)

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: isMobile ? "24px 16px" : "40px 48px" }}>
        <a href="/proprietaire" style={{ fontSize: 14, color: "#6b7280", textDecoration: "none" }}>← Retour au dashboard</a>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", margin: "16px 0 4px" }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.5px", margin: 0 }}>Ajouter un bien</h1>
          {savedHint && (
            <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 700 }}>Brouillon sauvegardé</span>
          )}
        </div>
        <p style={{ color: "#6b7280", marginBottom: 20, fontSize: 14 }}>Publiez une annonce ou enregistrez un bien déjà loué pour le gérer</p>

        {draftPromptOpen && (
          <div style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 14, padding: "14px 18px", marginBottom: 20, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#1e3a8a", margin: 0 }}>Brouillon détecté</p>
              <p style={{ fontSize: 12, color: "#1e40af", margin: "4px 0 0", lineHeight: 1.5 }}>
                Vous avez commencé à rédiger une annonce{draftLoadedAt ? ` le ${new Date(draftLoadedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}` : ""}. Voulez-vous la reprendre ?
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={restaurerBrouillon}
                style={{ background: "#1d4ed8", color: "white", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Reprendre
              </button>
              <button type="button" onClick={repartirDeZero}
                style={{ background: "white", color: "#1e40af", border: "1.5px solid #bfdbfe", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Repartir de zéro
              </button>
            </div>
          </div>
        )}

        {/* Progress bar de complétude — style SeLoger : feedback visible sur ce qui reste à remplir */}
        <div style={{ background: "white", borderRadius: 16, padding: isMobile ? "14px 16px" : "18px 22px", marginBottom: 24, border: "1px solid #e5e7eb" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 12, flexWrap: "wrap" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: completion === 100 ? "#16a34a" : "#111", margin: 0 }}>
              {completion === 100 ? "✓ Annonce complète — prête à publier" : `Annonce complète à ${completion}%`}
            </p>
            {completion < 100 && (
              <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
                À compléter : {manquants.slice(0, 3).join(" · ")}{manquants.length > 3 ? ` · +${manquants.length - 3}` : ""}
              </p>
            )}
          </div>
          <div style={{ height: 6, background: "#f3f4f6", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${completion}%`, height: "100%", background: completion === 100 ? "#16a34a" : "#111", transition: "width 0.2s" }} />
          </div>
        </div>

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
                  // La ville de l'adresse sélectionnée est autoritaire : l'adresse
                  // "6 rue de Rivoli 75001 Paris" force la ville à Paris.
                  // lat/lng capturés pour affichage précis sur la carte.
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
              <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>
                Laisser vide = &quot;Disponible maintenant&quot;
              </p>
            </F>
          </div>
        </Sec>

        {/* Photos */}
        <Sec t="Photos du bien">
          {photoError && (
            <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ fontSize: 13, color: "#dc2626" }}>{photoError}</p>
              <button type="button" aria-label="Fermer le message d'erreur" onClick={() => setPhotoError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 18 }}>×</button>
            </div>
          )}

          {/* Preview photos */}
          {photos.length > 0 && (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              {photos.map((url, idx) => (
                <div key={idx} style={{ position: "relative", width: 120, height: 90, borderRadius: 10, overflow: "hidden", border: "1.5px solid #e5e7eb" }}>
                  <img src={url} alt={`Photo ${idx + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button onClick={() => removePhoto(idx)}
                    style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: 22, height: 22, cursor: "pointer", color: "white", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    ×
                  </button>
                  {idx === 0 && (
                    <span style={{ position: "absolute", bottom: 4, left: 4, background: "#111", color: "white", fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4 }}>Principale</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <input
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            multiple
            style={{ display: "none" }}
            ref={photoInputRef}
            onChange={async e => {
              const files = Array.from(e.target.files || [])
              for (const file of files) await uploadPhoto(file)
              e.target.value = ""
            }}
          />
          <button
            onClick={() => photoInputRef.current?.click()}
            disabled={uploadingPhoto}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", border: "2px dashed #d1d5db", borderRadius: 12, background: "transparent", cursor: uploadingPhoto ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 600, color: "#6b7280", opacity: uploadingPhoto ? 0.6 : 1 }}>
            {uploadingPhoto ? (
              <span>Upload en cours...</span>
            ) : (
              <>
                <span style={{ fontSize: 20 }}>+</span>
                <span>Ajouter des photos (JPG, PNG) — {photos.length}/10</span>
              </>
            )}
          </button>
          <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>La première photo sera la photo principale de l'annonce.</p>
        </Sec>

        {/* Champs supplémentaires si déjà loué */}
        {dejaLoue && (
          <Sec t="Informations de location en cours">
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "12px 16px", marginBottom: 20 }}>
              <p style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}>Ce bien sera géré dans votre dashboard mais n'apparaîtra pas dans les annonces publiques.</p>
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
            <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 20, marginTop: 20 }}>
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
          <MarketRentHint ville={form.ville} surface={form.surface} pieces={form.pieces} prix={form.prix} />
          <div style={{ display: "none" }}>
          </div>
        </Sec>

        <Sec t="Caractéristiques">
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 16 }}>
            <F l="Surface (m²)"><input style={inp} type="number" value={form.surface} onChange={set("surface")} placeholder="38" /></F>
            <F l="Pièces">
              <select style={sel} value={form.pieces} onChange={set("pieces")}>{["","1","2","3","4","5","6","7+"].map(v => <option key={v} value={v}>{v || "Sélectionner"}</option>)}</select>
            </F>
            <F l="Chambres">
              <select style={sel} value={form.chambres} onChange={set("chambres")}>{["","0","1","2","3","4","5+"].map(v => <option key={v} value={v}>{v === "" ? "Sélectionner" : v}</option>)}</select>
            </F>
            <F l="Étage">
              <select style={sel} value={form.etage} onChange={set("etage")}>{["","Rez-de-chaussée","1er","2e","3e","4e","5e","6e","7e","8e","9e","10e+"].map(v => <option key={v} value={v}>{v || "Sélectionner"}</option>)}</select>
            </F>
            <F l="DPE">
              <select style={sel} value={form.dpe} onChange={set("dpe")}>{["A","B","C","D","E","F","G"].map(v => <option key={v}>{v}</option>)}</select>
            </F>
          </div>
        </Sec>

        <Sec t="Équipements">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            <Toggle label="Meublé" k="meuble" toggles={toggles} setToggles={setToggles} />
            <Toggle label="Animaux acceptés" k="animaux" toggles={toggles} setToggles={setToggles} />
            <Toggle label="Parking" k="parking" toggles={toggles} setToggles={setToggles} />
            <Toggle label="Cave" k="cave" toggles={toggles} setToggles={setToggles} />
            <Toggle label="Fibre" k="fibre" toggles={toggles} setToggles={setToggles} />
            <Toggle label="Balcon" k="balcon" toggles={toggles} setToggles={setToggles} />
            <Toggle label="Terrasse" k="terrasse" toggles={toggles} setToggles={setToggles} />
            <Toggle label="Jardin" k="jardin" toggles={toggles} setToggles={setToggles} />
            <Toggle label="Ascenseur" k="ascenseur" toggles={toggles} setToggles={setToggles} />
          </div>
        </Sec>

        <Sec t="Description">
          <textarea style={{ ...inp, minHeight: 120, resize: "vertical" }} value={form.description} onChange={set("description")} placeholder="Décrivez votre bien..." />
        </Sec>

        <Sec t={<>Confidentialité de la localisation <Tooltip text="Par défaut, seul un cercle autour de la ville est affiché sur la carte publique, ce qui protège votre adresse exacte. Activez cette option uniquement si vous souhaitez afficher la position précise du bien à tous les visiteurs de l'annonce." /></>}>
          <Toggle label="Afficher la localisation exacte du bien sur la carte publique" k="localisation_exacte" toggles={toggles} setToggles={setToggles} />
          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 6, lineHeight: 1.5 }}>
            {toggles.localisation_exacte
              ? "Les visiteurs verront un marqueur précis à l'adresse du bien."
              : "Les visiteurs verront uniquement une zone approximative (cercle de 400 m autour de la ville). Recommandé."}
          </p>
        </Sec>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <a href="/proprietaire" style={{ padding: "14px 28px", border: "1.5px solid #e5e7eb", borderRadius: 999, textDecoration: "none", color: "#111", fontWeight: 600 }}>Annuler</a>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              disabled={!form.titre || !form.ville || !form.prix}
              style={{ background: "white", border: "1.5px solid #111", color: "#111", borderRadius: 999, padding: "14px 24px", fontWeight: 700, fontSize: 15, cursor: form.titre && form.ville && form.prix ? "pointer" : "not-allowed", opacity: form.titre && form.ville && form.prix ? 1 : 0.5, fontFamily: "inherit" }}
            >
              Prévisualiser
            </button>
            <button onClick={publier} disabled={saving}
              style={{ background: "#111", color: "white", border: "none", borderRadius: 999, padding: "14px 36px", fontWeight: 700, fontSize: 15, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, fontFamily: "inherit" }}>
              {saving ? "Publication..." : dejaLoue ? "Enregistrer le bien" : "Publier l'annonce"}
            </button>
          </div>
        </div>

        {showPreview && (
          <PreviewModal form={form} toggles={toggles} photos={photos} onClose={() => setShowPreview(false)} />
        )}
      </div>
    </main>
  )
}

// ─── Modal de prévisualisation ──────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PreviewModal({ form, toggles, photos, onClose }: { form: any; toggles: any; photos: string[]; onClose: () => void }) {
  const loyerTotal = (parseInt(form.prix || "0", 10) || 0) + (parseInt(form.charges || "0", 10) || 0)
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflow: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 20, width: "min(720px, 100%)", maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ position: "sticky", top: 0, background: "white", padding: "18px 24px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 1 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 }}>Aperçu de votre annonce</p>
          <button type="button" aria-label="Fermer l'aperçu" onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#6b7280", padding: 0, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "20px 24px" }}>
          {photos.length > 0 ? (
            <div style={{ height: 280, background: `url(${photos[0]}) center/cover no-repeat`, borderRadius: 14, marginBottom: 18 }} />
          ) : (
            <div style={{ height: 280, background: "linear-gradient(135deg, #d4e8e0, #b8d4c8)", borderRadius: 14, marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280", fontSize: 13 }}>
              Aucune photo — ajoutez-en pour maximiser l&apos;intérêt
            </div>
          )}
          <h2 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 6px", letterSpacing: "-0.5px" }}>{form.titre || "Titre de l'annonce"}</h2>
          <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 14px" }}>
            {form.adresse && toggles.localisation_exacte ? `${form.adresse} · ` : ""}{form.ville}
          </p>
          <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap", fontSize: 14, color: "#374151" }}>
            {form.surface && <span><strong>{form.surface} m²</strong></span>}
            {form.pieces && <span><strong>{form.pieces}</strong> pièces</span>}
            {form.chambres && <span><strong>{form.chambres}</strong> chambres</span>}
            {form.dpe && <span>DPE <strong>{form.dpe}</strong></span>}
            {form.type_bien && <span style={{ color: "#6b7280" }}>{form.type_bien}</span>}
          </div>
          <div style={{ background: "#f9fafb", borderRadius: 12, padding: "14px 18px", marginBottom: 18 }}>
            <p style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>{loyerTotal} €<span style={{ fontSize: 14, color: "#6b7280", fontWeight: 500 }}> / mois</span></p>
            {form.charges && <p style={{ fontSize: 12, color: "#6b7280", margin: "4px 0 0" }}>dont {form.charges} € de charges</p>}
          </div>
          {form.description && (
            <div style={{ marginBottom: 18 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 8px" }}>Description</h3>
              <p style={{ fontSize: 14, color: "#4b5563", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{form.description}</p>
            </div>
          )}
          <h3 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 8px" }}>Équipements</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
            {Object.entries(toggles).filter(([, v]) => v).map(([k]) => (
              <span key={k} style={{ background: "#f0fdf4", color: "#15803d", padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600 }}>{k.replace(/_/g, " ")}</span>
            ))}
            {Object.entries(toggles).filter(([, v]) => v).length === 0 && (
              <span style={{ fontSize: 13, color: "#9ca3af" }}>Aucun équipement coché.</span>
            )}
          </div>
          <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", margin: "20px 0 0" }}>
            Aperçu indicatif — le rendu public peut légèrement varier.
          </p>
        </div>
      </div>
    </div>
  )
}
