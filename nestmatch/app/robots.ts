import { MetadataRoute } from "next"

const BASE_URL = process.env.NEXT_PUBLIC_URL || "https://nestmatch.fr"

export default function robots(): MetadataRoute.Robots {
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
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
