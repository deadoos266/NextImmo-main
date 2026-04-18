import Link from "next/link"

export const metadata = {
  title: "Mentions légales",
  description: "Identité de l'éditeur, hébergeur et contacts juridiques de la plateforme NestMatch.",
  // Certaines informations de l'éditeur restent à finaliser avant lancement
  // commercial (SIRET, RCS, capital). Noindex tant que non renseigné.
  robots: { index: false, follow: true },
  alternates: { canonical: "/mentions-legales" },
}

const sectionStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 20,
  padding: "28px 32px",
  marginBottom: 16,
}

const h2: React.CSSProperties = { fontSize: 18, fontWeight: 800, marginBottom: 10, letterSpacing: "-0.3px" }
const p: React.CSSProperties = { fontSize: 14, color: "#4b5563", lineHeight: 1.7, marginBottom: 10 }
const todo: React.CSSProperties = { color: "#92400e", fontWeight: 700, background: "#fef3c7", padding: "1px 6px", borderRadius: 4 }

export default function MentionsLegales() {
  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: "40px 20px" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <Link href="/" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>← Retour à l&apos;accueil</Link>

        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.5px", margin: "16px 0 4px" }}>
          Mentions légales
        </h1>
        <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 28 }}>
          En vigueur au 18 avril 2026
        </p>

        <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 14, padding: "14px 18px", marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: "#9a3412", margin: 0, lineHeight: 1.6 }}>
            <strong>Note :</strong> cette page sera finalisée au lancement commercial de la plateforme avec les
            informations définitives d&apos;immatriculation de la société éditrice. Les champs marqués en surligné jaune
            sont à renseigner par le responsable légal.
          </p>
        </div>

        <section style={sectionStyle}>
          <h2 style={h2}>Éditeur du site</h2>
          <p style={p}>
            Le site <strong>nestmatch.fr</strong> est édité par :
          </p>
          <p style={p}>
            <strong>Raison sociale</strong> : <span style={todo}>à renseigner</span><br />
            <strong>Forme juridique</strong> : <span style={todo}>à renseigner (SAS, SARL, auto-entrepreneur, etc.)</span><br />
            <strong>Capital social</strong> : <span style={todo}>à renseigner</span><br />
            <strong>RCS</strong> : <span style={todo}>à renseigner</span><br />
            <strong>SIRET</strong> : <span style={todo}>à renseigner</span><br />
            <strong>Numéro de TVA intracommunautaire</strong> : <span style={todo}>à renseigner</span><br />
            <strong>Siège social</strong> : <span style={todo}>adresse postale à renseigner</span><br />
            <strong>Email de contact</strong> : <strong>contact@nestmatch.fr</strong>
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>Directeur de la publication</h2>
          <p style={p}>
            <span style={todo}>Nom et prénom du directeur de la publication à renseigner</span>
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>Hébergement</h2>
          <p style={p}>
            Le site est hébergé par :
          </p>
          <p style={p}>
            <strong>Vercel Inc.</strong><br />
            340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis<br />
            <a href="https://vercel.com" style={{ color: "#111", fontWeight: 600 }}>vercel.com</a>
          </p>
          <p style={p}>
            La base de données et le stockage de fichiers sont fournis par :
          </p>
          <p style={p}>
            <strong>Supabase, Inc.</strong><br />
            970 Toa Payoh North #07-04 Singapore 318992<br />
            <a href="https://supabase.com" style={{ color: "#111", fontWeight: 600 }}>supabase.com</a>
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>Propriété intellectuelle</h2>
          <p style={p}>
            La marque <strong>NestMatch</strong>, le nom de domaine, le contenu éditorial, les textes, graphismes,
            logos, icônes, photographies, vidéos, codes sources et logiciels publiés sur la plateforme sont la
            propriété exclusive de l&apos;éditeur ou de ses partenaires, protégés par le Code de la propriété
            intellectuelle et les conventions internationales.
          </p>
          <p style={p}>
            Toute reproduction, représentation, modification, publication ou adaptation, totale ou partielle, de
            tout ou partie de la plateforme, par quelque procédé que ce soit et sur quelque support que ce soit, est
            interdite sans l&apos;autorisation écrite préalable de l&apos;éditeur. Toute utilisation non autorisée
            est constitutive d&apos;une contrefaçon sanctionnée par les articles L.335-2 et suivants du Code de la
            propriété intellectuelle.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>Responsabilité</h2>
          <p style={p}>
            Les informations accessibles sur NestMatch sont fournies à titre informatif. L&apos;éditeur met tout en
            œuvre pour en assurer l&apos;exactitude et la mise à jour mais ne peut garantir l&apos;exhaustivité ou
            l&apos;absence d&apos;erreurs. L&apos;éditeur ne peut être tenu responsable des dommages directs ou
            indirects résultant de l&apos;accès ou de l&apos;utilisation de la plateforme.
          </p>
          <p style={p}>
            Conformément à l&apos;article 6 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans
            l&apos;économie numérique (LCEN), l&apos;éditeur agit en qualité d&apos;hébergeur pour les contenus
            publiés par les Utilisateurs et n&apos;est soumis à aucune obligation générale de surveillance. Il
            s&apos;engage toutefois à retirer promptement tout contenu manifestement illicite qui lui serait
            signalé.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>Signalement d&apos;un contenu illicite</h2>
          <p style={p}>
            Conformément à la loi pour la confiance dans l&apos;économie numérique (LCEN), vous pouvez signaler tout
            contenu que vous estimeriez illicite :
          </p>
          <ul style={{ paddingLeft: 20, margin: "4px 0 10px" }}>
            <li style={{ fontSize: 14, color: "#4b5563", lineHeight: 1.8 }}>directement depuis la plateforme via le bouton « Signaler » présent sur chaque annonce ou message ;</li>
            <li style={{ fontSize: 14, color: "#4b5563", lineHeight: 1.8 }}>par email à <strong>contact@nestmatch.fr</strong>.</li>
          </ul>
          <p style={p}>
            Pour être pris en compte, le signalement doit comporter : la date, votre identité, la description du
            contenu litigieux, son URL, et les motifs pour lesquels il serait illicite.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>Liens connexes</h2>
          <p style={p}>
            <Link href="/cgu" style={{ color: "#111", fontWeight: 700 }}>Conditions Générales d&apos;Utilisation</Link><br />
            <Link href="/confidentialite" style={{ color: "#111", fontWeight: 700 }}>Politique de confidentialité</Link><br />
            <Link href="/cookies" style={{ color: "#111", fontWeight: 700 }}>Politique cookies</Link><br />
            <Link href="/contact" style={{ color: "#111", fontWeight: 700 }}>Nous contacter</Link>
          </p>
        </section>
      </div>
    </main>
  )
}
