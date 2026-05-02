"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState, useMemo } from "react"
import { useRouter, useParams, useSearchParams } from "next/navigation"
import { supabase } from "../../../../lib/supabase"
import { useResponsive } from "../../../hooks/useResponsive"
import { postNotif } from "../../../../lib/notificationsClient"
import { genererBailPDF, genererBailPDFBlob, type BailData } from "../../../../lib/bailPDF"
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
import BailPreviewModal from "../../../components/bail/BailPreviewModal"
import AvenantCard, { type Avenant } from "../../../components/bail/AvenantCard"
import ProposerAvenantModal from "../../../components/bail/ProposerAvenantModal"
import PreavisModal from "../../../components/bail/PreavisModal"
import { fenetreIndexation, irlDernier, calculerNouveauLoyer } from "../../../../lib/irl"
import { joursAvantFinPreavis, LOCATAIRE_MOTIFS, PROPRIETAIRE_MOTIFS } from "../../../../lib/preavis"
import { genererIrlPDF } from "../../../../lib/irlPDF"
import { genererPreavisPDF } from "../../../../lib/preavisPDF"
import HelpIcon, { PhoneHelpContent } from "../../../components/ui/HelpIcon"
import BailSignatureModal from "../../../components/BailSignatureModal"
import AnnexeUploader from "../../../components/AnnexeUploader"
import { formatNomComplet } from "../../../../lib/profilHelpers"

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
  // Annexes PDF uploadées (URL + nom de fichier)
  annexeDpe: { url: string; name: string } | null
  annexeErp: { url: string; name: string } | null
  annexeCrep: { url: string; name: string } | null
  annexeNotice: { url: string; name: string } | null
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
    annexeDpe: null,
    annexeErp: null,
    annexeCrep: null,
    annexeNotice: null,
  }
}

// ─── Styles réutilisables (inline only — règle KeyMatch) ──────────────────

const labelStyle = {
  fontSize: 12,
  fontWeight: 700,
  color: "#8a8477",
  display: "block",
  marginBottom: 6,
} as const

