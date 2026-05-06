// Feature flags KeyMatch — toggles centralisés.
//
// Utiliser pour les bascules pre-launch / soft-launch / dark-launch.
// Lire ces flags depuis les Server Components / API routes / metadata.
//
// V71.0 — pre-launch indexing lock : tant que `SITE_INDEXABLE` est `false`,
// le site retourne `noindex, nofollow` partout (robots.txt, meta, X-Robots-Tag),
// même si l'env var `NEXT_PUBLIC_NOINDEX` n'est pas posée côté Vercel.
// Toggle à `true` au moment du lancement public officiel pour relancer
// l'indexation Google / Bing / GPTBot / ClaudeBot / PerplexityBot.

export const SITE_INDEXABLE = false as const

// Combine flag local + env var Vercel pour la rétro-compat. Si l'un OU l'autre
// indique "no index", on bloque. Plus simple à toggler côté code (pas besoin
// de redéployer une env var).
export const NO_INDEX =
  !SITE_INDEXABLE || process.env.NEXT_PUBLIC_NOINDEX === "true"
