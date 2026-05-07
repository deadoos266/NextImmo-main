import ComparerClient from "./ComparerClient"

/**
 * /annonces/comparer?ids=1,2,3 — page dédiée comparaison côte-à-côte
 * (R10.2c). 2 à 3 annonces max. URL-driven pour partage/bookmark.
 *
 * Server wrapper : lit ids depuis searchParams, délègue au client.
 * force-dynamic car les annonces peuvent changer (dispo, photos…).
 */
export const dynamic = "force-dynamic"

export default async function ComparerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const raw = sp.ids
  const idsStr = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "")
  const ids = idsStr
    .split(",")
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isFinite(n) && n > 0)
    .slice(0, 3)
  return <ComparerClient ids={ids} />
}
