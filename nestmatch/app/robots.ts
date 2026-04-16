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
          "/dossier",
          "/favoris",
          "/proprietaire",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
