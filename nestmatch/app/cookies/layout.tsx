import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Politique cookies",
  description: "Comment KeyMatch utilise les cookies et comment configurer vos préférences.",
  alternates: { canonical: "/cookies" },
}

export default function CookiesLayout({ children }: { children: React.ReactNode }) {
  return children
}
