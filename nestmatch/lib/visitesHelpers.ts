import { supabase } from "./supabase"

/**
 * Style visuel partagé des statuts de visite (utilisé dans AgendaVisites,
 * /visites, /messages, /proprietaire). Extrait ici pour éviter les
 * duplications et garantir la cohérence visuelle.
 */
export type StatutVisite = "proposée" | "confirmée" | "annulée" | "effectuée"

export const STATUT_VISITE_STYLE: Record<StatutVisite, { color: string; bg: string; border: string; label: string }> = {
  "proposée":  { color: "#c2410c", bg: "#fff7ed", border: "#fed7aa", label: "En attente" },
  "confirmée": { color: "#15803d", bg: "#dcfce7", border: "#bbf7d0", label: "Confirmée" },
  "annulée":   { color: "#dc2626", bg: "#fee2e2", border: "#fecaca", label: "Annulée" },
  "effectuée": { color: "#374151", bg: "#f3f4f6", border: "#e5e7eb", label: "Effectuée" },
}

export const STATUT_VISITE_DOT: Record<StatutVisite, string> = {
  "proposée":  "#f97316",
  "confirmée": "#16a34a",
  "annulée":   "#dc2626",
  "effectuée": "#9ca3af",
}


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
  // 1. Update statut de la visite — .select() pour obtenir les rows updatées
  //    et détecter un échec silencieux (RLS, id introuvable…).
  const { data: rows, error: updErr } = await supabase
    .from("visites")
    .update({ statut: "annulée" })
    .eq("id", visiteId)
    .select("id")

  if (updErr) {
    console.error("[annulerVisite] update error:", updErr)
    return { ok: false, error: `Erreur DB : ${updErr.message}` }
  }
  if (!rows || rows.length === 0) {
    console.error("[annulerVisite] 0 rows updated for visite", visiteId)
    return {
      ok: false,
      error: "Aucune visite mise à jour (la visite a peut-être déjà été annulée ou supprimée).",
    }
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
