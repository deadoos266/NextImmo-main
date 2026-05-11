import type { Metadata } from "next"

// V81.30 — Layout serveur pour exporter metadata, le page.tsx est un
// Client Component ("use client") qui ne peut pas exporter metadata.
// Bug détecté audit E2E 2026-05-11.
export const metadata: Metadata = {
  title: "Mes quittances",
  description: "Historique de vos quittances de loyer reçues, téléchargeables au format PDF, signées par le propriétaire.",
  robots: { index: false, follow: false },
}

export default function MesQuittancesLayout({ children }: { children: React.ReactNode }) {
  return children
}
