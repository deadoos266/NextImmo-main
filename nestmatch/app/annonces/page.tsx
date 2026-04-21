import AnnoncesClient from "./AnnoncesClient"

/**
 * Server component fin pour /annonces.
 *
 * Pourquoi ce wrapping :
 *   Le vrai composant (AnnoncesClient) utilise `useSearchParams()` pour
 *   lire `?ville=Paris` etc. Dans Next.js 15, un `useSearchParams()` dans
 *   un composant "use client" sur une route pré-rendue statiquement force
 *   Next à émettre un template `<template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING">`
 *   au SSR. Côté client, React attrape ce bailout à l'hydratation et le
 *   log comme **minified error #418** (même famille que "hydration
 *   mismatch"), ce qui détruit visuellement le sous-arbre.
 *
 *   `export const dynamic = "force-dynamic"` sur ce server component dit
 *   à Next : "cette route est 100% dynamique, ne tente même pas de la
 *   pré-rendre au build". Le HTML SSR généré pour chaque requête
 *   contient directement le composant client avec ses searchParams, pas
 *   de bailout template, plus d'erreur #418.
 *
 *   Coût : pas de cache ISR pour /annonces. Mais c'est logique : la liste
 *   dépend du locataire connecté, des filtres URL et de la DB — rien
 *   qu'on veut servir en cache de toute façon.
 *
 *   Pour préserver le SEO : la page reste accessible aux crawlers via le
 *   rendu dynamique (Next attend le render avant de servir le HTML).
 */
export const dynamic = "force-dynamic"

export default function AnnoncesPage() {
  return <AnnoncesClient />
}
