import AnnoncesClient from "./AnnoncesClient"

/**
 * Server component pour /annonces.
 *
 * Clé du fix React #418 :
 *   - `export const dynamic = "force-dynamic"` → Next rend cette route à
 *     chaque requête, pas de pré-build statique.
 *   - `searchParams` est reçu en prop du server component (Next 15 API :
 *     c'est une Promise qu'on await) et passé au client component.
 *   - AnnoncesClient n'utilise PLUS `useSearchParams()` → aucun Suspense
 *     boundary qui bail out au SSR → aucun template BAILOUT_TO_CLIENT_-
 *     SIDE_RENDERING émis → aucun #418 à l'hydratation.
 *
 * Trade-off : les changements d'URL post-mount (filtres chip, bouton
 * Effacer) restent gérés côté client via `router.replace()` mais ne
 * re-fetchent pas via useSearchParams. La source de vérité post-mount
 * est le state local du composant. Si l'user clique "back" dans le
 * navigateur, l'URL change mais le state ne se resync pas automatique-
 * ment ; c'est un trade-off acceptable contre #418.
 */
export const dynamic = "force-dynamic"

export default async function AnnoncesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  return <AnnoncesClient initialSearchParams={params} />
}
