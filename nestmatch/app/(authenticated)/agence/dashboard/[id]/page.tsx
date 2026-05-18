/**
 * V97.39.34 — /agence/dashboard/[id] — Gestion d'une agence (settings + membres)
 */

import AgenceManageClient from "./AgenceManageClient"

export const metadata = {
  title: "Gérer mon agence — KeyMatch",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function AgenceManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AgenceManageClient agenceId={id} />
}
