/**
 * Types et constantes pour le système de signalements.
 * Table DB requise :
 *   CREATE TABLE signalements (
 *     id bigserial PRIMARY KEY,
 *     type text NOT NULL,               -- 'annonce' | 'message' | 'user'
 *     target_id text NOT NULL,          -- id de la cible (annonce.id, message.id, user email)
 *     raison text NOT NULL,             -- code catégorie (cf RAISONS ci-dessous)
 *     description text NULL,            -- commentaire libre du signaleur
 *     signale_par text NOT NULL,        -- email du signaleur
 *     statut text NOT NULL DEFAULT 'ouvert',  -- 'ouvert' | 'traite' | 'rejete'
 *     traite_par text NULL,             -- email de l'admin qui a traité
 *     traite_at timestamptz NULL,
 *     created_at timestamptz NOT NULL DEFAULT now()
 *   );
 */

export type SignalementType = "annonce" | "message" | "user"
export type SignalementStatut = "ouvert" | "traite" | "rejete"

export interface Raison {
  code: string
  label: string
  desc: string
}

export const RAISONS: Raison[] = [
  { code: "frauduleux", label: "Annonce frauduleuse / arnaque", desc: "Bien inexistant, photos volées, demande d'argent avant visite, etc." },
  { code: "hors_plateforme", label: "Demande de contact hors plateforme", desc: "Propriétaire qui demande d'utiliser WhatsApp ou un autre canal externe." },
  { code: "inapproprie", label: "Contenu inapproprié", desc: "Propos injurieux, discriminants, photos choquantes." },
  { code: "doublon", label: "Annonce en doublon", desc: "La même annonce existe déjà sur la plateforme." },
  { code: "prix_abusif", label: "Prix manifestement abusif", desc: "Loyer très au-dessus du marché ou suspect." },
  { code: "description_fausse", label: "Description trompeuse", desc: "Surface, équipements ou localisation ne correspondent pas à la réalité." },
  { code: "spam", label: "Spam ou harcèlement", desc: "Messages répétitifs, non pertinents ou de harcèlement." },
  { code: "autre", label: "Autre", desc: "Précisez dans le commentaire." },
]

export function getRaisonLabel(code: string): string {
  return RAISONS.find(r => r.code === code)?.label || code
}
