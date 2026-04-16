"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"

const SITUATIONS = ["CDI", "CDD", "Indépendant / Freelance", "Fonctionnaire", "Étudiant", "Retraité", "Sans emploi"]
const TYPES_GARANT = ["Personne physique", "Organisme (Visale, Action Logement)", "Aucun garant"]

type DocKey = "identite" | "bulletins" | "avis_imposition" | "contrat" | "quittances" | "rib" | "identite_garant" | "bulletins_garant" | "avis_garant"

// Nombre max de fichiers par catégorie
const DOC_MAX: Record<DocKey, number> = {
  identite: 1, bulletins: 3, avis_imposition: 1, contrat: 1,
  quittances: 3, rib: 1, identite_garant: 1, bulletins_garant: 3, avis_garant: 1,
}

const DOCS_REQUIS: { key: DocKey; label: string; desc: string }[] = [
  { key: "identite", label: "Pièce d'identité", desc: "CNI ou passeport en cours de validité" },
  { key: "bulletins", label: "3 derniers bulletins de salaire", desc: "Ajoutez jusqu'à 3 fichiers" },
  { key: "avis_imposition", label: "Dernier avis d'imposition", desc: "Disponible sur impots.gouv.fr" },
  { key: "contrat", label: "Contrat de travail", desc: "CDI, CDD ou justificatif de situation" },
  { key: "quittances", label: "Quittances de loyer", desc: "3 dernières — ajoutez jusqu'à 3 fichiers" },
  { key: "rib", label: "RIB", desc: "Relevé d'identité bancaire" },
]

const DOCS_GARANT: { key: DocKey; label: string; desc?: string }[] = [
  { key: "identite_garant", label: "Pièce d'identité du garant" },
  { key: "bulletins_garant", label: "Bulletins de salaire du garant", desc: "Jusqu'à 3 fichiers" },
  { key: "avis_garant", label: "Avis d'imposition du garant" },
]

// dossier_docs stocke { key: string[] } (tableau d'URLs par catégorie)
// Compatibilité avec l'ancien format { key: string }
function toArray(val: any): string[] {
  if (!val) return []
  if (Array.isArray(val)) return val
  return [val]
}

