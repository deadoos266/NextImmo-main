import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Créer mon profil — KeyMatch",
  description: "Configurez pas à pas vos critères de recherche et votre dossier locataire.",
  robots: { index: false, follow: false },
}

export default function CreerProfilLayout({ children }: { children: React.ReactNode }) {
  return children
}
