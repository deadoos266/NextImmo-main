import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Mon dossier locataire",
  description: "Complétez votre dossier locataire et partagez-le par lien sécurisé.",
  robots: { index: false, follow: false },
}

export default function DossierLayout({ children }: { children: React.ReactNode }) {
  return children
}
