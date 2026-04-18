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

      // Verifie si une candidature existe deja entre ces 2 emails POUR CETTE ANNONCE
      // (scopé par annonce_id — un locataire peut contacter plusieurs annonces
      // du même proprio, chaque contact génère une entrée distincte).
      // Deux requêtes .eq() au lieu de .or() pour éviter toute injection dans
      // l'email (caractères spéciaux valides). Match uniquement sur le message
      // initial de candidature type="candidature".
      const me = fromEmail.toLowerCase()
      const other = toEmail.toLowerCase()
      const [sent, received] = await Promise.all([
        supabase.from("messages").select("id")
          .eq("from_email", me).eq("to_email", other).eq("annonce_id", annonce.id).limit(1),
        supabase.from("messages").select("id")
          .eq("from_email", other).eq("to_email", me).eq("annonce_id", annonce.id).limit(1),
      ])
      const hasConversation = (sent.data && sent.data.length > 0) || (received.data && received.data.length > 0)

      if (!hasConversation) {
        await supabase.from("messages").insert([{
          from_email: me,
          to_email: other,
          contenu: `Bonjour, je suis intéressé(e) par votre annonce « ${annonce.titre} » à ${annonce.ville}.`,
          lu: false,
          annonce_id: annonce.id,
          type: "candidature",
          created_at: new Date().toISOString(),
        }])
      }

      router.push(`/messages?with=${encodeURIComponent(other)}`)
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
