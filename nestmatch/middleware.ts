import { getToken } from "next-auth/jwt"
import { NextRequest, NextResponse } from "next/server"

const PROTECTED_ROUTES = ["/profil", "/messages", "/dossier", "/visites", "/carnet"]
const PROPRIETAIRE_ROUTES = ["/proprietaire"]
const ADMIN_ROUTES = ["/admin"]

// Paths où on ne FORCE PAS le passage par /onboarding/identite même si
// l'identité n'est pas encore verrouillée : gate d'identité elle-même,
// routes NextAuth, route de verrouillage. /auth n'est pas listé car il
// n'est pas dans le matcher (accès libre de toute façon).
const IDENTITE_EXEMPT_PREFIXES = [
  "/onboarding/identite",
  "/api/auth",
  "/api/profil/identite",
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isProtected =
    PROTECTED_ROUTES.some(r => pathname === r || pathname.startsWith(r + "/")) ||
    PROPRIETAIRE_ROUTES.some(r => pathname === r || pathname.startsWith(r + "/")) ||
    ADMIN_ROUTES.some(r => pathname === r || pathname.startsWith(r + "/")) ||
    pathname.startsWith("/onboarding")

  if (!isProtected) return NextResponse.next()

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })

  if (!token) {
    const loginUrl = new URL("/auth", request.url)
    loginUrl.searchParams.set("callbackUrl", request.url)
    return NextResponse.redirect(loginUrl)
  }

  // Gate identité : user authentifié mais identité pas verrouillée →
  // redirect vers /onboarding/identite sauf si déjà sur cette page
  // (anti-boucle) ou sur une route exempte.
  const isExempt = IDENTITE_EXEMPT_PREFIXES.some(p => pathname.startsWith(p))
  if (!isExempt && token.identiteVerrouillee !== true) {
    const url = new URL("/onboarding/identite", request.url)
    url.searchParams.set("callbackUrl", request.url)
    return NextResponse.redirect(url)
  }

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
    "/onboarding/:path*",
  ],
}
