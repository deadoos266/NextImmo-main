import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Connexion / Inscription",
  description: "Connectez-vous à NestMatch ou créez votre compte locataire ou propriétaire.",
  robots: { index: false, follow: false },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
