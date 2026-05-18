/**
 * V97.39.34 — /admin/agences — Validation manuelle des agences inscrites.
 */

import AgencesAdminClient from "./AgencesAdminClient"

export const metadata = {
  title: "Agences admin — KeyMatch",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default function AgencesAdminPage() {
  return <AgencesAdminClient />
}
