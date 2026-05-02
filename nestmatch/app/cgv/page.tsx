/**
 * V61.4 — Page /cgv : Conditions Générales de Vente.
 *
 * KeyMatch est en phase beta : la plateforme est gratuite pour les
 * deux parties (locataire et proprio). Pas de commission, pas
 * d'abonnement, pas de frais d'agence. Cette page formalise ce
 * positionnement + prépare l'évolution future (paiements premium).
 *
 * Pour la phase post-beta, des services optionnels payants pourront
 * être proposés (assurances, vérifications avancées de dossier,
 * options de mise en avant). Toute évolution sera notifiée par email
 * + opt-in explicite.
 */
import Link from "next/link"
import { LegalMain, LegalSec, legalStyles as S } from "../components/legal"

export const metadata = {
  title: "Conditions Générales de Vente",
  description: "Conditions Générales de Vente KeyMatch — gratuité phase beta, services premium futurs, modalités de paiement, droit de rétractation, garanties.",
  alternates: { canonical: "/cgv" },
}

export default function CGV() {
  return (
    <LegalMain
      eyebrow="Légal · CGV"
      title="Conditions Générales de Vente"
      subtitle="En vigueur au 30 avril 2026"
    >
      <LegalSec title="1. Objet">
        <p style={S.p}>
          Les présentes Conditions Générales de Vente (« CGV ») régissent les relations contractuelles
          entre KeyMatch (ci-après l&apos;« Éditeur ») et tout Utilisateur souscrivant à un service
          payant proposé sur la plateforme keymatch-immo.fr.
        </p>
        <p style={S.p}>
          Elles s&apos;appliquent en complément des
          <Link href="/cgu" style={S.link}> Conditions Générales d&apos;Utilisation</Link>.
          En cas de contradiction, les CGV prévalent pour les seuls aspects relatifs aux services payants.
        </p>
      </LegalSec>

      <LegalSec title="2. Gratuité de la plateforme — phase beta">
        <p style={S.p}>
          <strong style={S.strong}>KeyMatch est actuellement en phase beta et entièrement gratuit pour les
          deux parties</strong> (locataires et propriétaires). Aucun frais d&apos;agence, aucune commission,
          aucun abonnement ne sont prélevés au titre de la mise en relation, de la consultation des annonces,
          de la signature électronique des baux, des états des lieux ou de la gestion locative.
        </p>
        <p style={S.p}>
          Cette gratuité concerne notamment :
        </p>
        <ul style={S.ul}>
          <li style={S.li}>La création de compte locataire ou propriétaire</li>
          <li style={S.li}>La publication et consultation d&apos;annonces</li>
          <li style={S.li}>La messagerie privée et les demandes de visite</li>
          <li style={S.li}>Le partage du dossier locataire chiffré</li>
          <li style={S.li}>La signature électronique des baux (eIDAS Niveau 1, art. 1366 Code civil)</li>
          <li style={S.li}>La génération PDF des baux, EDL, quittances et avenants</li>
          <li style={S.li}>L&apos;archive 3 ans des documents (loi ALUR)</li>
          <li style={S.li}>Les notifications email et in-app</li>
        </ul>
      </LegalSec>

      <LegalSec title="3. Services premium futurs">
        <p style={S.p}>
          L&apos;Éditeur se réserve le droit, à l&apos;issue de la phase beta, de proposer des services
          optionnels payants. Les services suivants sont envisagés :
        </p>
        <ul style={S.ul}>
          <li style={S.li}>Assurance loyers impayés (partenariat avec un assureur agréé)</li>
          <li style={S.li}>Vérification avancée du dossier locataire (lecture pièces d&apos;identité, scoring)</li>
          <li style={S.li}>Mise en avant d&apos;annonce (visibilité accrue dans les résultats)</li>
          <li style={S.li}>Diagnostic immobilier en ligne (DPE simplifié)</li>
        </ul>
        <p style={S.p}>
          Toute mise en place d&apos;un service payant fera l&apos;objet d&apos;une notification préalable
          par email aux Utilisateurs concernés, avec présentation détaillée du service, du prix, et des
          modalités. <strong style={S.strong}>Aucune souscription automatique : l&apos;activation requiert
          un opt-in explicite</strong> (case à cocher + clic sur « Confirmer mon achat »).
        </p>
      </LegalSec>

      <LegalSec title="4. Modalités de paiement (à venir)">
        <p style={S.p}>
          Lorsque des services payants seront mis en place, les paiements seront traités via un prestataire
          agréé (Stripe SAS ou équivalent). L&apos;Éditeur ne stocke ni numéros de carte bancaire ni IBAN ;
          ces informations sensibles sont gérées exclusivement par le prestataire de paiement, sous sa
          propre responsabilité réglementaire (DSP2, PCI-DSS).
        </p>
        <p style={S.p}>
          Les prix seront affichés en euros toutes taxes comprises (TTC). Les factures seront émises
          électroniquement et accessibles dans l&apos;espace de l&apos;Utilisateur.
        </p>
      </LegalSec>

      <LegalSec title="5. Droit de rétractation (services payants)">
        <p style={S.p}>
          Conformément à l&apos;article L221-18 du Code de la consommation, l&apos;Utilisateur consommateur
          dispose d&apos;un délai de 14 jours pour exercer son droit de rétractation à compter de la
          souscription d&apos;un service payant, sans avoir à motiver sa décision.
        </p>
        <p style={S.p}>
          <strong style={S.strong}>Exception</strong> : conformément à l&apos;article L221-28 du Code de la
          consommation, le droit de rétractation ne peut être exercé pour les contrats de prestation de
          services pleinement exécutés avant la fin du délai de rétractation et dont l&apos;exécution a
          commencé après accord préalable exprès du consommateur (par ex : génération immédiate d&apos;un
          rapport de scoring).
        </p>
        <p style={S.p}>
          Pour exercer ce droit, l&apos;Utilisateur peut contacter l&apos;Éditeur par email à l&apos;adresse
          mentionnée dans les <Link href="/mentions-legales" style={S.link}>Mentions légales</Link> ou par
          courrier postal. Un formulaire type de rétractation est disponible sur demande.
        </p>
      </LegalSec>

      <LegalSec title="6. Garanties et responsabilité">
        <p style={S.p}>
          L&apos;Éditeur s&apos;engage à fournir les services payants conformément à leur description
          publiée sur la Plateforme au moment de la souscription. La responsabilité de l&apos;Éditeur est
          limitée au montant des sommes effectivement perçues au titre du service défaillant.
        </p>
        <p style={S.p}>
          L&apos;Éditeur n&apos;est pas garant de la solvabilité, de la fiabilité ou du comportement des
          Utilisateurs entre eux. La Plateforme est un intermédiaire technique de mise en relation ; les
          contrats de bail et leur exécution restent de la seule responsabilité des parties signataires
          (locataire et propriétaire).
        </p>
      </LegalSec>

      <LegalSec title="7. Médiation et litiges">
        <p style={S.p}>
          Conformément à l&apos;article L612-1 du Code de la consommation, l&apos;Utilisateur consommateur
          peut recourir gratuitement à un médiateur de la consommation en cas de litige avec
          l&apos;Éditeur, après tentative de résolution amiable directe.
        </p>
        <p style={S.p}>
          La plateforme européenne de règlement en ligne des litiges est également disponible :
          <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" style={S.link}>
            ec.europa.eu/consumers/odr
          </a>.
        </p>
        <p style={S.p}>
          À défaut de résolution amiable, tout litige relève de la compétence exclusive des tribunaux
          français, sous réserve des dispositions légales impératives applicables aux consommateurs.
        </p>
      </LegalSec>

      <LegalSec title="8. Modification des CGV">
        <p style={S.p}>
          L&apos;Éditeur se réserve le droit de modifier les présentes CGV à tout moment. Les Utilisateurs
          seront informés par email et via une notification in-app au moins 30 jours avant l&apos;entrée
          en vigueur de toute modification substantielle (notamment introduction de services payants).
          L&apos;Utilisateur qui refuse les nouvelles conditions peut résilier son compte sans frais ni
          conséquences pour les services en cours.
        </p>
      </LegalSec>

      <LegalSec title="9. Contact">
        <p style={S.p}>
          Pour toute question relative aux CGV ou à la souscription d&apos;un service payant,
          l&apos;Utilisateur peut contacter l&apos;Éditeur via la page Contact accessible depuis le footer,
          ou aux coordonnées indiquées dans les
          <Link href="/mentions-legales" style={S.link}> Mentions légales</Link>.
        </p>
      </LegalSec>
    </LegalMain>
  )
}
