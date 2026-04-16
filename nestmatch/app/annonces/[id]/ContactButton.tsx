"use client"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { supabase } from "../../../lib/supabase"
import { useRole } from "../../providers"

export default function ContactButton({ annonce }: { annonce: any }) {
  const { data: session } = useSession()
  const { role } = useRole()
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const isOwnAnnonce = session?.user?.email === annonce.proprietaire_email

  // Propriétaire sur sa propre annonce → bouton de gestion
  if (role === "proprietaire" && isOwnAnnonce) {
    return (
      <a href="/proprietaire"
        style={{ display: "block", width: "100%", background: "#111", color: "white", border: "none", borderRadius: 999, padding: "14px 0", fontWeight: 700, fontSize: 15, textAlign: "center", textDecoration: "none", marginBottom: 10, boxSizing: "border-box" }}>
        Gérer mon annonce →
      </a>
    )
  }

  // Propriétaire sur l'annonce d'un autre → rien
  if (role === "proprietaire") return null

  // Locataire → bouton de contact classique
  async function contacter() {
    if (!session) { router.push("/auth"); return }

    const toEmail = annonce.proprietaire_email
    if (!toEmail) return

    setLoading(true)
    try {
      const fromEmail = session.user!.email!

      const [{ data: r1 }, { data: r2 }] = await Promise.all([
        supabase.from("messages").select("id").eq("from_email", fromEmail).eq("to_email", toEmail).limit(1),
        supabase.from("messages").select("id").eq("from_email", toEmail).eq("to_email", fromEmail).limit(1),
      ])

      const hasConversation = (r1 && r1.length > 0) || (r2 && r2.length > 0)

      if (!hasConversation) {
        await supabase.from("messages").insert([{
          from_email: fromEmail,
          to_email: toEmail,
          contenu: `Bonjour, je suis intéressé(e) par votre annonce "${annonce.titre}" à ${annonce.ville}.`,
          lu: false,
          annonce_id: annonce.id,
          type: "candidature",
          created_at: new Date().toISOString(),
        }])
      }

      router.push(`/messages?with=${encodeURIComponent(toEmail)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button onClick={contacter} disabled={loading}
      style={{ display: "block", width: "100%", background: "#111", color: "white", border: "none", borderRadius: 999, padding: "14px 0", fontWeight: 700, fontSize: 15, cursor: loading ? "not-allowed" : "pointer", marginBottom: 10, textAlign: "center", fontFamily: "inherit", opacity: loading ? 0.7 : 1 }}>
      {loading ? "Ouverture..." : "Contacter le propriétaire"}
    </button>
  )
}
