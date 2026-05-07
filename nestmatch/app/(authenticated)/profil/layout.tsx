import type { Metadata } from "next"

export const metadata: Metadata = {
  // V9.0 (Paul 2026-04-28) — rename "Mon profil" → "Mon espace" pour matcher
  // l'identite "Mon espace locataire / Mon espace propriétaire" choisie par
  // le user. Le titre dynamique cote client adapte selon le role (cf. page.tsx).
  title: "Mon espace",
  description: "Vos critères de recherche et paramètres de matching.",
  robots: { index: false, follow: false },
}

export default function ProfilLayout({ children }: { children: React.ReactNode }) {
  return children
}
