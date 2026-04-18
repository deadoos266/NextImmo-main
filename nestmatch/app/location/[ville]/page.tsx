import type { Metadata } from "next"
import Link from "next/link"
import { supabase } from "../../../lib/supabase"
import { CITY_NAMES, normalizeCityName } from "../../../lib/cityCoords"

/**
 * Page SEO par ville : /location/paris, /location/lyon, etc.
 * Server component pour indexation Google.
 * Titre optimisé, meta description, H1 pertinent, liste des annonces.
 */

function cityFromSlug(slug: string): string | null {
  const decoded = decodeURIComponent(slug).replace(/-/g, " ").toLowerCase().trim()
  const match = CITY_NAMES.find(c => c.toLowerCase() === decoded)
  return match || null
}

const BASE_URL = process.env.NEXT_PUBLIC_URL || "https://nestmatch.fr"

export async function generateMetadata({ params }: any): Promise<Metadata> {
  const { ville } = await params
  const city = cityFromSlug(ville)
  if (!city) return { title: "Ville introuvable" }

  const title = `Location appartement ${city} — annonces entre particuliers`
  const description = `Toutes les annonces de location à ${city} sans frais d'agence. Matching intelligent, dossier certifié ALUR, messagerie directe avec le propriétaire.`
  const url = `${BASE_URL}/location/${ville}`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title,
      description,
      locale: "fr_FR",
      siteName: "NestMatch",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  }
}

export default async function LocationVille({ params }: any) {
  const { ville } = await params
  const city = cityFromSlug(ville)
  if (!city) {
    return (
      <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: "40px 20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 520, background: "white", borderRadius: 20, padding: 40, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Ville introuvable</h1>
          <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 20 }}>Cette ville n&apos;est pas encore dans notre référentiel.</p>
          <Link href="/annonces" style={{ background: "#111", color: "white", padding: "12px 24px", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 14 }}>
            Voir toutes les annonces
          </Link>
        </div>
      </main>
    )
  }

  const displayCity = normalizeCityName(city)
  const { data: annonces } = await supabase
    .from("annonces")
    .select("id, titre, ville, prix, surface, pieces, photos, dispo, statut")
    .ilike("ville", city)
    .eq("statut", "disponible")
    .order("id", { ascending: false })
    .limit(24)

  const total = (annonces || []).length
  const prixMedian = computeMedian((annonces || []).map(a => Number(a.prix)).filter(n => !isNaN(n) && n > 0))

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: BASE_URL },
      { "@type": "ListItem", position: 2, name: "Annonces", item: `${BASE_URL}/annonces` },
      { "@type": "ListItem", position: 3, name: `Location ${displayCity}`, item: `${BASE_URL}/location/${encodeURIComponent(ville)}` },
    ],
  }
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: (annonces || []).slice(0, 12).map((a, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${BASE_URL}/annonces/${a.id}`,
      name: a.titre,
    })),
  }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, "\\u003c") }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd).replace(/</g, "\\u003c") }}
      />
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 20px" }}>

        <p style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>
          Location à {displayCity}
        </p>

        <h1 style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-1.5px", lineHeight: 1.1, marginBottom: 14 }}>
          Annonces de location à {displayCity}
        </h1>

        <p style={{ fontSize: 16, color: "#6b7280", lineHeight: 1.7, maxWidth: 760, marginBottom: 28 }}>
          Découvrez {total} annonce{total > 1 ? "s" : ""} de location{total > 1 ? "s" : ""} à {displayCity} publiée{total > 1 ? "s" : ""} directement par les propriétaires, sans frais d&apos;agence. NestMatch calcule votre score de compatibilité et vous met en relation en un clic.
          {prixMedian > 0 && <> Le loyer médian affiché pour {displayCity} est d&apos;environ {prixMedian} €/mois.</>}
        </p>

        <div style={{ display: "flex", gap: 12, marginBottom: 32, flexWrap: "wrap" }}>
          <Link href={`/annonces?ville=${encodeURIComponent(city)}`}
            style={{ background: "#111", color: "white", padding: "14px 28px", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 14 }}>
            Voir toutes les annonces à {displayCity}
          </Link>
          <Link href="/auth?mode=inscription"
            style={{ background: "white", border: "1.5px solid #e5e7eb", color: "#111", padding: "14px 28px", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 14 }}>
            Créer mon dossier locataire
          </Link>
        </div>

        {/* Grille d'annonces */}
        {total > 0 && (
          <section>
            <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 18 }}>
              Annonces disponibles à {displayCity}
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
              {(annonces || []).map(a => {
                const photo = Array.isArray(a.photos) && a.photos.length > 0 ? a.photos[0] : null
                return (
                  <Link key={a.id} href={`/annonces/${a.id}`}
                    style={{ background: "white", borderRadius: 18, overflow: "hidden", textDecoration: "none", color: "#111", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                    {photo ? (
                      <img src={photo} alt={a.titre} style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
                    ) : (
                      <div style={{ height: 160, background: "#f3f4f6" }} />
                    )}
                    <div style={{ padding: "12px 14px" }}>
                      <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.titre}</p>
                      <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>{a.surface} m² · {a.pieces} pièces</p>
                      <p style={{ fontSize: 16, fontWeight: 800 }}>{a.prix} €<span style={{ fontSize: 11, fontWeight: 400, color: "#9ca3af" }}>/mois</span></p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* Contenu éditorial court pour SEO */}
        <section style={{ marginTop: 48, background: "white", borderRadius: 20, padding: "32px 36px" }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 14 }}>
            Louer sans agence à {displayCity}
          </h2>
          <div style={{ fontSize: 15, color: "#4b5563", lineHeight: 1.7 }}>
            <p style={{ marginBottom: 12 }}>
              Sur NestMatch, toutes les annonces de location à {displayCity} sont publiées par les propriétaires eux-mêmes. Aucune commission, aucun frais d&apos;agence : vous échangez directement avec le bailleur via notre messagerie intégrée.
            </p>
            <p style={{ marginBottom: 12 }}>
              Notre algorithme de matching compare votre dossier (budget, surface, équipements, situation professionnelle) aux caractéristiques de chaque bien pour afficher un score de compatibilité sur 100 %. Vous voyez immédiatement les annonces les plus adaptées à votre profil.
            </p>
            <p>
              La plateforme gère aussi la génération du bail conforme ALUR, l&apos;état des lieux numérique et les quittances de loyer. Tout le cycle de la location, de la candidature à la signature, se fait en ligne.
            </p>
          </div>
        </section>

        {/* Liens vers autres villes (maillage interne SEO) */}
        <section style={{ marginTop: 32, background: "white", borderRadius: 20, padding: "24px 28px" }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>Autres villes populaires</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {CITY_NAMES.filter(v => v !== displayCity).slice(0, 14).map(v => (
              <Link key={v} href={`/location/${encodeURIComponent(v.toLowerCase())}`}
                style={{ fontSize: 13, color: "#111", textDecoration: "none", padding: "6px 14px", background: "#f9fafb", borderRadius: 999, border: "1px solid #f3f4f6" }}>
                {v}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}

function computeMedian(arr: number[]): number {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : s[mid]
}
