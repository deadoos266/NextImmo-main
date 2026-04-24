import Link from "next/link"
import { LegalMain, LegalSec, LegalNotice, legalStyles as S } from "../components/legal"

export const metadata = {
  title: "Mentions légales",
  description: "Identité de l'éditeur, hébergeur et contacts juridiques de la plateforme KeyMatch.",
  // Certaines informations de l'éditeur restent à finaliser avant lancement
  // commercial (SIRET, RCS, capital). Noindex tant que non renseigné.
  robots: { index: false, follow: true },
  alternates: { canonical: "/mentions-legales" },
}

export default function MentionsLegales() {
  return (
    <LegalMain
      eyebrow="Légal · Mentions"
      title="Mentions légales"
      subtitle="En vigueur au 18 avril 2026"
    >
      <LegalNotice>
        <strong style={{ fontWeight: 800 }}>Note :</strong> cette page sera finalisée au lancement commercial de la plateforme avec les
        informations définitives d&apos;immatriculation de la société éditrice. Les champs marqués en surligné
        sont à renseigner par le responsable légal.
      </LegalNotice>

      <LegalSec title="Éditeur du site">
        <p style={S.p}>
          Le site <strong style={S.strong}>keymatch-immo.fr</strong> est édité par :
        </p>
        <p style={S.p}>
          <strong style={S.strong}>Raison sociale</strong> : <span style={S.todo}>à renseigner</span><br />
          <strong style={S.strong}>Forme juridique</strong> : <span style={S.todo}>à renseigner (SAS, SARL, auto-entrepreneur, etc.)</span><br />
          <strong style={S.strong}>Capital social</strong> : <span style={S.todo}>à renseigner</span><br />
          <strong style={S.strong}>RCS</strong> : <span style={S.todo}>à renseigner</span><br />
          <strong style={S.strong}>SIRET</strong> : <span style={S.todo}>à renseigner</span><br />
          <strong style={S.strong}>Numéro de TVA intracommunautaire</strong> : <span style={S.todo}>à renseigner</span><br />
          <strong style={S.strong}>Siège social</strong> : <span style={S.todo}>adresse postale à renseigner</span><br />
          <strong style={S.strong}>Email de contact</strong> : <strong style={S.strong}>contact@keymatch-immo.fr</strong>
        </p>
      </LegalSec>

      <LegalSec title="Directeur de la publication">
        <p style={S.p}>
          <span style={S.todo}>Nom et prénom du directeur de la publication à renseigner</span>
        </p>
      </LegalSec>

      <LegalSec title="Hébergement">
        <p style={S.p}>Le site est hébergé par :</p>
        <p style={S.p}>
          <strong style={S.strong}>Vercel Inc.</strong><br />
          340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis<br />
          <a href="https://vercel.com" style={S.link}>vercel.com</a>
        </p>
        <p style={S.p}>
          La base de données et le stockage de fichiers sont fournis par :
        </p>
        <p style={S.p}>
          <strong style={S.strong}>Supabase, Inc.</strong><br />
          970 Toa Payoh North #07-04 Singapore 318992<br />
          <a href="https://supabase.com" style={S.link}>supabase.com</a>
        </p>
      </LegalSec>

      <LegalSec title="Propriété intellectuelle">
        <p style={S.p}>
          La marque <strong style={S.strong}>KeyMatch</strong>, le nom de domaine, le contenu éditorial, les textes, graphismes,
          logos, icônes, photographies, vidéos, codes sources et logiciels publiés sur la plateforme sont la
          propriété exclusive de l&apos;éditeur ou de ses partenaires, protégés par le Code de la propriété
          intellectuelle et les conventions internationales.
        </p>
        <p style={S.p}>
          Toute reproduction, représentation, modification, publication ou adaptation, totale ou partielle, de
          tout ou partie de la plateforme, par quelque procédé que ce soit et sur quelque support que ce soit, est
          interdite sans l&apos;autorisation écrite préalable de l&apos;éditeur. Toute utilisation non autorisée
          est constitutive d&apos;une contrefaçon sanctionnée par les articles L.335-2 et suivants du Code de la
          propriété intellectuelle.
        </p>
      </LegalSec>

      <LegalSec title="Responsabilité">
        <p style={S.p}>
          Les informations accessibles sur KeyMatch sont fournies à titre informatif. L&apos;éditeur met tout en
          œuvre pour en assurer l&apos;exactitude et la mise à jour mais ne peut garantir l&apos;exhaustivité ou
          l&apos;absence d&apos;erreurs. L&apos;éditeur ne peut être tenu responsable des dommages directs ou
          indirects résultant de l&apos;accès ou de l&apos;utilisation de la plateforme.
        </p>
        <p style={S.p}>
          Conformément à l&apos;article 6 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans
          l&apos;économie numérique (LCEN), l&apos;éditeur agit en qualité d&apos;hébergeur pour les contenus
          publiés par les Utilisateurs et n&apos;est soumis à aucune obligation générale de surveillance. Il
          s&apos;engage toutefois à retirer promptement tout contenu manifestement illicite qui lui serait
          signalé.
        </p>
      </LegalSec>

      <LegalSec title="Signalement d'un contenu illicite">
        <p style={S.p}>
          Conformément à la loi pour la confiance dans l&apos;économie numérique (LCEN), vous pouvez signaler tout
          contenu que vous estimeriez illicite :
        </p>
        <ul style={S.ul}>
          <li style={S.li}>directement depuis la plateforme via le bouton « Signaler » présent sur chaque annonce ou message ;</li>
          <li style={S.li}>par email à <strong style={S.strong}>contact@keymatch-immo.fr</strong>.</li>
        </ul>
        <p style={S.p}>
          Pour être pris en compte, le signalement doit comporter : la date, votre identité, la description du
          contenu litigieux, son URL, et les motifs pour lesquels il serait illicite.
        </p>
      </LegalSec>

      <LegalSec title="Liens connexes">
        <p style={S.p}>
          <Link href="/cgu" style={S.link}>Conditions Générales d&apos;Utilisation</Link><br />
          <Link href="/confidentialite" style={S.link}>Politique de confidentialité</Link><br />
          <Link href="/cookies" style={S.link}>Politique cookies</Link><br />
          <Link href="/contact" style={S.link}>Nous contacter</Link>
        </p>
      </LegalSec>
    </LegalMain>
  )
}
