/**
 * V97.39.34 — Phase A.2 — Encart agence sur la page détail annonce.
 *
 * Affiché uniquement si l'annonce a un agence_id et que l'agence est statut=active.
 * Donne au locataire la confiance que cette annonce vient d'un acteur professionnel
 * vérifié (carte T loi Hoguet validée par KeyMatch).
 */

import Link from "next/link"

interface AgenceMini {
  id: string
  slug: string
  name: string
  logo_url: string | null
  couleur_primaire: string | null
  ville: string | null
  bio: string | null
  statut: string
  telephone: string | null
  email: string
}

export default function AgenceCardDetail({ agence }: { agence: AgenceMini | null }) {
  if (!agence || agence.statut !== "active") return null
  const couleur = agence.couleur_primaire || "#0a7c3e"

  return (
    <section style={{
      background: "white",
      border: "1px solid #EAE6DF",
      borderRadius: 20,
      padding: 24,
      marginTop: 24,
      marginBottom: 24,
    }}>
      <div style={{
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: 1.2,
        color: couleur,
        fontWeight: 600,
        marginBottom: 12,
      }}>
        ✓ Annonce publiée par un professionnel vérifié
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        {agence.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={agence.logo_url}
            alt={`Logo ${agence.name}`}
            style={{
              width: 64,
              height: 64,
              borderRadius: 12,
              objectFit: "contain",
              background: "#F7F4EF",
              border: "1px solid #EAE6DF",
            }}
          />
        ) : (
          <div style={{
            width: 64,
            height: 64,
            borderRadius: 12,
            background: couleur,
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            fontWeight: 600,
            fontFamily: "var(--font-fraunces), serif",
          }}>
            {agence.name.charAt(0)}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{
            fontFamily: "var(--font-fraunces), serif",
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: 22,
            color: "#111",
            marginBottom: 4,
          }}>
            {agence.name}
          </div>
          {agence.ville && (
            <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
              {agence.ville}
            </div>
          )}
          {agence.bio && (
            <p style={{ fontSize: 13, color: "#333", lineHeight: 1.6, margin: "0 0 12px" }}>
              {agence.bio}
            </p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link
              href={`/agence/${agence.slug}`}
              style={{
                padding: "8px 14px",
                background: couleur,
                color: "white",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Voir tous ses biens →
            </Link>
            {agence.telephone && (
              <a
                href={`tel:${agence.telephone.replace(/\s/g, "")}`}
                style={{
                  padding: "8px 14px",
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
      </div>
    </section>
  )
}
