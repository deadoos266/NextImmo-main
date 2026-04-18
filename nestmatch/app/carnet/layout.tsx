import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Carnet d'entretien",
  description: "Historique des travaux et interventions sur vos biens.",
  robots: { index: false, follow: false },
}

export default function CarnetLayout({ children }: { children: React.ReactNode }) {
  return children
}
