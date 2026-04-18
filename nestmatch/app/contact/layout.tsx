import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Nous contacter",
  description: "Une question, un problème ? Contactez l'équipe NestMatch. Nous répondons sous 48h ouvrées.",
  openGraph: {
    title: "Nous contacter — NestMatch",
    description: "Une question, un problème ? Contactez l'équipe NestMatch.",
    type: "website",
  },
  alternates: { canonical: "/contact" },
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children
}
