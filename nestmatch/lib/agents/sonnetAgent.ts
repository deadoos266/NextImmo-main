/**
 * Agent Sonnet — Exécuteur
 *
 * Rôle : recevoir le plan d'Opus + la demande originale, utiliser les tools
 * KeyMatch disponibles, et produire la réponse finale pour l'utilisateur.
 */

import Anthropic from "@anthropic-ai/sdk"
import { supabase } from "@/lib/supabase"

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Définition des tools KeyMatch ──────────────────────────────────────────

const NESTMATCH_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_annonces",
    description: "Recherche des annonces KeyMatch selon des critères (ville, prix max, surface min, nb pièces, meublé...)",
    input_schema: {
      type: "object" as const,
      properties: {
        ville: { type: "string", description: "Ville recherchée" },
        prix_max: { type: "number", description: "Prix maximum en €" },
        surface_min: { type: "number", description: "Surface minimum en m²" },
        pieces_min: { type: "number", description: "Nombre de pièces minimum" },
        meuble: { type: "boolean", description: "Meublé ou non" },
        limit: { type: "number", description: "Nombre de résultats (défaut 5)" },
      },
      required: [],
    },
  },
  {
    name: "get_profil_locataire",
    description: "Récupère le profil et les critères de recherche d'un locataire",
    input_schema: {
      type: "object" as const,
      properties: {
        email: { type: "string", description: "Email du locataire" },
      },
      required: ["email"],
    },
  },
  {
    name: "get_annonce",
    description: "Récupère les détails complets d'une annonce par son ID",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "ID de l'annonce" },
      },
      required: ["id"],
    },
  },
  {
    name: "calculate_matching_score",
    description: "Calcule le score de compatibilité entre un profil locataire et une annonce",
    input_schema: {
      type: "object" as const,
      properties: {
        locataire_email: { type: "string" },
        annonce_id: { type: "number" },
      },
      required: ["locataire_email", "annonce_id"],
    },
  },
]

// ─── Exécution des tools ──────────────────────────────────────────────────────

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {

  try {
    switch (name) {
      case "search_annonces": {
        let query = supabase
          .from("annonces")
          .select("id, titre, ville, prix, surface, pieces, meuble, dpe, statut")
          .eq("statut", "disponible")

        if (input.ville) query = query.ilike("ville", `%${input.ville}%`)
        if (input.prix_max) query = query.lte("prix", input.prix_max)
        if (input.surface_min) query = query.gte("surface", input.surface_min)
        if (input.pieces_min) query = query.gte("pieces", input.pieces_min)
        if (input.meuble !== undefined) query = query.eq("meuble", input.meuble)

        const limit = (input.limit as number) ?? 5
        const { data, error } = await query.limit(limit)
        if (error) return `Erreur: ${error.message}`
        return JSON.stringify(data ?? [])
      }

      case "get_profil_locataire": {
        const { data, error } = await supabase
          .from("profils")
          .select("*")
          .eq("email", input.email)
          .single()
        if (error) return `Profil non trouvé pour ${input.email}`
        return JSON.stringify(data)
      }

      case "get_annonce": {
        const { data, error } = await supabase
          .from("annonces")
          .select("*")
          .eq("id", input.id)
          .single()
        if (error) return `Annonce ${input.id} non trouvée`
        return JSON.stringify(data)
      }

      case "calculate_matching_score": {
        // Import dynamique pour éviter les dépendances circulaires
        const { calculerScore } = await import("@/lib/matching")
        const { data: profil } = await supabase
          .from("profils")
          .select("*")
          .eq("email", input.locataire_email)
          .single()
        const { data: annonce } = await supabase
          .from("annonces")
          .select("*")
          .eq("id", input.annonce_id)
          .single()
        if (!profil || !annonce) return "Profil ou annonce introuvable"
        const score = calculerScore(profil, annonce)
        return JSON.stringify({
          score,
          pourcentage: Math.round(score / 10) + "%",
          label:
            score >= 900 ? "Excellent" :
            score >= 750 ? "Très bon" :
            score >= 600 ? "Bon" :
            score >= 400 ? "Moyen" : "Faible",
        })
      }

      default:
        return `Tool inconnu: ${name}`
    }
  } catch (err) {
    return `Erreur tool ${name}: ${String(err)}`
  }
}

// ─── Agent Sonnet principal ───────────────────────────────────────────────────

const SONNET_SYSTEM = `Tu es l'assistant KeyMatch, expert en immobilier locatif français.
Tu es précis, bienveillant et concis. Tu réponds en français.
Tu as accès à la base de données KeyMatch en temps réel via tes outils.
Utilise les outils quand c'est utile, mais ne les appelle pas inutilement.`

export interface SonnetResult {
  response: string
  toolsUsed: string[]
}

export async function runSonnet(params: {
  userMessage: string
  opusPlan: string
  history: { role: "user" | "assistant"; content: string }[]
  userEmail?: string
}): Promise<SonnetResult> {
  const { userMessage, opusPlan, history, userEmail } = params

  const systemWithPlan = `${SONNET_SYSTEM}

<plan_stratégique>
${opusPlan}
</plan_stratégique>
${userEmail ? `\nContexte : utilisateur connecté = ${userEmail}` : ""}`

  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-8),
    { role: "user", content: userMessage },
  ]

  const toolsUsed: string[] = []

  // Boucle agentic : Sonnet peut appeler plusieurs tools avant de répondre
  let response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemWithPlan,
    tools: NESTMATCH_TOOLS,
    messages,
  })

  // Tant que Sonnet veut utiliser des tools
  while (response.stop_reason === "tool_use") {
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    )

    // Exécute tous les tools en parallèle
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        toolsUsed.push(block.name)
        const result = await executeTool(block.name, block.input as Record<string, unknown>)
        return {
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: result,
        }
      })
    )

    // Renvoie les résultats à Sonnet
    messages.push({ role: "assistant", content: response.content })
    messages.push({ role: "user", content: toolResults })

    response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemWithPlan,
      tools: NESTMATCH_TOOLS,
      messages,
    })
  }

  // Extrait le texte final
  const finalText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")

  return { response: finalText, toolsUsed }
}
