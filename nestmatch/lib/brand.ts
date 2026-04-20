/**
 * SOURCE DE VÉRITÉ du branding KeyMatch.
 *
 * Pour remplacer le logo quand le fichier final arrive :
 *   1. Placer les SVG dans /public/logo.svg et /public/logo-mark.svg
 *   2. Encoder le PNG base64 du logo dans LOGO_PNG_BASE64 (lib/brandPDF.ts)
 *   3. Si le logo change de forme (icône + texte), adapter app/components/Logo.tsx
 *      variants si nécessaire.
 *   RIEN d'autre à toucher.
 */

export const BRAND = {
  name: "KeyMatch",
  tagline: "La location entre particuliers, sans frais d'agence",
  url: "https://keymatch-immo.fr",
  email: "contact@keymatch-immo.fr",
  colors: {
    primary: "#111",
    background: "#F7F4EF",
    accent: "#16a34a",
    danger: "#dc2626",
  },
} as const

export type LogoVariant = "navbar" | "footer" | "auth" | "hero" | "compact" | "email" | "pdf"
