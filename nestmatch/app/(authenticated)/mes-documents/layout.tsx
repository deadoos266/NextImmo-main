import type { Metadata } from "next"

// V81.30 — Layout serveur pour exporter metadata, le page.tsx est un
// Client Component ("use client") qui ne peut pas exporter metadata.
// Bug détecté audit E2E 2026-05-11.
export const metadata: Metadata = {
  title: "Mes documents",
  description: "Toute la chaîne de votre location au même endroit : dossier locataire, bail signé, états des lieux, quittances. Conservés même après la fin du bail.",
  robots: { index: false, follow: false },
}

export default function MesDocumentsLayout({ children }: { children: React.ReactNode }) {
  return children
}
