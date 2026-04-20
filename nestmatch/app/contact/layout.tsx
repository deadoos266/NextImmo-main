import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Nous contacter",
  description: "Une question, un problème ? Contactez l'équipe KeyMatch. Nous répondons sous 48h ouvrées.",
  openGraph: {
    title: "Nous contacter — KeyMatch",
    description: "Une question, un problème ? Contactez l'équipe KeyMatch.",
    type: "website",
  },
  alternates: { canonical: "/contact" },
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children
}
