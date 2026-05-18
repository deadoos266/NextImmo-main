import Link from "next/link"
import { LegalMain, LegalSec, LegalNotice, legalStyles as S } from "../../components/legal"

export const metadata = {
  title: "Mentions légales",
  description: "Identité de l'éditeur, hébergeur et contacts juridiques de la plateforme KeyMatch.",
  // V97.39.34 — Identité éditeur en tant que personne physique (Paul David),
  // KeyMatch n'a pas de structure juridique commerciale (service gratuit).
  // Si une société est créée plus tard, remplacer le bloc Éditeur.
  robots: { index: true, follow: true },
  alternates: { canonical: "/mentions-legales" },
}

export default function MentionsLegales() {
  return (
    <LegalMain
      eyebrow="Légal · Mentions"
      title="Mentions légales"
      subtitle="En vigueur au 18 mai 2026"
    >
      <LegalNotice>
        <strong style={{ fontWeight: 800 }}>Statut actuel :</strong> KeyMatch est un service gratuit
        proposé à titre informatif et non commercial. L&apos;éditeur agit en qualité de personne
        physique. Si une structure juridique commerciale est créée ultérieurement, ces mentions
        seront mises à jour avec les informations d&apos;immatriculation (SIRET, RCS, capital social).
      </LegalNotice>

      <LegalSec title="Éditeur du site">
        <p style={S.p}>
          Le site <strong style={S.strong}>keymatch-immo.fr</strong> est édité par :
        </p>
        <p style={S.p}>
          <strong style={S.strong}>Paul David</strong>, fondateur de KeyMatch, agissant en qualité
          de personne physique.<br />
          <strong style={S.strong}>Email de contact</strong> : <a href="mailto:contact@keymatch-immo.fr" style={S.link}>contact@keymatch-immo.fr</a><br />
          <strong style={S.strong}>Contact données personnelles</strong> : <a href="mailto:privacy@keymatch-immo.fr" style={S.link}>privacy@keymatch-immo.fr</a>
        </p>
      </LegalSec>

      <LegalSec title="Directeur de la publication">
        <p style={S.p}>
          <strong style={S.strong}>Paul David</strong>, fondateur de KeyMatch.
        </p>
      </LegalSec>

      <LegalSec title="Hébergement">
        <p style={S.p}>
          L&apos;intégralité de l&apos;infrastructure de la plateforme (serveur applicatif, base de
          données, stockage de fichiers, monitoring) est hébergée en France par :
        </p>
        <p style={S.p}>
          <strong style={S.strong}>OVHcloud SAS</strong><br />
          2 rue Kellermann, 59100 Roubaix, France<br />
          Téléphone : +33 (0)9 72 10 10 07<br />
          <a href="https://www.ovhcloud.com" target="_blank" rel="noopener noreferrer" style={S.link}>www.ovhcloud.com</a>
        </p>
        <p style={S.p}>
          <strong style={S.strong}>Localisation des serveurs</strong> : Gravelines (France,
          Hauts-de-France, Union européenne). Les données des utilisateurs ne quittent pas le
          territoire de l&apos;Union européenne, à la seule exception de l&apos;authentification
          Google OAuth (États-Unis, couverte par la décision d&apos;adéquation Data Privacy
          Framework UE-USA du 10 juillet 2023).
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
          <li style={S.li}>par email à <a href="mailto:contact@keymatch-immo.fr" style={S.link}>contact@keymatch-immo.fr</a>.</li>
        </ul>
        <p style={S.p}>
          Pour être pris en compte, le signalement doit comporter : la date, votre identité, la description du
          contenu litigieux, son URL, et les motifs pour lesquels il serait illicite.
        </p>
      </LegalSec>

      <LegalSec title="Données personnelles">
        <p style={S.p}>
          KeyMatch traite des données à caractère personnel conformément au Règlement (UE) 2016/679
          (RGPD) et à la loi Informatique et Libertés. Les détails (finalités, bases légales, durées
          de conservation, destinataires, transferts hors UE, droits des personnes) sont décrits dans
          la <Link href="/confidentialite" style={S.link}>politique de confidentialité</Link>.
        </p>
        <p style={S.p}>
          Pour toute question relative à vos données : <a href="mailto:privacy@keymatch-immo.fr" style={S.link}>privacy@keymatch-immo.fr</a>.
          Vous disposez du droit d&apos;introduire une réclamation auprès de la{" "}
          <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener noreferrer" style={S.link}>
            CNIL
          </a>.
        </p>
      </LegalSec>

      <LegalSec title="Cookies et traceurs">
        <p style={S.p}>
          La gestion des cookies et traceurs (catégories, durée de conservation, modalités de
          retrait du consentement) est décrite dans la{" "}
          <Link href="/cookies" style={S.link}>politique cookies</Link>. Vous pouvez modifier
          vos préférences à tout moment depuis l&apos;icône cookies en bas à gauche de l&apos;écran.
        </p>
      </LegalSec>

      <LegalSec title="Médiation de la consommation">
        <p style={S.p}>
          KeyMatch étant un service <strong style={S.strong}>gratuit</strong>, l&apos;obligation de
          désignation d&apos;un médiateur agréé (article L.612-1 du Code de la consommation) ne
          s&apos;applique pas en l&apos;état actuel. En cas de litige, les Utilisateurs peuvent
          contacter l&apos;éditeur à <a href="mailto:contact@keymatch-immo.fr" style={S.link}>contact@keymatch-immo.fr</a> pour
          rechercher une résolution amiable.
        </p>
        <p style={S.p}>
          Plateforme européenne de règlement en ligne des litiges (litiges transfrontaliers UE) :{" "}
          <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" style={S.link}>
            ec.europa.eu/consumers/odr
          </a>.
        </p>
      </LegalSec>

      <LegalSec title="Droit applicable et juridiction">
        <p style={S.p}>
          Les présentes mentions légales et l&apos;ensemble des relations entre l&apos;éditeur et les
          Utilisateurs sont régis par le droit français. En cas de litige, à défaut de résolution
          amiable, les tribunaux français sont seuls compétents.
          Le consommateur peut saisir, à son choix, la juridiction du lieu où il demeure ou du
          lieu où l&apos;éditeur est établi (article R.631-3 du Code de la consommation).
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
