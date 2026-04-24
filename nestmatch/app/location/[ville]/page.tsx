import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { supabase } from "../../../lib/supabase"
import { CITY_NAMES, normalizeCityName } from "../../../lib/cityCoords"
import { BRAND } from "../../../lib/brand"

const BRAND_NAME = BRAND.name

/** Petit composant stat réutilisé dans le bloc "Aperçu du marché". */
function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p style={{ fontSize: 11, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4, fontWeight: 700 }}>
        {label}
      </p>
      <p style={{ fontSize: 22, fontWeight: 800, color: "#111", letterSpacing: "-0.3px", lineHeight: 1.1 }}>
        {value}
        {hint && <span style={{ fontSize: 12, fontWeight: 500, color: "#8a8477", marginLeft: 4 }}>{hint}</span>}
      </p>
    </div>
  )
}

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

const BASE_URL = process.env.NEXT_PUBLIC_URL || "https://keymatch-immo.fr"

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
      siteName: "KeyMatch",
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
          <p style={{ fontSize: 14, color: "#8a8477", marginBottom: 20 }}>Cette ville n&apos;est pas encore dans notre référentiel.</p>
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
  const prix = (annonces || []).map(a => Number(a.prix)).filter(n => !isNaN(n) && n > 0)
  const surfaces = (annonces || []).map(a => Number(a.surface)).filter(n => !isNaN(n) && n > 0)
  const prixMedian = computeMedian(prix)
  const prixMin = prix.length > 0 ? Math.min(...prix) : 0
  const prixMax = prix.length > 0 ? Math.max(...prix) : 0
  const surfaceMoyenne = surfaces.length > 0 ? Math.round(surfaces.reduce((a, b) => a + b, 0) / surfaces.length) : 0
  const prixM2 = prixMedian > 0 && surfaceMoyenne > 0 ? Math.round(prixMedian / surfaceMoyenne) : 0
  // Répartition par nombre de pièces (aide les users à se situer : "plus de T2 que de T3 ?")
  const repartition: Record<number, number> = {}
  for (const a of annonces || []) {
    const p = Number(a.pieces)
    if (!isNaN(p) && p > 0) repartition[p] = (repartition[p] || 0) + 1
  }
  const repartitionItems = Object.entries(repartition)
    .map(([p, n]) => ({ pieces: Number(p), count: n }))
    .sort((a, b) => a.pieces - b.pieces)

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

  // FAQ générique — même squelette par ville, les URL + villes diffèrent.
  // Google affiche ces FAQs en accordion enrichi dans les SERP.
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `Comment trouver une location à ${displayCity} sans agence ?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Sur KeyMatch, toutes les annonces de location à ${displayCity} sont publiées par les propriétaires eux-mêmes. Vous pouvez filtrer par budget, surface, nombre de pièces, DPE et équipements, puis contacter directement le bailleur via la messagerie intégrée — zéro frais d'agence.`,
        },
      },
      {
        "@type": "Question",
        name: `Quels documents préparer pour louer à ${displayCity} ?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Pour un dossier crédible : pièce d'identité, 3 derniers bulletins de salaire, dernier avis d'imposition, contrat de travail, justificatif de domicile (3 quittances), et éventuellement un garant (personne physique, Visale ou organisme). KeyMatch vous guide pour constituer un dossier ALUR complet avant candidature.`,
        },
      },
      {
        "@type": "Question",
        name: `Quel est le loyer moyen à ${displayCity} ?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: prixMedian > 0
            ? `Le loyer médian affiché actuellement sur KeyMatch à ${displayCity} est d'environ ${prixMedian} €/mois${prixM2 > 0 ? `, soit environ ${prixM2} €/m²` : ""}. Les loyers vont de ${prixMin} € à ${prixMax} €/mois selon la surface et les équipements.`
            : `Les loyers à ${displayCity} varient selon le quartier, la surface et les équipements. Créez votre compte pour voir toutes les annonces disponibles et leurs prix.`,
        },
      },
      {
        "@type": "Question",
        name: "KeyMatch prend-il des frais sur le loyer ?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Non. L'inscription et l'utilisation sont 100 % gratuites pour les locataires et les propriétaires. Aucune commission n'est prélevée sur les loyers, aucun frais d'agence n'est facturé.",
        },
      },
    ],
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, "\\u003c") }}
      />
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 20px" }}>

        {/* Fil d'Ariane visible (mirroir du JSON-LD BreadcrumbList) */}
        <nav aria-label="Fil d'Ariane" style={{ marginBottom: 14 }}>
          <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexWrap: "wrap", gap: 6, fontSize: 13, color: "#8a8477" }}>
            <li>
              <Link href="/" style={{ color: "#8a8477", textDecoration: "none" }}>Accueil</Link>
            </li>
            <li aria-hidden style={{ color: "#EAE6DF" }}>›</li>
            <li>
              <Link href="/annonces" style={{ color: "#8a8477", textDecoration: "none" }}>Annonces</Link>
            </li>
            <li aria-hidden style={{ color: "#EAE6DF" }}>›</li>
            <li aria-current="page" style={{ color: "#111", fontWeight: 600 }}>
              Location {displayCity}
            </li>
          </ol>
        </nav>

        <p style={{ fontSize: 12, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>
          Location à {displayCity}
        </p>

        <h1 style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-1.5px", lineHeight: 1.1, marginBottom: 14 }}>
          Annonces de location à {displayCity}
        </h1>

        <p style={{ fontSize: 16, color: "#8a8477", lineHeight: 1.7, maxWidth: 760, marginBottom: 28 }}>
          Découvrez {total} annonce{total > 1 ? "s" : ""} de location{total > 1 ? "s" : ""} à {displayCity} publiée{total > 1 ? "s" : ""} directement par les propriétaires, sans frais d&apos;agence. KeyMatch calcule votre score de compatibilité et vous met en relation en un clic.
          {prixMedian > 0 && <> Le loyer médian affiché pour {displayCity} est d&apos;environ {prixMedian} €/mois.</>}
        </p>

        <div style={{ display: "flex", gap: 12, marginBottom: 32, flexWrap: "wrap" }}>
          <Link href={`/annonces?ville=${encodeURIComponent(city)}`}
            style={{ background: "#111", color: "white", padding: "14px 28px", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 14 }}>
            Voir toutes les annonces à {displayCity}
          </Link>
          <Link href="/auth?mode=inscription"
            style={{ background: "white", border: "1px solid #EAE6DF", color: "#111", padding: "14px 28px", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 14 }}>
            Créer mon dossier locataire
          </Link>
        </div>

        {/* Stats marché — seulement si annonces dispos */}
        {total >= 3 && prixMedian > 0 && (
          <section
            aria-label="Statistiques du marché"
            style={{ background: "white", borderRadius: 20, padding: "22px 28px", marginBottom: 32 }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.3px", marginBottom: 14 }}>
              Aperçu du marché à {displayCity}
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: 18,
              }}
            >
              <Stat label="Loyer médian" value={`${prixMedian} €`} hint="/ mois" />
              <Stat label="Loyer minimum" value={`${prixMin} €`} hint="/ mois" />
              <Stat label="Loyer maximum" value={`${prixMax} €`} hint="/ mois" />
              {surfaceMoyenne > 0 && <Stat label="Surface moyenne" value={`${surfaceMoyenne} m²`} />}
              {prixM2 > 0 && <Stat label="Loyer par m²" value={`${prixM2} €`} hint="approx." />}
              <Stat label="Annonces visibles" value={String(total)} hint="actuellement" />
            </div>
            {repartitionItems.length > 0 && (
              <div style={{ marginTop: 18, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {repartitionItems.map(r => (
                  <span
                    key={r.pieces}
                    style={{
                      fontSize: 12,
                      color: "#111",
                      background: "#F7F4EF",
                      border: "1px solid #F7F4EF",
                      borderRadius: 999,
                      padding: "4px 12px",
                      fontWeight: 600,
                    }}
                  >
                    {r.count} × T{r.pieces}
                  </span>
                ))}
              </div>
            )}
            <p style={{ fontSize: 11, color: "#8a8477", marginTop: 14, lineHeight: 1.5 }}>
              Moyennes calculées sur les {total} annonce{total > 1 ? "s" : ""} actuellement publiée{total > 1 ? "s" : ""} à {displayCity} sur {BRAND_NAME}. Donne un ordre de grandeur, pas un indicateur officiel.
            </p>
          </section>
        )}

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
                      <div style={{ position: "relative", width: "100%", height: 160 }}>
                        <Image src={photo} alt={a.titre} fill sizes="(max-width: 768px) 100vw, 320px" style={{ objectFit: "cover", display: "block" }} />
                      </div>
                    ) : (
                      <div style={{ height: 160, background: "#F7F4EF" }} />
                    )}
                    <div style={{ padding: "12px 14px" }}>
                      <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.titre}</p>
                      <p style={{ fontSize: 12, color: "#8a8477", marginBottom: 8 }}>{a.surface} m² · {a.pieces} pièces</p>
                      <p style={{ fontSize: 16, fontWeight: 800 }}>{a.prix} €<span style={{ fontSize: 11, fontWeight: 400, color: "#8a8477" }}>/mois</span></p>
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
              Sur KeyMatch, toutes les annonces de location à {displayCity} sont publiées par les propriétaires eux-mêmes. Aucune commission, aucun frais d&apos;agence : vous échangez directement avec le bailleur via notre messagerie intégrée.
            </p>
            <p style={{ marginBottom: 12 }}>
              Notre algorithme de matching compare votre dossier (budget, surface, équipements, situation professionnelle) aux caractéristiques de chaque bien pour afficher un score de compatibilité sur 100 %. Vous voyez immédiatement les annonces les plus adaptées à votre profil.
            </p>
            <p>
              La plateforme gère aussi la génération du bail conforme ALUR, l&apos;état des lieux numérique et les quittances de loyer. Tout le cycle de la location, de la candidature à la signature, se fait en ligne.
            </p>
          </div>
        </section>

        {/* FAQ visible (matchée avec le JSON-LD FAQPage plus haut — Google
            valorise les contenus structurés ET affichés à l'utilisateur). */}
        <section style={{ marginTop: 32, background: "white", borderRadius: 20, padding: "32px 36px" }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 18 }}>
            Questions fréquentes sur la location à {displayCity}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {faqLd.mainEntity.map((q, i) => (
              <details
                key={i}
                style={{
                  borderBottom: i < faqLd.mainEntity.length - 1 ? "1px solid #F7F4EF" : "none",
                  paddingBottom: i < faqLd.mainEntity.length - 1 ? 14 : 0,
                }}
              >
                <summary
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#111",
                    cursor: "pointer",
                    listStyle: "none",
                    padding: "4px 0",
                    userSelect: "none",
                  }}
                >
                  {q.name}
                </summary>
                <p style={{ fontSize: 14, color: "#4b5563", lineHeight: 1.7, marginTop: 10 }}>
                  {q.acceptedAnswer.text}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* Liens vers autres villes (maillage interne SEO) */}
        <section style={{ marginTop: 32, background: "white", borderRadius: 20, padding: "24px 28px" }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>Autres villes populaires</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {CITY_NAMES.filter(v => v !== displayCity).slice(0, 14).map(v => (
              <Link key={v} href={`/location/${encodeURIComponent(v.toLowerCase())}`}
                style={{ fontSize: 13, color: "#111", textDecoration: "none", padding: "6px 14px", background: "#F7F4EF", borderRadius: 999, border: "1px solid #F7F4EF" }}>
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
