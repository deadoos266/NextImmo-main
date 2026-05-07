import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Estimateur de budget locataire — Quel loyer pour mes revenus ?",
  description: "Calculez votre budget loyer idéal selon la règle des 3× revenus. Outil gratuit, instantané, sans inscription.",
  keywords: ["budget loyer", "calculer loyer maximum", "règle 3 revenus", "capacité location"],
  openGraph: {
    title: "Estimateur de budget locataire — KeyMatch",
    description: "Calculez votre budget loyer idéal selon la règle des 3× revenus.",
    type: "website",
  },
  alternates: { canonical: "/estimateur" },
}

export default function EstimateurLayout({ children }: { children: React.ReactNode }) {
  return children
}
