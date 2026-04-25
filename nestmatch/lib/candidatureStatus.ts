/**
 * Helpers pour requêter le statut d'une candidature côté client.
 *
 * Le statut est porté par le PREMIER message d'une candidature (celui inséré
 * par ContactButton avec `type='candidature'`). Au moment où le proprio
 * "valide" via /api/candidatures/valider, on update ce message à
 * `statut_candidature='validee'`. Cf migration 022_candidature_statut.sql.
 *
 * Workflow gating :
 *  - candidatureValidee = true  → bouton "Proposer une visite" actif
 *  - candidatureValidee = false → bouton grisé qui ouvre une popup
 *    "Le propriétaire doit valider votre candidature avant"
 *
 * Le proprio est exempté de ce gating (il propose ses propres visites).
 */

import { supabase } from "./supabase"

export type CandidatureStatut = "en_attente" | "validee" | "refusee" | null

/**
 * Renvoie le statut de la candidature du locataire pour une annonce donnée.
 * - null = pas de candidature trouvée OU statut non renseigné (pré-migration 022)
 * - 'en_attente' / 'validee' / 'refusee' = valeur DB
 *
 * NB: lit le DERNIER message type='candidature' du locataire vers le proprio
 * (au cas où plusieurs candidatures successives — la plus récente prime).
 */
export async function getCandidatureStatut(
  annonceId: number | string,
  locataireEmail: string,
  proprietaireEmail: string,
): Promise<CandidatureStatut> {
  const { data } = await supabase
    .from("messages")
    .select("statut_candidature")
    .eq("annonce_id", annonceId)
    .eq("from_email", locataireEmail.toLowerCase())
    .eq("to_email", proprietaireEmail.toLowerCase())
    .eq("type", "candidature")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const v = (data as { statut_candidature?: string | null }).statut_candidature
  if (v === "en_attente" || v === "validee" || v === "refusee") return v
  return null
}

/**
 * Helper UX : un locataire peut-il proposer une visite ?
 * Règle : oui si validee. Tout autre état → non, on incite à patienter
 * pour ne pas spammer le proprio.
 */
export function peutProposerVisite(statut: CandidatureStatut): boolean {
  return statut === "validee"
}
