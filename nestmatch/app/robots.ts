import { MetadataRoute } from "next"

const BASE_URL = process.env.NEXT_PUBLIC_URL || "https://keymatch-immo.fr"

// Flag de bêta : tant que NEXT_PUBLIC_NOINDEX=true (env Vercel), on demande aux
// moteurs de recherche de ne pas indexer le site. Permet de tester sur le
// vrai domaine sans apparaître dans Google.
const NO_INDEX = process.env.NEXT_PUBLIC_NOINDEX === "true"

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
