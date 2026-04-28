"use client"
import { useSession, signOut } from "next-auth/react"
import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "../../lib/supabase"
import { useResponsive } from "../hooks/useResponsive"
import { useRole } from "../providers"
import Link from "next/link"
import CityAutocomplete from "../components/CityAutocomplete"
import QuartierPicker from "../components/QuartierPicker"
import Tooltip from "../components/Tooltip"

// Composants HORS du composant principal pour éviter le bug de focus
import { Toggle, Sec, F } from "../components/FormHelpers"
// V8 (Paul 2026-04-28) — design system local mirror de /dossier pour
// homogeneiser visuellement les 2 onglets du hub Critères/Dossier.
import {
  T,
  TOKENS,
  DossierHero,
  DossierScoreCard,
  DossierSection,
  DossierField,
  DossierToggle,
  DossierChip,
  DossierSaveBtn,
  dossierInputStyle,
} from "./dossierTheme"
import { calculerCompletudeProfil } from "../../lib/profilCompleteness"
import { km, KMButton } from "../components/ui/km"

// ─── Sections du profil (source de vérité pour sommaire + saves sectionnels) ─
// Chaque section énumère ses clés form + toggles pour un upsert ciblé. R10.3a.
type FormShape = {
  ville_souhaitee: string; mode_localisation: string; type_quartier: string
  budget_min: string; budget_max: string; surface_min: string; surface_max: string
  pieces_min: string; chambres_min: string; dpe_min: string; type_bail: string
  situation_pro: string; revenus_mensuels: string; type_garant: string
  nb_occupants: string; profil_locataire: string
  meuble_pref: string
  // V2.6 (Paul 2026-04-27) — matching v2 user-controlled
  tolerance_budget_pct: string  // "0".."50" — slider valeur en %
  rayon_recherche_km: string    // "" si non defini, sinon "0".."100"
}
type TogglesShape = {
  animaux: boolean; parking: boolean; cave: boolean
  fibre: boolean; balcon: boolean; terrasse: boolean; jardin: boolean
  ascenseur: boolean; rez_de_chaussee_ok: boolean; fumeur: boolean
  proximite_metro: boolean; proximite_ecole: boolean
  proximite_commerces: boolean; proximite_parcs: boolean
  dpe_min_actif: boolean  // V2.6 — si true, dpe_min devient filtre dur
}

// V2.6 — preference tri-state par equipement (jsonb preferences_equipements).
type EquipPref = "indispensable" | "souhaite" | "indifferent" | "refuse"
const EQUIP_LIST: Array<{ key: string; label: string }> = [
  { key: "parking",   label: "Parking" },
  { key: "cave",      label: "Cave" },
  { key: "fibre",     label: "Fibre optique" },
  { key: "balcon",    label: "Balcon" },
  { key: "terrasse",  label: "Terrasse" },
  { key: "jardin",    label: "Jardin" },
  { key: "ascenseur", label: "Ascenseur" },
]
const EQUIP_DEFAULT: Record<string, EquipPref> = Object.fromEntries(
  EQUIP_LIST.map(e => [e.key, "indifferent"])
) as Record<string, EquipPref>

const SECTIONS: Array<{
  id: string
  label: string
  formKeys: Array<keyof FormShape>
  toggleKeys: Array<keyof TogglesShape>
}> = [
  {
    id: "criteres",
    label: "Critères de recherche",
    formKeys: ["ville_souhaitee", "mode_localisation", "type_quartier", "budget_min", "budget_max",
      "surface_min", "surface_max", "pieces_min", "chambres_min", "dpe_min", "type_bail",
      // V2.6 — tolerance budget + rayon (slider/input)
      "tolerance_budget_pct", "rayon_recherche_km"],
    toggleKeys: ["rez_de_chaussee_ok", "dpe_min_actif"],
  },
  {
    id: "equipements",
    label: "Équipements",
    // meuble géré séparément (3-state form.meuble_pref → DB boolean nullable).
    // V2.6 — preferences_equipements jsonb géré dans saveSection (not in formKeys/toggleKeys).
    formKeys: ["meuble_pref"],
    toggleKeys: ["animaux"],
  },
  {
    id: "proximites",
    label: "Proximités",
    formKeys: [],
    toggleKeys: ["proximite_metro", "proximite_ecole", "proximite_commerces", "proximite_parcs"],
  },
  {
    id: "profil-locataire",
    label: "Profil locataire",
    formKeys: ["situation_pro", "revenus_mensuels", "type_garant", "nb_occupants", "profil_locataire"],
    toggleKeys: ["fumeur"],
  },
]

// Next 15 : useSearchParams requiert un boundary <Suspense> au-dessus du
// composant qui l'utilise pour que le prerender statique tolère le CSR
// bailout. Le fallback reproduit l'état « Chargement… » de l'inner pour
// éviter un flash visible à l'hydratation.
function ProfilLoadingFallback() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'DM Sans', sans-serif", color: km.muted }}>Chargement…</div>
  )
}

export default function ProfilPage() {
  return (
    <Suspense fallback={<ProfilLoadingFallback />}>
      <Profil />
    </Suspense>
  )
}

