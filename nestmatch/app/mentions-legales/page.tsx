import Link from "next/link"

export const metadata = {
  title: "Mentions légales",
  description: "Mentions légales de la plateforme NestMatch.",
}

const sectionStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 20,
  padding: "28px 32px",
  marginBottom: 16,
}

const h2: React.CSSProperties = { fontSize: 18, fontWeight: 800, marginBottom: 10, letterSpacing: "-0.3px" }
const p: React.CSSProperties = { fontSize: 14, color: "#4b5563", lineHeight: 1.7, marginBottom: 10 }

export default function MentionsLegales() {
  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: "40px 20px" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <Link href="/" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>← Retour à l&apos;accueil</Link>

        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.5px", margin: "16px 0 4px" }}>
          Mentions légales
        </h1>
        <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 28 }}>
          Dernière mise à jour : [à compléter]
        </p>

        <section style={sectionStyle}>
          <h2 style={h2}>Éditeur du site</h2>
          <p style={p}>
            <strong>Raison sociale :</strong> [à compléter]<br />
            <strong>Forme juridique :</strong> [à compléter — SAS / SARL / auto-entrepreneur, etc.]<br />
            <strong>Capital social :</strong> [à compléter]<br />
            <strong>RCS :</strong> [à compléter]<br />
            <strong>SIRET :</strong> [à compléter]<br />
            <strong>Numéro de TVA :</strong> [à compléter]<br />
            <strong>Siège social :</strong> [adresse postale à compléter]<br />
            <strong>Représentant légal :</strong> [à compléter]<br />
            <strong>Contact :</strong> [email à compléter]
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>Directeur de la publication</h2>
          <p style={p}>
            [Nom et prénom du directeur de la publication]
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>Hébergement</h2>
          <p style={p}>
            <strong>Hébergeur :</strong> Vercel Inc.<br />
            <strong>Adresse :</strong> 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis<br />
            <strong>Site :</strong> <a href="https://vercel.com" style={{ color: "#111", fontWeight: 600 }}>vercel.com</a>
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>Propriété intellectuelle</h2>
          <p style={p}>
            L&apos;ensemble du contenu de la plateforme NestMatch (textes, graphismes, logos, images, code source, structure) est la propriété exclusive de l&apos;éditeur ou de ses partenaires et est protégé par les lois françaises et internationales relatives à la propriété intellectuelle. Toute reproduction, représentation, modification, publication ou adaptation, totale ou partielle, est interdite sauf autorisation écrite préalable.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>Responsabilité</h2>
          <p style={p}>
            Les informations et contenus accessibles sur NestMatch sont fournis à titre informatif. L&apos;éditeur met tout en œuvre pour assurer l&apos;exactitude et la mise à jour des informations, mais ne peut garantir l&apos;exhaustivité ou l&apos;absence d&apos;erreurs. L&apos;éditeur ne saurait être tenu responsable des dommages directs ou indirects résultant de l&apos;accès ou de l&apos;utilisation de la plateforme.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>Signalement d&apos;un contenu illicite</h2>
          <p style={p}>
            Conformément à la loi pour la confiance dans l&apos;économie numérique (LCEN), vous pouvez signaler tout contenu que vous estimeriez illicite en adressant un email à [contact@nestmatch.fr — à compléter].
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>Liens connexes</h2>
          <p style={p}>
            <Link href="/cgu" style={{ color: "#111", fontWeight: 700 }}>Conditions Générales d&apos;Utilisation</Link><br />
            <Link href="/confidentialite" style={{ color: "#111", fontWeight: 700 }}>Politique de confidentialité</Link><br />
            <Link href="/cookies" style={{ color: "#111", fontWeight: 700 }}>Politique cookies</Link>
          </p>
        </section>

        <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 28 }}>
          Ce document est un modèle à personnaliser par le responsable légal avant publication officielle.
        </p>
      </div>
    </main>
  )
}
