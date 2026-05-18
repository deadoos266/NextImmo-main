/**
 * V97.39.34 — Phase A — Types TS pour entité Agence + membres.
 *
 * Cohérent avec migration 086_phase_a_agences.sql.
 */

export type AgenceStatut = "pending" | "active" | "refused" | "banned"
export type AgenceMembreRole = "owner" | "admin" | "agent" | "viewer"

export interface Agence {
  id: string
  slug: string
  name: string
  raison_sociale: string
  siret: string
  carte_t_numero: string
  carte_t_doc_path: string | null
  rc_pro_doc_path: string | null
  rc_pro_assureur: string | null
  rc_pro_numero: string | null
  email: string
  telephone: string | null
  adresse: string
  code_postal: string | null
  ville: string | null
  logo_url: string | null
  couleur_primaire: string | null
  bio: string | null
  statut: AgenceStatut
  validated_at: string | null
  validated_by: string | null
  refused_reason: string | null
  created_at: string
  updated_at: string
}

export interface AgenceMembre {
  id: string
  agence_id: string
  user_email: string
  role: AgenceMembreRole
  invited_at: string
  invited_by: string | null
  joined_at: string | null
  removed_at: string | null
}

/** Sous-ensemble safe à exposer en public (page /agence/[slug] notamment). */
export type AgencePublic = Pick<Agence,
  | "id"
  | "slug"
  | "name"
  | "raison_sociale"
  | "ville"
  | "code_postal"
  | "logo_url"
  | "couleur_primaire"
  | "bio"
  | "statut"
>

/** Rangs des roles (plus haut = plus de droits). */
export const ROLE_RANK: Record<AgenceMembreRole, number> = {
  owner: 4,
  admin: 3,
  agent: 2,
  viewer: 1,
}

/**
 * Vérifie qu'un user a au minimum un certain role dans une agence.
 * Utilisé côté API pour gate les actions.
 */
export function userHasRoleInAgence(
  membre: Pick<AgenceMembre, "role" | "joined_at" | "removed_at"> | null | undefined,
  minRole: AgenceMembreRole,
): boolean {
  if (!membre) return false
  if (membre.removed_at) return false
  if (!membre.joined_at) return false  // invitation pas encore acceptée
  return ROLE_RANK[membre.role] >= ROLE_RANK[minRole]
}

/** Validation simple côté serveur du format SIRET (14 chiffres). */
export function isValidSiret(siret: string): boolean {
  return /^\d{14}$/.test(siret.replace(/\s/g, ""))
}

/** Validation simple du numéro de carte T (format approximatif loi Hoguet). */
export function isValidCarteT(carteT: string): boolean {
  // Format type : "CPI XXXX XXXX XXX XXX XXX" — assouplit pour accepter
  // plusieurs formats régionaux. On vérifie juste qu'il y a "CPI" puis
  // 12+ chiffres (avec ou sans espaces).
  const cleaned = carteT.replace(/\s/g, "").toUpperCase()
  return /^CPI\d{12,16}$/.test(cleaned)
}

/** Génère un slug à partir d'un nom commercial. */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")  // retire les accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50)
}
