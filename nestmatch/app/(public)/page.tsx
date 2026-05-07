import HomeClient from "../components/home/HomeClient"
import { fetchFeaturedListings } from "../../lib/featuredListingsServer"
import { BRAND } from "../../lib/brand"

const BASE_URL = process.env.NEXT_PUBLIC_URL || BRAND.url

/**
 * Home KeyMatch — V71.2 RSC migration.
 *
 * Avant V71 : `app/page.tsx` était un Client Component complet → le HTML
 * envoyé aux crawlers (Googlebot, GPTBot, ClaudeBot, PerplexityBot) ne
 * contenait quasiment aucun contenu utile. Les value props et le hero
 * étaient injectés au runtime via React, donc invisibles tant que le JS
 * ne s'exécutait pas.
 *
 * Maintenant : la page est un Server Component qui :
 *   1. Fetche les annonces vedettes côté serveur via Supabase (cache ISR
 *      via `revalidate`).
 *   2. Injecte un JSON-LD `WebPage` + `ItemList` riche en SSR (visible aux
 *      crawlers IA-search dès le first byte).
 *   3. Délègue le rendu visuel/interactif à `HomeClient` qui reçoit les
 *      listings en props (donc rendus dès le premier paint, pas en effet
 *      différé).
 *
 * Les sous-composants Hero / LiveFeed / etc. restent client (animations,
 * useResponsive, useRouter…) — c'est OK : le HTML SSR émis par Next 15
 * inclut leur markup statique initial. Ce qu'on gagne, c'est :
 *   - Plus rapide au TTFB visible aux crawlers
 *   - JSON-LD ItemList avec les vraies annonces du moment (pas du cache stale)
 *   - Pas de flash "0 résultat" à l'hydration
 */

// ISR — la home est régénérée toutes les 5 min côté Vercel. Compromis entre
// fraîcheur des annonces vedettes et coût Vercel (cf. audit vercel-cost).
export const revalidate = 300

export default async function HomePage() {
  const listings = await fetchFeaturedListings(8)

  // JSON-LD WebPage + ItemList — visible aux IA-search dès le SSR.
  // Le schema Organization + WebSite global est déjà dans `app/layout.tsx`.
  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${BASE_URL}/#webpage`,
    url: BASE_URL,
    name: `${BRAND.name} — La location entre particuliers, sans agence`,
    description: BRAND.tagline,
    isPartOf: { "@id": `${BASE_URL}/#website` },
    inLanguage: "fr-FR",
    primaryImageOfPage: { "@type": "ImageObject", url: `${BASE_URL}/og-default.png` },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Accueil", item: BASE_URL },
      ],
    },
  }

  const itemListJsonLd = listings.length > 0 && {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Annonces vedettes KeyMatch",
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    numberOfItems: listings.length,
    itemListElement: listings.map((a, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      url: `${BASE_URL}/annonces/${a.id}`,
      name: a.titre || `Logement ${a.ville || "France"}`,
    })),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(webPageJsonLd).replace(/</g, "\\u003c"),
        }}
      />
      {itemListJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(itemListJsonLd).replace(/</g, "\\u003c"),
          }}
        />
      )}
      <HomeClient initialListings={listings} />
    </>
  )
}
