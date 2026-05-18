import Link from "next/link"
import { LegalMain, LegalSec, legalStyles as S } from "../../components/legal"

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
      subtitle="En vigueur au 18 mai 2026"
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
          Le responsable du traitement des données personnelles collectées via la plateforme KeyMatch
          est <strong style={S.strong}>Paul David</strong>, fondateur de KeyMatch, agissant en qualité
          de personne physique. Coordonnées complètes :{" "}
          <Link href="/mentions-legales" style={S.link}>mentions légales</Link>.
        </p>
        <p style={S.p}>
          Pour toute question relative à vos données personnelles :{" "}
          <a href="mailto:privacy@keymatch-immo.fr" style={S.link}>privacy@keymatch-immo.fr</a>.
        </p>
      </LegalSec>

      <LegalSec title="3. Données collectées">
        <p style={S.p}>Nous collectons et traitons les catégories de données suivantes :</p>
        <ul style={{ ...S.ul, margin: "0 0 10px" }}>
          <li style={S.li}><strong style={S.strong}>Données d&apos;identification</strong> : nom, prénom, adresse email, mot de passe (stocké sous forme hachée bcrypt), photo de profil éventuelle.</li>
          <li style={S.li}><strong style={S.strong}>Données de contact</strong> : numéro de téléphone (facultatif), adresse postale éventuelle.</li>
          <li style={S.li}><strong style={S.strong}>Données du profil locataire</strong> : préférences de logement (ville, surface, budget, type de bien, équipements, DPE, meublé/non meublé, animaux, etc.).</li>
          <li style={S.li}><strong style={S.strong}>Données du dossier locataire</strong> : situation professionnelle, revenus mensuels, type de contrat (CDI, CDD, etc.), présence d&apos;un garant, justificatifs téléversés conformes au décret n°&nbsp;2015-1437 (pièce d&apos;identité, bulletins de salaire, avis d&apos;imposition, contrat de travail, quittances de loyer). <strong style={S.strong}>Ces documents sont stockés dans un espace privé chiffré, hébergé en France sur les serveurs OVHcloud SAS (MinIO self-hosted, Gravelines). Ils ne sont accessibles qu&apos;aux propriétaires auxquels vous avez explicitement transmis votre dossier via la plateforme. Aucun accès tiers ni outil d&apos;analyse automatisée n&apos;est appliqué à ces documents.</strong></li>
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
          <strong style={S.strong}>Hébergement 100% France :</strong> depuis le 18 mai 2026, l&apos;intégralité de
          l&apos;infrastructure KeyMatch (serveur applicatif, base de données, stockage de fichiers, monitoring
          d&apos;erreurs, communication temps réel) est hébergée en France sur les serveurs OVHcloud SAS à
          Gravelines (Hauts-de-France, Union européenne).
        </p>
        <p style={S.p}>
          Les sous-traitants techniques actuels strictement nécessaires à la fourniture du service :
        </p>
        <ul style={{ ...S.ul, margin: "0 0 10px" }}>
          <li style={S.li}><strong style={S.strong}>OVHcloud SAS</strong> (hébergement VPS, base de données Postgres self-hosted, stockage de fichiers MinIO self-hosted, communication temps réel) — France (Gravelines, UE). Aucun transfert hors UE.</li>
          <li style={S.li}><strong style={S.strong}>Brevo SAS</strong> (envoi d&apos;emails transactionnels : confirmations, notifications, alertes) — France, Union européenne.</li>
          <li style={S.li}><strong style={S.strong}>Google LLC</strong> (authentification OAuth pour les Utilisateurs connectés via leur compte Google) — États-Unis, couvert par la décision d&apos;adéquation Data Privacy Framework UE-USA du 10 juillet 2023.</li>
          <li style={S.li}><strong style={S.strong}>GlitchTip</strong> (monitoring d&apos;erreurs techniques, version self-hosted KeyMatch) — France, hébergé sur l&apos;infrastructure OVHcloud KeyMatch. Aucun transfert tiers.</li>
          <li style={S.li}><strong style={S.strong}>Upstash</strong> (rate-limiting anti-abus, Redis éphémère) — Union européenne. Pas de données personnelles persistantes.</li>
        </ul>
        <p style={S.p}>
          Tous nos sous-traitants sont soumis à des engagements contractuels de confidentialité et de sécurité
          conformes au RGPD. Le seul transfert hors UE concerne l&apos;authentification Google OAuth, couvert
          par le cadre Data Privacy Framework (décision d&apos;adéquation de la Commission européenne du
          10 juillet 2023).
        </p>
      </LegalSec>

      <LegalSec title="7. Durée de conservation">
        <ul style={{ ...S.ul, margin: "0 0 10px" }}>
          <li style={S.li}><strong style={S.strong}>Compte actif</strong> : vos données sont conservées tant que vous utilisez le service.</li>
          <li style={S.li}><strong style={S.strong}>Compte supprimé</strong> : les données personnelles sont effacées sous 30 jours, à l&apos;exception de celles devant être conservées pour des obligations légales.</li>
          <li style={S.li}><strong style={S.strong}>Bail signé électroniquement</strong> : 3 ans après la fin du bail (loi ALUR du 24 mars 2014, art. 8) — copie chiffrée conservée pour preuve juridique en cas de litige.</li>
          <li style={S.li}><strong style={S.strong}>Signatures électroniques eIDAS</strong> : 10 ans après la signature (règlement UE 910/2014, art. 24) pour garantir la valeur probante en justice.</li>
          <li style={S.li}><strong style={S.strong}>États des lieux et quittances</strong> : 3 ans après la fin du bail (loi du 6 juillet 1989, art. 22).</li>
          <li style={S.li}><strong style={S.strong}>Données comptables et facturation</strong> : 10 ans (Code de commerce, art. L.123-22).</li>
          <li style={S.li}><strong style={S.strong}>Données fiscales</strong> : 6 ans (Livre des procédures fiscales, art. L.102 B).</li>
          <li style={S.li}><strong style={S.strong}>Journaux de connexion (logs)</strong> : 12 mois (LCEN, décret 2011-219).</li>
          <li style={S.li}><strong style={S.strong}>Dossier locataire partagé</strong> : les tokens de partage expirent automatiquement après 7 jours.</li>
          <li style={S.li}><strong style={S.strong}>Messages</strong> : conservés tant que les deux Utilisateurs concernés ont un Compte actif.</li>
          <li style={S.li}><strong style={S.strong}>Signalements et données de modération</strong> : 3 ans après traitement.</li>
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
          <a href="mailto:privacy@keymatch-immo.fr" style={S.link}>privacy@keymatch-immo.fr</a>. Nous répondons
          dans un délai d&apos;un mois maximum.
        </p>
        <p style={S.p}>
          Vous disposez également du droit d&apos;introduire une réclamation auprès de la Commission Nationale de
          l&apos;Informatique et des Libertés (CNIL) :{" "}
          <a href="https://www.cnil.fr" style={S.link}>www.cnil.fr</a>.
        </p>
      </LegalSec>

      <LegalSec title="10. Transferts hors Union Européenne">
        <p style={S.p}>
          Les données des utilisateurs sont hébergées <strong style={S.strong}>exclusivement en France</strong>{" "}
          (Gravelines, Hauts-de-France) sur les serveurs OVHcloud SAS. Aucun transfert ne se fait vers un pays
          tiers à l&apos;exception de l&apos;authentification via Google OAuth (États-Unis), encadrée par la
          décision d&apos;adéquation de la Commission européenne dite Data Privacy Framework UE-USA du 10 juillet
          2023. Nous vous fournissons sur demande une copie des garanties contractuelles correspondantes.
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

      <LegalSec title="13. Documentation RGPD interne (DPIA + Registre Article 30)">
        <p style={S.p}>
          Conformément aux articles 30 et 35 du RGPD, KeyMatch tient à jour deux documents internes consultables sur
          simple demande à <a href="mailto:privacy@keymatch-immo.fr" style={S.link}>privacy@keymatch-immo.fr</a> :
        </p>
        <ul style={S.ul}>
          <li style={S.li}>
            <strong style={S.strong}>Analyse d&apos;Impact RGPD (DPIA)</strong> — couvre les traitements à risque élevé
            de KeyMatch (dossier locataire KYC + signature bail eIDAS). Identifie les risques résiduels avec leur plan de
            mitigation. Mise à jour à chaque évolution majeure du traitement.
          </li>
          <li style={S.li}>
            <strong style={S.strong}>Registre des activités de traitement (Article 30)</strong> — liste les traitements
            distincts (compte utilisateur, matching algorithmique, dossier KYC, bail eIDAS, EDL contradictoire,
            communication, loyers/quittances/IRL) avec finalité, base légale, durée de conservation, destinataires et
            mesures de sécurité pour chacun.
          </li>
        </ul>
        <p style={S.p}>
          Ces documents sont rédigés selon les guidelines CNIL et conservés pendant 5 ans minimum. Sur demande motivée
          (ex : audit, contrôle, exercice de droits) nous vous en transmettons une version synthétique sous 30 jours.
        </p>
      </LegalSec>

      <LegalSec title="14. Contact données personnelles">
        <p style={S.p}>
          KeyMatch étant en phase gratuite et opéré par une personne physique (Paul David, responsable
          de traitement), <strong style={S.strong}>aucun Délégué à la Protection des Données (DPO) au sens
          de l&apos;article 37 du RGPD n&apos;a été désigné formellement</strong>, la désignation n&apos;étant
          pas obligatoire pour les traitements actuellement réalisés.
        </p>
        <p style={S.p}>
          Pour toute question relative au traitement de vos données personnelles ou à l&apos;exercice de vos
          droits RGPD :
        </p>
        <p style={S.p}>
          <strong style={S.strong}>Contact</strong> : <a href="mailto:privacy@keymatch-immo.fr" style={S.link}>privacy@keymatch-immo.fr</a><br />
          <strong style={S.strong}>Délai de réponse</strong> : 30 jours maximum (RGPD art. 12.3)<br />
          <strong style={S.strong}>Justificatif requis</strong> : copie d&apos;une pièce d&apos;identité pour l&apos;exercice
          des droits d&apos;accès, rectification, effacement, portabilité, opposition, limitation
        </p>
        <p style={S.p}>
          Cette situation sera réévaluée à l&apos;occasion d&apos;un éventuel passage à un modèle commercial ou
          d&apos;un changement substantiel de la nature ou de l&apos;ampleur des traitements.
        </p>
      </LegalSec>

      <LegalSec title="15. Procédure d'incident de sécurité">
        <p style={S.p}>
          En cas de violation de données personnelles susceptible d&apos;engendrer un risque pour vos droits et libertés,
          KeyMatch s&apos;engage à :
        </p>
        <ul style={S.ul}>
          <li style={S.li}>Notifier la CNIL dans les <strong style={S.strong}>72 heures</strong> suivant la
            connaissance de l&apos;incident (RGPD art. 33).</li>
          <li style={S.li}>Communiquer aux personnes concernées dans les meilleurs délais lorsque le risque est élevé
            (RGPD art. 34), via email enregistré dans la plateforme.</li>
          <li style={S.li}>Maintenir un registre interne des incidents avec descriptif, conséquences et mesures
            correctives.</li>
        </ul>
        <p style={S.p}>
          Pour signaler un incident de sécurité que vous suspectez (ex : compte compromis, email de phishing usurpant
          KeyMatch) : <a href="mailto:privacy@keymatch-immo.fr" style={S.link}>privacy@keymatch-immo.fr</a> avec
          mention &quot;[INCIDENT SÉCURITÉ]&quot; en objet.
        </p>
      </LegalSec>
    </LegalMain>
  )
}
