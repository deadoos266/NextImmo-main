/**
 * V97.39.34 — /agence/dashboard/[id]/import — Upload XML/CSV import
 */

import ImportClient from "./ImportClient"

export const metadata = {
  title: "Import bulk — KeyMatch agence",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ImportClient agenceId={id} />
}
