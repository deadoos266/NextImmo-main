import { supabase } from "./supabase"

/**
 * Annule une visite (statut = "annulée") et envoie un message automatique
 * à l'autre partie via la messagerie pour l'informer du motif.
 *
 * fromEmail = celui qui annule (son email = expéditeur du message)
 * toEmail = l'autre partie (proprio si locataire annule, et inverse)
 */
export async function annulerVisite({
  visiteId,
  fromEmail,
  toEmail,
  dateVisite,
  heureVisite,
  motif,
  statutActuel,
}: {
  visiteId: string | number
  fromEmail: string
  toEmail: string
  dateVisite: string
  heureVisite: string
  motif: string
  statutActuel: "proposée" | "confirmée" | string
}): Promise<{ ok: boolean; error?: string }> {
  // 1. Update statut de la visite
  const { error: updErr } = await supabase
    .from("visites")
    .update({ statut: "annulée" })
    .eq("id", visiteId)

  if (updErr) {
    return { ok: false, error: "L'annulation a échoué côté base de données." }
  }

  // 2. Envoi du message auto à l'autre partie
  const date = new Date(dateVisite + "T12:00:00").toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  const verbe = statutActuel === "confirmée" ? "Visite annulée" : "Demande de visite refusée"
  const contenu = `${verbe} — prévue le ${date} à ${heureVisite}.\nMotif : ${motif.trim()}`

  await supabase.from("messages").insert([{
    from_email: fromEmail,
    to_email: toEmail,
    contenu,
    lu: false,
    created_at: new Date().toISOString(),
  }])

  return { ok: true }
}
