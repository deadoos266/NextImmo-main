/**
 * V77.1 — layout segment des pages publiques (route group `(public)`).
 *
 * Le route group `(public)` est invisible dans les URLs (parens). Toute
 * page placée dans `app/(public)/foo/page.tsx` est servie à `/foo`.
 *
 * Status d'adoption :
 *  - V77.1 (ici) : layout créé, mais AUCUNE page n'est encore déplacée
 *    dans ce route group. Layout root `app/layout.tsx` reste seul actif
 *    pour ne pas casser la prod.
 *  - V78 prévu : déplacer page.tsx (home), connexion/, auth/, cgu/,
 *    mentions-legales/, confidentialite/, status/, annonces/ ici.
 *
 * Strategy "passthrough" pour le moment : ce layout ne fait QUE rendre
 * les children. Le vrai chrome (TopChrome, Footer, banners cookies)
 * reste dans `app/layout.tsx` racine — il s'applique à tous les segments.
 *
 * Lors de la migration V78 effective, ce fichier devra prendre en charge
 * un header simplifié (logo + CTA "Connexion / S'inscrire") + footer
 * marketing avec liens légaux. La sidebar et bottom nav restent dans
 * `(authenticated)/layout.tsx` qui aura un chrome plus chargé.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
