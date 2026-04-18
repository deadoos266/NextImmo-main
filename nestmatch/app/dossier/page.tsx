"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import { validateDocument } from "../../lib/fileValidation"
import { useResponsive } from "../hooks/useResponsive"
import Tooltip from "../components/Tooltip"
import PhoneInput from "../components/PhoneInput"
import SharePanel from "./SharePanel"
import AccessLogPanel from "./AccessLogPanel"

const SITUATIONS = ["CDI", "CDD", "Intérim", "Indépendant / Freelance", "Fonctionnaire", "Alternance", "Étudiant", "Retraité", "Sans emploi"]
const TYPES_GARANT = ["Personne physique", "Organisme Visale", "Action Logement", "Caution bancaire", "Aucun garant"]
const SITUATIONS_FAMILIALES = ["Célibataire", "En couple", "Marié·e", "PACS", "Divorcé·e", "Veuf·ve"]
const LOGEMENT_TYPES = ["Locataire", "Propriétaire", "Hébergé", "Foyer / résidence", "Colocation", "Chez mes parents", "Autre"]
const NATIONALITES_COURANTES = ["Française", "Belge", "Suisse", "Européenne (UE)", "Hors UE"]

type DocKey =
  | "identite" | "bulletins" | "avis_imposition" | "contrat" | "quittances" | "rib"
  | "identite_garant" | "bulletins_garant" | "avis_garant"
  | "certificat_scolarite" | "attestation_caf" | "attestation_assurance" | "attestation_employeur"

// Nombre max de fichiers par catégorie
const DOC_MAX: Record<DocKey, number> = {
  identite: 2, // recto + verso
  bulletins: 6, // extensible pour les CDI longs
  avis_imposition: 2, // année N et N-1
  contrat: 1,
  quittances: 3,
  rib: 1,
  identite_garant: 2,
  bulletins_garant: 3,
  avis_garant: 1,
  certificat_scolarite: 1,
  attestation_caf: 1,
  attestation_assurance: 1,
  attestation_employeur: 1,
}

const DOCS_REQUIS: { key: DocKey; label: string; desc: string; hint?: string }[] = [
  { key: "identite", label: "Pièce d'identité", desc: "CNI (recto + verso), passeport ou titre de séjour en cours de validité.", hint: "Masquez le numéro si vous préférez — gardez la photo et la date de naissance lisibles." },
  { key: "bulletins", label: "Bulletins de salaire", desc: "Les 3 derniers pour un CDI/CDD. Vous pouvez en ajouter jusqu'à 6 si ancienneté longue.", hint: "Attendus par les proprios pour vérifier la stabilité des revenus." },
  { key: "avis_imposition", label: "Avis d'imposition", desc: "Dernier avis (année N-1). Idéalement aussi l'année précédente si disponible.", hint: "Téléchargeable sur impots.gouv.fr → Mes documents." },
  { key: "contrat", label: "Contrat de travail", desc: "Contrat signé OU attestation employeur récente (< 3 mois).", hint: "Pour les CDD / alternance, ajoutez la date de fin de contrat." },
  { key: "quittances", label: "3 dernières quittances de loyer", desc: "Preuves que vous payez actuellement votre loyer.", hint: "Si vous êtes hébergé ou propriétaire, laissez vide et précisez-le dans votre présentation." },
  { key: "rib", label: "RIB", desc: "Relevé d'identité bancaire à votre nom.", hint: "Permet au proprio de vérifier l'identité du titulaire du compte." },
]

const DOCS_OPTIONNELS: { key: DocKey; label: string; desc: string; conditionel?: string }[] = [
  { key: "attestation_employeur", label: "Attestation employeur", desc: "Attestation d'emploi récente (< 3 mois) avec date d'embauche et salaire. Fortement recommandé en plus du contrat.", conditionel: "pro_salarie" },
  { key: "certificat_scolarite", label: "Certificat de scolarité", desc: "À demander à votre établissement. Obligatoire si vous êtes étudiant ou en alternance.", conditionel: "etudiant" },
  { key: "attestation_caf", label: "Attestation CAF / APL", desc: "Si vous êtes éligible aux aides au logement. Renforce la solvabilité.", conditionel: "apl" },
  { key: "attestation_assurance", label: "Attestation d'assurance habitation", desc: "Peut être fournie après la signature du bail, mais l'avoir déjà rassure le proprio.", conditionel: "toujours" },
]

const DOCS_GARANT: { key: DocKey; label: string; desc?: string }[] = [
  { key: "identite_garant", label: "Pièce d'identité du garant", desc: "CNI ou passeport — recto + verso si CNI." },
  { key: "bulletins_garant", label: "Bulletins de salaire du garant", desc: "3 derniers bulletins." },
  { key: "avis_garant", label: "Avis d'imposition du garant", desc: "Dernier avis (année N-1)." },
]

// dossier_docs stocke { key: string[] } (tableau d'URLs par catégorie)
// Compatibilité avec l'ancien format { key: string }
function toArray(val: any): string[] {
  if (!val) return []
  if (Array.isArray(val)) return val
  return [val]
}

import { useRole } from "../providers"

