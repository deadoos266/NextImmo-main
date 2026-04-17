import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "../../lib/auth"

/**
 * Layout admin : vérification is_admin côté SERVEUR.
 * Auparavant, la protection était côté client uniquement (facilement
 * contournable). Désormais, un utilisateur non-admin est redirigé côté
 * serveur avant même que la page ne se charge.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    redirect("/auth")
  }
  if (!session.user.isAdmin) {
    redirect("/")
  }
  return <>{children}</>
}
