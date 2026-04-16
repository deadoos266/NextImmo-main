# NestMatch — Configuration Claude Code

## Agents disponibles

| Agent | Usage |
|-------|-------|
| `backend-architect` | Schéma Supabase, API routes, requêtes, RLS |
| `frontend-developer` | Composants React, inline styles, design system |
| `search-specialist` | Algorithme de matching, filtres, requêtes Supabase |
| `qa-reviewer` | Revue de code, rôles, gotchas NestMatch |
| `seo-specialist` | Metadata Next.js, structured data, Core Web Vitals |

## Skill disponible

| Skill | Contenu |
|-------|---------|
| `real-estate-business-logic` | Acteurs, cycle des visites, messages, matching, carnet |

## Utilisation

Ces agents sont disponibles automatiquement dans ce projet Claude Code.
Le fichier `CLAUDE.md` à la racine contient les règles de base chargées à chaque session.

## Règles rapides

- Fond `#F7F4EF` · Cartes blanches `borderRadius: 20` · Police `DM Sans`
- Jamais de Tailwind · Jamais de `<nav>` dans une page
- Helpers définis hors du composant principal
- `proprietaireActive` (pas `role`) pour détecter le rôle
