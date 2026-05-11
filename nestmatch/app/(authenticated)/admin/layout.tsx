import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../lib/auth"
import AdminSidebar from "../../components/admin/AdminSidebar"
import AdminBreadcrumb from "../../components/admin/AdminBreadcrumb"

/**
 * Layout admin V84.4 — sidebar + breadcrumb + main content area.
 *
 * Vérification is_admin côté SERVEUR (inchangé V70).
 *
 * Composition :
 *  - <AdminSidebar /> : nav latérale 240px sticky desktop, drawer mobile
 *  - <AdminBreadcrumb /> : fil d'Ariane dynamique pathname-based
 *  - children : la page admin elle-même
 *
 * Style : palette KeyMatch (#F7F4EF bg, hairline #EAE6DF, Fraunces italic titles).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    redirect("/auth")
  }
  if (!session.user.isAdmin) {
    redirect("/")
  }
  return (
    <div style={{
      display: "flex",
      minHeight: "100vh",
      background: "#F7F4EF",
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
    }}>
      <AdminSidebar />
      <main style={{
        flex: 1,
        minWidth: 0,
        padding: "24px 24px 64px",
      }}>
        <AdminBreadcrumb />
        {children}
      </main>
    </div>
  )
}
