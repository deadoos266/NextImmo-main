/**
 * V97.39.34 — /agence/dashboard/[id]/webhooks — Gestion webhooks agence
 */

import WebhooksClient from "./WebhooksClient"

export const metadata = {
  title: "Webhooks — KeyMatch agence",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function WebhooksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <WebhooksClient agenceId={id} />
}
