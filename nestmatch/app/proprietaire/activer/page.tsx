"use client"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { supabase } from "../../../lib/supabase"
import { useRole } from "../../providers"
import { km, KMButton, KMButtonText, KMCard, KMEyebrow, KMHeading } from "../../components/ui/km"

export default function ActiverProprietaire() {
  const { data: session, status } = useSession()
  const { setRole, setProprietaireActive } = useRole()
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  if (status === "unauthenticated") {
    router.push("/auth")
    return null
  }

  async function activer() {
    if (!session?.user?.email) return
    setLoading(true)
    try {
      // Upsert is_proprietaire dans le profil
      await supabase.from("profils").upsert({
        email: session.user.email,
        is_proprietaire: true,
      }, { onConflict: "email" })

      setProprietaireActive(true)
      setRole("proprietaire")
      router.push("/proprietaire")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{
      minHeight: "100vh",
      background: km.beige,
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 24px",
    }}>
      <div style={{ maxWidth: 560, width: "100%" }}>

        <KMCard padding="48px 40px" style={{ textAlign: "center", borderRadius: 24 }}>
          {/* Eyebrow éditorial — remplace le carré noir décoratif par un marqueur typographique */}
          <KMEyebrow style={{ marginBottom: 14 }}>Espace bailleur</KMEyebrow>

          <KMHeading as="h1" size={34} style={{ marginBottom: 14 }}>
            Activer l&apos;espace propriétaire
          </KMHeading>

          <p style={{
            color: km.muted,
            fontSize: 15,
            lineHeight: 1.6,
            marginBottom: 32,
            maxWidth: 420,
            marginLeft: "auto",
            marginRight: "auto",
          }}>
            Cet espace est réservé aux propriétaires qui souhaitent mettre leur bien en location.
            En l&apos;activant, vous pourrez publier des annonces, recevoir des candidatures et gérer vos locations.
          </p>

          {/* Trio de bénéfices — style éditorial (pas de cartes beiges, séparateurs hairline) */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 0,
            marginBottom: 36,
            borderTop: `1px solid ${km.line}`,
            borderBottom: `1px solid ${km.line}`,
          }}>
            {[
              { num: "01", title: "Publiez", desc: "Ajoutez vos biens en quelques minutes" },
              { num: "02", title: "Ciblez", desc: "Recevez des candidats compatibles" },
              { num: "03", title: "Gérez", desc: "Messagerie et suivi des loyers" },
            ].map((item, i) => (
              <div key={item.title} style={{
                padding: "20px 12px",
                borderLeft: i > 0 ? `1px solid ${km.line}` : "none",
                textAlign: "left",
              }}>
                <div style={{
                  fontFamily: "var(--font-fraunces), 'Fraunces', Georgia, serif",
                  fontStyle: "italic",
                  fontWeight: 500,
                  fontSize: 18,
                  color: km.muted,
                  marginBottom: 6,
                }}>{item.num}</div>
                <div style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: km.ink,
                  textTransform: "uppercase",
                  letterSpacing: "1.4px",
                  marginBottom: 6,
                }}>{item.title}</div>
                <div style={{ fontSize: 12, color: km.muted, lineHeight: 1.45 }}>{item.desc}</div>
              </div>
            ))}
          </div>

          <KMButton
            onClick={activer}
            disabled={loading || status === "loading"}
            size="lg"
            style={{ width: "100%", marginBottom: 14 }}>
            {loading ? "Activation…" : "Activer mon espace propriétaire"}
          </KMButton>

          <KMButtonText onClick={() => router.push("/annonces")}>
            Je suis locataire · retour aux annonces
          </KMButtonText>
        </KMCard>

        <p style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: km.muted }}>
          Vous pourrez repasser en mode locataire à tout moment depuis la barre de navigation.
        </p>
      </div>
    </main>
  )
}
