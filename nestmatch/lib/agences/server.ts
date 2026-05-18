/**
 * V97.39.34 — Helpers server-only pour les routes API agences.
 *
 * Centralise les checks d'autorisation (user actif sur agence, role minimal)
 * pour éviter la duplication dans chaque route.
 */

import { supabaseAdmin } from "@/lib/supabase-server"
import type { AgenceMembreRole } from "./types"
import { ROLE_RANK } from "./types"

export interface UserAgenceContext {
  agenceId: string
  role: AgenceMembreRole
  agenceStatut: string
  agenceName: string
  agenceSlug: string
}

/**
 * Retourne le contexte agence d'un user pour une agence donnée, ou null si
 * pas membre actif.
 */
export async function getUserAgenceContext(
  email: string,
  agenceId: string,
): Promise<UserAgenceContext | null> {
  const { data } = await supabaseAdmin
    .from("agence_membres")
    .select("role, agences!inner(id, name, slug, statut)")
    .eq("user_email", email.toLowerCase())
    .eq("agence_id", agenceId)
    .is("removed_at", null)
    .not("joined_at", "is", null)
    .maybeSingle()
  if (!data) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any
  if (!d.agences) return null
  return {
    agenceId,
    role: d.role as AgenceMembreRole,
    agenceStatut: d.agences.statut,
    agenceName: d.agences.name,
    agenceSlug: d.agences.slug,
  }
}

/** Vérifie qu'un user a au moins le role demandé sur une agence. */
export function hasMinRole(ctx: UserAgenceContext | null, minRole: AgenceMembreRole): boolean {
  if (!ctx) return false
  return ROLE_RANK[ctx.role] >= ROLE_RANK[minRole]
}
