import Link from "next/link"

/**
 * V97.36 P3-7 — /aide/import-annonce
 *
 * Page d'aide pour la feature import URL d'annonce. Explique en 3 étapes,
 * liste les sources supportées, FAQ sur les limitations.
 */

export const metadata = {
  title: "Importer ton annonce — Aide KeyMatch",
  description: "Comment importer une annonce depuis Leboncoin, SeLoger, PAP, Bien'ici ou Logic-immo en un clic.",
  robots: { index: false, follow: false },
}

const SOURCES = [
  { name: "Leboncoin", host: "leboncoin.fr", desc: "Annonces locations particuliers & agences. Extraction très complète (prix, surface, pièces, photos, DPE, équipements)." },
  { name: "SeLoger", host: "seloger.com", desc: "Locations professionnelles principalement. Extraction depuis Schema.org + état initial." },
  { name: "PAP", host: "pap.fr", desc: "Particulier à Particulier. Extraction best-effort, vérifie les champs après import." },
  { name: "Bien'ici", host: "bienici.com", desc: "Schema.org + données initiales pour titre, prix, surface, localisation." },
  { name: "Logic-immo", host: "logic-immo.com", desc: "Extraction limitée, surtout titre/description/prix." },
  { name: "Autres sites", host: "(générique)", desc: "On tente Open Graph + Schema.org. Quelques champs basiques — complète manuellement le reste." },
]

