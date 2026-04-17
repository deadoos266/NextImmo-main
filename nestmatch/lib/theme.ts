/**
 * Gestion du thème clair / sombre pour NestMatch.
 *
 * - Persistance localStorage sous la clé `nestmatch-theme`.
 * - Valeurs : "light" | "dark" | "system" (suit l'OS).
 * - Application via `data-theme` sur `<html>` (lu par les règles CSS de globals.css).
 * - Anti-flash au chargement : voir le script inline dans app/layout.tsx.
 */

export type Theme = "light" | "dark" | "system"

export const THEME_KEY = "nestmatch-theme"

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system"
  try {
    const v = window.localStorage.getItem(THEME_KEY) as Theme | null
    if (v === "light" || v === "dark" || v === "system") return v
  } catch { /* noop */ }
  return "system"
}

export function resolveTheme(t: Theme): "light" | "dark" {
  if (t === "system") {
    if (typeof window === "undefined") return "light"
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  }
  return t
}

export function applyTheme(t: Theme) {
  if (typeof document === "undefined") return
  const effective = resolveTheme(t)
  document.documentElement.setAttribute("data-theme", effective)
}

export function setStoredTheme(t: Theme) {
  if (typeof window === "undefined") return
  try { window.localStorage.setItem(THEME_KEY, t) } catch { /* noop */ }
  applyTheme(t)
}
