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
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/annonces", "/annonces/"],
        disallow: [
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
          "/onboarding",
          "/parametres",
          "/publier",
          "/edl",
          "/bail",
          "/mon-logement",
          "/stats",
          "/auth",
          "/connexion",
          "/login",
          "/test",
          "/monitoring",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
