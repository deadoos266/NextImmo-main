# NestMatch — Memoire du projet

## Etat actuel
- **Phase** : MVP avance, en production sur Vercel
- **Stack** : Next.js 15 App Router, React 19, TypeScript, Supabase, NextAuth (Google + Credentials), Leaflet, SDK Anthropic
- **URL prod** : https://next-immo-main.vercel.app
- **Repo** : github.com/deadoos266/NextImmo-main (public — a passer en prive)
- **Derniere mise a jour** : 2026-04-16

## Pitch produit
Plateforme P2P de location immobiliere (marche francais). Locataires et proprietaires en direct, sans agence.
Differenciation : score de compatibilite propriete/locataire via algo maison (lib/matching.ts, 1000 pts, 7 dimensions).

## Decisions d'architecture
- **Styling** : inline styles uniquement (pas de Tailwind a l'execution — installe mais non utilise)
- **Palette** : `#F7F4EF` (fond global), `#111` (noir), `white` (cartes), `border-radius: 20px`
- **Typographie** : DM Sans (via `next/font/google`, font-display swap)
- **Pas d'emojis dans l'UI**
- **Roles** : locataire / proprietaire / admin — separation STRICTE (un proprio ne voit jamais les scores de compatibilite)
- **Auth** : NextAuth JWT, Google OAuth + Credentials
- **DB** : Supabase PostgreSQL — client browser (anon key) + client serveur (service_role pour api routes)

## Conventions code
- Composants helpers (Toggle, Sec, F, etc.) definis HORS des composants React (evite bug perte de focus sur inputs)
- Jamais de `<nav>` dans une page (uniquement Navbar dans `app/layout.tsx`)
- Score affiche : `Math.round(score / 10) + "%"`
- Imports Supabase depuis `lib/supabase.ts` (browser) ou `lib/supabase-server.ts` (serveur)
- Detection proprio : via `useRole()` (flag `is_proprietaire` ou presence d'annonces)

## Tables Supabase cles
| Table | PK | Usage |
|-------|-----|-------|
| profils | email | Profil locataire + is_proprietaire |
| annonces | id | Biens immobiliers |
| messages | id | Chat (from_email, to_email, lu, annonce_id) |
| visites | id | Demandes de visite |
| carnet_entretien | id | Maintenance |
| loyers | id | Quittances |
| users | id | NextAuth (password_hash, role, is_admin) |

## Historique des batchs
- **2026-04-16 — Batch 1 (securite + perf)** : retrait secrets versionnes, `.env.example`, `.gitignore` renforce, `ROTATION_SECRETS.md`, headers securite `next.config.js`, XSS JSON-LD corrigee, `/api/agent` protege (auth + rate limit), DM Sans via `next/font`, jsPDF lazy-load sur 4 pages (~330 KB gzip economises)
- **2026-04-16 — Batch 2 (UX + bugs + refonte)** : en cours

## Dette technique connue
- RLS Supabase partiellement desactivee sur `visites` et `carnet_entretien`
- `/test/agent` page debug publique en prod (a supprimer ou proteger)
- 0 test automatise
- Repo GitHub encore public (historique contient anciens secrets)
- Uploads photos sans validation MIME serveur
- Pas de rate-limit sur `/api/auth/register`
- Admin protege uniquement par code client (`nestmatch2024`) + vérification isAdmin côté client
- `lib/cityCoords.ts` : fichier statique, a surveiller si grossit
- Page `/` et `/annonces` en `"use client"` (mauvais pour SEO — a convertir en Server Components)

## Fichiers critiques
- `lib/matching.ts` — algo de score, coeur du produit
- `lib/cityCoords.ts` — referentiel GPS villes FR
- `lib/auth.ts` — config NextAuth
- `lib/agents/` — agents IA Claude Opus + Sonnet
- `app/layout.tsx` — shell global
- `app/components/Navbar.tsx` — navigation globale (pas de `<nav>` ailleurs)
- `app/components/MapAnnonces.tsx` — carte Leaflet
