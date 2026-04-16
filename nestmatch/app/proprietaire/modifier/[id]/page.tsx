"use client"
import { useSession } from "next-auth/react"
import { useState, useRef, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { supabase } from "../../../../lib/supabase"
import { useResponsive } from "../../../hooks/useResponsive"

const Toggle = ({ label, k, toggles, setToggles }: any) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
    <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span>
    <div onClick={() => setToggles((t: any) => ({ ...t, [k]: !t[k] }))}
      style={{ width: 44, height: 24, borderRadius: 999, background: toggles[k] ? "#111" : "#e5e7eb", cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
      <div style={{ width: 18, height: 18, borderRadius: "50%", background: "white", position: "absolute", top: 3, left: toggles[k] ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
    </div>
  </div>
)

const Sec = ({ t, children }: any) => (
  <div style={{ background: "white", borderRadius: 20, padding: 28, marginBottom: 20 }}>
    <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 20 }}>{t}</h2>
    {children}
  </div>
)

const F = ({ l, children }: any) => (
  <div style={{ marginBottom: 16 }}>
    <label style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 6 }}>{l}</label>
    {children}
  </div>
)

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
  const photoInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    titre: "", ville: "", adresse: "", prix: "", charges: "", caution: "",
    surface: "", pieces: "", chambres: "", etage: "", dpe: "C",
    dispo: "Disponible maintenant", statut: "disponible",
    description: "", type_bien: "Appartement",
    locataire_email: "", date_debut_bail: "", mensualite_credit: "", valeur_bien: "", duree_credit: "",
    taxe_fonciere: "", assurance_pno: "", charges_copro_annuelles: "",
  })
  const [toggles, setToggles] = useState({
    meuble: false, animaux: false, parking: false, cave: false,
    fibre: false, balcon: false, terrasse: false, jardin: false, ascenseur: false,
  })

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/auth"); return }
    if (session?.user?.email && bienId) loadBien()
  }, [session, status, bienId])

  async function loadBien() {
    const { data, error } = await supabase
      .from("annonces")
      .select("*")
      .eq("id", bienId)
      .eq("proprietaire_email", session!.user!.email!)
      .single()

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
    })
    setToggles({
      meuble: !!data.meuble, animaux: !!data.animaux, parking: !!data.parking,
      cave: !!data.cave, fibre: !!data.fibre, balcon: !!data.balcon,
      terrasse: !!data.terrasse, jardin: !!data.jardin, ascenseur: !!data.ascenseur,
    })
    if (Array.isArray(data.photos)) setPhotos(data.photos)
    setLoading(false)
  }

  const set = (key: string) => (e: any) => setForm(f => ({ ...f, [key]: e.target.value }))
  const toInt = (v: string) => v ? parseInt(v) : null
  const inp: any = { width: "100%", padding: "11px 14px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }
  const sel: any = { ...inp, background: "white" }
  const dejaLoue = form.statut === "loué"

  async function uploadPhoto(file: File) {
    if (!session?.user?.email) return
    setUploadingPhoto(true)
    setPhotoError(null)
    const ext = file.name.split(".").pop()
    const path = `${session.user.email}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from("annonces-photos").upload(path, file, { upsert: false })
    if (error) {
      setPhotoError(`Erreur upload: ${error.message}`)
      setUploadingPhoto(false)
      return
    }
    const { data: urlData } = supabase.storage.from("annonces-photos").getPublicUrl(path)
    setPhotos(prev => [...prev, urlData.publicUrl])
    setUploadingPhoto(false)
  }

  function removePhoto(idx: number) {
    setPhotos(prev => prev.filter((_, i) => i !== idx))
  }

  async function sauvegarder() {
    if (!form.titre || !form.ville || !form.prix) { alert("Remplis au minimum le titre, la ville et le loyer."); return }
    setSaving(true)

    const updates: any = {
      titre: form.titre, ville: form.ville, adresse: form.adresse,
      prix: toInt(form.prix), charges: toInt(form.charges), caution: toInt(form.caution),
      surface: toInt(form.surface), pieces: toInt(form.pieces), chambres: toInt(form.chambres),
      etage: form.etage || null, dpe: form.dpe, dispo: form.dispo, statut: form.statut,
      description: form.description, type_bien: form.type_bien,
      photos: photos.length > 0 ? photos : null,
      ...toggles,
    }

    if (dejaLoue) {
      updates.locataire_email = form.locataire_email || null
      updates.date_debut_bail = form.date_debut_bail || null
      updates.mensualite_credit = toInt(form.mensualite_credit)
      updates.valeur_bien = toInt(form.valeur_bien)
      updates.duree_credit = toInt(form.duree_credit)
      updates.taxe_fonciere = toInt(form.taxe_fonciere)
      updates.assurance_pno = toInt(form.assurance_pno)
      updates.charges_copro_annuelles = toInt(form.charges_copro_annuelles)
    }

    const { error } = await supabase.from("annonces").update(updates).eq("id", bienId)
    setSaving(false)
    if (error) { alert("Erreur: " + error.message); return }
    setSaved(true)
    setTimeout(() => { setSaved(false); router.push("/proprietaire") }, 1500)
  }

  if (status === "loading" || loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#6b7280" }}>Chargement...</div>
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
        <a href="/proprietaire" style={{ fontSize: 14, color: "#6b7280", textDecoration: "none" }}>← Retour au dashboard</a>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "16px 0 4px" }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.5px" }}>Modifier l'annonce</h1>
          <a href={`/annonces/${bienId}`} style={{ fontSize: 13, color: "#6b7280", textDecoration: "none", padding: "7px 14px", border: "1.5px solid #e5e7eb", borderRadius: 999, fontWeight: 600 }}>
            Voir l'annonce publiée →
          </a>
        </div>
        <p style={{ color: "#6b7280", marginBottom: 32, fontSize: 14 }}>Les modifications sont appliquées immédiatement après sauvegarde.</p>

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
              <input style={inp} value={form.ville} onChange={set("ville")} placeholder="Ex: Paris 11e" />
            </F>
            <F l="Adresse / Quartier">
              <input style={inp} value={form.adresse} onChange={set("adresse")} placeholder="Ex: Rue de la Roquette" />
            </F>
            <F l="Disponibilité">
              <select style={sel} value={form.dispo} onChange={set("dispo")}>
                {["Disponible maintenant","Disponible 1er du mois prochain","Disponible dans 1 mois","Disponible dans 2 mois","Disponible dans 3 mois","Date à définir"].map(v => <option key={v}>{v}</option>)}
              </select>
            </F>
          </div>
        </Sec>

        {/* Photos */}
        <Sec t="Photos du bien">
          {photoError && (
            <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ fontSize: 13, color: "#dc2626" }}>{photoError}</p>
              <button onClick={() => setPhotoError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 18 }}>×</button>
            </div>
          )}

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
            {uploadingPhoto ? <span>Upload en cours...</span> : <><span style={{ fontSize: 20 }}>+</span><span>Ajouter des photos — {photos.length}/10</span></>}
          </button>
        </Sec>

        {/* Champs loué */}
        {dejaLoue && (
          <Sec t="Informations de location en cours">
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "12px 16px", marginBottom: 20 }}>
              <p style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}>Ce bien est géré en mode privé et n'apparaît pas dans les annonces publiques.</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
              <F l="Email du locataire">
                <input style={inp} value={form.locataire_email} onChange={set("locataire_email")} placeholder="locataire@email.fr" type="email" />
              </F>
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
              <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 14, color: "#111" }}>Charges annuelles du proprietaire</p>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
                <F l="Taxe fonciere (€/an)">
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

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <a href="/proprietaire" style={{ padding: "14px 28px", border: "1.5px solid #e5e7eb", borderRadius: 999, textDecoration: "none", color: "#111", fontWeight: 600, fontSize: 14 }}>
            Annuler
          </a>
          <button onClick={sauvegarder} disabled={saving || saved}
            style={{ background: saved ? "#16a34a" : saving ? "#9ca3af" : "#111", color: "white", border: "none", borderRadius: 999, padding: "14px 36px", fontWeight: 700, fontSize: 15, cursor: saving || saved ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "background 0.2s" }}>
            {saved ? "Sauvegardé ✓" : saving ? "Sauvegarde..." : "Sauvegarder les modifications"}
          </button>
        </div>
      </div>
    </main>
  )
}
