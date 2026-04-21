"use client"
import dynamic from "next/dynamic"

/**
 * Page /annonces — SSR complètement désactivé (ssr: false).
 *
 * Pourquoi cette nucléaire :
 *   Après 5 fixes ciblés (RoleProvider lazy init, useResponsive, SW purge,
 *   MountedOnly Navbar/Footer, force-dynamic server wrapper), le React
 *   error #418 persistait encore sur /annonces?ville=Paris. La source
 *   exacte du mismatch SSR/CSR reste non identifiée dans un fichier de
 *   1041 lignes avec des dizaines de hooks.
 *
 *   Avec `dynamic(() => import(...), { ssr: false })`, Next.js ne rend
 *   RIEN côté serveur pour ce composant — juste le fallback. Le serveur
 *   envoie un squelette vide, le client charge AnnoncesClient, monte et
 *   rend. Pas de HTML SSR à matcher, pas de mismatch possible,
 *   GARANTI zéro #418.
 *
 *   Coût : 1 frame de loading avant que la page apparaisse. Comparé à
 *   "annonces qui disparaissent en cascade #418", c'est un cadeau.
 *
 *   À réactiver plus tard : quand on aura isolé le vrai fautif (via
 *   React dev build déployé temporairement pour lire l'erreur non
 *   minifiée), on pourra rebasculer en SSR normal.
 */
const AnnoncesClient = dynamic(() => import("./AnnoncesClient"), {
  ssr: false,
  loading: () => (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "calc(100vh - 72px)",
      background: "#F7F4EF",
      fontFamily: "'DM Sans', sans-serif",
      color: "#6b7280",
    }}>
      Chargement des annonces...
    </div>
  ),
})

export default function AnnoncesPage() {
  return <AnnoncesClient />
}
