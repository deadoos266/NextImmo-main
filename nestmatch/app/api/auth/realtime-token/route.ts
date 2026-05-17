/**
 * V97.39.21 P3 Phase 4 — POST /api/auth/realtime-token
 *
 * Fournit un JWT signé HS256 avec NEXTAUTH_SECRET au client React pour
 * authentifier sa connexion socket.io vers tools/realtime-vps.
 *
 * Auth : NextAuth session valide.
 *
 * Le service tools/realtime-vps vérifie ce JWT côté serveur avec le même
 * NEXTAUTH_SECRET. On utilise le JWT NextAuth existant si on peut le lire,
 * sinon on en émet un nouveau dédié (TTL court).
 *
 * Sécurité :
 *   - TTL 1h (renouvelé automatiquement par le client à chaque reconnexion)
 *   - payload minimal : { email, isAdmin }
 *   - signature HS256 avec NEXTAUTH_SECRET (jamais exposé client-side)
 */

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) {
    console.error("[realtime-token] NEXTAUTH_SECRET manquant")
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 })
  }

  // V97.39.21 — pas de dep jsonwebtoken, on utilise le helper builtin Node
  // crypto pour signer HS256. Format JWT classique : header.payload.signature
  const header = { alg: "HS256", typ: "JWT" }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    email: session.user.email.toLowerCase(),
    isAdmin: !!session.user.isAdmin,
    iat: now,
    exp: now + 3600, // 1h
  }

  const encode = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url")

  const headerEnc = encode(header)
  const payloadEnc = encode(payload)
  const data = `${headerEnc}.${payloadEnc}`

  // HMAC-SHA256
  const { createHmac } = await import("node:crypto")
  const signature = createHmac("sha256", secret).update(data).digest("base64url")

  const token = `${data}.${signature}`

  return NextResponse.json({ token, exp: payload.exp })
}
