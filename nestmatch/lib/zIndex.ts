/**
 * Hiérarchie z-index centralisée pour éviter les conflits de superposition.
 *
 * V73.5 — refonte complète (audit V72.5 : 30+ valeurs hardcodées de 0 à 13500
 * sans cohérence, modaux à 13500 passaient au-dessus de la Navbar 10000 et
 * du drawer 11000 → burger inaccessible pendant un modal bail).
 *
 * 2 conventions cohabitent (rétro-compat) :
 *  - `Z` (legacy)        — déjà utilisée à plusieurs endroits, on la garde.
 *  - `Z_INDEX` (V73.5)   — nouvelle structure plus granulaire, recommandée
 *                          pour tout nouveau composant. Les valeurs sont
 *                          alignées sur Z là où il y a chevauchement.
 *
 * Règles V73.5 :
 *  - Plages séparées par usage (background / sticky / floating / dropdown
 *    / drawer / modal / system) pour éviter les collisions futures
 *  - Espacement de 100 minimum entre couches → permet d'insérer une
 *    nouvelle valeur sans renuméroter
 *  - Modaux > drawer > navbar : convention UX standard
 *  - Toasts > modals : un message critique doit être visible même sur un
 *    modal de confirmation
 */

// ─── Legacy (Z) — conservé pour rétro-compat ──────────────────────────────
// Ordre : TOAST > MODAL > DRAWER_MOBILE > NAVBAR_STICKY > TOOLTIP > DROPDOWN
//   > MAP > COOKIE_FLOATING > CONTENT
export const Z = {
  TOAST: 9999,
  COOKIE_BANNER: 9500,
  MODAL: 9000,
  DRAWER_MOBILE: 8000,
  NAVBAR_STICKY: 7000,
  ADMIN_BAR: 7100,
  TOOLTIP: 6000,
  DROPDOWN: 2000,
  MAP_CONTROL: 500,
  COOKIE_FLOATING: 400,
  CONTENT: 1,
} as const

export type ZLevel = typeof Z[keyof typeof Z]

// ─── V73.5 — nouvelle table granulaire (Z_INDEX) ─────────────────────────
// À utiliser comme `zIndex: Z_INDEX.navbar` pour tout nouveau composant.
// Pour migrer un fichier existant : remplacer la valeur littérale par la
// clé sémantique correspondante (cf table de correspondance `LEGACY_TO_V73`
// plus bas pour aider le diff).

export const Z_INDEX = {
  // ─── Background & inline (1-99) ────────────────────────────────────
  base: 1,
  card: 2,
  cardHover: 5,
  inlineUI: 50,

  // ─── Sticky chrome (100-499) ───────────────────────────────────────
  betaBanner: 200,
  adminBar: 250,
  bottomNav: 400,           // V73.9 — bottom nav mobile

  // ─── Navbar (500-999) ──────────────────────────────────────────────
  // Au-dessus du contenu mais sous les overlays.
  navbar: 500,
  navbarSubmenu: 600,

  // ─── Floating actions (1000-1999) ──────────────────────────────────
  cookieBanner: 1100,
  cookiePill: 1200,
  fabPlus: 1300,
  pwaInstall: 1400,
  stickyCta: 1500,

  // ─── Dropdowns / popovers (2000-2999) ──────────────────────────────
  dropdown: 2000,
  popover: 2100,
  tooltip: 2200,

  // ─── Drawer / sidesheet (3000-3999) ────────────────────────────────
  drawerBackdrop: 3100,
  drawerPanel: 3200,

  // ─── Modal layer (4000-4499) ───────────────────────────────────────
  // IMPORTANT : modal > drawer (3200). Un modal ouvert masque le burger.
  // Pour quitter un modal, l'user clique le X dans le modal — ne pas
  // tenter de mettre le drawer au-dessus du modal (anti-pattern UX).
  modalBackdrop: 4000,
  modal: 4100,
  modalContent: 4200,

  // ─── System / critical (5000+) ─────────────────────────────────────
  toast: 5000,
  errorBoundary: 5100,
  systemBanner: 5200,
} as const

export type ZIndexKey = keyof typeof Z_INDEX

/**
 * Table de correspondance pour aider la migration progressive des valeurs
 * littérales du repo vers Z_INDEX. Pas utilisée à l'exécution — sert juste
 * de référence pour les futurs commits de migration.
 *
 * Exemple : un fichier qui faisait `zIndex: 11000` pour le drawer mobile
 * doit utiliser `Z_INDEX.drawerBackdrop` (3100) ou `Z_INDEX.drawerPanel`
 * (3200) selon le rôle.
 *
 * Note : les anciennes valeurs étaient parfois 10× trop hautes. C'est OK :
 * tant que la hiérarchie est respectée, les valeurs absolues n'importent
 * pas (on n'imbrique jamais 30 layers).
 */
export const LEGACY_TO_V73 = {
  400:   "Z_INDEX.cookiePill (était cookie floating button)",
  500:   "Z_INDEX.navbar OU Z_INDEX.dropdown selon usage",
  1000:  "Z_INDEX.cookieBanner",
  1100:  "Z_INDEX.cookieBanner",
  2000:  "Z_INDEX.dropdown",
  7000:  "Z_INDEX.navbar (legacy NAVBAR_STICKY)",
  7100:  "Z_INDEX.adminBar (legacy ADMIN_BAR)",
  8000:  "Z_INDEX.drawerPanel (legacy DRAWER_MOBILE)",
  9000:  "Z_INDEX.modal (legacy MODAL)",
  9500:  "Z_INDEX.cookieBanner (legacy COOKIE_BANNER)",
  9999:  "Z_INDEX.toast (legacy TOAST)",
  10000: "Z_INDEX.navbar (instance Navbar.tsx — anti-pattern, à migrer)",
  11000: "Z_INDEX.drawerBackdrop (instance Navbar.tsx drawer)",
  11001: "Z_INDEX.drawerPanel (instance Navbar.tsx panel)",
  12000: "Z_INDEX.toast (instance ancienne)",
  13000: "Z_INDEX.modal (modaux bail anti-pattern à migrer)",
  13500: "Z_INDEX.modal (modaux bail anti-pattern à migrer)",
} as const
