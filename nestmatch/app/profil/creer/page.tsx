"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState, ReactNode } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import { useResponsive } from "../../hooks/useResponsive"
import CityAutocomplete from "../../components/CityAutocomplete"
import Tooltip from "../../components/Tooltip"
import { Toggle, F } from "../../components/FormHelpers"
import { KMButton, KMButtonOutline, KMEyebrow, KMHeading } from "../../components/ui/km"
import { StepBar } from "../../components/ui/StepBar"

/**
 * Wizard step-by-step de création du profil locataire — inspiré du principe
 * « claude design » utilisé pour la création d'un bien : on guide l'utilisateur
 * section par section, progress bar en haut, une zone de focus par étape.
 *
 * Étapes (5) :
 *  1. Localisation   — ville, mode, type de quartier
 *  2. Logement       — budget, surface, pièces, chambres, DPE, bail
 *  3. Équipements    — 9 toggles + 4 proximités
 *  4. Profil pro     — situation, revenus, garant, occupants, profil, fumeur
 *  5. Récap          — review + sauvegarde
 *
 * Après sauvegarde → redirige vers /profil (vue éditable sectionnée).
 */

type FormState = {
  ville_souhaitee: string
  mode_localisation: string
  type_quartier: string
  budget_min: string
  budget_max: string
  surface_min: string
  surface_max: string
  pieces_min: string
  chambres_min: string
  dpe_min: string
  type_bail: string
  situation_pro: string
  revenus_mensuels: string
  type_garant: string
  nb_occupants: string
  profil_locataire: string
}

type TogglesState = {
  animaux: boolean
  meuble: boolean
  parking: boolean
  cave: boolean
  fibre: boolean
  balcon: boolean
  terrasse: boolean
  jardin: boolean
  ascenseur: boolean
  rez_de_chaussee_ok: boolean
  fumeur: boolean
  proximite_metro: boolean
  proximite_ecole: boolean
  proximite_commerces: boolean
  proximite_parcs: boolean
}

const STEPS = [
  { n: 1, label: "Localisation", eyebrow: "Étape 1 sur 5", title: "Où cherchez-vous ?", sub: "La ville et le type de quartier qui vous correspondent." },
  { n: 2, label: "Logement", eyebrow: "Étape 2 sur 5", title: "Quel logement vous faut-il ?", sub: "Budget, surface, pièces, DPE. On reste ouvert aux ajustements." },
  { n: 3, label: "Équipements", eyebrow: "Étape 3 sur 5", title: "Ce qui vous fait du bien", sub: "Cochez les équipements et proximités qui comptent pour vous." },
  { n: 4, label: "Profil", eyebrow: "Étape 4 sur 5", title: "Votre profil locataire", sub: "Les infos que les propriétaires regardent pour valider votre dossier." },
  { n: 5, label: "Récap", eyebrow: "Étape 5 sur 5", title: "Un dernier coup d’œil", sub: "Relisez avant de sauvegarder. Vous pourrez tout modifier ensuite." },
] as const

