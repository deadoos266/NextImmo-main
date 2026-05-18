/**
 * V97.39.34 — /agence/dashboard — Vue agrégée pour membres agence.
 *
 * Liste les agences de l'user (souvent 1), permet de switcher entre elles.
 * Pour chaque agence : nb annonces, lien vers settings + membres.
 */

import AgenceDashboardClient from "./AgenceDashboardClient"

export const metadata = {
  title: "Mon espace agence — KeyMatch",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default function DashboardPage() {
  return <AgenceDashboardClient />
}
