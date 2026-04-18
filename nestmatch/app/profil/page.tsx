"use client"
import { useSession, signOut } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import { useResponsive } from "../hooks/useResponsive"
import { useRole } from "../providers"
import Link from "next/link"
import CityAutocomplete from "../components/CityAutocomplete"
import Tooltip from "../components/Tooltip"

// Composants HORS du composant principal pour éviter le bug de focus
import { Toggle, Sec, F } from "../components/FormHelpers"
import { calculerCompletudeProfil } from "../../lib/profilCompleteness"

export default function Profil() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { isMobile } = useResponsive()
  const { proprietaireActive } = useRole()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [erreur, setErreur] = useState("")
  const [dataLoaded, setDataLoaded] = useState(false)
  const [photoCustom, setPhotoCustom] = useState<string | null>(null)
  const [form, setForm] = useState({
    ville_souhaitee: "", mode_localisation: "souple", type_quartier: "", budget_min: "", budget_max: "",
    surface_min: "", surface_max: "", pieces_min: "1", chambres_min: "0",
    dpe_min: "D", type_bail: "longue durée",
    situation_pro: "CDI", revenus_mensuels: "", type_garant: "",
    nb_occupants: "1", profil_locataire: "jeune actif",
  })
  const [toggles, setToggles] = useState({
    animaux: false, meuble: false, parking: false, cave: false,
    fibre: false, balcon: false, terrasse: false, jardin: false,
    ascenseur: false, rez_de_chaussee_ok: true,
    fumeur: false, proximite_metro: false, proximite_ecole: false,
    proximite_commerces: false, proximite_parcs: false,
  })

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
          setDataLoaded(true)
        })
    }
  }, [session, status, router])

  const set = (key: string) => (e: any) => setForm(f => ({ ...f, [key]: e.target.value }))

  // Source unique de vérité : lib/profilCompleteness (aussi utilisé sur /annonces)
  const { score: scoreCompletion, manquants: manquantsLabels } = calculerCompletudeProfil(form)
  const scoreColor = scoreCompletion >= 80 ? "#16a34a" : scoreCompletion >= 50 ? "#f59e0b" : "#ef4444"
  const manquants = manquantsLabels.map(label => ({ label }))

  async function sauvegarder() {
    setSaving(true)
    setErreur("")
    const toInt = (v: string) => v ? parseInt(v) : null
    const data: any = {
      email: session?.user?.email,
      nom: session?.user?.name,
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
        const { email, nom, ...updateData } = data
        const { error: updateErr } = await supabase.from("profils").update(updateData).eq("email", session?.user?.email!)
        if (updateErr) { setErreur("Erreur: " + updateErr.message); setSaving(false); return }
      }
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (status === "loading" || !dataLoaded) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#6b7280" }}>Chargement...</div>
  )
  if (!session) return null

  const inp: any = { width: "100%", padding: "11px 14px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 16, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }
  const sel: any = { ...inp, background: "white" }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: isMobile ? "24px 16px" : "48px" }}>

        <div style={{ background: "white", borderRadius: 24, padding: isMobile ? "20px 18px" : 32, marginBottom: 20, display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 16 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 14 : 24 }}>
            {(photoCustom || session.user?.image)
              ? <img src={photoCustom || session.user?.image || ""} alt="p" referrerPolicy="no-referrer" style={{ width: isMobile ? 52 : 72, height: isMobile ? 52 : 72, borderRadius: "50%", objectFit: "cover" }} />
              : <div style={{ width: isMobile ? 52 : 72, height: isMobile ? 52 : 72, borderRadius: "50%", background: "#111", display: "flex", alignItems: "center", justifyContent: "center", fontSize: isMobile ? 20 : 28, color: "white", fontWeight: 800 }}>{session.user?.name?.[0]}</div>
            }
            <div>
              <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 800, letterSpacing: "-0.5px" }}>{session.user?.name}</h1>
              <p style={{ color: "#6b7280", marginTop: 2, fontSize: isMobile ? 13 : 14 }}>{session.user?.email}</p>
              <span style={{ background: "#dcfce7", color: "#16a34a", padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, marginTop: 8, display: "inline-block" }}>✓ Compte vérifié</span>
            </div>
          </div>
          <a href={proprietaireActive ? "/proprietaire" : "/annonces"} style={{ background: "#111", color: "white", padding: "12px 24px", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 14, textAlign: "center" }}>
            {proprietaireActive ? "Mes biens →" : "Voir les annonces →"}
          </a>
        </div>

        {/* Proprio : message d'accueil simple */}
        {proprietaireActive && (
          <div style={{ background: "white", borderRadius: 20, padding: 24, marginBottom: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Espace proprietaire</h2>
            <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, marginBottom: 16 }}>
              En tant que proprietaire, votre profil contient vos informations personnelles. Les criteres de recherche et le dossier locataire ne vous concernent pas.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a href="/proprietaire" style={{ padding: "10px 20px", background: "#111", color: "white", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 13 }}>
                Dashboard proprietaire
              </a>
              <a href="/proprietaire/ajouter" style={{ padding: "10px 20px", background: "#f3f4f6", color: "#111", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 13 }}>
                Publier un bien
              </a>
            </div>
          </div>
        )}

        {/* Locataire : Score de complétion */}
        {!proprietaireActive && (
          <div style={{ background: "white", borderRadius: 20, padding: 24, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 800 }}>Completion du dossier</h2>
                <p style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
                  {scoreCompletion === 100 ? "Dossier complet — vous maximisez vos chances !" : `Remplissez les champs manquants pour booster votre profil`}
                </p>
              </div>
              <span style={{ fontSize: 32, fontWeight: 800, color: scoreColor }}>{scoreCompletion}%</span>
            </div>

            {/* Barre de progression */}
            <div style={{ background: "#f3f4f6", borderRadius: 999, height: 10, marginBottom: 16 }}>
              <div style={{ background: scoreColor, borderRadius: 999, height: 10, width: `${scoreCompletion}%`, transition: "width 0.4s ease" }} />
            </div>

            {/* Champs manquants */}
            {manquants.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {manquants.map(c => (
                  <span key={c.label} style={{ background: "#fff7ed", color: "#ea580c", padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
                    + {c.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {!proprietaireActive && <>
        <Sec t="Mes critères de recherche">
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
        </Sec>

        <Sec t="Équipements souhaités">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
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
        </Sec>

        <Sec t="Proximités souhaitées">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            <Toggle label="Proche métro/bus" k="proximite_metro" toggles={toggles} setToggles={setToggles} />
            <Toggle label="Proche écoles" k="proximite_ecole" toggles={toggles} setToggles={setToggles} />
            <Toggle label="Proche commerces" k="proximite_commerces" toggles={toggles} setToggles={setToggles} />
            <Toggle label="Proche parcs" k="proximite_parcs" toggles={toggles} setToggles={setToggles} />
          </div>
        </Sec>

        <Sec t="Mon profil locataire">
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
          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 16, lineHeight: 1.6 }}>
            Le champ <strong>Profil</strong> (notamment l'option &quot;couple&quot;) est utilisé uniquement pour améliorer la pertinence du matching et l&apos;évaluation de votre dossier. Il n&apos;est jamais partagé sans votre accord, conformément au RGPD.
          </p>
        </Sec>

        {erreur && <div style={{ background: "#fee2e2", color: "#dc2626", padding: "12px 20px", borderRadius: 12, marginBottom: 16, fontSize: 14 }}>{erreur}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 16 }}>
          {saved && (
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ color: "#16a34a", fontWeight: 600, fontSize: 14 }}>✓ Sauvegardé !</span>
              <a href="/annonces" style={{ background: "#16a34a", color: "white", padding: "10px 20px", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 14 }}>
                Voir les annonces →
              </a>
            </div>
          )}
          <button onClick={sauvegarder} disabled={saving}
            style={{ background: "#111", color: "white", border: "none", borderRadius: 999, padding: "14px 36px", fontWeight: 700, fontSize: 15, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Sauvegarde..." : "Sauvegarder mes préférences"}
          </button>
        </div>
        </>}

        <div style={{ background: "white", borderRadius: 20, padding: 24, marginTop: 24, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 4px" }}>Paramètres du compte</h2>
            <p style={{ fontSize: 13, color: "#6b7280", margin: 0, lineHeight: 1.5 }}>Mot de passe, apparence (clair/sombre), notifications, suppression de compte.</p>
          </div>
          <Link href="/parametres" style={{ background: "#111", color: "white", borderRadius: 999, padding: "10px 22px", textDecoration: "none", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>
            Ouvrir les paramètres →
          </Link>
        </div>
      </div>
    </main>
  )
}