export default function Dossier() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [profil, setProfil] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState<DocKey | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [docs, setDocs] = useState<Record<string, string[]>>({})
  const [generatingPDF, setGeneratingPDF] = useState(false)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const [form, setForm] = useState({
    nom: "", telephone: "", situation_pro: "",
    revenus_mensuels: "", garant: false, type_garant: "", nb_occupants: 1,
  })

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/auth"); return }
    if (session?.user?.email) load()
  }, [session, status])

  async function load() {
    const { data } = await supabase.from("profils").select("*").eq("email", session!.user!.email!).single()
    if (data) {
      setProfil(data)
      setForm({
        nom: data.nom || session?.user?.name || "",
        telephone: data.telephone || "",
        situation_pro: data.situation_pro || "",
        revenus_mensuels: data.revenus_mensuels || "",
        garant: data.garant || false,
        type_garant: data.type_garant || "",
        nb_occupants: data.nb_occupants || 1,
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
      const ext = file.name.split(".").pop()
      const path = `${session.user.email}/${key}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from("dossiers").upload(path, file, { upsert: false })
      if (error) {
        setUploadError(`Erreur upload: ${error.message}`)
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
    await supabase.from("profils").upsert({
      email: session.user.email,
      nom: form.nom, telephone: form.telephone, situation_pro: form.situation_pro,
      revenus_mensuels: form.revenus_mensuels ? Number(form.revenus_mensuels) : null,
      garant: form.garant, type_garant: form.type_garant, nb_occupants: form.nb_occupants,
    }, { onConflict: "email" })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function genererDossierPDF() {
    setGeneratingPDF(true)
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"), import("html2canvas"),
      ])
      const el = document.getElementById("dossier-pdf-content")
      if (!el) { setGeneratingPDF(false); return }
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" })
      const imgData = canvas.toDataURL("image/png")
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const imgH = (canvas.height / canvas.width) * pageW
      let yPos = 0
      while (yPos < imgH) {
        if (yPos > 0) pdf.addPage()
        pdf.addImage(imgData, "PNG", 0, -yPos, pageW, imgH)
        yPos += pageH
      }
      pdf.save(`dossier_${(form.nom || "locataire").replace(/\s+/g, "_")}.pdf`)
    } catch (e: any) { alert("Erreur PDF: " + e.message) }
    setGeneratingPDF(false)
  }

  const allDocs = [...DOCS_REQUIS, ...(form.garant ? DOCS_GARANT : [])]
  // Compte le nombre de catégories avec au moins 1 fichier
  const docsCount = allDocs.filter(d => (docs[d.key] || []).length > 0).length
  const champs = [!!form.nom, !!form.telephone, !!form.situation_pro, !!form.revenus_mensuels, form.garant !== undefined, !!profil?.ville_souhaitee, !!profil?.budget_max]
  const scoreInfo = Math.round((champs.filter(Boolean).length / champs.length) * 100)
  const scoreDoc = allDocs.length > 0 ? Math.round((docsCount / allDocs.length) * 100) : 0
  const score = Math.round((scoreInfo + scoreDoc) / 2)
  const scoreColor = score >= 80 ? "#16a34a" : score >= 50 ? "#ea580c" : "#dc2626"

  if (status === "loading" || loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#6b7280" }}>Chargement...</div>
  )

  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</label>
      {children}
    </div>
  )

  const inputStyle: any = { width: "100%", padding: "10px 14px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }

  function DocRow({ docKey, label, desc }: { docKey: DocKey; label: string; desc?: string }) {
    const uploaded = docs[docKey] || []
    const max = DOC_MAX[docKey]
    const isUploading = uploading === docKey
    const canAdd = uploaded.length < max

    return (
      <div style={{ padding: "12px 0", borderBottom: "1px solid #f3f4f6" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: uploaded.length > 0 ? 8 : 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 700 }}>{label}</p>
            {desc && <p style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.4, marginTop: 2 }}>{desc}</p>}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, marginLeft: 12 }}>
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
                  onClick={() => fileRefs.current[docKey]?.click()}
                  disabled={isUploading}
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
            {uploaded.map((url, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "#f0fdf4", borderRadius: 8, padding: "5px 10px" }}>
                <span style={{ fontSize: 11, color: "#16a34a" }}>📄</span>
                <a href={url} target="_blank" rel="noopener"
                  style={{ fontSize: 12, fontWeight: 600, color: "#166534", textDecoration: "none", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  Fichier {i + 1}
                </a>
                <button onClick={() => removeDoc(docKey, i)}
                  style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", background: "none", border: "none", cursor: "pointer", padding: "0 4px", fontFamily: "inherit" }}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <style>{`@media print { nav, .no-print { display: none !important; } body { background: white !important; } .print-section { page-break-inside: avoid; } }`}</style>

      <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 48px" }}>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px" }}>Mon dossier locataire</h1>
              <p style={{ color: "#6b7280", fontSize: 14, marginTop: 4 }}>Complétez vos informations et déposez vos documents pour maximiser vos chances.</p>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ background: "white", borderRadius: 16, padding: "14px 18px", textAlign: "center", border: `2px solid ${scoreColor}` }}>
                <div style={{ fontSize: 26, fontWeight: 900, color: scoreColor }}>{score}%</div>
                <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", marginTop: 2 }}>Complétude</div>
                <div style={{ background: "#f3f4f6", borderRadius: 999, height: 3, marginTop: 6, width: 80 }}>
                  <div style={{ background: scoreColor, borderRadius: 999, height: 3, width: `${score}%`, transition: "width 0.4s" }} />
                </div>
              </div>
              <a href="/carnet" className="no-print"
                style={{ padding: "12px 20px", background: "white", color: "#111", border: "1.5px solid #e5e7eb", borderRadius: 12, fontWeight: 700, fontSize: 14, textDecoration: "none", display: "inline-block" }}>
                🔨 Carnet d'entretien
              </a>
              <button onClick={genererDossierPDF} disabled={generatingPDF} className="no-print"
                style={{ padding: "12px 20px", background: generatingPDF ? "#9ca3af" : "#111", color: "white", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: generatingPDF ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                {generatingPDF ? "Génération..." : "Télécharger PDF"}
              </button>
            </div>
          </div>

          {uploadError && (
            <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 12, padding: "12px 16px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ fontSize: 13, color: "#dc2626", fontWeight: 600 }}>{uploadError}</p>
              <button onClick={() => setUploadError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 18, fontWeight: 700 }}>×</button>
            </div>
          )}

          {/* Contenu PDF */}
          <div id="dossier-pdf-content" style={{ background: "white", borderRadius: 20, padding: 32, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, paddingBottom: 16, borderBottom: "2px solid #f3f4f6" }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 900 }}>Dossier locataire</h2>
                <p style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>Généré le {new Date().toLocaleDateString("fr-FR")}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: scoreColor }}>{score}%</div>
                <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, textTransform: "uppercase" }}>Complétude</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
              {[
                { label: "Nom", value: form.nom },
                { label: "Téléphone", value: form.telephone },
                { label: "Email", value: session?.user?.email },
                { label: "Statut pro", value: form.situation_pro },
                { label: "Revenus nets/mois", value: form.revenus_mensuels ? `${Number(form.revenus_mensuels).toLocaleString("fr-FR")} €` : "" },
                { label: "Garant", value: form.garant ? (form.type_garant || "Oui") : "Non" },
              ].map(f => (
                <div key={f.label} style={{ background: "#f9fafb", borderRadius: 10, padding: "10px 14px" }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", marginBottom: 4 }}>{f.label}</p>
                  <p style={{ fontSize: 13, fontWeight: 600 }}>{f.value || "—"}</p>
                </div>
              ))}
            </div>
            <h3 style={{ fontSize: 12, fontWeight: 800, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
              Pièces justificatives ({docsCount}/{allDocs.length} catégories)
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24, alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              <div className="print-section" style={{ background: "white", borderRadius: 20, padding: 24 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 20 }}>Informations personnelles</h2>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <F label="Nom complet">
                    <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="Jean Dupont" style={inputStyle} />
                  </F>
                  <F label="Téléphone">
                    <input value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} placeholder="06 00 00 00 00" style={inputStyle} />
                  </F>
                </div>
                <F label="Email">
                  <input value={session?.user?.email || ""} disabled style={{ ...inputStyle, background: "#f9fafb", color: "#9ca3af" }} />
                </F>
              </div>

              <div className="print-section" style={{ background: "white", borderRadius: 20, padding: 24 }}>
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 4 }}>
                  <F label="Revenus mensuels nets (€)">
                    <input type="number" value={form.revenus_mensuels} onChange={e => setForm(f => ({ ...f, revenus_mensuels: e.target.value }))} placeholder="2 500" style={inputStyle} />
                  </F>
                  <F label="Nombre d'occupants">
                    <input type="number" min={1} max={10} value={form.nb_occupants} onChange={e => setForm(f => ({ ...f, nb_occupants: Number(e.target.value) }))} style={inputStyle} />
                  </F>
                </div>
              </div>

              <div className="print-section" style={{ background: "white", borderRadius: 20, padding: 24 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 20 }}>Garant</h2>
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
                  <F label="Type de garant">
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
              <div style={{ background: "white", borderRadius: 20, padding: 24, position: "sticky", top: 80 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 800 }}>Documents</h3>
                  <span style={{ fontSize: 12, fontWeight: 700, color: scoreColor }}>{docsCount}/{allDocs.length} catégories</span>
                </div>
                <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>PDF, JPG ou PNG. Plusieurs fichiers possibles pour les bulletins et quittances.</p>

                {DOCS_REQUIS.map(doc => (
                  <DocRow key={doc.key} docKey={doc.key} label={doc.label} desc={doc.desc} />
                ))}

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

                <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "12px 14px", marginTop: 16 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 4 }}>Problème d'upload ?</p>
                  <p style={{ fontSize: 12, color: "#92400e", lineHeight: 1.5 }}>Vérifiez les politiques RLS du bucket <strong>dossiers</strong> dans Supabase (INSERT + UPDATE pour anon).</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
