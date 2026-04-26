import { MetadataRoute } from "next"
import { supabase } from "../lib/supabase"
import { CITY_NAMES } from "../lib/cityCoords"

const BASE_URL = process.env.NEXT_PUBLIC_URL || "https://keymatch-immo.fr"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Seulement les annonces disponibles (statut "disponible" OU statut absent),
  // et exclut les annonces de test (col is_test, modération vitrine publique).
  const { data: annonces } = await supabase
    .from("annonces")
    .select("id, updated_at, statut")
    .or("statut.is.null,statut.eq.disponible")
    .eq("is_test", false)
    .order("id", { ascending: false })

  const annoncesUrls: MetadataRoute.Sitemap = (annonces || []).map((a) => ({
    url: `${BASE_URL}/annonces/${a.id}`,
    lastModified: a.updated_at ? new Date(a.updated_at) : new Date(),
    changeFrequency: "weekly",
    priority: 0.6,
  }))

  // Pages SEO par ville (indexées pour la longue traîne "location paris")
  const villesUrls: MetadataRoute.Sitemap = CITY_NAMES.map((v) => ({
    url: `${BASE_URL}/location/${encodeURIComponent(v.toLowerCase())}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.7,
  }))

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL,                 lastModified: new Date(), changeFrequency: "daily",   priority: 1.0 },
    { url: `${BASE_URL}/annonces`,   lastModified: new Date(), changeFrequency: "hourly",  priority: 0.9 },
    { url: `${BASE_URL}/estimateur`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/contact`,    lastModified: new Date(), changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE_URL}/cgu`,               lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/mentions-legales`,  lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/confidentialite`,   lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/cookies`,           lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/plan-du-site`,       lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
  ]

  return [...staticPages, ...villesUrls, ...annoncesUrls]
}
