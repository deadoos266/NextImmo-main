/**
 * V77.1 — layout segment des pages authentifiées (route group `(authenticated)`).
 *
 * Status d'adoption :
 *  - V77.1 (ici) : layout créé en passthrough. AUCUNE page déplacée
 *    encore. Layout root `app/layout.tsx` reste seul actif pour ne pas
 *    casser la prod (toutes les pages auth sont sous app/profil, app/messages,
 *    app/admin, etc. directement à la racine du dossier app).
 *  - V78 prévu : déplacer profil/, dossier/, messages/, mon-logement/,
 *    proprietaire/, admin/, recherches-sauvegardees/ ici. Et activer
 *    TopChrome + BottomNavMobile de manière scopée à ce segment au lieu
 *    du layout root (élimine le besoin de conditionner ces composants
 *    selon le pathname).
 *
 * À ce moment-là, ce fichier deviendra :
 *
 *   import TopChrome from "../components/TopChrome"
 *   import BottomNavMobile from "../components/BottomNavMobile"
 *   import MountedOnly from "../components/MountedOnly"
 *
 *   export default function AuthenticatedLayout({ children }) {
 *     return (
 *       <>
 *         <TopChrome />
 *         {children}
 *         <MountedOnly>
 *           <BottomNavMobile />
 *         </MountedOnly>
 *       </>
 *     )
 *   }
 *
 * Et `app/layout.tsx` racine retire TopChrome + BottomNavMobile (qui ne
 * sont plus utiles sur les pages publiques).
 *
 * Pour cette V77, passthrough strict pour ne RIEN changer en prod.
 */
export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
