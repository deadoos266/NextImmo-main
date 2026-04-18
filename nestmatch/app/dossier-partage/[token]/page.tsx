import Link from "next/link"
import { notFound } from "next/navigation"
import { verifyDossierToken } from "../../../lib/dossierToken"
import { supabase } from "../../../lib/supabase"
import { displayName } from "../../../lib/privacy"
import { BRAND } from "../../../lib/brand"
import AccessLogPing from "./AccessLogPing"

export const metadata = {
  title: "Dossier locataire partagé",
  robots: { index: false, follow: false },
}

const DOC_LABELS: Record<string, string> = {
  identite: "Pièce d'identité",
  bulletins: "Bulletins de salaire",
  avis_imposition: "Avis d'imposition",
  contrat: "Contrat de travail",
  quittances: "Quittances de loyer",
  rib: "RIB",
  identite_garant: "Pièce d'identité du garant",
  bulletins_garant: "Bulletins de salaire du garant",
  avis_garant: "Avis d'imposition du garant",
}

export default async function DossierPartage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const valid = verifyDossierToken(token)
  if (!valid) return notFound()

  const { data: profil } = await supabase.from("profils").select("*").eq("email", valid.email).single()
  if (!profil) return notFound()

  const name = displayName(valid.email, profil.nom)
  const docs = (profil.dossier_docs || {}) as Record<string, string[] | string>
  const expires = new Date(valid.exp).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })

  const sectionStyle: React.CSSProperties = {
    background: "white",
    borderRadius: 20,
    padding: "24px 28px",
    marginBottom: 14,
  }
  const rowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 0",
    fontSize: 14,
    borderBottom: "1px solid #f3f4f6",
  }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: "40px 20px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 14, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#9a3412", lineHeight: 1.5 }}>
          <strong>Dossier locataire partagé.</strong> Lien valide jusqu&apos;au {expires}. Accès en lecture seule.
        </div>

        <div style={sectionStyle}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 4 }}>{name}</h1>
          <p style={{ fontSize: 13, color: "#6b7280" }}>Dossier locataire</p>
        </div>

        <AccessLogPing token={token} />

        <div style={sectionStyle}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>Identité & situation</h2>
          <div style={rowStyle}><span style={{ color: "#6b7280" }}>Date de naissance</span><span style={{ fontWeight: 600 }}>{profil.date_naissance ? new Date(profil.date_naissance).toLocaleDateString("fr-FR") : "—"}</span></div>
          <div style={rowStyle}><span style={{ color: "#6b7280" }}>Nationalité</span><span style={{ fontWeight: 600 }}>{profil.nationalite || "—"}</span></div>
          <div style={rowStyle}><span style={{ color: "#6b7280" }}>Situation familiale</span><span style={{ fontWeight: 600 }}>{profil.situation_familiale || "—"}</span></div>
          <div style={rowStyle}><span style={{ color: "#6b7280" }}>Enfants à charge</span><span style={{ fontWeight: 600 }}>{profil.nb_enfants ?? 0}</span></div>
          <div style={rowStyle}><span style={{ color: "#6b7280" }}>Nombre d&apos;occupants prévus</span><span style={{ fontWeight: 600 }}>{profil.nb_occupants || "—"}</span></div>
          <div style={rowStyle}><span style={{ color: "#6b7280" }}>Profil</span><span style={{ fontWeight: 600 }}>{profil.profil_locataire || "—"}</span></div>
        </div>

        <div style={sectionStyle}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>Situation professionnelle</h2>
          <div style={rowStyle}><span style={{ color: "#6b7280" }}>Statut</span><span style={{ fontWeight: 600 }}>{profil.situation_pro || "—"}</span></div>
          {profil.employeur_nom && <div style={rowStyle}><span style={{ color: "#6b7280" }}>Employeur</span><span style={{ fontWeight: 600 }}>{profil.employeur_nom}</span></div>}
          {profil.date_embauche && <div style={rowStyle}><span style={{ color: "#6b7280" }}>Date d&apos;embauche</span><span style={{ fontWeight: 600 }}>{new Date(profil.date_embauche).toLocaleDateString("fr-FR")}</span></div>}
          <div style={rowStyle}><span style={{ color: "#6b7280" }}>Revenus mensuels nets</span><span style={{ fontWeight: 600 }}>{profil.revenus_mensuels ? `${Number(profil.revenus_mensuels).toLocaleString("fr-FR")} €` : "—"}</span></div>
        </div>

        <div style={sectionStyle}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>Logement actuel & garanties</h2>
          <div style={rowStyle}><span style={{ color: "#6b7280" }}>Statut</span><span style={{ fontWeight: 600 }}>{profil.logement_actuel_type || "—"}</span></div>
          {profil.logement_actuel_ville && <div style={rowStyle}><span style={{ color: "#6b7280" }}>Ville actuelle</span><span style={{ fontWeight: 600 }}>{profil.logement_actuel_ville}</span></div>}
          <div style={rowStyle}><span style={{ color: "#6b7280" }}>Garant</span><span style={{ fontWeight: 600 }}>{profil.garant ? (profil.type_garant || "Oui") : "Non"}</span></div>
          <div style={rowStyle}><span style={{ color: "#6b7280" }}>APL</span><span style={{ fontWeight: 600 }}>{profil.a_apl ? "Oui" : "Non"}</span></div>
          <div style={rowStyle}><span style={{ color: "#6b7280" }}>Mobilité pro (Visale)</span><span style={{ fontWeight: 600 }}>{profil.mobilite_pro ? "Oui" : "Non"}</span></div>
        </div>

        {profil.presentation && (
          <div style={sectionStyle}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>Présentation du candidat</h2>
            <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{profil.presentation}</p>
          </div>
        )}

        <div style={sectionStyle}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>Critères de recherche</h2>
          <div style={rowStyle}><span style={{ color: "#6b7280" }}>Ville souhaitée</span><span style={{ fontWeight: 600 }}>{profil.ville_souhaitee || "—"}</span></div>
          <div style={rowStyle}><span style={{ color: "#6b7280" }}>Budget max</span><span style={{ fontWeight: 600 }}>{profil.budget_max ? `${profil.budget_max} €/mois` : "—"}</span></div>
          <div style={rowStyle}><span style={{ color: "#6b7280" }}>Surface min</span><span style={{ fontWeight: 600 }}>{profil.surface_min ? `${profil.surface_min} m²` : "—"}</span></div>
          <div style={rowStyle}><span style={{ color: "#6b7280" }}>Pièces min</span><span style={{ fontWeight: 600 }}>{profil.pieces_min || "—"}</span></div>
        </div>

        <div style={sectionStyle}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>Documents déposés</h2>
          {Object.keys(DOC_LABELS).map(key => {
            const val = docs[key]
            const urls = Array.isArray(val) ? val : (val ? [val as string] : [])
            return (
              <div key={key} style={{ ...rowStyle, alignItems: "flex-start" }}>
                <span style={{ color: "#6b7280" }}>{DOC_LABELS[key]}</span>
                <span style={{ fontWeight: 600, textAlign: "right" }}>
                  {urls.length === 0 ? (
                    <span style={{ color: "#9ca3af" }}>Non fourni</span>
                  ) : urls.map((u, i) => (
                    <a key={i} href={u} target="_blank" rel="noopener noreferrer" style={{ display: "block", color: "#1d4ed8", textDecoration: "underline" }}>
                      Document {i + 1}
                    </a>
                  ))}
                </span>
              </div>
            )
          })}
        </div>

        <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", marginTop: 20 }}>
          Lien de partage sécurisé · <Link href="/" style={{ color: "#6b7280" }}>{BRAND.name}</Link>
        </p>
      </div>
    </main>
  )
}
