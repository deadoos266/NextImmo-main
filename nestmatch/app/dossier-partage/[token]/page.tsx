import Link from "next/link"
import { notFound } from "next/navigation"
import { verifyDossierToken } from "../../../lib/dossierToken"
import { supabase } from "../../../lib/supabase"
import { displayName } from "../../../lib/privacy"

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

        <div style={sectionStyle}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>Informations</h2>
          <div style={rowStyle}><span style={{ color: "#6b7280" }}>Situation pro</span><span style={{ fontWeight: 600 }}>{profil.situation_pro || "—"}</span></div>
          <div style={rowStyle}><span style={{ color: "#6b7280" }}>Revenus mensuels nets</span><span style={{ fontWeight: 600 }}>{profil.revenus_mensuels ? `${Number(profil.revenus_mensuels).toLocaleString("fr-FR")} €` : "—"}</span></div>
          <div style={rowStyle}><span style={{ color: "#6b7280" }}>Nombre d&apos;occupants</span><span style={{ fontWeight: 600 }}>{profil.nb_occupants || "—"}</span></div>
          <div style={rowStyle}><span style={{ color: "#6b7280" }}>Profil</span><span style={{ fontWeight: 600 }}>{profil.profil_locataire || "—"}</span></div>
          <div style={rowStyle}><span style={{ color: "#6b7280" }}>Garant</span><span style={{ fontWeight: 600 }}>{profil.garant ? (profil.type_garant || "Oui") : "Non"}</span></div>
        </div>

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
          Lien de partage sécurisé · <Link href="/" style={{ color: "#6b7280" }}>NestMatch</Link>
        </p>
      </div>
    </main>
  )
}
