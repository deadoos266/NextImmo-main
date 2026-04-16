import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Annonces — Logements à louer entre particuliers",
  description: "Parcourez les annonces de location entre particuliers. Filtrez par ville, budget, surface. Score de compatibilité personnalisé. Zéro frais d'agence.",
  openGraph: {
    title: "Annonces — Logements à louer entre particuliers",
    description: "Parcourez les annonces de location entre particuliers. Score de compatibilité personnalisé. Zéro frais d'agence.",
    type: "website",
  },
  alternates: {
    canonical: "/annonces",
  },
}

export default function AnnoncesLayout({ children }: { children: React.ReactNode }) {
  return children
}
