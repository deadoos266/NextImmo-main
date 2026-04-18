/**
 * Types et constantes pour le formulaire de contact public.
 *
 * Migration DB requise :
 *   CREATE TABLE IF NOT EXISTS contacts (
 *     id bigserial PRIMARY KEY,
 *     nom text NOT NULL,
 *     email text NOT NULL,
 *     sujet text NOT NULL,
 *     message text NOT NULL,
 *     statut text NOT NULL DEFAULT 'ouvert',  -- 'ouvert' | 'en_cours' | 'resolu'
 *     assigne_a text NULL,                    -- email admin qui a pris en charge
 *     reponse text NULL,                      -- réponse admin
 *     created_at timestamptz NOT NULL DEFAULT now(),
 *     updated_at timestamptz NOT NULL DEFAULT now()
 *   );
 *   CREATE INDEX IF NOT EXISTS idx_contacts_statut ON contacts(statut);
 *   CREATE INDEX IF NOT EXISTS idx_contacts_assigne_a ON contacts(assigne_a);
 */

export type ContactStatut = "ouvert" | "en_cours" | "resolu"

export interface SujetContact {
  code: string
  label: string
}

export const SUJETS_CONTACT: SujetContact[] = [
  { code: "question_generale", label: "Question générale" },
  { code: "bug", label: "Signaler un bug" },
  { code: "compte", label: "Problème de compte" },
  { code: "reset_password", label: "Mot de passe oublié" },
  { code: "proprietaire", label: "Question côté propriétaire" },
  { code: "locataire", label: "Question côté locataire" },
  { code: "rgpd", label: "Protection des données (RGPD)" },
  { code: "partenariat", label: "Partenariat / presse" },
  { code: "autre", label: "Autre" },
]

export function getSujetLabel(code: string): string {
  return SUJETS_CONTACT.find(s => s.code === code)?.label || code
}

export const STATUT_STYLE: Record<ContactStatut, { bg: string; color: string; border: string; label: string }> = {
  ouvert: { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa", label: "Ouvert" },
  en_cours: { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe", label: "En cours" },
  resolu: { bg: "#dcfce7", color: "#15803d", border: "#bbf7d0", label: "Résolu" },
}
