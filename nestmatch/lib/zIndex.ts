/**
 * Hiérarchie z-index centralisée pour éviter les conflits de superposition.
 * Toujours utiliser ces constants plutôt que des nombres ad-hoc.
 *
 * Ordre (du plus haut au plus bas) :
 * TOAST > MODAL > DRAWER_MOBILE > NAVBAR_STICKY > TOOLTIP > DROPDOWN > MAP > COOKIE_FLOATING > CONTENT
 */

export const Z = {
  TOAST: 9999,          // notifications transitoires, bannière cookies initiale
  COOKIE_BANNER: 9500,  // bandeau de consentement initial
  MODAL: 9000,          // modales bloquantes (signalement, annulation visite, login, etc.)
  DRAWER_MOBILE: 8000,  // menu burger mobile drawer
  NAVBAR_STICKY: 7000,  // navbar top (+ admin bar 7100 au-dessus si présent)
  ADMIN_BAR: 7100,      // bandeau admin sticky toujours au-dessus de la navbar
  TOOLTIP: 6000,        // bulles d'aide (?)
  DROPDOWN: 2000,       // menus déroulants dans la navbar, autocomplete, etc.
  MAP_CONTROL: 500,     // contrôles de carte Leaflet (zoom, switcher tuiles)
  COOKIE_FLOATING: 400, // bouton 🍪 réouverture (toujours sous la carte)
  CONTENT: 1,           // contenu normal
} as const

export type ZLevel = typeof Z[keyof typeof Z]