const helpStyle = {
  fontSize: 11,
  color: "#8a8477",
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
  color: "#8a8477",
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
  // ReactNode pour permettre des labels enrichis (HelpIcon, badges
  // recommandé/facultatif). Reste rétrocompatible avec string.
  label: React.ReactNode
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
          border: "1px solid #EAE6DF",
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
          border: "1px solid #EAE6DF",
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
        background: checked ? "#F0FAEE" : "#F7F4EF",
        border: `1px solid ${checked ? "#86efac" : "#EAE6DF"}`,
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
          <div style={{ fontSize: 11, color: "#8a8477", marginTop: 2, lineHeight: 1.5 }}>
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
              border: `1px solid ${active ? "#111" : "#EAE6DF"}`,
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
  // V60.7 — modale signature bailleur (quand locataire a signé en premier).
  // Avant ce fix, le bouton "Prévisualiser et envoyer" pouvait être cliqué
  // par erreur après signature locataire → bug perçu d'auto-signature.
  // Maintenant : si locataireSigne && !bailleurSigne, on remplace le bouton
  // "Envoyer" par "Signer à votre tour" qui ouvre cette modale (canvas +
  // mention + POST /api/bail/signer avec validations eIDAS strictes).
  const [signProprioModalOpen, setSignProprioModalOpen] = useState(false)
  const [confirmRegen, setConfirmRegen] = useState(false)

  // V32.1 — Preview modal state. Avant l'envoi du bail au locataire, on
  // affiche le PDF généré pour relecture. Le proprio peut soit envoyer
  // (déclenche email + insert message), soit revenir au form pour corriger.
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null)
  const [previewFilename, setPreviewFilename] = useState("")

  // V36.3 — Avenants liés à cette annonce
  const [avenants, setAvenants] = useState<Avenant[]>([])
  // V36.4 — Préavis modal côté proprio + indexation IRL
  const [preavisOpen, setPreavisOpen] = useState(false)
  const [indexerSubmitting, setIndexerSubmitting] = useState(false)
  // V38.3 — Modale "Proposer un avenant"
  const [avenantModalOpen, setAvenantModalOpen] = useState(false)
  async function refreshAvenants() {
    if (!bienId) return
    try {
      const res = await fetch(`/api/bail/avenant?annonceId=${bienId}`)
      if (res.ok) {
        const json = await res.json() as { ok: boolean; avenants?: Avenant[] }
        if (json.ok && json.avenants) setAvenants(json.avenants)
      }
    } catch { /* silent */ }
  }
  useEffect(() => {
    void refreshAvenants()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bienId])

  // V33.8 — Mode "Premier bail" simplifié. Audit V31 R2.3 : le form 15 sections
  // est intimidant pour un proprio non-tech. En mode simplifié, on ne montre
  // que les 5 sections essentielles (3 Locataire, 4 Garant si activé, 6 Dates,
  // 11 Équipements si meublé, 15 Annexes). Les autres restent remplies avec
  // les defaults ALUR/raisonnables sans intervention. Toggle persisté en
  // localStorage pour respecter le choix du proprio.
  const [simpleMode, setSimpleMode] = useState(true)
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const saved = window.localStorage.getItem("km:bail:simpleMode")
      if (saved === "false") setSimpleMode(false)
      else if (saved === "true") setSimpleMode(true)
    } catch { /* ignore */ }
  }, [])
  function toggleSimpleMode() {
    setSimpleMode(v => {
      const next = !v
      try { window.localStorage.setItem("km:bail:simpleMode", String(next)) } catch { /* ignore */ }
      return next
    })
  }

  const storageKey = bienId ? `${STORAGE_KEY_PREFIX}${bienId}` : ""

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth")
    if (session && bienId) void loadBien()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, status, bienId])

  // V32.4 — Realtime listener sur bail_signatures filtré par cette annonce.
  // Audit V31 R1.4 : avant ce listener, le proprio devait refresh la page
  // pour voir la signature du locataire. Maintenant : MAJ live + toast.
  useEffect(() => {
    if (!bienId) return
    const annonceIdNum = Number(bienId)
    if (!Number.isFinite(annonceIdNum)) return
    const channel = supabase
      .channel(`bail-sigs-${annonceIdNum}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bail_signatures",
          filter: `annonce_id=eq.${annonceIdNum}`,
        },
        (payload) => {
          const row = payload.new as { signataire_role?: string; signataire_nom?: string } | null
          if (!row) return
          const role = row.signataire_role
          if (role === "locataire") {
            setLocataireSigne(true)
            window.dispatchEvent(new CustomEvent("km:toast", {
              detail: {
                type: "visite_confirmee",
                title: "Le locataire vient de signer le bail",
                body: row.signataire_nom ? `Signature de ${row.signataire_nom}` : undefined,
              },
            }))
          } else if (role === "bailleur") {
            setBailleurSigne(true)
          }
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [bienId])

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
              .select("prenom, nom, telephone")
              .ilike("email", data.proprietaire_email)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        data.locataire_email
          ? supabase
              .from("profils")
              .select("prenom, nom, telephone, situation_pro")
              .ilike("email", data.locataire_email)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        // V55.1b — signatures via /api/bail/signatures (RLS Phase 5)
        fetch(`/api/bail/signatures?annonce_id=${bienId}`, { cache: "no-store" })
          .then(r => r.ok ? r.json() : { ok: false })
          .catch(() => ({ ok: false })),
      ])

      // État existing bail
      if (data.bail_genere_at) setExistingBailAt(data.bail_genere_at)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sigArr = (signaturesRes as any)?.ok ? ((signaturesRes as any).signatures as Array<{ signataire_role: string }>) : null
      if (sigArr) {
        const roles = new Set(sigArr.map(s => s.signataire_role))
        setLocataireSigne(roles.has("locataire"))
        setBailleurSigne(roles.has("bailleur"))
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
          formatNomComplet(proprioProfil.data as { prenom?: string | null; nom?: string | null } | null) ||
          data.proprietaire ||
          session?.user?.name ||
          "",
        adresseBailleur: "",
        telBailleur:
          (proprioProfil.data as { telephone?: string } | null)?.telephone || "",
        nomLocataire:
          formatNomComplet(locataireProfil.data as { prenom?: string | null; nom?: string | null } | null) || "",
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
      fichiersAnnexes: {
        dpe: form.annexeDpe || undefined,
        erp: form.annexeErp || undefined,
        crep: form.annexeCrep || undefined,
        notice: form.annexeNotice || undefined,
      },
      // DPE
      dpe: bien.dpe || "",
    }
  }, [form, bien, session])

  // V32.1 — Phase 1 : génère le PDF Blob et ouvre la modale preview.
  // L'envoi effectif se fait via `confirmEnvoiBail()` après relecture proprio.
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
      const { blob, filename } = await genererBailPDFBlob(bailData)
      setPreviewBlob(blob)
      setPreviewFilename(filename)
      setPreviewOpen(true)
    } catch (pdfErr) {
      console.error("[generer] PDF preview error:", pdfErr)
      alert(`Erreur PDF : ${pdfErr instanceof Error ? pdfErr.message : String(pdfErr)}`)
    } finally {
      setGenerating(false)
    }
  }

  function annulerPreview() {
    setPreviewOpen(false)
    setPreviewBlob(null)
    setPreviewFilename("")
  }

  // V32.1 — Phase 2 : envoi confirmé après relecture du PDF preview.
  // Reproduit l'ancienne logique `generer()` : download local + insert
  // [BAIL_CARD] dans messages + notif locataire + update annonce.
  async function confirmEnvoiBail() {
    if (!bien || !bailData || generating) return
    // V60.7 — Garde-fou server-side : re-fetch les signatures fraîches juste
    // avant l'envoi pour éviter race condition (le locataire peut signer entre
    // l'ouverture de la page et le click "Envoyer"). Si le locataire a signé,
    // on bloque l'envoi — le proprio doit passer par la modale signature.
    try {
      const sigCheckRes = await fetch(`/api/bail/signatures?annonce_id=${bien.id}`, { cache: "no-store" })
      const sigCheckJson = await sigCheckRes.json().catch(() => ({}))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sigArr = sigCheckJson?.ok ? ((sigCheckJson.signatures as Array<{ signataire_role: string }>) || []) : []
      const locSigned = sigArr.some(s => s.signataire_role === "locataire")
      if (locSigned) {
        setLocataireSigne(true)
        annulerPreview()
        alert(
          "Le locataire vient de signer ce bail. Vous ne pouvez plus le renvoyer — vous devez maintenant le signer à votre tour pour le rendre actif.",
        )
        return
      }
    } catch (e) {
      console.warn("[confirmEnvoiBail] signature precheck failed:", e)
      // En cas d'erreur réseau, on continue (le user a déjà confirmé) mais
      // on log pour audit. Le serveur reste safe (RLS + bail/signer bloque).
    }
    setGenerating(true)
    try {
      // V61.6 — verbose debug logs nettoyés (kept warn/error pour prod debugging)
      const locataireEmail = bailData.emailLocataire

      // Download local du PDF (côté proprio — archive perso)
      try {
        await genererBailPDF(bailData)
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
        const { data: updData, error: updErr } = await supabase
          .from("annonces")
          .update(patch)
          .eq("id", bien.id)
          .select("id")
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
          if (msgErr) {
            alert(`Erreur envoi message : ${msgErr.message} (code ${msgErr.code || "?"})`)
            return
          }
          void postNotif({
            userEmail: locataireEmail,
            type: "bail_a_signer",
            title: "Bail à signer",
            body: `Votre bailleur a généré le bail pour « ${bien.titre} »${dateStr ? ` (début ${dateStr})` : ""}. Cliquez pour signer.`,
            // Lien direct vers la conv messages où la BAIL_CARD est rendue
            // avec la modale de signature accessible (commit 4 du flow plan).
            // Avant : "/mon-logement" → mais le locataire n'a pas encore
            // accès à cette page tant que le bail n'est pas pleinement signé.
            href: `/messages?with=${encodeURIComponent(fromEmail)}&annonce=${bien.id}`,
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
      // V33.7 — Notif rejet auto aux AUTRES candidats de cette annonce.
      // Audit V31 R2.5 : avant ce trigger, attribuer un bail à un candidat
      // laissait les autres candidats en limbo (statut "rejete" silencieux
      // côté UI, sans message ni email). Maintenant : appel fire-and-forget
      // à l'API existante (rate-limit 1/h/annonce server-side, no-op si
      // déjà déclenché). Send email "respectueux" + insert
      // [CANDIDATURE_NON_RETENUE] dans chaque thread.
      if (locataireEmail) {
        void fetch("/api/notifications/candidats-orphelins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ annonceId: bien.id, locataireRetenu: locataireEmail }),
        }).catch(err => console.warn("[generer] candidats-orphelins notify failed:", err))
      }
      // V32.1 — ferme la modale preview + dispatch un toast de succès.
      annulerPreview()
      window.dispatchEvent(new CustomEvent("km:toast", {
        detail: {
          type: "success",
          title: "Bail envoyé au locataire",
          body: "Vous serez notifié dès qu'il aura signé.",
        },
      }))
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
          color: "#8a8477",
        }}
      >
        Chargement…
      </div>
    )
  if (!bien) return null

  const locataireKnown = !!(bien.locataire_email || "").trim()
  // V60.6 — `prete` inclut maintenant equipementsOk (validation ALUR stricte
  // pour les meublés). Si manquant, le bouton "Prévisualiser et envoyer"
  // reste désactivé et le warning rouge guide l'user.
  const loyer = Number(bien.prix) || 0
  const charges = Number(bien.charges) || 0
  const totalCC = loyer + charges
  const caution = Number(bien.caution) || loyer
  // V60.6 — Validation STRICTE ALUR : les 11 items obligatoires (décret
  // n°2015-981 du 31 juillet 2015) doivent TOUS être cochés. Avant ce fix,
  // on comparait juste la longueur totale (qui inclut les facultatifs)
  // → un meublé pouvait être validé alors qu'il manquait un item ALUR.
  // User : "il y a marqué les 11 EQUIPEMENTS LOI ALUR mais si tout n'est
  // pas coché ça fonctionne quand même car il y en a d'autres en dessous".
  const equipementsAlurMissing = form.type === "meuble"
    ? EQUIPEMENTS_MEUBLE_ALUR.filter(e => !form.equipementsMeuble.includes(e))
    : []
  const equipementsOk = form.type !== "meuble" || equipementsAlurMissing.length === 0
  // V60.6 — `prete` consolidé : date début + nom bailleur + équipements ALUR ok
  const prete = !!form.dateDebut && !!form.nomBailleur && equipementsOk

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
            color: "#8a8477",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            fontFamily: "inherit",
          }}
        >
          ← Retour à l&apos;espace propriétaire
        </button>

        <div style={{ marginTop: 16, marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div>
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
            <p style={{ color: "#8a8477", marginTop: 4, fontSize: 14 }}>
              {bien.titre} — {bien.ville}
            </p>
          </div>
          {/* V33.8 — Toggle Mode simplifié / avancé */}
          <div style={{ display: "inline-flex", background: "#fff", border: "1px solid #EAE6DF", borderRadius: 999, padding: 3 }} role="tablist" aria-label="Mode du formulaire">
            <button
              type="button"
              role="tab"
              aria-selected={simpleMode}
              onClick={() => { if (!simpleMode) toggleSimpleMode() }}
              style={{
                padding: "6px 14px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "inherit",
                fontSize: 11.5, fontWeight: 700, letterSpacing: "0.3px",
                background: simpleMode ? "#111" : "transparent",
                color: simpleMode ? "#fff" : "#111",
              }}
            >
              Premier bail
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!simpleMode}
              onClick={() => { if (simpleMode) toggleSimpleMode() }}
              style={{
                padding: "6px 14px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "inherit",
                fontSize: 11.5, fontWeight: 700, letterSpacing: "0.3px",
                background: !simpleMode ? "#111" : "transparent",
                color: !simpleMode ? "#fff" : "#111",
              }}
            >
              Mode avancé
            </button>
          </div>
        </div>

        {/* V33.8 — Banner info Mode simplifié */}
        {simpleMode && (
          <div style={{ background: "#EEF3FB", border: "1px solid #D7E3F4", borderRadius: 14, padding: "14px 18px", marginBottom: 20, display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }} aria-hidden>🪶</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 700, color: "#1d4ed8", margin: 0, fontSize: 13 }}>
                Mode simplifié — 5 sections essentielles
              </p>
              <p style={{ fontSize: 12, color: "#1d4ed8", margin: "4px 0 0", lineHeight: 1.55, opacity: 0.85 }}>
                Vos infos bailleur, l&apos;encadrement loyer, la révision IRL, les règles de vie, l&apos;assurance et les clauses
                spéciales sont remplies avec les valeurs standards loi ALUR. Basculez en <strong>Mode avancé</strong> pour les personnaliser.
              </p>
            </div>
          </div>
        )}

        {/* Bail déjà envoyé — garde-fou + bouton téléchargement */}
        {existingBailAt && (
          <div
            style={{
              background: locataireSigne ? "#F0FAEE" : "#fef3c7",
              border: `1px solid ${locataireSigne ? "#86efac" : "#EADFC6"}`,
              borderRadius: 14,
              padding: "14px 18px",
              marginBottom: 20,
            }}
          >
            <p style={{ fontWeight: 700, fontSize: 14, margin: 0, color: locataireSigne ? "#15803d" : "#a16207" }}>
              {locataireSigne
                ? `✓ Bail déjà signé par le locataire`
                : `⚠ Un bail a déjà été envoyé au locataire`}
            </p>
            <p style={{ fontSize: 12, color: locataireSigne ? "#15803d" : "#a16207", margin: "4px 0 8px", lineHeight: 1.6 }}>
              {locataireSigne
                ? `Le locataire a signé ce bail. Pour toute modification, un avenant sera nécessaire (fonctionnalité à venir).${bailleurSigne ? " Vous avez également contresigné — le bail est pleinement signé." : ""}`
                : `Envoyé le ${new Date(existingBailAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}. Si vous générez un nouveau bail, le précédent restera dans la conversation mais le locataire sera invité à signer la nouvelle version.`}
            </p>
            <button
              type="button"
              onClick={async () => {
                try {
                  // Fetch signatures + tenter de récupérer le payload [BAIL_CARD] ;
                  // si pas de message (cas où l'insert avait silencieusement échoué),
                  // on reconstruit le payload depuis le form + l'annonce.
                  const [msgRes, sigsRes] = await Promise.all([
                    supabase
                      .from("messages")
                      .select("contenu")
                      .eq("annonce_id", bien.id)
                      .ilike("contenu", "[BAIL_CARD]%")
                      .order("id", { ascending: false })
                      .limit(1)
                      .maybeSingle(),
                    // V55.1b — signatures via /api/bail/signatures
                    fetch(`/api/bail/signatures?annonce_id=${bien.id}&include_png=true`, { cache: "no-store" })
                      .then(r => r.ok ? r.json() : { ok: false })
                      .catch(() => ({ ok: false })),
                  ])
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const sigArr = (sigsRes as any)?.ok ? ((sigsRes as any).signatures as any[]) : []
                  const signatures = sigArr.map((s: { signataire_role: string; signataire_nom: string; signature_png: string; signe_at: string; mention?: string; ip_address?: string }) => ({
                    role: s.signataire_role as "bailleur" | "locataire" | "garant",
                    nom: s.signataire_nom,
                    png: s.signature_png,
                    signeAt: s.signe_at,
                    mention: s.mention,
                    ipAddress: s.ip_address,
                  }))
                  // Priorité : payload stocké (contient ce qu'il y avait à l'envoi).
                  // Fallback : construit depuis le form actuel + annonce (peut différer
                  // si le proprio a modifié le form depuis l'envoi, mais c'est mieux
                  // que "Aucun bail envoyé récent").
                  let payload: Record<string, unknown>
                  if (msgRes.data?.contenu) {
                    try {
                      payload = JSON.parse(
                        (msgRes.data.contenu as string).slice("[BAIL_CARD]".length),
                      )
                    } catch {
                      payload = bailData as unknown as Record<string, unknown>
                    }
                  } else {
                    console.warn("[bail download] aucun message [BAIL_CARD] en DB, reconstruction depuis le form")
                    if (!bailData) {
                      alert("Impossible de construire le bail (formulaire incomplet).")
                      return
                    }
                    payload = bailData as unknown as Record<string, unknown>
                  }
                  // Si bail externe (URL PDF uploadé), ouvrir directement
                  if (payload.fichierUrl) {
                    window.open(String(payload.fichierUrl), "_blank")
                    return
                  }
                  await genererBailPDF({ ...payload, signatures } as BailData)
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

            {/* V32.7 — Bouton "Renvoyer l'invitation" si bail envoyé mais pas signé.
                Audit V31 R1.7 : sans cette feature, si l'email Resend bounce ou
                le locataire n'a rien reçu, le proprio n'avait aucun moyen de
                relancer hors aller voir Gmail manuellement. */}
            {!locataireSigne && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch("/api/bail/relance", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ annonceId: bien.id, mode: "manual" }),
                    })
                    const json = (await res.json()) as { ok: boolean; error?: string; sent?: boolean; skipped?: string }
                    if (!res.ok || !json.ok) {
                      alert(json.error || "Erreur — réessayez")
                      return
                    }
                    window.dispatchEvent(new CustomEvent("km:toast", {
                      detail: {
                        type: "success",
                        title: json.skipped === "no_resend_key"
                          ? "Rappel enregistré (email désactivé en local)"
                          : "Invitation renvoyée au locataire",
                        body: "Une notification + un message viennent d'être envoyés.",
                      },
                    }))
                  } catch (err) {
                    alert(`Erreur : ${err instanceof Error ? err.message : String(err)}`)
                  }
                }}
                style={{
                  marginLeft: 10,
                  background: "#fff",
                  color: "#9a3412",
                  border: "1px solid #EADFC6",
                  borderRadius: 10,
                  padding: "10px 18px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
                title="Renvoyer l'invitation par email + notif au locataire (1 fois max par 24h)"
              >
                🔁 Renvoyer l&apos;invitation au locataire
              </button>
            )}
          </div>
        )}

        {/* V36.4 — Card "Indexer le loyer (IRL)" si fenêtre éligible
            (audit V35 R35.9). Visible quand bail actif + anniversaire annuel
            dans [-90, +30] j + pas indexé < 11 mois. */}
        {bien && bien.bail_signe_locataire_at && bien.date_debut_bail && (() => {
          const fen = fenetreIndexation(bien.date_debut_bail, bien.irl_derniere_indexation_at || null)
          if (!fen.eligible) return null
          const irlAncien = Number(bien.irl_reference_courant) || Number(bien.irl_reference_initial) || (irlDernier().indice - 1)
          const irlNouveau = irlDernier().indice
          const ancienLoyer = Number(bien.prix) || 0
          if (ancienLoyer <= 0) return null
          const calc = calculerNouveauLoyer(ancienLoyer, irlAncien, irlNouveau)
          return (
            <div style={{ background: "#EEF3FB", border: "1px solid #D7E3F4", borderRadius: 14, padding: "16px 20px", marginBottom: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 6px" }}>
                📈 Indexation IRL annuelle possible
              </p>
              <p style={{ fontSize: 13.5, color: "#111", margin: "0 0 4px", lineHeight: 1.55 }}>
                Anniversaire du bail le {fen.prochaineDateAnniversaire.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.
                Loyer actuel <strong>{ancienLoyer.toLocaleString("fr-FR")} € HC</strong> → nouveau loyer
                {" "}
                <strong style={{ color: calc.variation >= 0 ? "#15803d" : "#b91c1c" }}>
                  {calc.nouveauLoyer.toLocaleString("fr-FR")} € HC
                </strong>
                {" "}
                ({calc.variation >= 0 ? "+" : ""}{calc.variation.toFixed(2)} € · {(calc.variationPct * 100).toFixed(2)} %)
              </p>
              <p style={{ fontSize: 12, color: "#1d4ed8", margin: "0 0 12px", opacity: 0.85 }}>
                Indice nouveau {irlDernier().trimestre} = {irlNouveau} · ancien = {irlAncien}.
                La revalorisation s&apos;applique aux loyers des mois suivants (les loyers déjà payés restent inchangés).
              </p>
              <button
                type="button"
                disabled={indexerSubmitting}
                onClick={async () => {
                  if (!confirm(`Appliquer l'indexation IRL ?\n\nLoyer ${ancienLoyer.toLocaleString("fr-FR")} € → ${calc.nouveauLoyer.toLocaleString("fr-FR")} €.\nLe locataire sera notifié.`)) return
                  setIndexerSubmitting(true)
                  try {
                    const res = await fetch("/api/bail/indexer-irl", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ annonceId: bien.id }),
                    })
                    const json = await res.json() as { ok: boolean; error?: string; nouveauLoyer?: number }
                    if (!res.ok || !json.ok) {
                      alert(json.error || "Indexation échouée")
                      return
                    }
                    window.dispatchEvent(new CustomEvent("km:toast", {
                      detail: {
                        type: "success",
                        title: "Loyer indexé sur l'IRL",
                        body: `Nouveau loyer : ${json.nouveauLoyer?.toLocaleString("fr-FR")} € HC. Locataire notifié — PDF en téléchargement.`,
                      },
                    }))
                    // V38.5 — auto-download PDF "Avis de revalorisation IRL"
                    try {
                      await genererIrlPDF({
                        nomBailleur: form.nomBailleur || session?.user?.name || bien.proprietaire_email || "Bailleur",
                        adresseBailleur: form.adresseBailleur || "",
                        nomLocataire: form.nomLocataire || bien.locataire_email || "Locataire",
                        emailLocataire: bien.locataire_email || "",
                        titreBien: bien.titre || "Logement",
                        adresseBien: bien.adresse || bien.titre || "",
                        villeBien: bien.ville || "",
                        ancienLoyerHC: ancienLoyer,
                        nouveauLoyerHC: calc.nouveauLoyer,
                        charges: Number(bien.charges) || 0,
                        irlAncien,
                        irlNouveau,
                        trimestreAncien: `T? ?`,
                        trimestreNouveau: irlDernier().trimestre,
                        dateEffet: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString().slice(0, 10),
                      })
                    } catch (e) {
                      console.warn("[indexer-irl] PDF download failed (non bloquant):", e)
                    }
                    // refresh annonce dans le state local
                    void loadBien()
                  } finally {
                    setIndexerSubmitting(false)
                  }
                }}
                style={{
                  background: indexerSubmitting ? "#8a8477" : "#1d4ed8",
                  color: "#fff", border: "none", borderRadius: 999,
                  padding: "10px 22px", fontSize: 12, fontWeight: 700,
                  cursor: indexerSubmitting ? "not-allowed" : "pointer",
                  fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px",
                }}
              >
                {indexerSubmitting ? "Application…" : "Appliquer l'indexation"}
              </button>
            </div>
          )
        })()}

        {/* V36.4 — Préavis côté proprio (audit V35 R35.10) :
            countdown si donné, ou bouton "Donner congé" si bail actif. */}
        {bien && bien.bail_signe_locataire_at && (
          <>
            {bien.preavis_donne_par && bien.preavis_fin_calculee && (() => {
              const jours = joursAvantFinPreavis(bien.preavis_fin_calculee)
              const par = bien.preavis_donne_par === "proprietaire" ? "vous" : "le locataire"
              const dateFr = new Date(bien.preavis_fin_calculee).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
              const urgent = jours <= 30
              return (
                <div style={{ background: urgent ? "#FEECEC" : "#FBF6EA", border: `1px solid ${urgent ? "#F4C9C9" : "#EADFC6"}`, borderRadius: 14, padding: "16px 20px", marginBottom: 20 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: urgent ? "#b91c1c" : "#9a3412", textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 6px" }}>
                    Préavis donné par {par}
                  </p>
                  <p style={{ fontSize: 14, color: "#111", margin: 0, lineHeight: 1.55 }}>
                    Fin de bail le <strong>{dateFr}</strong> {jours > 0 ? ` — dans ${jours} jour${jours > 1 ? "s" : ""}` : jours === 0 ? " — aujourd'hui" : ` — passé de ${Math.abs(jours)} j`}
                  </p>
                  {bien.preavis_motif_detail && (
                    <p style={{ fontSize: 12, color: "#6b6559", margin: "6px 0 0", fontStyle: "italic" }}>
                      « {bien.preavis_motif_detail} »
                    </p>
                  )}
                  {/* V38.5 — Bouton download PDF lettre congé (audit V37 R37.6). */}
                  <button
                    type="button"
                    onClick={async () => {
                      const motifList = bien.preavis_donne_par === "locataire" ? LOCATAIRE_MOTIFS : PROPRIETAIRE_MOTIFS
                      const motifEntry = motifList.find(m => m.code === bien.preavis_motif)
                      const auteurEstProp = bien.preavis_donne_par === "proprietaire"
                      try {
                        await genererPreavisPDF({
                          qui: bien.preavis_donne_par as "locataire" | "proprietaire",
                          nomAuteur: auteurEstProp ? (form.nomBailleur || session?.user?.name || bien.proprietaire_email || "Bailleur") : (form.nomLocataire || bien.locataire_email || "Locataire"),
                          adresseAuteur: auteurEstProp ? (form.adresseBailleur || "") : (bien.adresse || ""),
                          nomDestinataire: auteurEstProp ? (form.nomLocataire || bien.locataire_email || "Locataire") : (form.nomBailleur || bien.proprietaire_email || "Bailleur"),
                          adresseDestinataire: auteurEstProp ? (bien.adresse || "") : (form.adresseBailleur || ""),
                          titreBien: bien.titre || "Logement",
                          adresseBien: bien.adresse || bien.titre || "",
                          villeBien: bien.ville || "",
                          motif: bien.preavis_motif,
                          motifLabel: motifEntry?.label || bien.preavis_motif || "",
                          motifDetail: bien.preavis_motif_detail || undefined,
                          dateEnvoi: bien.preavis_date_envoi ? bien.preavis_date_envoi.slice(0, 10) : new Date().toISOString().slice(0, 10),
                          delaiMois: 0, // calculé depuis dateFin - dateEnvoi (approx)
                          dateFinEffective: bien.preavis_fin_calculee,
                        })
                      } catch (e) {
                        alert(`Erreur PDF : ${e instanceof Error ? e.message : String(e)}`)
                      }
                    }}
                    style={{ marginTop: 10, background: "#fff", color: "#9a3412", border: "1px solid #EADFC6", borderRadius: 999, padding: "8px 16px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}
                  >
                    📄 Télécharger la lettre de congé (PDF)
                  </button>
                </div>
              )
            })()}
            {!bien.preavis_donne_par && (
              <div style={{ marginBottom: 20 }}>
                <button
                  type="button"
                  onClick={() => setPreavisOpen(true)}
                  style={{ background: "#fff", color: "#9a3412", border: "1px solid #EADFC6", borderRadius: 999, padding: "10px 22px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}
                >
                  ✉️ Donner congé au locataire
                </button>
              </div>
            )}
          </>
        )}

        {/* V36.3 — Section Avenants côté proprio (audit V35 R35.1).
            Affiche les avenants actifs/en cours avec actions miroir locataire.
            V38.3 — Bouton "Proposer un avenant" toujours visible si bail actif. */}
        {bien && bien.bail_signe_locataire_at && (
          <section style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: 0, letterSpacing: "-0.3px", color: "#111" }}>
                  Avenants au bail
                </h2>
                {avenants.filter(a => a.statut !== "annule").length > 0 && (
                  <p style={{ fontSize: 11, color: "#8a8477", margin: "2px 0 0" }}>
                    {avenants.filter(a => a.statut !== "annule").length} en cours
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setAvenantModalOpen(true)}
                style={{ background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 999, padding: "9px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}
                title="Proposer une modification au bail (loyer, colocataire, garant, clause...)"
              >
                + Proposer un avenant
              </button>
            </div>
            {avenants.filter(a => a.statut !== "annule").length === 0 ? (
              <p style={{ fontSize: 12.5, color: "#8a8477", margin: 0, fontStyle: "italic", padding: "12px 0" }}>
                Aucun avenant en cours. Si vous voulez modifier une clause du bail (loyer, colocataire, garant…), proposez un avenant.
              </p>
            ) : (
              avenants
                .filter(a => a.statut !== "annule")
                .map(a => (
                  <AvenantCard
                    key={a.id}
                    avenant={a}
                    myRole="proprietaire"
                    myEmail={(session?.user?.email || "").toLowerCase()}
                    onRefreshed={refreshAvenants}
                  />
                ))
            )}
          </section>
        )}

        {/* Import bail externe — raccourci en haut */}
        <div
          style={{
            background: "#EEF3FB",
            border: "1px solid #D7E3F4",
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
            <p style={{ fontWeight: 700, color: "#1d4ed8", margin: 0, fontSize: 14 }}>
              Vous avez déjà votre bail en PDF ?
            </p>
            <p style={{ fontSize: 12, color: "#1d4ed8", margin: "2px 0 0", opacity: 0.85 }}>
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
              background: (bien.locataire_email || "").trim() && !locataireSigne ? "#1d4ed8" : "#EAE6DF",
              color: (bien.locataire_email || "").trim() && !locataireSigne ? "white" : "#8a8477",
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
              background: "#F0FAEE",
              border: "1px solid #86efac",
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
              border: "1px solid #EADFC6",
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
              <p style={{ fontWeight: 700, color: "#a16207", margin: 0, fontSize: 14 }}>
                Un brouillon de ce bail a été retrouvé.
              </p>
              <p style={{ fontSize: 12, color: "#a16207", margin: "2px 0 0", opacity: 0.9 }}>
                Vous pouvez reprendre votre saisie ou repartir de zéro.
              </p>
            </div>
            <button
              onClick={restaurerBrouillon}
              style={{
                background: "#a16207",
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
                color: "#a16207",
                border: "1px solid #EADFC6",
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

        {/* 1. Type de bail — caché en mode simplifié (auto-déterminé depuis annonce.meuble) */}
        {!simpleMode && (
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
        )}

        {/* 2. Bailleur — caché en mode simplifié (pré-rempli depuis profil) */}
        {!simpleMode && (
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
              label={<>Téléphone <span style={{ fontWeight: 400, color: "#8a8477", textTransform: "none" as const, letterSpacing: 0 }}>(recommandé)</span> <HelpIcon><PhoneHelpContent /></HelpIcon></>}
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
        )}

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
                  border: "1px solid #EAE6DF",
                  borderRadius: 10,
                  fontSize: 15,
                  background: "#F7F4EF",
                  color: "#8a8477",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
              />
            </div>
            <FieldInput
              label={<>Téléphone <span style={{ fontWeight: 400, color: "#8a8477", textTransform: "none" as const, letterSpacing: 0 }}>(recommandé)</span> <HelpIcon><PhoneHelpContent /></HelpIcon></>}
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
                color: form.garantActif ? "#15803d" : "#8a8477",
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
                label={<>Téléphone <span style={{ fontWeight: 400, color: "#8a8477", textTransform: "none" as const, letterSpacing: 0 }}>(recommandé)</span> <HelpIcon><PhoneHelpContent /></HelpIcon></>}
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
                  background: "#FBF6EA",
                  border: "1px solid #EADFC6",
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

        {/* 5. Usage & occupation — caché en mode simplifié (default habitation) */}
        {!simpleMode && (
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
        )}

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
              {/* V60.5 — Dropdown étendu + option "Autre" pour durée libre.
                  Cas légaux français :
                  - Meublé : 9 mois étudiant non-renouvelable, 12 mois renouvelable
                  - Vide : 3 ans (36) bailleur particulier, 6 ans (72) personne morale
                  - Mobilité : 1 à 10 mois, non-renouvelable (loi ELAN)
                  - Cas hybrides : 18 mois (CDD long), 24 mois (meublé long), etc. */}
              {(() => {
                const standardOptions = form.type === "meuble"
                  ? [
                      { v: 1,  l: "1 mois (mobilité)" },
                      { v: 3,  l: "3 mois (mobilité)" },
                      { v: 6,  l: "6 mois (mobilité)" },
                      { v: 9,  l: "9 mois (étudiant non-renouvelable)" },
                      { v: 10, l: "10 mois (mobilité max)" },
                      { v: 12, l: "12 mois (meublé standard)" },
                      { v: 18, l: "18 mois" },
                      { v: 24, l: "24 mois" },
                    ]
                  : [
                      { v: 12, l: "12 mois (cas spécifique)" },
                      { v: 24, l: "24 mois" },
                      { v: 36, l: "3 ans (bail vide standard particulier)" },
                      { v: 72, l: "6 ans (bail vide bailleur personne morale)" },
                    ]
                const dureeNum = Number(form.duree)
                const isCustom = !standardOptions.find(o => o.v === dureeNum)
                return (
                  <>
                    <select
                      value={isCustom ? "custom" : form.duree}
                      onChange={e => {
                        if (e.target.value === "custom") {
                          // Bascule vers une valeur custom (default 30 si pas déjà custom)
                          if (!isCustom) set("duree")("30")
                        } else {
                          set("duree")(e.target.value)
                        }
                      }}
                      style={{
                        width: "100%",
                        padding: "11px 14px",
                        border: "1px solid #EAE6DF",
                        borderRadius: 10,
                        fontSize: 15,
                        outline: "none",
                        boxSizing: "border-box",
                        fontFamily: "inherit",
                        background: "white",
                        color: "#111",
                      }}
                    >
                      {standardOptions.map(o => (
                        <option key={o.v} value={o.v}>{o.l}</option>
                      ))}
                      <option value="custom">Autre durée (personnalisée)…</option>
                    </select>
                    {isCustom && (
                      <input
                        type="number"
                        min={1}
                        max={120}
                        step={1}
                        value={form.duree}
                        onChange={e => {
                          const n = Math.max(1, Math.min(120, Number(e.target.value) || 1))
                          set("duree")(String(n))
                        }}
                        placeholder="Nombre de mois (1 à 120)"
                        style={{
                          width: "100%",
                          marginTop: 8,
                          padding: "11px 14px",
                          border: "1.5px solid #a16207",
                          borderRadius: 10,
                          fontSize: 15,
                          outline: "none",
                          boxSizing: "border-box",
                          fontFamily: "inherit",
                          background: "#FBF6EA",
                          color: "#111",
                        }}
                      />
                    )}
                    <p style={{ fontSize: 11, color: "#8a8477", margin: "6px 0 0", lineHeight: 1.45 }}>
                      {form.type === "meuble"
                        ? "Bail meublé : 12 mois standard ou 9 mois étudiant non-renouvelable. Bail mobilité (1-10 mois, loi ELAN) pour mobilité pro/étudiant."
                        : "Bail vide : 3 ans minimum bailleur particulier, 6 ans bailleur personne morale (loi 6 juillet 1989, art. 10)."}
                    </p>
                  </>
                )
              })()}
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
              background: "#F7F4EF",
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
                <span style={{ fontSize: 14, color: "#8a8477" }}>{r.label}</span>
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
                background: "#FBF6EA",
                border: "1px solid #EADFC6",
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

        {/* 8. Règlement & révision — caché en mode simplifié (defaults virement + IRL) */}
        {!simpleMode && (
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
                  border: "1px solid #EAE6DF",
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
        )}

        {/* 9. Honoraires — caché en mode simplifié (default 0 entre particuliers) */}
        {!simpleMode && (
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
        )}

        {/* 10. Règles de vie — caché en mode simplifié (defaults : pas d'animaux, non-fumeur) */}
        {!simpleMode && (
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
        )}

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
                background: equipementsOk ? "#F0FAEE" : "#FBF6EA",
                border: `1px solid ${equipementsOk ? "#86efac" : "#EADFC6"}`,
                borderRadius: 12,
                padding: "12px 16px",
              }}
            >
              <div>
                {/* V60.6 — UI distincte ALUR (obligatoires) vs Confort (facultatifs)
                    + warning explicite si items ALUR manquants. */}
                {(() => {
                  const alurChecked = EQUIPEMENTS_MEUBLE_ALUR.filter(e => form.equipementsMeuble.includes(e)).length
                  const totalAlur = EQUIPEMENTS_MEUBLE_ALUR.length
                  const confortChecked = form.equipementsMeuble.length - alurChecked
                  return (
                    <>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: equipementsOk ? "#15803d" : "#9a3412",
                        }}
                      >
                        {alurChecked} / {totalAlur} ALUR coché{alurChecked > 1 ? "s" : ""} (obligatoires)
                        {confortChecked > 0 && (
                          <span style={{ fontWeight: 500, color: "#6b6559" }}>
                            {" "}+ {confortChecked} confort{confortChecked > 1 ? "s" : ""} (facultatif{confortChecked > 1 ? "s" : ""})
                          </span>
                        )}
                      </div>
                      {!equipementsOk && equipementsAlurMissing.length > 0 && (
                        <div style={{ fontSize: 11.5, color: "#9a3412", marginTop: 4, lineHeight: 1.5 }}>
                          ⚠ Bail non conforme — manquants : <strong>{equipementsAlurMissing.join(", ")}</strong>
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: "#8a8477", marginTop: 2, lineHeight: 1.45 }}>
                        Décret n°2015-981 du 31 juillet 2015 — un logement meublé doit obligatoirement comporter les 11 équipements ALUR.
                      </div>
                    </>
                  )
                })()}
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

        {/* 12. État & travaux — caché en mode simplifié (default "bon état") */}
        {!simpleMode && (
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
        )}

        {/* 13. Assurance — caché en mode simplifié (default obligation locataire) */}
        {!simpleMode && (
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
        )}

        {/* 14. Clauses particulières — caché en mode simplifié (defaults ALUR) */}
        {!simpleMode && (
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
                border: "1px solid #111",
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
                    background: "#F7F4EF",
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
                      color: "#8a8477",
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
        )}

        {/* 15. Annexes obligatoires — upload réel PDF */}
        <div style={cardStyle(isMobile)}>
          <h2 style={h2Style}>15. Annexes obligatoires</h2>
          <p style={h2SubStyle}>
            Téléversez les PDF requis par la loi. Ils seront joints au bail et
            le locataire pourra les télécharger.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <AnnexeUploader
              label="DPE (Diagnostic de Performance Énergétique)"
              description="Obligatoire — classe énergie + GES"
              required
              proprioEmail={bien.proprietaire_email || session?.user?.email || ""}
              annonceId={bien.id}
              slotKey="dpe"
              current={form.annexeDpe || undefined}
              onChange={v => set("annexeDpe")(v)}
            />
            <AnnexeUploader
              label="ERP (État des Risques et Pollutions)"
              description="Obligatoire — risques naturels, miniers, technologiques"
              required
              proprioEmail={bien.proprietaire_email || session?.user?.email || ""}
              annonceId={bien.id}
              slotKey="erp"
              current={form.annexeErp || undefined}
              onChange={v => set("annexeErp")(v)}
            />
            <AnnexeUploader
              label="CREP (Constat Risque Exposition Plomb)"
              description="Obligatoire si immeuble construit avant 1949"
              proprioEmail={bien.proprietaire_email || session?.user?.email || ""}
              annonceId={bien.id}
              slotKey="crep"
              current={form.annexeCrep || undefined}
              onChange={v => set("annexeCrep")(v)}
            />
            <AnnexeUploader
              label="Notice d'information locataire"
              description="Obligatoire — arrêté du 29 mai 2015"
              required
              proprioEmail={bien.proprietaire_email || session?.user?.email || ""}
              annonceId={bien.id}
              slotKey="notice"
              current={form.annexeNotice || undefined}
              onChange={v => set("annexeNotice")(v)}
            />
          </div>
          <p style={{ fontSize: 11, color: "#8a8477", marginTop: 14, lineHeight: 1.6 }}>
            💡 Besoin de générer un DPE ou un ERP ? Utilisez le service officiel (georisques.gouv.fr pour ERP, diagnostiqueur certifié pour DPE).
          </p>
        </div>

        {/* Génération */}
        {form.type === "meuble" && !equipementsOk && (
          <div
            style={{
              background: "#fef3c7",
              border: "1px solid #EADFC6",
              borderRadius: 12,
              padding: "12px 16px",
              marginBottom: 14,
              fontSize: 13,
              color: "#a16207",
              lineHeight: 1.6,
            }}
          >
            ⚠ Il manque des équipements obligatoires pour un bail meublé ALUR.
            Cliquez sur «&nbsp;Sélectionner&nbsp;» dans la section 11.
          </div>
        )}

        {/* Raisons pour lesquelles le bouton est désactivé — visible, pas silencieux */}
        {!form.dateDebut && (
          <div style={{ background: "#FBF6EA", border: "1px solid #EADFC6", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#9a3412" }}>
            ⚠ <strong>Date de début manquante</strong> — remplissez la section <em>« 6. Durée du bail & dates »</em> pour activer le bouton.
          </div>
        )}
        {!form.nomBailleur && (
          <div style={{ background: "#FBF6EA", border: "1px solid #EADFC6", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#9a3412" }}>
            ⚠ <strong>Nom du bailleur manquant</strong> — remplissez la section <em>« 2. Bailleur »</em>.
          </div>
        )}

        {/* V60.7 — CTA principal change selon l'état des signatures :
            Cas A : locataire a signé + bailleur PAS signé → "Signer à votre
            tour" qui ouvre la modale signature (canvas + mention eIDAS).
            Cas B : double signé → CTA disabled "Bail pleinement signé".
            Cas C (état normal) : "Prévisualiser et envoyer au locataire". */}
        {locataireSigne && !bailleurSigne ? (
          <div>
            <div style={{ background: "#F0FAEE", border: "1px solid #86efac", borderRadius: 12, padding: "12px 16px", marginBottom: 12, fontSize: 13, color: "#15803d", lineHeight: 1.55 }}>
              ✓ <strong>Le locataire a signé le bail</strong> — c&apos;est à votre tour de signer pour rendre le bail pleinement actif. Cliquez ci-dessous pour ouvrir la modale de signature électronique (canvas + mention manuscrite, conforme eIDAS Niveau 1).
            </div>
            <button
              type="button"
              onClick={() => setSignProprioModalOpen(true)}
              style={{
                width: "100%",
                padding: "18px 32px",
                background: "#15803d",
                color: "white",
                border: "none",
                borderRadius: 16,
                fontWeight: 800,
                fontSize: 16,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              ✍️ Signer le bail à votre tour →
            </button>
          </div>
        ) : locataireSigne && bailleurSigne ? (
          <div style={{ background: "#F0FAEE", border: "1px solid #86efac", borderRadius: 16, padding: "18px 24px", textAlign: "center" as const }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: "#15803d", margin: 0 }}>
              ✓ Bail pleinement signé par les 2 parties
            </p>
            <p style={{ fontSize: 12, color: "#15803d", margin: "6px 0 0", lineHeight: 1.5 }}>
              Le bail est définitivement actif. Pour toute modification, un avenant sera nécessaire.
            </p>
          </div>
        ) : !locataireKnown ? (
          /* V60.9 — Si pas de candidat sélectionné comme futur locataire,
              bloquer le bouton "Prévisualiser et envoyer" et guider l'user
              vers la page Candidatures pour cliquer "Louer à ce candidat".
              User : "on peut signer le bail sans mettre Louer à ce candidat".
              Avant : bouton "Prévisualiser le bail PDF" qui restait actif
              (juste sans envoi) → confusion.
              Maintenant : encart explicite + lien vers candidatures. */
          <div>
            <div style={{ background: "#FBF6EA", border: "1px solid #EADFC6", borderRadius: 12, padding: "14px 18px", marginBottom: 12, fontSize: 13, color: "#9a3412", lineHeight: 1.55 }}>
              ⚠ <strong>Aucun candidat sélectionné</strong> — vous devez d&apos;abord cliquer
              <strong> « Louer à ce candidat »</strong> depuis la liste des candidatures
              pour identifier le locataire avant de pouvoir générer le bail.
            </div>
            <a
              href={`/proprietaire/annonces/${bienId}/candidatures`}
              style={{
                display: "block",
                width: "100%",
                padding: "16px 28px",
                background: "#a16207",
                color: "white",
                border: "none",
                borderRadius: 16,
                fontWeight: 800,
                fontSize: 15,
                textAlign: "center" as const,
                textDecoration: "none",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            >
              Voir les candidatures · Sélectionner un locataire →
            </a>
          </div>
        ) : (() => {
          const bloque = false
          const label = generating
            ? "Génération en cours…"
            : existingBailAt
              ? confirmRegen
                ? "Confirmer le remplacement"
                : "Remplacer le bail envoyé"
              : "Prévisualiser et envoyer au locataire"
          const actif = prete && !generating && !bloque
          return (
            <button
              onClick={() => {
                if (!actif && !bloque && !generating) {
                  const missing: string[] = []
                  if (!form.dateDebut) missing.push("la date de début")
                  if (!form.nomBailleur) missing.push("le nom du bailleur")
                  // V60.6 — équipements ALUR manquants explicites
                  if (!equipementsOk) missing.push(`les ${equipementsAlurMissing.length} équipement(s) ALUR : ${equipementsAlurMissing.join(", ")}`)
                  alert(`Pour générer le bail, remplissez : ${missing.join(" · ")}.`)
                  return
                }
                void generer()
              }}
              disabled={generating}
              style={{
                width: "100%",
                padding: "18px 32px",
                background: confirmRegen
                  ? "#a16207"
                  : actif
                    ? "#111"
                    : "#EAE6DF",
                color: actif ? "white" : "#8a8477",
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
              color: "#a16207",
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
                color: "#8a8477",
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
            color: "#8a8477",
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
          <em style={{ color: "#8a8477" }}>
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
        <p style={{ marginTop: 0, color: "#8a8477", fontSize: 13 }}>
          Le <strong>décret n°2015-981</strong> liste les 11 équipements
          obligatoires pour un meublé. Les équipements de confort sont
          facultatifs mais valorisent le bien.
        </p>

        <div
          style={{
            marginTop: 16,
            padding: "8px 14px",
            background: "#F0FAEE",
            border: "1px solid #86efac",
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
            background: "#F7F4EF",
            borderRadius: 10,
            fontSize: 12,
            color: "#8a8477",
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
              border: "1px solid #86efac",
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
              color: "#8a8477",
              border: "1px solid #EAE6DF",
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
        <p style={{ marginTop: 0, color: "#8a8477", fontSize: 13 }}>
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
                  background: checked ? "#F0FAEE" : "#F7F4EF",
                  border: `1px solid ${checked ? "#86efac" : "#EAE6DF"}`,
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
                      color: "#8a8477",
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
        <ul style={{ paddingLeft: 18, marginTop: 12, color: "#111" }}>
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
        <p style={{ marginTop: 14, fontSize: 13, color: "#8a8477" }}>
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
              type: "bail_a_signer",
              title: "Bail à signer",
              body: `Votre bailleur a importé le bail pour « ${bien.titre} ». Vous pouvez le télécharger et le signer.`,
              // Lien vers la conv messages où la BAIL_CARD vient d'être insérée
              // (cohérent avec le flux de génération l. 751).
              href: `/messages?with=${encodeURIComponent(fromEmail)}&annonce=${bien.id}`,
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

      {/* V32.1 — Preview PDF avant envoi (R1.1 audit produit). Le proprio
          peut relire le bail puis confirmer ou revenir au form. */}
      <BailPreviewModal
        open={previewOpen}
        pdfBlob={previewBlob}
        filename={previewFilename}
        sending={generating}
        onCancel={annulerPreview}
        onConfirm={confirmEnvoiBail}
      />

      {/* V36.4 — PreavisModal côté proprio (audit V35 R35.10) */}
      {bien && (
        <PreavisModal
          open={preavisOpen}
          onClose={() => setPreavisOpen(false)}
          onSubmitted={() => { void loadBien() }}
          role="proprietaire"
          annonceId={bien.id}
          meuble={!!bien.meuble}
          zoneTendue={estZoneTendue(bien.ville || "")}
        />
      )}

      {/* V38.3 — ProposerAvenantModal côté proprio (audit V37 R37.1) */}
      {bien && (
        <ProposerAvenantModal
          open={avenantModalOpen}
          onClose={() => setAvenantModalOpen(false)}
          onCreated={refreshAvenants}
          annonceId={bien.id}
          loyerHC={Number(bien.prix) || undefined}
          charges={Number(bien.charges) || undefined}
        />
      )}

      {/* V60.7 — Modale signature bailleur (eIDAS Niveau 1).
          Ouverte quand le proprio click "Signer le bail à votre tour →"
          après que le locataire ait signé en premier. Avant ce fix, le
          bouton ouvrait `confirmEnvoiBail()` qui pouvait perçu comme
          auto-signature alors qu'il n'a jamais déclenché /api/bail/signer
          (qui est strict : canvas + mention obligatoires). */}
      {bien && bailData && (
        <BailSignatureModal
          open={signProprioModalOpen}
          onClose={() => setSignProprioModalOpen(false)}
          onSigned={() => {
            setSignProprioModalOpen(false)
            setBailleurSigne(true)
            // Refresh state + Realtime push fera le reste
            void loadBien()
          }}
          bailData={bailData}
          annonceId={bien.id}
          role="bailleur"
          nomDefaut={form.nomBailleur || ""}
        />
      )}
    </main>
  )
}
