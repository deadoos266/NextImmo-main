/**
 * V97.39.34 — /admin/erreurs
 *
 * Dashboard des erreurs runtime captées par GlitchTip self-host.
 * Bouton "Copier markdown" pour coller directement à Claude.
 */

import ErreursClient from "./ErreursClient"

export const metadata = {
  title: "Erreurs runtime — KeyMatch",
  description: "Erreurs JavaScript / serveur captées par GlitchTip self-host.",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default function ErreursPage() {
  return <ErreursClient />
}
