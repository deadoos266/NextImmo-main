import type { Metadata } from "next"
import { supabase } from "../../../lib/supabase"
import { getCityCoords } from "../../../lib/cityCoords"
import { DPE_COLORS } from "../../../lib/dpeColors"
import ScoreBlock from "./ScoreBlock"
import ContactButton from "./ContactButton"
import PhotoCarousel from "./PhotoCarousel"
import FavoriButton from "./FavoriButton"
import BookingVisite from "./BookingVisite"
import OwnerActions from "./OwnerActions"
import ViewTracker from "./ViewTracker"
import MapBienWrapper from "./MapBienWrapper"
import SignalerButton from "../../components/SignalerButton"
import ShareButton from "./ShareButton"
import LocataireMatchCard from "./LocataireMatchCard"
import EquipementsBlock from "./EquipementsBlock"
import PartagerCard from "./PartagerCard"
import StickyCTABanner from "./StickyCTABanner"
import CandidaturesCounter from "./CandidaturesCounter"
import DpeWarningBanner from "./DpeWarningBanner"
import QualiteAnnonceBadge from "./QualiteAnnonceBadge"
import QualiteAnnonceBadgeAdaptive from "./QualiteAnnonceBadgeAdaptive"
import Link from "next/link"
import Image from "next/image"

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://keymatch-immo.fr'

// ─── Helpers fiche enrichie R10.9 ─────────────────────────────────────────

/**
 * Normalise un champ "boolean" qui peut arriver en string ("oui"/"non"/
 * "true"/"false"), nombre (0/1) ou bool natif depuis Supabase. Le schema
 * `annonces.meuble` et autres equipements (parking, cave, etc.) ont en
 * DB un mix de valeurs hérité de migrations successives. Un check strict
 * `=== true` ratait les strings "oui" → la pill Meuble n'apparaissait
 * jamais. Paul 2026-04-27 (bug #b6c8f19 follow-up).
 */
/**
 * Formate un etage (chiffre ou string) en ordinal francais court.
 * - 0 / "0" / "rdc" → "RDC"
 * - 1 → "1er"
 * - 2-9 → "2e" / "3e" ... (e en superscript via tag <sup> au render)
 * - Si la valeur contient deja des lettres ("Sous-sol", "1er", "2e", "7e+"),
 *   on la retourne telle quelle (deja format DB pre-existant).
 */
function formatEtage(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null
  const s = String(raw).trim()
  const lower = s.toLowerCase()
  if (lower === "rdc" || lower === "rez-de-chaussee" || lower === "rez-de-chaussée" || s === "0") return "RDC"
  // Deja formate (Sous-sol, 1er, 2e, 7e+, etc.)
  if (/[a-zA-Zéè]/i.test(s)) return s
  const n = parseInt(s, 10)
  if (!Number.isFinite(n)) return s
  if (n === 0) return "RDC"
  if (n === 1) return "1er"
  return `${n}e`
}

function asTriBool(v: unknown): boolean | null {
  if (v === null || v === undefined || v === "") return null
  if (typeof v === "boolean") return v
  if (typeof v === "number") return v !== 0
  if (typeof v === "string") {
    const norm = v.toLowerCase().trim()
    if (norm === "true" || norm === "oui" || norm === "1" || norm === "yes" || norm === "y") return true
    if (norm === "false" || norm === "non" || norm === "0" || norm === "no" || norm === "n") return false
    return null
  }
  return null
}

function formatPublieIlYA(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null
  const delta = Date.now() - new Date(createdAt).getTime()
  if (isNaN(delta) || delta < 0) return null
  const j = Math.floor(delta / (1000 * 60 * 60 * 24))
  if (j === 0) return "Publié aujourd'hui"
  if (j === 1) return "Publié hier"
  if (j < 7) return `Publié il y a ${j} jours`
  const s = Math.floor(j / 7)
  if (s === 1) return "Publié il y a 1 semaine"
  if (s < 5) return `Publié il y a ${s} semaines`
  const m = Math.floor(j / 30)
  if (m === 1) return "Publié il y a 1 mois"
  return `Publié il y a ${m} mois`
}

// Déduit les points forts non-bullshit depuis les features booléennes existantes.
// Ne jamais inventer ce qu'on ne sait pas — uniquement dériver de la DB.
function deduirePointsForts(a: Record<string, unknown>): string[] {
  const atouts: string[] = []
  if (a.ascenseur) atouts.push("Ascenseur dans l'immeuble")
  if (a.parking) atouts.push("Stationnement inclus")
  if (a.balcon) atouts.push("Balcon privatif")
  if (a.terrasse) atouts.push("Terrasse privative")
  if (a.jardin) atouts.push("Jardin accessible")
  if (a.cave) atouts.push("Cave dédiée")
  if (a.fibre) atouts.push("Fibre optique installée")
  if (a.meuble) atouts.push("Logement meublé")
  const dpe = typeof a.dpe === "string" ? a.dpe : null
  if (dpe && ["A", "B", "C"].includes(dpe)) atouts.push(`Classe énergie ${dpe} — bonne isolation`)
  if (a.verifie) atouts.push("Propriétaire vérifié")
  return atouts
}

export async function generateMetadata({ params }: any): Promise<Metadata> {
  const { id } = await params
  const { data: annonce } = await supabase.from("annonces").select("titre,description,ville,prix,surface,pieces,photos,is_test").eq("id", id).single()

  // Annonce flaguée test = traitée comme introuvable côté public (pas de
  // metadata SEO, pas d'OG image). Le proprio voit toujours sa fiche via
  // /proprietaire/modifier/[id].
  if (!annonce || annonce.is_test) {
    return { title: "Annonce introuvable" }
  }

  const titre = annonce.titre || "Logement à louer"
  const ville = annonce.ville ? ` à ${annonce.ville}` : ""
  const prix = annonce.prix ? ` — ${annonce.prix} €/mois` : ""
  const surface = annonce.surface ? ` · ${annonce.surface} m²` : ""
  const pieces = annonce.pieces ? ` · ${annonce.pieces} pièces` : ""

  const title = `${titre}${ville}${prix}`
  const description = annonce.description
    ? annonce.description.slice(0, 155).trim() + (annonce.description.length > 155 ? "…" : "")
    : `${titre}${ville}${surface}${pieces}${prix}. Contactez directement le propriétaire sur KeyMatch, zéro frais d'agence.`

  const photo = Array.isArray(annonce.photos) && annonce.photos.length > 0 ? annonce.photos[0] : null
  const pageUrl = `${BASE_URL}/annonces/${id}`

  // Stratégie OG image :
  //   - Annonce avec photo → on utilise la vraie photo (plus attrayant)
  //   - Sinon → on ne déclare rien ici, Next.js appelle automatiquement
  //     `opengraph-image.tsx` qui génère une carte KeyMatch dynamique
  //     avec titre + ville + prix.
  const ogImages = photo
    ? [{ url: photo, width: 1200, height: 630, alt: titre }]
    : undefined

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      type: "website",
      url: pageUrl,
      title,
      description,
      ...(ogImages ? { images: ogImages } : {}),
      locale: "fr_FR",
      siteName: "KeyMatch",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(photo ? { images: [photo] } : {}),
    },
  }
}