/** Styles inline partagés — repris du handoff KeyMatch. */
const inp: React.CSSProperties = { width: "100%", padding: "12px 14px", border: "1px solid #EAE6DF", borderRadius: 12, fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit", background: "#fff", color: "#111" }
const sel: React.CSSProperties = { ...inp, background: "white", appearance: "none", backgroundImage: "url('data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'12\\' height=\\'8\\' viewBox=\\'0 0 12 8\\' fill=\\'none\\'><path d=\\'M1 1l5 5 5-5\\' stroke=\\'%23111\\' stroke-width=\\'1.5\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'/></svg>')", backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center", paddingRight: 36 }

// Les primitives KMButton/KMButtonOutline/KMEyebrow/KMHeading et StepBar
// viennent désormais de components/ui/* — source de vérité partagée.

/** Grille de 2 colonnes responsive — reprend le pattern des autres formulaires. */
function Grid2({ children, isMobile }: { children: ReactNode; isMobile: boolean }) {
  return <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>{children}</div>
}

const WIZARD_STEP_KEY_PREFIX = "keymatch:profilWizardStep:"
function stepStorageKey(email: string) {
  return WIZARD_STEP_KEY_PREFIX + email.toLowerCase()
}

export default function CreerProfil() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { isMobile } = useResponsive()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [erreur, setErreur] = useState("")
  const [dataLoaded, setDataLoaded] = useState(false)

  const [form, setForm] = useState<FormState>({
    ville_souhaitee: "", mode_localisation: "souple", type_quartier: "",
    budget_min: "", budget_max: "",
    surface_min: "", surface_max: "",
    pieces_min: "1", chambres_min: "0",
    dpe_min: "D", type_bail: "longue durée",
    situation_pro: "CDI", revenus_mensuels: "", type_garant: "",
    nb_occupants: "1", profil_locataire: "jeune actif",
  })

  const [toggles, setToggles] = useState<TogglesState>({
    animaux: false, meuble: false, parking: false, cave: false,
    fibre: false, balcon: false, terrasse: false, jardin: false,
    ascenseur: false, rez_de_chaussee_ok: true,
    fumeur: false, proximite_metro: false, proximite_ecole: false,
    proximite_commerces: false, proximite_parcs: false,
  })

  // Redirect si pas connecté, sinon hydrate avec les données existantes
  // pour que le wizard serve aussi de rattrapage si l'user l'ouvre re-ouvre.
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth")
      return
    }
    if (!session?.user?.email) return
    supabase.from("profils").select("*").eq("email", session.user.email).single()
      .then(({ data }) => {
        if (data) {
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
          })
          setToggles({
            animaux: !!data.animaux, meuble: !!data.meuble,
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
          })
        }
        // Restaurer l'étape si l'user revient en cours de parcours.
        try {
          const rawStep = localStorage.getItem(stepStorageKey(session.user!.email!))
          const parsed = rawStep ? parseInt(rawStep, 10) : 1
          if (parsed >= 1 && parsed <= STEPS.length) setStep(parsed)
        } catch { /* noop */ }
        setDataLoaded(true)
      })
  }, [session, status, router])

  // Persiste l'étape courante pour permettre la reprise après rechargement.
  useEffect(() => {
    if (!session?.user?.email || !dataLoaded) return
    try {
      localStorage.setItem(stepStorageKey(session.user.email), step.toString())
    } catch { /* quota — silencieux */ }
  }, [step, session?.user?.email, dataLoaded])

  const set = (key: keyof FormState) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [key]: e.target.value }))

  // Validation minimale par étape : on n'empêche pas la progression (brouillon),
  // mais on grise le CTA si la ville est vide à l'étape 1 (indispensable pour matcher).
  const canNext = (() => {
    if (step === 1) return !!form.ville_souhaitee.trim()
    return true
  })()

  async function sauvegarder() {
    setSaving(true)
    setErreur("")
    const toInt = (v: string) => v ? parseInt(v) : null
    const data: Record<string, unknown> = {
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
      ...toggles,
    }
    const { error } = await supabase.from("profils").upsert(data, { onConflict: "email" })
    if (error) {
      const { error: insertErr } = await supabase.from("profils").insert(data)
      if (insertErr) {
        const { email: _email, ...updateData } = data
        void _email
        const { error: updateErr } = await supabase.from("profils").update(updateData).eq("email", session?.user?.email!)
        if (updateErr) {
          setErreur("Erreur: " + updateErr.message)
          setSaving(false)
          return
        }
      }
    }
    setSaving(false)
    try {
      if (session?.user?.email) localStorage.removeItem(stepStorageKey(session.user.email))
    } catch { /* noop */ }
    router.push("/profil?created=1")
  }

  if (status === "loading" || !dataLoaded) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'DM Sans', sans-serif", color: "#8a8477" }}>Chargement…</div>
  )
  if (!session) return null

  const current = STEPS.find(s => s.n === step)!

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500&display=swap');`}</style>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: isMobile ? "20px 16px 40px" : "40px 48px 60px" }}>

        <a href="/profil" style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textDecoration: "none", textTransform: "uppercase", letterSpacing: "1.2px", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="15 18 9 12 15 6"/></svg>
          Retour au profil
        </a>

        <StepBar
          steps={STEPS.map(s => ({ n: s.n, label: s.label }))}
          current={step}
          isMobile={isMobile}
          onStepClick={(n) => setStep(n)}
        />

        <KMEyebrow style={{ marginBottom: 10 }}>{current.eyebrow}</KMEyebrow>
        <KMHeading size={isMobile ? 26 : 34} style={{ marginBottom: 8 }}>{current.title}</KMHeading>
        <p style={{ fontSize: 14, color: "#8a8477", margin: "0 0 28px", lineHeight: 1.6 }}>{current.sub}</p>

        {/* Carte principale de l'étape */}
        <div style={{ background: "white", border: "1px solid #EAE6DF", borderRadius: 20, padding: isMobile ? "22px 18px" : "32px", marginBottom: 20, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
          {step === 1 && (
            <Grid2 isMobile={isMobile}>
              <F l={<>Ville souhaitée <Tooltip text="Choisissez la ville où vous cherchez. Elle centre la carte et alimente le matching des annonces." /></>}>
                <CityAutocomplete value={form.ville_souhaitee} onChange={v => setForm(f => ({ ...f, ville_souhaitee: v }))} placeholder="Commencez à taper..." />
              </F>
              <F l={<>Mode de localisation <Tooltip text="Strict : uniquement votre ville. Souple : villes voisines visibles, score ajusté." /></>}>
                <select style={sel} value={form.mode_localisation} onChange={set("mode_localisation")}>
                  <option value="souple">Souple — voisines visibles</option>
                  <option value="strict">Strict — ma ville uniquement</option>
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
            </Grid2>
          )}

          {step === 2 && (
            <>
              <Grid2 isMobile={isMobile}>
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
                <F l={<>DPE minimum accepté <Tooltip text="Le DPE classe un logement de A (économe) à G (énergivore). D exclut les passoires thermiques E, F, G." /></>}>
                  <select style={sel} value={form.dpe_min} onChange={set("dpe_min")}>{["A","B","C","D","E","F","G"].map(v=><option key={v}>{v}</option>)}</select>
                </F>
                <F l={<>Type de bail <Tooltip text="Longue durée : 3 ans (1 an meublé). Courte : saisonnier. Mobilité : 1–10 mois étudiants/missions. Colocation : partagé." /></>}>
                  <select style={sel} value={form.type_bail} onChange={set("type_bail")}>{["longue durée","courte durée","bail mobilité","colocation"].map(v=><option key={v}>{v}</option>)}</select>
                </F>
              </Grid2>
              <div style={{ borderTop: "1px solid #F7F4EF", paddingTop: 16, marginTop: 8 }}>
                <Toggle label="Rez-de-chaussée accepté" k="rez_de_chaussee_ok" toggles={toggles} setToggles={setToggles} />
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 14px" }}>Équipements</p>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 4, marginBottom: 24 }}>
                <Toggle label="Meublé" k="meuble" toggles={toggles} setToggles={setToggles} />
                <Toggle label="Animaux acceptés" k="animaux" toggles={toggles} setToggles={setToggles} />
                <Toggle label="Parking" k="parking" toggles={toggles} setToggles={setToggles} />
                <Toggle label="Cave" k="cave" toggles={toggles} setToggles={setToggles} />
                <Toggle label="Fibre optique" k="fibre" toggles={toggles} setToggles={setToggles} />
                <Toggle label="Balcon" k="balcon" toggles={toggles} setToggles={setToggles} />
                <Toggle label="Terrasse" k="terrasse" toggles={toggles} setToggles={setToggles} />
                <Toggle label="Jardin" k="jardin" toggles={toggles} setToggles={setToggles} />
                <Toggle label="Ascenseur" k="ascenseur" toggles={toggles} setToggles={setToggles} />
              </div>

              <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 14px" }}>Proximités</p>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 4 }}>
                <Toggle label="Proche métro/bus" k="proximite_metro" toggles={toggles} setToggles={setToggles} />
                <Toggle label="Proche écoles" k="proximite_ecole" toggles={toggles} setToggles={setToggles} />
                <Toggle label="Proche commerces" k="proximite_commerces" toggles={toggles} setToggles={setToggles} />
                <Toggle label="Proche parcs" k="proximite_parcs" toggles={toggles} setToggles={setToggles} />
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <Grid2 isMobile={isMobile}>
                <F l={<>Situation professionnelle <Tooltip text="CDI et fonctionnaire rassurent le plus, mais un garant solide peut compenser." /></>}>
                  <select style={sel} value={form.situation_pro} onChange={set("situation_pro")}>{["CDI","CDD","indépendant","étudiant","retraité","fonctionnaire","autre"].map(v=><option key={v}>{v}</option>)}</select>
                </F>
                <F l="Revenus mensuels nets (€)"><input style={inp} type="number" value={form.revenus_mensuels} onChange={set("revenus_mensuels")} placeholder="2500" /></F>
                <F l="Profil">
                  <select style={sel} value={form.profil_locataire} onChange={set("profil_locataire")}>{["étudiant","jeune actif","couple","famille","senior","colocation"].map(v=><option key={v}>{v}</option>)}</select>
                </F>
                <F l="Nombre d'occupants">
                  <select style={sel} value={form.nb_occupants} onChange={set("nb_occupants")}>{["1","2","3","4","5+"].map(v=><option key={v}>{v}</option>)}</select>
                </F>
                <F l={<>Type de garant <Tooltip text="Personnel (proche), Visale (gratuit Action Logement), caution bancaire. Un garant multiplie vos chances." /></>}>
                  <select style={sel} value={form.type_garant} onChange={set("type_garant")}>{["","personnel","organisme (Visale)","caution bancaire","aucun"].map(v=><option key={v} value={v}>{v||"Non renseigné"}</option>)}</select>
                </F>
              </Grid2>
              <div style={{ borderTop: "1px solid #F7F4EF", paddingTop: 16, marginTop: 8 }}>
                <Toggle label="Fumeur" k="fumeur" toggles={toggles} setToggles={setToggles} />
              </div>
              <p style={{ fontSize: 11, color: "#8a8477", marginTop: 14, lineHeight: 1.6 }}>
                Le champ <strong>Profil</strong> améliore la pertinence du matching. Il n’est jamais partagé sans votre accord (RGPD).
              </p>
            </>
          )}

          {step === 5 && (
            <div>
              <RecapLine label="Ville" value={form.ville_souhaitee || "—"} />
              <RecapLine label="Mode" value={form.mode_localisation} />
              <RecapLine label="Quartier" value={form.type_quartier || "Peu importe"} />
              <Separator />
              <RecapLine label="Budget" value={form.budget_min || form.budget_max ? `${form.budget_min || "?"} – ${form.budget_max || "?"} €` : "—"} />
              <RecapLine label="Surface" value={form.surface_min || form.surface_max ? `${form.surface_min || "?"} – ${form.surface_max || "?"} m²` : "—"} />
              <RecapLine label="Pièces / chambres" value={`${form.pieces_min}p · ${form.chambres_min}ch`} />
              <RecapLine label="DPE min" value={form.dpe_min} />
              <RecapLine label="Bail" value={form.type_bail} />
              <Separator />
              <RecapLine label="Équipements" value={equipementsLabel(toggles) || "Aucun"} />
              <RecapLine label="Proximités" value={proximitesLabel(toggles) || "Aucune"} />
              <Separator />
              <RecapLine label="Situation" value={form.situation_pro} />
              <RecapLine label="Revenus" value={form.revenus_mensuels ? `${form.revenus_mensuels} €/mois` : "—"} />
              <RecapLine label="Garant" value={form.type_garant || "Non renseigné"} />
              <RecapLine label="Occupants / profil" value={`${form.nb_occupants} · ${form.profil_locataire}`} />
              {toggles.fumeur && <RecapLine label="Fumeur" value="Oui" />}
              {erreur && <div style={{ background: "#FEECEC", color: "#b91c1c", border: "1px solid #F4C9C9", padding: "12px 16px", borderRadius: 14, marginTop: 16, fontSize: 13 }}>{erreur}</div>}
              <p style={{ fontSize: 12, color: "#8a8477", marginTop: 20, lineHeight: 1.6 }}>
                Vous pourrez modifier chaque section directement depuis la page <strong>Mon profil</strong>.
              </p>
            </div>
          )}
        </div>

        {/* Navigation bas : Précédent / Suivant ou Sauvegarder */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <KMButtonOutline size="lg" onClick={() => step > 1 ? setStep(step - 1) : router.push("/profil")} disabled={saving}>
            {step > 1 ? "← Précédent" : "Annuler"}
          </KMButtonOutline>

          {step < STEPS.length ? (
            <KMButton size="lg" onClick={() => setStep(step + 1)} disabled={!canNext}>
              Suivant →
            </KMButton>
          ) : (
            <KMButton size="lg" onClick={sauvegarder} disabled={saving}>
              {saving ? "Sauvegarde…" : "Terminer et sauvegarder"}
            </KMButton>
          )}
        </div>
      </div>
    </main>
  )
}

/** Ligne de récap clé/valeur — inspirée du pattern km-row du handoff. */
function RecapLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, padding: "10px 0", borderBottom: "1px dashed #EAE6DF" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 500, color: "#111", textAlign: "right" }}>{value}</span>
    </div>
  )
}

function Separator() {
  return <div style={{ height: 8 }} />
}

function equipementsLabel(t: TogglesState): string {
  const parts: string[] = []
  if (t.meuble) parts.push("meublé")
  if (t.animaux) parts.push("animaux")
  if (t.parking) parts.push("parking")
  if (t.cave) parts.push("cave")
  if (t.fibre) parts.push("fibre")
  if (t.balcon) parts.push("balcon")
  if (t.terrasse) parts.push("terrasse")
  if (t.jardin) parts.push("jardin")
  if (t.ascenseur) parts.push("ascenseur")
  return parts.join(" · ")
}

function proximitesLabel(t: TogglesState): string {
  const parts: string[] = []
  if (t.proximite_metro) parts.push("métro")
  if (t.proximite_ecole) parts.push("écoles")
  if (t.proximite_commerces) parts.push("commerces")
  if (t.proximite_parcs) parts.push("parcs")
  return parts.join(" · ")
}
