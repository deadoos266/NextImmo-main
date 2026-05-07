import Link from "next/link"
import { LegalMain, LegalSec, legalStyles as S } from "../components/legal"

export const metadata = {
  title: "Conditions Générales d'Utilisation",
  description: "Conditions Générales d'Utilisation de la plateforme KeyMatch — règles d'accès, obligations des utilisateurs, responsabilités, propriété intellectuelle.",
  alternates: { canonical: "/cgu" },
}

export default function CGU() {
  return (
    <LegalMain
      eyebrow="Légal · CGU"
      title="Conditions Générales d'Utilisation"
      subtitle="En vigueur au 18 avril 2026"
    >
      <LegalSec title="1. Objet">
        <p style={S.p}>
          Les présentes Conditions Générales d&apos;Utilisation (ci-après « CGU ») ont pour objet de définir les
          modalités d&apos;accès et d&apos;utilisation de la plateforme KeyMatch, accessible à l&apos;adresse
          <strong style={S.strong}> keymatch-immo.fr </strong>(ci-après la « Plateforme »), éditée par la société dont les
          coordonnées figurent dans les <Link href="/mentions-legales" style={S.link}>Mentions légales</Link>
          {" "}(ci-après l&apos;« Éditeur »).
        </p>
        <p style={S.p}>
          L&apos;utilisation de la Plateforme implique l&apos;acceptation pleine et entière des présentes CGU.
          L&apos;Utilisateur qui n&apos;accepte pas tout ou partie des CGU est invité à renoncer à utiliser le service.
        </p>
      </LegalSec>

      <LegalSec title="2. Définitions">
        <ul style={{ ...S.ul, margin: "4px 0 0" }}>
          <li style={S.li}><strong style={S.strong}>Plateforme</strong> : l&apos;ensemble des services accessibles en ligne via keymatch-immo.fr.</li>
          <li style={S.li}><strong style={S.strong}>Utilisateur</strong> : toute personne physique majeure disposant d&apos;un compte sur la Plateforme.</li>
          <li style={S.li}><strong style={S.strong}>Locataire</strong> : Utilisateur à la recherche d&apos;un logement à louer.</li>
          <li style={S.li}><strong style={S.strong}>Propriétaire</strong> : Utilisateur mettant un bien immobilier à disposition à la location.</li>
          <li style={S.li}><strong style={S.strong}>Compte</strong> : espace personnel sécurisé de l&apos;Utilisateur, accessible après authentification.</li>
          <li style={S.li}><strong style={S.strong}>Annonce</strong> : publication décrivant un bien immobilier proposé à la location.</li>
          <li style={S.li}><strong style={S.strong}>Dossier locataire</strong> : ensemble des informations et justificatifs fournis par un Locataire pour candidater à une Annonce.</li>
        </ul>
      </LegalSec>

      <LegalSec title="3. Accès et inscription">
        <p style={S.p}>
          L&apos;accès à la Plateforme est libre et gratuit. La création d&apos;un Compte est ouverte à toute
          personne physique majeure. Les personnes mineures ne sont pas autorisées à s&apos;inscrire.
          L&apos;Éditeur se réserve le droit de refuser ou de résilier un Compte ne respectant pas les présentes CGU.
        </p>
        <p style={S.p}>
          L&apos;inscription se fait soit par adresse email et mot de passe, soit via un compte Google. L&apos;Utilisateur
          s&apos;engage à fournir des informations exactes, complètes et à jour, et à les maintenir ainsi pendant toute la
          durée de son inscription.
        </p>
        <p style={S.p}>
          L&apos;Utilisateur est seul responsable de la confidentialité de son mot de passe et de toute activité effectuée
          depuis son Compte. Toute utilisation frauduleuse doit être signalée sans délai à l&apos;Éditeur.
        </p>
      </LegalSec>

      <LegalSec title="4. Description du service">
        <p style={S.p}>
          La Plateforme propose un service de mise en relation entre Locataires et Propriétaires de biens immobiliers
          en France. Elle permet notamment :
        </p>
        <ul style={{ ...S.ul, margin: "0 0 10px" }}>
          <li style={S.li}>la publication et la consultation d&apos;Annonces de location ;</li>
          <li style={S.li}>le calcul d&apos;un score de compatibilité entre le profil d&apos;un Locataire et une Annonce ;</li>
          <li style={S.li}>la messagerie entre Utilisateurs ;</li>
          <li style={S.li}>l&apos;organisation de visites et la gestion des demandes ;</li>
          <li style={S.li}>la génération de documents (bail, état des lieux, quittances) au format PDF ;</li>
          <li style={S.li}>le partage sécurisé du Dossier locataire via lien à durée limitée.</li>
        </ul>
        <p style={S.p}>
          L&apos;Éditeur n&apos;est jamais partie aux contrats de location conclus entre Locataires et Propriétaires. Il agit
          uniquement en tant qu&apos;intermédiaire technique et hébergeur au sens de la loi pour la confiance dans
          l&apos;économie numérique (LCEN).
        </p>
      </LegalSec>

      <LegalSec title="5. Gratuité du service">
        <p style={S.p}>
          L&apos;ensemble des fonctionnalités de la Plateforme est actuellement gratuit pour les Locataires comme
          pour les Propriétaires. L&apos;Éditeur se réserve la possibilité d&apos;introduire à l&apos;avenir des
          fonctionnalités payantes, qui seront alors clairement signalées et soumises à acceptation préalable.
        </p>
      </LegalSec>

      <LegalSec title="6. Obligations des Utilisateurs">
        <p style={S.p}>L&apos;Utilisateur s&apos;engage à utiliser la Plateforme de bonne foi. Il s&apos;engage notamment à :</p>
        <ul style={{ ...S.ul, margin: "0 0 10px" }}>
          <li style={S.li}>ne publier que des contenus exacts, licites et conformes à la réalité ;</li>
          <li style={S.li}>ne pas usurper l&apos;identité d&apos;un tiers ;</li>
          <li style={S.li}>ne pas publier de contenu à caractère diffamatoire, injurieux, discriminatoire, pornographique, violent ou contraire à la loi ;</li>
          <li style={S.li}>ne pas contourner les mécanismes de sécurité de la Plateforme ;</li>
          <li style={S.li}>ne pas collecter massivement les données d&apos;autres Utilisateurs (scraping).</li>
        </ul>
        <p style={S.p}>
          <strong style={S.strong}>Obligations spécifiques des Propriétaires :</strong> publier uniquement des Annonces pour des biens
          dont ils disposent légalement (propriété, mandat de gestion, colocation, etc.) ; respecter les règles
          applicables en matière de location (loi ALUR n°&nbsp;2014-366, diagnostics, décence du logement, encadrement
          des loyers le cas échéant) ; ne pas solliciter auprès d&apos;un candidat locataire de pièces autres que
          celles figurant dans la liste limitative du décret n°&nbsp;2015-1437 du 5 novembre 2015, pris en application
          de l&apos;article 22-2 de la loi n°&nbsp;89-462 du 6 juillet 1989 (notamment : aucun RIB, aucune pièce
          révélant la situation de famille, la nationalité ou les convictions ne peuvent être exigés).
        </p>
        <p style={S.p}>
          <strong style={S.strong}>Obligations spécifiques des Locataires :</strong> fournir des informations et justificatifs exacts
          dans leur Dossier locataire ; ne pas transmettre ou partager hors Plateforme des documents reçus
          d&apos;autres Utilisateurs sans leur accord.
        </p>
      </LegalSec>

      <LegalSec title="7. Modération et signalement">
        <p style={S.p}>
          L&apos;Éditeur peut, à tout moment et sans préavis, supprimer ou modifier un contenu publié sur la
          Plateforme qui serait manifestement illicite, frauduleux ou contraire aux présentes CGU. Tout
          Utilisateur peut signaler un contenu ou un comportement litigieux depuis la Plateforme, via le bouton
          « Signaler » présent sur chaque Annonce, ou par email à{" "}
          <strong style={S.strong}>contact@keymatch-immo.fr</strong>.
        </p>
      </LegalSec>

      <LegalSec title="8. Responsabilité">
        <p style={S.p}>
          L&apos;Éditeur met en œuvre les moyens raisonnables pour garantir la disponibilité et la continuité de la
          Plateforme. Il ne peut néanmoins être tenu responsable des interruptions, erreurs ou dysfonctionnements
          qui ne lui seraient pas directement imputables (notamment pannes réseau, attaques, force majeure).
        </p>
        <p style={S.p}>
          L&apos;Éditeur n&apos;est pas responsable du contenu publié par les Utilisateurs. Il agit en qualité
          d&apos;hébergeur au sens de l&apos;article 6 de la LCEN. Il n&apos;est pas partie aux contrats de bail
          conclus entre Utilisateurs et ne saurait être tenu responsable des litiges locatifs, impayés, dégâts
          matériels, fausses déclarations ou tout autre différend relevant de la relation contractuelle entre
          les parties.
        </p>
        <p style={S.p}>
          Il appartient aux Utilisateurs de vérifier l&apos;identité et la fiabilité de leurs interlocuteurs, et de
          réaliser toutes les diligences préalables à la signature d&apos;un bail.
        </p>
      </LegalSec>

      <LegalSec title="9. Propriété intellectuelle">
        <p style={S.p}>
          La marque KeyMatch, le nom de domaine, les textes, graphismes, logos, icônes, photographies, vidéos,
          codes sources et logiciels de la Plateforme sont la propriété exclusive de l&apos;Éditeur et protégés par
          le Code de la propriété intellectuelle. Toute reproduction, représentation, modification ou adaptation,
          totale ou partielle, par quelque procédé que ce soit, est interdite sans autorisation écrite préalable.
        </p>
        <p style={S.p}>
          Les Utilisateurs conservent la propriété des contenus qu&apos;ils publient (photos d&apos;Annonces, textes)
          mais concèdent à l&apos;Éditeur une licence d&apos;utilisation non exclusive, gratuite et pour la durée
          strictement nécessaire à l&apos;affichage de ces contenus sur la Plateforme.
        </p>
      </LegalSec>

      <LegalSec title="10. Données personnelles">
        <p style={S.p}>
          Les modalités de traitement des données personnelles collectées via la Plateforme sont détaillées dans
          la <Link href="/confidentialite" style={S.link}>Politique de confidentialité</Link>,
          qui fait partie intégrante des présentes CGU.
        </p>
      </LegalSec>

      <LegalSec title="11. Cookies">
        <p style={S.p}>
          L&apos;utilisation des cookies et des technologies similaires est décrite dans la{" "}
          <Link href="/cookies" style={S.link}>Politique cookies</Link>.
        </p>
      </LegalSec>

      <LegalSec title="12. Résiliation">
        <p style={S.p}>
          L&apos;Utilisateur peut à tout moment supprimer son Compte depuis l&apos;espace « Paramètres » de son profil.
          La suppression entraîne l&apos;effacement définitif de ses Annonces, messages, visites et Dossier locataire,
          sous réserve des obligations légales de conservation incombant à l&apos;Éditeur.
        </p>
        <p style={S.p}>
          L&apos;Éditeur peut également suspendre ou résilier sans préavis un Compte en cas de manquement grave aux
          présentes CGU, notamment en cas de publication de contenu frauduleux, de comportement abusif envers les
          autres Utilisateurs, ou d&apos;atteinte à la sécurité de la Plateforme.
        </p>
      </LegalSec>

      <LegalSec title="13. Modification des CGU">
        <p style={S.p}>
          L&apos;Éditeur se réserve le droit de modifier à tout moment les présentes CGU pour les adapter aux
          évolutions du service ou à la réglementation. Les Utilisateurs sont informés des modifications par
          notification sur la Plateforme ou par email. La poursuite de l&apos;utilisation du service après notification
          vaut acceptation des CGU modifiées.
        </p>
      </LegalSec>

      <LegalSec title="14. Droit applicable et règlement des litiges">
        <p style={S.p}>
          Les présentes CGU sont régies par le droit français. Toute contestation relative à leur interprétation
          ou à leur exécution sera, à défaut de résolution amiable, portée devant les tribunaux français compétents.
        </p>
        <p style={S.p}>
          Conformément aux articles L611-1 et suivants du Code de la consommation, l&apos;Utilisateur consommateur
          peut recourir gratuitement au service de médiation de la consommation : plateforme européenne de
          règlement en ligne des litiges (<a href="https://ec.europa.eu/consumers/odr" style={S.link}>ec.europa.eu/consumers/odr</a>).
        </p>
      </LegalSec>

      <LegalSec title="15. Contact">
        <p style={S.p}>
          Pour toute question relative aux présentes CGU, vous pouvez nous contacter via le formulaire{" "}
          <Link href="/contact" style={S.link}>Nous contacter</Link>{" "}
          ou par email à <strong style={S.strong}>contact@keymatch-immo.fr</strong>.
        </p>
      </LegalSec>
    </LegalMain>
  )
}
