import Link from "next/link"

export const metadata = {
  title: "Politique de confidentialité",
  description: "Traitement des données personnelles sur KeyMatch : finalités, base légale, destinataires, durée de conservation, droits RGPD.",
  alternates: { canonical: "/confidentialite" },
}

const sectionStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 20,
  padding: "28px 32px",
  marginBottom: 16,
}

const h2: React.CSSProperties = { fontSize: 18, fontWeight: 800, marginBottom: 10, letterSpacing: "-0.3px" }
const p: React.CSSProperties = { fontSize: 14, color: "#4b5563", lineHeight: 1.7, marginBottom: 10 }
const li: React.CSSProperties = { fontSize: 14, color: "#4b5563", lineHeight: 1.8 }

export default function Confidentialite() {
  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: "40px 20px" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <Link href="/" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>← Retour à l&apos;accueil</Link>

        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.5px", margin: "16px 0 4px" }}>
          Politique de confidentialité
        </h1>
        <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 28 }}>
          En vigueur au 18 avril 2026
        </p>

        <section style={sectionStyle}>
          <h2 style={h2}>1. Préambule</h2>
          <p style={p}>
            La présente Politique de confidentialité décrit comment KeyMatch collecte, utilise, conserve et protège
            les données personnelles des Utilisateurs de la plateforme accessible à l&apos;adresse <strong>keymatch-immo.fr</strong>.
            Elle s&apos;applique à toute personne inscrite ou simplement en visite sur le site.
          </p>
          <p style={p}>
            Nous nous engageons à traiter vos données dans le strict respect du Règlement (UE) 2016/679 « RGPD »
            et de la loi n° 78-17 du 6 janvier 1978 modifiée « Informatique et Libertés ».
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>2. Responsable du traitement</h2>
          <p style={p}>
            Le responsable du traitement des données personnelles collectées via la plateforme KeyMatch est la
            société éditrice dont les coordonnées figurent dans les{" "}
            <Link href="/mentions-legales" style={{ color: "#111", fontWeight: 700 }}>mentions légales</Link>.
          </p>
          <p style={p}>
            Pour toute question relative à vos données personnelles, contactez :{" "}
            <strong>contact@keymatch-immo.fr</strong>.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>3. Données collectées</h2>
          <p style={p}>Nous collectons et traitons les catégories de données suivantes :</p>
          <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
            <li style={li}><strong>Données d&apos;identification</strong> : nom, prénom, adresse email, mot de passe (stocké sous forme hachée bcrypt), photo de profil éventuelle.</li>
            <li style={li}><strong>Données de contact</strong> : numéro de téléphone (facultatif), adresse postale éventuelle.</li>
            <li style={li}><strong>Données du profil locataire</strong> : préférences de logement (ville, surface, budget, type de bien, équipements, DPE, meublé/non meublé, animaux, etc.).</li>
            <li style={li}><strong>Données du dossier locataire</strong> : situation professionnelle, revenus mensuels, type de contrat (CDI, CDD, etc.), présence d&apos;un garant, justificatifs téléversés (pièce d&apos;identité, bulletins de salaire, avis d&apos;imposition, quittances de loyer, RIB).</li>
            <li style={li}><strong>Données des annonces</strong> : photos, description, prix, charges, caution, surface, pièces, localisation (GPS précis ou zone approximative selon choix du propriétaire), équipements, DPE.</li>
            <li style={li}><strong>Données d&apos;interaction</strong> : messages échangés entre Utilisateurs, demandes de visite, favoris, candidatures, signalements.</li>
            <li style={li}><strong>Documents contractuels</strong> : baux, états des lieux, quittances de loyer générés via la Plateforme.</li>
            <li style={li}><strong>Données techniques</strong> : adresse IP, identifiants de session, journaux de connexion, horodatages, informations sur le navigateur et l&apos;appareil.</li>
            <li style={li}><strong>Cookies</strong> : voir la <Link href="/cookies" style={{ color: "#111", fontWeight: 700 }}>Politique cookies</Link>.</li>
          </ul>
          <p style={p}>
            Les champs obligatoires sont signalés lors de la collecte. Les autres sont facultatifs et permettent
            d&apos;améliorer la pertinence du service.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>4. Finalités du traitement</h2>
          <p style={p}>Vos données sont traitées pour les finalités suivantes :</p>
          <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
            <li style={li}>Créer, gérer et sécuriser votre Compte.</li>
            <li style={li}>Permettre la mise en relation entre Locataires et Propriétaires.</li>
            <li style={li}>Calculer le score de compatibilité entre votre profil et les annonces (algorithme interne, aucun profilage automatisé avec effet juridique au sens de l&apos;article 22 du RGPD).</li>
            <li style={li}>Faciliter la communication via la messagerie interne.</li>
            <li style={li}>Organiser et suivre les visites.</li>
            <li style={li}>Générer les documents contractuels (bail, état des lieux, quittances) au format PDF.</li>
            <li style={li}>Envoyer des notifications transactionnelles (nouveau message, visite confirmée, etc.).</li>
            <li style={li}>Assurer la sécurité de la Plateforme (prévention de la fraude, lutte contre les abus, investigation en cas d&apos;incident).</li>
            <li style={li}>Respecter nos obligations légales (conservation de certaines données, réponse aux autorités compétentes).</li>
            <li style={li}>Améliorer le service (mesures d&apos;audience agrégées, détection de bugs).</li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>5. Base légale</h2>
          <p style={p}>Chaque traitement repose sur l&apos;une des bases légales suivantes :</p>
          <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
            <li style={li}><strong>Exécution du contrat</strong> : gestion du Compte, fourniture du service, génération des documents contractuels.</li>
            <li style={li}><strong>Consentement</strong> : envoi de notifications non essentielles, dépôt de cookies non nécessaires, partage du dossier locataire par lien.</li>
            <li style={li}><strong>Intérêt légitime</strong> : sécurité de la Plateforme, prévention des fraudes, amélioration du service, modération.</li>
            <li style={li}><strong>Obligation légale</strong> : conservation de certaines données à des fins comptables, fiscales ou judiciaires.</li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>6. Destinataires des données</h2>
          <p style={p}>
            Vos données sont accessibles exclusivement aux personnes habilitées de l&apos;éditeur dans le strict cadre
            de leurs fonctions. <strong>Aucune donnée n&apos;est vendue à des tiers.</strong>
          </p>
          <p style={p}>
            Les informations de votre dossier locataire ne sont partagées qu&apos;avec les Propriétaires que vous avez
            contactés ou auxquels vous avez explicitement envoyé votre dossier via le lien de partage sécurisé.
          </p>
          <p style={p}>
            Certains sous-traitants techniques peuvent avoir accès aux données strictement nécessaires à la fourniture
            du service :
          </p>
          <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
            <li style={li}><strong>Vercel Inc.</strong> (hébergement applicatif) — États-Unis</li>
            <li style={li}><strong>Supabase</strong> (base de données, authentification, stockage de fichiers) — Union Européenne</li>
            <li style={li}><strong>Google</strong> (authentification OAuth pour les Utilisateurs connectés via Google) — États-Unis</li>
            <li style={li}><strong>Anthropic</strong> (services d&apos;IA, uniquement si vous utilisez l&apos;assistant conversationnel) — États-Unis</li>
          </ul>
          <p style={p}>
            Tous nos sous-traitants sont soumis à des engagements contractuels de confidentialité et de sécurité
            conformes au RGPD.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>7. Durée de conservation</h2>
          <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
            <li style={li}><strong>Compte actif</strong> : vos données sont conservées tant que vous utilisez le service.</li>
            <li style={li}><strong>Compte supprimé</strong> : les données personnelles sont effacées sous 30 jours, à l&apos;exception de celles devant être conservées pour des obligations légales (journaux de connexion : 12 mois ; données financières : 10 ans selon le Code de commerce).</li>
            <li style={li}><strong>Dossier locataire partagé</strong> : les tokens de partage expirent automatiquement après 7 jours.</li>
            <li style={li}><strong>Messages</strong> : conservés tant que les deux Utilisateurs concernés ont un Compte actif.</li>
            <li style={li}><strong>Signalements et données de modération</strong> : conservés 3 ans après traitement pour assurer un suivi.</li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>8. Sécurité</h2>
          <p style={p}>
            Nous mettons en œuvre les mesures techniques et organisationnelles appropriées pour protéger vos données :
          </p>
          <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
            <li style={li}>chiffrement des mots de passe (bcrypt, coût 12) ;</li>
            <li style={li}>connexions HTTPS chiffrées de bout en bout ;</li>
            <li style={li}>séparation des rôles et principe du moindre privilège sur les accès internes ;</li>
            <li style={li}>journalisation des accès et des opérations sensibles ;</li>
            <li style={li}>sauvegardes régulières de la base de données ;</li>
            <li style={li}>contrôle des uploads (types MIME, taille, validation serveur) ;</li>
            <li style={li}>tests automatisés pour les fonctions critiques (matching, tokens, dossiers).</li>
          </ul>
          <p style={p}>
            En cas de violation de données susceptible d&apos;engendrer un risque pour vos droits et libertés, nous nous
            engageons à notifier la CNIL dans les 72 heures et à vous en informer directement si l&apos;incident est
            significatif.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>9. Vos droits</h2>
          <p style={p}>Conformément au RGPD, vous disposez des droits suivants sur vos données :</p>
          <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
            <li style={li}><strong>Droit d&apos;accès</strong> : obtenir confirmation du traitement et une copie de vos données.</li>
            <li style={li}><strong>Droit de rectification</strong> : corriger vos données inexactes ou les compléter.</li>
            <li style={li}><strong>Droit à l&apos;effacement</strong> (« droit à l&apos;oubli ») : demander la suppression de vos données.</li>
            <li style={li}><strong>Droit à la limitation</strong> : restreindre le traitement dans certains cas (contestation, données obsolètes).</li>
            <li style={li}><strong>Droit à la portabilité</strong> : recevoir vos données dans un format structuré, couramment utilisé et lisible par machine.</li>
            <li style={li}><strong>Droit d&apos;opposition</strong> : vous opposer au traitement pour des motifs tenant à votre situation particulière.</li>
            <li style={li}><strong>Droit de retrait du consentement</strong> : à tout moment, pour les traitements fondés sur le consentement, sans remettre en cause la licéité des traitements effectués avant le retrait.</li>
            <li style={li}><strong>Droit de définir des directives post-mortem</strong> sur le sort de vos données après votre décès.</li>
          </ul>
          <p style={p}>
            Pour exercer ces droits, adressez votre demande accompagnée d&apos;un justificatif d&apos;identité à :{" "}
            <strong>contact@keymatch-immo.fr</strong>. Nous répondons dans un délai d&apos;un mois maximum.
          </p>
          <p style={p}>
            Vous disposez également du droit d&apos;introduire une réclamation auprès de la Commission Nationale de
            l&apos;Informatique et des Libertés (CNIL) :{" "}
            <a href="https://www.cnil.fr" style={{ color: "#111", fontWeight: 600 }}>www.cnil.fr</a>.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>10. Transferts hors Union Européenne</h2>
          <p style={p}>
            Certains sous-traitants (notamment Vercel, Google, Anthropic) peuvent être situés hors de l&apos;Union
            Européenne, principalement aux États-Unis. Ces transferts sont encadrés par les garanties appropriées
            prévues par le RGPD (décisions d&apos;adéquation de la Commission européenne, clauses contractuelles types,
            Data Privacy Framework). Nous vous fournissons sur demande une copie de ces garanties.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>11. Cookies</h2>
          <p style={p}>
            L&apos;utilisation des cookies est détaillée dans notre{" "}
            <Link href="/cookies" style={{ color: "#111", fontWeight: 700 }}>Politique cookies</Link>.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>12. Modification de la politique</h2>
          <p style={p}>
            La présente Politique de confidentialité peut être modifiée pour refléter les évolutions réglementaires ou
            du service. Toute modification substantielle fera l&apos;objet d&apos;une notification par email et d&apos;un
            affichage sur la Plateforme. La date de mise à jour est indiquée en haut du document.
          </p>
        </section>
      </div>
    </main>
  )
}
