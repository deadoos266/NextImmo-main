"use client"

import { useState, FormEvent, ReactNode, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { km } from "../../../../components/ui/km"
import { supabase } from "../../../../../lib/supabase"

// V95.A.1 — Annexes ALUR (loi 89-462 art. 3 + décret 2015-587)
type AnnexeKey = "dpe" | "erp" | "crep" | "notice_info"
type AnnexeState = {
  url: string | null
  included_in_bail: boolean
  not_required: boolean
}
type AnnexesAlur = Record<AnnexeKey, AnnexeState>

const EMPTY_ANNEXE: AnnexeState = { url: null, included_in_bail: false, not_required: false }
const EMPTY_ANNEXES_ALUR: AnnexesAlur = {
  dpe: { ...EMPTY_ANNEXE },
  erp: { ...EMPTY_ANNEXE },
  crep: { ...EMPTY_ANNEXE, not_required: true },  // par défaut non requis (sauf < 1949)
  notice_info: { ...EMPTY_ANNEXE },
}

interface ImporterForm {
  titre: string
  ville: string
  adresse: string
  codePostal: string         // V95.A.2 — Code postal requis pour mentions légales
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
  // V89.8 — Locataire déjà installé ?
  dejaInstalle: boolean        // true = il est déjà dans les murs
  dateEntreeReelle: string     // YYYY-MM-DD, si dejaInstalle=true
  edlEntreeDejaFait: boolean   // EDL d'entrée déjà fait hors plateforme
  loyersPassesPayes: boolean   // les loyers passés ont déjà été payés
  // V95.A.1 — Annexes ALUR
  annexesAlur: AnnexesAlur
  constructionAvant1949: boolean  // détermine si CREP requis
}

const EMPTY_FORM: ImporterForm = {
  titre: "",
  ville: "",
  adresse: "",
  codePostal: "",
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
  // V92.2 — Défaut "déjà installé" car c'est le CAS LE PLUS FRÉQUENT
  dejaInstalle: true,
  dateEntreeReelle: "",
  edlEntreeDejaFait: true,
  loyersPassesPayes: true,
  // V95.A.1 — Annexes ALUR (toutes en "à compléter" par défaut, sauf CREP qui
  // est marqué not_required par défaut — l'user coche "Construction avant 1949"
  // pour le rendre requis)
  annexesAlur: EMPTY_ANNEXES_ALUR,
  constructionAvant1949: false,
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

// V33.6 — Wrapper Suspense pour useSearchParams() — Next.js 15 exige un
// Suspense boundary autour des hooks de search params côté client.
export default function ImporterBailPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: "60vh", display: "grid", placeItems: "center", background: T.bg }}><p style={{ color: T.muted, fontSize: 14 }}>Chargement…</p></main>}>
      <ImporterBailPageInner />
    </Suspense>
  )
}

function ImporterBailPageInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [form, setForm] = useState<ImporterForm>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  // V96.19 — `success` state retiré, on redirect direct vers la fiche bail
  const [error, setError] = useState<string | null>(null)
  // V96.16 — Form unifié (plus de toggle simple/détaillé).
  // Avant : 2 modes (simple = 5 champs / détaillé = tout). Après audit V96,
  // les différences sont devenues minimes (adresse + annexes ALUR + dépôt +
  // message sont visibles dans les 2 modes). Un form unifié + champs
  // optionnels labelés est plus clair qu'un toggle ambigu.
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfUploading, setPdfUploading] = useState(false)
  // V96.1 — PDF EDL séparé (si EDL d'entrée déjà fait hors plateforme)
  const [edlPdfFile, setEdlPdfFile] = useState<File | null>(null)
  // V33.6 — Pré-remplissage depuis annonce déclinée (relance après refus)
  const [refusContexte, setRefusContexte] = useState<{ annonceId: number; raisonLabel: string; motif: string } | null>(null)
  const [prefillLoading, setPrefillLoading] = useState(false)

  const relanceRefusId = searchParams?.get("relance_refus")

  useEffect(() => {
    if (!relanceRefusId || !session?.user?.email) return
    const id = Number(relanceRefusId)
    if (!Number.isFinite(id)) return
    setPrefillLoading(true)
    void (async () => {
      try {
        // V65.1 — [BAIL_REFUSE] via /api (préreq REVOKE SELECT anon migration 058)
        const [{ data: ann }, refuseRes] = await Promise.all([
          supabase.from("annonces").select("id, titre, ville, adresse, surface, pieces, meuble, prix, charges, date_debut_bail, locataire_email").eq("id", id).maybeSingle(),
          fetch(`/api/messages/last-by-prefix?annonce_id=${id}&prefix=${encodeURIComponent("[BAIL_REFUSE]")}`, { cache: "no-store" })
            .then(r => r.ok ? r.json() : { ok: false })
            .catch(() => ({ ok: false })),
        ])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const refuseMsg = (refuseRes as any)?.ok ? (refuseRes as any).message : null
        const msgs = refuseMsg ? [refuseMsg] : []
        if (ann) {
          setForm(f => ({
            ...f,
            titre: ann.titre || f.titre,
            ville: ann.ville || f.ville,
            adresse: ann.adresse || f.adresse,
            surface: ann.surface != null ? String(ann.surface) : f.surface,
            pieces: ann.pieces != null ? String(ann.pieces) : f.pieces,
            meuble: !!ann.meuble,
            loyerHC: ann.prix != null ? String(ann.prix) : f.loyerHC,
            charges: ann.charges != null ? String(ann.charges) : f.charges,
            dateDebut: ann.date_debut_bail || f.dateDebut,
          }))
        }
        const last = msgs && msgs[0]
        if (last?.contenu) {
          try {
            const payload = JSON.parse(last.contenu.slice("[BAIL_REFUSE]".length))
            setRefusContexte({
              annonceId: id,
              raisonLabel: String(payload.raisonLabel || "Autre raison"),
              motif: String(payload.motif || ""),
            })
          } catch { /* ignore */ }
        }
      } finally {
        setPrefillLoading(false)
      }
    })()
  }, [relanceRefusId, session])

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

    // V96.2 — Helper : set error + scroll/focus sur le champ invalide (par id)
    // pour que l'user voit directement où ça coince.
    const failOn = (msg: string, fieldId?: string) => {
      setError(msg)
      if (fieldId && typeof window !== "undefined") {
        // Defer pour laisser React re-rendre l'error banner avant scroll
        setTimeout(() => {
          const el = document.getElementById(fieldId)
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" })
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
              el.focus()
            }
          }
        }, 50)
      }
    }

    // V96.16 — Titre toujours auto-dérivé si vide (form unifié, plus de mode simple)
    let titre = form.titre.trim()
    if (!titre) {
      titre = `Bail ${form.locataireEmail.split("@")[0] || "importé"}`
    }
    if (titre.length < 3) return failOn("Donnez un titre clair au bien (ex : 2 pièces Bastille 42m²)", "import-titre")
    // V95.A.2 — Adresse + CP + ville requis EN PREMIER (ordre form : ils sont en haut)
    if (form.adresse.trim().length < 4) return failOn("Adresse du logement requise (mentions légales quittances)", "import-adresse")
    if (!/^\d{5}$/.test(form.codePostal.trim())) return failOn("Code postal à 5 chiffres requis", "import-code-postal")
    if (form.ville.trim().length < 2) return failOn("Ville requise (mentions légales)", "import-ville")
    if (!Number(form.loyerHC) || Number(form.loyerHC) < 1) return failOn("Loyer hors charges requis", "import-loyerHC")
    if (!form.locataireEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.locataireEmail.trim())) {
      return failOn("Email du locataire invalide", "import-locataire-email")
    }
    if (!form.dateDebut) return failOn("Date de début du bail requise", "import-date-debut")
    // V95.A.4 — Le PDF du bail est obligatoire pour un import
    if (!pdfFile) return failOn("Le fichier PDF du bail est requis pour un import", "import-pdf")

    setSubmitting(true)
    try {
      // V34.4 — Upload PDF en simpleImport AVANT l'appel API (pour passer
      // l'URL en metadata si présent).
      let pdfFichierUrl: string | null = null
      if (pdfFile) {
        try {
          setPdfUploading(true)
          const ext = pdfFile.name.toLowerCase().endsWith(".pdf") ? "pdf" : ""
          if (!ext) throw new Error("Le fichier doit être un PDF")
          const proprio = (session?.user?.email || "").toLowerCase().replace(/[^a-z0-9]/g, "_")
          const path = `${proprio}/import-${Date.now()}.pdf`
          // Note : import dynamique pour ne pas bundler supabase si non utilisé.
          const { supabase } = await import("../../../../../lib/supabase")
          const { error: upErr } = await supabase.storage.from("baux").upload(path, pdfFile, {
            contentType: "application/pdf",
            upsert: false,
          })
          if (upErr) throw upErr
          const { data: pub } = supabase.storage.from("baux").getPublicUrl(path)
          pdfFichierUrl = pub?.publicUrl || null
        } catch (uerr) {
          setError(`Erreur upload PDF : ${uerr instanceof Error ? uerr.message : String(uerr)}`)
          setPdfUploading(false)
          setSubmitting(false)
          return
        } finally {
          setPdfUploading(false)
        }
      }

      // V96.1 — Upload PDF EDL si présent (uniquement si edlEntreeDejaFait coché)
      let edlPdfUrl: string | null = null
      if (form.dejaInstalle && form.edlEntreeDejaFait && edlPdfFile) {
        try {
          if (!edlPdfFile.name.toLowerCase().endsWith(".pdf")) {
            throw new Error("Le fichier EDL doit être un PDF")
          }
          const proprio = (session?.user?.email || "").toLowerCase().replace(/[^a-z0-9]/g, "_")
          const path = `${proprio}/edl-import-${Date.now()}.pdf`
          const { supabase } = await import("../../../../../lib/supabase")
          const { error: upErr } = await supabase.storage.from("baux").upload(path, edlPdfFile, {
            contentType: "application/pdf",
            upsert: false,
          })
          if (upErr) throw upErr
          const { data: pub } = supabase.storage.from("baux").getPublicUrl(path)
          edlPdfUrl = pub?.publicUrl || null
        } catch (uerr) {
          setError(`Erreur upload PDF EDL : ${uerr instanceof Error ? uerr.message : String(uerr)}`)
          setSubmitting(false)
          return
        }
      }

      // V95.A.1 — Si CREP marqué not_required mais le user a coché
      // constructionAvant1949, on force not_required=false
      const annexesAlurNormalized: AnnexesAlur = {
        ...form.annexesAlur,
        crep: {
          ...form.annexesAlur.crep,
          not_required: !form.constructionAvant1949 && form.annexesAlur.crep.not_required,
        },
      }

      const res = await fetch("/api/bail/importer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titre,
          ville: form.ville.trim(),
          adresse: form.adresse.trim(),
          codePostal: form.codePostal.trim(),
          surface: Number(form.surface) || undefined,
          pieces: Number(form.pieces) || undefined,
          meuble: form.meuble,
          loyerHC: Number(form.loyerHC),
          charges: Number(form.charges) || 0,
          depotGarantie: Number(form.depotGarantie) || 0,
          dateSignature: form.dateSignature || undefined,
          // V95.A.1 — Annexes ALUR
          annexesAlur: annexesAlurNormalized,
          constructionAvant1949: form.constructionAvant1949,
          dateDebut: form.dateDebut || undefined,
          dureeMois: Number(form.dureeMois) || 36,
          locataireEmail: form.locataireEmail.trim().toLowerCase(),
          messageProprio: form.messageProprio.trim() || undefined,
          // V34.4 — URL du PDF uploadé (transparent pour le caller — ignoré
          // si /api/bail/importer ne le supporte pas encore).
          pdfFichierUrl: pdfFichierUrl || undefined,
          // V89.8 — Situation actuelle du locataire (déjà installé ou non)
          dejaInstalle: form.dejaInstalle,
          dateEntreeReelle: form.dejaInstalle ? form.dateEntreeReelle || undefined : undefined,
          loyersPassesPayes: form.dejaInstalle ? form.loyersPassesPayes : false,
          edlEntreeDejaFait: form.dejaInstalle ? form.edlEntreeDejaFait : false,
          // V96.1 — URL du PDF EDL si fourni
          edlPdfUrl: edlPdfUrl || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || "Import a échoué.")
        return
      }
      // V96.19 — Notif rejet auto aux autres candidats sur la même annonce
      const retenuEmail = form.locataireEmail.trim().toLowerCase()
      if (retenuEmail && data.annonceId) {
        void fetch("/api/notifications/candidats-orphelins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ annonceId: data.annonceId, locataireRetenu: retenuEmail }),
        }).catch(err => console.warn("[importer] candidats-orphelins notify failed:", err))
      }
      // V96.19 — Au lieu d'afficher une page success intermédiaire "perdue",
      // on redirige direct vers la fiche bail (qui a déjà la checklist
      // conformité V95.C.2 + le PDF + les actions). Param ?just_imported=1
      // active un banner toast "Invitation envoyée" sur la fiche.
      router.push(`/proprietaire/bail/${data.annonceId}?just_imported=1`)
      return
    } catch (err) {
      console.error("[importer] submit failed", err)
      setError("Erreur réseau, réessayez.")
    } finally {
      setSubmitting(false)
    }
  }

  // V96.19 — Page success retirée. À la fin de l'import, redirect direct
  // vers /proprietaire/bail/[id]?just_imported=1 (la fiche bail affiche un
  // banner success + la checklist conformité, plus utile qu'un écran
  // intermédiaire "perdu" dans le vide).

  return (
    <main style={{ minHeight: "calc(100vh - 64px)", background: T.bg, padding: "32px 16px 64px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500&display=swap');`}</style>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <Link href="/proprietaire" style={{ fontSize: 12, color: T.muted, textDecoration: "none" }}>
            ← Retour
          </Link>
        </div>

        <p style={{ fontSize: 10, fontWeight: 700, color: refusContexte ? "#9a3412" : T.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 10px" }}>
          {refusContexte ? "Renvoyer après refus" : "Bail existant"}
        </p>
        <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 36, letterSpacing: "-0.5px", color: T.ink, margin: "0 0 8px", lineHeight: 1.15 }}>
          {refusContexte ? "Renvoyer une nouvelle invitation" : "Importer un bail signé hors plateforme"}
        </h1>
        <p style={{ fontSize: 14, color: T.muted, margin: "0 0 28px", lineHeight: 1.6, maxWidth: 560 }}>
          {refusContexte
            ? "Le formulaire a été pré-rempli avec les infos de l'annonce précédente. Ajustez ce qui doit l'être (notamment le loyer si la raison du refus le justifie) puis renvoyez l'invitation."
            : "Renseignez les informations clés du bail. Votre locataire recevra un email l'invitant à rejoindre KeyMatch — une fois accepté, vous pourrez générer ses quittances et utiliser tous les outils de gestion locative."}
        </p>

        {/* V33.6 — Banner contextuel relance après refus */}
        {refusContexte && (
          <div style={{ background: "#FBF6EA", border: "1px solid #EADFC6", borderRadius: 14, padding: "14px 18px", marginBottom: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#9a3412", textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 6px" }}>
              Raison du refus précédent
            </p>
            <p style={{ fontSize: 13, color: "#a16207", margin: 0, lineHeight: 1.55 }}>
              <strong>{refusContexte.raisonLabel}</strong>
              {refusContexte.motif && <> — « {refusContexte.motif} »</>}
            </p>
          </div>
        )}
        {prefillLoading && (
          <p style={{ fontSize: 12, color: T.muted, margin: "0 0 18px", fontStyle: "italic" }}>Pré-remplissage en cours…</p>
        )}

        {/* V96.16 — Toggle simple/détaillé retiré. Form unifié, champs
            optionnels clairement labelés en bas (Caractéristiques du bien). */}

        {/* V96.14 — Banner "Wizard bail KeyMatch" remis avec un LIEN
            FONCTIONNEL vers /proprietaire/ajouter (point d'entrée du wizard).
            Cas d'usage : un proprio qui hésite entre importer un PDF random
            et générer un bail KeyMatch conforme (signature eIDAS, annexes auto,
            IRL pré-calculé). On lui offre l'alternative en évidence. */}
        {!refusContexte && (
          <div style={{ background: "#F0FAEE", border: "1px solid #C6E9C0", borderRadius: 14, padding: "14px 18px", marginBottom: 20, display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <p style={{ fontWeight: 700, color: "#15803d", margin: 0, fontSize: 13 }}>
                💡 Pas de PDF prêt ? Générez un bail conforme ALUR
              </p>
              <p style={{ fontSize: 12, color: "#166534", margin: "4px 0 0", lineHeight: 1.55 }}>
                Si vous n&apos;avez pas encore de bail PDF (nouvelle location, ancien bail non conforme),
                utilisez le wizard KeyMatch : il génère un bail légal complet (signature électronique eIDAS,
                annexes obligatoires DPE/ERP/CREP, IRL pré-calculé, dépôt de garantie).
              </p>
            </div>
            <Link
              href="/proprietaire/ajouter"
              style={{
                background: "#15803d",
                color: "#fff",
                border: "none",
                borderRadius: 999,
                padding: "9px 16px",
                fontSize: 11.5,
                fontWeight: 700,
                textDecoration: "none",
                textTransform: "uppercase",
                letterSpacing: "0.4px",
                flexShrink: 0,
                fontFamily: "inherit",
                whiteSpace: "nowrap",
              }}
            >
              Générer un bail →
            </Link>
          </div>
        )}

        {/* V96.16 — Banner "Mode rapide" retiré (toggle simple/détaillé supprimé) */}

        <form onSubmit={onSubmit} style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 20, padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>

          {/* V96.16 — Form unifié. Sections : Logement (requis) → Bien (optionnel)
              → Loyer → Date → Locataire → Situation → PDF → Annexes ALUR → Message */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: 0 }}>
              Logement
            </p>

            <Field label="Adresse complète du logement *" hint="Numéro + rue. Sert aux mentions légales des quittances (loi 89-462 art. 21).">
              <input id="import-adresse" style={inputStyle} value={form.adresse} onChange={e => update("adresse", e.target.value)} placeholder="12 rue Saint-Antoine" maxLength={300} required />
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12 }}>
              <Field label="Code postal *">
                <input id="import-code-postal" style={inputStyle} value={form.codePostal} onChange={e => update("codePostal", e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="75011" maxLength={5} required />
              </Field>
              <Field label="Ville *">
                <input id="import-ville" style={inputStyle} value={form.ville} onChange={e => update("ville", e.target.value)} placeholder="Paris" maxLength={100} required />
              </Field>
            </div>

            <Field label="Titre du bien" hint="Ex : 2 pièces Bastille 42 m². Auto-rempli avec l'email du locataire si vide.">
              <input id="import-titre" style={inputStyle} value={form.titre} onChange={e => update("titre", e.target.value)} placeholder="2 pièces Bastille 42 m²" maxLength={200} />
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Field label="Surface (m²)" hint="Optionnel">
                <input style={inputStyle} type="number" min={0} max={2000} value={form.surface} onChange={e => update("surface", e.target.value)} placeholder="42" />
              </Field>
              <Field label="Pièces" hint="Optionnel">
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

          <p style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: 0 }}>Loyer</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="Loyer HC (€) *">
              <input id="import-loyerHC" style={inputStyle} type="number" min={1} max={50000} value={form.loyerHC} onChange={e => update("loyerHC", e.target.value)} placeholder="1100" required />
            </Field>
            <Field label="Charges (€)" hint="0 si incluses dans le loyer">
              <input style={inputStyle} type="number" min={0} max={5000} value={form.charges} onChange={e => update("charges", e.target.value)} placeholder="80" />
            </Field>
            <Field label="Dépôt de garantie (€)" hint="Utile pour la restitution">
              <input style={inputStyle} type="number" min={0} max={50000} value={form.depotGarantie} onChange={e => update("depotGarantie", e.target.value)} placeholder="1100" />
            </Field>
          </div>

          <div style={{ height: 1, background: T.line, margin: "4px 0" }} />

          <p style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: 0 }}>Dates du bail</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="Date de signature" hint="Quand le bail a été signé">
              <input style={inputStyle} type="date" value={form.dateSignature} onChange={e => update("dateSignature", e.target.value)} />
            </Field>
            <Field label="Date de début *" hint="Date d'effet du bail">
              <input id="import-date-debut" style={inputStyle} type="date" value={form.dateDebut} onChange={e => update("dateDebut", e.target.value)} required />
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
            <input id="import-locataire-email" style={inputStyle} type="email" value={form.locataireEmail} onChange={e => update("locataireEmail", e.target.value)} placeholder="locataire@email.com" required />
          </Field>

          {/* V89.8 — Locataire déjà installé ? */}
          <div style={{ height: 1, background: T.line, margin: "4px 0" }} />
          <p style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: 0 }}>Situation actuelle</p>
          <div style={{ background: "#FBF6EA", border: "1px solid #EADFC6", borderRadius: 14, padding: "14px 18px" }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.dejaInstalle}
                onChange={e => update("dejaInstalle", e.target.checked)}
                style={{ marginTop: 3, accentColor: T.ink }}
              />
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 13.5, color: "#9a3412" }}>
                  Le locataire est déjà installé dans le logement
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#a16207", lineHeight: 1.55 }}>
                  Cochez si le locataire vit déjà dans les murs depuis quelques mois (cas typique d&apos;une migration vers KeyMatch en cours de bail). On générera l&apos;historique des loyers déjà payés.
                </p>
              </div>
            </label>
          </div>

          {form.dejaInstalle && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingLeft: 14, borderLeft: `2px solid ${T.line}`, marginLeft: 4 }}>
              {/* V96.17 — Date d'entrée : label inline simple, plus de Field uppercase */}
              <div>
                <label htmlFor="import-date-entree" style={{ display: "block", fontSize: 13, fontWeight: 600, color: T.ink, marginBottom: 6 }}>
                  Date d&apos;entrée effective dans le logement
                </label>
                <input
                  id="import-date-entree"
                  style={inputStyle}
                  type="date"
                  value={form.dateEntreeReelle}
                  onChange={e => update("dateEntreeReelle", e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                />
                <p style={{ fontSize: 11, color: T.muted, margin: "4px 0 0", lineHeight: 1.45 }}>
                  Sert à générer rétroactivement les quittances mensuelles.
                </p>
              </div>

              {/* V96.17 — Toggles compactes en checkboxes inline, plus de gros labels */}
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: 13, color: T.ink, lineHeight: 1.5 }}>
                <input
                  type="checkbox"
                  checked={form.loyersPassesPayes}
                  onChange={e => update("loyersPassesPayes", e.target.checked)}
                  style={{ accentColor: T.ink, marginTop: 3, flexShrink: 0 }}
                />
                <span>Les loyers passés ont déjà été réglés hors KeyMatch <span style={{ color: T.muted, fontWeight: 400 }}>— on créera l&apos;historique automatiquement</span></span>
              </label>

              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: 13, color: T.ink, lineHeight: 1.5 }}>
                <input
                  type="checkbox"
                  checked={form.edlEntreeDejaFait}
                  onChange={e => update("edlEntreeDejaFait", e.target.checked)}
                  style={{ accentColor: T.ink, marginTop: 3, flexShrink: 0 }}
                />
                <span>L&apos;EDL d&apos;entrée a été signé entre les 2 parties hors plateforme</span>
              </label>

              {/* V96.1 — Upload PDF EDL si "EDL déjà fait" coché */}
              {form.edlEntreeDejaFait && (
                <div style={{ paddingLeft: 24 }}>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={e => setEdlPdfFile(e.target.files?.[0] || null)}
                    style={{
                      width: "100%", boxSizing: "border-box", padding: 10,
                      border: `1.5px dashed ${edlPdfFile ? "#15803d" : T.line}`,
                      borderRadius: 12, background: edlPdfFile ? "#F0FAEE" : T.card,
                      color: T.ink, fontFamily: "inherit", fontSize: 12,
                    }}
                  />
                  <p style={{ fontSize: 11, color: T.muted, margin: "6px 0 0", lineHeight: 1.45 }}>
                    Joindre le PDF de l&apos;EDL pour qu&apos;il soit accessible au locataire (recommandé, sert de preuve)
                  </p>
                  {edlPdfFile && (
                    <p style={{ fontSize: 11.5, color: "#15803d", margin: "4px 0 0", fontWeight: 600 }}>
                      ✓ {edlPdfFile.name} ({Math.round(edlPdfFile.size / 1024)} KB)
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* V95.A.4 — Upload PDF OBLIGATOIRE (le bail importé doit exister
              juridiquement avant import — sans PDF, on ne peut pas le prouver). */}
          <Field
            label="Bail PDF signé *"
            hint="Glisse ton fichier ou clique pour sélectionner. Le PDF est uploadé sur Supabase Storage et accessible au locataire. Le bail PDF est OBLIGATOIRE pour un import (preuve juridique)."
          >
            <input
              id="import-pdf"
              type="file"
              accept="application/pdf"
              onChange={e => setPdfFile(e.target.files?.[0] || null)}
              style={{
                width: "100%", boxSizing: "border-box", padding: 10,
                border: `1.5px dashed ${pdfFile ? "#15803d" : T.line}`,
                borderRadius: 12, background: pdfFile ? "#F0FAEE" : T.card,
                color: T.ink, fontFamily: "inherit", fontSize: 13,
              }}
            />
            {pdfFile && (
              <p style={{ fontSize: 11.5, color: "#15803d", margin: "6px 0 0", fontWeight: 600 }}>
                ✓ {pdfFile.name} ({Math.round(pdfFile.size / 1024)} KB)
              </p>
            )}
          </Field>

          {/* V95.A.1 — Annexes ALUR obligatoires (loi 89-462 art. 3) */}
          <div style={{ height: 1, background: T.line, margin: "4px 0" }} />
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: 0 }}>Annexes ALUR · Loi 89-462 art. 3</p>
            <p style={{ fontSize: 12, color: T.muted, margin: "6px 0 14px", lineHeight: 1.55 }}>
              Pour chaque annexe : cochez si elle est déjà intégrée dans le PDF principal, sinon uploadez-la séparément. Les annexes manquantes peuvent invalider certaines clauses du bail.
            </p>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: T.ink, marginBottom: 12, padding: "8px 12px", background: "#FBF6EA", border: "1px solid #EADFC6", borderRadius: 10 }}>
              <input
                type="checkbox"
                checked={form.constructionAvant1949}
                onChange={e => update("constructionAvant1949", e.target.checked)}
                style={{ accentColor: T.ink }}
              />
              Le logement a été construit <strong>avant 1949</strong> (rend le CREP obligatoire)
            </label>

            {(["dpe","erp","crep","notice_info"] as const).map(key => {
              const annexe = form.annexesAlur[key]
              const required: boolean = key === "crep" ? form.constructionAvant1949 : true
              const labels: Record<typeof key, { title: string; sub: string }> = {
                dpe: { title: "DPE — Diagnostic de Performance Énergétique", sub: "Obligatoire depuis 2007 (loi du 13 juillet 2005)" },
                erp: { title: "ERP — État des Risques et Pollutions", sub: "Obligatoire si zone à risque (sismique, inondation, etc.)" },
                crep: { title: "CREP — Constat Risque d'Exposition au Plomb", sub: form.constructionAvant1949 ? "Obligatoire (construction avant 1949)" : "Optionnel (construction après 1949)" },
                notice_info: { title: "Notice d'information du locataire", sub: "Décret 2015-587 — résumé droits et obligations" },
              }
              return (
                <div key={key} style={{ border: `1px solid ${T.line}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, background: T.card }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: T.ink }}>
                        {labels[key].title} {required && <span style={{ color: "#b91c1c" }}>*</span>}
                      </p>
                      <p style={{ margin: "2px 0 0", fontSize: 11, color: T.muted }}>{labels[key].sub}</p>
                    </div>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: T.ink }}>
                    <input
                      type="checkbox"
                      checked={annexe.included_in_bail}
                      onChange={e => update("annexesAlur", {
                        ...form.annexesAlur,
                        [key]: { ...annexe, included_in_bail: e.target.checked },
                      })}
                      style={{ accentColor: T.ink }}
                    />
                    Annexe déjà incluse dans le PDF principal du bail
                  </label>
                </div>
              )
            })}
          </div>

          {/* V96.3 — Message optionnel TOUJOURS visible (utile pour mettre le
              locataire en confiance, même en mode simple). */}
          <Field label="Message d'accompagnement (optionnel)" hint="Quelques mots pour mettre votre locataire en confiance — affichés dans l'email d'invitation.">
            <textarea
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.55, padding: "10px 14px" }}
              rows={3}
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
            <button type="submit" disabled={submitting || pdfUploading}
              style={{ background: (submitting || pdfUploading) ? T.muted : T.ink, color: "#fff", border: "none", borderRadius: 999, padding: "12px 28px", fontSize: 12, fontWeight: 700, cursor: (submitting || pdfUploading) ? "not-allowed" : "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}>
              {pdfUploading ? "Upload PDF…" : submitting ? "Envoi…" : "Envoyer l'invitation"}
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
