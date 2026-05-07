import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Mon espace propriétaire",
  description: "Gérez vos biens, candidats, visites et loyers depuis votre dashboard KeyMatch.",
  robots: { index: false, follow: false },
}

export default function ProprietaireLayout({ children }: { children: React.ReactNode }) {
  return children
}
