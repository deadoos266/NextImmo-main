"use client"
import { useSession, signOut } from "next-auth/react"
import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "../../lib/supabase"
import { useResponsive } from "../hooks/useResponsive"
import { useRole } from "../providers"
import Link from "next/link"
import CityAutocomplete from "../components/CityAutocomplete"
import Tooltip from "../components/Tooltip"

// Composants HORS du composant principal pour éviter le bug de focus
import { Toggle, Sec, F } from "../components/FormHelpers"
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
    tolerance_budget_pct: "20",
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
                ? String(data.tolerance_budget_pct) : "20",
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
      tolerance_budget_pct: form.tolerance_budget_pct ? parseInt(form.tolerance_budget_pct) : 20,
      rayon_recherche_km: form.rayon_recherche_km ? parseInt(form.rayon_recherche_km) : null,
      preferences_equipements: prefsEquip,
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
        // V2.6 — slider 0..50, default 20 si vide
        patch[k] = raw ? parseInt(raw) : 20
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

  const inp: any = { width: "100%", padding: "11px 14px", border: `1px solid ${km.line}`, borderRadius: 10, fontSize: 16, outline: "none", boxSizing: "border-box", fontFamily: "inherit", background: km.white }
  const sel: any = { ...inp, background: km.white }

  return (
    <main style={{ minHeight: "100vh", background: km.beige, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500&display=swap');`}</style>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: isMobile ? "24px 16px" : "48px" }}>

        <div style={{ background: km.white, border: `1px solid ${km.line}`, borderRadius: 20, padding: isMobile ? "20px 18px" : 32, marginBottom: 20, display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 16 : 0, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 14 : 24 }}>
            {(photoCustom || session.user?.image)
              ? <img src={photoCustom || session.user?.image || ""} alt="p" referrerPolicy="no-referrer" style={{ width: isMobile ? 52 : 72, height: isMobile ? 52 : 72, borderRadius: "50%", objectFit: "cover" }} />
              : <div style={{ width: isMobile ? 52 : 72, height: isMobile ? 52 : 72, borderRadius: "50%", background: km.ink, display: "flex", alignItems: "center", justifyContent: "center", fontSize: isMobile ? 20 : 28, color: km.white, fontWeight: 600, fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic" }}>{session.user?.name?.[0]}</div>
            }
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 6px" }}>Mon profil</p>
              <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: isMobile ? 24 : 32, letterSpacing: "-0.5px", color: km.ink, margin: 0 }}>{session.user?.name}</h1>
              <p style={{ color: km.muted, marginTop: 4, fontSize: isMobile ? 13 : 14 }}>{session.user?.email}</p>
              <span style={{ background: km.successBg, color: km.successText, border: `1px solid ${km.successLine}`, padding: "4px 12px", borderRadius: 999, fontSize: 10, fontWeight: 700, marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, textTransform: "uppercase", letterSpacing: "1.2px" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12"/></svg>
                Compte vérifié
              </span>
            </div>
          </div>
          <a href={proprietaireActive ? "/proprietaire" : "/annonces"} style={{ background: km.ink, color: km.white, padding: "10px 22px", borderRadius: 999, textDecoration: "none", fontWeight: 600, fontSize: 11, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.3px" }}>
            {proprietaireActive ? "Mes biens →" : "Voir les annonces →"}
          </a>
        </div>

        {/* Nav onglets unifiée — 5 onglets symétriques avec /parametres :
            Préférences (page courante = /profil) + 4 liens vers /parametres?tab=…
            Donne l'illusion d'une page tabbée 5 onglets sans refactor 900 LoC. */}
        <nav
          aria-label="Catégories de réglages"
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 20,
            overflowX: isMobile ? "auto" : "visible",
            paddingBottom: isMobile ? 2 : 0,
            flexWrap: isMobile ? "nowrap" : "wrap",
          }}
        >
          {/* Préférences = onglet actif (page courante) */}
          <span
            aria-current="page"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 16px",
              background: km.ink,
              color: km.white,
              border: `1px solid ${km.ink}`,
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "inherit",
              whiteSpace: "nowrap",
              flexShrink: 0,
              boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
              <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
              <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>
            </svg>
            Préférences
          </span>
          {[
            { tab: "profil", label: "Profil", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
            { tab: "apparence", label: "Apparence", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg> },
            { tab: "securite", label: "Sécurité", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
            { tab: "compte", label: "Compte", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="3"/></svg> },
          ].map(t => (
            <Link
              key={t.tab}
              href={`/parametres?tab=${t.tab}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 16px",
                background: km.white,
                color: km.ink,
                border: `1px solid ${km.line}`,
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 500,
                fontFamily: "inherit",
                whiteSpace: "nowrap",
                flexShrink: 0,
                textDecoration: "none",
                transition: "all 0.15s",
              }}
            >
              {t.icon}
              {t.label}
            </Link>
          ))}
        </nav>

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

        {/* Locataire : Score de complétion — inline uniquement si viewport étroit
            (< 1280px). Sur desktop large, la card va dans l'aside sticky droit. */}
        {!proprietaireActive && !wideAside && (
          <CompletionCard
            scoreCompletion={scoreCompletion}
            scoreColor={scoreColor}
            manquants={manquants}
          />
        )}

        {/* Lien discret « Reprendre la configuration guidée » pour les profils 20–80 %
            (le CTA plein bouton est déjà affiché dans le score card si <= 20). */}
        {!proprietaireActive && scoreCompletion > 20 && scoreCompletion < 100 && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <a href="/profil/creer" style={{ fontSize: 11, fontWeight: 700, color: km.ink, textDecoration: "underline", textUnderlineOffset: 4, textTransform: "uppercase", letterSpacing: "1.2px" }}>
              Reprendre la configuration guidée →
            </a>
          </div>
        )}

        {!proprietaireActive && <>

        {/* Sommaire sticky (desktop) + layout 2 colonnes — R10.3a.
            Sur mobile, le TOC se replie en une barre horizontale scrollable
            placée juste avant les sections. */}
        <ProfilTOC active={activeSection} isMobile={isMobile} />

        <Sec
          id="criteres"
          t="Mes critères de recherche"
          footer={<SectionSaveBtn sectionId="criteres" saving={savingSection === "criteres"} onSave={() => saveSection("criteres")} />}
        >
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            <F l={<>Ville souhaitée <Tooltip text="Choisissez une ville dans la liste. Elle sera utilisée pour centrer la carte et matcher les annonces. Tapez pour filtrer les suggestions." /></>}>
              <CityAutocomplete value={form.ville_souhaitee} onChange={v => setForm(f => ({ ...f, ville_souhaitee: v }))} placeholder="Commencez à taper..." />
            </F>
            <F l={<>Mode de localisation <Tooltip text="Strict : seules les annonces dans votre ville exacte s'affichent. Souple : les villes voisines sont aussi visibles, avec un score ajusté." /></>}>
              <select style={sel} value={form.mode_localisation} onChange={set("mode_localisation")}>
                <option value="souple">Souple — autres villes visibles</option>
                <option value="strict">Strict — uniquement ma ville</option>
              </select>
            </F>
            <F l="Type de quartier">
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
            </F>
            <F l="Budget min (€/mois)"><input style={inp} type="number" value={form.budget_min} onChange={set("budget_min")} placeholder="600" /></F>
            <F l="Budget max (€/mois)"><input style={inp} type="number" value={form.budget_max} onChange={set("budget_max")} placeholder="1200" /></F>
            <F l="Surface min (m²)"><input style={inp} type="number" value={form.surface_min} onChange={set("surface_min")} placeholder="30" /></F>
            <F l="Surface max (m²)"><input style={inp} type="number" value={form.surface_max} onChange={set("surface_max")} placeholder="80" /></F>
            <F l="Pièces minimum">
              <select style={sel} value={form.pieces_min} onChange={set("pieces_min")}>{["1","2","3","4","5+"].map(v=><option key={v}>{v}</option>)}</select>
            </F>
            <F l="Chambres minimum">
              <select style={sel} value={form.chambres_min} onChange={set("chambres_min")}>{["0","1","2","3","4+"].map(v=><option key={v}>{v}</option>)}</select>
            </F>
            <F l={<>DPE minimum accepté <Tooltip text="Le Diagnostic de Performance Énergétique classe un logement de A (très économe) à G (très énergivore). Choisir D signifie que vous refusez les classes E, F, G (logements considérés passoires thermiques)." /></>}>
              <select style={sel} value={form.dpe_min} onChange={set("dpe_min")}>{["A","B","C","D","E","F","G"].map(v=><option key={v}>{v}</option>)}</select>
            </F>
            <F l={<>Type de bail <Tooltip text="Longue durée : bail classique 3 ans (ou 1 an meublé). Courte durée : bail saisonnier. Bail mobilité : 1 à 10 mois pour étudiants/salariés en mission. Colocation : bail partagé entre plusieurs locataires." /></>}>
              <select style={sel} value={form.type_bail} onChange={set("type_bail")}>{["longue durée","courte durée","bail mobilité","colocation"].map(v=><option key={v}>{v}</option>)}</select>
            </F>
          </div>
          <Toggle label="Rez-de-chaussée accepté" k="rez_de_chaussee_ok" toggles={toggles} setToggles={setToggles} />
          <Toggle
            label={`Filtrer strictement sur le DPE ${form.dpe_min}`}
            k="dpe_min_actif"
            toggles={toggles}
            setToggles={setToggles}
          />

          {/* V2.6 — Tolerance budget slider 0..50% */}
          <div style={{ marginTop: 18, padding: "16px 18px", background: km.beige, border: `1px solid ${km.line}`, borderRadius: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: km.ink }}>
                Tolérance budget
                <Tooltip text="Pourcentage au-delà du budget max où une annonce reste visible. À 20%, une annonce à 1200 € passe le filtre si votre budget est 1000. À 0%, plus aucun dépassement n'est toléré." />
              </label>
              <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 18, color: km.ink }}>
                {form.tolerance_budget_pct || "20"}%
              </span>
            </div>
            <input
              type="range" min={0} max={50} step={5}
              value={form.tolerance_budget_pct || "20"}
              onChange={set("tolerance_budget_pct")}
              style={{ width: "100%", accentColor: km.ink }}
              aria-label="Tolerance budget en pourcentage"
            />
            <p style={{ fontSize: 11, color: km.muted, marginTop: 6, lineHeight: 1.5 }}>
              {form.budget_max
                ? `Annonces visibles jusqu'à ${Math.round(parseInt(form.budget_max) * (1 + parseInt(form.tolerance_budget_pct || "20") / 100))} €/mois.`
                : "Définissez un budget max pour voir l'effet."}
            </p>
          </div>

          {/* V2.6 — Rayon de recherche en km */}
          <div style={{ marginTop: 14, padding: "16px 18px", background: km.beige, border: `1px solid ${km.line}`, borderRadius: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 12, flexWrap: "wrap" }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: km.ink }}>
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
                <span style={{ fontSize: 13, color: km.muted }}>km</span>
              </div>
            </div>
            <p style={{ fontSize: 11, color: km.muted, marginTop: 4, lineHeight: 1.5 }}>
              Bonus de pertinence pour les annonces proches de la ville souhaitée.
              {form.ville_souhaitee && form.rayon_recherche_km && ` Ex. : annonces jusqu'à ${form.rayon_recherche_km} km de ${form.ville_souhaitee}.`}
            </p>
          </div>
        </Sec>

        <Sec
          id="equipements"
          t="Équipements souhaités"
          footer={<SectionSaveBtn sectionId="equipements" saving={savingSection === "equipements"} onSave={() => saveSection("equipements")} />}
        >
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#111", display: "block", marginBottom: 8 }}>
              Meublé <span style={{ fontWeight: 400, color: "#6b7280" }}>— ta préférence</span>
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { v: "peu_importe", l: "Peu importe" },
                { v: "oui", l: "Meublé" },
                { v: "non", l: "Non meublé" },
              ].map(opt => {
                const active = form.meuble_pref === opt.v
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, meuble_pref: opt.v }))}
                    style={{
                      padding: "9px 16px",
                      borderRadius: 999,
                      border: `1.5px solid ${active ? "#111" : "#e5e7eb"}`,
                      background: active ? "#111" : "white",
                      color: active ? "white" : "#111",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {opt.l}
                  </button>
                )
              })}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 12 }}>
            <Toggle label="Animaux acceptés" k="animaux" toggles={toggles} setToggles={setToggles} />
          </div>

          {/* V2.6 — picker tri-state par equipement (indispensable / souhaité / indifférent / refusé) */}
          <p style={{ fontSize: 11, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: "16px 0 10px" }}>
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
        </Sec>

        <Sec
          id="proximites"
          t="Proximités souhaitées"
          footer={<SectionSaveBtn sectionId="proximites" saving={savingSection === "proximites"} onSave={() => saveSection("proximites")} />}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            <Toggle label="Proche métro/bus" k="proximite_metro" toggles={toggles} setToggles={setToggles} />
            <Toggle label="Proche écoles" k="proximite_ecole" toggles={toggles} setToggles={setToggles} />
            <Toggle label="Proche commerces" k="proximite_commerces" toggles={toggles} setToggles={setToggles} />
            <Toggle label="Proche parcs" k="proximite_parcs" toggles={toggles} setToggles={setToggles} />
          </div>
        </Sec>

        <Sec
          id="profil-locataire"
          t="Mon profil locataire"
          footer={<SectionSaveBtn sectionId="profil-locataire" saving={savingSection === "profil-locataire"} onSave={() => saveSection("profil-locataire")} />}
        >
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            <F l={<>Situation professionnelle <Tooltip text="Votre situation actuelle. Les propriétaires y sont sensibles : CDI et fonctionnaire rassurent le plus, mais un garant solide peut compenser un CDD, une situation d'indépendant ou d'étudiant." /></>}>
              <select style={sel} value={form.situation_pro} onChange={set("situation_pro")}>{["CDI","CDD","indépendant","étudiant","retraité","fonctionnaire","autre"].map(v=><option key={v}>{v}</option>)}</select>
            </F>
            <F l="Revenus mensuels nets (€)"><input style={inp} type="number" value={form.revenus_mensuels} onChange={set("revenus_mensuels")} placeholder="2500" /></F>
            <F l="Profil">
              <select style={sel} value={form.profil_locataire} onChange={set("profil_locataire")}>{["étudiant","jeune actif","couple","famille","senior","colocation"].map(v=><option key={v}>{v}</option>)}</select>
            </F>
            <F l="Nombre d'occupants">
              <select style={sel} value={form.nb_occupants} onChange={set("nb_occupants")}>{["1","2","3","4","5+"].map(v=><option key={v}>{v}</option>)}</select>
            </F>
            <F l={<>Type de garant <Tooltip text="Personnel : un proche (parent, etc.) se porte caution. Visale : garantie gratuite d'Action Logement, très acceptée par les propriétaires. Caution bancaire : somme bloquée en banque. Avoir un garant multiplie vos chances d'obtenir un logement." /></>}>
              <select style={sel} value={form.type_garant} onChange={set("type_garant")}>{["","personnel","organisme (Visale)","caution bancaire","aucun"].map(v=><option key={v} value={v}>{v||"Non renseigné"}</option>)}</select>
            </F>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 8 }}>
            <Toggle label="Fumeur" k="fumeur" toggles={toggles} setToggles={setToggles} />
          </div>
          <p style={{ fontSize: 12, color: km.muted, marginTop: 16, lineHeight: 1.6 }}>
            Le champ <strong>Profil</strong> (notamment l'option &quot;couple&quot;) est utilisé uniquement pour améliorer la pertinence du matching et l&apos;évaluation de votre dossier. Il n&apos;est jamais partagé sans votre accord, conformément au RGPD.
          </p>
        </Sec>

        {erreur && <div style={{ background: km.errBg, color: km.errText, border: `1px solid ${km.errLine}`, padding: "12px 20px", borderRadius: 14, marginBottom: 16, fontSize: 14 }}>{erreur}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          {saved && (
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: km.successText, fontWeight: 600, fontSize: 13 }}>
                <span aria-hidden style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: km.successBg, border: `1px solid ${km.successLine}`, color: km.successText }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </span>
                Sauvegardé !
              </span>
              <a href="/annonces" style={{ background: km.ink, color: km.white, padding: "10px 22px", borderRadius: 999, textDecoration: "none", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.3px" }}>
                Voir les annonces →
              </a>
            </div>
          )}
          <button onClick={sauvegarder} disabled={saving}
            style={{ background: km.ink, color: km.white, border: "none", borderRadius: 999, padding: "12px 28px", fontWeight: 600, fontSize: 12, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1, textTransform: "uppercase", letterSpacing: "0.3px", fontFamily: "inherit" }}>
            {saving ? "Sauvegarde…" : "Sauvegarder mes préférences"}
          </button>
        </div>
        </>}

        {/* Paramètres — inline uniquement si viewport étroit. Sur desktop large,
            la card est déplacée dans l'aside sticky droit (en dessous de
            Complétion). */}
        {!wideAside && <SettingsCardInline />}
      </div>

      {/* Aside sticky droit — Complétion + Paramètres (desktop ≥ 1280px). Fixed
          position pour rester visible pendant le scroll des sections. */}
      {wideAside && (
        <aside
          aria-label="Complétion du dossier et paramètres"
          style={{
            position: "fixed",
            left: "calc(50vw + 460px)",
            top: 120,
            width: 280,
            maxHeight: "calc(100vh - 140px)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            zIndex: 5,
          }}
        >
          {!proprietaireActive && (
            <CompletionCard
              scoreCompletion={scoreCompletion}
              scoreColor={scoreColor}
              manquants={manquants}
              compact
            />
          )}
          <SettingsCardInline compact />
        </aside>
      )}

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
  // Desktop aside : visible uniquement si viewport >= 1200px pour éviter de
  // chevaucher le contenu (main maxWidth 900, margin auto).
  const [wide, setWide] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia("(min-width: 1200px)")
    const update = () => setWide(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  if (isMobile || !wide) {
    // Barre horizontale scrollable (mobile + tablette).
    return (
      <nav aria-label="Sommaire du profil" style={{
        position: "sticky", top: 72, zIndex: 10, background: km.beige,
        padding: "10px 0 12px", marginBottom: 14,
        overflowX: "auto", whiteSpace: "nowrap",
        borderBottom: `1px solid ${km.line}`,
      }}>
        <div style={{ display: "inline-flex", gap: 8, padding: "0 2px" }}>
          {SECTIONS.map(s => {
            const on = s.id === active
            return (
              <a key={s.id} href={`#${s.id}`} style={{
                padding: "7px 14px", borderRadius: 999,
                border: `1px solid ${on ? km.ink : km.line}`,
                background: on ? km.ink : km.white, color: on ? km.white : km.ink,
                textDecoration: "none", fontSize: 11, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "1.1px",
              }}>{s.label}</a>
            )
          })}
        </div>
      </nav>
    )
  }
  return (
    <aside aria-label="Sommaire du profil" style={{
      position: "fixed", left: "calc(50vw - 610px)", top: 120,
      width: 200, zIndex: 5,
      padding: "18px 0",
    }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: km.muted, textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 12px 14px" }}>Sommaire</p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        {SECTIONS.map(s => {
          const on = s.id === active
          return (
            <li key={s.id}>
              <a href={`#${s.id}`} style={{
                display: "block", padding: "10px 14px", borderRadius: 10,
                fontSize: 12.5, fontWeight: on ? 700 : 500,
                color: on ? km.ink : km.muted,
                background: on ? km.beige : "transparent",
                borderLeft: `2px solid ${on ? km.ink : "transparent"}`,
                textDecoration: "none", transition: "all 160ms",
              }}>{s.label}</a>
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
function EquipementPreferencePicker({
  label, value, onChange, isMobile,
}: {
  label: string
  value: EquipPref
  onChange: (v: EquipPref) => void
  isMobile: boolean
}) {
  const opts: Array<{ v: EquipPref; l: string; tone: string }> = [
    { v: "indispensable", l: "Indispensable", tone: "#16a34a" },
    { v: "souhaite",      l: "Souhaité",      tone: "#0ea5e9" },
    { v: "indifferent",   l: "Indifférent",   tone: "#9ca3af" },
    { v: "refuse",        l: "Refusé",        tone: "#dc2626" },
  ]
  return (
    <div style={{
      display: "flex",
      flexDirection: isMobile ? "column" : "row",
      alignItems: isMobile ? "stretch" : "center",
      justifyContent: "space-between",
      gap: isMobile ? 8 : 12,
      padding: "10px 12px",
      borderRadius: 12,
      border: `1px solid ${km.line}`,
      background: km.white,
    }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: km.ink }}>{label}</span>
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
                padding: "7px 12px",
                borderRadius: 999,
                border: `1.5px solid ${active ? opt.tone : km.line}`,
                background: active ? opt.tone : "transparent",
                color: active ? "#fff" : km.ink,
                fontSize: 11.5,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 140ms",
                whiteSpace: "nowrap",
              }}
            >
              {opt.l}
            </button>
          )
        })}
      </div>
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
  return (
    <div style={{ background: km.white, border: `1px solid ${km.line}`, borderRadius: 20, padding: 26, marginTop: 24, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
      <div>
        <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 20, letterSpacing: "-0.3px", color: km.ink, margin: "0 0 6px" }}>Paramètres du compte</h2>
        <p style={{ fontSize: 13, color: km.muted, margin: 0, lineHeight: 1.5 }}>Mot de passe, apparence (clair/sombre), notifications, suppression de compte.</p>
      </div>
      <Link href="/parametres" style={{ background: km.ink, color: km.white, borderRadius: 999, padding: "10px 22px", textDecoration: "none", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.3px" }}>
        Ouvrir les paramètres →
      </Link>
    </div>
  )
}

function UndoToast({ label, onUndo, onDismiss }: { label: string; onUndo: () => void; onDismiss: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 8000,
        background: km.ink,
        color: km.white,
        borderRadius: 999,
        padding: "12px 18px 12px 22px",
        boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
        display: "flex",
        alignItems: "center",
        gap: 14,
        fontSize: 13,
        fontWeight: 500,
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: "rgba(255,255,255,0.18)" }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </span>
        {label}
      </span>
      <button
        type="button"
        onClick={onUndo}
        style={{
          background: "transparent",
          color: km.white,
          border: `1px solid rgba(255,255,255,0.35)`,
          borderRadius: 999,
          padding: "6px 14px",
          fontFamily: "inherit",
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "1px",
          cursor: "pointer",
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
          fontSize: 18,
          cursor: "pointer",
          padding: 0,
          lineHeight: 1,
          fontFamily: "inherit",
        }}
      >×</button>
    </div>
  )
}