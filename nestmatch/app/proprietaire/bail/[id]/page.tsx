"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState, useMemo } from "react"
import { useRouter, useParams, useSearchParams } from "next/navigation"
import { supabase } from "../../../../lib/supabase"
import { useResponsive } from "../../../hooks/useResponsive"
import { postNotif } from "../../../../lib/notificationsClient"
import { genererBailPDF, type BailData } from "../../../../lib/bailPDF"
import {
  EQUIPEMENTS_MEUBLE_ALUR,
  EQUIPEMENTS_MEUBLE_CONFORT,
  ANNEXES_OBLIGATOIRES,
  CLAUSES_TYPES,
  IRL_DERNIER,
  estZoneTendue,
} from "../../../../lib/bailDefaults"
import Modal from "../../../components/ui/Modal"
import UploadBailModal from "../../../components/UploadBailModal"

// ─── Types form ─────────────────────────────────────────────────────────────
// Le state du form stocke TOUT en string pour l'input contrôlé (sauf bool/arrays).
// La conversion en BailData (typé) se fait au moment du submit.

type FormState = {
  // Type
  type: "vide" | "meuble"
  // Bailleur
  nomBailleur: string
  adresseBailleur: string
  telBailleur: string
  ibanBailleur: string
  bicBailleur: string
  // Locataire
  nomLocataire: string
  telLocataire: string
  dateNaissanceLocataire: string
  lieuNaissanceLocataire: string
  professionLocataire: string
  nationaliteLocataire: string
  // Garant
  garantActif: boolean
  nomGarant: string
  adresseGarant: string
  emailGarant: string
  telGarant: string
  lienGarant: string
  montantGarantie: string
  dureeGarantie: string
  // Usage
  usage: "habitation" | "mixte" | "secondaire"
  nbOccupantsMax: string
  colocation: boolean
  // Durée & dates
  duree: string
  dateDebut: string
  dateEntree: string
  // Règlement
  modeReglement: string
  dateReglement: string
  // Zone tendue & encadrement
  zoneTendue: boolean
  loyerReference: string
  loyerReferenceMajore: string
  complementLoyer: string
  justifComplement: string
  // Révision
  revisionActive: boolean
  dateRevision: string
  irlTrimestre: string
  irlIndice: string
  // Honoraires
  honoraires: string
  honorairesEtatLieux: string
  // Règles de vie
  animauxAutorises: boolean
  fumeurAutorise: boolean
  sousLocationAutorisee: boolean
  activiteProAutorisee: boolean
  // Équipements meublé + état
  equipementsMeuble: string[]
  travauxBailleur: string
  etatLogement: "neuf" | "renove" | "bon" | "ancien"
  // Assurance
  assuranceAFournir: boolean
  compagnieAssuranceBailleur: string
  // Clauses + annexes
  clausesChoisies: string[]
  clausesParticulieres: string
  annexes: string[]
}

function makeInitialForm(): FormState {
  return {
    type: "vide",
    nomBailleur: "",
    adresseBailleur: "",
    telBailleur: "",
    ibanBailleur: "",
    bicBailleur: "",
    nomLocataire: "",
    telLocataire: "",
    dateNaissanceLocataire: "",
    lieuNaissanceLocataire: "",
    professionLocataire: "",
    nationaliteLocataire: "",
    garantActif: false,
    nomGarant: "",
    adresseGarant: "",
    emailGarant: "",
    telGarant: "",
    lienGarant: "",
    montantGarantie: "",
    dureeGarantie: "3",
    usage: "habitation",
    nbOccupantsMax: "",
    colocation: false,
    duree: "36",
    dateDebut: "",
    dateEntree: "",
    modeReglement: "Virement bancaire",
    dateReglement: "Le 1er de chaque mois",
    zoneTendue: false,
    loyerReference: "",
    loyerReferenceMajore: "",
    complementLoyer: "",
    justifComplement: "",
    revisionActive: true,
    dateRevision: "Date anniversaire",
    irlTrimestre: IRL_DERNIER.trimestre,
    irlIndice: String(IRL_DERNIER.indice),
    honoraires: "",
    honorairesEtatLieux: "",
    animauxAutorises: false,
    fumeurAutorise: false,
    sousLocationAutorisee: false,
    activiteProAutorisee: false,
    equipementsMeuble: [],
    travauxBailleur: "",
    etatLogement: "bon",
    assuranceAFournir: true,
    compagnieAssuranceBailleur: "",
    clausesChoisies: [],
    clausesParticulieres: "",
    annexes: [
      "Dossier de diagnostic technique (DPE, CREP, ERP, électricité, gaz)",
      "Notice informative sur les droits et obligations (arrêté du 29 mai 2015)",
      "État des lieux d'entrée (établi contradictoirement)",
      "Attestation d'assurance habitation du locataire",
    ],
  }
}

// ─── Styles réutilisables (inline only — règle NestMatch) ──────────────────

const labelStyle = {
  fontSize: 12,
  fontWeight: 700,
  color: "#6b7280",
  display: "block",
  marginBottom: 6,
} as const

const helpStyle = {
  fontSize: 11,
  color: "#9ca3af",
  marginTop: 4,
  lineHeight: 1.5,
} as const

const cardStyle = (isMobile: boolean) =>
  ({
    background: "white",
    borderRadius: 20,
    padding: isMobile ? 20 : 28,
    marginBottom: 18,
  }) as const

const h2Style = {
  fontSize: 16,
  fontWeight: 800,
  marginBottom: 4,
  color: "#111",
} as const

const h2SubStyle = {
  fontSize: 12,
  color: "#6b7280",
  marginBottom: 18,
  lineHeight: 1.5,
} as const

// ─── Components helpers (hors du composant pour éviter perte de focus) ────

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  help,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  help?: string
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "11px 14px",
          border: "1.5px solid #e5e7eb",
          borderRadius: 10,
          fontSize: 15,
          outline: "none",
          boxSizing: "border-box",
          fontFamily: "inherit",
          color: "#111",
          background: "white",
        }}
      />
      {help && <p style={helpStyle}>{help}</p>}
    </div>
  )
}

function FieldTextarea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  help,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  help?: string
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        style={{
          width: "100%",
          padding: "11px 14px",
          border: "1.5px solid #e5e7eb",
          borderRadius: 10,
          fontSize: 14,
          outline: "none",
          boxSizing: "border-box",
          fontFamily: "inherit",
          resize: "vertical",
          color: "#111",
          background: "white",
          lineHeight: 1.5,
        }}
      />
      {help && <p style={helpStyle}>{help}</p>}
    </div>
  )
}

function FieldCheckbox({
  label,
  checked,
  onChange,
  help,
}: {
  label: string
  checked: boolean
  onChange: (b: boolean) => void
  help?: string
}) {
  return (
    <label
      style={{
        display: "flex",
        gap: 10,
        cursor: "pointer",
        padding: "10px 14px",
        borderRadius: 10,
        background: checked ? "#f0fdf4" : "#fafafa",
        border: `1.5px solid ${checked ? "#86efac" : "#e5e7eb"}`,
        alignItems: "flex-start",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ marginTop: 3, cursor: "pointer", accentColor: "#15803d" }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{label}</div>
        {help && (
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2, lineHeight: 1.5 }}>
            {help}
          </div>
        )}
      </div>
    </label>
  )
}

