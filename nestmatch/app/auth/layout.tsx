import type { Metadata } from "next"
import { BRAND } from "../../lib/brand"

export const metadata: Metadata = {
  title: "Connexion / Inscription",
  description: `Connectez-vous à ${BRAND.name} ou créez votre compte locataire ou propriétaire.`,
  robots: { index: false, follow: false },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
