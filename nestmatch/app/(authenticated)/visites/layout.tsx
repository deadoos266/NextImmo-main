import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Mes visites",
  description: "Gérez vos demandes et confirmations de visite.",
  robots: { index: false, follow: false },
}

export default function VisitesLayout({ children }: { children: React.ReactNode }) {
  return children
}