function Profil() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const justCreated = searchParams?.get("created") === "1"
  const { isMobile } = useResponsive()
  const { proprietaireActive } = useRole()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [erreur, setErreur] = useState("")
  const [dataLoaded, setDataLoaded] = useState(false)
  const [photoCustom, setPhotoCustom] = useState<string | null>(null)
  const [createdBannerOpen, setCreatedBannerOpen] = useState(justCreated)

  // R10.3 — sauvegardes sectionnelles : active section (TOC), état par section,
  // et undo toast 5 s avec snapshot des valeurs précédentes.
  const [activeSection, setActiveSection] = useState<string>("criteres")
  const [savingSection, setSavingSection] = useState<string | null>(null)
  const [undo, setUndo] = useState<{
    sectionId: string
    label: string
    prevForm: FormShape
    prevToggles: TogglesShape
    prevPrefsEquip: Record<string, EquipPref>
    expiresAt: number
  } | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [form, setForm] = useState<FormShape>({
    ville_souhaitee: "", mode_localisation: "souple", type_quartier: "", budget_min: "", budget_max: "",
    surface_min: "", surface_max: "", pieces_min: "1", chambres_min: "0",
    dpe_min: "D", type_bail: "longue durée",
    situation_pro: "CDI", revenus_mensuels: "", type_garant: "",
    nb_occupants: "1", profil_locataire: "jeune actif",
    // 3-state : "peu_importe" | "oui" | "non". Mappé en DB sur boolean nullable.
    meuble_pref: "peu_importe",
    // V2.6 — defaults : tolerance 20% (legacy), rayon vide (pas de bonus geo)
    tolerance_budget_pct: "10",
    rayon_recherche_km: "",
  })
  const [toggles, setToggles] = useState<TogglesShape>({
    animaux: false, parking: false, cave: false,
    fibre: false, balcon: false, terrasse: false, jardin: false,
    ascenseur: false, rez_de_chaussee_ok: true,
    fumeur: false, proximite_metro: false, proximite_ecole: false,
    proximite_commerces: false, proximite_parcs: false,
    dpe_min_actif: false,  // V2.6 — default off (DPE = bonus, pas filtre dur)
  })
  // V2.6 — preferences_equipements jsonb (separate state pour ne pas exploser FormShape)
  const [prefsEquip, setPrefsEquip] = useState<Record<string, EquipPref>>(EQUIP_DEFAULT)
  // V7 chantier 2 — quartier prefere lat/lng/label (migration 028)
  const [quartierLat, setQuartierLat] = useState<number | null>(null)
  const [quartierLng, setQuartierLng] = useState<number | null>(null)
  const [quartierLabel, setQuartierLabel] = useState<string | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth")
    if (session?.user?.email) {
      supabase.from("profils").select("*").eq("email", session.user.email).single()
        .then(({ data }) => {
          if (data) {
            setPhotoCustom((data as { photo_url_custom?: string | null }).photo_url_custom || null)
            setForm({
              ville_souhaitee: data.ville_souhaitee || "",
              mode_localisation: data.mode_localisation || "souple",
              type_quartier: data.type_quartier || "",
              budget_min: data.budget_min?.toString() || "",
              budget_max: data.budget_max?.toString() || "",
              surface_min: data.surface_min?.toString() || "",
              surface_max: data.surface_max?.toString() || "",
              pieces_min: data.pieces_min?.toString() || "1",
              chambres_min: data.chambres_min?.toString() || "0",
              dpe_min: data.dpe_min || "D",
              type_bail: data.type_bail || "longue durée",
              situation_pro: data.situation_pro || "CDI",
              revenus_mensuels: data.revenus_mensuels?.toString() || "",
              type_garant: data.type_garant || "",
              nb_occupants: data.nb_occupants?.toString() || "1",
              profil_locataire: data.profil_locataire || "jeune actif",
              meuble_pref: data.meuble === null || data.meuble === undefined
                ? "peu_importe"
                : data.meuble ? "oui" : "non",
              // V2.6 — defaults safe si colonnes absentes (compat ancien profil)
              tolerance_budget_pct: typeof data.tolerance_budget_pct === "number"
                ? String(data.tolerance_budget_pct) : "10",
              rayon_recherche_km: typeof data.rayon_recherche_km === "number"
                ? String(data.rayon_recherche_km) : "",
            })
            setToggles({
              animaux: !!data.animaux,
              parking: !!data.parking, cave: !!data.cave,
              fibre: !!data.fibre, balcon: !!data.balcon,
              terrasse: !!data.terrasse, jardin: !!data.jardin,
              ascenseur: !!data.ascenseur,
              fumeur: !!data.fumeur,
              rez_de_chaussee_ok: data.rez_de_chaussee_ok !== false,
              proximite_metro: !!data.proximite_metro,
              proximite_ecole: !!data.proximite_ecole,
              proximite_commerces: !!data.proximite_commerces,
              proximite_parcs: !!data.proximite_parcs,
              dpe_min_actif: data.dpe_min_actif === true,  // V2.6
            })
            // V2.6 — load preferences_equipements jsonb avec fallback boolean legacy
            const rawPrefs = (data as { preferences_equipements?: Record<string, string> | null }).preferences_equipements
            const merged: Record<string, EquipPref> = { ...EQUIP_DEFAULT }
            for (const { key } of EQUIP_LIST) {
              const explicit = rawPrefs?.[key]
              if (explicit === "indispensable" || explicit === "souhaite" || explicit === "indifferent" || explicit === "refuse") {
                merged[key] = explicit
              } else if ((data as Record<string, unknown>)[key] === true) {
                // fallback : boolean legacy true -> "souhaite"
                merged[key] = "souhaite"
              }
            }
            setPrefsEquip(merged)
            // V7 chantier 2 — load quartier prefere
            setQuartierLat(typeof data.quartier_prefere_lat === "number" ? data.quartier_prefere_lat : null)
            setQuartierLng(typeof data.quartier_prefere_lng === "number" ? data.quartier_prefere_lng : null)
            setQuartierLabel(typeof data.quartier_prefere_label === "string" ? data.quartier_prefere_label : null)
          }
          setDataLoaded(true)
        })
    }
  }, [session, status, router])

  const set = (key: string) => (e: any) => setForm(f => ({ ...f, [key]: e.target.value }))

  // Source unique de vérité : lib/profilCompleteness (aussi utilisé sur /annonces)
  const { score: scoreCompletion, manquants: manquantsLabels } = calculerCompletudeProfil(form)
  const scoreColor = scoreCompletion >= 80 ? km.successText : scoreCompletion >= 50 ? km.warnText : km.errText
  const manquants = manquantsLabels.map(label => ({ label }))

  async function sauvegarder() {
    setSaving(true)
    setErreur("")
    const toInt = (v: string) => v ? parseInt(v) : null
    const meubleDb = form.meuble_pref === "peu_importe" ? null : form.meuble_pref === "oui"
    const data: any = {
      email: session?.user?.email,
      ville_souhaitee: form.ville_souhaitee,
      mode_localisation: form.mode_localisation,
      type_quartier: form.type_quartier,
      budget_min: toInt(form.budget_min),
      budget_max: toInt(form.budget_max),
      surface_min: toInt(form.surface_min),
      surface_max: toInt(form.surface_max),
      pieces_min: toInt(form.pieces_min),
      chambres_min: toInt(form.chambres_min),
      dpe_min: form.dpe_min,
      type_bail: form.type_bail,
      situation_pro: form.situation_pro,
      revenus_mensuels: toInt(form.revenus_mensuels),
      type_garant: form.type_garant,
      nb_occupants: toInt(form.nb_occupants),
      profil_locataire: form.profil_locataire,
      meuble: meubleDb,
      ...toggles,
      // V2.6 — matching v2 fields
      tolerance_budget_pct: form.tolerance_budget_pct ? parseInt(form.tolerance_budget_pct) : 10,
      rayon_recherche_km: form.rayon_recherche_km ? parseInt(form.rayon_recherche_km) : null,
      preferences_equipements: prefsEquip,
      // V7 chantier 2 — quartier prefere
      quartier_prefere_lat: quartierLat,
      quartier_prefere_lng: quartierLng,
      quartier_prefere_label: quartierLabel,
      // Sync legacy booleans avec prefsEquip pour compat read-side (lib/matching) :
      // "souhaite" ou "indispensable" -> true ; sinon false.
      ...Object.fromEntries(EQUIP_LIST.map(e => [
        e.key,
        prefsEquip[e.key] === "souhaite" || prefsEquip[e.key] === "indispensable",
      ])),
    }
    const { error } = await supabase.from("profils").upsert(data, { onConflict: "email" })
    if (error) {
      const { error: insertErr } = await supabase.from("profils").insert(data)
      if (insertErr) {
        const { email: _email, ...updateData } = data
        void _email
        const { error: updateErr } = await supabase.from("profils").update(updateData).eq("email", session?.user?.email!)
        if (updateErr) { setErreur("Erreur: " + updateErr.message); setSaving(false); return }
      }
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  // R10.3b — save sectionnel : n'upsert que les clés de la section concernée
  // + snapshot pour undo. Toast affiché 5 s avec compte à rebours.
  async function saveSection(sectionId: string) {
    if (!session?.user?.email) return
    const sec = SECTIONS.find(s => s.id === sectionId)
    if (!sec) return
    // Snapshot AVANT mutation (pour undo) — clone pour pas bouger.
    const prevForm = { ...form }
    const prevToggles = { ...toggles }
    const prevPrefsEquip = { ...prefsEquip }

    setSavingSection(sectionId)
    setErreur("")
    const toInt = (v: string) => v ? parseInt(v) : null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: Record<string, any> = { email: session.user.email }
    for (const k of sec.formKeys) {
      const raw = form[k]
      // Colonnes int en base : on cast, sinon on laisse string/ville_souhaitee.
      if (["budget_min", "budget_max", "surface_min", "surface_max", "pieces_min", "chambres_min", "nb_occupants", "revenus_mensuels", "rayon_recherche_km"].includes(k)) {
        patch[k] = toInt(raw)
      } else if (k === "tolerance_budget_pct") {
        // V9.2 — slider 0..50, default 10 si vide (avant 20).
        patch[k] = raw ? parseInt(raw) : 10
      } else if (k === "meuble_pref") {
        // 3-state UI → DB boolean nullable
        patch.meuble = raw === "peu_importe" ? null : raw === "oui"
      } else {
        patch[k] = raw
      }
    }
    for (const k of sec.toggleKeys) patch[k] = !!toggles[k]
    // V2.6 — section "equipements" : push aussi le jsonb preferences_equipements
    // + sync les booleans legacy (parking/cave/...) pour compat read-side legacy.
    if (sectionId === "equipements") {
      patch.preferences_equipements = prefsEquip
      for (const e of EQUIP_LIST) {
        patch[e.key] = prefsEquip[e.key] === "souhaite" || prefsEquip[e.key] === "indispensable"
      }
    }
    // V7 chantier 2 — quartier prefere persist dans la section "criteres"
    if (sectionId === "criteres") {
      patch.quartier_prefere_lat = quartierLat
      patch.quartier_prefere_lng = quartierLng
      patch.quartier_prefere_label = quartierLabel
    }

    const { error } = await supabase.from("profils").upsert(patch, { onConflict: "email" })
    if (error) {
      setErreur("Erreur : " + error.message)
      setSavingSection(null)
      return
    }
    setSavingSection(null)

    // Armer le toast undo. Si un précédent est en cours, annuler son timer.
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndo({
      sectionId,
      label: sec.label,
      prevForm,
      prevToggles,
      prevPrefsEquip,
      expiresAt: Date.now() + 5000,
    })
    undoTimerRef.current = setTimeout(() => setUndo(null), 5000)
  }

  async function applyUndo() {
    if (!undo || !session?.user?.email) return
    const sec = SECTIONS.find(s => s.id === undo.sectionId)
    if (!sec) return
    // Restaurer UI immédiatement (optimistic), puis persister.
    setForm(undo.prevForm)
    setToggles(undo.prevToggles)
    setPrefsEquip(undo.prevPrefsEquip)
    const toInt = (v: string) => v ? parseInt(v) : null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: Record<string, any> = { email: session.user.email }
    for (const k of sec.formKeys) {
      const raw = undo.prevForm[k]
      if (["budget_min", "budget_max", "surface_min", "surface_max", "pieces_min", "chambres_min", "nb_occupants", "revenus_mensuels", "rayon_recherche_km"].includes(k)) {
        patch[k] = toInt(raw)
      } else if (k === "tolerance_budget_pct") {
        patch[k] = raw ? parseInt(raw) : 20
      } else if (k === "meuble_pref") {
        patch.meuble = raw === "peu_importe" ? null : raw === "oui"
      } else {
        patch[k] = raw
      }
    }
    for (const k of sec.toggleKeys) patch[k] = !!undo.prevToggles[k]
    if (undo.sectionId === "equipements") {
      patch.preferences_equipements = undo.prevPrefsEquip
      for (const e of EQUIP_LIST) {
        patch[e.key] = undo.prevPrefsEquip[e.key] === "souhaite" || undo.prevPrefsEquip[e.key] === "indispensable"
      }
    }
    await supabase.from("profils").upsert(patch, { onConflict: "email" })
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndo(null)
  }

  // R10.3a — IntersectionObserver pour surligner la section active dans le TOC.
  useEffect(() => {
    if (!dataLoaded || proprietaireActive) return
    const nodes = SECTIONS.map(s => document.getElementById(s.id)).filter((n): n is HTMLElement => n !== null)
    if (nodes.length === 0) return
    const io = new IntersectionObserver(
      (entries) => {
        // Section avec le plus grand ratio visible = active.
        const visible = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible[0]) setActiveSection(visible[0].target.id)
      },
      { rootMargin: "-20% 0px -50% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    )
    nodes.forEach(n => io.observe(n))
    return () => io.disconnect()
  }, [dataLoaded, proprietaireActive])

  // R10.11 — Viewport wide (≥ 1280px) → Completion + Settings vont dans
  // l'aside sticky droite. En dessous, fallback inline (empile dans le flux).
  const [wideAside, setWideAside] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia("(min-width: 1280px)")
    const update = () => setWideAside(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  if (status === "loading" || !dataLoaded) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'DM Sans', sans-serif", color: km.muted }}>Chargement...</div>
  )
  if (!session) return null

  const inp: any = dossierInputStyle(isMobile)
  const sel: any = { ...inp, background: T.white }

  // V8 — saveBar state pour cosmetique du bouton DossierSaveBtn
  const saveBarState: "idle" | "saving" | "saved" = saving ? "saving" : saved ? "saved" : "idle"

  return (
    <main style={TOKENS.main}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500&display=swap');`}</style>

      <div style={TOKENS.container(isMobile)}>

        {/* V8 — Hero editorial style /dossier : eyebrow + rule + meta + grand
            titre Fraunces avec accent italic. Score card a droite reprend le
            visuel /dossier.
            V9.0 (Paul 2026-04-28) — rename "Mon profil" → "Mon espace
            locataire" / "Mon espace propriétaire" selon le rôle. */}
        {!proprietaireActive && (
          <DossierHero
            isMobile={isMobile}
            eyebrow="Mon espace locataire"
            metaRight={session.user?.email}
            title={session.user?.name?.split(" ")[0] || "Bienvenue"}
            titleAccent={(
              <>vos critères<br />de recherche.</>
            )}
            subtitle="Définissez ce que vous cherchez vraiment. Plus c'est précis, mieux on matche les annonces qui collent à votre vie."
            rightSlot={
              <DossierScoreCard
                isMobile={isMobile}
                eyebrow="Complétude critères"
                number={scoreCompletion}
                suffix="%"
                label={scoreCompletion === 100 ? "Profil complet — vous maximisez vos chances." : `${manquants.length} champ${manquants.length > 1 ? "s" : ""} manquant${manquants.length > 1 ? "s" : ""}`}
                alert={scoreCompletion < 50 ? {
                  title: "Profil à compléter",
                  body: "Un profil incomplet réduit la qualité du matching et masque certaines annonces.",
                  tone: "warn",
                } : undefined}
              />
            }
          />
        )}

        {/* Proprio : hero dossier-style aussi pour rester coherent. */}
        {proprietaireActive && (
          <DossierHero
            isMobile={isMobile}
            eyebrow="Mon espace propriétaire"
            metaRight={session.user?.email}
            title={session.user?.name?.split(" ")[0] || "Bienvenue"}
            titleAccent={(
              <>vos biens<br />en gestion.</>
            )}
            subtitle="Pilotez vos annonces, vos candidats et vos baux depuis un seul endroit."
            rightSlot={
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <a href="/proprietaire" style={{ background: T.ink, color: T.white, padding: "12px 22px", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 13, fontFamily: "'DM Sans', sans-serif", textAlign: "center" as const }}>
                  Dashboard propriétaire →
                </a>
                <a href="/proprietaire/ajouter" style={{ background: T.white, color: T.ink, border: `1px solid ${T.line}`, padding: "12px 22px", borderRadius: 999, textDecoration: "none", fontWeight: 600, fontSize: 13, fontFamily: "'DM Sans', sans-serif", textAlign: "center" as const }}>
                  Publier un bien
                </a>
              </div>
            }
          />
        )}

        {/* V11.4 (Paul 2026-04-28) — l'ancienne nav 5-tabs Preferences/Profil/
            Apparence/Securite/Compte est supprimee. Elle dupliquait la
            navigation du V6.3 hub Critères/Dossier ci-dessous + repetait des
            entrees deja accessibles via /parametres + le menu burger user.
            On ne garde que le hub tabs unifié. */}

        {/* V6.3 + V8 — Hub tabs Critères / Dossier alignees dossier-style. */}
        {!proprietaireActive && (
          <div style={{
            display: "flex",
            gap: 0,
            marginTop: 28,
            marginBottom: 24,
            borderBottom: `1px solid ${T.line}`,
            overflowX: "auto",
          }}>
            <span
              aria-current="page"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "14px 22px 16px",
                color: T.ink,
                fontSize: 14,
                fontWeight: 700,
                fontFamily: "inherit",
                whiteSpace: "nowrap",
                borderBottom: `2px solid ${T.ink}`,
                marginBottom: -1,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
                <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
                <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>
              </svg>
              Mes critères
              <span style={{ marginLeft: 4, padding: "1px 8px", borderRadius: 999, background: T.mutedBg, fontSize: 10, fontWeight: 700, color: scoreColor, border: `1px solid ${T.line}` }}>{scoreCompletion}%</span>
            </span>
            <Link
              href="/dossier"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "14px 22px 16px",
                color: T.soft,
                fontSize: 14,
                fontWeight: 500,
                fontFamily: "inherit",
                whiteSpace: "nowrap",
                textDecoration: "none",
                transition: "color 160ms",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              Mon dossier
            </Link>
          </div>
        )}

        {/* Bannière succès après création guidée */}
        {createdBannerOpen && !proprietaireActive && (
          <div style={{ background: km.successBg, border: `1px solid ${km.successLine}`, borderRadius: 16, padding: "14px 18px", marginBottom: 20, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span aria-hidden style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: km.successText, color: km.white }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </span>
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: km.successText, margin: 0 }}>Profil configuré</p>
              <p style={{ fontSize: 12, color: km.successText, margin: "2px 0 0", lineHeight: 1.5 }}>
                Chaque section ci-dessous reste modifiable à tout moment.
              </p>
            </div>
            <button type="button" aria-label="Fermer" onClick={() => setCreatedBannerOpen(false)} style={{ background: "transparent", border: "none", fontSize: 18, cursor: "pointer", color: km.successText, padding: 0, lineHeight: 1 }}>×</button>
          </div>
        )}

        {/* Proprio : message d'accueil simple */}
        {proprietaireActive && (
          <div style={{ background: km.white, border: `1px solid ${km.line}`, borderRadius: 20, padding: 26, marginBottom: 20, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
            <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, letterSpacing: "-0.3px", color: km.ink, margin: "0 0 10px" }}>Espace propriétaire</h2>
            <p style={{ fontSize: 14, color: km.muted, lineHeight: 1.6, marginBottom: 16 }}>
              En tant que propriétaire, votre profil contient vos informations personnelles. Les critères de recherche et le dossier locataire ne vous concernent pas.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a href="/proprietaire" style={{ padding: "10px 22px", background: km.ink, color: km.white, borderRadius: 999, textDecoration: "none", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.3px" }}>
                Dashboard propriétaire
              </a>
              <a href="/proprietaire/ajouter" style={{ padding: "10px 22px", background: km.beige, border: `1px solid ${km.line}`, color: km.ink, borderRadius: 999, textDecoration: "none", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.3px" }}>
                Publier un bien
              </a>
            </div>
          </div>
        )}

        {/* V8 — la CompletionCard inline est supprimee : le score est deja dans
            le hero (DossierScoreCard a droite). Plus besoin de doublon. */}

        {/* Lien discret « Reprendre la configuration guidée » pour les profils 20–80 %. */}
        {!proprietaireActive && scoreCompletion > 20 && scoreCompletion < 100 && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <a href="/profil/creer" style={{ fontSize: 11, fontWeight: 700, color: T.ink, textDecoration: "underline", textUnderlineOffset: 4, textTransform: "uppercase", letterSpacing: "1.2px" }}>
              Reprendre la configuration guidée →
            </a>
          </div>
        )}

        {!proprietaireActive && <>

        {/* Sommaire sticky (desktop) + layout 2 colonnes — R10.3a.
            Sur mobile, le TOC se replie en une barre horizontale scrollable
            placée juste avant les sections. */}
        <ProfilTOC active={activeSection} isMobile={isMobile} />

        {/* V8 — column flex avec gap 20 entre sections, comme /dossier body. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        <DossierSection
          id="criteres"
          isMobile={isMobile}
          num="01"
          kicker="Critères"
          subtitle="Lieu, budget, surface"
          title="Mes critères de recherche"
          footer={<DossierSaveBtn state={savingSection === "criteres" ? "saving" : "idle"} onClick={() => saveSection("criteres")}>{savingSection === "criteres" ? "Enregistrement…" : "Enregistrer cette section"}</DossierSaveBtn>}
        >
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            <DossierField label={<>Ville souhaitée <Tooltip text="Choisissez une ville dans la liste. Elle sera utilisée pour centrer la carte et matcher les annonces. Tapez pour filtrer les suggestions." /></>}>
              <CityAutocomplete value={form.ville_souhaitee} onChange={v => setForm(f => ({ ...f, ville_souhaitee: v }))} placeholder="Commencez à taper..." />
            </DossierField>
            <DossierField label={<>Mode de localisation <Tooltip text="Strict : seules les annonces dans votre ville exacte s'affichent. Souple : les villes voisines sont aussi visibles, avec un score ajusté." /></>}>
              <select style={sel} value={form.mode_localisation} onChange={set("mode_localisation")}>
                <option value="souple">Souple — autres villes visibles</option>
                <option value="strict">Strict — uniquement ma ville</option>
              </select>
            </DossierField>
            <DossierField label="Type de quartier">
              <select style={sel} value={form.type_quartier} onChange={set("type_quartier")}>
                <option value="">Peu importe</option>
                <option value="centre-ville">Centre-ville</option>
                <option value="intra muros">Intra muros</option>
                <option value="residentiel">Résidentiel</option>
                <option value="peri-urbain">Péri-urbain</option>
                <option value="campagne">Campagne</option>
                <option value="bord de mer">Bord de mer</option>
                <option value="calme">Calme</option>
                <option value="anime">Animé</option>
              </select>
            </DossierField>
            <DossierField label="Budget min (€/mois)"><input style={inp} type="number" value={form.budget_min} onChange={set("budget_min")} placeholder="600" /></DossierField>
            <DossierField label="Budget max (€/mois)"><input style={inp} type="number" value={form.budget_max} onChange={set("budget_max")} placeholder="1200" /></DossierField>
            <DossierField label="Surface min (m²)"><input style={inp} type="number" value={form.surface_min} onChange={set("surface_min")} placeholder="30" /></DossierField>
            <DossierField label="Surface max (m²)"><input style={inp} type="number" value={form.surface_max} onChange={set("surface_max")} placeholder="80" /></DossierField>
            <DossierField label="Pièces minimum">
              <select style={sel} value={form.pieces_min} onChange={set("pieces_min")}>{["1","2","3","4","5+"].map(v=><option key={v}>{v}</option>)}</select>
            </DossierField>
            <DossierField label="Chambres minimum">
              <select style={sel} value={form.chambres_min} onChange={set("chambres_min")}>{["0","1","2","3","4+"].map(v=><option key={v}>{v}</option>)}</select>
            </DossierField>
            <DossierField label={<>DPE minimum accepté <Tooltip text="Le Diagnostic de Performance Énergétique classe un logement de A (très économe) à G (très énergivore). Choisir D signifie que vous refusez les classes E, F, G (logements considérés passoires thermiques)." /></>}>
              <select style={sel} value={form.dpe_min} onChange={set("dpe_min")}>{["A","B","C","D","E","F","G"].map(v=><option key={v}>{v}</option>)}</select>
            </DossierField>
            <DossierField label={<>Type de bail <Tooltip text="Longue durée : bail classique 3 ans (ou 1 an meublé). Courte durée : bail saisonnier. Bail mobilité : 1 à 10 mois pour étudiants/salariés en mission. Colocation : bail partagé entre plusieurs locataires." /></>}>
              <select style={sel} value={form.type_bail} onChange={set("type_bail")}>{["longue durée","courte durée","bail mobilité","colocation"].map(v=><option key={v}>{v}</option>)}</select>
            </DossierField>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
            <DossierToggle
              checked={!!toggles.rez_de_chaussee_ok}
              onChange={v => setToggles(t => ({ ...t, rez_de_chaussee_ok: v }))}
              label="Rez-de-chaussée accepté"
              subText="Si désactivé, les annonces au RDC ne sont pas affichées."
            />
            <DossierToggle
              checked={!!toggles.dpe_min_actif}
              onChange={v => setToggles(t => ({ ...t, dpe_min_actif: v }))}
              label={`Filtrer strictement sur le DPE ${form.dpe_min}`}
              subText="Si activé, les annonces avec un DPE pire que votre minimum sont exclues. Sinon, juste un score réduit."
            />
          </div>

          {/* Tolerance budget slider — restyle dossier-aligned */}
          <div style={{ marginTop: 18, padding: "16px 18px", background: T.mutedBg, border: `1px solid ${T.hairline}`, borderRadius: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>
                Tolérance budget
                <Tooltip text="Pourcentage au-delà du budget max où une annonce reste visible. À 10%, une annonce à 1100 € passe le filtre si votre budget est 1000. À 0%, plus aucun dépassement n'est toléré." />
              </label>
              <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontFeatureSettings: "'ss01'", fontStyle: "italic", fontWeight: 400, fontSize: 22, color: T.ink, fontVariantNumeric: "tabular-nums" }}>
                {form.tolerance_budget_pct || "10"}%
              </span>
            </div>
            <input
              type="range" min={0} max={50} step={5}
              value={form.tolerance_budget_pct || "10"}
              onChange={set("tolerance_budget_pct")}
              style={{ width: "100%", accentColor: T.ink }}
              aria-label="Tolerance budget en pourcentage"
            />
            <p style={{ fontSize: 11, color: T.soft, marginTop: 6, lineHeight: 1.5 }}>
              {form.budget_max
                ? `Annonces visibles jusqu'à ${Math.round(parseInt(form.budget_max) * (1 + parseInt(form.tolerance_budget_pct || "10") / 100))} €/mois.`
                : "Définissez un budget max pour voir l'effet."}
            </p>
          </div>

          {/* Rayon de recherche en km — restyle */}
          <div style={{ marginTop: 14, padding: "16px 18px", background: T.mutedBg, border: `1px solid ${T.hairline}`, borderRadius: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 12, flexWrap: "wrap" }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>
                Rayon de recherche
                <Tooltip text="Distance maximale (en km) depuis votre ville souhaitée. Les annonces dans ce rayon reçoivent un bonus selon leur proximité. Laisser vide pour ne pas en tenir compte." />
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="number" min={0} max={200}
                  value={form.rayon_recherche_km}
                  onChange={set("rayon_recherche_km")}
                  placeholder="—"
                  style={{ ...inp, width: 90, padding: "8px 12px", textAlign: "right" }}
                  aria-label="Rayon recherche km"
                />
                <span style={{ fontSize: 13, color: T.soft }}>km</span>
              </div>
            </div>
            <p style={{ fontSize: 11, color: T.soft, marginTop: 4, lineHeight: 1.5 }}>
              Bonus de pertinence pour les annonces proches de la ville souhaitée.
              {form.ville_souhaitee && form.rayon_recherche_km && ` Ex. : annonces jusqu'à ${form.rayon_recherche_km} km de ${form.ville_souhaitee}.`}
            </p>
          </div>

          {/* V7 chantier 2 — picker quartier prefere (Leaflet marker draggable). */}
          <QuartierPicker
            ville={form.ville_souhaitee}
            lat={quartierLat}
            lng={quartierLng}
            label={quartierLabel}
            onChange={({ lat, lng, label }) => {
              setQuartierLat(lat)
              setQuartierLng(lng)
              if (label) setQuartierLabel(label)
            }}
            onClear={() => { setQuartierLat(null); setQuartierLng(null); setQuartierLabel(null) }}
            isMobile={isMobile}
          />
        </DossierSection>

        <DossierSection
          id="equipements"
          isMobile={isMobile}
          num="02"
          kicker="Équipements"
          subtitle="Meublé, animaux, équipements"
          title="Équipements souhaités"
          footer={<DossierSaveBtn state={savingSection === "equipements" ? "saving" : "idle"} onClick={() => saveSection("equipements")}>{savingSection === "equipements" ? "Enregistrement…" : "Enregistrer cette section"}</DossierSaveBtn>}
        >
          {/* Meublé tri-state — chips DossierChip */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.soft, marginBottom: 8, textTransform: "uppercase", letterSpacing: "1.4px" }}>
              Meublé — votre préférence
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { v: "peu_importe", l: "Peu importe" },
                { v: "oui", l: "Meublé" },
                { v: "non", l: "Non meublé" },
              ].map(opt => (
                <DossierChip
                  key={opt.v}
                  active={form.meuble_pref === opt.v}
                  onClick={() => setForm(f => ({ ...f, meuble_pref: opt.v }))}
                >
                  {opt.l}
                </DossierChip>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <DossierToggle
              checked={!!toggles.animaux}
              onChange={v => setToggles(t => ({ ...t, animaux: v }))}
              label="Animaux acceptés"
              subText="Cochez si vous avez un animal — les annonces refusant les animaux seront exclues."
            />
          </div>

          {/* V2.6 — picker tri-state par equipement (indispensable / souhaité / indifférent / refusé) */}
          <p style={{ fontSize: 11, fontWeight: 700, color: T.soft, textTransform: "uppercase", letterSpacing: "1.4px", margin: "20px 0 12px" }}>
            Mes équipements souhaités
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {EQUIP_LIST.map(e => (
              <EquipementPreferencePicker
                key={e.key}
                label={e.label}
                value={prefsEquip[e.key] || "indifferent"}
                onChange={(v) => setPrefsEquip(prev => ({ ...prev, [e.key]: v }))}
                isMobile={isMobile}
              />
            ))}
          </div>
        </DossierSection>

        <DossierSection
          id="proximites"
          isMobile={isMobile}
          num="03"
          kicker="Environnement"
          subtitle="Transports, écoles, commerces"
          title="Proximités souhaitées"
          footer={<DossierSaveBtn state={savingSection === "proximites" ? "saving" : "idle"} onClick={() => saveSection("proximites")}>{savingSection === "proximites" ? "Enregistrement…" : "Enregistrer cette section"}</DossierSaveBtn>}
        >
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
            <DossierToggle checked={!!toggles.proximite_metro} onChange={v => setToggles(t => ({ ...t, proximite_metro: v }))} label="Proche métro/bus" />
            <DossierToggle checked={!!toggles.proximite_ecole} onChange={v => setToggles(t => ({ ...t, proximite_ecole: v }))} label="Proche écoles" />
            <DossierToggle checked={!!toggles.proximite_commerces} onChange={v => setToggles(t => ({ ...t, proximite_commerces: v }))} label="Proche commerces" />
            <DossierToggle checked={!!toggles.proximite_parcs} onChange={v => setToggles(t => ({ ...t, proximite_parcs: v }))} label="Proche parcs" />
          </div>
        </DossierSection>

        <DossierSection
          id="profil-locataire"
          isMobile={isMobile}
          num="04"
          kicker="Locataire"
          subtitle="Profil, revenus, garant"
          title="Mon profil de locataire"
          footer={<DossierSaveBtn state={savingSection === "profil-locataire" ? "saving" : "idle"} onClick={() => saveSection("profil-locataire")}>{savingSection === "profil-locataire" ? "Enregistrement…" : "Enregistrer cette section"}</DossierSaveBtn>}
        >
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            <DossierField label={<>Situation professionnelle <Tooltip text="Votre situation actuelle. Les propriétaires y sont sensibles : CDI et fonctionnaire rassurent le plus, mais un garant solide peut compenser un CDD, une situation d'indépendant ou d'étudiant." /></>}>
              <select style={sel} value={form.situation_pro} onChange={set("situation_pro")}>{["CDI","CDD","indépendant","étudiant","retraité","fonctionnaire","autre"].map(v=><option key={v}>{v}</option>)}</select>
            </DossierField>
            <DossierField label="Revenus mensuels nets (€)"><input style={inp} type="number" value={form.revenus_mensuels} onChange={set("revenus_mensuels")} placeholder="2500" /></DossierField>
            <DossierField label="Profil">
              <select style={sel} value={form.profil_locataire} onChange={set("profil_locataire")}>{["étudiant","jeune actif","couple","famille","senior","colocation"].map(v=><option key={v}>{v}</option>)}</select>
            </DossierField>
            <DossierField label="Nombre d'occupants">
              <select style={sel} value={form.nb_occupants} onChange={set("nb_occupants")}>{["1","2","3","4","5+"].map(v=><option key={v}>{v}</option>)}</select>
            </DossierField>
            <DossierField label={<>Type de garant <Tooltip text="Personnel : un proche (parent, etc.) se porte caution. Visale : garantie gratuite d'Action Logement, très acceptée par les propriétaires. Caution bancaire : somme bloquée en banque. Avoir un garant multiplie vos chances d'obtenir un logement." /></>}>
              <select style={sel} value={form.type_garant} onChange={set("type_garant")}>{["","personnel","organisme (Visale)","caution bancaire","aucun"].map(v=><option key={v} value={v}>{v||"Non renseigné"}</option>)}</select>
            </DossierField>
          </div>
          <div style={{ marginTop: 14 }}>
            <DossierToggle
              checked={!!toggles.fumeur}
              onChange={v => setToggles(t => ({ ...t, fumeur: v }))}
              label="Fumeur"
              subText="Honnête vis-à-vis du propriétaire — certaines annonces refusent les fumeurs."
            />
          </div>
          <p style={{ fontSize: 12, color: T.soft, marginTop: 18, lineHeight: 1.6 }}>
            Le champ <strong>Profil</strong> (notamment l&apos;option « couple ») est utilisé uniquement pour améliorer la pertinence du matching et l&apos;évaluation de votre dossier. Il n&apos;est jamais partagé sans votre accord, conformément au RGPD.
          </p>
        </DossierSection>

        </div>{/* V8 — close column flex sections */}

        {erreur && (
          <div style={{ background: "#FEECEC", color: "#b91c1c", border: "1px solid #F4C9C9", padding: "12px 20px", borderRadius: 14, marginTop: 20, fontSize: 14 }}>
            {erreur}
          </div>
        )}

        {/* V8 — Save bar finale alignee dossier : grande pill noire pleine largeur
            sur mobile, alignee a droite sur desktop. Etat saving/saved cohérent. */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginTop: 24 }}>
          {saved ? (
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: T.success, fontWeight: 600, fontSize: 13 }}>
                <span aria-hidden style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: T.successBg, border: `1px solid ${T.successLine}`, color: T.success }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </span>
                Sauvegardé.
              </span>
            </div>
          ) : <span />}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/annonces" style={{ background: T.white, color: T.ink, border: `1px solid ${T.line}`, padding: "12px 22px", borderRadius: 999, textDecoration: "none", fontWeight: 600, fontSize: 13, fontFamily: "inherit" }}>
              Voir les annonces →
            </a>
            <button onClick={sauvegarder} disabled={saving}
              style={{
                background: saveBarState === "saving" ? "#8a8477" : saveBarState === "saved" ? T.success : T.ink,
                color: T.white,
                border: "none",
                borderRadius: 999,
                padding: "12px 28px",
                fontWeight: 700,
                fontSize: 13,
                cursor: saving ? "not-allowed" : "pointer",
                fontFamily: "'DM Sans', sans-serif",
                whiteSpace: "nowrap",
              }}>
              {saving ? "Enregistrement…" : "Enregistrer mes préférences"}
            </button>
          </div>
        </div>
        </>}

        {/* V11.4 — Aside droite supprimee : la CompletionCard etait redondante
            avec DossierScoreCard deja affiche dans le hero. SettingsCardInline
            (lien vers /parametres) est accessible via le menu burger user.
            Plus de 3 cards stackees a droite, plus de TOC qui chevauche le
            hero. Layout propre : hero centre + sections column-flex en dessous,
            TOC sticky desktop sur la gauche en dehors du flow centre. */}
      </div>

      {undo && (
        <UndoToast
          label={`« ${undo.label} » enregistrée`}
          onUndo={applyUndo}
          onDismiss={() => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); setUndo(null) }}
        />
      )}
    </main>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers HORS composant — CLAUDE.md convention (focus preservation).
// ═══════════════════════════════════════════════════════════════════════════

function ProfilTOC({ active, isMobile }: { active: string; isMobile: boolean }) {
  // V11.4 (Paul 2026-04-28) — Desktop aside : visible uniquement si viewport
  // >= 1640px pour eviter de chevaucher le contenu centre. Container maxWidth
  // 1240 + auto margin + TOC width 200 + gap 20 = 1460px minimum + buffer
  // 180 = 1640. Sous ce seuil, on retombe sur la barre horizontale scrollable
  // (cf. branche if (isMobile || !wide) ci-dessous).
  // Ancien threshold 1200px causait l'overlap massif sur 1280-1440 viewports.
  const [wide, setWide] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia("(min-width: 1640px)")
    const update = () => setWide(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  if (isMobile || !wide) {
    // V8 — Barre horizontale scrollable (mobile + tablette) restyle dossier.
    return (
      <nav aria-label="Sommaire du profil" style={{
        position: "sticky", top: 72, zIndex: 10, background: T.bg,
        padding: "10px 0 14px", marginBottom: 16,
        overflowX: "auto", whiteSpace: "nowrap",
        borderBottom: `1px solid ${T.hairline}`,
      }}>
        <div style={{ display: "inline-flex", gap: 8, padding: "0 2px" }}>
          {SECTIONS.map((s, idx) => {
            const on = s.id === active
            return (
              <a key={s.id} href={`#${s.id}`} style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "7px 14px", borderRadius: 999,
                border: `1px solid ${on ? T.ink : T.line}`,
                background: on ? T.ink : T.white, color: on ? T.white : T.ink,
                textDecoration: "none", fontSize: 12, fontWeight: 600,
              }}>
                <span style={{ fontStyle: "italic", fontFamily: "'Fraunces', Georgia, serif", fontSize: 11, color: on ? "rgba(255,255,255,0.6)" : T.soft }}>
                  {String(idx + 1).padStart(2, "0")}
                </span>
                {s.label}
              </a>
            )
          })}
        </div>
      </nav>
    )
  }
  // V8 + V11.4 — TOC desktop sticky restyle dossier. Position fixed left
  // calc(50vw - 700px) (au lieu de -610) pour laisser largement la place au
  // hero centre 1240 maxWidth + ne plus chevaucher le contenu sur 1400px.
  return (
    <aside aria-label="Sommaire du profil" style={{
      position: "fixed", left: "max(20px, calc(50vw - 700px))", top: 120,
      width: 200, zIndex: 5,
      padding: "18px 0",
    }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: T.soft, textTransform: "uppercase", letterSpacing: "1.8px", margin: "0 12px 14px" }}>
        Sommaire
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        {SECTIONS.map((s, idx) => {
          const on = s.id === active
          return (
            <li key={s.id}>
              <a href={`#${s.id}`} style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                alignItems: "center",
                gap: 10,
                padding: on ? "12px 16px" : "10px 12px",
                borderRadius: 10,
                background: on ? T.ink : "transparent",
                color: on ? T.white : "inherit",
                borderLeft: on ? `2px solid ${T.ink}` : "2px solid transparent",
                marginLeft: on ? -2 : 0,
                textDecoration: "none",
                transition: "background 200ms ease, color 200ms ease, padding 200ms ease",
              }}>
                <span style={{ fontSize: 13, fontStyle: "italic", color: on ? T.white : T.soft, fontVariantNumeric: "tabular-nums", fontWeight: 400, fontFamily: "'Fraunces', Georgia, serif" }}>
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span style={{ fontSize: 14, fontWeight: on ? 700 : 500, color: on ? T.white : T.meta }}>
                  {s.label}
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

// V2.6 (Paul 2026-04-27) — picker tri-state par equipement.
// 4 etats : indispensable / souhaite / indifferent / refuse. Hors du composant
// principal pour preserver le focus (convention CLAUDE.md).
// V4.1 (Paul 2026-04-28) — sur tablette/mobile (< 1024px), stack vertical
// pour eviter overflow horizontal des 4 boutons + label.
function EquipementPreferencePicker({
  label, value, onChange, isMobile,
}: {
  label: string
  value: EquipPref
  onChange: (v: EquipPref) => void
  isMobile: boolean
}) {
  // V4.1 — detection tablette inline (640-1023px) pour stack aussi
  const [isTablet, setIsTablet] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia("(max-width: 1023px)")
    const update = () => setIsTablet(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])
  const stack = isMobile || isTablet
  const opts: Array<{ v: EquipPref; l: string; tone: string }> = [
    { v: "indispensable", l: "Indispensable", tone: "#16a34a" },
    { v: "souhaite",      l: "Souhaité",      tone: "#0ea5e9" },
    { v: "indifferent",   l: "Indifférent",   tone: "#9ca3af" },
    { v: "refuse",        l: "Refusé",        tone: "#dc2626" },
  ]
  // V8 — restyle dossier-aligned : carte mutedBg + radius 14, pickers en
  // chips DossierChip-like avec tone different par etat.
  return (
    <div style={{
      display: "flex",
      flexDirection: stack ? "column" : "row",
      alignItems: stack ? "stretch" : "center",
      justifyContent: "space-between",
      gap: stack ? 10 : 14,
      padding: "14px 16px",
      borderRadius: 14,
      border: `1px solid ${T.hairline}`,
      background: T.mutedBg,
    }}>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: T.ink, letterSpacing: "-0.1px" }}>{label}</span>
      <div role="radiogroup" aria-label={`Préférence ${label}`} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {opts.map(opt => {
          const active = value === opt.v
          return (
            <button
              key={opt.v}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.v)}
              style={{
                // V10.3 — tap target minHeight 44
                minHeight: 44,
                padding: "10px 14px",
                borderRadius: 999,
                border: `1px solid ${active ? opt.tone : T.line}`,
                background: active ? opt.tone : T.white,
                color: active ? "#fff" : "#333",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 140ms",
                whiteSpace: "nowrap",
                WebkitTapHighlightColor: "transparent",
                touchAction: "manipulation",
              }}
            >
              {opt.l}
            </button>
          )
        })}
      </div>
      {/* V7 chantier 1 — disclaimer si Indispensable selected */}
      {value === "indispensable" && (
        <p style={{ fontSize: 11.5, color: T.warning, margin: "0", lineHeight: 1.45, fontStyle: "italic" as const, width: stack ? "100%" : undefined, fontFamily: "'Fraunces', Georgia, serif", fontWeight: 400 }}>
          ⚠ <strong style={{ fontStyle: "normal", fontFamily: "'DM Sans', sans-serif", fontWeight: 700 }}>Indispensable</strong> = on ne te montre pas les annonces sans {label.toLowerCase()}.
        </p>
      )}
    </div>
  )
}

