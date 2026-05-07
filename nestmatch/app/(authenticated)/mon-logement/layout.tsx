import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Mon logement actuel",
  description: "Votre logement actuel, contact propriétaire, documents, entretien.",
  robots: { index: false, follow: false },
}

export default function MonLogementLayout({ children }: { children: React.ReactNode }) {
  return children
}
