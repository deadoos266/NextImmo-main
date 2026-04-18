import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth"
import { BRAND } from "@/lib/brand"

export const metadata: Metadata = {
  title: "Paramètres",
  description: `Gérez votre compte ${BRAND.name} : profil, apparence, sécurité, notifications.`,
  robots: { index: false, follow: false },
}

export default async function ParametresLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) redirect("/auth?callbackUrl=/parametres")
  return <>{children}</>
}
