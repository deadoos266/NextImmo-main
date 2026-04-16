/**
 * Agent Opus — Planificateur avec extended thinking
 *
 * Rôle : analyser la demande, raisonner en profondeur sur le contexte NestMatch,
 * et produire un plan structuré que Sonnet va exécuter.
 */

import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface OpusPlan {
  thinking: string         // le raisonnement interne (non montré à l'user)
  plan: string             // instructions pour Sonnet
  intent: string           // résumé de l'intention détectée
  requiredTools: string[]  // tools Sonnet devrait utiliser
}

const OPUS_SYSTEM = `Tu es le cerveau stratégique de NestMatch, une plateforme de location immobilière française.

NestMatch met en relation locataires et propriétaires via un algorithme de matching sur 1000 points.
Tables clés : profils (critères locataires), annonces (biens), messages, loyers.

Ton rôle :
1. Analyser en profondeur la demande de l'utilisateur
2. Identifier l'intention (recherche de bien, optimisation profil, question juridique, stats...)
3. Planifier comment Sonnet doit répondre et quels outils utiliser
4. Anticiper les cas limites et contraintes

Sois précis et structuré. Ton plan sera lu par un autre LLM (Sonnet) qui l'exécutera.`

export async function runOpus(params: {
  userMessage: string
  history: { role: "user" | "assistant"; content: string }[]
  userEmail?: string
  extraContext?: Record<string, unknown>
}): Promise<OpusPlan> {
  const { userMessage, history, userEmail, extraContext } = params

  // Contexte additionnel injecté dans le message user
  const contextBlock = extraContext
    ? `\n\n<context>${JSON.stringify(extraContext, null, 2)}</context>`
    : ""

  const userBlock = userEmail ? `[Utilisateur : ${userEmail}]` : "[Utilisateur non connecté]"

  const messages: Anthropic.MessageParam[] = [
    // Historique de la session
    ...history.slice(-6), // On limite à 6 tours pour le budget tokens
    {
      role: "user",
      content: `${userBlock}\n\nDemande : ${userMessage}${contextBlock}\n\nProduis un plan JSON structuré pour guider l'agent Sonnet.`,
    },
  ]

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 16000,
    thinking: {
      type: "enabled",
      budget_tokens: 10000, // Opus réfléchit jusqu'à 10k tokens
    },
    system: OPUS_SYSTEM,
    messages,
  })

  // Extrait le thinking et le texte
  let thinkingContent = ""
  let textContent = ""

  for (const block of response.content) {
    if (block.type === "thinking") {
      thinkingContent = block.thinking
    } else if (block.type === "text") {
      textContent = block.text
    }
  }

  // Parse le JSON du plan (Opus est invité à répondre en JSON)
  try {
    const jsonMatch = textContent.match(/```json\s*([\s\S]*?)\s*```/) ||
                      textContent.match(/\{[\s\S]*\}/)
    const raw = jsonMatch ? (jsonMatch[1] ?? jsonMatch[0]) : textContent
    const parsed = JSON.parse(raw)
    return {
      thinking: thinkingContent,
      plan: parsed.plan ?? textContent,
      intent: parsed.intent ?? "inconnu",
      requiredTools: parsed.requiredTools ?? [],
    }
  } catch {
    // Fallback si Opus n'a pas produit de JSON valide
    return {
      thinking: thinkingContent,
      plan: textContent,
      intent: "général",
      requiredTools: [],
    }
  }
}
