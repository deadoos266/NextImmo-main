# `.claude/agents/` — KeyMatch agents catalog

**65 agents** disponibles pour la stack KeyMatch (Next.js 15 + Supabase + NextAuth + Resend + Vercel).

Mix entre :
- **Custom KeyMatch** (~26 agents) — créés sur mesure pour le projet (auditeurs, helpers, reviewers domaine, meta/docs/wiki)
- **Communauté** (~36 agents) — sélectionnés depuis [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) + [wshobson/agents](https://github.com/wshobson/agents) + [rshah515/claude-code-subagents](https://github.com/rshah515/claude-code-subagents) + [disler/claude-code-hooks-mastery](https://github.com/disler/claude-code-hooks-mastery) + [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code)
- **Meta** (3 agents) — pour générer/maintenir d'autres agents et docs (`meta-agent`, `prompt-improver`, `docs-keeper`)

---

## 🏠 Custom KeyMatch (26)

| Agent | Use case |
|---|---|
| `accessibility-reviewer` | Audit a11y WCAG AA sur batchs UI KeyMatch (palette beige #F7F4EF) |
| `ai-integration-reviewer` | Review intégrations Opus/Sonnet dans `lib/agents/` |
| `architect` | Design tech avant implémentation feature non triviale |
| `build-error-resolver` | Fix TS/build errors avec diff minimal |
| `business-logic-reviewer` | Review matching 1000pts, rôles, solvabilité, flux visite/bail |
| `code-explorer` | Cartographie d'une zone de code avant modification (read-only) |
| `code-reviewer` | Review générique (chapeau avant délégation aux spécialisés) |
| `code-simplifier` | Simplifie code récent sans changer comportement |
| `copy-editor-fr` | Relecture FR — accents, ponctuation, voussoiement |
| `database-reviewer` | Review migrations Supabase + queries (RLS, indexes, N+1) |
| `doc-updater` | Synchronise MEMORY.md / SKILLS.md / CLAUDE.md avec la réalité du code |
| `docs-keeper` | **V70.bonus++** — Maintient docs/ARCHITECTURE.md + docs/API.md à jour après changements substantiels (>5 fichiers ou >100 LoC) |
| `performance-optimizer` | Audit perf bundle client KeyMatch |
| `planner` | Planning stratégique features complexes (PM breakdown) |
| `pr-test-analyzer` | Vérifie que les tests couvrent vraiment le comportement changé |
| `prompt-improver` | **V70.bonus++** — Audite mensuellement les `.claude/agents/*.md`, suggère/applique améliorations system prompts |
| `real-estate-compliance-reviewer` | **V70.bonus** — Audit FR ALUR/eIDAS/RGPD sur bail/EDL/loyers/préavis |
| `refactor-cleaner` | Détecte code mort, imports inutilisés, duplications |
| `responsive-auditor` | Audit responsive mobile/tablet/desktop |
| `security-reviewer` | Review sécurité routes API + auth + uploads |
| `silent-failure-hunter` | Détecte erreurs avalées, fallbacks suspects, success silencieux |
| `tdd-guide` | Test-Driven Development — premiers tests projet ou critiques |
| `type-design-analyzer` | Analyse design types TypeScript pour invariants |
| `typescript-reviewer` | Review TS strict (any, as any, !! non justifiés) |
| `verifier` | Vérifie qu'une modif fait ce qu'elle prétend (anti silent-failure) |

## 🪄 Meta / Docs / Wiki (3)

| Agent | Source | Use case |
|---|---|---|
| `meta-agent` | disler/claude-code-hooks-mastery | **Génère** d'autres agents — frontmatter + system prompt + tools selon description user. Use proactively quand user dit "crée un agent qui..." |
| `adr-writer` | affaan-m/everything-claude-code | Capture les décisions architecturales au format MADR dans `docs/adr/NNNN-titre.md`. Auto-trigger sur "let's go with X", "we should use X instead of Y" |
| `wiki-compiler` | inspired by ussumant/llm-wiki-compiler | Compile les ~30 `docs/AUDIT_*.md` et similaires en `docs/wiki/INDEX.md` thématique. Pattern Karpathy LLM Wiki. Réduit les coûts context ~90% |

## 🛠️ Communauté installés (36)

### Core development (4)
| Agent | Source | Use case |
|---|---|---|
| `frontend-developer` | VoltAgent | Build production frontend, optimisations bundles |
| `backend-developer` | VoltAgent | Backend APIs et architecture services |
| `api-designer` | VoltAgent | Design REST/GraphQL APIs |
| `ui-designer` | VoltAgent | UI/UX composants design system |

### Language specialists (6)
| Agent | Source | Use case |
|---|---|---|
| `typescript-pro` | VoltAgent | TypeScript 5+ avancé, generics, type safety end-to-end |
| `nextjs-developer` | VoltAgent | Next.js 14/15 App Router, server components, Core Web Vitals |
| `react-specialist` | VoltAgent | React 18/19 patterns, perf, state management |
| `javascript-pro` | VoltAgent | JS moderne, async patterns, optimisations |
| `python-pro` | VoltAgent | Scripts data, automation, ML pipelines |
| `sql-pro` | VoltAgent | Queries complexes, EXPLAIN, optimisations PostgreSQL |

### Quality & security (10)
| Agent | Source | Use case |
|---|---|---|
| `code-reviewer` | VoltAgent | Review générique multi-dimensions |
| `security-auditor` | VoltAgent | OWASP, vulnérabilités, compliance |
| `compliance-auditor` | VoltAgent | RGPD/SOC2/ISO27001 audits |
| `accessibility-tester` | VoltAgent | WCAG 2.2 AA / RGAA tests |
| `qa-expert` | VoltAgent | QA stratégie, tests pyramide |
| `test-automator` | VoltAgent | Vitest, Jest, automation suite |
| `playwright-expert` | rshah515 | Playwright E2E flows critiques |
| `performance-engineer` | VoltAgent | Core Web Vitals, perf profiling |
| `error-detective` | VoltAgent | Investigation bugs production |
| `debugger` | VoltAgent | Stack traces, root cause analysis |

### Architecture & infra (3)
| Agent | Source | Use case |
|---|---|---|
| `architect-reviewer` | VoltAgent | Review changements structurels |
| `devops-engineer` | VoltAgent | Vercel + crons + monitoring |
| `database-optimizer` | VoltAgent | Index design, query plans, partitioning |

### Data & AI (4)
| Agent | Source | Use case |
|---|---|---|
| `postgres-pro` | VoltAgent | PostgreSQL avancé (Supabase) |
| `data-engineer` | VoltAgent | ETL, pipelines, transformations |
| `ml-engineer` | VoltAgent | ML pipelines (matching algo evolution) |
| `ai-engineer` | VoltAgent | Intégrations LLM (Anthropic, OpenAI) |
| `prompt-engineer` | VoltAgent | Optimisation prompts LLM |

### Developer experience (4)
| Agent | Source | Use case |
|---|---|---|
| `refactoring-specialist` | VoltAgent | Refactor safe avec préservation comportement |
| `dependency-manager` | VoltAgent | npm/package updates, security advisories |
| `git-workflow-manager` | VoltAgent | Branches, commits, PR workflow |
| `documentation-engineer` | VoltAgent | Docs techniques structurées |

### Specialized domains (2)
| Agent | Source | Use case |
|---|---|---|
| `api-documenter` | VoltAgent | OpenAPI/Swagger docs Next.js routes |
| `seo-specialist` | VoltAgent | SEO listings annonces, sitemap, JSON-LD |

### Business & product (3)
| Agent | Source | Use case |
|---|---|---|
| `product-manager` | VoltAgent | Roadmap, prioritisation, specs |
| `business-analyst` | VoltAgent | Analyse besoins, KPIs |
| `legal-advisor` | VoltAgent | Conseils légaux généraux (complément `real-estate-compliance-reviewer` FR-spécifique) |

---

## Convention de nommage

- **Agents finissant en `-reviewer`** : audit/review (Read-only, pas d'écriture). Tools : Read, Grep, Glob.
- **Agents finissant en `-pro`** ou **`-specialist`** ou **`-developer`** : peuvent écrire (Read, Write, Edit, Bash). Tools : tous.
- **Agents finissant en `-engineer`** : infrastructure/perf/data (Read, Write, Edit, Bash + tooling).
- **Agents `*-auditor` / `*-tester`** : Read-only audit. Tools : Read, Grep, Glob.

## Triggering

Les agents auto-trigger via `description:` dans le frontmatter quand ils matchent le contexte du diff/tâche. Tu peux aussi les invoquer manuellement via `Agent({ subagent_type: "X", ... })` dans Claude Code.

**`real-estate-compliance-reviewer` se déclenche automatiquement** sur tout diff touchant :
- `nestmatch/app/proprietaire/bail/**`
- `nestmatch/app/edl/**` ou `nestmatch/app/proprietaire/edl/**`
- `nestmatch/app/api/bail/**`, `nestmatch/app/api/baux/**`, `nestmatch/app/api/edl/**`, `nestmatch/app/api/loyers/**`
- `nestmatch/lib/preavisPDF.ts`, `lib/quittance*.ts`, `lib/bail/**`, `lib/preavis.ts`, `lib/irl.ts`
- `nestmatch/supabase/migrations/*` impactant `bail_*`, `etats_des_lieux`, `loyers`, `historique_baux`

## Sources

- [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) — collection structurée par catégories (utilisée comme source primaire)
- [wshobson/agents](https://github.com/wshobson/agents) — collection mature multi-domaines
- [rshah515/claude-code-subagents](https://github.com/rshah515/claude-code-subagents) — quality testing dont Playwright

## Mise à jour

Pour récupérer les nouvelles versions communautaires :
```bash
mkdir -p /tmp/cc-agents && cd /tmp/cc-agents
git clone --depth=1 https://github.com/VoltAgent/awesome-claude-code-subagents voltagent
# Comparer avec les versions locales :
diff /tmp/cc-agents/voltagent/categories/04-quality-security/code-reviewer.md \
  .claude/agents/code-reviewer.md
```

Les agents custom KeyMatch (préfixés par leur rôle métier ou avec `-reviewer`) **ne doivent pas être écrasés** par les updates communautaires.
