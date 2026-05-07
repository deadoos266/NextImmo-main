import { MetadataRoute } from "next"
import { NO_INDEX } from "../lib/featureFlags"

const BASE_URL = process.env.NEXT_PUBLIC_URL || "https://keymatch-immo.fr"

// Flag de bêta — V71.0 : tant que `SITE_INDEXABLE` est false dans
// `lib/featureFlags.ts` OU `NEXT_PUBLIC_NOINDEX=true` côté Vercel, on
// renvoie `Disallow: /` pour TOUS les user-agents (Googlebot, Bingbot,
// GPTBot, ClaudeBot, PerplexityBot, etc.).

export default function robots(): MetadataRoute.Robots {
  if (NO_INDEX) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
    }
  }
  // V77.2 — quand SITE_INDEXABLE = true (post-launch officiel) :
  //  - User-agent: * → autorise pages publiques, bloque admin/auth/private
  //  - AI bots dédiés (GPTBot, ClaudeBot, PerplexityBot, Google-Extended,
  //    Bingbot/Yandex/Applebot ChatGPT-User) — mêmes règles + autorise
  //    /annonces et /location pour citations IA-search.
  //  - Bots non-listés : peuvent crawler le public (rule wildcard).
  // Audit AEO/GEO V72.5 dimension #3 : rendre KeyMatch citable par les
  // moteurs IA (ChatGPT, Perplexity, Google AI Overviews, Claude).
  const PUBLIC_PATHS = ["/", "/annonces", "/annonces/", "/location/", "/cgu", "/mentions-legales", "/confidentialite", "/cookies", "/status", "/plan-du-site"]
  const PRIVATE_PATHS = [
    "/admin",
    "/api/",
    "/profil",
    "/messages",
    "/visites",
    "/carnet",
    "/carnet-entretien",
    "/dossier",
    "/dossier-partage",
    "/favoris",
    "/proprietaire",
    "/recommandations",
    "/mes-candidatures",
    "/mes-quittances",
    "/mes-documents",
    "/onboarding",
    "/parametres",
    "/publier",
    "/edl",
    "/bail",
    "/bail-invitation",
    "/mon-logement",
    "/stats",
    "/auth",
    "/connexion",
    "/login",
    "/test",
    "/monitoring",
  ]

  const AI_BOTS = [
    "GPTBot",          // OpenAI ChatGPT crawler
    "ChatGPT-User",    // OpenAI on-demand quand user demande une URL
    "ClaudeBot",       // Anthropic Claude crawler (cf https://www.anthropic.com/news/claude-crawlers)
    "anthropic-ai",    // Anthropic legacy header
    "PerplexityBot",   // Perplexity AI search
    "Google-Extended", // opt-in Bard/Gemini training
    "Applebot-Extended", // opt-in Apple Intelligence training
    "Bytespider",      // ByteDance / TikTok AI
    "CCBot",           // Common Crawl (utilisé par OpenAI/Anthropic)
    "Diffbot",         // Diffbot AI
    "FacebookBot",     // Meta AI training
  ]

  return {
    rules: [
      // Wildcard : règles pour tous bots non-listés ci-dessous (Googlebot,
      // Bingbot, etc.).
      {
        userAgent: "*",
        allow: PUBLIC_PATHS,
        disallow: PRIVATE_PATHS,
      },
      // AI bots : mêmes règles d'autorisation/blocage. Présence explicite
      // pour signaler l'opt-in à l'indexation IA (vs disallow par défaut
      // qu'on aurait pu choisir si KeyMatch ne voulait pas être cité).
      {
        userAgent: AI_BOTS,
        allow: PUBLIC_PATHS,
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  }
}
