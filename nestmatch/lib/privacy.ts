/**
 * Utilitaires de confidentialité.
 * Objectif : ne jamais exposer publiquement l'email complet d'un contact
 * (risque de scraping, spam, phishing).
 */

/**
 * Retourne un nom affichable à la place d'un email.
 * Priorité :
 * 1. Le nom fourni (depuis la table profils ou annonces.proprietaire)
 * 2. La partie locale de l'email (avant @), capitalisée
 * 3. "Utilisateur" si tout est vide
 */
export function displayName(email?: string | null, fallbackName?: string | null): string {
  if (fallbackName && fallbackName.trim()) return fallbackName.trim()
  if (!email) return "Utilisateur"
  const local = email.split("@")[0] || ""
  if (!local) return "Utilisateur"
  // "jean.dupont" → "Jean Dupont", "jean_dupont" → "Jean Dupont", "jdupont" → "Jdupont"
  return local
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

/**
 * Masque un email pour affichage : "jean.dupont@gmail.com" → "jean.dupont@***"
 * Utile si on veut rester explicite sur le fait qu'il s'agit d'un email.
 */
export function maskEmail(email?: string | null): string {
  if (!email) return ""
  const [local] = email.split("@")
  return `${local}@***`
}
