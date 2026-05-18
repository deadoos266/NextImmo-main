/**
 * V97.39.34 — /agence/dashboard/[id]/api-keys
 */

import ApiKeysClient from "./ApiKeysClient"

export const metadata = {
  title: "Clés API — KeyMatch agence",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function ApiKeysPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ApiKeysClient agenceId={id} />
}
