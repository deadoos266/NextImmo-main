# NestMatch — Instructions Claude Code

## Stack
Next.js 15 App Router · Supabase (anon key, RLS désactivée sur visites/carnet) · NextAuth v4 Google · TypeScript · **Pas de Tailwind — inline styles uniquement**

## Design system (ne jamais dévier)
- Fond global : `#F7F4EF`
- Cartes : `background: white`, `borderRadius: 20px`
- Couleur principale : `#111` (noir)
- Police : `'DM Sans', sans-serif`
- Pas d'import CSS externe, pas de className Tailwind

## Règles absolues
- **JAMAIS de `<nav>` dans une page** — la Navbar est uniquement dans `app/layout.tsx`
- **Composants helpers définis HORS des composants React** (évite la perte de focus sur les inputs)
- **Inline styles uniquement** — aucun fichier `.css`, aucune className Tailwind
- Les server components Next.js ne peuvent pas importer des modules client (`"use client"`)
- Toujours utiliser `supabase` depuis `lib/supabase.ts` (client browser)

## Architecture des rôles
- `proprietaireActive` (boolean) depuis `useRole()` dans `app/providers.tsx`
- Détection : `is_proprietaire` flag dans `profils` OU au moins 1 annonce en DB
- **Ne jamais se fier à un champ `role` en base** — utiliser `proprietaireActive`

## Tables Supabase principales
| Table | Clé | Usage |
|-------|-----|-------|
| `profils` | email | Préférences locataire + is_proprietaire |
| `annonces` | id | Biens immobiliers |
| `messages` | id | Chat (from_email, to_email, lu, annonce_id) |
| `visites` | id | Demandes de visite (statut: proposée/confirmée/annulée/effectuée) |
| `carnet_entretien` | id | Maintenance (proprio + locataire via locataire_email) |

## Matching (lib/matching.ts)
Score sur 1000 pts → affiché `Math.round(score/10) + "%"`
- Budget 300pts · Surface 270pts · Pièces 150pts · Meublé 100pts · Équipements 100pts · DPE 50pts
- Profil vide → 500 (neutre)

## Patterns à suivre
- Fetch Supabase avec `Promise.all` pour les requêtes parallèles
- Optimistic updates sur les mutations (update local state immédiatement)
- `useRole()` pour détecter proprio vs locataire
- `useSession()` pour l'email de l'utilisateur connecté

## Ce qui est en cours / prévu
- Bail + EDL auto-généré
- Quittances PDF
- Demande de visite depuis l'interface messages
