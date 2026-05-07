import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Swiper les annonces",
  description: "Découvrez les annonces une par une, en mode rapide. Glissez à droite pour ajouter en favori, à gauche pour passer.",
  openGraph: {
    title: "Swipe les annonces — KeyMatch",
    description: "Mode swipe rapide pour découvrir les annonces qui vous correspondent.",
    type: "website",
  },
  alternates: { canonical: "/swipe" },
}

export default function SwipeLayout({ children }: { children: React.ReactNode }) {
  return children
}
