import { MetadataRoute } from "next"
import { supabase } from "../lib/supabase"

const BASE_URL = process.env.NEXT_PUBLIC_URL || "https://nestmatch.fr"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data: annonces } = await supabase
    .from("annonces")
    .select("id, updated_at")
    .order("id", { ascending: false })

  const annoncesUrls: MetadataRoute.Sitemap = (annonces || []).map((a) => ({
    url: `${BASE_URL}/annonces/${a.id}`,
    lastModified: a.updated_at ? new Date(a.updated_at) : new Date(),
    changeFrequency: "weekly",
    priority: 0.8,
  }))

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/annonces`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/auth`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ]

  return [...staticPages, ...annoncesUrls]
}
