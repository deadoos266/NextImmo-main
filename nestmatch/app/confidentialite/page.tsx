import Link from "next/link"

export const metadata = {
  title: "Politique de confidentialité",
  description: "Politique de confidentialité et traitement des données personnelles sur NestMatch.",
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
          Dernière mise à jour : [à compléter]
        </p>

        <section style={sectionStyle}>
          <h2 style={h2}>1. Responsable du traitement</h2>
          <p style={p}>
            Le responsable du traitement des données personnelles collectées via la plateforme NestMatch est [raison sociale — à compléter], dont les coordonnées figurent dans les <Link href="/mentions-legales" style={{ color: "#111", fontWeight: 700 }}>mentions légales</Link>.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>2. Données collectées</h2>
          <p style={p}>Nous collectons les catégories de données suivantes :</p>
          <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
            <li style={li}><strong>Données d&apos;identification</strong> : nom, prénom, adresse email, mot de passe (haché), téléphone.</li>
            <li style={li}><strong>Données du dossier locataire</strong> : situation professionnelle, revenus, garant, justificatifs (pièce d&apos;identité, bulletins de salaire, avis d&apos;imposition, etc.).</li>
            <li style={li}><strong>Données des annonces</strong> : photos, description, prix, localisation, équipements.</li>
            <li style={li}><strong>Données de messagerie</strong> : contenu des messages échangés entre utilisateurs.</li>
            <li style={li}><strong>Données de connexion</strong> : adresse IP, journaux techniques, cookies (voir <Link href="/cookies" style={{ color: "#111", fontWeight: 700 }}>politique cookies</Link>).</li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>3. Finalités du traitement</h2>
          <p style={p}>Vos données sont traitées pour :</p>
          <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
            <li style={li}>Fournir le service de mise en relation entre locataires et propriétaires.</li>
            <li style={li}>Gérer votre compte utilisateur.</li>
            <li style={li}>Calculer le score de compatibilité entre votre profil et les annonces.</li>
            <li style={li}>Faciliter la communication via la messagerie interne.</li>
            <li style={li}>Générer les documents contractuels (bail, état des lieux, quittances).</li>
            <li style={li}>Améliorer le service et la sécurité de la plateforme.</li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>4. Base légale</h2>
          <p style={p}>
            Le traitement de vos données repose sur votre consentement explicite lors de la création du compte, et sur l&apos;exécution du contrat d&apos;utilisation du service (CGU). Certains traitements peuvent également reposer sur l&apos;intérêt légitime de l&apos;éditeur (sécurité, prévention de la fraude).
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>5. Destinataires des données</h2>
          <p style={p}>
            Vos données sont accessibles exclusivement aux personnes habilitées de NestMatch. Les informations de votre dossier locataire ne sont partagées qu&apos;avec les propriétaires que vous contactez explicitement. Aucune donnée n&apos;est vendue à des tiers.
          </p>
          <p style={p}>
            Certains sous-traitants techniques peuvent avoir accès aux données strictement nécessaires à la fourniture du service (hébergement, envoi d&apos;emails, authentification). Ils sont soumis à des obligations contractuelles strictes de confidentialité.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>6. Durée de conservation</h2>
          <p style={p}>
            Vos données sont conservées tant que votre compte est actif. En cas de suppression du compte, les données sont effacées sous un délai raisonnable, à l&apos;exception de celles devant être conservées pour des obligations légales (facturation, archivage).
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>7. Sécurité</h2>
          <p style={p}>
            NestMatch met en œuvre des mesures techniques et organisationnelles pour protéger vos données : chiffrement des mots de passe, connexions HTTPS, contrôle d&apos;accès, journalisation, sauvegardes.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>8. Vos droits (RGPD)</h2>
          <p style={p}>Conformément au RGPD, vous disposez des droits suivants :</p>
          <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
            <li style={li}><strong>Droit d&apos;accès</strong> : obtenir une copie de vos données.</li>
            <li style={li}><strong>Droit de rectification</strong> : corriger des données inexactes.</li>
            <li style={li}><strong>Droit à l&apos;effacement</strong> : demander la suppression de vos données (« droit à l&apos;oubli »).</li>
            <li style={li}><strong>Droit à la limitation</strong> : restreindre le traitement de vos données.</li>
            <li style={li}><strong>Droit à la portabilité</strong> : recevoir vos données dans un format structuré.</li>
            <li style={li}><strong>Droit d&apos;opposition</strong> : vous opposer au traitement pour des motifs légitimes.</li>
            <li style={li}><strong>Droit de retrait du consentement</strong> : à tout moment, sans affecter la licéité des traitements antérieurs.</li>
          </ul>
          <p style={p}>
            Pour exercer ces droits, écrivez à [contact@nestmatch.fr — à compléter]. Vous disposez également du droit d&apos;introduire une réclamation auprès de la CNIL (<a href="https://www.cnil.fr" style={{ color: "#111", fontWeight: 600 }}>www.cnil.fr</a>).
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>9. Transferts hors UE</h2>
          <p style={p}>
            Certains sous-traitants peuvent être situés hors de l&apos;Union Européenne. Ces transferts sont encadrés par des garanties appropriées (clauses contractuelles types, décisions d&apos;adéquation).
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2}>10. Modifications</h2>
          <p style={p}>
            La présente politique peut être mise à jour. Les utilisateurs seront informés des modifications substantielles par email ou via une notification sur la plateforme.
          </p>
        </section>

        <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 28 }}>
          Ce document est un modèle à personnaliser par le responsable légal avant publication officielle.
        </p>
      </div>
    </main>
  )
}
