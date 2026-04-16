/**
 * POST /api/agent
 *
 * Corps : {
 *   message: string          — message de l'utilisateur
 *   sessionId?: string       — reprise de session (généré si absent)
 *   userEmail?: string       — email de l'utilisateur connecté
 *   context?: object         — données additionnelles (annonce courante, etc.)
 *   showThinking?: boolean   — renvoie le raisonnement Opus (dev only)
 * }
 *
 * Réponse : {
 *   response: string         — réponse finale de Sonnet
 *   sessionId: string        — à stocker côté client
 *   intent: string           — intention détectée par Opus
 *   toolsUsed: string[]      — tools Sonnet appelés
 *   thinking?: string        — raisonnement Opus (si showThinking=true)
 * }
 */

import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import {
  getOrCreateSession,
  addMessage,
  toAnthropicHistory,
} from "@/lib/agentMemory"
import { runOpus } from "@/lib/agents/opusAgent"
import { runSonnet } from "@/lib/agents/sonnetAgent"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      message,
      sessionId: incomingSessionId,
      userEmail,
      context,
      showThinking = false,
    } = body as {
      message?: string
      sessionId?: string
      userEmail?: string
      context?: Record<string, unknown>
      showThinking?: boolean
    }

    if (!message?.trim()) {
      return NextResponse.json({ error: "message requis" }, { status: 400 })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY manquante dans .env.local" },
        { status: 500 }
      )
    }

    // ── Session ────────────────────────────────────────────────────────────
    const sessionId = incomingSessionId ?? randomUUID()
    const session = getOrCreateSession(sessionId, userEmail)
    const history = toAnthropicHistory(session)

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

    // Le thinking Opus n'est exposé qu'en dev ou si explicitement demandé
    if (showThinking && process.env.NODE_ENV !== "production") {
      result.thinking = opusPlan.thinking
    }

    return NextResponse.json(result)
  } catch (err: unknown) {
    console.error("[/api/agent]", err)
    const message =
      err instanceof Error ? err.message : "Erreur interne"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ── GET /api/agent — healthcheck ─────────────────────────────────────────────
export async function GET() {
  return NextResponse.json({
    status: "ok",
    description: "NestMatch Agent API — Opus (planification) + Sonnet (exécution)",
    endpoints: {
      POST: "/api/agent",
      body: ["message", "sessionId?", "userEmail?", "context?", "showThinking?"],
    },
  })
}
