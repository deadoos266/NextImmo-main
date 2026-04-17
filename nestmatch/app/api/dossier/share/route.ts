import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { generateDossierToken } from "@/lib/dossierToken"

/**
 * POST /api/dossier/share
 * Génère un token de partage du dossier de l'utilisateur connecté.
 * Retourne une URL absolue qui donne accès en lecture seule à son dossier
 * pendant 7 jours.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ success: false, error: "Authentification requise" }, { status: 401 })
  }

  let days = 7
  try {
    const body = await req.json().catch(() => ({}))
    if (typeof body?.days === "number" && body.days >= 1 && body.days <= 30) days = body.days
  } catch { /* noop */ }

  const token = generateDossierToken(email, days)
  const base = process.env.NEXT_PUBLIC_URL || `https://${req.headers.get("host")}`
  const url = `${base}/dossier-partage/${token}`

  return NextResponse.json({
    success: true,
    token,
    url,
    expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
  })
}
