import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Publier votre annonce",
  description: "Propriétaires : publiez gratuitement votre annonce sur KeyMatch. Zéro frais d'agence, locataires vérifiés, dossiers complets.",
  openGraph: {
    title: "Publier votre annonce — KeyMatch",
    description: "Publiez gratuitement votre annonce. Zéro frais d'agence, locataires vérifiés.",
    type: "website",
  },
  alternates: { canonical: "/publier" },
}

export default function PublierLayout({ children }: { children: React.ReactNode }) {
  return children
}
