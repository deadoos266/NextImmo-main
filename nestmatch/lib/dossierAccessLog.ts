import { createHash } from "crypto"

/**
 * Hash tronqué d'un token — permet de grouper les accès d'un même lien
 * sans stocker le token brut (si lien fuité, la DB ne permet pas de rejouer).
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16)
}

/**
 * Hash IP anonymisée (RGPD). On salte avec une variable serveur pour
 * qu'on ne puisse pas reverse par force brute. Tronqué à 24 caractères :
 * suffisant pour dédupliquer, insuffisant pour identifier.
 *
 * Throw si DOSSIER_LOG_SALT absent ou reste sur la valeur par défaut.
 * Sinon tous les hashes seraient prévisibles par force brute (brute-force
 * d'IPs possibles en quelques secondes), faisant perdre la protection RGPD.
 * Cf. .env.example pour la commande de génération du sel.
 */
export function hashIP(ip: string): string {
  const salt = process.env.DOSSIER_LOG_SALT
  if (!salt || salt.trim().length === 0) {
    throw new Error(
      "[dossierAccessLog] DOSSIER_LOG_SALT env var est obligatoire en RGPD. " +
      "Générer : openssl rand -hex 32"
    )
  }
  if (salt === "nestmatch-default-salt-changeme" || salt === "REMPLACER_PAR_UN_SEL_ALEATOIRE_LONG") {
    throw new Error(
      "[dossierAccessLog] DOSSIER_LOG_SALT est encore la valeur par défaut. " +
      "Générer un vrai sel : openssl rand -hex 32"
    )
  }
  return createHash("sha256").update(`${ip}:${salt}`).digest("hex").slice(0, 24)
}

/**
 * Parse user-agent basique pour affichage utilisateur (navigateur + OS).
 * Sans lib externe pour rester léger.
 */
export function parseUserAgent(ua: string): string {
  if (!ua) return "Appareil inconnu"
  const u = ua.toLowerCase()
  let browser = "Navigateur"
  if (u.includes("edg/")) browser = "Edge"
  else if (u.includes("chrome/")) browser = "Chrome"
  else if (u.includes("firefox/")) browser = "Firefox"
  else if (u.includes("safari/")) browser = "Safari"
  let os = ""
  // Ordre important : les UA iPhone/iPad contiennent "Mac OS X" → tester iOS avant macOS.
  if (u.includes("windows")) os = "Windows"
  else if (u.includes("iphone") || u.includes("ipad")) os = "iOS"
  else if (u.includes("android")) os = "Android"
  else if (u.includes("mac os")) os = "macOS"
  else if (u.includes("linux")) os = "Linux"
  return os ? `${browser} / ${os}` : browser
}
