import type { Metadata } from "next"
import { supabase } from "../../../lib/supabase"
import { getCityCoords } from "../../../lib/cityCoords"
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
import Link from "next/link"

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://keymatch-immo.fr'

export async function generateMetadata({ params }: any): Promise<Metadata> {
  const { id } = await params
  const { data: annonce } = await supabase.from("annonces").select("titre,description,ville,prix,surface,pieces,photos").eq("id", id).single()

  if (!annonce) {
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
  if (annonce?.id) {
    const [{ count: vuesCount }, { count: candCount }] = await Promise.all([
      supabase.from("clics_annonces").select("annonce_id", { count: "exact", head: true }).eq("annonce_id", annonce.id),
      supabase.from("messages").select("id", { count: "exact", head: true }).eq("annonce_id", annonce.id),
    ])
    nbVues = vuesCount ?? 0
    nbCandidatures = candCount ?? 0
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
      .limit(4)
    similaires = sim || []
  }

  if (!annonce) return (
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

  const dpeColor: any = { A: "#22c55e", B: "#84cc16", C: "#eab308", D: "#f97316", E: "#ef4444", F: "#dc2626", G: "#991b1b" }
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
      <div className="r-container" style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 48px" }}>
        {/* Breadcrumbs visibles (reflet du JSON-LD BreadcrumbList). Google
            affiche ça comme fil d'Ariane enrichi dans les SERP. */}
        <nav aria-label="Fil d'Ariane" style={{ marginBottom: 14 }}>
          <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexWrap: "wrap", gap: 6, fontSize: 13, color: "#6b7280" }}>
            <li>
              <a href="/" style={{ color: "#6b7280", textDecoration: "none" }}>Accueil</a>
            </li>
            <li aria-hidden style={{ color: "#d1d5db" }}>›</li>
            <li>
              <a href="/annonces" style={{ color: "#6b7280", textDecoration: "none" }}>Annonces</a>
            </li>
            {annonce.ville && (
              <>
                <li aria-hidden style={{ color: "#d1d5db" }}>›</li>
                <li>
                  <a href={`/location/${encodeURIComponent(String(annonce.ville).toLowerCase())}`} style={{ color: "#6b7280", textDecoration: "none" }}>
                    Location {annonce.ville}
                  </a>
                </li>
              </>
            )}
            <li aria-hidden style={{ color: "#d1d5db" }}>›</li>
            <li aria-current="page" style={{ color: "#111", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 340 }}>
              {annonce.titre}
            </li>
          </ol>
        </nav>
        <a href="/annonces" style={{ fontSize: 14, color: "#6b7280", textDecoration: "none" }}>← Retour aux annonces</a>

        {proprioVacances.actif && (
          <div style={{ background: "#fff7ed", border: "1.5px solid #fed7aa", borderRadius: 14, padding: "14px 18px", margin: "16px 0 0", color: "#9a3412" }}>
            <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Délai de réponse prolongé</p>
            <p style={{ fontSize: 13, color: "#7c2d12", margin: "6px 0 0", lineHeight: 1.5 }}>
              {proprioVacances.message || "Le propriétaire indique un délai de réponse plus long que d'habitude. Vous pouvez quand même postuler."}
            </p>
          </div>
        )}

        <div className="r-detail-header" style={{ margin: "16px 0 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.5px" }}>{annonce.titre}</h1>
            <p style={{ color: "#6b7280", marginTop: 4 }}>
              {annonce.localisation_exacte && annonce.adresse ? `${annonce.adresse} · ${annonce.ville}` : annonce.ville}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, marginLeft: 16 }}>
            <span style={{ background: annonce.dispo === "Disponible maintenant" ? "#dcfce7" : "#fff7ed", color: annonce.dispo === "Disponible maintenant" ? "#16a34a" : "#ea580c", padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
              {annonce.dispo}
            </span>
            <ShareButton title={annonce.titre || "Logement à louer"} url={`${BASE_URL}/annonces/${id}`} />
            <FavoriButton id={annonce.id} />
          </div>
        </div>

        {annonce.statut === "loué" && (
          <div style={{ background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 14, padding: "14px 18px", marginBottom: 16, color: "#991b1b", fontSize: 14, fontWeight: 600 }}>
            Cette annonce n&apos;est plus disponible — le bien a déjà été loué.
            {" "}
            <a href="/annonces" style={{ color: "#991b1b", fontWeight: 700, textDecoration: "underline" }}>Voir d&apos;autres biens →</a>
          </div>
        )}

        {(nbVues >= 5 || nbCandidatures >= 2) && annonce.statut !== "loué" && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {nbVues >= 5 && (
              <span style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e40af", fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 999 }}>
                {nbVues} personnes ont consulté ce bien
              </span>
            )}
            {nbCandidatures >= 2 && (
              <span style={{ background: "#fff7ed", border: "1px solid #fed7aa", color: "#c2410c", fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 999 }}>
                Plusieurs candidats déjà intéressés
              </span>
            )}
          </div>
        )}

        <PhotoCarousel photos={photos} />

        <div className="r-detail-layout" style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
              {[
                { val: annonce.surface ? `${annonce.surface}` : "—", label: "m²" },
                { val: annonce.pieces || "—", label: "pièces" },
                { val: annonce.chambres !== null && annonce.chambres !== undefined ? annonce.chambres : "—", label: "chambres" },
                { val: annonce.etage || "—", label: "étage" },
              ].map(item => (
                <div key={item.label} style={{ background: "white", borderRadius: 14, padding: "14px 18px", textAlign: "center", flex: 1, minWidth: 70 }}>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{item.val}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{item.label}</div>
                </div>
              ))}
              {annonce.dpe && (
                <div style={{ background: "white", borderRadius: 14, padding: "14px 18px", textAlign: "center", flex: 1, minWidth: 70 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "white", background: dpeColor[annonce.dpe] || "#6b7280", width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>{annonce.dpe}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>DPE</div>
                </div>
              )}
            </div>

            <div style={{ background: "white", borderRadius: 20, padding: 24, marginBottom: 20 }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 16 }}>Équipements & conditions</h2>
              <div className="r-detail-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { label: "Meublé", val: annonce.meuble },
                  { label: "Animaux acceptés", val: annonce.animaux },
                  { label: "Parking inclus", val: annonce.parking },
                  { label: "Cave", val: annonce.cave },
                  { label: "Fibre optique", val: annonce.fibre },
                  { label: "Balcon", val: annonce.balcon },
                  { label: "Terrasse", val: annonce.terrasse },
                  { label: "Ascenseur", val: annonce.ascenseur },
                ].map(item => (
                  <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
                    <span style={{ width: 24, height: 24, borderRadius: "50%", background: item.val ? "#dcfce7" : "#f3f4f6", color: item.val ? "#16a34a" : "#9ca3af", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                      {item.val ? "✓" : "✗"}
                    </span>
                    <span style={{ color: item.val ? "#111" : "#9ca3af" }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {annonce.description && (
              <div style={{ background: "white", borderRadius: 20, padding: 24, marginBottom: 20 }}>
                <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 12 }}>Description</h2>
                <p style={{ color: "#4b5563", lineHeight: 1.7 }}>{annonce.description}</p>
              </div>
            )}

            {annonce.ville && (
              <div style={{ background: "white", borderRadius: 20, padding: 24 }}>
                <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>Localisation</h2>
                <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 14 }}>
                  {annonce.localisation_exacte && annonce.adresse
                    ? `${annonce.adresse} · ${annonce.ville}`
                    : `${annonce.ville} — zone approximative`}
                </p>
                <MapBienWrapper
                  lat={initialCoords.lat}
                  lng={initialCoords.lng}
                  ville={annonce.ville || ""}
                  exact={!!annonce.localisation_exacte && hasExactCoords}
                />
              </div>
            )}
          </div>

          <div className="r-detail-sidebar" style={{ width: 360, flexShrink: 0 }}>
            <div style={{ background: "white", borderRadius: 20, padding: 28, boxShadow: "0 4px 24px rgba(0,0,0,0.08)", position: "sticky", top: 80 }}>
              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 32, fontWeight: 800 }}>{annonce.prix} €</span>
                <span style={{ color: "#6b7280", fontSize: 15 }}>/mois</span>
                {annonce.charges && <p style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>+ {annonce.charges} € de charges</p>}
              </div>

              {annonce.charges && (
                <div style={{ background: "#f9fafb", borderRadius: 12, padding: "12px 16px", marginBottom: 16, fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: "#6b7280" }}>Loyer CC</span>
                    <span style={{ fontWeight: 700 }}>{Number(annonce.prix) + Number(annonce.charges)} €</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#6b7280" }}>Dépôt de garantie</span>
                    <span style={{ fontWeight: 700 }}>{Number(annonce.caution || annonce.prix)} €</span>
                  </div>
                </div>
              )}

              <ScoreBlock annonce={annonce} />
              <ContactButton annonce={annonce} />
              <BookingVisite annonceId={annonce.id} proprietaireEmail={annonce.proprietaire_email} />
              <OwnerActions proprietaireEmail={annonce.proprietaire_email} annonceId={annonce.id} />
              <ViewTracker annonceId={annonce.id} />

              <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 44, height: 44, background: "#e5e7eb", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, flexShrink: 0 }}>
                    {annonce.proprietaire?.[0] || "?"}
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{annonce.proprietaire || "Propriétaire"}</span>
                      {annonce.verifie && <span style={{ color: "#2563eb", fontSize: 12, fontWeight: 700 }}>✓ Vérifié</span>}
                    </div>
                    <span style={{ color: "#9ca3af", fontSize: 12 }}>{annonce.membre}</span>
                  </div>
                </div>
                {/* Bio publique du propriétaire — affichée aux visiteurs
                    pour humaniser le contact. Editable depuis /parametres > Profil. */}
                {proprioBio && (
                  <blockquote style={{ margin: "12px 0 0", padding: "10px 14px", background: "#F7F4EF", borderLeft: "3px solid #111", borderRadius: "0 10px 10px 0", fontSize: 13, lineHeight: 1.55, color: "#374151", fontStyle: "italic" }}>
                    &laquo;&nbsp;{proprioBio}&nbsp;&raquo;
                  </blockquote>
                )}
              </div>

              {/* Signalement (confidentiel, contenu inapproprié, arnaque, etc.) */}
              <div style={{ marginTop: 14, textAlign: "center" }}>
                <SignalerButton type="annonce" targetId={String(annonce.id)} label="Signaler cette annonce" compact hideForEmail={annonce.proprietaire_email} />
              </div>
            </div>
          </div>
        </div>

        {similaires.length > 0 && (
          <section style={{ marginTop: 48 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Autres biens similaires à {annonce.ville}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
              {similaires.map(s => {
                const firstPhoto = Array.isArray(s.photos) && s.photos.length > 0 ? s.photos[0] : null
                return (
                  <Link key={s.id} href={`/annonces/${s.id}`} style={{ textDecoration: "none", color: "inherit", background: "white", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", transition: "transform .15s ease" }}>
                    <div style={{ background: "#f3f4f6", height: 140, backgroundImage: firstPhoto ? `url(${firstPhoto})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }} />
                    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                      <p style={{ fontSize: 14, fontWeight: 800, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.titre}</p>
                      <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>{s.ville} · {s.surface} m² · {s.pieces} pièces</p>
                      <p style={{ fontSize: 15, fontWeight: 800, margin: "auto 0 0", color: "#111" }}>{s.prix} €<span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>/mois</span></p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
