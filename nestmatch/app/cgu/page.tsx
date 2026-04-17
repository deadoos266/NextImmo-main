import Link from "next/link"

export const metadata = {
  title: "Conditions Générales d'Utilisation",
  description: "Conditions Générales d'Utilisation de la plateforme NestMatch.",
}

const sectionStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 20,
  padding: "28px 32px",
  marginBottom: 16,
}

const h2: React.CSSProperties = { fontSize: 18, fontWeight: 800, marginBottom: 10, letterSpacing: "-0.3px" }
const p: React.CSSProperties = { fontSize: 14, color: "#4b5563", lineHeight: 1.7, marginBottom: 10 }

export default function CGU() {
  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: "40px 20px" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <Link href="/" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>← Retour à l&apos;accueil</Link>

        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.5px", margin: "16px 0 4px" }}>
          Conditions Générales d&apos;Utilisation
        </h1>
        <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 28 }}>
          Dernière mise à jour : [à compléter]
        </p>

        <section style={sectionStyle}>
          <h2 style={h2}>1. Objet</h2>
          <p style={p}>
            Les présentes Conditions Générales d&apos;Utilisation (ci-après « CGU ») régissent l&apos;utilisation de la plateforme NestMatch, accessible à l&apos;adresse [URL], éditée par [raison sociale de l&apos;éditeur]. Elles définissent les droits et obligations de l&apos;éditeur et des utilisateurs dans le cadre de la fourniture du service de mise en relation entre locataires et propriétaires.
          </p>
          <p style={p}>
            L&apos;utilisation de la plateforme implique l&apos;acceptation pleine et entière des présentes CGU.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>2. Définitions</h2>
          <p style={p}>
            <strong>Plateforme :</strong> le site web NestMatch et les services associés.<br />
            <strong>Utilisateur :</strong> toute personne physique inscrite sur la plateforme.<br />
            <strong>Locataire :</strong> utilisateur cherchant un logement à louer.<br />
            <strong>Propriétaire :</strong> utilisateur proposant un bien à la location.<br />
            <strong>Compte :</strong> espace personnel créé par l&apos;utilisateur après inscription.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>3. Inscription et compte utilisateur</h2>
          <p style={p}>
            L&apos;inscription est gratuite et ouverte à toute personne majeure. L&apos;utilisateur s&apos;engage à fournir des informations exactes et à les maintenir à jour. Il est seul responsable de la confidentialité de ses identifiants.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>4. Description du service</h2>
          <p style={p}>
            NestMatch met en relation des locataires et des propriétaires. La plateforme facilite la publication d&apos;annonces, la mise en relation via messagerie, l&apos;organisation de visites et la génération de documents (bail, état des lieux, quittances). NestMatch n&apos;est pas partie aux contrats conclus entre locataires et propriétaires.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>5. Obligations des utilisateurs</h2>
          <p style={p}>
            Les utilisateurs s&apos;engagent à utiliser la plateforme de bonne foi, à ne pas publier de contenu illicite, trompeur, diffamatoire ou portant atteinte aux droits de tiers. Les propriétaires s&apos;engagent à ne publier que des biens dont ils disposent légalement. Les locataires s&apos;engagent à fournir des informations exactes dans leur dossier.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>6. Responsabilité</h2>
          <p style={p}>
            NestMatch met en œuvre les moyens raisonnables pour assurer la continuité du service mais ne saurait être tenue responsable des interruptions techniques, des contenus publiés par les utilisateurs ni des litiges locatifs entre utilisateurs.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>7. Propriété intellectuelle</h2>
          <p style={p}>
            L&apos;ensemble des éléments de la plateforme (textes, images, code, marque) est protégé par le droit de la propriété intellectuelle. Toute reproduction ou utilisation non autorisée est interdite.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>8. Données personnelles</h2>
          <p style={p}>
            Le traitement des données personnelles est détaillé dans notre <Link href="/confidentialite" style={{ color: "#111", fontWeight: 700 }}>Politique de confidentialité</Link>.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>9. Résiliation</h2>
          <p style={p}>
            L&apos;utilisateur peut supprimer son compte à tout moment depuis son espace personnel. NestMatch se réserve le droit de suspendre ou résilier un compte en cas de manquement aux présentes CGU.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>10. Droit applicable et litiges</h2>
          <p style={p}>
            Les présentes CGU sont soumises au droit français. Tout litige sera, à défaut de résolution amiable, soumis aux tribunaux français compétents.
          </p>
        </section>

        <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 28 }}>
          Ce document est un modèle à personnaliser par le responsable légal avant publication officielle.
        </p>
      </div>
    </main>
  )
}
