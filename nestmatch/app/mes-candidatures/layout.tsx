import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Mes candidatures",
  description: "Suivez l'avancement de vos candidatures locataires.",
  robots: { index: false, follow: false },
}

export default function MesCandidaturesLayout({ children }: { children: React.ReactNode }) {
  return children
}
