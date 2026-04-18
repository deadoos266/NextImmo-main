/**
 * POST /api/agent
 *
 * Corps : {
 *   message: string          — message de l'utilisateur
 *   sessionId?: string       — reprise de session (généré si absent)
 *   context?: object         — données additionnelles (annonce courante, etc.)
 *   showThinking?: boolean   — renvoie le raisonnement Opus (dev only)
 * }
 *
 * Sécurité :
 * - Auth requise via NextAuth (getServerSession)
 * - userEmail est LU depuis la session, jamais depuis le body (anti-usurpation)
 * - Rate limit en mémoire : 20 requêtes / 10 min par email authentifié
 */

import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import {
  getOrCreateSession,
  addMessage,
  toAnthropicHistory,
} from "@/lib/agentMemory"
import { runOpus } from "@/lib/agents/opusAgent"
import { runSonnet } from "@/lib/agents/sonnetAgent"
import { checkRateLimit, getClientIp } from "@/lib/rateLimit"

// Rate-limit double : par email (20/10min) ET par IP (30/10min) pour éviter
// qu'un attaquant multi-comptes cumule les requêtes LLM (coût Anthropic).
const EMAIL_LIMIT = { max: 20, windowMs: 10 * 60 * 1000 }
const IP_LIMIT = { max: 30, windowMs: 10 * 60 * 1000 }

export async function POST(req: NextRequest) {
  try {
    // ── Auth : exiger une session NextAuth ─────────────────────────────────
    const session = await getServerSession(authOptions)
    const userEmail = session?.user?.email?.toLowerCase()
    if (!userEmail) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 })
    }

    // ── Rate limit par email + IP (anti multi-comptes) ─────────────────────
    const rlEmail = checkRateLimit(`agent:email:${userEmail}`, EMAIL_LIMIT)
    if (!rlEmail.allowed) {
      return NextResponse.json(
        { error: "Trop de requêtes, réessayez plus tard" },
        { status: 429, headers: { "Retry-After": String(rlEmail.retryAfterSec ?? 60) } }
      )
    }
    const ip = getClientIp(req.headers)
    const rlIp = checkRateLimit(`agent:ip:${ip}`, IP_LIMIT)
    if (!rlIp.allowed) {
      return NextResponse.json(
        { error: "Trop de requêtes depuis cette adresse" },
        { status: 429, headers: { "Retry-After": String(rlIp.retryAfterSec ?? 60) } }
      )
    }

    const body = await req.json()
    const {
      message,
      sessionId: incomingSessionId,
      context,
      showThinking = false,
    } = body as {
      message?: string
      sessionId?: string
      context?: Record<string, unknown>
      showThinking?: boolean
    }

    if (!message?.trim()) {
      return NextResponse.json({ error: "message requis" }, { status: 400 })
    }

    if (message.length > 4000) {
      return NextResponse.json({ error: "message trop long (4000 caractères max)" }, { status: 400 })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "Configuration serveur incomplète" },
        { status: 500 }
      )
    }

    // ── Session agent ──────────────────────────────────────────────────────
    const sessionId = incomingSessionId ?? randomUUID()
    const agentSession = getOrCreateSession(sessionId, userEmail)
    const history = toAnthropicHistory(agentSession)

    // ── Étape 1 : Opus réfléchit et planifie ──────────────────────────────
    const opusPlan = await runOpus({
      userMessage: message,
      history,
      userEmail,
      extraContext: context,
    })

    // ── Étape 2 : Sonnet exécute le plan ──────────────────────────────────
    const { response, toolsUsed } = await runSonnet({
      userMessage: message,
      opusPlan: opusPlan.plan,
      history,
      userEmail,
    })

    // ── Sauvegarde en mémoire ─────────────────────────────────────────────
    addMessage(sessionId, "user", message)
    addMessage(sessionId, "assistant", response)

    // ── Réponse ───────────────────────────────────────────────────────────
    const result: Record<string, unknown> = {
      response,
      sessionId,
      intent: opusPlan.intent,
      toolsUsed,
    }

    // Le thinking Opus n'est exposé qu'en dev
    if (showThinking && process.env.NODE_ENV !== "production") {
      result.thinking = opusPlan.thinking
    }

    return NextResponse.json(result)
  } catch (err: unknown) {
    console.error("[/api/agent]", err)
    // Ne JAMAIS retourner err.message en prod (fuite d'infos)
    const isProd = process.env.NODE_ENV === "production"
    const errorMsg = isProd
      ? "Erreur interne"
      : err instanceof Error ? err.message : "Erreur interne"
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}

// ── GET /api/agent — healthcheck ─────────────────────────────────────────────
export async function GET() {
  return NextResponse.json({
    status: "ok",
    description: "NestMatch Agent API — Opus (planification) + Sonnet (exécution)",
    endpoints: {
      POST: "/api/agent (auth requise)",
      body: ["message", "sessionId?", "context?", "showThinking?"],
    },
  })
}