export default function AideImportAnnoncePage() {
  return (
    <main style={{
      minHeight: "60vh", background: "#F7F4EF",
      fontFamily: "'DM Sans', sans-serif",
      padding: "48px 16px",
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500&display=swap');`}</style>

      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link href="/proprietaire" style={{ fontSize: 11, color: "#8a8477", textDecoration: "none", textTransform: "uppercase", letterSpacing: "1.2px", fontWeight: 700 }}>
          ← Espace propriétaire
        </Link>

        <p style={{ fontSize: 10, fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "1.4px", margin: "22px 0 8px" }}>
          Aide
        </p>
        <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 40, color: "#111", margin: "0 0 12px", lineHeight: 1.1 }}>
          Importer ton annonce en 1 clic
        </h1>
        <p style={{ fontSize: 15, color: "#3f3c37", margin: "0 0 32px", lineHeight: 1.6 }}>
          Tu as déjà publié ton bien sur Leboncoin, SeLoger ou un autre site ? Inutile de tout re-saisir.
          Colle le lien dans le wizard de publication, on remplit le formulaire pour toi. Tu modifies ce qui doit l&apos;être et tu publies sur KeyMatch.
        </p>

        {/* Comment ça marche */}
        <section style={{ background: "#fff", border: "1px solid #EAE6DF", borderRadius: 20, padding: "28px", marginBottom: 20 }}>
          <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 24, color: "#111", margin: "0 0 18px", lineHeight: 1.2 }}>
            Comment ça marche
          </h2>
          <ol style={{ padding: "0 0 0 22px", margin: 0, color: "#111", fontSize: 14, lineHeight: 1.7 }}>
            <li style={{ marginBottom: 14 }}>
              <strong>Copie le lien de ton annonce</strong> depuis Leboncoin, SeLoger, etc. Tu trouves le lien dans la barre d&apos;adresse de ton navigateur quand tu es sur la page de ton annonce.
            </li>
            <li style={{ marginBottom: 14 }}>
              <strong>Va sur <Link href="/proprietaire/ajouter" style={{ color: "#1d4ed8", textDecoration: "none" }}>/proprietaire/ajouter</Link></strong> et colle le lien dans le bandeau bleu en haut de la page, puis clique <em>Importer</em>.
            </li>
            <li>
              <strong>Vérifie et complète</strong> les 7 étapes du wizard. Les champs déjà remplis sont indiqués dans le bandeau vert. Tu modifies tout ce que tu veux avant de publier.
            </li>
          </ol>
        </section>

        {/* Sources supportées */}
        <section style={{ background: "#fff", border: "1px solid #EAE6DF", borderRadius: 20, padding: "28px", marginBottom: 20 }}>
          <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 24, color: "#111", margin: "0 0 18px", lineHeight: 1.2 }}>
            Sites supportés
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {SOURCES.map(s => (
              <div key={s.name} style={{ paddingBottom: 12, borderBottom: "1px solid #F0EAE0" }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: 0 }}>
                  {s.name}
                  <span style={{ fontWeight: 400, color: "#8a8477", marginLeft: 8, fontSize: 12 }}>{s.host}</span>
                </p>
                <p style={{ fontSize: 13, color: "#3f3c37", margin: "4px 0 0", lineHeight: 1.55 }}>
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section style={{ background: "#fff", border: "1px solid #EAE6DF", borderRadius: 20, padding: "28px", marginBottom: 20 }}>
          <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 24, color: "#111", margin: "0 0 18px", lineHeight: 1.2 }}>
            Questions fréquentes
          </h2>

          <details style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #F0EAE0" }}>
            <summary style={{ fontSize: 14, fontWeight: 700, color: "#111", cursor: "pointer", listStyle: "none", outline: "none" }}>
              Pourquoi certains champs ne sont pas remplis ?
            </summary>
            <p style={{ fontSize: 13, color: "#3f3c37", margin: "10px 0 0", lineHeight: 1.6 }}>
              Tous les sites ne publient pas leurs annonces avec les mêmes données structurées. Certains exposent le prix, la surface et les photos via du JSON-LD propre (facile à lire), d&apos;autres seulement le titre et l&apos;image principale. Quand un champ manque, le wizard te demande de le saisir manuellement.
            </p>
          </details>

          <details style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #F0EAE0" }}>
            <summary style={{ fontSize: 14, fontWeight: 700, color: "#111", cursor: "pointer", listStyle: "none", outline: "none" }}>
              Et les photos ?
            </summary>
            <p style={{ fontSize: 13, color: "#3f3c37", margin: "10px 0 0", lineHeight: 1.6 }}>
              On détecte les URLs des photos sur le site source, mais on ne les héberge pas directement sur KeyMatch — elles resteraient hébergées chez Leboncoin/SeLoger et pourraient disparaître si tu retires ton annonce là-bas. Tu dois donc uploader les photos depuis ton ordinateur à l&apos;étape <em>Récit</em>. Le bandeau t&apos;indique combien on en a trouvées pour que tu saches lesquelles re-uploader.
            </p>
          </details>

          <details style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #F0EAE0" }}>
            <summary style={{ fontSize: 14, fontWeight: 700, color: "#111", cursor: "pointer", listStyle: "none", outline: "none" }}>
              Le DPE n&apos;est pas extrait, pourquoi ?
            </summary>
            <p style={{ fontSize: 13, color: "#3f3c37", margin: "10px 0 0", lineHeight: 1.6 }}>
              Le DPE est obligatoire sur les annonces immobilières mais sa présentation varie beaucoup d&apos;un site à l&apos;autre (graphique, texte caché, image générée). On essaie de le détecter via regex mais ce n&apos;est pas toujours fiable. Si le champ DPE n&apos;est pas pré-rempli, sélectionne-le manuellement à l&apos;étape <em>Dimensions</em>.
            </p>
          </details>

          <details style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #F0EAE0" }}>
            <summary style={{ fontSize: 14, fontWeight: 700, color: "#111", cursor: "pointer", listStyle: "none", outline: "none" }}>
              C&apos;est légal ?
            </summary>
            <p style={{ fontSize: 13, color: "#3f3c37", margin: "10px 0 0", lineHeight: 1.6 }}>
              Oui : tu importes <em>ta propre annonce</em>, que tu as toi-même publiée ailleurs. C&apos;est ton consentement à réutiliser tes données pour publier sur KeyMatch. L&apos;importeur ne lit qu&apos;une page à la fois, à ton initiative — pas de scraping en masse, pas d&apos;indexation, pas d&apos;usage commercial du contenu tiers. Notre user-agent est explicite et envoie vers cette page d&apos;aide.
            </p>
          </details>

          <details style={{ marginBottom: 14, paddingBottom: 14 }}>
            <summary style={{ fontSize: 14, fontWeight: 700, color: "#111", cursor: "pointer", listStyle: "none", outline: "none" }}>
              Quelles sont les limites d&apos;utilisation ?
            </summary>
            <p style={{ fontSize: 13, color: "#3f3c37", margin: "10px 0 0", lineHeight: 1.6 }}>
              10 imports par heure par utilisateur (largement suffisant pour publier ses biens). Au-delà tu vois un message &quot;réessaye dans 1h&quot;. Si tu as plus de 10 biens à migrer en une fois, contacte-nous.
            </p>
          </details>
        </section>

        <div style={{ display: "flex", justifyContent: "center", marginTop: 32 }}>
          <Link
            href="/proprietaire/ajouter"
            style={{
              background: "#1d4ed8", color: "#fff",
              border: "none", borderRadius: 999,
              padding: "12px 28px", fontSize: 13, fontWeight: 700,
              textDecoration: "none", textTransform: "uppercase",
              letterSpacing: "0.5px", fontFamily: "inherit",
            }}
          >
            Importer mon annonce →
          </Link>
        </div>
      </div>
    </main>
  )
}