function SectionSaveBtn({
  sectionId: _sectionId, saving, onSave,
}: { sectionId: string; saving: boolean; onSave: () => void }) {
  void _sectionId
  return (
    <KMButton size="sm" onClick={onSave} disabled={saving}>
      {saving ? "Enregistrement…" : "Enregistrer cette section"}
    </KMButton>
  )
}

// R10.11 — CompletionCard extrait : utilisé soit inline (narrow), soit dans
// l'aside sticky droit (wide ≥ 1280px). En mode compact, padding réduit + titre
// plus petit pour s'adapter aux 280px de large.
function CompletionCard({
  scoreCompletion, scoreColor, manquants, compact = false,
}: {
  scoreCompletion: number
  scoreColor: string
  manquants: Array<{ label: string }>
  compact?: boolean
}) {
  const padX = compact ? 20 : 26
  const padY = compact ? 20 : 26
  const titleSize = compact ? 17 : 22
  const scoreSize = compact ? 26 : 32

  return (
    <div style={{ background: km.white, border: `1px solid ${km.line}`, borderRadius: 20, padding: `${padY}px ${padX}px`, marginBottom: compact ? 0 : 20, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 4px" }}>Complétion</p>
          <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: titleSize, letterSpacing: "-0.3px", color: km.ink, margin: 0, lineHeight: 1.15 }}>
            {compact ? "Votre dossier" : "Complétion du dossier"}
          </h2>
          {!compact && (
            <p style={{ fontSize: 13, color: km.muted, marginTop: 4 }}>
              {scoreCompletion === 100 ? "Dossier complet — vous maximisez vos chances !" : `Remplissez les champs manquants pour booster votre profil`}
            </p>
          )}
        </div>
        <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontSize: scoreSize, fontWeight: 500, color: scoreColor, letterSpacing: "-0.5px" }}>{scoreCompletion}%</span>
      </div>

      {/* Barre de progression */}
      <div style={{ background: km.beige, border: `1px solid ${km.line}`, borderRadius: 999, height: 10, marginBottom: 14, overflow: "hidden" }}>
        <div style={{ background: scoreColor, borderRadius: 999, height: "100%", width: `${scoreCompletion}%`, transition: "width 0.4s ease" }} />
      </div>

      {/* Champs manquants : lien scroll-to-section plutôt que simple pill */}
      {manquants.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: scoreCompletion <= 20 ? 16 : 0 }}>
          {manquants.map(c => (
            <a
              key={c.label}
              href={`#${manquantToSectionId(c.label)}`}
              style={{
                background: km.warnBg, color: km.warnText, border: `1px solid ${km.warnLine}`,
                padding: "4px 10px", borderRadius: 999,
                fontSize: 10, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "1px",
                textDecoration: "none", whiteSpace: "nowrap",
              }}
            >
              {c.label}
            </a>
          ))}
        </div>
      )}

      {/* CTA wizard — affiché uniquement si profil très incomplet */}
      {scoreCompletion <= 20 && (
        <div style={{ borderTop: `1px solid ${km.beige}`, paddingTop: 14, marginTop: 4, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: compact ? 0 : 220 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 4px" }}>Configuration guidée</p>
            {!compact && (
              <p style={{ fontSize: 13, color: km.ink, margin: 0, lineHeight: 1.5 }}>
                5 étapes rapides pour construire un profil complet.
              </p>
            )}
          </div>
          <a href="/profil/creer" style={{ background: km.ink, color: km.white, padding: "9px 18px", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.6px", whiteSpace: "nowrap" }}>
            Démarrer →
          </a>
        </div>
      )}
    </div>
  )
}

// R10.11 — Mapping label → id de section pour les liens scroll-to depuis
// CompletionCard. Les labels viennent de lib/profilCompleteness.
function manquantToSectionId(label: string): string {
  const criteres = ["ville", "budget", "surface", "pièces", "chambres", "dpe", "bail", "quartier"]
  const profil = ["situation", "revenus", "garant", "occupants", "profil"]
  const low = label.toLowerCase()
  if (criteres.some(k => low.includes(k))) return "criteres"
  if (profil.some(k => low.includes(k))) return "profil-locataire"
  return "criteres"
}

// R10.11 — SettingsCardInline extrait. En mode compact (aside droit), mise
// en page verticale (titre → desc → bouton) au lieu du row wide.
function SettingsCardInline({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div style={{ background: km.white, border: `1px solid ${km.line}`, borderRadius: 20, padding: 20, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 4px" }}>Compte</p>
        <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 17, letterSpacing: "-0.3px", color: km.ink, margin: "0 0 8px", lineHeight: 1.15 }}>
          Paramètres
        </h2>
        <p style={{ fontSize: 12, color: km.muted, margin: "0 0 14px", lineHeight: 1.5 }}>
          Mot de passe, apparence, notifications, suppression.
        </p>
        <Link href="/parametres" style={{ display: "inline-block", background: km.ink, color: km.white, borderRadius: 999, padding: "9px 18px", textDecoration: "none", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.3px" }}>
          Ouvrir →
        </Link>
      </div>
    )
  }
  // V4.8 — sur tablette etroite (768-900px), le titre + paragraphe + lien
  // se chevauchaient parce que `flexWrap: wrap` faisait wrap mais le lien
  // gardait une largeur \"nowrap\" qui depassait. Padding reduit + min-width:0
  // sur le bloc texte permet de wrap proprement.
  return (
    <div style={{ background: km.white, border: `1px solid ${km.line}`, borderRadius: 20, padding: "20px 22px", marginTop: 24, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
      <div style={{ minWidth: 0, flex: "1 1 240px" }}>
        <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 20, letterSpacing: "-0.3px", color: km.ink, margin: "0 0 6px" }}>Paramètres du compte</h2>
        <p style={{ fontSize: 13, color: km.muted, margin: 0, lineHeight: 1.5 }}>Mot de passe, apparence (clair/sombre), notifications, suppression de compte.</p>
      </div>
      <Link href="/parametres" style={{ background: km.ink, color: km.white, borderRadius: 999, padding: "10px 22px", textDecoration: "none", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.3px", flexShrink: 0 }}>
        Ouvrir les paramètres →
      </Link>
    </div>
  )
}

function UndoToast({ label, onUndo, onDismiss }: { label: string; onUndo: () => void; onDismiss: () => void }) {
  // V11.3 (Paul 2026-04-28) — fix bug du toast qui wrappait sur 3 lignes
  // avec orphan « / » sur des lignes seules. Layout flex revu :
  // - max-width min(92vw, 480px) au lieu de calc(100vw - 32px) pour
  //   ne pas etre trop etroit
  // - borderRadius 16 (pas pill 999) — content multi-words fit mieux
  //   dans rectangle a coins arrondis
  // - text container : flex 1 1 auto + minWidth 0 → permet le shrink
  //   mais empeche les chevrons orphelins (white-space normal naturel)
  // - boutons : flex-shrink 0 + minHeight 44 (V10.3 tap-target)
  // - safe-area-inset-bottom pour iPhone notch
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 8000,
        background: km.ink,
        color: km.white,
        borderRadius: 16,
        padding: "10px 12px 10px 16px",
        boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 13,
        fontWeight: 500,
        flexWrap: "nowrap",
        maxWidth: "min(92vw, 480px)",
        boxSizing: "border-box",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flex: "1 1 auto", minWidth: 0 }}>
        <span aria-hidden style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: "rgba(255,255,255,0.18)", flexShrink: 0 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </span>
        <span style={{ flex: "1 1 auto", minWidth: 0, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {label}
        </span>
      </span>
      <button
        type="button"
        onClick={onUndo}
        style={{
          background: "transparent",
          color: km.white,
          border: `1px solid rgba(255,255,255,0.35)`,
          borderRadius: 999,
          padding: "8px 14px",
          fontFamily: "inherit",
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "1px",
          cursor: "pointer",
          flexShrink: 0,
          minHeight: 44,
          minWidth: 80,
          WebkitTapHighlightColor: "transparent",
          touchAction: "manipulation",
        }}
      >Annuler</button>
      <button
        type="button"
        aria-label="Fermer"
        onClick={onDismiss}
        style={{
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,0.7)",
          fontSize: 20,
          cursor: "pointer",
          padding: 0,
          lineHeight: 1,
          fontFamily: "inherit",
          flexShrink: 0,
          width: 44,
          height: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          WebkitTapHighlightColor: "transparent",
          touchAction: "manipulation",
        }}
      >×</button>
    </div>
  )
}