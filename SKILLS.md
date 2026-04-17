# NestMatch — Workflow Claude Code

## Agents a invoquer

| Agent | Quand |
|-------|-------|
| `code-explorer` | Avant modif d'une zone inconnue — cartographier le code |
| `typescript-reviewer` | Apres toute modif TypeScript significative |
| `security-reviewer` | Routes API, upload, auth, manipulation de donnees utilisateur |
| `performance-optimizer` | Avant commits touchant le bundle client ou pages critiques (`/`, `/annonces`) |
| `seo-specialist` | Toute modif metadata, pages publiques, sitemap |
| `database-reviewer` | Modifs schema Supabase, nouvelles tables, nouvelles queries |
| `refactor-cleaner` | Apres gros batch — detecter le code mort |

## Workflow git
- **Branche** : `main` uniquement (pas de feature branches pour l'instant)
- **Commits** : convention `<type>: <description>` — types : feat, fix, refactor, perf, sec, docs, chore
- **Push** : manuel via GitHub Desktop → auto-deploy Vercel
- **Avant push** :
  - [ ] Build local OK (`npm run build` dans `nestmatch/`)
  - [ ] Tests manuels parcours impactes en dev (`npm run dev`)
  - [ ] Pas de `console.log` residuels
  - [ ] Pas de valeurs hardcodees (env vars uniquement)

## Conventions code (rappel)
- Inline styles uniquement (pas de Tailwind, pas de fichiers CSS externes sauf `globals.css`)
- Palette respectee : `#F7F4EF` (fond), `#111` (noir), `white` (cartes), `borderRadius: 20`
- Police : `'DM Sans', sans-serif` via `next/font`
- Pas d'emojis dans l'UI
- Roles separes strictement (proprio ne voit jamais les scores de matching)
- Composants helpers HORS des composants React

## Tests
- Aucun test automatise pour l'instant
- Tests manuels critiques :
  - `/` — landing, responsive, CTA
  - `/annonces` — liste, filtres, carte, score
  - `/annonces/[id]` — fiche, contact, favori, score
  - `/proprietaire` — dashboard, onglets, ajout annonce
  - `/messages` — threads, envoi, lecture
  - Login Google + Credentials
  - Switch role locataire ↔ proprietaire

## Structure des commits du batch en cours
1. `MEMORY.md` + `SKILLS.md` (docs)
2. Bugs critiques (scoring meuble, doublon garant, inscription, responsive, z-index, filtres)
3. Filtres (home → annonces, dossier → filtres, carte GPS position)
4. Carte interactive (marqueurs, locale, bbox)
5. Messagerie moderne
6. Page d'accueil + logo
7. Stats proprio + arbre
8. EDL photos ZIP
9. Profil parametres compte
10. MAJ `MEMORY.md` fin de batch

## Securite — regles permanentes
- Jamais de secret dans un fichier `.md`, `.ts`, `.tsx` versionne
- Toujours lire l'email utilisateur depuis `getServerSession`, jamais depuis le body
- Rate limit sur toute route API qui coute (Anthropic, Supabase writes)
- Valider le type MIME cote serveur pour les uploads

## Environnements
- **Dev local** : `.env.local` (gitignore)
- **Prod** : Environment Variables Vercel
- **Variables requises** : voir `nestmatch/.env.example`

## Workflow par type de tâche

**Règle d'or** :
- Feature non triviale ou gros refactor → commencer par `architect`
- Tout batch prêt à commit → finir par `verifier` avant de push

| Type de tâche | Séquence d'agents |
|---|---|
| Feature non triviale (> 1 fichier impacté) | `architect` → `code-explorer` → implémentation → reviewers spécifiques → `verifier` |
| Nouvelle route API | `architect` → `code-explorer` → implémentation → `security-reviewer` → `typescript-reviewer` → `verifier` |
| Nouveau composant UI | `code-explorer` → implémentation → `responsive-auditor` → `accessibility-reviewer` → `verifier` |
| Modif page publique | implémentation → `copy-editor-fr` → `seo-specialist` → `performance-optimizer` → `verifier` |
| Modif carte Leaflet | `code-explorer` → implémentation → `performance-optimizer` → `verifier` |
| Modif schéma Supabase | `architect` → `database-reviewer` → migration → `security-reviewer` (RLS) → `verifier` |
| Modif scoring / matching | `architect` → `code-explorer` → implémentation → `business-logic-reviewer` → `verifier` |
| Batch responsive mobile | `responsive-auditor` (audit) → implémentation → `accessibility-reviewer` → `verifier` |
| Correction copie FR | `copy-editor-fr` uniquement |
| Gros batch multi-fichiers | → `refactor-cleaner` → `verifier` à la fin |
| Modif auth / session | `architect` → `security-reviewer` obligatoire → `verifier` |
| Intégration IA / agents | `architect` → `ai-integration-reviewer` → `verifier` |
| Fix urgent / patch build | `verifier` minimum (skip architect) |

## Checklist avant commit

- [ ] Build local OK (`npm run build` dans `nestmatch/`)
- [ ] Pas de `console.log` résiduels
- [ ] Pas de secrets hardcodés
- [ ] Pas d'emojis dans l'UI (hors bannière cookies)
- [ ] Accents français présents partout
- [ ] Inline styles uniquement
- [ ] z-index respecte la hiérarchie documentée dans MEMORY.md
- [ ] Séparation des rôles vérifiée (proprio ne voit jamais les scores)
- [ ] Message de commit conventionnel (feat/fix/refactor/perf/sec/docs/chore)
- [ ] MEMORY.md mis à jour si changement d'architecture
