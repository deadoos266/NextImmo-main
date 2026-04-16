import { getToken } from "next-auth/jwt"
import { NextRequest, NextResponse } from "next/server"

const PROTECTED_ROUTES = ["/profil", "/messages", "/dossier", "/visites", "/carnet"]
const PROPRIETAIRE_ROUTES = ["/proprietaire"]
const ADMIN_ROUTES = ["/admin"]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isProtected =
    PROTECTED_ROUTES.some(r => pathname === r || pathname.startsWith(r + "/")) ||
    PROPRIETAIRE_ROUTES.some(r => pathname === r || pathname.startsWith(r + "/")) ||
    ADMIN_ROUTES.some(r => pathname === r || pathname.startsWith(r + "/"))

  if (!isProtected) return NextResponse.next()

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })

  if (!token) {
    const loginUrl = new URL("/auth", request.url)
    loginUrl.searchParams.set("callbackUrl", request.url)
    return NextResponse.redirect(loginUrl)
  }

  // Admin routes require is_admin flag in the JWT
  if (ADMIN_ROUTES.some(r => pathname === r || pathname.startsWith(r + "/"))) {
    if (!token.isAdmin) {
      return NextResponse.redirect(new URL("/", request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/profil/:path*",
    "/messages/:path*",
    "/dossier/:path*",
    "/visites/:path*",
    "/carnet/:path*",
    "/proprietaire/:path*",
    "/admin/:path*",
  ],
}
