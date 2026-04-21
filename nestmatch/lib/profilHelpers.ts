/**
 * Helpers d'affichage autour de l'identité locataire (prenom + nom).
 *
 * Depuis la migration 018 le champ unique `profils.nom` a été scindé en
 * `prenom` + `nom`. Depuis la migration 020 ces deux champs deviennent
 * immuables après confirmation sur /onboarding/identite (verrouillage
 * via `profils.identite_verrouillee` + trigger Postgres).
 *
 * Utiliser `formatNomComplet` partout où on affiche l'identité d'un
 * locataire au lieu de concaténer à la main (single source of truth).
 */

export type IdentiteProfil = {
  prenom?: string | null
  nom?: string | null
}

export function formatNomComplet(p: IdentiteProfil | null | undefined): string {
  if (!p) return ""
  return [p.prenom, p.nom].filter(Boolean).join(" ").trim()
}

export function initiales(p: IdentiteProfil | null | undefined): string {
  const full = formatNomComplet(p)
  if (!full) return "?"
  const parts = full.split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] || ""
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] || "") : ""
  return (first + last).toUpperCase()
}

/**
 * Regex de validation prenom/nom — Unicode letters, diacritics, espaces,
 * traits d'union, apostrophes, points (initiales). 1-80 caractères.
 * Tolère les caractères asiatiques (CJK via \p{L}).
 * À valider côté serveur à chaque POST — le pattern client est indicatif.
 */
export const IDENTITE_PATTERN = /^[\p{L}\p{M}\s\-'.]{1,80}$/u

export function isIdentiteValide(prenom: string, nom: string): boolean {
  const p = prenom.trim()
  const n = nom.trim()
  if (!p || !n) return false
  return IDENTITE_PATTERN.test(p) && IDENTITE_PATTERN.test(n)
}

/**
 * Construit le mailto de demande de modification d'identité. Factorise
 * le template lourd pour éviter les sauts de ligne foireux dans le JSX.
 */
export function buildMailtoModifIdentite(email: string, prenom?: string | null, nom?: string | null): string {
  const identiteAffichee = [prenom, nom].filter(Boolean).join(" ") || "(non renseignée)"
  const subject = encodeURIComponent(`Modification identité - ${email}`)
  const body = encodeURIComponent(
    `Bonjour,\n\n` +
    `Je souhaite modifier mon identité enregistrée sur mon compte Keymatch.\n\n` +
    `Ancienne identité : ${identiteAffichee}\n` +
    `Nouvelle identité demandée : \n` +
    `Motif : \n\n` +
    `Je joins un justificatif (carte d'identité, acte de mariage, etc.).\n\n` +
    `Merci.`
  )
  return `mailto:contact@keymatch-immo.fr?subject=${subject}&body=${body}`
}