export default async function Annonce({ params }: any) {
  const { id } = await params
  const { data: annonce } = await supabase.from("annonces").select("*").eq("id", id).single()

  // Social proof : compteurs vues + candidatures (distincts). Server-side,
  // head-only pour éviter de transférer des lignes, juste le count.
  let nbVues = 0
  let nbCandidatures = 0
  let nbAutresBiens = 0
  if (annonce?.id) {
    const ownerEmail = annonce.proprietaire_email || null
    const [{ count: vuesCount }, { count: candCount }, { count: autresBiensCount }] = await Promise.all([
      supabase.from("clics_annonces").select("annonce_id", { count: "exact", head: true }).eq("annonce_id", annonce.id),
      supabase.from("messages").select("id", { count: "exact", head: true }).eq("annonce_id", annonce.id),
      ownerEmail
        ? supabase.from("annonces").select("id", { count: "exact", head: true }).eq("proprietaire_email", ownerEmail).neq("id", annonce.id).eq("is_test", false)
        : Promise.resolve({ count: 0 } as { count: number | null }),
    ])
    nbVues = vuesCount ?? 0
    nbCandidatures = candCount ?? 0
    nbAutresBiens = autresBiensCount ?? 0
  }

  // Annonces similaires : même ville + prix ±30 % + exclut la louée courante,
  // exclut les biens marqués "loué". Server-side pour le SEO et pour éviter un
  // round-trip client. Limit 4.
  let similaires: any[] = []
  if (annonce?.ville) {
    const prix = Number(annonce.prix) || 0
    const prixMin = Math.round(prix * 0.7)
    const prixMax = Math.round(prix * 1.3)
    const { data: sim } = await supabase
      .from("annonces")
      .select("id, titre, ville, prix, surface, pieces, photos, dpe, statut")
      .eq("ville", annonce.ville)
      .neq("id", annonce.id)
      .gte("prix", prixMin)
      .lte("prix", prixMax)
      .or("statut.is.null,statut.neq.loué")
      .eq("is_test", false) // Modération : pas d'annonce de test en suggestion
      .limit(4)
    similaires = sim || []
  }

  // Modération : annonce inexistante OU flaguée test = 404-like public.
  // Le proprio voit sa fiche via /proprietaire/modifier/[id] ou stats.
  if (!annonce || annonce.is_test) return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Annonce introuvable</h1>
        <a href="/annonces" style={{ color: "#111", fontWeight: 600, textDecoration: "none" }}>← Retour aux annonces</a>
      </div>
    </main>
  )

  // Mode vacances du propriétaire + bio publique : tout en 1 requête
  // pour éviter les aller-retour. La bio rassure le candidat en humanisant
  // la relation ("C'est quelqu'un, pas juste un email").
  let proprioVacances: { actif: boolean; message: string | null } = { actif: false, message: null }
  let proprioBio: string | null = null
  if (annonce.proprietaire_email) {
    const { data: prop } = await supabase
      .from("profils")
      .select("vacances_actif, vacances_message, bio_publique")
      .eq("email", String(annonce.proprietaire_email).toLowerCase())
      .maybeSingle()
    if (prop?.vacances_actif) {
      proprioVacances = { actif: true, message: prop.vacances_message || null }
    }
    if (prop?.bio_publique && String(prop.bio_publique).trim()) {
      proprioBio = String(prop.bio_publique).trim()
    }
  }

  // Le tracking des clics uniques est gere par le composant ViewTracker (client-side)

  // DPE_COLORS importé depuis lib/dpeColors.ts (palette canonique partagée
  // avec ListingCardSearch — supprime la divergence visuelle entre liste
  // et fiche détail qui existait jusqu'au cleanup #10).
  const photos: string[] = Array.isArray(annonce.photos) ? annonce.photos : []
  // Priorité : lat/lng précis sauvés depuis l'autocomplete BAN.
  // Fallback 1 : cityCoords statique. Fallback 2 (client) : geocoding Nominatim
  // via MapBienWrapper.
  const hasExactCoords = typeof annonce.lat === "number" && typeof annonce.lng === "number"
  const cityCoords = getCityCoords(annonce.ville || "")
  // Coords passées au wrapper : précises si dispo, sinon centre ville (statique), sinon null
  // (le wrapper gère le fallback géocodage côté client).
  const initialCoords: { lat: number | null; lng: number | null } = hasExactCoords
    ? { lat: annonce.lat as number, lng: annonce.lng as number }
    : cityCoords
      ? { lat: cityCoords[0], lng: cityCoords[1] }
      : { lat: null, lng: null }

  // Liste des équipements -> amenityFeature (LocationFeatureSpecification)
  // Google affiche ça comme "chips" enrichies dans les SERP immo.
  const amenities: { "@type": "LocationFeatureSpecification"; name: string; value: boolean }[] = []
  if (typeof annonce.meuble === "boolean") amenities.push({ "@type": "LocationFeatureSpecification", name: "Meublé", value: annonce.meuble })
  if (typeof annonce.parking === "boolean") amenities.push({ "@type": "LocationFeatureSpecification", name: "Parking", value: annonce.parking })
  if (typeof annonce.balcon === "boolean") amenities.push({ "@type": "LocationFeatureSpecification", name: "Balcon", value: annonce.balcon })
  if (typeof annonce.terrasse === "boolean") amenities.push({ "@type": "LocationFeatureSpecification", name: "Terrasse", value: annonce.terrasse })
  if (typeof annonce.jardin === "boolean") amenities.push({ "@type": "LocationFeatureSpecification", name: "Jardin", value: annonce.jardin })
  if (typeof annonce.ascenseur === "boolean") amenities.push({ "@type": "LocationFeatureSpecification", name: "Ascenseur", value: annonce.ascenseur })

  // Coords pour geo — si dispo précises sinon cityCoords (mieux que rien)
  const geoCoords = hasExactCoords
    ? { lat: annonce.lat as number, lng: annonce.lng as number }
    : cityCoords
      ? { lat: cityCoords[0], lng: cityCoords[1] }
      : null

  const createdAt = annonce.created_at ? new Date(annonce.created_at).toISOString() : undefined
  const updatedAt = annonce.updated_at ? new Date(annonce.updated_at).toISOString() : undefined
  // Expiration offre = 90j après création (pratique marché immo FR)
  const priceValidUntil = annonce.created_at
    ? new Date(new Date(annonce.created_at).getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : undefined

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    "@id": `${BASE_URL}/annonces/${id}`,
    name: annonce.titre,
    description: annonce.description || `${annonce.titre} à ${annonce.ville}`,
    url: `${BASE_URL}/annonces/${id}`,
    image: photos.length > 0 ? photos : [`${BASE_URL}/annonces/${id}/opengraph-image`],
    datePosted: createdAt,
    dateModified: updatedAt,
    address: {
      "@type": "PostalAddress",
      addressLocality: annonce.ville,
      addressRegion: annonce.region || undefined,
      postalCode: annonce.code_postal || undefined,
      addressCountry: "FR",
      streetAddress: annonce.localisation_exacte ? (annonce.adresse || undefined) : undefined,
    },
    ...(geoCoords
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: geoCoords.lat,
            longitude: geoCoords.lng,
          },
        }
      : {}),
    offers: {
      "@type": "Offer",
      price: annonce.prix,
      priceCurrency: "EUR",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: annonce.prix,
        priceCurrency: "EUR",
        unitCode: "MON", // MON = Monthly — loyer mensuel
        unitText: "Mois",
      },
      availability: annonce.dispo === "Disponible maintenant"
        ? "https://schema.org/InStock"
        : "https://schema.org/PreOrder",
      validFrom: createdAt,
      priceValidUntil,
      url: `${BASE_URL}/annonces/${id}`,
    },
    floorSize: annonce.surface
      ? {
          "@type": "QuantitativeValue",
          value: annonce.surface,
          unitCode: "MTK", // mètre carré
        }
      : undefined,
    numberOfRooms: annonce.pieces || undefined,
    ...(annonce.chambres ? { numberOfBedrooms: annonce.chambres } : {}),
    ...(amenities.length > 0 ? { amenityFeature: amenities } : {}),
    ...(typeof annonce.animaux === "boolean" ? { petsAllowed: annonce.animaux } : {}),
    ...(annonce.dpe ? { energyEfficiencyScaleMin: annonce.dpe, energyEfficiencyScaleMax: annonce.dpe } : {}),
  }

  // BreadcrumbList : aide Google à afficher le fil d'Ariane dans les SERP.
  // On insère la page ville si dispo (améliore le maillage /location/[ville]).
  const breadcrumbItems: { "@type": "ListItem"; position: number; name: string; item: string }[] = [
    { "@type": "ListItem", position: 1, name: "Accueil", item: BASE_URL },
    { "@type": "ListItem", position: 2, name: "Annonces", item: `${BASE_URL}/annonces` },
  ]
  if (annonce.ville) {
    breadcrumbItems.push({
      "@type": "ListItem",
      position: 3,
      name: `Location ${annonce.ville}`,
      item: `${BASE_URL}/location/${encodeURIComponent(String(annonce.ville).toLowerCase())}`,
    })
  }
  breadcrumbItems.push({
    "@type": "ListItem",
    position: breadcrumbItems.length + 1,
    name: annonce.titre,
    item: `${BASE_URL}/annonces/${id}`,
  })
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems,
  }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbLd).replace(/</g, "\\u003c"),
        }}
      />
      {/* Responsive H1 + layout : pas de Tailwind, on inline une petite
          media query dédiée à cette page via dangerouslySetInnerHTML pour
          éviter tout souci d'hydration React avec des children texte
          dans un <style>. */}
      <style dangerouslySetInnerHTML={{ __html: `
        /* R10.7 — stack mobile+tablette sous 1024px ; 2 colonnes sticky ≥1024px.
           La sticky info card n'a de sens qu'avec une viewport large, sinon
           elle écrase le contenu principal. */
        @media (max-width: 767px) {
          .r-detail-h1 { font-size: 28px !important; letter-spacing: -0.8px !important; }
          .r-container { padding: 20px 16px !important; }
          /* Enrichissement R10.9 — dl caractéristiques/informations stack en mobile,
             grille 2-col ≥768px pour meilleure densité tablet+. */
          .r-detail-dl, .r-detail-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 1023px) {
          .r-detail-layout { flex-direction: column !important; }
          .r-detail-sidebar { width: 100% !important; position: static !important; }
          .r-detail-sidebar .r-detail-stickycard {
            position: static !important;
            max-height: none !important;
            overflow: visible !important;
          }
        }
        @media (min-width: 768px) and (max-width: 1023px) {
          .r-detail-h1 { font-size: 36px !important; letter-spacing: -1.1px !important; }
          .r-container { padding: 28px 24px !important; }
        }
        /* Hover cards similaires : CSS :hover (pas JS handlers) — obligatoire
           car page.tsx est un server component et ne peut pas passer des
           event handlers à <Link> qui est client. */
        .r-similar-card {
          transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1),
                      box-shadow 300ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        .r-similar-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 32px rgba(0,0,0,0.08);
        }
      ` }} />
      <div className="r-container" style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 48px" }}>
        {/* Breadcrumbs visibles (reflet du JSON-LD BreadcrumbList). Google
            affiche ça comme fil d'Ariane enrichi dans les SERP. */}
        <nav aria-label="Fil d'Ariane" style={{ marginBottom: 14 }}>
          <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexWrap: "wrap", gap: 6, fontSize: 13, color: "#8a8477" }}>
            <li>
              <a href="/" style={{ color: "#8a8477", textDecoration: "none" }}>Accueil</a>
            </li>
            <li aria-hidden style={{ color: "#EAE6DF" }}>›</li>
            <li>
              <a href="/annonces" style={{ color: "#8a8477", textDecoration: "none" }}>Annonces</a>
            </li>
            {annonce.ville && (
              <>
                <li aria-hidden style={{ color: "#EAE6DF" }}>›</li>
                <li>
                  <a href={`/location/${encodeURIComponent(String(annonce.ville).toLowerCase())}`} style={{ color: "#8a8477", textDecoration: "none" }}>
                    Location {annonce.ville}
                  </a>
                </li>
              </>
            )}
            <li aria-hidden style={{ color: "#EAE6DF" }}>›</li>
            <li aria-current="page" style={{ color: "#111", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 340 }}>
              {annonce.titre}
            </li>
          </ol>
        </nav>
        <a href="/annonces" style={{ fontSize: 14, color: "#8a8477", textDecoration: "none" }}>← Retour aux annonces</a>

        {proprioVacances.actif && (
          <div style={{ background: "#FBF6EA", border: "1px solid #EADFC6", borderRadius: 14, padding: "14px 18px", margin: "16px 0 0", color: "#9a3412" }}>
            <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Délai de réponse prolongé</p>
            <p style={{ fontSize: 13, color: "#7c2d12", margin: "6px 0 0", lineHeight: 1.5 }}>
              {proprioVacances.message || "Le propriétaire indique un délai de réponse plus long que d'habitude. Vous pouvez quand même postuler."}
            </p>
          </div>
        )}

        <div className="r-detail-header" style={{ margin: "16px 0 24px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div>
            {/* Eyebrow ville (uppercase letter-spacing 1.8px, design system) */}
            <p style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#666",
              textTransform: "uppercase",
              letterSpacing: "1.8px",
              margin: 0,
              marginBottom: 10,
            }}>
              {annonce.localisation_exacte && annonce.adresse ? `${annonce.adresse} · ${annonce.ville}` : annonce.ville}
            </p>
            {/* H1 — 44px desktop, 36px tablet, 28px mobile, weight 500 */}
            <h1 className="r-detail-h1" style={{
              fontSize: 44,
              fontWeight: 500,
              lineHeight: 1.08,
              letterSpacing: "-1.4px",
              margin: 0,
              color: "#111",
            }}>
              {annonce.titre}
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, marginLeft: 16, marginTop: 8 }}>
            <span style={{ background: annonce.dispo === "Disponible maintenant" ? "#F0FAEE" : "#FBF6EA", color: annonce.dispo === "Disponible maintenant" ? "#15803d" : "#a16207", padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
              {annonce.dispo}
            </span>
            <ShareButton title={annonce.titre || "Logement à louer"} url={`${BASE_URL}/annonces/${id}`} />
            <FavoriButton id={annonce.id} ownerEmail={annonce.proprietaire_email} />
          </div>
        </div>

        {annonce.statut === "loué" && (
          <div style={{ background: "#fef2f2", border: "1px solid #F4C9C9", borderRadius: 14, padding: "14px 18px", marginBottom: 16, color: "#b91c1c", fontSize: 14, fontWeight: 600 }}>
            Cette annonce n&apos;est plus disponible — le bien a déjà été loué.
            {" "}
            <a href="/annonces" style={{ color: "#b91c1c", fontWeight: 700, textDecoration: "underline" }}>Voir d&apos;autres biens →</a>
          </div>
        )}

        {(nbVues >= 5 || nbCandidatures >= 2) && annonce.statut !== "loué" && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {nbVues >= 5 && (
              <span style={{ background: "#EEF3FB", border: "1px solid #D7E3F4", color: "#1d4ed8", fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 999 }}>
                {nbVues} personnes ont consulté ce bien
              </span>
            )}
            {nbCandidatures >= 2 && (
              <span style={{ background: "#FBF6EA", border: "1px solid #EADFC6", color: "#a16207", fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 999 }}>
                Plusieurs candidats déjà intéressés
              </span>
            )}
          </div>
        )}

        <div className="r-detail-layout" style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="r-hero-photo">
              <PhotoCarousel photos={photos} />
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
              {(() => {
                // Stats row pills v3 (Paul 2026-04-27).
                // - "single" : val seul (gros texte, pas de sub) — pour les
                //   pills auto-explicites comme "Meublé" / "Non meublé".
                // - "pair" : val (gros) + sub (petit) — chiffre + label.
                // Skip si val=null (m², pieces, chambres, etage, meuble peuvent
                // tous etre null selon les annonces).
                type Stat =
                  | { kind: "pair"; val: string | number; sub: string }
                  | { kind: "single"; val: string }
                const stats: Stat[] = []
                if (annonce.surface) stats.push({ kind: "pair", val: annonce.surface, sub: "m²" })
                if (annonce.pieces) stats.push({ kind: "pair", val: annonce.pieces, sub: "pièces" })
                if (annonce.chambres !== null && annonce.chambres !== undefined) {
                  stats.push({ kind: "pair", val: annonce.chambres, sub: "chambres" })
                }
                const etageFmt = formatEtage(annonce.etage)
                // Pour l'etage : val = "5e", sub = "étage" (ou val = "RDC" sub omis)
                if (etageFmt) {
                  if (etageFmt === "RDC" || /[a-zA-Z]/.test(etageFmt) && !/^(\d+)(er|e)$/.test(etageFmt)) {
                    // RDC ou Sous-sol : single (auto-explicite)
                    stats.push({ kind: "single", val: etageFmt })
                  } else {
                    stats.push({ kind: "pair", val: etageFmt, sub: "étage" })
                  }
                }
                const meubleNorm = asTriBool(annonce.meuble)
                if (meubleNorm === true) stats.push({ kind: "single", val: "Meublé" })
                else if (meubleNorm === false) stats.push({ kind: "single", val: "Non meublé" })
                return stats
              })().map((item, i) => (
                <div key={i} style={{ background: "white", borderRadius: 16, padding: "18px 16px", textAlign: "center", flex: 1, minWidth: 76, border: "1px solid #EAE6DF" }}>
                  {item.kind === "pair" ? (
                    <>
                      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px", lineHeight: 1.1 }}>{item.val}</div>
                      <div style={{ fontSize: 11, color: "#666", marginTop: 4, fontWeight: 500, letterSpacing: "0.3px", whiteSpace: "nowrap" }}>{item.sub}</div>
                    </>
                  ) : (
                    // Single : val centre verticalement avec hauteur identique
                    // aux pair pills (val 20 + 4 + sub 11 ≈ 38) — alignement
                    // ligne homogene.
                    <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.2px", paddingTop: 8, paddingBottom: 8, lineHeight: 1.2, whiteSpace: "nowrap" }}>{item.val}</div>
                  )}
                </div>
              ))}
              {annonce.dpe && (
                <div style={{ background: "white", borderRadius: 16, padding: "14px 16px", textAlign: "center", flex: 1, minWidth: 76, border: "1px solid #EAE6DF" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "white", background: DPE_COLORS[annonce.dpe] || "#8a8477", width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>{annonce.dpe}</div>
                  <div style={{ fontSize: 11, color: "#666", marginTop: 6, fontWeight: 500, letterSpacing: "0.3px" }}>DPE</div>
                </div>
              )}
            </div>

            {/* ─── R10.9 À propos de ce logement ─────────────────────── */}
            <section style={{ background: "white", borderRadius: 20, padding: "28px 28px 26px", marginBottom: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.6px", margin: 0, marginBottom: 8 }}>
                Présentation
              </p>
              <h2 style={{ fontSize: 24, fontWeight: 400, fontStyle: "italic", fontFamily: "'Fraunces', 'DM Sans', serif", letterSpacing: "-0.4px", margin: 0, marginBottom: 18, color: "#111" }}>
                À propos de ce logement
              </h2>
              {annonce.description ? (
                <p style={{ color: "#333", lineHeight: 1.75, fontSize: 15, margin: 0, whiteSpace: "pre-line" }}>
                  {annonce.description}
                </p>
              ) : (
                <p style={{ color: "#8a8477", lineHeight: 1.7, fontSize: 14, margin: 0, fontStyle: "italic" }}>
                  Aucune description fournie par le propriétaire.
                </p>
              )}
            </section>

            {/* ─── Caractéristiques (fusion dl + checks, suppression doublon Paul 2026-04-26)
                Avant : 2 sections "Caractéristiques" + "Caractéristiques du bien"
                qui doublonnaient (notamment "Meublé"). Maintenant 1 seule section
                avec tableau dl en haut (dimensions/type) et grille de checks en bas
                (équipements inclus directs). "Meublé" sort du dl pour rester en
                check (cohérent avec parking/cave/etc.). */}
            <section style={{ background: "white", borderRadius: 20, padding: "28px 28px 22px", marginBottom: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.6px", margin: 0, marginBottom: 8 }}>
                Le bien
              </p>
              <h2 style={{ fontSize: 24, fontWeight: 400, fontStyle: "italic", fontFamily: "'Fraunces', 'DM Sans', serif", letterSpacing: "-0.4px", margin: 0, marginBottom: 18, color: "#111" }}>
                Caractéristiques
              </h2>
              {/* Paul 2026-04-27 v2 : tout en rows cle/valeur unifiees, plus
                  de checklist verticale separee. Meuble en 1er row (info la
                  plus discriminante pour un locataire), Oui/Non explicite.
                  Equipements booleens (parking, cave, balcon, etc.) : ne
                  s'affichent en row QUE si true — evite la pollution avec
                  des "Non" sur tous les equipements absents. */}
              <dl className="r-detail-dl" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 32, rowGap: 0, margin: 0 }}>
                {(() => {
                  const publieLe = annonce.created_at
                    ? new Date(annonce.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
                    : null
                  // Normalisation booleens (asTriBool helper) — les valeurs en
                  // DB peuvent etre "oui"/"non" (string), true/false (bool), ou
                  // 0/1 selon les migrations. Sans normalisation, "non" string
                  // etait truthy → "Cave: Oui" affiche meme quand non. Bug
                  // signalé Paul 2026-04-27 pour Meuble qui n'apparaissait pas.
                  const meubleNorm = asTriBool(annonce.meuble)
                  const rows: Array<[string, string | null]> = [
                    ["Meublé", meubleNorm === true ? "Oui" : meubleNorm === false ? "Non" : null],
                    ["Type de bien", annonce.type_bien || null],
                    ["Surface habitable", annonce.surface ? `${annonce.surface} m²` : null],
                    ["Nombre de pièces", annonce.pieces ? String(annonce.pieces) : null],
                    ["Nombre de chambres", annonce.chambres !== null && annonce.chambres !== undefined ? String(annonce.chambres) : null],
                    ["Étage", annonce.etage || null],
                    // Equipements : afficher uniquement si normalize == true (skip false + null).
                    ["Parking", asTriBool(annonce.parking) === true ? "Inclus" : null],
                    ["Cave", asTriBool(annonce.cave) === true ? "Oui" : null],
                    ["Balcon", asTriBool(annonce.balcon) === true ? "Oui" : null],
                    ["Terrasse", asTriBool(annonce.terrasse) === true ? "Oui" : null],
                    ["Jardin", asTriBool(annonce.jardin) === true ? "Oui" : null],
                    ["Ascenseur", asTriBool(annonce.ascenseur) === true ? "Oui" : null],
                    ["Fibre optique", asTriBool(annonce.fibre) === true ? "Oui" : null],
                    // Animaux : prioritise la politique tri-state (Step 6 wizard,
                    // V1.7 Paul 2026-04-27) avec fallback boolean legacy.
                    ["Animaux", (() => {
                      const pol = (annonce.animaux_politique || "").toLowerCase()
                      if (pol === "oui") return "Acceptés"
                      if (pol === "non") return "Refusés"
                      // Fallback boolean
                      const aBool = asTriBool(annonce.animaux)
                      if (aBool === true) return "Acceptés"
                      if (aBool === false) return "Refusés"
                      return null  // Indifferent ou non renseigne → skip row
                    })()],
                    ["Disponibilité", annonce.dispo || null],
                    ["Publié le", publieLe],
                  ]
                  return rows
                    .filter(([, v]) => v !== null && v !== "")
                    .map(([k, v]) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "11px 0", borderBottom: "1px solid #F7F4EF" }}>
                        <dt style={{ color: "#666", fontSize: 13, margin: 0 }}>{k}</dt>
                        <dd style={{ color: "#111", fontSize: 13, fontWeight: 600, margin: 0, textAlign: "right" }}>{v}</dd>
                      </div>
                    ))
                })()}
              </dl>
            </section>

            {/* ─── R10.9 Diagnostic énergétique (DPE bars) ──────────── */}
            {annonce.dpe && typeof annonce.dpe === "string" && (
              <section style={{ background: "white", borderRadius: 20, padding: "28px 28px 26px", marginBottom: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.6px", margin: 0, marginBottom: 8 }}>
                  Énergie
                </p>
                <h2 style={{ fontSize: 24, fontWeight: 400, fontStyle: "italic", fontFamily: "'Fraunces', 'DM Sans', serif", letterSpacing: "-0.4px", margin: 0, marginBottom: 20, color: "#111" }}>
                  Diagnostic énergétique
                </h2>
                <div role="img" aria-label={`Classe énergie ${annonce.dpe}`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {(["A", "B", "C", "D", "E", "F", "G"] as const).map((lettre, i) => {
                    const actif = annonce.dpe === lettre
                    const largeur = 30 + i * 10 // 30% → 90%
                    return (
                      <div key={lettre} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ width: 28, fontSize: 13, fontWeight: 700, color: actif ? "#111" : "#8a8477", textAlign: "center" }}>
                          {lettre}
                        </span>
                        <div style={{
                          flex: 1,
                          height: actif ? 30 : 22,
                          background: DPE_COLORS[lettre] || "#8a8477",
                          borderRadius: 4,
                          width: `${largeur}%`,
                          maxWidth: `${largeur}%`,
                          opacity: actif ? 1 : 0.35,
                          transition: "opacity 0.2s",
                          display: "flex",
                          alignItems: "center",
                          paddingLeft: 10,
                          color: "white",
                          fontSize: 11,
                          fontWeight: 700,
                        }}>
                          {actif ? `Votre bien — classe ${lettre}` : ""}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p style={{ fontSize: 11, color: "#8a8477", marginTop: 14, marginBottom: 0, lineHeight: 1.5 }}>
                  A = très performant (peu d&apos;énergie consommée). G = très énergivore. L&apos;étiquette énergie reflète la consommation annuelle estimée du logement.
                </p>
              </section>
            )}

            {/* ─── R10.9 Points forts (déduits non-bullshit) ────────── */}
            {(() => {
              const atouts = deduirePointsForts(annonce as Record<string, unknown>)
              if (atouts.length < 2) return null
              return (
                <section style={{ background: "white", borderRadius: 20, padding: "28px 28px 24px", marginBottom: 20 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.6px", margin: 0, marginBottom: 8 }}>
                    Atouts
                  </p>
                  <h2 style={{ fontSize: 24, fontWeight: 400, fontStyle: "italic", fontFamily: "'Fraunces', 'DM Sans', serif", letterSpacing: "-0.4px", margin: 0, marginBottom: 16, color: "#111" }}>
                    Points forts
                  </h2>
                  <ul className="r-detail-dl" style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px" }}>
                    {atouts.map(a => (
                      <li key={a} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: "#111", lineHeight: 1.5 }}>
                        <span aria-hidden style={{ flexShrink: 0, width: 6, height: 6, borderRadius: "50%", background: "#111", marginTop: 8 }} />
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })()}

            {/* ─── Équipements (jsonb equipements_extras : lave-linge, wifi, etc.) ─
                Aperçu 4 items + popup détaillée. Masqué si jsonb vide. */}
            <section style={{ marginBottom: 20 }}>
              <EquipementsBlock extras={annonce.equipements_extras as Record<string, unknown> | null} />
            </section>

            {/* V11.7 — Badge qualite annonce, version locataire (BOTTOM).
                S'affiche uniquement pour les non-proprios. Sur mobile : pill
                compact avec modal expand au tap. Sur desktop : grosse card.
                Le proprio voit deja la version TOP plus haut (return null ici). */}
            <QualiteAnnonceBadgeAdaptive
              placement="bottom"
              proprietaireEmail={annonce.proprietaire_email}
              annonce={{
                photos: annonce.photos,
                description: annonce.description,
                message_proprietaire: annonce.message_proprietaire,
                dpe: annonce.dpe,
                localisation_exacte: annonce.localisation_exacte,
                chambres: annonce.chambres,
                pieces: annonce.pieces,
                surface: annonce.surface,
              }}
            />

            {/* ─── R10.9 Informations pratiques ─────────────────────── */}
            <section style={{ background: "white", borderRadius: 20, padding: "28px 28px 22px", marginBottom: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.6px", margin: 0, marginBottom: 8 }}>
                Conditions
              </p>
              <h2 style={{ fontSize: 24, fontWeight: 400, fontStyle: "italic", fontFamily: "'Fraunces', 'DM Sans', serif", letterSpacing: "-0.4px", margin: 0, marginBottom: 18, color: "#111" }}>
                Informations pratiques
              </h2>
              <dl className="r-detail-dl" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 32, rowGap: 0, margin: 0 }}>
                {(() => {
                  const bailType = typeof annonce.meuble === "boolean"
                    ? (annonce.meuble ? "Bail meublé (1 an)" : "Bail vide (3 ans)")
                    : null
                  const rows: Array<[string, string | null]> = [
                    ["Honoraires agence", "0 € — direct propriétaire"],
                    ["Type de bail", bailType],
                    ["Dépôt de garantie", annonce.caution ? `${annonce.caution} €` : (annonce.prix ? `${annonce.prix} €` : null)],
                    ["Charges", annonce.charges ? `${annonce.charges} €/mois` : "Comprises"],
                    ["Loyer hors charges", annonce.prix ? `${annonce.prix} €/mois` : null],
                    ["Disponibilité", annonce.dispo || null],
                  ]
                  return rows
                    .filter(([, v]) => v !== null && v !== "")
                    .map(([k, v]) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "11px 0", borderBottom: "1px solid #F7F4EF" }}>
                        <dt style={{ color: "#666", fontSize: 13, margin: 0 }}>{k}</dt>
                        <dd style={{ color: "#111", fontSize: 13, fontWeight: 600, margin: 0, textAlign: "right" }}>{v}</dd>
                      </div>
                    ))
                })()}
              </dl>
            </section>

            {/* ─── Localisation enrichie ──────────────────────────────── */}
            {annonce.ville && (
              <section style={{ background: "white", borderRadius: 20, padding: "28px 28px 26px", marginBottom: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.6px", margin: 0, marginBottom: 8 }}>
                  Emplacement
                </p>
                <h2 style={{ fontSize: 24, fontWeight: 400, fontStyle: "italic", fontFamily: "'Fraunces', 'DM Sans', serif", letterSpacing: "-0.4px", margin: 0, marginBottom: 8, color: "#111" }}>
                  Localisation
                </h2>
                <p style={{ color: "#333", fontSize: 14, marginBottom: 6, fontWeight: 500 }}>
                  {annonce.localisation_exacte && annonce.adresse
                    ? `${annonce.adresse} · ${annonce.ville}${annonce.code_postal ? ` ${annonce.code_postal}` : ""}`
                    : `${annonce.ville}${annonce.code_postal ? ` ${annonce.code_postal}` : ""} — zone approximative`}
                </p>
                {!annonce.localisation_exacte && (
                  <p style={{ color: "#8a8477", fontSize: 12, marginTop: 0, marginBottom: 14, lineHeight: 1.5, fontStyle: "italic" }}>
                    L&apos;adresse exacte n&apos;est partagée qu&apos;après acceptation de la visite par le propriétaire.
                  </p>
                )}
                <div style={{ marginTop: 14 }}>
                  <MapBienWrapper
                    lat={initialCoords.lat}
                    lng={initialCoords.lng}
                    ville={annonce.ville || ""}
                    exact={!!annonce.localisation_exacte && hasExactCoords}
                  />
                </div>
              </section>
            )}

            {/* ─── R10.9 FAQ rapide ─────────────────────────────────── */}
            <section style={{ background: "white", borderRadius: 20, padding: "28px 28px 24px", marginBottom: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.6px", margin: 0, marginBottom: 8 }}>
                Questions
              </p>
              <h2 style={{ fontSize: 24, fontWeight: 400, fontStyle: "italic", fontFamily: "'Fraunces', 'DM Sans', serif", letterSpacing: "-0.4px", margin: 0, marginBottom: 18, color: "#111" }}>
                Questions fréquentes
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {(() => {
                  const faqs: Array<{ q: string; a: string }> = []
                  faqs.push({
                    q: "Les charges sont-elles incluses ?",
                    a: annonce.charges
                      ? `Non, les charges s'élèvent à ${annonce.charges} €/mois en complément du loyer (${Number(annonce.prix) + Number(annonce.charges)} € CC au total).`
                      : "Oui, le loyer affiché est charges comprises (CC).",
                  })
                  if (typeof annonce.meuble === "boolean") {
                    faqs.push({
                      q: "Le logement est-il meublé ?",
                      a: annonce.meuble
                        ? "Oui, le logement est loué meublé. Bail type meublé d'une durée d'un an."
                        : "Non, le logement est loué vide. Bail type vide d'une durée de trois ans.",
                    })
                  }
                  faqs.push({
                    q: "Quand puis-je visiter le logement ?",
                    a: "Contactez le propriétaire via le bouton « Demander une visite » sur cette page. Il vous proposera plusieurs créneaux parmi lesquels choisir.",
                  })
                  faqs.push({
                    q: "Y a-t-il des frais d'agence ?",
                    a: "Non. KeyMatch met en relation directe locataires et propriétaires — zéro frais d'agence, zéro honoraires.",
                  })
                  // Politique animaux : prioritise tri-state animaux_politique
                  // (Paul 2026-04-27 V1.7) avec fallback boolean legacy. Skip
                  // si "indifferent" ou non renseigne — pas d'info utile.
                  {
                    const pol = (annonce.animaux_politique || "").toLowerCase()
                    let answer: string | null = null
                    if (pol === "oui") answer = "Oui, ce logement accepte les animaux."
                    else if (pol === "non") answer = "Non, le propriétaire n'accepte pas les animaux dans ce logement."
                    else if (typeof annonce.animaux === "boolean") {
                      answer = annonce.animaux
                        ? "Oui, ce logement accepte les animaux."
                        : "Le propriétaire n'accepte pas les animaux dans ce logement."
                    }
                    if (answer) {
                      faqs.push({ q: "Les animaux sont-ils acceptés ?", a: answer })
                    }
                  }
                  return faqs.map((f, i) => (
                    <details key={i} style={{ borderBottom: "1px solid #F7F4EF", paddingBottom: 12 }}>
                      <summary style={{ fontSize: 14, fontWeight: 600, color: "#111", cursor: "pointer", listStyle: "none", padding: "2px 0" }}>
                        {f.q}
                      </summary>
                      <p style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.6, marginTop: 10, marginBottom: 0 }}>
                        {f.a}
                      </p>
                    </details>
                  ))
                })()}
              </div>
            </section>
          </div>

          <div className="r-detail-sidebar" style={{ width: 360, flexShrink: 0 }}>
            {/* Sidebar droite : booking + profil recherché + activité + budget
                + partager, empilés en flex-column gap:16. Flow normal — défile
                avec la page (R12, scroll classique). Mobile <1024 : retombe
                en pleine largeur via media query (.r-detail-sidebar). */}
            <div
              id="r-sticky-card-target"
              style={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
            <div
              className="r-detail-stickycard"
              style={{
                background: "white",
                borderRadius: 20,
                padding: 28,
                boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
              }}
            >
              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.8px" }}>{annonce.prix} €</span>
                <span style={{ color: "#888", fontSize: 15, marginLeft: 4 }}>/mois</span>
                <p style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
                  {annonce.charges ? `Charges ${annonce.charges} € · ` : "Charges comprises · "}
                  Caution {annonce.caution || annonce.prix} €
                </p>
                {formatPublieIlYA(annonce.created_at) && (
                  <p style={{ color: "#8a8477", fontSize: 11, marginTop: 8, marginBottom: 0, textTransform: "uppercase", letterSpacing: "0.6px" }}>
                    {formatPublieIlYA(annonce.created_at)}
                  </p>
                )}
              </div>

              {annonce.charges && (
                <div style={{ background: "#F7F4EF", borderRadius: 12, padding: "12px 16px", marginBottom: 16, fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: "#8a8477" }}>Loyer CC</span>
                    <span style={{ fontWeight: 700 }}>{Number(annonce.prix) + Number(annonce.charges)} €</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#8a8477" }}>Dépôt de garantie</span>
                    <span style={{ fontWeight: 700 }}>{Number(annonce.caution || annonce.prix)} €</span>
                  </div>
                </div>
              )}

              {/* V9.1 — warning DPE F/G interdit en 2028 (loi Climat & Résilience). */}
              <DpeWarningBanner dpe={annonce.dpe} />

              <ScoreBlock annonce={annonce} />

              {/* V9.3 + V11.7 — Badge qualité de l'annonce. Pour le proprio
                  (owner) : grosse card visible en TOP juste apres le hero
                  ScoreBlock. Pour les locataires : bouge en BAS de la fiche
                  (cf. instance bottom plus loin) + version compact pill sur
                  mobile avec modal expand au tap. */}
              <QualiteAnnonceBadgeAdaptive
                placement="top"
                proprietaireEmail={annonce.proprietaire_email}
                annonce={{
                  photos: annonce.photos,
                  description: annonce.description,
                  message_proprietaire: annonce.message_proprietaire,
                  dpe: annonce.dpe,
                  localisation_exacte: annonce.localisation_exacte,
                  chambres: annonce.chambres,
                  pieces: annonce.pieces,
                  surface: annonce.surface,
                }}
              />

              {/* V9.4 — Compteur candidatures public + ancienneté annonce.
                  Color coding selon densite (gris/ambre/rouge). Owner-side cache. */}
              <CandidaturesCounter
                annonceId={annonce.id}
                annonceCreatedAt={annonce.created_at}
                proprietaireEmail={annonce.proprietaire_email}
              />

              {/* Mot du proprietaire — collecte Step 6 du wizard ajouter
                  (champ message_proprietaire). Etait orphelin (jamais affiche)
                  jusqu'au commit V1.1. Skip si vide. Style editorial : eyebrow
                  italique Fraunces + prose blockquote-like avec border-left
                  marque, fond beige #F7F4EF. */}
              {typeof annonce.message_proprietaire === "string" && annonce.message_proprietaire.trim().length > 0 && (
                <div style={{
                  background: "#F7F4EF",
                  borderLeft: "3px solid #111",
                  borderRadius: "0 12px 12px 0",
                  padding: "14px 18px",
                  marginBottom: 16,
                }}>
                  <p style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#8a8477",
                    textTransform: "uppercase",
                    letterSpacing: "1.4px",
                    margin: "0 0 6px",
                  }}>
                    Mot du propriétaire
                  </p>
                  <p style={{
                    fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif",
                    fontStyle: "italic",
                    fontWeight: 500,
                    fontSize: 15,
                    lineHeight: 1.55,
                    color: "#111",
                    margin: 0,
                    whiteSpace: "pre-wrap",
                  }}>
                    {annonce.message_proprietaire}
                  </p>
                </div>
              )}

              <ContactButton annonce={annonce} />
              <BookingVisite annonceId={annonce.id} proprietaireEmail={annonce.proprietaire_email} />
              <OwnerActions proprietaireEmail={annonce.proprietaire_email} annonceId={annonce.id} statut={annonce.statut} />
              <ViewTracker annonceId={annonce.id} />

              <div style={{ borderTop: "1px solid #F7F4EF", paddingTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 44, height: 44, background: "#EAE6DF", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, flexShrink: 0 }}>
                    {annonce.proprietaire?.[0] || "?"}
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{annonce.proprietaire || "Propriétaire"}</span>
                      {annonce.verifie && <span style={{ color: "#2563eb", fontSize: 12, fontWeight: 700 }}>✓ Vérifié</span>}
                    </div>
                    <span style={{ color: "#8a8477", fontSize: 12 }}>{annonce.membre}</span>
                  </div>
                </div>
                {/* Bio publique du propriétaire — affichée aux visiteurs
                    pour humaniser le contact. Editable depuis /parametres > Profil. */}
                {proprioBio && (
                  <blockquote style={{ margin: "12px 0 0", padding: "10px 14px", background: "#F7F4EF", borderLeft: "3px solid #111", borderRadius: "0 10px 10px 0", fontSize: 13, lineHeight: 1.55, color: "#111", fontStyle: "italic" }}>
                    &laquo;&nbsp;{proprioBio}&nbsp;&raquo;
                  </blockquote>
                )}
              </div>

              {/* Signalement (confidentiel, contenu inapproprié, arnaque, etc.) */}
              <div style={{ marginTop: 14, textAlign: "center" }}>
                <SignalerButton type="annonce" targetId={String(annonce.id)} label="Signaler cette annonce" compact hideForEmail={annonce.proprietaire_email} />
              </div>
            </div>

            {/* R10.17 — toutes les cards sidebar restent dans le widget fixé. */}
            <LocataireMatchCard annonce={annonce} />

            {(nbCandidatures > 0 || nbVues > 0 || annonce.dispo) && (
              <div style={{ background: "white", borderRadius: 20, padding: 22, boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0, marginBottom: 8 }}>
                  Activité
                </p>
                <h3 style={{ fontSize: 16, fontWeight: 400, fontStyle: "italic", fontFamily: "'Fraunces', 'DM Sans', serif", letterSpacing: "-0.3px", margin: 0, marginBottom: 12, color: "#111" }}>
                  Sur cette annonce
                </h3>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  {nbCandidatures > 0 && (
                    <li style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#111" }}>
                      <span style={{ color: "#666" }}>Candidatures envoyées</span>
                      <span style={{ fontWeight: 700 }}>{nbCandidatures}</span>
                    </li>
                  )}
                  {nbVues > 0 && (
                    <li style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#111" }}>
                      <span style={{ color: "#666" }}>Vues</span>
                      <span style={{ fontWeight: 700 }}>{nbVues}</span>
                    </li>
                  )}
                  {annonce.dispo && (
                    <li style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#111", gap: 10 }}>
                      <span style={{ color: "#666" }}>Disponibilité</span>
                      <span style={{ fontWeight: 700, textAlign: "right" }}>{annonce.dispo}</span>
                    </li>
                  )}
                </ul>
              </div>
            )}

            {annonce.prix && (
              <div style={{ background: "white", borderRadius: 20, padding: 22, boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0, marginBottom: 8 }}>
                  Budget
                </p>
                <h3 style={{ fontSize: 16, fontWeight: 400, fontStyle: "italic", fontFamily: "'Fraunces', 'DM Sans', serif", letterSpacing: "-0.3px", margin: 0, marginBottom: 12, color: "#111" }}>
                  À prévoir au départ
                </h3>
                {(() => {
                  const loyerCC = Number(annonce.prix) + Number(annonce.charges || 0)
                  const depot = Number(annonce.caution || annonce.prix)
                  const total = loyerCC + depot
                  return (
                    <>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                        <li style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ color: "#666" }}>1er loyer CC</span>
                          <span style={{ fontWeight: 600, color: "#111" }}>{loyerCC} €</span>
                        </li>
                        <li style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ color: "#666" }}>Dépôt de garantie</span>
                          <span style={{ fontWeight: 600, color: "#111" }}>{depot} €</span>
                        </li>
                      </ul>
                      <div style={{ borderTop: "1px solid #F7F4EF", marginTop: 10, paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#111", textTransform: "uppercase", letterSpacing: "0.6px" }}>Total</span>
                        <span style={{ fontSize: 20, fontWeight: 700, color: "#111", letterSpacing: "-0.4px" }}>{total} €</span>
                      </div>
                      <p style={{ fontSize: 11, color: "#8a8477", marginTop: 8, marginBottom: 0, lineHeight: 1.5 }}>
                        Zéro frais d&apos;agence — vous contactez directement le propriétaire.
                      </p>
                    </>
                  )
                })()}
              </div>
            )}

            <PartagerCard url={`${BASE_URL}/annonces/${id}`} titre={annonce.titre || "Bien à louer"} />
            </div>
          </div>
        </div>

        {/* R10.16 — Card "Autres biens du propriétaire" en bandeau full-width
            sous le layout 2-col. Sort de la sidebar pour éliminer le scroll
            dans le scroll imposé par le widget fixed. */}
        {nbAutresBiens >= 1 && (
          <div style={{ marginTop: 32, background: "white", borderRadius: 20, padding: "22px 28px", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0, marginBottom: 8 }}>
              Propriétaire
            </p>
            <p style={{ fontSize: 14, color: "#111", margin: 0, lineHeight: 1.5 }}>
              {annonce.proprietaire || "Ce propriétaire"} propose <strong>{nbAutresBiens} {nbAutresBiens === 1 ? "autre bien" : "autres biens"}</strong> en location.
            </p>
          </div>
        )}

        {similaires.length > 0 && (
          <section style={{ marginTop: 56 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "1.8px", margin: 0, marginBottom: 10 }}>
              Similaires
            </p>
            <h2 style={{ fontSize: 28, fontWeight: 500, letterSpacing: "-0.8px", margin: 0, marginBottom: 24, lineHeight: 1.15 }}>
              Autres biens à {annonce.ville}
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 20 }}>
              {similaires.map(s => {
                const firstPhoto = Array.isArray(s.photos) && s.photos.length > 0 ? s.photos[0] : null
                return (
                  <Link
                    key={s.id}
                    className="r-similar-card"
                    href={`/annonces/${s.id}`}
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      background: "white",
                      borderRadius: 20,
                      overflow: "hidden",
                      border: "1px solid #EAE6DF",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <div style={{ position: "relative", aspectRatio: "4 / 5", background: "#EAE6DF" }}>
                      {firstPhoto && (
                        <Image src={firstPhoto} alt={s.titre} fill sizes="240px" style={{ objectFit: "cover" }} />
                      )}
                    </div>
                    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: "#666", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0 }}>{s.ville}</p>
                      <p style={{ fontSize: 15, fontWeight: 500, margin: 0, letterSpacing: "-0.2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.titre}</p>
                      <p style={{ fontSize: 12, color: "#555", margin: 0 }}>{s.surface} m² · {s.pieces} p.</p>
                      <p style={{ fontSize: 15, fontWeight: 700, margin: "auto 0 0", color: "#111" }}>{s.prix} €<span style={{ fontSize: 12, color: "#888", fontWeight: 400 }}>/mois</span></p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}
      </div>

      {/* R10.10 — Bandeau sticky bas, visible uniquement quand la card sticky
          droite sort du viewport. Ne s'affiche pas pour les propriétaires
          sur leur propre annonce (géré côté composant). */}
      <StickyCTABanner annonce={annonce} />
    </main>
  )
}
