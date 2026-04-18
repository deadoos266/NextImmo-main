# NestMatch — Workflow Claude Code

## Agents a invoquer

### Agents de design / planning

| Agent | Quand |
|-------|-------|
| `planner` | Gros chantier multi-phases (notifs email, KYC, refonte filtres) — product breakdown AVANT architect |
| `architect` | Feature non triviale — design tech avant implementation, valide invariants |
| `code-explorer` | Avant modif d'une zone inconnue — cartographier le code |

### Agents d'implémentation / fix

| Agent | Quand |
|-------|-------|
| `build-error-resolver` | Build Vercel ou tsc qui pete — fix minimal, pas de refactor |
| `code-simplifier` | Apres batch — simplifier sans changer le comportement |
| `refactor-cleaner` | Apres gros batch — detecter le code mort et imports inutilises |
| `doc-updater` | Fin de batch — maintenir MEMORY.md / SKILLS.md / CLAUDE.md en sync |

### Reviewers spécialisés

| Agent | Quand |
|-------|-------|
| `code-reviewer` | Review générique chapeau — avis large avant de déléguer aux reviewers spécialisés |
| `typescript-reviewer` | Apres toute modif TypeScript significative |
| `type-design-analyzer` | Avant introduire un modèle domaine critique — invariants via types (discriminated unions) |
| `security-reviewer` | Routes API, upload, auth, manipulation de donnees utilisateur |
| `business-logic-reviewer` | Modifs matching / screening / flux visite / rôles |
| `performance-optimizer` | Avant commits touchant le bundle client ou pages critiques (`/`, `/annonces`) |
| `ai-integration-reviewer` | Modif `lib/agents/` — rate-limit, auth, prompt injection |
| `database-reviewer` | Modifs schema Supabase, nouvelles tables, nouvelles queries |
| `accessibility-reviewer` | Batch UI — WCAG AA, contrastes, clavier |
| `responsive-auditor` | Batch UI — mobile/tablette/desktop, zones tactiles |
| `seo-specialist` | Toute modif metadata, pages publiques, sitemap |
| `copy-editor-fr` | Modif texte user-facing — accents, anglicismes, voussoiement |
| `silent-failure-hunter` | Doute sur try/catch vides, `.catch(() => [])`, fallbacks qui cachent des bugs |

### Agents de test

| Agent | Quand |
|-------|-------|
| `tdd-guide` | Écrire les PREMIERS tests (bootstrap Vitest) ou tests pour nouvelle feature critique |
| `pr-test-analyzer` | PR prête ou push conséquent — couverture réelle du comportement changé |

### Agents de vérification finale

| Agent | Quand |
|-------|-------|
| `verifier` | APRES toute implementation — chaque claim du commit verifie contre le code |

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
- Gros chantier multi-phases → commencer par `planner` puis `architect`
- Feature non triviale → commencer par `architect`
- Tout batch prêt à commit → finir par `verifier` avant de push
- Fin de batch significatif → `doc-updater` pour sync MEMORY.md

| Type de tâche | Séquence d'agents |
|---|---|
| Gros chantier (notifs email, KYC, filtres) | `planner` → `architect` → `code-explorer` → implémentation → reviewers → `verifier` → `doc-updater` |
| Feature non triviale (> 1 fichier impacté) | `architect` → `code-explorer` → implémentation → reviewers spécifiques → `verifier` |
| Nouvelle route API | `architect` → `code-explorer` → implémentation → `security-reviewer` → `typescript-reviewer` → `silent-failure-hunter` → `verifier` |
| Nouveau composant UI | `code-explorer` → implémentation → `responsive-auditor` → `accessibility-reviewer` → `verifier` |
| Modif page publique | implémentation → `copy-editor-fr` → `seo-specialist` → `performance-optimizer` → `verifier` |
| Modif carte Leaflet | `code-explorer` → implémentation → `performance-optimizer` → `verifier` |
| Modif schéma Supabase | `architect` → `database-reviewer` → migration → `security-reviewer` (RLS) → `verifier` → `doc-updater` |
| Modif scoring / matching | `architect` → `code-explorer` → implémentation → `business-logic-reviewer` → `tdd-guide` → `verifier` |
| Nouveau modèle domaine critique | `planner` → `type-design-analyzer` → `architect` → implémentation → `verifier` |
| Batch responsive mobile | `responsive-auditor` (audit) → implémentation → `accessibility-reviewer` → `verifier` |
| Correction copie FR | `copy-editor-fr` uniquement |
| Gros batch multi-fichiers | `code-simplifier` → `refactor-cleaner` → `verifier` → `doc-updater` |
| Modif auth / session | `architect` → `security-reviewer` obligatoire → `silent-failure-hunter` → `verifier` |
| Intégration IA / agents | `architect` → `ai-integration-reviewer` → `verifier` |
| Fix urgent / patch build | `build-error-resolver` → `verifier` |
| Écrire des tests (premier ou nouveau) | `tdd-guide` (implémentation) → `pr-test-analyzer` (review) |
| PR prête à merge | `code-reviewer` → `pr-test-analyzer` → `verifier` |

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
