import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Quartiers recommandés",
  description: "Découvrez les villes qui matchent le mieux avec votre dossier locataire.",
  robots: { index: false, follow: false },
}

export default function RecommandationsLayout({ children }: { children: React.ReactNode }) {
  return children
}
