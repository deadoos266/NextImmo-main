# KeyMatch — Instructions Claude Code

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
- **Clarifier les mots ambigus AVANT de coder** — "fixe / sticky / propre / rapide / que ça reste" → toujours proposer 2 options A/B en 2 lignes avant d'écrire la moindre ligne de code. Coût récent : 3h sur sticky card en mauvais sens (cf `memory/feedback_clarify_ambiguous_2026-04-25.md`).

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

## Protocole VERIFY — quand Paul dit "vérifie" / "tu as vérifié ?"

**NE JAMAIS répondre "c'est bon" après juste `tsc --noEmit`.** Le typecheck ne sait pas si le PDF s'affiche, si l'upload réseau marche, si le marker Leaflet est visible, si la card EDL s'affiche côté locataire.

Le protocole obligatoire :

1. **Lister les claims du commit** (3-5 bullets de ce que la modif PRÉTEND faire)
2. **Pour chaque claim** → `grep` le code qui l'implémente + `Read` les lignes → confirmer/infirmer
3. **Lancer `npx tsc --noEmit`** (build vert = condition nécessaire, pas suffisante)
4. **Lancer le sous-agent `verifier`** sur le diff (`Agent` tool, `subagent_type: "verifier"`) avec un prompt qui liste les claims + les fichiers modifiés. Le verifier trouve les silent failures + bugs croisés que je vois pas.
5. **Rapport explicite à Paul, structuré en 3 sections :**
   - `✓ Vérifié OK` (avec chemins fichiers + lignes)
   - `✗ Non vérifié` (UI à l'écran, env vars Vercel, réseau Supabase Storage, comportement prod) — TOUJOURS lister, même si ça paraît tautologique
   - `⚠ Bugs trouvés` (par le verifier ou par moi)
6. **Si bugs critiques** → fixer AVANT le commit, pas après le push
7. **Si bugs préexistants hors scope** → les noter dans le commit message, pas les ignorer

Ne pas dire "vérifié" tant que les 6 étapes ne sont pas faites. Si étape 4 est skip (verifier pas dispo), le dire explicitement.

Audit qui a validé ce protocole : V97.7-V97.9 (2026-05-12) — le verifier a trouvé 2 bugs réels que j'avais loupés (`QuartierPicker.tsx` sans `leafletSetup`, seuil event-loop 200ms → cold start spurious).
