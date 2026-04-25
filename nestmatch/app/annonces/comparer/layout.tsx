import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Comparer les annonces",
  description: "Comparez jusqu'à 3 logements côte à côte : loyer, surface, équipements, score de compatibilité.",
  openGraph: {
    title: "Comparer les annonces — KeyMatch",
    description: "Comparez jusqu'à 3 logements côte à côte sur KeyMatch.",
    type: "website",
  },
  alternates: { canonical: "/annonces/comparer" },
  // Page d'outil interne (pas un contenu indexable autonome)
  robots: { index: false, follow: true },
}

export default function ComparerLayout({ children }: { children: React.ReactNode }) {
  return children
}
