/**
 * V97.39.34 — /agence/[slug] — Page publique agence
 *
 * Vitrine SEO de l'agence : logo, bio, liste des biens en location actifs.
 * Branding hybride : logo + couleur primaire visibles ici, mais les annonces
 * dans le feed public général gardent l'UI KeyMatch.
 *
 * SSR pour SEO + JSON-LD LocalBusiness.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import { supabaseAdmin } from "@/lib/supabase-server"
import type { Metadata } from "next"

interface AgencePublicData {
  id: string
  slug: string
  name: string
  raison_sociale: string
  ville: string | null
  code_postal: string | null
  logo_url: string | null
  couleur_primaire: string | null
  bio: string | null
  statut: string
  email: string
  telephone: string | null
}

interface AnnonceCard {
  id: number
  titre: string
  ville: string
  prix: string
  charges: string | null
  surface: string | null
  pieces: string | null
  type_bien: string | null
  photos: string[] | null
  statut: string | null
}

async function fetchAgence(slug: string): Promise<AgencePublicData | null> {
  const { data } = await supabaseAdmin
    .from("agences")
    .select("id, slug, name, raison_sociale, ville, code_postal, logo_url, couleur_primaire, bio, statut, email, telephone")
    .eq("slug", slug)
    .single()
  return (data as AgencePublicData | null) ?? null
}

async function fetchAgenceAnnonces(agenceId: string): Promise<AnnonceCard[]> {
  const { data } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, ville, prix, charges, surface, pieces, type_bien, photos, statut")
    .eq("agence_id", agenceId)
    .or("statut.is.null,statut.eq.disponible")
    .order("id", { ascending: false })
    .limit(50)
  return (data as AnnonceCard[] | null) ?? []
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params
  const a = await fetchAgence(slug)
  if (!a || a.statut !== "active") {
    return { title: "Agence introuvable", robots: { index: false } }
  }
  return {
    title: `${a.name} — Agence immobilière ${a.ville || ""}`,
    description: a.bio || `Découvrez les biens à louer proposés par ${a.name}, agence immobilière partenaire KeyMatch.`,
    alternates: { canonical: `/agence/${a.slug}` },
    openGraph: {
      title: a.name,
      description: a.bio || `Agence partenaire KeyMatch — ${a.ville || ""}`,
      images: a.logo_url ? [a.logo_url] : undefined,
      type: "website",
    },
  }
}

export const dynamic = "force-dynamic"

export default async function AgencePublicPage(
  { params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ signup_pending?: string }> },
) {
  const { slug } = await params
  const sp = await searchParams
  const isSignupPending = sp.signup_pending === "1"

  const agence = await fetchAgence(slug)
  if (!agence) notFound()
  if (agence.statut === "refused" || agence.statut === "banned") notFound()

  const annonces = agence.statut === "active" ? await fetchAgenceAnnonces(agence.id) : []
  const couleur = agence.couleur_primaire || "#111"

  return (
    <div style={{ maxWidth: 1100, margin: "40px auto", padding: "0 20px 80px" }}>
      {/* Signup pending banner */}
      {isSignupPending && (
        <div style={{
          padding: 20,
          background: "#FFF7E0",
          border: "1px solid #F5D982",
          borderRadius: 16,
          marginBottom: 24,
        }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: "#111", marginBottom: 6 }}>
            ✓ Inscription enregistrée
          </div>
          <div style={{ fontSize: 13, color: "#444" }}>
            Votre agence est en attente de validation manuelle de la carte professionnelle T
            par l&apos;équipe KeyMatch (délai 48 h ouvrées). Vous recevrez un email à{" "}
            <strong>{agence.email}</strong> dès validation. Cette page sera publique à ce moment-là.
          </div>
        </div>
      )}

      {/* Header agence */}
      <header style={{
        display: "flex",
        gap: 24,
        alignItems: "flex-start",
        flexWrap: "wrap",
        padding: 32,
        background: "white",
        border: "1px solid #EAE6DF",
        borderRadius: 20,
        marginBottom: 24,
      }}>
        {agence.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={agence.logo_url}
            alt={`Logo ${agence.name}`}
            style={{
              width: 96,
              height: 96,
              borderRadius: 14,
              objectFit: "contain",
              background: "#F7F4EF",
              border: "1px solid #EAE6DF",
            }}
          />
        ) : (
          <div style={{
            width: 96,
            height: 96,
            borderRadius: 14,
            background: couleur,
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 36,
            fontWeight: 600,
            fontFamily: "var(--font-fraunces), serif",
          }}>
            {agence.name.charAt(0)}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <span style={{
              padding: "3px 10px",
              borderRadius: 999,
              background: couleur,
              color: "white",
              fontSize: 11,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}>
              ✓ Pro vérifié
            </span>
            {agence.statut === "pending" && (
              <span style={{
                padding: "3px 10px",
                borderRadius: 999,
                background: "#FFF7E0",
                color: "#7a5a00",
                fontSize: 11,
                fontWeight: 500,
              }}>
                En attente validation
              </span>
            )}
          </div>
          <h1 style={{
            fontFamily: "var(--font-fraunces), 'Fraunces', serif",
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: 36,
            color: "#111",
            margin: "0 0 6px",
          }}>
            {agence.name}
          </h1>
          <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
            {agence.raison_sociale}
            {agence.ville && ` · ${agence.ville}${agence.code_postal ? ` (${agence.code_postal})` : ""}`}
          </div>
          {agence.bio && (
            <p style={{ fontSize: 14, color: "#333", lineHeight: 1.6, margin: 0 }}>
              {agence.bio}
            </p>
          )}
          <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
            <a
              href={`mailto:${agence.email}`}
              style={{
                padding: "8px 16px",
                background: couleur,
                color: "white",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Contacter l&apos;agence
            </a>
            {agence.telephone && (
              <a
                href={`tel:${agence.telephone.replace(/\s/g, "")}`}
                style={{
                  padding: "8px 16px",
                  border: "1px solid #EAE6DF",
                  background: "white",
                  color: "#111",
                  borderRadius: 10,
                  fontSize: 13,
                  textDecoration: "none",
                }}
              >
                ☎ {agence.telephone}
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Liste annonces */}
      {agence.statut === "active" && (
        <section>
          <h2 style={{
            fontFamily: "var(--font-fraunces), serif",
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: 24,
            color: "#111",
            marginBottom: 20,
          }}>
            Biens à louer ({annonces.length})
          </h2>
          {annonces.length === 0 ? (
            <div style={{
              padding: 32,
              background: "white",
              border: "1px solid #EAE6DF",
              borderRadius: 16,
              textAlign: "center",
              color: "#666",
              fontSize: 14,
            }}>
              Aucune annonce en ligne pour le moment.
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 16,
            }}>
              {annonces.map(a => (
                <Link
                  key={a.id}
                  href={`/annonces/${a.id}`}
                  style={{
                    display: "block",
                    background: "white",
                    border: "1px solid #EAE6DF",
                    borderRadius: 16,
                    overflow: "hidden",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{
                    height: 160,
                    background: "#F7F4EF",
                    backgroundImage: a.photos && a.photos[0] ? `url(${a.photos[0]})` : undefined,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }} />
                  <div style={{ padding: 16 }}>
                    <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", marginBottom: 4 }}>
                      {a.type_bien || "Appartement"} · {a.ville}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: "#111", marginBottom: 6 }}>
                      {a.titre}
                    </div>
                    <div style={{ fontSize: 14, color: "#111", fontWeight: 600 }}>
                      {a.prix} €/mois
                      <span style={{ fontSize: 12, fontWeight: 400, color: "#666" }}>
                        {a.charges ? ` + ${a.charges} € charges` : ""}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                      {a.surface && `${a.surface} m²`}
                      {a.pieces && ` · ${a.pieces} pièces`}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* JSON-LD LocalBusiness */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "RealEstateAgent",
            name: agence.name,
            legalName: agence.raison_sociale,
            url: `https://keymatch-immo.fr/agence/${agence.slug}`,
            image: agence.logo_url || undefined,
            address: agence.ville ? {
              "@type": "PostalAddress",
              addressLocality: agence.ville,
              postalCode: agence.code_postal || undefined,
              addressCountry: "FR",
            } : undefined,
            email: agence.email,
            telephone: agence.telephone || undefined,
            description: agence.bio || undefined,
          }),
        }}
      />
    </div>
  )
}