function SegmentedPicker<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { val: T; label: string; desc?: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {options.map(o => {
        const active = value === o.val
        return (
          <button
            key={o.val}
            type="button"
            onClick={() => onChange(o.val)}
            style={{
              flex: 1,
              minWidth: 140,
              padding: "12px 16px",
              borderRadius: 12,
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
              background: active ? "#111" : "white",
              color: active ? "white" : "#111",
              border: `1.5px solid ${active ? "#111" : "#e5e7eb"}`,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700 }}>{o.label}</div>
            {o.desc && (
              <div style={{ fontSize: 11, marginTop: 3, opacity: 0.7 }}>{o.desc}</div>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

const STORAGE_KEY_PREFIX = "nm_bail_brouillon_"

export default function BailPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const bienId = params.id as string
  const locatairePreselectionne = searchParams?.get("locataire") || ""
  const { isMobile } = useResponsive()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [bien, setBien] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [form, setForm] = useState<FormState>(makeInitialForm)
  const [brouillonRestaure, setBrouillonRestaure] = useState(false)
  const [brouillonDispo, setBrouillonDispo] = useState(false)

  // Modales
  const [modalEquipements, setModalEquipements] = useState(false)
  const [modalClauses, setModalClauses] = useState(false)
  const [modalAide, setModalAide] = useState<string | null>(null)
  const [modalUpload, setModalUpload] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState(false)

  // État d'un bail déjà envoyé (détecté via annonces.bail_genere_at + bail_signatures)
  const [existingBailAt, setExistingBailAt] = useState<string | null>(null)
  const [locataireSigne, setLocataireSigne] = useState(false)
  const [bailleurSigne, setBailleurSigne] = useState(false)
  const [confirmRegen, setConfirmRegen] = useState(false)

  const storageKey = bienId ? `${STORAGE_KEY_PREFIX}${bienId}` : ""

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth")
    if (session && bienId) void loadBien()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, status, bienId])

  async function loadBien() {
    const { data } = await supabase
      .from("annonces")
      .select("*")
      .eq("id", bienId)
      .single()
    if (data) {
      const emailFromQuery = locatairePreselectionne.trim().toLowerCase()
      if (emailFromQuery && !data.locataire_email) {
        await supabase
          .from("annonces")
          .update({ locataire_email: emailFromQuery })
          .eq("id", bienId)
        data.locataire_email = emailFromQuery
      }

      // Tentative de chargement profil proprio + locataire pour préremplissage
      // + détection d'un bail déjà envoyé (garde-fou contre la regénération par erreur)
      const [proprioProfil, locataireProfil, signaturesRes] = await Promise.all([
        data.proprietaire_email
          ? supabase
              .from("profils")
              .select("nom, telephone")
              .ilike("email", data.proprietaire_email)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        data.locataire_email
          ? supabase
              .from("profils")
              .select("nom, telephone, situation_pro")
              .ilike("email", data.locataire_email)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from("bail_signatures")
          .select("signataire_role")
          .eq("annonce_id", bienId),
      ])

      // État existing bail
      if (data.bail_genere_at) setExistingBailAt(data.bail_genere_at)
      console.log("[loadBien] signatures fetch:", {
        error: signaturesRes.error,
        count: signaturesRes.data?.length ?? 0,
        roles: signaturesRes.data?.map(s => s.signataire_role) ?? [],
      })
      if (signaturesRes.data) {
        const roles = new Set(signaturesRes.data.map(s => s.signataire_role))
        setLocataireSigne(roles.has("locataire"))
        setBailleurSigne(roles.has("bailleur"))
      } else if (signaturesRes.error) {
        console.error("[loadBien] bail_signatures error:", signaturesRes.error)
      }

      setBien(data)

      // Brouillon localStorage prioritaire ?
      let brouillon: Partial<FormState> | null = null
      if (typeof window !== "undefined" && storageKey) {
        try {
          const raw = window.localStorage.getItem(storageKey)
          if (raw) brouillon = JSON.parse(raw)
        } catch {
          /* ignore */
        }
      }

      const zone = estZoneTendue(data.ville || "")

      const base: FormState = {
        ...makeInitialForm(),
        type: data.meuble ? "meuble" : "vide",
        nomBailleur:
          (proprioProfil.data as { nom?: string } | null)?.nom ||
          data.proprietaire ||
          session?.user?.name ||
          "",
        adresseBailleur: "",
        telBailleur:
          (proprioProfil.data as { telephone?: string } | null)?.telephone || "",
        nomLocataire:
          (locataireProfil.data as { nom?: string } | null)?.nom || "",
        telLocataire:
          (locataireProfil.data as { telephone?: string } | null)?.telephone || "",
        professionLocataire:
          (locataireProfil.data as { situation_pro?: string } | null)
            ?.situation_pro || "",
        dateDebut: data.date_debut_bail || "",
        duree: data.meuble ? "12" : "36",
        zoneTendue: zone,
        animauxAutorises: !!data.animaux,
      }

      if (brouillon) {
        // Merge : priorité au brouillon pour tous les champs déjà saisis
        setForm({ ...base, ...brouillon })
        setBrouillonDispo(true)
      } else {
        setForm(base)
      }
    }
    setLoading(false)
  }

  // Auto-save brouillon (debounce 500ms)
  useEffect(() => {
    if (!storageKey || loading) return
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(form))
      } catch {
        /* quota exceeded, ignore */
      }
    }, 500)
    return () => clearTimeout(t)
  }, [form, storageKey, loading])

  const set =
    <K extends keyof FormState>(key: K) =>
    (v: FormState[K]) =>
      setForm(f => ({ ...f, [key]: v }))

  function toggleInArray(key: "equipementsMeuble" | "clausesChoisies" | "annexes", val: string) {
    setForm(f => {
      const arr = f[key]
      const next = arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
      return { ...f, [key]: next }
    })
  }

  // Payload BailData au submit
  const bailData: BailData | null = useMemo(() => {
    if (!bien) return null
    const locataireEmail = (bien.locataire_email || "").toLowerCase().trim()
    const n = (s: string) => Number(s.replace(",", ".")) || 0
    return {
      type: form.type,
      // Bailleur
      nomBailleur: form.nomBailleur,
      adresseBailleur: form.adresseBailleur,
      emailBailleur:
        bien.proprietaire_email || session?.user?.email || "",
      telBailleur: form.telBailleur || undefined,
      ibanBailleur: form.ibanBailleur || undefined,
      bicBailleur: form.bicBailleur || undefined,
      // Locataire
      nomLocataire: form.nomLocataire,
      emailLocataire: locataireEmail,
      telLocataire: form.telLocataire || undefined,
      dateNaissanceLocataire: form.dateNaissanceLocataire || undefined,
      lieuNaissanceLocataire: form.lieuNaissanceLocataire || undefined,
      professionLocataire: form.professionLocataire || undefined,
      nationaliteLocataire: form.nationaliteLocataire || undefined,
      // Garant
      garantActif: form.garantActif,
      nomGarant: form.garantActif ? form.nomGarant : undefined,
      adresseGarant: form.garantActif ? form.adresseGarant : undefined,
      emailGarant: form.garantActif ? form.emailGarant : undefined,
      telGarant: form.garantActif ? form.telGarant : undefined,
      lienGarant: form.garantActif ? form.lienGarant : undefined,
      montantGarantie: form.garantActif ? n(form.montantGarantie) : undefined,
      dureeGarantie: form.garantActif ? n(form.dureeGarantie) : undefined,
      // Bien
      titreBien: bien.titre || "",
      adresseBien: bien.adresse || "",
      villeBien: bien.ville || "",
      surface: Number(bien.surface) || 0,
      pieces: Number(bien.pieces) || 0,
      etage: bien.etage || "",
      description: bien.description || "",
      meuble: !!bien.meuble,
      parking: !!bien.parking,
      cave: !!bien.cave,
      balcon: !!bien.balcon,
      terrasse: !!bien.terrasse,
      jardin: !!bien.jardin,
      ascenseur: !!bien.ascenseur,
      fibre: !!bien.fibre,
      chambres: Number(bien.chambres) || 0,
      typeLogement: bien.type_bien || "",
      // Usage
      usage: form.usage,
      nbOccupantsMax: n(form.nbOccupantsMax) || undefined,
      colocation: form.colocation,
      // Durée
      dateDebut: form.dateDebut,
      duree: Number(form.duree) || 36,
      dateEntree: form.dateEntree || undefined,
      // Loyer
      loyerHC: Number(bien.prix) || 0,
      charges: Number(bien.charges) || 0,
      caution: Number(bien.caution) || Number(bien.prix) || 0,
      modeReglement: form.modeReglement,
      dateReglement: form.dateReglement,
      // Zone tendue
      zoneTendue: form.zoneTendue,
      loyerReference: form.loyerReference ? n(form.loyerReference) : undefined,
      loyerReferenceMajore: form.loyerReferenceMajore
        ? n(form.loyerReferenceMajore)
        : undefined,
      complementLoyer: form.complementLoyer ? n(form.complementLoyer) : undefined,
      justifComplement: form.justifComplement || undefined,
      // Révision
      revisionActive: form.revisionActive,
      dateRevision: form.revisionActive ? form.dateRevision : undefined,
      irlTrimestre: form.revisionActive ? form.irlTrimestre : undefined,
      irlIndice:
        form.revisionActive && form.irlIndice ? n(form.irlIndice) : undefined,
      // Honoraires
      honoraires: form.honoraires ? n(form.honoraires) : undefined,
      honorairesEtatLieux: form.honorairesEtatLieux
        ? n(form.honorairesEtatLieux)
        : undefined,
      // Règles
      animauxAutorises: form.animauxAutorises,
      fumeurAutorise: form.fumeurAutorise,
      sousLocationAutorisee: form.sousLocationAutorisee,
      activiteProAutorisee: form.activiteProAutorisee,
      // Équipements
      equipementsMeuble:
        form.type === "meuble" ? form.equipementsMeuble : undefined,
      travauxBailleur: form.travauxBailleur || undefined,
      etatLogement: form.etatLogement,
      // Assurance
      assuranceAFournir: form.assuranceAFournir,
      compagnieAssuranceBailleur: form.compagnieAssuranceBailleur || undefined,
      // Clauses
      clausesChoisies: form.clausesChoisies.length > 0 ? form.clausesChoisies : undefined,
      clausesParticulieres: form.clausesParticulieres || undefined,
      annexes: form.annexes.length > 0 ? form.annexes : undefined,
      // DPE
      dpe: bien.dpe || "",
    }
  }, [form, bien, session])

  async function generer() {
    if (!bien || !bailData || generating) return
    // Garde-fou : bail déjà signé par le locataire → bloqué (il faut un avenant)
    if (locataireSigne) {
      alert(
        "Le locataire a déjà signé ce bail. Vous ne pouvez pas le remplacer — un avenant (fonctionnalité à venir) sera nécessaire pour toute modification.",
      )
      return
    }
    // Garde-fou : bail envoyé mais pas encore signé → confirmation
    if (existingBailAt && !confirmRegen) {
      setConfirmRegen(true)
      return
    }
    setConfirmRegen(false)
    setGenerating(true)
    try {
      console.log("[generer] starting — bienId:", bien.id, "statut:", bien.statut)
      const locataireEmail = bailData.emailLocataire

      // PDF client-side (peut échouer si jsPDF plante)
      try {
        await genererBailPDF(bailData)
        console.log("[generer] PDF téléchargé")
      } catch (pdfErr) {
        console.error("[generer] PDF error:", pdfErr)
        alert(`Erreur PDF : ${pdfErr instanceof Error ? pdfErr.message : String(pdfErr)}`)
        return
      }

      if (locataireEmail) {
        const patch: Record<string, unknown> = {
          locataire_email: locataireEmail,
          bail_genere_at: new Date().toISOString(),
        }
        if (bien.statut !== "loué") patch.statut = "bail_envoye"
        if (form.dateDebut) patch.date_debut_bail = form.dateDebut
        console.log("[generer] update annonce patch:", patch)
        const { data: updData, error: updErr } = await supabase
          .from("annonces")
          .update(patch)
          .eq("id", bien.id)
          .select("id")
        console.log("[generer] update annonce result:", { updData, updErr })
        if (updErr) {
          alert(`Erreur mise à jour annonce : ${updErr.message} (code ${updErr.code || "?"})`)
          return
        }
        if (!updData || updData.length === 0) {
          alert("La mise à jour de l'annonce n'a affecté aucune ligne (RLS ?).")
          return
        }

        const fromEmail = (
          bien.proprietaire_email ||
          session?.user?.email ||
          ""
        ).toLowerCase()
        if (fromEmail) {
          const dateStr = form.dateDebut
            ? new Date(form.dateDebut).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            : ""
          const bailPayload = JSON.stringify(bailData)
          console.log("[generer] insert message [BAIL_CARD] from:", fromEmail, "to:", locataireEmail)
          const { data: msgData, error: msgErr } = await supabase
            .from("messages")
            .insert([
              {
                from_email: fromEmail,
                to_email: locataireEmail,
                contenu: `[BAIL_CARD]${bailPayload}`,
                lu: false,
                annonce_id: bien.id,
                created_at: new Date().toISOString(),
              },
            ])
            .select("id")
          console.log("[generer] insert message result:", { msgData, msgErr })
          if (msgErr) {
            alert(`Erreur envoi message : ${msgErr.message} (code ${msgErr.code || "?"})`)
            return
          }
          void postNotif({
            userEmail: locataireEmail,
            type: "bail_genere",
            title: "Bail généré",
            body: `Votre bail pour « ${bien.titre} » est disponible${dateStr ? ` (début ${dateStr})` : ""}.`,
            href: "/mon-logement",
            relatedId: String(bien.id),
          })
        } else {
          alert("Email bailleur introuvable — impossible d'envoyer le bail au locataire.")
          return
        }
      }

      // Clean brouillon après succès
      if (storageKey && typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(storageKey)
        } catch {
          /* ignore */
        }
      }
      alert("✓ Bail généré et envoyé au locataire.")
    } catch (err) {
      console.error("[generer] exception:", err)
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      alert(`Erreur inattendue : ${msg}`)
    } finally {
      setGenerating(false)
    }
  }

  function restaurerBrouillon() {
    setBrouillonRestaure(true)
    setBrouillonDispo(false)
  }

  function supprimerBrouillon() {
    if (storageKey && typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(storageKey)
      } catch {
        /* ignore */
      }
    }
    setForm(makeInitialForm())
    setBrouillonDispo(false)
  }

  if (loading)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          fontFamily: "'DM Sans', sans-serif",
          color: "#6b7280",
        }}
      >
        Chargement…
      </div>
    )
  if (!bien) return null

  const locataireKnown = !!(bien.locataire_email || "").trim()
  const prete = form.dateDebut && form.nomBailleur
  const loyer = Number(bien.prix) || 0
  const charges = Number(bien.charges) || 0
  const totalCC = loyer + charges
  const caution = Number(bien.caution) || loyer
  const equipementsOk =
    form.type !== "meuble" ||
    form.equipementsMeuble.length >= EQUIPEMENTS_MEUBLE_ALUR.length

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#F7F4EF",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 820,
          margin: "0 auto",
          padding: isMobile ? "24px 16px 120px" : "40px 48px 120px",
        }}
      >
        <button
          onClick={() => router.push("/proprietaire")}
          style={{
            fontSize: 13,
            color: "#6b7280",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            fontFamily: "inherit",
          }}
        >
          ← Retour à l&apos;espace propriétaire
        </button>

        <div style={{ marginTop: 16, marginBottom: 24 }}>
          <h1
            style={{
              fontSize: isMobile ? 24 : 30,
              fontWeight: 800,
              letterSpacing: "-0.5px",
              margin: 0,
            }}
          >
            Générateur de bail
          </h1>
          <p style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>
            {bien.titre} — {bien.ville}
          </p>
        </div>

        {/* Bail déjà envoyé — garde-fou + bouton téléchargement */}
        {existingBailAt && (
          <div
            style={{
              background: locataireSigne ? "#dcfce7" : "#fef3c7",
              border: `1.5px solid ${locataireSigne ? "#86efac" : "#fde68a"}`,
              borderRadius: 14,
              padding: "14px 18px",
              marginBottom: 20,
            }}
          >
            <p style={{ fontWeight: 700, fontSize: 14, margin: 0, color: locataireSigne ? "#15803d" : "#92400e" }}>
              {locataireSigne
                ? `✓ Bail déjà signé par le locataire`
                : `⚠ Un bail a déjà été envoyé au locataire`}
            </p>
            <p style={{ fontSize: 12, color: locataireSigne ? "#15803d" : "#92400e", margin: "4px 0 8px", lineHeight: 1.6 }}>
              {locataireSigne
                ? `Le locataire a signé ce bail. Pour toute modification, un avenant sera nécessaire (fonctionnalité à venir).${bailleurSigne ? " Vous avez également contresigné — le bail est pleinement signé." : ""}`
                : `Envoyé le ${new Date(existingBailAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}. Si vous générez un nouveau bail, le précédent restera dans la conversation mais le locataire sera invité à signer la nouvelle version.`}
            </p>
            <button
              type="button"
              onClick={async () => {
                try {
                  // Récupérer le dernier payload [BAIL_CARD] + signatures.
                  // Order par id (PRIMARY KEY toujours présent) au lieu de created_at.
                  const [msgRes, sigsRes] = await Promise.all([
                    supabase
                      .from("messages")
                      .select("contenu")
                      .eq("annonce_id", bien.id)
                      .ilike("contenu", "[BAIL_CARD]%")
                      .order("id", { ascending: false })
                      .limit(1)
                      .maybeSingle(),
                    supabase
                      .from("bail_signatures")
                      .select("signataire_role, signataire_nom, signature_png, signe_at, mention, ip_address")
                      .eq("annonce_id", bien.id),
                  ])
                  console.log("[bail download] msg:", msgRes, "sigs:", sigsRes)
                  if (msgRes.error) {
                    alert(`Erreur DB : ${msgRes.error.message} (code ${msgRes.error.code || "?"})`)
                    return
                  }
                  const msg = msgRes.data
                  const sigs = sigsRes.data
                  if (!msg?.contenu) {
                    alert("Aucun bail envoyé récent trouvé.")
                    return
                  }
                  const payload = JSON.parse(
                    (msg.contenu as string).slice("[BAIL_CARD]".length),
                  )
                  const signatures = (sigs || []).map(s => ({
                    role: s.signataire_role as "bailleur" | "locataire" | "garant",
                    nom: s.signataire_nom,
                    png: s.signature_png,
                    signeAt: s.signe_at,
                    mention: s.mention,
                    ipAddress: s.ip_address,
                  }))
                  // Si bail externe (URL PDF uploadé), ouvrir directement
                  if (payload.fichierUrl) {
                    window.open(String(payload.fichierUrl), "_blank")
                    return
                  }
                  await genererBailPDF({ ...payload, signatures })
                } catch (err) {
                  alert(`Erreur téléchargement : ${err instanceof Error ? err.message : String(err)}`)
                }
              }}
              style={{
                background: locataireSigne ? "#15803d" : "#9a3412",
                color: "white",
                border: "none",
                borderRadius: 10,
                padding: "10px 18px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              📄 Télécharger le bail {locataireSigne ? (bailleurSigne ? "signé" : "signé par le locataire") : "envoyé"} (PDF)
            </button>
          </div>
        )}

        {/* Import bail externe — raccourci en haut */}
        <div
          style={{
            background: "#eff6ff",
            border: "1.5px solid #bfdbfe",
            borderRadius: 14,
            padding: "14px 18px",
            marginBottom: 20,
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{ fontWeight: 700, color: "#1e40af", margin: 0, fontSize: 14 }}>
              Vous avez déjà votre bail en PDF ?
            </p>
            <p style={{ fontSize: 12, color: "#1e40af", margin: "2px 0 0", opacity: 0.85 }}>
              Avocat, autre application, modèle téléchargé… Importez votre document et passez directement à la signature.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (locataireSigne) {
                alert(
                  "Le locataire a déjà signé un bail. Un avenant sera nécessaire pour toute modification (fonctionnalité à venir).",
                )
                return
              }
              if (existingBailAt && !confirm(
                `Un bail a déjà été envoyé au locataire le ${new Date(existingBailAt).toLocaleDateString("fr-FR")}. L'importation d'un nouveau bail va remplacer celui en attente de signature. Continuer ?`,
              )) return
              setModalUpload(true)
            }}
            disabled={!(bien.locataire_email || "").trim() || locataireSigne}
            style={{
              background: (bien.locataire_email || "").trim() && !locataireSigne ? "#1d4ed8" : "#e5e7eb",
              color: (bien.locataire_email || "").trim() && !locataireSigne ? "white" : "#9ca3af",
              border: "none",
              borderRadius: 999,
              padding: "9px 18px",
              fontWeight: 700,
              fontSize: 13,
              cursor: (bien.locataire_email || "").trim() && !locataireSigne ? "pointer" : "not-allowed",
              fontFamily: "inherit",
              flexShrink: 0,
            }}
          >
            Importer mon bail →
          </button>
        </div>

        {uploadSuccess && (
          <div
            style={{
              background: "#dcfce7",
              border: "1.5px solid #86efac",
              borderRadius: 14,
              padding: "14px 18px",
              marginBottom: 20,
              fontSize: 13,
              color: "#15803d",
              fontWeight: 600,
            }}
          >
            ✓ Bail envoyé au locataire — il va recevoir une carte dans sa messagerie pour signer.
          </div>
        )}

        {/* Brouillon dispo */}
        {brouillonDispo && !brouillonRestaure && (
          <div
            style={{
              background: "#fef3c7",
              border: "1.5px solid #fde68a",
              borderRadius: 14,
              padding: "14px 18px",
              marginBottom: 20,
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ fontWeight: 700, color: "#92400e", margin: 0, fontSize: 14 }}>
                Un brouillon de ce bail a été retrouvé.
              </p>
              <p style={{ fontSize: 12, color: "#92400e", margin: "2px 0 0", opacity: 0.9 }}>
                Vous pouvez reprendre votre saisie ou repartir de zéro.
              </p>
            </div>
            <button
              onClick={restaurerBrouillon}
              style={{
                background: "#f59e0b",
                color: "white",
                border: "none",
                borderRadius: 8,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Reprendre
            </button>
            <button
              onClick={supprimerBrouillon}
              style={{
                background: "white",
                color: "#92400e",
                border: "1.5px solid #fde68a",
                borderRadius: 8,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Repartir de zéro
            </button>
          </div>
        )}

        {/* 1. Type de bail */}
        <div style={cardStyle(isMobile)}>
          <h2 style={h2Style}>1. Type de bail</h2>
          <p style={h2SubStyle}>
            Le type détermine la durée minimale et les règles de dépôt de garantie.
          </p>
          <SegmentedPicker
            value={form.type}
            options={[
              { val: "vide", label: "Location vide", desc: "Bail 3 ans, préavis 3 mois" },
              { val: "meuble", label: "Location meublée", desc: "Bail 1 an, préavis 1 mois" },
            ]}
            onChange={v =>
              setForm(f => ({
                ...f,
                type: v,
                duree: v === "meuble" ? "12" : "36",
              }))
            }
          />
        </div>

        {/* 2. Bailleur */}
        <div style={cardStyle(isMobile)}>
          <h2 style={h2Style}>2. Bailleur</h2>
          <p style={h2SubStyle}>Informations sur la personne qui loue le bien.</p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              gap: 16,
            }}
          >
            <FieldInput
              label="Nom et prénom *"
              value={form.nomBailleur}
              onChange={set("nomBailleur")}
              placeholder="Dupont Jean"
            />
            <FieldInput
              label="Téléphone"
              value={form.telBailleur}
              onChange={set("telBailleur")}
              placeholder="06 12 34 56 78"
              type="tel"
            />
            <div style={{ gridColumn: isMobile ? "auto" : "1 / -1" }}>
              <FieldInput
                label="Adresse postale"
                value={form.adresseBailleur}
                onChange={set("adresseBailleur")}
                placeholder="12 rue des Lilas, 75015 Paris"
              />
            </div>
            <FieldInput
              label="IBAN (pour virement)"
              value={form.ibanBailleur}
              onChange={set("ibanBailleur")}
              placeholder="FR76 1234 5678 9012 3456 7890 123"
              help="Facultatif — apparaît sur le bail si renseigné"
            />
            <FieldInput
              label="BIC"
              value={form.bicBailleur}
              onChange={set("bicBailleur")}
              placeholder="AGRIFRPP"
            />
          </div>
        </div>

        {/* 3. Locataire */}
        <div style={cardStyle(isMobile)}>
          <h2 style={h2Style}>3. Locataire</h2>
          <p style={h2SubStyle}>
            Informations sur la personne qui occupe le bien. Plus c&apos;est précis,
            plus le bail est officiel.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              gap: 16,
            }}
          >
            <FieldInput
              label="Nom et prénom *"
              value={form.nomLocataire}
              onChange={set("nomLocataire")}
              placeholder="Martin Sophie"
            />
            <div>
              <label style={labelStyle}>Email</label>
              <input
                value={bien.locataire_email || "Non renseigné"}
                disabled
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  border: "1.5px solid #e5e7eb",
                  borderRadius: 10,
                  fontSize: 15,
                  background: "#f9fafb",
                  color: "#6b7280",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
              />
            </div>
            <FieldInput
              label="Téléphone"
              value={form.telLocataire}
              onChange={set("telLocataire")}
              placeholder="06 12 34 56 78"
              type="tel"
            />
            <FieldInput
              label="Profession"
              value={form.professionLocataire}
              onChange={set("professionLocataire")}
              placeholder="Ingénieur, étudiant, CDI…"
            />
            <FieldInput
              label="Date de naissance"
              value={form.dateNaissanceLocataire}
              onChange={set("dateNaissanceLocataire")}
              type="date"
            />
            <FieldInput
              label="Lieu de naissance"
              value={form.lieuNaissanceLocataire}
              onChange={set("lieuNaissanceLocataire")}
              placeholder="Paris, Lyon…"
            />
            <FieldInput
              label="Nationalité"
              value={form.nationaliteLocataire}
              onChange={set("nationaliteLocataire")}
              placeholder="Française"
            />
          </div>
        </div>

        {/* 4. Garant / caution solidaire */}
        <div style={cardStyle(isMobile)}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 style={h2Style}>4. Caution solidaire (garant)</h2>
              <p style={{ ...h2SubStyle, marginBottom: 0 }}>
                Une personne qui s&apos;engage à payer si le locataire ne paie pas.
              </p>
            </div>
            <label
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 700,
                color: form.garantActif ? "#15803d" : "#6b7280",
              }}
            >
              <input
                type="checkbox"
                checked={form.garantActif}
                onChange={e => set("garantActif")(e.target.checked)}
                style={{ cursor: "pointer", accentColor: "#15803d" }}
              />
              {form.garantActif ? "Activé" : "Ajouter un garant"}
            </label>
          </div>

          {form.garantActif && (
            <div
              style={{
                marginTop: 18,
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                gap: 16,
              }}
            >
              <FieldInput
                label="Nom complet"
                value={form.nomGarant}
                onChange={set("nomGarant")}
                placeholder="Dupont Pierre"
              />
              <FieldInput
                label="Lien avec le locataire"
                value={form.lienGarant}
                onChange={set("lienGarant")}
                placeholder="Parent, conjoint, ami…"
              />
              <div style={{ gridColumn: isMobile ? "auto" : "1 / -1" }}>
                <FieldInput
                  label="Adresse"
                  value={form.adresseGarant}
                  onChange={set("adresseGarant")}
                  placeholder="Adresse postale du garant"
                />
              </div>
              <FieldInput
                label="Email"
                value={form.emailGarant}
                onChange={set("emailGarant")}
                type="email"
                placeholder="garant@email.fr"
              />
              <FieldInput
                label="Téléphone"
                value={form.telGarant}
                onChange={set("telGarant")}
                type="tel"
                placeholder="06 12 34 56 78"
              />
              <FieldInput
                label="Montant maximum engagé (€)"
                value={form.montantGarantie}
                onChange={set("montantGarantie")}
                type="number"
                placeholder={String(totalCC * 36)}
                help="Souvent loyer × durée du bail (obligatoire si engagement à durée indéterminée)"
              />
              <FieldInput
                label="Durée de l'engagement (années)"
                value={form.dureeGarantie}
                onChange={set("dureeGarantie")}
                type="number"
                placeholder="3"
              />
              <div
                style={{
                  gridColumn: isMobile ? "auto" : "1 / -1",
                  background: "#fff7ed",
                  border: "1.5px solid #fed7aa",
                  borderRadius: 10,
                  padding: "10px 14px",
                  fontSize: 12,
                  color: "#9a3412",
                  lineHeight: 1.6,
                }}
              >
                <strong>⚠ Important :</strong> Le garant devra signer un acte de
                cautionnement séparé, avec les mentions manuscrites prévues par
                l&apos;article 22-1 de la loi du 6 juillet 1989 («Lu et approuvé,
                bon pour caution solidaire à hauteur de…»).
              </div>
            </div>
          )}
        </div>

        {/* 5. Usage & occupation */}
        <div style={cardStyle(isMobile)}>
          <h2 style={h2Style}>5. Usage du logement</h2>
          <p style={h2SubStyle}>À quoi servira le logement ?</p>
          <SegmentedPicker
            value={form.usage}
            options={[
              { val: "habitation", label: "Résidence principale", desc: "Usage habituel" },
              { val: "secondaire", label: "Résidence secondaire", desc: "Usage occasionnel" },
              { val: "mixte", label: "Mixte", desc: "Habitation + activité pro" },
            ]}
            onChange={set("usage")}
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              gap: 16,
              marginTop: 18,
            }}
          >
            <FieldInput
              label="Nombre maximum d'occupants"
              value={form.nbOccupantsMax}
              onChange={set("nbOccupantsMax")}
              type="number"
              placeholder="2"
              help="Facultatif — limite le nombre de personnes autorisées dans le logement"
            />
            <div style={{ display: "flex", alignItems: "center" }}>
              <FieldCheckbox
                label="Colocation"
                checked={form.colocation}
                onChange={set("colocation")}
                help="Active la clause de solidarité entre colocataires"
              />
            </div>
          </div>
        </div>

        {/* 6. Durée & dates */}
        <div style={cardStyle(isMobile)}>
          <h2 style={h2Style}>6. Durée du bail & dates</h2>
          <p style={h2SubStyle}>Période de location.</p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",
              gap: 16,
            }}
          >
            <FieldInput
              label="Date de début *"
              value={form.dateDebut}
              onChange={set("dateDebut")}
              type="date"
            />
            <FieldInput
              label="Date d'entrée (remise des clés)"
              value={form.dateEntree}
              onChange={set("dateEntree")}
              type="date"
              help="Si différent du début du bail"
            />
            <div>
              <label style={labelStyle}>Durée</label>
              <select
                value={form.duree}
                onChange={e => set("duree")(e.target.value)}
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  border: "1.5px solid #e5e7eb",
                  borderRadius: 10,
                  fontSize: 15,
                  outline: "none",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  background: "white",
                  color: "#111",
                }}
              >
                {form.type === "meuble"
                  ? [9, 12, 24].map(v => (
                      <option key={v} value={v}>
                        {v} mois{v === 9 ? " (étudiant)" : ""}
                      </option>
                    ))
                  : [36, 72].map(v => (
                      <option key={v} value={v}>
                        {v / 12} ans
                      </option>
                    ))}
              </select>
            </div>
          </div>
        </div>

        {/* 7. Loyer & charges */}
        <div style={cardStyle(isMobile)}>
          <h2 style={h2Style}>7. Loyer & encadrement</h2>
          <p style={h2SubStyle}>
            Les montants viennent de l&apos;annonce. Pour les modifier, passez par
            l&apos;onglet &nbsp;Statistiques&nbsp; du bien.
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 0,
              marginBottom: 18,
              borderRadius: 12,
              background: "#fafafa",
              padding: "6px 14px",
            }}
          >
            {[
              { label: "Loyer mensuel HC", val: `${loyer.toLocaleString("fr-FR")} €` },
              { label: "Charges mensuelles", val: `${charges.toLocaleString("fr-FR")} €` },
              {
                label: "Total charges comprises",
                val: `${totalCC.toLocaleString("fr-FR")} €`,
                bold: true,
              },
              { label: "Dépôt de garantie", val: `${caution.toLocaleString("fr-FR")} €` },
            ].map((r, i, arr) => (
              <div
                key={r.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "10px 0",
                  borderBottom: i < arr.length - 1 ? "1px solid #eee" : "none",
                }}
              >
                <span style={{ fontSize: 14, color: "#6b7280" }}>{r.label}</span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: r.bold ? 800 : 600,
                    color: "#111",
                  }}
                >
                  {r.val}
                </span>
              </div>
            ))}
          </div>

          <FieldCheckbox
            label={`Logement situé en zone tendue${estZoneTendue(bien.ville || "") ? " — détecté automatiquement" : ""}`}
            checked={form.zoneTendue}
            onChange={set("zoneTendue")}
            help="Impact : préavis locataire réduit à 1 mois + encadrement possible du loyer (Paris, Lille, Lyon, Bordeaux…)."
          />

          {form.zoneTendue && (
            <div
              style={{
                marginTop: 16,
                background: "#fff7ed",
                border: "1.5px solid #fed7aa",
                borderRadius: 12,
                padding: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, color: "#9a3412" }}>
                  Encadrement du loyer (loi ELAN)
                </div>
                <button
                  type="button"
                  onClick={() => setModalAide("encadrement")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#9a3412",
                    fontSize: 12,
                    cursor: "pointer",
                    fontWeight: 700,
                    fontFamily: "inherit",
                    textDecoration: "underline",
                  }}
                >
                  Qu&apos;est-ce que c&apos;est ?
                </button>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                  gap: 12,
                }}
              >
                <FieldInput
                  label="Loyer de référence (€/m²)"
                  value={form.loyerReference}
                  onChange={set("loyerReference")}
                  type="number"
                  placeholder="ex: 22.5"
                />
                <FieldInput
                  label="Loyer de référence majoré (€/m²)"
                  value={form.loyerReferenceMajore}
                  onChange={set("loyerReferenceMajore")}
                  type="number"
                  placeholder="ex: 27"
                />
                <FieldInput
                  label="Complément de loyer (€)"
                  value={form.complementLoyer}
                  onChange={set("complementLoyer")}
                  type="number"
                  placeholder="0"
                  help="Autorisé si caractéristiques exceptionnelles (terrasse, vue, dernier étage…)"
                />
                <FieldInput
                  label="Justification du complément"
                  value={form.justifComplement}
                  onChange={set("justifComplement")}
                  placeholder="Ex: terrasse 20m², vue dégagée"
                />
              </div>
            </div>
          )}
        </div>

        {/* 8. Règlement & révision */}
        <div style={cardStyle(isMobile)}>
          <h2 style={h2Style}>8. Règlement & révision annuelle</h2>
          <p style={h2SubStyle}>
            Comment et quand le locataire paie — et comment le loyer peut évoluer
            chaque année.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              gap: 16,
            }}
          >
            <div>
              <label style={labelStyle}>Mode de règlement</label>
              <select
                value={form.modeReglement}
                onChange={e => set("modeReglement")(e.target.value)}
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  border: "1.5px solid #e5e7eb",
                  borderRadius: 10,
                  fontSize: 15,
                  outline: "none",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  background: "white",
                  color: "#111",
                }}
              >
                <option>Virement bancaire</option>
                <option>Prélèvement automatique</option>
                <option>Chèque</option>
                <option>Espèces (plafond 1 000 €/mois)</option>
              </select>
            </div>
            <FieldInput
              label="Date de paiement"
              value={form.dateReglement}
              onChange={set("dateReglement")}
              placeholder="Le 1er de chaque mois"
            />
          </div>

          <div style={{ marginTop: 18 }}>
            <FieldCheckbox
              label="Révision annuelle automatique selon l'IRL"
              checked={form.revisionActive}
              onChange={set("revisionActive")}
              help="Sans clause de révision, le loyer ne peut pas être augmenté chaque année."
            />
          </div>

          {form.revisionActive && (
            <div
              style={{
                marginTop: 14,
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",
                gap: 14,
              }}
            >
              <FieldInput
                label="Date de révision"
                value={form.dateRevision}
                onChange={set("dateRevision")}
                placeholder="Ex: 1er janvier"
              />
              <FieldInput
                label={`IRL de référence (${IRL_DERNIER.trimestre})`}
                value={form.irlTrimestre}
                onChange={set("irlTrimestre")}
                placeholder={IRL_DERNIER.trimestre}
              />
              <FieldInput
                label="Indice IRL"
                value={form.irlIndice}
                onChange={set("irlIndice")}
                type="number"
                placeholder={String(IRL_DERNIER.indice)}
                help={`Dernier IRL publié : ${IRL_DERNIER.indice} (${IRL_DERNIER.publicationDate}, ${IRL_DERNIER.variation})`}
              />
            </div>
          )}
        </div>

        {/* 9. Honoraires */}
        <div style={cardStyle(isMobile)}>
          <h2 style={h2Style}>9. Honoraires</h2>
          <p style={h2SubStyle}>
            Frais facturés au locataire (plafonnés par la loi selon la zone).
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              gap: 16,
            }}
          >
            <FieldInput
              label="Honoraires totaux locataire (€)"
              value={form.honoraires}
              onChange={set("honoraires")}
              type="number"
              placeholder="0"
              help="Laissez à 0 si location entre particuliers sans agence"
            />
            <FieldInput
              label="Dont part état des lieux (€)"
              value={form.honorairesEtatLieux}
              onChange={set("honorairesEtatLieux")}
              type="number"
              placeholder="0"
              help="Plafond 3 €/m² loi ALUR"
            />
          </div>
        </div>

        {/* 10. Règles de vie */}
        <div style={cardStyle(isMobile)}>
          <h2 style={h2Style}>10. Règles de vie</h2>
          <p style={h2SubStyle}>Ce qui est autorisé ou non dans le logement.</p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              gap: 12,
            }}
          >
            <FieldCheckbox
              label="Animaux domestiques autorisés"
              checked={form.animauxAutorises}
              onChange={set("animauxAutorises")}
              help="Chiens de 1ʳᵉ catégorie toujours interdits par la loi."
            />
            <FieldCheckbox
              label="Fumeur autorisé"
              checked={form.fumeurAutorise}
              onChange={set("fumeurAutorise")}
            />
            <FieldCheckbox
              label="Sous-location autorisée"
              checked={form.sousLocationAutorisee}
              onChange={set("sousLocationAutorisee")}
              help="Concerne Airbnb et équivalents. Jamais supérieure au loyer principal."
            />
            <FieldCheckbox
              label="Activité professionnelle autorisée"
              checked={form.activiteProAutorisee}
              onChange={set("activiteProAutorisee")}
              help="Hors activité commerciale ou artisanale."
            />
          </div>
        </div>

        {/* 11. Équipements meublé */}
        {form.type === "meuble" && (
          <div style={cardStyle(isMobile)}>
            <h2 style={h2Style}>11. Équipements du logement meublé</h2>
            <p style={h2SubStyle}>
              La loi ALUR impose 11 équipements obligatoires pour un bail meublé.
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: equipementsOk ? "#f0fdf4" : "#fff7ed",
                border: `1.5px solid ${equipementsOk ? "#86efac" : "#fed7aa"}`,
                borderRadius: 12,
                padding: "12px 16px",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: equipementsOk ? "#15803d" : "#9a3412",
                  }}
                >
                  {form.equipementsMeuble.length} équipement
                  {form.equipementsMeuble.length > 1 ? "s" : ""} coché
                  {form.equipementsMeuble.length > 1 ? "s" : ""}
                  {!equipementsOk &&
                    ` — ${EQUIPEMENTS_MEUBLE_ALUR.length - form.equipementsMeuble.filter(e => EQUIPEMENTS_MEUBLE_ALUR.includes(e as (typeof EQUIPEMENTS_MEUBLE_ALUR)[number])).length} obligatoire(s) manquant(s)`}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  Les 11 équipements ALUR doivent être cochés pour un meublé conforme.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalEquipements(true)}
                style={{
                  background: "#111",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  flexShrink: 0,
                }}
              >
                Sélectionner
              </button>
            </div>
          </div>
        )}

        {/* 12. État & travaux */}
        <div style={cardStyle(isMobile)}>
          <h2 style={h2Style}>12. État du logement & travaux</h2>
          <p style={h2SubStyle}>
            L&apos;état général influence le dépôt de garantie et la vétusté.
          </p>
          <SegmentedPicker
            value={form.etatLogement}
            options={[
              { val: "neuf", label: "Neuf" },
              { val: "renove", label: "Rénové" },
              { val: "bon", label: "Bon état" },
              { val: "ancien", label: "Ancien" },
            ]}
            onChange={set("etatLogement")}
          />
          <div style={{ marginTop: 16 }}>
            <FieldTextarea
              label="Travaux convenus à la charge du bailleur"
              value={form.travauxBailleur}
              onChange={set("travauxBailleur")}
              rows={3}
              placeholder="Ex : peinture de la cuisine à réaliser avant le 30/09, remplacement du chauffe-eau…"
              help="Facultatif — engagements du bailleur qui seront inscrits dans le bail"
            />
          </div>
        </div>

        {/* 13. Assurance */}
        <div style={cardStyle(isMobile)}>
          <h2 style={h2Style}>13. Assurances</h2>
          <p style={h2SubStyle}>
            Le locataire doit fournir une attestation d&apos;assurance habitation.
          </p>
          <FieldCheckbox
            label="Le locataire doit fournir son attestation d'assurance"
            checked={form.assuranceAFournir}
            onChange={set("assuranceAFournir")}
            help="Obligation légale — à renouveler chaque année."
          />
          <div style={{ marginTop: 14 }}>
            <FieldInput
              label="Compagnie d'assurance PNO du bailleur"
              value={form.compagnieAssuranceBailleur}
              onChange={set("compagnieAssuranceBailleur")}
              placeholder="Ex : MAIF, Allianz… (facultatif)"
            />
          </div>
        </div>

        {/* 14. Clauses particulières */}
        <div style={cardStyle(isMobile)}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 16,
            }}
          >
            <div>
              <h2 style={h2Style}>14. Clauses particulières</h2>
              <p style={{ ...h2SubStyle, marginBottom: 0 }}>
                Ajoutez des clauses préfaites ou rédigez les vôtres.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setModalClauses(true)}
              style={{
                background: "white",
                color: "#111",
                border: "1.5px solid #111",
                borderRadius: 8,
                padding: "9px 16px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                flexShrink: 0,
              }}
            >
              📚 Modèles de clauses ({form.clausesChoisies.length})
            </button>
          </div>

          {form.clausesChoisies.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginBottom: 14,
              }}
            >
              {form.clausesChoisies.map(titre => (
                <span
                  key={titre}
                  style={{
                    background: "#f3f4f6",
                    color: "#111",
                    borderRadius: 999,
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {titre}
                  <button
                    type="button"
                    onClick={() => toggleInArray("clausesChoisies", titre)}
                    aria-label="Retirer"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#6b7280",
                      fontSize: 14,
                      padding: 0,
                      lineHeight: 1,
                      fontFamily: "inherit",
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <FieldTextarea
            label="Clauses supplémentaires (texte libre)"
            value={form.clausesParticulieres}
            onChange={set("clausesParticulieres")}
            rows={4}
            placeholder="Écrivez ici vos propres clauses particulières…"
          />
        </div>

        {/* 15. Annexes */}
        <div style={cardStyle(isMobile)}>
          <h2 style={h2Style}>15. Annexes au bail</h2>
          <p style={h2SubStyle}>
            Documents à joindre au PDF (la liste apparaît dans le bail).
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {ANNEXES_OBLIGATOIRES.map(a => (
              <FieldCheckbox
                key={a}
                label={a}
                checked={form.annexes.includes(a)}
                onChange={() => toggleInArray("annexes", a)}
              />
            ))}
          </div>
        </div>

        {/* Génération */}
        {form.type === "meuble" && !equipementsOk && (
          <div
            style={{
              background: "#fef3c7",
              border: "1.5px solid #fde68a",
              borderRadius: 12,
              padding: "12px 16px",
              marginBottom: 14,
              fontSize: 13,
              color: "#92400e",
              lineHeight: 1.6,
            }}
          >
            ⚠ Il manque des équipements obligatoires pour un bail meublé ALUR.
            Cliquez sur «&nbsp;Sélectionner&nbsp;» dans la section 11.
          </div>
        )}

        {/* Raisons pour lesquelles le bouton est désactivé — visible, pas silencieux */}
        {!form.dateDebut && (
          <div style={{ background: "#fff7ed", border: "1.5px solid #fed7aa", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#9a3412" }}>
            ⚠ <strong>Date de début manquante</strong> — remplissez la section <em>« 6. Durée du bail & dates »</em> pour activer le bouton.
          </div>
        )}
        {!form.nomBailleur && (
          <div style={{ background: "#fff7ed", border: "1.5px solid #fed7aa", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#9a3412" }}>
            ⚠ <strong>Nom du bailleur manquant</strong> — remplissez la section <em>« 2. Bailleur »</em>.
          </div>
        )}

        {(() => {
          const bloque = locataireSigne
          const label = bloque
            ? "Bail déjà signé — modification impossible"
            : locataireKnown
              ? generating
                ? "Génération en cours…"
                : existingBailAt
                  ? confirmRegen
                    ? "Confirmer le remplacement"
                    : "Remplacer le bail envoyé"
                  : "Générer le bail PDF et envoyer au locataire"
              : "Générer le bail PDF"
          const actif = prete && !generating && !bloque
          return (
            <button
              onClick={() => {
                if (!actif && !bloque && !generating) {
                  const missing: string[] = []
                  if (!form.dateDebut) missing.push("la date de début")
                  if (!form.nomBailleur) missing.push("le nom du bailleur")
                  alert(`Pour générer le bail, remplissez : ${missing.join(" et ")}.`)
                  return
                }
                void generer()
              }}
              disabled={bloque || generating}
              style={{
                width: "100%",
                padding: "18px 32px",
                background: bloque
                  ? "#e5e7eb"
                  : confirmRegen
                    ? "#ea580c"
                    : actif
                      ? "#111"
                      : "#e5e7eb",
                color: actif ? "white" : "#9ca3af",
                border: "none",
                borderRadius: 16,
                fontWeight: 800,
                fontSize: 16,
                cursor: actif ? "pointer" : "not-allowed",
                fontFamily: "inherit",
              }}
            >
              {label}
            </button>
          )
        })()}

        {confirmRegen && !locataireSigne && (
          <p
            style={{
              fontSize: 12,
              color: "#ea580c",
              textAlign: "center",
              marginTop: 10,
              fontWeight: 600,
            }}
          >
            ⚠ Cliquez une seconde fois pour confirmer le remplacement du bail envoyé le{" "}
            {existingBailAt
              ? new Date(existingBailAt).toLocaleDateString("fr-FR")
              : ""}
            .{" "}
            <button
              type="button"
              onClick={() => setConfirmRegen(false)}
              style={{
                background: "none",
                border: "none",
                color: "#6b7280",
                textDecoration: "underline",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12,
                padding: 0,
              }}
            >
              Annuler
            </button>
          </p>
        )}

        {locataireKnown && (
          <p
            style={{
              fontSize: 12,
              color: "#15803d",
              textAlign: "center",
              marginTop: 10,
              lineHeight: 1.5,
              fontWeight: 600,
            }}
          >
            📬 Le PDF sera téléchargé sur votre appareil, et votre locataire
            recevra une carte dans sa messagerie + une notification cloche.
          </p>
        )}

        <p
          style={{
            fontSize: 11,
            color: "#9ca3af",
            textAlign: "center",
            marginTop: 18,
            lineHeight: 1.6,
          }}
        >
          Ce document est généré à titre indicatif, conforme à la loi ALUR.
          <br />
          Pour un litige ou une situation complexe, faites-le relire par un
          professionnel du droit.
          <br />
          <em style={{ color: "#9ca3af" }}>
            Votre saisie est sauvegardée automatiquement dans ce navigateur.
          </em>
        </p>
      </div>

      {/* ─── Modales ──────────────────────────────────────────────────── */}

      <Modal
        open={modalEquipements}
        onClose={() => setModalEquipements(false)}
        title="Équipements du logement meublé"
        maxWidth={640}
        footer={
          <button
            onClick={() => setModalEquipements(false)}
            style={{
              background: "#111",
              color: "white",
              border: "none",
              borderRadius: 999,
              padding: "10px 22px",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Valider
          </button>
        }
      >
        <p style={{ marginTop: 0, color: "#6b7280", fontSize: 13 }}>
          Le <strong>décret n°2015-981</strong> liste les 11 équipements
          obligatoires pour un meublé. Les équipements de confort sont
          facultatifs mais valorisent le bien.
        </p>

        <div
          style={{
            marginTop: 16,
            padding: "8px 14px",
            background: "#f0fdf4",
            border: "1.5px solid #86efac",
            borderRadius: 10,
            fontSize: 12,
            color: "#15803d",
            fontWeight: 700,
          }}
        >
          Obligatoires — loi ALUR ({EQUIPEMENTS_MEUBLE_ALUR.length})
        </div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {EQUIPEMENTS_MEUBLE_ALUR.map(eq => (
            <FieldCheckbox
              key={eq}
              label={eq}
              checked={form.equipementsMeuble.includes(eq)}
              onChange={() => toggleInArray("equipementsMeuble", eq)}
            />
          ))}
        </div>

        <div
          style={{
            marginTop: 20,
            padding: "8px 14px",
            background: "#f3f4f6",
            borderRadius: 10,
            fontSize: 12,
            color: "#6b7280",
            fontWeight: 700,
          }}
        >
          Confort (facultatif)
        </div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {EQUIPEMENTS_MEUBLE_CONFORT.map(eq => (
            <FieldCheckbox
              key={eq}
              label={eq}
              checked={form.equipementsMeuble.includes(eq)}
              onChange={() => toggleInArray("equipementsMeuble", eq)}
            />
          ))}
        </div>

        <div
          style={{
            marginTop: 20,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() =>
              setForm(f => ({
                ...f,
                equipementsMeuble: [...EQUIPEMENTS_MEUBLE_ALUR],
              }))
            }
            style={{
              background: "white",
              color: "#15803d",
              border: "1.5px solid #86efac",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Tout cocher ALUR
          </button>
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, equipementsMeuble: [] }))}
            style={{
              background: "white",
              color: "#6b7280",
              border: "1.5px solid #e5e7eb",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Tout décocher
          </button>
        </div>
      </Modal>

      <Modal
        open={modalClauses}
        onClose={() => setModalClauses(false)}
        title="Modèles de clauses particulières"
        maxWidth={680}
        footer={
          <button
            onClick={() => setModalClauses(false)}
            style={{
              background: "#111",
              color: "white",
              border: "none",
              borderRadius: 999,
              padding: "10px 22px",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Valider
          </button>
        }
      >
        <p style={{ marginTop: 0, color: "#6b7280", fontSize: 13 }}>
          Cochez les clauses à insérer dans votre bail. Vous pouvez aussi
          rédiger vos propres clauses en texte libre.
        </p>
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          {CLAUSES_TYPES.map(c => {
            const checked = form.clausesChoisies.includes(c.titre)
            return (
              <label
                key={c.titre}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: checked ? "#f0fdf4" : "#fafafa",
                  border: `1.5px solid ${checked ? "#86efac" : "#e5e7eb"}`,
                  cursor: "pointer",
                  alignItems: "flex-start",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleInArray("clausesChoisies", c.titre)}
                  style={{ marginTop: 3, cursor: "pointer", accentColor: "#15803d" }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>
                    {c.titre}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#6b7280",
                      marginTop: 4,
                      lineHeight: 1.6,
                    }}
                  >
                    {c.texte}
                  </div>
                </div>
              </label>
            )
          })}
        </div>
      </Modal>

      <Modal
        open={modalAide === "encadrement"}
        onClose={() => setModalAide(null)}
        title="Encadrement du loyer (loi ELAN)"
        maxWidth={560}
      >
        <p style={{ marginTop: 0 }}>
          Dans les zones tendues où l&apos;encadrement est en vigueur
          (Paris, Lille, Lyon, Bordeaux, Montpellier et d&apos;autres
          agglomérations), le loyer d&apos;un logement ne peut pas dépasser un
          <strong> loyer de référence majoré</strong> fixé par arrêté préfectoral.
        </p>
        <ul style={{ paddingLeft: 18, marginTop: 12, color: "#374151" }}>
          <li>
            <strong>Loyer de référence</strong> : loyer médian du secteur (€/m²).
          </li>
          <li>
            <strong>Loyer de référence majoré</strong> : +20 % du loyer de
            référence. C&apos;est le plafond.
          </li>
          <li>
            <strong>Complément de loyer</strong> : autorisé uniquement pour des
            caractéristiques exceptionnelles dûment justifiées (terrasse, vue,
            dernier étage, haute qualité de prestation…).
          </li>
        </ul>
        <p style={{ marginTop: 14, fontSize: 13, color: "#6b7280" }}>
          💡 Pour connaître les valeurs de votre secteur, consultez le site de
          l&apos;observatoire local des loyers (OLL) ou la préfecture.
        </p>
      </Modal>

      {/* Upload bail externe */}
      {bien && (
        <UploadBailModal
          open={modalUpload}
          onClose={() => setModalUpload(false)}
          onUploaded={async ({ fichierUrl, dateDebut, duree, type }) => {
            const locataireEmail = (bien.locataire_email || "").toLowerCase().trim()
            const fromEmail = (bien.proprietaire_email || session?.user?.email || "").toLowerCase()
            if (!locataireEmail || !fromEmail) return
            // Payload minimal pour une BailCard "bail externe"
            const payload = {
              type,
              titreBien: bien.titre || "",
              villeBien: bien.ville || "",
              dateDebut,
              duree,
              loyerHC: Number(bien.prix) || 0,
              charges: Number(bien.charges) || 0,
              caution: Number(bien.caution) || Number(bien.prix) || 0,
              surface: Number(bien.surface) || 0,
              pieces: Number(bien.pieces) || 0,
              etage: bien.etage || "",
              description: bien.description || "",
              meuble: type === "meuble",
              parking: !!bien.parking,
              cave: !!bien.cave,
              nomBailleur: form.nomBailleur || session?.user?.name || "",
              adresseBailleur: form.adresseBailleur || "",
              emailBailleur: fromEmail,
              nomLocataire: form.nomLocataire || "",
              emailLocataire: locataireEmail,
              modeReglement: form.modeReglement,
              dateReglement: form.dateReglement,
              dpe: bien.dpe || "",
              // Marqueur : ce payload représente un bail externe
              fichierUrl,
            }
            const uploadPatch: Record<string, unknown> = {
              locataire_email: locataireEmail,
              bail_genere_at: new Date().toISOString(),
              date_debut_bail: dateDebut,
            }
            if (bien.statut !== "loué") uploadPatch.statut = "bail_envoye"
            await supabase.from("annonces").update(uploadPatch).eq("id", bien.id)

            await supabase.from("messages").insert([{
              from_email: fromEmail,
              to_email: locataireEmail,
              contenu: `[BAIL_CARD]${JSON.stringify(payload)}`,
              lu: false,
              annonce_id: bien.id,
              created_at: new Date().toISOString(),
            }])

            void postNotif({
              userEmail: locataireEmail,
              type: "bail_genere",
              title: "Bail à signer",
              body: `Votre bailleur a importé le bail pour « ${bien.titre} ». Vous pouvez le télécharger et le signer.`,
              href: "/mon-logement",
              relatedId: String(bien.id),
            })

            setUploadSuccess(true)
            // Scroll top pour voir le message succès
            if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" })
          }}
          proprioEmail={bien.proprietaire_email || session?.user?.email || ""}
          locataireEmail={(bien.locataire_email || "").toLowerCase()}
          annonceId={bien.id}
          titreBien={bien.titre || ""}
          villeBien={bien.ville || ""}
          defaultType={form.type}
        />
      )}
    </main>
  )
}
