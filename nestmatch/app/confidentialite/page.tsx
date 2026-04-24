import Link from "next/link"
import { LegalMain, LegalSec, legalStyles as S } from "../components/legal"

export const metadata = {
  title: "Politique de confidentialité",
  description: "Traitement des données personnelles sur KeyMatch : finalités, base légale, destinataires, durée de conservation, droits RGPD.",
  alternates: { canonical: "/confidentialite" },
}

export default function Confidentialite() {
  return (
    <LegalMain
      eyebrow="Légal · Confidentialité"
      title="Politique de confidentialité"
      subtitle="En vigueur au 18 avril 2026"
    >
      <LegalSec title="1. Préambule">
        <p style={S.p}>
          La présente Politique de confidentialité décrit comment KeyMatch collecte, utilise, conserve et protège
          les données personnelles des Utilisateurs de la plateforme accessible à l&apos;adresse <strong style={S.strong}>keymatch-immo.fr</strong>.
          Elle s&apos;applique à toute personne inscrite ou simplement en visite sur le site.
        </p>
        <p style={S.p}>
          Nous nous engageons à traiter vos données dans le strict respect du Règlement (UE) 2016/679 « RGPD »
          et de la loi n° 78-17 du 6 janvier 1978 modifiée « Informatique et Libertés ».
        </p>
      </LegalSec>

      <LegalSec title="2. Responsable du traitement">
        <p style={S.p}>
          Le responsable du traitement des données personnelles collectées via la plateforme KeyMatch est la
          société éditrice dont les coordonnées figurent dans les{" "}
          <Link href="/mentions-legales" style={S.link}>mentions légales</Link>.
        </p>
        <p style={S.p}>
          Pour toute question relative à vos données personnelles, contactez :{" "}
          <strong style={S.strong}>contact@keymatch-immo.fr</strong>.
        </p>
      </LegalSec>

      <LegalSec title="3. Données collectées">
        <p style={S.p}>Nous collectons et traitons les catégories de données suivantes :</p>
        <ul style={{ ...S.ul, margin: "0 0 10px" }}>
          <li style={S.li}><strong style={S.strong}>Données d&apos;identification</strong> : nom, prénom, adresse email, mot de passe (stocké sous forme hachée bcrypt), photo de profil éventuelle.</li>
          <li style={S.li}><strong style={S.strong}>Données de contact</strong> : numéro de téléphone (facultatif), adresse postale éventuelle.</li>
          <li style={S.li}><strong style={S.strong}>Données du profil locataire</strong> : préférences de logement (ville, surface, budget, type de bien, équipements, DPE, meublé/non meublé, animaux, etc.).</li>
          <li style={S.li}><strong style={S.strong}>Données du dossier locataire</strong> : situation professionnelle, revenus mensuels, type de contrat (CDI, CDD, etc.), présence d&apos;un garant, justificatifs téléversés conformes au décret n°&nbsp;2015-1437 (pièce d&apos;identité, bulletins de salaire, avis d&apos;imposition, contrat de travail, quittances de loyer).</li>
          <li style={S.li}><strong style={S.strong}>Données des annonces</strong> : photos, description, prix, charges, caution, surface, pièces, localisation (GPS précis ou zone approximative selon choix du propriétaire), équipements, DPE.</li>
          <li style={S.li}><strong style={S.strong}>Données d&apos;interaction</strong> : messages échangés entre Utilisateurs, demandes de visite, favoris, candidatures, signalements.</li>
          <li style={S.li}><strong style={S.strong}>Documents contractuels</strong> : baux, états des lieux, quittances de loyer générés via la Plateforme.</li>
          <li style={S.li}><strong style={S.strong}>Données techniques</strong> : adresse IP, identifiants de session, journaux de connexion, horodatages, informations sur le navigateur et l&apos;appareil.</li>
          <li style={S.li}><strong style={S.strong}>Cookies</strong> : voir la <Link href="/cookies" style={S.link}>Politique cookies</Link>.</li>
        </ul>
        <p style={S.p}>
          Les champs obligatoires sont signalés lors de la collecte. Les autres sont facultatifs et permettent
          d&apos;améliorer la pertinence du service.
        </p>
      </LegalSec>

      <LegalSec title="4. Finalités du traitement">
        <p style={S.p}>Vos données sont traitées pour les finalités suivantes :</p>
        <ul style={{ ...S.ul, margin: "0 0 10px" }}>
          <li style={S.li}>Créer, gérer et sécuriser votre Compte.</li>
          <li style={S.li}>Permettre la mise en relation entre Locataires et Propriétaires.</li>
          <li style={S.li}>Calculer le score de compatibilité entre votre profil et les annonces (algorithme interne, aucun profilage automatisé avec effet juridique au sens de l&apos;article 22 du RGPD).</li>
          <li style={S.li}>Faciliter la communication via la messagerie interne.</li>
          <li style={S.li}>Organiser et suivre les visites.</li>
          <li style={S.li}>Générer les documents contractuels (bail, état des lieux, quittances) au format PDF.</li>
          <li style={S.li}>Envoyer des notifications transactionnelles (nouveau message, visite confirmée, etc.).</li>
          <li style={S.li}>Assurer la sécurité de la Plateforme (prévention de la fraude, lutte contre les abus, investigation en cas d&apos;incident).</li>
          <li style={S.li}>Respecter nos obligations légales (conservation de certaines données, réponse aux autorités compétentes).</li>
          <li style={S.li}>Améliorer le service (mesures d&apos;audience agrégées, détection de bugs).</li>
        </ul>
      </LegalSec>

      <LegalSec title="5. Base légale">
        <p style={S.p}>Chaque traitement repose sur l&apos;une des bases légales suivantes :</p>
        <ul style={{ ...S.ul, margin: "0 0 10px" }}>
          <li style={S.li}><strong style={S.strong}>Exécution du contrat</strong> : gestion du Compte, fourniture du service, génération des documents contractuels.</li>
          <li style={S.li}><strong style={S.strong}>Consentement</strong> : envoi de notifications non essentielles, dépôt de cookies non nécessaires, partage du dossier locataire par lien.</li>
          <li style={S.li}><strong style={S.strong}>Intérêt légitime</strong> : sécurité de la Plateforme, prévention des fraudes, amélioration du service, modération.</li>
          <li style={S.li}><strong style={S.strong}>Obligation légale</strong> : conservation de certaines données à des fins comptables, fiscales ou judiciaires.</li>
        </ul>
      </LegalSec>

      <LegalSec title="6. Destinataires des données">
        <p style={S.p}>
          Vos données sont accessibles exclusivement aux personnes habilitées de l&apos;éditeur dans le strict cadre
          de leurs fonctions. <strong style={S.strong}>Aucune donnée n&apos;est vendue à des tiers.</strong>
        </p>
        <p style={S.p}>
          Les informations de votre dossier locataire ne sont partagées qu&apos;avec les Propriétaires que vous avez
          contactés ou auxquels vous avez explicitement envoyé votre dossier via le lien de partage sécurisé.
        </p>
        <p style={S.p}>
          Certains sous-traitants techniques peuvent avoir accès aux données strictement nécessaires à la fourniture
          du service :
        </p>
        <ul style={{ ...S.ul, margin: "0 0 10px" }}>
          <li style={S.li}><strong style={S.strong}>Vercel Inc.</strong> (hébergement applicatif) — États-Unis</li>
          <li style={S.li}><strong style={S.strong}>Supabase</strong> (base de données, authentification, stockage de fichiers) — Union Européenne</li>
          <li style={S.li}><strong style={S.strong}>Google</strong> (authentification OAuth pour les Utilisateurs connectés via Google) — États-Unis</li>
          <li style={S.li}><strong style={S.strong}>Anthropic</strong> (services d&apos;IA, uniquement si vous utilisez l&apos;assistant conversationnel) — États-Unis</li>
        </ul>
        <p style={S.p}>
          Tous nos sous-traitants sont soumis à des engagements contractuels de confidentialité et de sécurité
          conformes au RGPD.
        </p>
      </LegalSec>

      <LegalSec title="7. Durée de conservation">
        <ul style={{ ...S.ul, margin: "0 0 10px" }}>
          <li style={S.li}><strong style={S.strong}>Compte actif</strong> : vos données sont conservées tant que vous utilisez le service.</li>
          <li style={S.li}><strong style={S.strong}>Compte supprimé</strong> : les données personnelles sont effacées sous 30 jours, à l&apos;exception de celles devant être conservées pour des obligations légales (journaux de connexion : 12 mois ; données financières : 10 ans selon le Code de commerce).</li>
          <li style={S.li}><strong style={S.strong}>Dossier locataire partagé</strong> : les tokens de partage expirent automatiquement après 7 jours.</li>
          <li style={S.li}><strong style={S.strong}>Messages</strong> : conservés tant que les deux Utilisateurs concernés ont un Compte actif.</li>
          <li style={S.li}><strong style={S.strong}>Signalements et données de modération</strong> : conservés 3 ans après traitement pour assurer un suivi.</li>
        </ul>
      </LegalSec>

      <LegalSec title="8. Sécurité">
        <p style={S.p}>
          Nous mettons en œuvre les mesures techniques et organisationnelles appropriées pour protéger vos données :
        </p>
        <ul style={{ ...S.ul, margin: "0 0 10px" }}>
          <li style={S.li}>chiffrement des mots de passe (bcrypt, coût 12) ;</li>
          <li style={S.li}>connexions HTTPS chiffrées de bout en bout ;</li>
          <li style={S.li}>séparation des rôles et principe du moindre privilège sur les accès internes ;</li>
          <li style={S.li}>journalisation des accès et des opérations sensibles ;</li>
          <li style={S.li}>sauvegardes régulières de la base de données ;</li>
          <li style={S.li}>contrôle des uploads (types MIME, taille, validation serveur) ;</li>
          <li style={S.li}>tests automatisés pour les fonctions critiques (matching, tokens, dossiers).</li>
        </ul>
        <p style={S.p}>
          En cas de violation de données susceptible d&apos;engendrer un risque pour vos droits et libertés, nous nous
          engageons à notifier la CNIL dans les 72 heures et à vous en informer directement si l&apos;incident est
          significatif.
        </p>
      </LegalSec>

      <LegalSec title="9. Vos droits">
        <p style={S.p}>Conformément au RGPD, vous disposez des droits suivants sur vos données :</p>
        <ul style={{ ...S.ul, margin: "0 0 10px" }}>
          <li style={S.li}><strong style={S.strong}>Droit d&apos;accès</strong> : obtenir confirmation du traitement et une copie de vos données.</li>
          <li style={S.li}><strong style={S.strong}>Droit de rectification</strong> : corriger vos données inexactes ou les compléter.</li>
          <li style={S.li}><strong style={S.strong}>Droit à l&apos;effacement</strong> (« droit à l&apos;oubli ») : demander la suppression de vos données.</li>
          <li style={S.li}><strong style={S.strong}>Droit à la limitation</strong> : restreindre le traitement dans certains cas (contestation, données obsolètes).</li>
          <li style={S.li}><strong style={S.strong}>Droit à la portabilité</strong> : recevoir vos données dans un format structuré, couramment utilisé et lisible par machine.</li>
          <li style={S.li}><strong style={S.strong}>Droit d&apos;opposition</strong> : vous opposer au traitement pour des motifs tenant à votre situation particulière.</li>
          <li style={S.li}><strong style={S.strong}>Droit de retrait du consentement</strong> : à tout moment, pour les traitements fondés sur le consentement, sans remettre en cause la licéité des traitements effectués avant le retrait.</li>
          <li style={S.li}><strong style={S.strong}>Droit de définir des directives post-mortem</strong> sur le sort de vos données après votre décès.</li>
        </ul>
        <p style={S.p}>
          Pour exercer ces droits, adressez votre demande accompagnée d&apos;un justificatif d&apos;identité à :{" "}
          <strong style={S.strong}>contact@keymatch-immo.fr</strong>. Nous répondons dans un délai d&apos;un mois maximum.
        </p>
        <p style={S.p}>
          Vous disposez également du droit d&apos;introduire une réclamation auprès de la Commission Nationale de
          l&apos;Informatique et des Libertés (CNIL) :{" "}
          <a href="https://www.cnil.fr" style={S.link}>www.cnil.fr</a>.
        </p>
      </LegalSec>

      <LegalSec title="10. Transferts hors Union Européenne">
        <p style={S.p}>
          Certains sous-traitants (notamment Vercel, Google, Anthropic) peuvent être situés hors de l&apos;Union
          Européenne, principalement aux États-Unis. Ces transferts sont encadrés par les garanties appropriées
          prévues par le RGPD (décisions d&apos;adéquation de la Commission européenne, clauses contractuelles types,
          Data Privacy Framework). Nous vous fournissons sur demande une copie de ces garanties.
        </p>
      </LegalSec>

      <LegalSec title="11. Cookies">
        <p style={S.p}>
          L&apos;utilisation des cookies est détaillée dans notre{" "}
          <Link href="/cookies" style={S.link}>Politique cookies</Link>.
        </p>
      </LegalSec>

      <LegalSec title="12. Modification de la politique">
        <p style={S.p}>
          La présente Politique de confidentialité peut être modifiée pour refléter les évolutions réglementaires ou
          du service. Toute modification substantielle fera l&apos;objet d&apos;une notification par email et d&apos;un
          affichage sur la Plateforme. La date de mise à jour est indiquée en haut du document.
        </p>
      </LegalSec>
    </LegalMain>
  )
}
