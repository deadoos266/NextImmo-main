"use client"
import { useSession } from "next-auth/react"
import { useEffect } from "react"
import { supabase } from "../../../lib/supabase"

export default function ViewTracker({ annonceId }: { annonceId: number }) {
  const { data: session } = useSession()

  useEffect(() => {
    if (!session?.user?.email) return
    // Insert unique click — ignore if already exists (upsert with onConflict)
    supabase.from("clics_annonces").upsert(
      { annonce_id: annonceId, email: session.user.email },
      { onConflict: "annonce_id,email" }
    ).then(() => {})
  }, [session, annonceId])

  return null
}
