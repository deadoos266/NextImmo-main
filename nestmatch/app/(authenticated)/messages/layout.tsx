import type { Metadata } from "next"
import MessagesRouteSignal from "./MessagesRouteSignal"

export const metadata: Metadata = {
  title: "Messages",
  description: "Discutez avec propriétaires et locataires en direct.",
  robots: { index: false, follow: false },
}

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MessagesRouteSignal />
      {children}
    </>
  )
}
