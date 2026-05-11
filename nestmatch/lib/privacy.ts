/**
 * Utilitaires de confidentialité.
 * Objectif : ne jamais exposer publiquement l'email complet d'un contact
 * (risque de scraping, spam, phishing).
 */

/**
 * Retourne un nom affichable à la place d'un email.
 * Priorité :
 * 1. Profil {prenom, nom} si fourni → "DUPONT Jean" (nom MAJ, prénom Cap)
 * 2. Le nom fourni en string (depuis annonces.proprietaire) — capitalisation
 *    naturelle conservée
 * 3. La partie locale de l'email (avant @), capitalisée
 * 4. "Utilisateur" si tout est vide
 *
 * V96.6 — Support format "NOM Prénom" via profil. Cas typique :
 *   displayName(email, peerProfiles[email.toLowerCase()])
 *   → "DAVID Paul" au lieu de "paul.david.56890@gmail.com" ou "Paul David 56890"
 */
export function displayName(
  email?: string | null,
  fallback?: string | null | { prenom?: string | null; nom?: string | null },
): string {
  // V96.6 — Cas objet profil : format "NOM Prénom"
  if (fallback && typeof fallback === "object" && !Array.isArray(fallback)) {
    const nom = (fallback.nom || "").trim()
    const prenom = (fallback.prenom || "").trim()
    if (nom || prenom) {
      const nomFmt = nom.toUpperCase()
      // Prénom : 1ère lettre cap, reste minuscule (gère "JEAN-CLAUDE" → "Jean-Claude")
      const prenomFmt = prenom
        .split(/(\s|-)/g) // garde séparateurs
        .map(part => /\s|-/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join("")
      return [nomFmt, prenomFmt].filter(Boolean).join(" ")
    }
    // Profil vide → fallback email
    fallback = null
  }
  if (typeof fallback === "string" && fallback.trim()) return fallback.trim()
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
