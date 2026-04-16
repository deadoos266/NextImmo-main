"use client"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { supabase } from "../../../lib/supabase"
import { useRole } from "../../providers"

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
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 24px" }}>
      <div style={{ maxWidth: 560, width: "100%" }}>

        <div style={{ background: "white", borderRadius: 24, padding: "48px 40px", boxShadow: "0 4px 32px rgba(0,0,0,0.08)", textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "#111", margin: "0 auto 20px" }} />
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 12 }}>
            Espace propriétaire
          </h1>
          <p style={{ color: "#6b7280", fontSize: 15, lineHeight: 1.6, marginBottom: 32 }}>
            Cet espace est réservé aux propriétaires qui souhaitent mettre leur bien en location.
            En activant ce mode, vous pourrez publier des annonces, recevoir des candidatures et gérer vos locations.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 36 }}>
            {[
              { title: "Publiez", desc: "Ajoutez vos biens en quelques minutes" },
              { title: "Ciblez", desc: "Recevez des candidats compatibles" },
              { title: "Gérez", desc: "Messagerie et suivi des loyers" },
            ].map(item => (
              <div key={item.title} style={{ background: "#f9fafb", borderRadius: 14, padding: "16px 12px" }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.4 }}>{item.desc}</div>
              </div>
            ))}
          </div>

          <button
            onClick={activer}
            disabled={loading || status === "loading"}
            style={{ width: "100%", background: "#111", color: "white", border: "none", borderRadius: 999, padding: "16px 0", fontWeight: 700, fontSize: 16, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: loading ? 0.7 : 1, marginBottom: 12 }}>
            {loading ? "Activation..." : "Activer mon espace propriétaire"}
          </button>

          <button
            onClick={() => router.push("/annonces")}
            style={{ background: "none", border: "none", color: "#6b7280", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Je suis locataire, retour aux annonces
          </button>
        </div>

        <p style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "#9ca3af" }}>
          Vous pourrez repasser en mode locataire à tout moment depuis la barre de navigation.
        </p>
      </div>
    </main>
  )
}
