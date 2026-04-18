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

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://nestmatch.fr'

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
    : `${titre}${ville}${surface}${pieces}${prix}. Contactez directement le propriétaire sur NestMatch, zéro frais d'agence.`

  const photo = Array.isArray(annonce.photos) && annonce.photos.length > 0 ? annonce.photos[0] : null
  const ogImage = photo || '/og-default.png'
  const pageUrl = `${BASE_URL}/annonces/${id}`

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      type: "website",
      url: pageUrl,
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: titre }],
      locale: "fr_FR",
      siteName: "NestMatch",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  }
}

export default async function Annonce({ params }: any) {
  const { id } = await params
  const { data: annonce } = await supabase.from("annonces").select("*").eq("id", id).single()

  if (!annonce) return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Annonce introuvable</h1>
        <a href="/annonces" style={{ color: "#111", fontWeight: 600, textDecoration: "none" }}>← Retour aux annonces</a>
      </div>
    </main>
  )

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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: annonce.titre,
    description: annonce.description || `${annonce.titre} à ${annonce.ville}`,
    url: `${BASE_URL}/annonces/${id}`,
    image: photos.length > 0 ? photos : undefined,
    address: {
      "@type": "PostalAddress",
      addressLocality: annonce.ville,
      addressCountry: "FR",
      streetAddress: annonce.localisation_exacte ? (annonce.adresse || undefined) : undefined,
    },
    offers: {
      "@type": "Offer",
      price: annonce.prix,
      priceCurrency: "EUR",
      availability: annonce.dispo === "Disponible maintenant"
        ? "https://schema.org/InStock"
        : "https://schema.org/PreOrder",
    },
    floorSize: annonce.surface ? {
      "@type": "QuantitativeValue",
      value: annonce.surface,
      unitCode: "MTK",
    } : undefined,
    numberOfRooms: annonce.pieces || undefined,
  }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <div className="r-container" style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 48px" }}>
        <a href="/annonces" style={{ fontSize: 14, color: "#6b7280", textDecoration: "none" }}>← Retour aux annonces</a>

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
            <FavoriButton id={annonce.id} />
          </div>
        </div>

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

              <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
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

              {/* Signalement (confidentiel, contenu inapproprié, arnaque, etc.) */}
              <div style={{ marginTop: 14, textAlign: "center" }}>
                <SignalerButton type="annonce" targetId={String(annonce.id)} label="Signaler cette annonce" compact hideForEmail={annonce.proprietaire_email} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
