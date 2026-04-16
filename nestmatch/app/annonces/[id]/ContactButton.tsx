"use client"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { supabase } from "../../../lib/supabase"
import { useRole } from "../../providers"

export default function ContactButton({ annonce }: { annonce: any }) {
  const { data: session } = useSession()
  const { role } = useRole()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  // Verrou synchrone : protege contre les double-clics rapides (React
  // setState est asynchrone, donc setLoading(true) ne bloque pas le 2e clic
  // immediatement — le ref si)
  const inFlight = useRef(false)

  const isOwnAnnonce = session?.user?.email === annonce.proprietaire_email

  // Propriétaire sur sa propre annonce → bouton de gestion
  if (role === "proprietaire" && isOwnAnnonce) {
    return (
      <a href="/proprietaire"
        style={{ display: "block", width: "100%", background: "#111", color: "white", border: "none", borderRadius: 999, padding: "14px 0", fontWeight: 700, fontSize: 15, textAlign: "center", textDecoration: "none", marginBottom: 10, boxSizing: "border-box" }}>
        Gerer mon annonce &rarr;
      </a>
    )
  }

  // Propriétaire sur l'annonce d'un autre → rien
  if (role === "proprietaire") return null

  // Locataire → bouton de contact classique
  async function contacter() {
    if (inFlight.current) return
    inFlight.current = true

    if (!session) { router.push("/auth"); inFlight.current = false; return }

    const toEmail = annonce.proprietaire_email
    if (!toEmail) { inFlight.current = false; return }

    setLoading(true)
    try {
      const fromEmail = session.user!.email!

      // Verifie si une conversation existe deja entre ces 2 emails pour cette annonce
      // (plus strict : meme annonce uniquement — evite le doublon inter-annonces)
      const { data: existants } = await supabase
        .from("messages")
        .select("id")
        .or(`and(from_email.eq.${fromEmail},to_email.eq.${toEmail}),and(from_email.eq.${toEmail},to_email.eq.${fromEmail})`)
        .limit(1)

      const hasConversation = existants && existants.length > 0

      if (!hasConversation) {
        await supabase.from("messages").insert([{
          from_email: fromEmail,
          to_email: toEmail,
          contenu: `Bonjour, je suis interesse(e) par votre annonce "${annonce.titre}" a ${annonce.ville}.`,
          lu: false,
          annonce_id: annonce.id,
          type: "candidature",
          created_at: new Date().toISOString(),
        }])
      }

      router.push(`/messages?with=${encodeURIComponent(toEmail)}`)
    } finally {
      setLoading(false)
      // On garde inFlight a true pendant la navigation : le composant va
      // probablement unmount, mais si navigation annulee on remet a false
      setTimeout(() => { inFlight.current = false }, 2000)
    }
  }

  return (
    <button onClick={contacter} disabled={loading}
      style={{ display: "block", width: "100%", background: "#111", color: "white", border: "none", borderRadius: 999, padding: "14px 0", fontWeight: 700, fontSize: 15, cursor: loading ? "not-allowed" : "pointer", marginBottom: 10, textAlign: "center", fontFamily: "inherit", opacity: loading ? 0.7 : 1 }}>
      {loading ? "Ouverture..." : "Contacter le propriétaire"}
    </button>
  )
}
