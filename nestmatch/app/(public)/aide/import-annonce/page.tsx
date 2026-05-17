import Link from "next/link"

/**
 * V97.36 P3-7 — /aide/import-annonce
 *
 * Page d'aide pour la feature import URL d'annonce. Explique en 3 étapes,
 * liste les sources supportées, FAQ sur les limitations.
 */

export const metadata = {
  title: "Importer ton annonce — Aide KeyMatch",
  description: "Comment importer une annonce depuis PAP, Foncia, Orpi, Century 21, Laforêt, iAD France, Leboncoin, SeLoger, Bien'ici, etc.",
  robots: { index: false, follow: false },
}

type SourceStatus = "good" | "partial" | "blocked"
interface SourceItem { name: string; host: string; desc: string; status: SourceStatus }
const SOURCES: SourceItem[] = [
  // V97.37 — PAP fonctionne désormais via wreq-js (TLS fingerprint Firefox)
  // Test live confirmé : 7 fields extraits (titre, prix, surface, ville, code postal, 6-10 photos) sur URLs réelles
  { name: "PAP", host: "pap.fr", desc: "Cloudflare bypassé par TLS fingerprint Firefox (wreq-js). Test live : titre, loyer, surface, ville, code postal et photos extraits proprement.", status: "good" },

  // V97.38 — Agences immobilières FR sans protection anti-bot
  // V97.39.12 — Statuts ajustés après tests live de chaque parser (Foncia OK, Guy Hoquet OK avec fix entités, Laforêt OK avec fix og:image_N).
  { name: "Foncia", host: "foncia.com", desc: "JSON-LD apartment + OpenGraph. Extrait titre, prix, surface, pièces, ville, photo.", status: "good" },
  { name: "Orpi", host: "orpi.com", desc: "OpenGraph riche (titre + prix + surface dans og:title). Extraction via heuristiques.", status: "good" },
  { name: "iAD France", host: "iadfrance.fr", desc: "Nuxt.js + OpenGraph. Titre, prix, surface, pièces extraits.", status: "good" },
  { name: "Century 21", host: "century21.fr", desc: "OpenGraph (entités HTML décodées). Titre, prix, surface, ville extraits.", status: "good" },
  { name: "Guy Hoquet", host: "guy-hoquet.com", desc: "Le site est devenu full SPA JS (constaté 2026-05-17) : le HTML servi est une coquille vide de 22 KB sans og:tags ni JSON-LD. Extraction limitée. Bypass via service stealth possible.", status: "partial" },
  { name: "Laforêt", host: "laforet.com", desc: "OpenGraph riche avec 12 photos (pattern og:image_0..11 supporté V97.39.12).", status: "good" },
  // V97.39.12 — Sites partiels constatés en test live : ils retournent du HTML mais le contenu détail nécessite du JS ou auth, donc parseur tombe en fallback générique.
  { name: "ERA Immobilier", host: "eraimmobilier.com", desc: "Site en SPA Angular pure : le contenu annonce n'est pas dans le HTML statique. Extraction limitée au titre du site.", status: "partial" },
  { name: "Nestenn", host: "nestenn.com", desc: "Les annonces individuelles ne sont pas indexées publiquement. Seules les pages liste sont accessibles.", status: "partial" },
  { name: "Stéphane Plaza Immobilier", host: "stephaneplazaimmobilier.com", desc: "Fiches annonces probablement rendues côté client (JS). Extraction limitée.", status: "partial" },
  { name: "LocService", host: "locservice.fr", desc: "Modèle inversé (annonces locataires consultables seulement par proprios inscrits). Pas de fiche bien publique.", status: "partial" },
  { name: "Studapart", host: "studapart.com", desc: "Location étudiante. Fiches détail nécessitent un compte étudiant authentifié.", status: "partial" },
  { name: "ImmoJeune", host: "immojeune.com", desc: "Plateforme étudiante. Extraction partielle (résidences). Compte étudiant requis pour le détail individuel.", status: "partial" },

  // Sites avec DataDome — worker stealth déployé V97.39 mais ASN datacenter (OVH) bloque encore
  { name: "Leboncoin", host: "leboncoin.fr", desc: "DataDome (challenge JavaScript côté client). On tente via notre service d'extraction stealth, mais le succès dépend de la politique DataDome du moment — souvent en échec. Copie-colle manuellement reste fiable.", status: "blocked" },
  { name: "SeLoger", host: "seloger.com", desc: "Même protection DataDome que Leboncoin. Tentative via service stealth, succès rare en pratique. Copie-colle manuel recommandé.", status: "blocked" },
  { name: "Logic-immo", host: "logic-immo.com", desc: "Même protection DataDome. Tentative via service stealth, succès rare. Copie-colle manuel recommandé.", status: "blocked" },

  // Sites partiels
  { name: "Bien'ici", host: "bienici.com", desc: "Application 100 % JS (SPA) — seul le titre + image principale sont extraits sans navigation client.", status: "partial" },

  // Sites accessibles
  { name: "Autres agences locales", host: "(divers)", desc: "Beaucoup d'agences immobilières indépendantes utilisent Schema.org RealEstateListing. Extraction très propre (titre, prix, surface, photos) quand c'est le cas.", status: "good" },
  { name: "Autres sites publics", host: "(générique)", desc: "On tente Open Graph + Schema.org. Au minimum : titre + 1 photo. Le reste se complète manuellement.", status: "good" },
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
          <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 24, color: "#111", margin: "0 0 12px", lineHeight: 1.2 }}>
            Sites supportés et limitations
          </h2>
          <p style={{ fontSize: 13, color: "#666", margin: "0 0 18px", lineHeight: 1.55 }}>
            Tous les sites ne se laissent pas lire de la même façon. Voici l&apos;état actuel des sources testées :
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {SOURCES.map(s => {
              const badge = s.status === "good"
                ? { bg: "#dcfce7", color: "#166534", label: "Fiable" }
                : s.status === "partial"
                  ? { bg: "#fef3c7", color: "#92400e", label: "Partiel" }
                  : { bg: "#fee2e2", color: "#991b1b", label: "Bloqué côté serveur" }
              return (
                <div key={s.name} style={{ paddingBottom: 12, borderBottom: "1px solid #F0EAE0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: 0 }}>
                      {s.name}
                      <span style={{ fontWeight: 400, color: "#8a8477", marginLeft: 8, fontSize: 12 }}>{s.host}</span>
                    </p>
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: badge.color, background: badge.bg,
                      padding: "2px 10px", borderRadius: 999,
                      textTransform: "uppercase", letterSpacing: "0.5px",
                    }}>{badge.label}</span>
                  </div>
                  <p style={{ fontSize: 13, color: "#3f3c37", margin: "4px 0 0", lineHeight: 1.55 }}>
                    {s.desc}
                  </p>
                </div>
              )
            })}
          </div>
        </section>

        {/* Encadré honnêteté sur le scraping */}
        <section style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 20, padding: "20px 24px", marginBottom: 20 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#92400e", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Pourquoi Leboncoin, SeLoger et Logic-immo restent compliqués ?
          </p>
          <p style={{ fontSize: 13, color: "#78350f", margin: 0, lineHeight: 1.6 }}>
            Ces trois sites utilisent DataDome — une protection qui combine challenge JavaScript + analyse réseau (ASN, fingerprint TLS, comportement). On a déployé un <strong>service d&apos;extraction stealth</strong> dédié sur un serveur OVH avec un navigateur Chrome headless, mais DataDome classe les IPs des datacenters cloud (OVH, AWS, GCP) comme &quot;à risque&quot; et bloque malgré tout dans la majorité des cas.
            <br /><br />
            Pour PAP en revanche, on a intégré <strong>wreq-js</strong> (TLS fingerprint impersonation) qui simule Firefox et passe Cloudflare — l&apos;import marche très bien (titre, loyer, surface, ville et 6-10 photos extraits sur des fiches réelles). Les 12 réseaux d&apos;agences (Foncia, Orpi, Century 21, Laforêt, etc.) marchent aussi nativement via JSON-LD.
            <br /><br />
            Pour Leboncoin / SeLoger / Logic-immo : ouvre la page côté navigateur, copie le titre + la description + les chiffres clés, et colle-les dans le wizard. Les photos restent à uploader de toute façon (elles sont hébergées chez la source, KeyMatch ne peut pas y accéder en différé).
          </p>
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
