import type { Metadata } from "next"

// V81.30 — Layout serveur pour exporter generateMetadata, le page.tsx est
// un Client Component ("use client") qui ne peut pas exporter metadata.
// Bug détecté audit E2E 2026-05-11 : title fallback root layout au lieu de
// "Notifications | KeyMatch".
export const metadata: Metadata = {
  title: "Notifications",
  description: "Vos notifications de messages, candidatures, visites et baux sur KeyMatch.",
  robots: { index: false, follow: false },
}

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return children
}