export default function Dossier() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { proprietaireActive } = useRole()

  // Garde rôle : le dossier est LOCATAIRE-only. Un proprio qui y arrive
  // (via historique navigateur, lien partagé…) est redirigé sans bruit.
  useEffect(() => {
    if (proprietaireActive) router.replace("/proprietaire")
  }, [proprietaireActive, router])
  const [profil, setProfil] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState<DocKey | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [docs, setDocs] = useState<Record<string, string[]>>({})
  const { isMobile } = useResponsive()
  const [generatingPDF, setGeneratingPDF] = useState(false)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const [form, setForm] = useState({
    // Identité
    nom: "", telephone: "",
    date_naissance: "",
    nationalite: "",
    situation_familiale: "",
    nb_enfants: 0,
    // Pro
    situation_pro: "",
    employeur_nom: "",
    date_embauche: "",
    revenus_mensuels: "",
    // Famille / logement
    nb_occupants: 1,
    logement_actuel_type: "",
    logement_actuel_ville: "",
    a_apl: false,
    mobilite_pro: false,
    // Garant
    garant: false, type_garant: "",
    // Présentation
    presentation: "",
  })
  const [removeTarget, setRemoveTarget] = useState<{ key: DocKey; idx: number } | null>(null)
  const [dragKey, setDragKey] = useState<DocKey | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/auth"); return }
    if (session?.user?.email) load()
  }, [session, status])

  async function load() {
    const email = session!.user!.email!.toLowerCase()
    const { data } = await supabase.from("profils").select("*").eq("email", email).single()
    if (data) {
      setProfil(data)
      setForm({
        nom: data.nom || session?.user?.name || "",
        telephone: data.telephone || "",
        date_naissance: data.date_naissance || "",
        nationalite: data.nationalite || "",
        situation_familiale: data.situation_familiale || "",
        nb_enfants: data.nb_enfants ?? 0,
        situation_pro: data.situation_pro || "",
        employeur_nom: data.employeur_nom || "",
        date_embauche: data.date_embauche || "",
        revenus_mensuels: data.revenus_mensuels || "",
        nb_occupants: data.nb_occupants || 1,
        logement_actuel_type: data.logement_actuel_type || "",
        logement_actuel_ville: data.logement_actuel_ville || "",
        a_apl: !!data.a_apl,
        mobilite_pro: !!data.mobilite_pro,
        garant: data.garant || false,
        type_garant: data.type_garant || "",
        presentation: data.presentation || "",
      })
      if (data.dossier_docs) {
        // Convertir l'ancien format string → string[]
        const normalized: Record<string, string[]> = {}
        Object.entries(data.dossier_docs).forEach(([k, v]) => { normalized[k] = toArray(v) })
        setDocs(normalized)
      }
    } else {
      setForm(f => ({ ...f, nom: session?.user?.name || "" }))
    }
    setLoading(false)
  }

  async function uploadDoc(key: DocKey, files: FileList) {
    if (!session?.user?.email) return
    setUploading(key)
    setUploadError(null)
    const existing = docs[key] || []
    const max = DOC_MAX[key]
    const remaining = max - existing.length
    const toUpload = Array.from(files).slice(0, remaining)

    const newUrls: string[] = []
    for (const file of toUpload) {
      const check = await validateDocument(file)
      if (!check.ok) {
        setUploadError(check.error)
        continue
      }
      const ext = file.name.split(".").pop()
      const path = `${session.user.email}/${key}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from("dossiers").upload(path, file, { upsert: false })
      if (error) {
        setUploadError("L'envoi du fichier a échoué, veuillez réessayer.")
        break
      }
      const { data: urlData } = supabase.storage.from("dossiers").getPublicUrl(path)
      newUrls.push(urlData.publicUrl)
    }

    if (newUrls.length > 0) {
      const updated = { ...docs, [key]: [...existing, ...newUrls] }
      setDocs(updated)
      await supabase.from("profils").upsert({ email: session.user.email, dossier_docs: updated }, { onConflict: "email" })
    }
    setUploading(null)
  }

  async function removeDoc(key: DocKey, idx: number) {
    if (!session?.user?.email) return
    const updated = { ...docs, [key]: (docs[key] || []).filter((_, i) => i !== idx) }
    if (updated[key].length === 0) delete updated[key]
    setDocs(updated)
    await supabase.from("profils").upsert({ email: session.user.email, dossier_docs: updated }, { onConflict: "email" })
  }

  async function sauvegarder() {
    if (!session?.user?.email) return
    setSaving(true)
    setUploadError(null)
    // Lowercase l'email : clé primaire de profils, évite les doublons
    // si la session retourne une casse différente de la ligne DB.
    const email = session.user.email.toLowerCase()
    const { error } = await supabase.from("profils").upsert({
      email,
      nom: form.nom, telephone: form.telephone, situation_pro: form.situation_pro,
      revenus_mensuels: form.revenus_mensuels ? Number(form.revenus_mensuels) : null,
      garant: form.garant, type_garant: form.type_garant, nb_occupants: form.nb_occupants,
      date_naissance: form.date_naissance || null,
      nationalite: form.nationalite || null,
      situation_familiale: form.situation_familiale || null,
      nb_enfants: form.nb_enfants,
      employeur_nom: form.employeur_nom || null,
      date_embauche: form.date_embauche || null,
      logement_actuel_type: form.logement_actuel_type || null,
      logement_actuel_ville: form.logement_actuel_ville || null,
      a_apl: form.a_apl,
      mobilite_pro: form.mobilite_pro,
      presentation: form.presentation ? form.presentation.slice(0, 500) : null,
    }, { onConflict: "email" })
    setSaving(false)
    if (error) {
      const code = (error as { code?: string }).code
      const msg = error.message || ""
      if (code === "42703" || /column.*(presentation|date_naissance|nationalite|situation_familiale|employeur_nom|date_embauche|logement_actuel|a_apl|mobilite_pro|nb_enfants)/i.test(msg)) {
        setUploadError("Enregistrement partiel : certaines colonnes n'existent pas en base. La migration 007 doit être appliquée puis forcer un reload schema (NOTIFY pgrst, 'reload schema').")
      } else if (code === "23502" || /null value.*not-null/i.test(msg)) {
        setUploadError("Contrainte NOT NULL violée. Appliquez la migration 009 (drop NOT NULL sur nom, telephone…).")
      } else {
        setUploadError(`Enregistrement impossible : ${msg}`)
      }
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  function buildDossierData() {
    return {
      nom: form.nom,
      email: session?.user?.email || "",
      telephone: form.telephone,
      dateNaissance: form.date_naissance,
      nationalite: form.nationalite,
      situationFamiliale: form.situation_familiale,
      nbEnfants: form.nb_enfants,
      situationPro: form.situation_pro,
      employeurNom: form.employeur_nom,
      dateEmbauche: form.date_embauche,
      revenusMensuels: form.revenus_mensuels ? Number(form.revenus_mensuels) : null,
      nbOccupants: form.nb_occupants,
      logementActuelType: form.logement_actuel_type,
      logementActuelVille: form.logement_actuel_ville,
      aApl: form.a_apl,
      mobilitePro: form.mobilite_pro,
      garant: form.garant,
      typeGarant: form.type_garant,
      presentation: form.presentation,
      villeSouhaitee: profil?.ville_souhaitee || "",
      budgetMax: profil?.budget_max ?? null,
      score,
      docs: allDocs.map(d => ({ key: d.key, label: d.label, count: (docs[d.key] || []).length })),
    }
  }

  // Télécharge UNIQUEMENT le PDF récap (léger, rapide, pour envoyer par mail).
  async function genererDossierPDFClick() {
    setGeneratingPDF(true)
    try {
      const { genererDossierPDF } = await import("../../lib/dossierPDF")
      await genererDossierPDF(buildDossierData())
    } catch (e) {
      alert("Erreur génération PDF : " + (e instanceof Error ? e.message : "inconnue"))
    }
    setGeneratingPDF(false)
  }

  // Télécharge le dossier COMPLET : PDF récap + toutes les pièces justificatives,
  // regroupées en ZIP avec une arborescence claire par catégorie.
  async function telechargerDossierZip() {
    setGeneratingPDF(true)
    try {
      const [{ genererDossierPDFBlob }, { default: JSZip }] = await Promise.all([
        import("../../lib/dossierPDF"),
        import("jszip"),
      ])
      const zip = new JSZip()
      const safeName = (form.nom || "locataire").replace(/[^a-zA-Z0-9-_]+/g, "_").slice(0, 40) || "locataire"
      const rootFolder = zip.folder(`dossier_${safeName}`)
      if (!rootFolder) throw new Error("Impossible de créer le dossier zip")

      // 1. PDF récap en blob
      const pdfBlob = await genererDossierPDFBlob(buildDossierData())
      rootFolder.file(`recapitulatif_${safeName}.pdf`, pdfBlob)

      // 2. Pour chaque catégorie de doc, fetch chaque URL et l'ajoute au zip
      //    dans un sous-dossier par label lisible. Les échecs individuels
      //    n'interrompent pas : on ajoute une entrée MANQUANT_* pour tracer.
      const labelOf: Record<string, string> = {}
      for (const d of [...DOCS_REQUIS, ...DOCS_OPTIONNELS, ...DOCS_GARANT]) {
        labelOf[d.key] = d.label
      }
      const toFolderName = (lbl: string) => lbl
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50)

      const failed: string[] = []
      const tasks: Promise<void>[] = []
      for (const key of Object.keys(docs)) {
        const urls = docs[key] || []
        if (urls.length === 0) continue
        const categoryFolder = rootFolder.folder(toFolderName(labelOf[key] || key))
        if (!categoryFolder) continue
        urls.forEach((url, i) => {
          tasks.push((async () => {
            try {
              const res = await fetch(url)
              if (!res.ok) throw new Error(`HTTP ${res.status}`)
              const blob = await res.blob()
              const cleanPath = url.split("?")[0]
              const ext = (cleanPath.split(".").pop() || "bin").slice(0, 6).toLowerCase()
              categoryFolder.file(`fichier_${String(i + 1).padStart(2, "0")}.${ext}`, blob)
            } catch {
              failed.push(`${labelOf[key] || key} — fichier ${i + 1}`)
            }
          })())
        })
      }
      await Promise.all(tasks)

      if (failed.length > 0) {
        rootFolder.file(
          "FICHIERS_MANQUANTS.txt",
          `Certains fichiers n'ont pas pu être téléchargés :\n\n${failed.join("\n")}\n\nRéessayez depuis votre compte — ils restent accessibles en ligne.`
        )
      }

      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } })
      const link = document.createElement("a")
      link.href = URL.createObjectURL(blob)
      link.download = `dossier_${safeName}.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(link.href)

      if (failed.length > 0) {
        alert(`Dossier téléchargé.\n\n${failed.length} fichier(s) n'ont pas pu être récupérés — voir FICHIERS_MANQUANTS.txt dans le zip.`)
      }
    } catch (e) {
      alert("Erreur téléchargement : " + (e instanceof Error ? e.message : "inconnue"))
    }
    setGeneratingPDF(false)
  }

  // Les docs optionnels recommandés selon situation sont pris en compte dans la
  // complétude dès qu'ils sont pertinents (étudiant → certificat, APL → attestation).
  const docsOptionnelsPertinents = DOCS_OPTIONNELS.filter(d => {
    if (d.conditionel === "etudiant") return form.situation_pro === "Étudiant" || form.situation_pro === "Alternance"
    if (d.conditionel === "apl") return form.a_apl
    if (d.conditionel === "pro_salarie") return ["CDI", "CDD", "Intérim", "Fonctionnaire", "Alternance"].includes(form.situation_pro)
    if (d.conditionel === "toujours") return false // "assurance" toujours visible mais non comptée comme obligatoire
    return false
  })
  const allDocs = [...DOCS_REQUIS, ...docsOptionnelsPertinents, ...(form.garant ? DOCS_GARANT : [])]
  // Compte le nombre de catégories avec au moins 1 fichier
  const docsCount = allDocs.filter(d => (docs[d.key] || []).length > 0).length
  const champs = [
    !!form.nom, !!form.telephone, !!form.situation_pro, !!form.revenus_mensuels,
    form.garant !== undefined, !!profil?.ville_souhaitee, !!profil?.budget_max,
    !!form.date_naissance, !!form.situation_familiale, !!form.logement_actuel_type, !!form.nationalite,
  ]
  const scoreInfo = Math.round((champs.filter(Boolean).length / champs.length) * 100)
  const scoreDoc = allDocs.length > 0 ? Math.round((docsCount / allDocs.length) * 100) : 0
  const score = Math.round((scoreInfo + scoreDoc) / 2)
  const scoreColor = score >= 80 ? "#16a34a" : score >= 50 ? "#ea580c" : "#dc2626"

  if (status === "loading" || loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#6b7280" }}>Chargement...</div>
  )

  const F = ({ label, children }: { label: React.ReactNode; children: React.ReactNode }) => (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</label>
      {children}
    </div>
  )

  const inputStyle: any = { width: "100%", padding: "10px 14px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: isMobile ? 16 : 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", background: "white", color: "#111" }

  function DocRow({ docKey, label, desc, hint }: { docKey: DocKey; label: string; desc?: string; hint?: string }) {
    const uploaded = docs[docKey] || []
    const max = DOC_MAX[docKey]
    const isUploading = uploading === docKey
    const canAdd = uploaded.length < max
    const isDragActive = dragKey === docKey

    return (
      <div
        onDragOver={e => { if (canAdd) { e.preventDefault(); setDragKey(docKey) } }}
        onDragLeave={() => { if (dragKey === docKey) setDragKey(null) }}
        onDrop={e => {
          e.preventDefault()
          setDragKey(null)
          if (!canAdd) return
          if (e.dataTransfer.files?.length) uploadDoc(docKey, e.dataTransfer.files)
        }}
        style={{
          padding: "12px 0",
          borderBottom: "1px solid #f3f4f6",
          background: isDragActive ? "#eff6ff" : "transparent",
          borderRadius: isDragActive ? 10 : 0,
          outline: isDragActive ? "1.5px dashed #111" : "none",
          outlineOffset: isDragActive ? -4 : 0,
          transition: "background 0.12s",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: uploaded.length > 0 ? 8 : 0, gap: 8, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 180px", minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 700 }}>{label}</p>
            {desc && <p style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.4, marginTop: 2 }}>{desc}</p>}
            {hint && <p style={{ fontSize: 10, color: "#9ca3af", lineHeight: 1.4, marginTop: 3, fontStyle: "italic" }}>{hint}</p>}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            {canAdd && (
              <>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  multiple={max > 1}
                  style={{ display: "none" }}
                  ref={el => { fileRefs.current[docKey] = el }}
                  onChange={e => { if (e.target.files?.length) uploadDoc(docKey, e.target.files); e.target.value = "" }}
                />
                <button
                  type="button"
                  onClick={() => fileRefs.current[docKey]?.click()}
                  disabled={isUploading}
                  title="Ajouter ou glisser-déposer un fichier ici"
                  style={{ fontSize: 12, fontWeight: 700, color: "#111", background: "none", border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "5px 12px", cursor: isUploading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: isUploading ? 0.6 : 1 }}>
                  {isUploading ? "Upload..." : uploaded.length > 0 ? `+ Ajouter (${uploaded.length}/${max})` : "Ajouter"}
                </button>
              </>
            )}
            {uploaded.length > 0 && (
              <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 700 }}>✓ {uploaded.length}/{max}</span>
            )}
          </div>
        </div>

        {/* Liste des fichiers uploadés */}
        {uploaded.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {uploaded.map((url, i) => {
              const confirming = removeTarget?.key === docKey && removeTarget?.idx === i
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: confirming ? "#fee2e2" : "#f0fdf4", borderRadius: 8, padding: "5px 10px", border: confirming ? "1px solid #fca5a5" : "1px solid transparent", transition: "all 0.15s" }}>
                  <span style={{ fontSize: 11, color: confirming ? "#b91c1c" : "#16a34a", fontWeight: 700 }}>•</span>
                  <a href={url} target="_blank" rel="noopener"
                    style={{ fontSize: 12, fontWeight: 600, color: confirming ? "#991b1b" : "#166534", textDecoration: "none", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    Fichier {i + 1}
                  </a>
                  {confirming ? (
                    <>
                      <button type="button" onClick={() => { removeDoc(docKey, i); setRemoveTarget(null) }}
                        style={{ fontSize: 11, fontWeight: 700, color: "white", background: "#dc2626", border: "none", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit" }}>
                        Confirmer
                      </button>
                      <button type="button" onClick={() => setRemoveTarget(null)}
                        style={{ fontSize: 11, fontWeight: 600, color: "#111", background: "white", border: "1px solid #e5e7eb", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit" }}>
                        Annuler
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setRemoveTarget({ key: docKey, idx: i })}
                      title="Supprimer ce fichier"
                      style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", background: "none", border: "none", cursor: "pointer", padding: "0 4px", fontFamily: "inherit" }}>
                      ✕
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // Décide quels documents optionnels afficher selon le profil courant.
  const docsOptionnelsVisibles = DOCS_OPTIONNELS.filter(d => {
    if (d.conditionel === "etudiant") return form.situation_pro === "Étudiant" || form.situation_pro === "Alternance"
    if (d.conditionel === "apl") return form.a_apl
    if (d.conditionel === "pro_salarie") return ["CDI", "CDD", "Intérim", "Fonctionnaire", "Alternance"].includes(form.situation_pro)
    if (d.conditionel === "toujours") return true
    return false
  })

  return (
    <>
      <style>{`@media print { nav, .no-print { display: none !important; } body { background: white !important; } .print-section { page-break-inside: avoid; } }`}</style>

      <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: isMobile ? "24px 16px" : "32px 48px" }}>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: isMobile ? 20 : 28, flexDirection: isMobile ? "column" : "row", gap: isMobile ? 14 : 0 }}>
            <div style={{ width: isMobile ? "100%" : undefined, minWidth: 0 }}>
              <h1 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 800, letterSpacing: "-0.5px", display: "flex", alignItems: "center", margin: 0 }}>
                Mon dossier locataire
                <Tooltip text="Votre dossier réunit tous les justificatifs demandés par les propriétaires (identité, revenus, garant). Plus il est complet, plus votre candidature est crédible. Il est partagé uniquement avec les propriétaires que vous contactez, à votre initiative." />
              </h1>
              <p style={{ color: "#6b7280", fontSize: isMobile ? 13 : 14, marginTop: 4, lineHeight: 1.5 }}>Complétez vos informations et déposez vos documents pour maximiser vos chances.</p>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", width: isMobile ? "100%" : undefined, justifyContent: isMobile ? "flex-start" : "flex-end" }}>
              <div style={{ background: "white", borderRadius: 16, padding: isMobile ? "8px 12px" : "14px 18px", textAlign: "center", border: `2px solid ${scoreColor}`, flexShrink: 0 }}>
                <div style={{ fontSize: isMobile ? 20 : 26, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{score}%</div>
                <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", marginTop: 2 }}>Complétude</div>
                <div style={{ background: "#f3f4f6", borderRadius: 999, height: 3, marginTop: 6, width: isMobile ? 56 : 70 }}>
                  <div style={{ background: scoreColor, borderRadius: 999, height: 3, width: `${score}%`, transition: "width 0.4s" }} />
                </div>
              </div>
              <a href="/carnet" className="no-print"
                style={{ padding: isMobile ? "9px 14px" : "12px 20px", background: "white", color: "#111", border: "1.5px solid #e5e7eb", borderRadius: 12, fontWeight: 700, fontSize: isMobile ? 13 : 14, textDecoration: "none", display: "inline-flex", alignItems: "center", whiteSpace: "nowrap", flex: isMobile ? "1 1 auto" : undefined, justifyContent: "center" }}>
                Carnet d'entretien
              </a>
            </div>
          </div>

          {uploadError && (
            <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 12, padding: "12px 16px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ fontSize: 13, color: "#dc2626", fontWeight: 600 }}>{uploadError}</p>
              <button onClick={() => setUploadError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 18, fontWeight: 700 }}>×</button>
            </div>
          )}

          {/* Contenu PDF */}
          <div id="dossier-pdf-content" style={{ background: "white", borderRadius: 20, padding: isMobile ? 18 : 32, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", marginBottom: 20, paddingBottom: 16, borderBottom: "2px solid #f3f4f6", flexWrap: "wrap", gap: 12 }}>
              <div>
                <h2 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 900, margin: 0 }}>Dossier locataire</h2>
                <p style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>Généré le {new Date().toLocaleDateString("fr-FR")}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: isMobile ? 20 : 22, fontWeight: 900, color: scoreColor }}>{score}%</div>
                <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, textTransform: "uppercase" }}>Complétude</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
              {[
                { label: "Nom", value: form.nom },
                { label: "Téléphone", value: form.telephone },
                { label: "Email", value: session?.user?.email },
                { label: "Statut pro", value: form.situation_pro },
                { label: "Revenus nets/mois", value: form.revenus_mensuels ? `${Number(form.revenus_mensuels).toLocaleString("fr-FR")} €` : "" },
                { label: "Garant", value: form.garant ? (form.type_garant || "Oui") : "Non" },
              ].map(f => (
                <div key={f.label} style={{ background: "#f9fafb", borderRadius: 10, padding: "10px 14px", minWidth: 0 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", marginBottom: 4 }}>{f.label}</p>
                  <p style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{f.value || "—"}</p>
                </div>
              ))}
            </div>
            <h3 style={{ fontSize: 12, fontWeight: 800, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
              Pièces justificatives ({docsCount}/{allDocs.length} catégories)
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
              {allDocs.map(doc => {
                const files = docs[doc.key] || []
                return (
                  <div key={doc.key} style={{ display: "flex", alignItems: "center", gap: 8, background: files.length > 0 ? "#f0fdf4" : "#f9fafb", borderRadius: 8, padding: "8px 12px", border: `1px solid ${files.length > 0 ? "#bbf7d0" : "#e5e7eb"}` }}>
                    <span style={{ fontSize: 14, color: files.length > 0 ? "#16a34a" : "#d1d5db" }}>{files.length > 0 ? "✓" : "○"}</span>
                    <p style={{ fontSize: 11, fontWeight: 600, color: files.length > 0 ? "#166534" : "#6b7280" }}>
                      {doc.label} {files.length > 1 ? `(${files.length})` : ""}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ─── Présentation (juste sous le récap complétude) ─── */}
          <div className="print-section" style={{ background: "white", borderRadius: 20, padding: isMobile ? 18 : 24, marginBottom: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6, display: "flex", alignItems: "center" }}>
              Présentation
              <Tooltip text="Une lettre de présentation courte humanise votre dossier. Expliquez votre projet (pourquoi ce logement, pourquoi cette ville, contexte pro), et ce que le proprio doit savoir sur vous. 500 caractères max." />
            </h2>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 12, lineHeight: 1.5 }}>
              Quelques lignes pour vous présenter au propriétaire — facultatif mais très apprécié. Pensez à cliquer sur « Sauvegarder mon dossier » en bas pour conserver vos modifications.
            </p>
            <textarea
              value={form.presentation}
              onChange={e => setForm(f => ({ ...f, presentation: e.target.value.slice(0, 500) }))}
              placeholder="Ex : Bonjour, je suis ingénieur en CDI depuis 3 ans. Je cherche un logement proche de mon nouveau bureau à partir du 1er septembre. Très soigneux, non fumeur, sans animaux."
              rows={4}
              style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #e5e7eb", borderRadius: 12, fontSize: isMobile ? 16 : 14, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box", lineHeight: 1.5 }}
            />
            <p style={{ fontSize: 11, color: "#9ca3af", margin: "6px 0 0", textAlign: "right" }}>{form.presentation.length}/500</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 380px", gap: isMobile ? 16 : 24, alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              <div className="print-section" style={{ background: "white", borderRadius: 20, padding: isMobile ? 18 : 24 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 20 }}>Identité</h2>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                  <F label="Nom complet">
                    <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="Jean Dupont" style={inputStyle} />
                  </F>
                  <F label="Téléphone">
                    <PhoneInput value={form.telephone} onChange={v => setForm(f => ({ ...f, telephone: v }))} placeholder="6 12 34 56 78" />
                  </F>
                </div>
                <F label="Email">
                  <input value={session?.user?.email || ""} disabled style={{ ...inputStyle, background: "#f9fafb", color: "#9ca3af" }} />
                </F>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                  <F label="Date de naissance">
                    <input type="date" value={form.date_naissance} onChange={e => setForm(f => ({ ...f, date_naissance: e.target.value }))} style={inputStyle} />
                  </F>
                  <F label="Nationalité">
                    <select value={form.nationalite} onChange={e => setForm(f => ({ ...f, nationalite: e.target.value }))} style={{ ...inputStyle, background: "white" }}>
                      <option value="">— Sélectionner —</option>
                      {NATIONALITES_COURANTES.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </F>
                </div>
                <F label="Situation familiale">
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {SITUATIONS_FAMILIALES.map(s => (
                      <button key={s} type="button" onClick={() => setForm(f => ({ ...f, situation_familiale: s }))}
                        style={{ padding: "7px 14px", borderRadius: 999, border: "1.5px solid", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                          background: form.situation_familiale === s ? "#111" : "white",
                          color: form.situation_familiale === s ? "white" : "#111",
                          borderColor: form.situation_familiale === s ? "#111" : "#e5e7eb" }}>
                        {s}
                      </button>
                    ))}
                  </div>
                </F>
                <F label="Nombre d'enfants à charge">
                  <input type="number" min={0} max={15} value={form.nb_enfants} onChange={e => setForm(f => ({ ...f, nb_enfants: Math.max(0, Math.min(15, Number(e.target.value) || 0)) }))} style={inputStyle} />
                </F>
              </div>

              <div className="print-section" style={{ background: "white", borderRadius: 20, padding: isMobile ? 18 : 24 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 20 }}>Situation professionnelle</h2>
                <F label="Statut">
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {SITUATIONS.map(s => (
                      <button key={s} onClick={() => setForm(f => ({ ...f, situation_pro: s }))}
                        style={{ padding: "7px 14px", borderRadius: 999, border: "1.5px solid", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, transition: "all 0.15s",
                          background: form.situation_pro === s ? "#111" : "white",
                          color: form.situation_pro === s ? "white" : "#111",
                          borderColor: form.situation_pro === s ? "#111" : "#e5e7eb" }}>
                        {s}
                      </button>
                    ))}
                  </div>
                </F>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginTop: 4 }}>
                  <F label={<>Revenus mensuels nets (€) <Tooltip text="Vos revenus nets après impôts et cotisations. La règle courante : les propriétaires attendent un revenu d'environ 3 fois le loyer. Ex : pour un loyer de 800 €, visez au moins 2400 € de revenus nets mensuels." /></>}>
                    <input type="number" value={form.revenus_mensuels} onChange={e => setForm(f => ({ ...f, revenus_mensuels: e.target.value }))} placeholder="2 500" style={inputStyle} />
                  </F>
                  <F label="Nombre d'occupants">
                    <input type="number" min={1} max={10} value={form.nb_occupants} onChange={e => setForm(f => ({ ...f, nb_occupants: Number(e.target.value) }))} style={inputStyle} />
                  </F>
                </div>
                {/* Employeur + date embauche : uniquement pour les situations salariées */}
                {["CDI", "CDD", "Intérim", "Fonctionnaire", "Alternance"].includes(form.situation_pro) && (
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                    <F label="Employeur">
                      <input value={form.employeur_nom} onChange={e => setForm(f => ({ ...f, employeur_nom: e.target.value }))} placeholder="Nom de votre employeur" style={inputStyle} />
                    </F>
                    <F label={<>Date d&apos;embauche <Tooltip text="L'ancienneté rassure les propriétaires. Un CDI de plus de 12 mois est un signal très positif." /></>}>
                      <input type="date" value={form.date_embauche} onChange={e => setForm(f => ({ ...f, date_embauche: e.target.value }))} style={inputStyle} />
                    </F>
                  </div>
                )}
              </div>

              {/* ─── Logement actuel ─── */}
              <div className="print-section" style={{ background: "white", borderRadius: 20, padding: isMobile ? 18 : 24 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 20 }}>Logement actuel</h2>
                <F label="Statut">
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {LOGEMENT_TYPES.map(l => (
                      <button key={l} type="button" onClick={() => setForm(f => ({ ...f, logement_actuel_type: l }))}
                        style={{ padding: "7px 14px", borderRadius: 999, border: "1.5px solid", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                          background: form.logement_actuel_type === l ? "#111" : "white",
                          color: form.logement_actuel_type === l ? "white" : "#111",
                          borderColor: form.logement_actuel_type === l ? "#111" : "#e5e7eb" }}>
                        {l}
                      </button>
                    ))}
                  </div>
                </F>
                <F label="Ville actuelle">
                  <input value={form.logement_actuel_ville} onChange={e => setForm(f => ({ ...f, logement_actuel_ville: e.target.value }))} placeholder="Ex : Paris" style={inputStyle} />
                </F>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                    <input type="checkbox" checked={form.a_apl} onChange={e => setForm(f => ({ ...f, a_apl: e.target.checked }))} style={{ width: 18, height: 18, accentColor: "#111", cursor: "pointer" }} />
                    <span style={{ fontSize: 14, color: "#111" }}>Je bénéficie des APL (aide au logement)</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                    <input type="checkbox" checked={form.mobilite_pro} onChange={e => setForm(f => ({ ...f, mobilite_pro: e.target.checked }))} style={{ width: 18, height: 18, accentColor: "#111", cursor: "pointer" }} />
                    <span style={{ fontSize: 14, color: "#111" }}>Je déménage pour raison professionnelle (éligible Visale)</span>
                  </label>
                </div>
              </div>

              <div className="print-section" style={{ background: "white", borderRadius: 20, padding: isMobile ? 18 : 24 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 20, display: "flex", alignItems: "center" }}>
                  Garant
                  <Tooltip text="Un garant est une personne ou un organisme qui s'engage à payer votre loyer si vous ne pouvez plus le faire. Avoir un garant rassure le propriétaire et multiplie vos chances d'obtenir un logement." />
                </h2>
                <F label="Avez-vous un garant ?">
                  <div style={{ display: "flex", gap: 10 }}>
                    {[{ val: true, label: "Oui" }, { val: false, label: "Non" }].map(opt => (
                      <button key={String(opt.val)} onClick={() => setForm(f => ({ ...f, garant: opt.val }))}
                        style={{ padding: "8px 24px", borderRadius: 999, border: "1.5px solid", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 600,
                          background: form.garant === opt.val ? "#111" : "white",
                          color: form.garant === opt.val ? "white" : "#111",
                          borderColor: form.garant === opt.val ? "#111" : "#e5e7eb" }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </F>
                {form.garant && (
                  <F label={<>Type de garant <Tooltip text="Personnel : un proche (parent, etc.) se porte caution sur ses revenus. Organisme Visale : garantie gratuite d'Action Logement (si éligible), très appréciée des proprios. Caution bancaire : somme bloquée en banque équivalente à plusieurs loyers." /></>}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {TYPES_GARANT.map(t => (
                        <button key={t} onClick={() => setForm(f => ({ ...f, type_garant: t }))}
                          style={{ padding: "7px 14px", borderRadius: 999, border: "1.5px solid", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                            background: form.type_garant === t ? "#111" : "white",
                            color: form.type_garant === t ? "white" : "#111",
                            borderColor: form.type_garant === t ? "#111" : "#e5e7eb" }}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </F>
                )}
              </div>

              <button onClick={sauvegarder} disabled={saving} className="no-print"
                style={{ background: saving ? "#9ca3af" : saved ? "#16a34a" : "#111", color: "white", border: "none", borderRadius: 999, padding: "14px 0", fontWeight: 700, fontSize: 15, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "background 0.2s" }}>
                {saving ? "Sauvegarde..." : saved ? "Dossier sauvegardé ✓" : "Sauvegarder mon dossier"}
              </button>
            </div>

            {/* Sidebar documents */}
            <div>
              <SharePanel />
              <AccessLogPanel />
              <div style={{ background: "white", borderRadius: 20, padding: isMobile ? 18 : 24, position: isMobile ? "static" : "sticky", top: 80 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 800 }}>Documents</h3>
                  <span style={{ fontSize: 12, fontWeight: 700, color: scoreColor }}>{docsCount}/{allDocs.length} catégories</span>
                </div>
                <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>PDF, JPG ou PNG. Plusieurs fichiers possibles pour les bulletins et quittances.</p>

                {DOCS_REQUIS.map(doc => (
                  <DocRow key={doc.key} docKey={doc.key} label={doc.label} desc={doc.desc} hint={doc.hint} />
                ))}

                {docsOptionnelsVisibles.length > 0 && (
                  <>
                    <div style={{ borderTop: "1px solid #f3f4f6", margin: "16px 0 12px" }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginTop: 12 }}>Recommandé selon votre situation</p>
                    </div>
                    {docsOptionnelsVisibles.map(doc => (
                      <DocRow key={doc.key} docKey={doc.key} label={doc.label} desc={doc.desc} />
                    ))}
                  </>
                )}

                {form.garant && (
                  <>
                    <div style={{ borderTop: "1px solid #f3f4f6", margin: "16px 0 12px" }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginTop: 12 }}>Documents garant</p>
                    </div>
                    {DOCS_GARANT.map(doc => (
                      <DocRow key={doc.key} docKey={doc.key} label={doc.label} desc={doc.desc} />
                    ))}
                  </>
                )}

              </div>

              {/* ─── Card Téléchargement dossier (sous les pièces) ─── */}
              <div className="no-print" style={{ background: "white", borderRadius: 20, padding: isMobile ? 18 : 22, marginTop: 16, border: "1.5px solid #e5e7eb" }}>
                <h3 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 4px" }}>Télécharger mon dossier</h3>
                <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 14px", lineHeight: 1.5 }}>
                  PDF récap + toutes les pièces justificatives, organisées par catégorie.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    type="button"
                    onClick={telechargerDossierZip}
                    disabled={generatingPDF}
                    style={{ width: "100%", background: generatingPDF ? "#9ca3af" : "#111", color: "white", border: "none", borderRadius: 12, padding: "12px 16px", fontWeight: 800, fontSize: 13, cursor: generatingPDF ? "wait" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    {generatingPDF ? "Préparation…" : "Dossier complet (.zip)"}
                  </button>
                  <button
                    type="button"
                    onClick={genererDossierPDFClick}
                    disabled={generatingPDF}
                    style={{ width: "100%", background: "white", color: "#111", border: "1.5px solid #e5e7eb", borderRadius: 12, padding: "10px 16px", fontWeight: 700, fontSize: 12, cursor: generatingPDF ? "wait" : "pointer", fontFamily: "inherit" }}>
                    PDF récap seul
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
