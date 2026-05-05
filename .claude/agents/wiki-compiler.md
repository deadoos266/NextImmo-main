---
name: wiki-compiler
description: "Use when user wants to consolidate multiple markdown audit/decision/plan files into an indexed wiki. Reads all docs/AUDIT_*.md, PLAN_*.md and similar, classifies by theme, produces docs/wiki/INDEX.md + thematic pages under docs/wiki/{theme}/. Reduces context costs ~90% by giving agents a synthesized navigable knowledge base."
tools: Read, Write, Glob, Grep
model: sonnet
---

# Wiki Compiler

Inspired by [ussumant/llm-wiki-compiler](https://github.com/ussumant/llm-wiki-compiler) (Karpathy LLM Wiki pattern). Compile scattered markdown documentation into a topic-based wiki indexed for human and agent consumption.

## When to Activate

- User says "compile a wiki", "consolide les docs", "fais un index wiki", "compress docs"
- After substantial documentation accumulation (>15 markdown files in `docs/`)
- Before onboarding a new contributor (wiki = entry point)
- When agent context costs increase due to scattered docs

## Use Case KeyMatch

Le projet KeyMatch a accumulé ~30 fichiers `docs/*.md` :
- `AUDIT_PARCOURS_LOCATAIRE_PROPRIO_V67.md`
- `AUDIT_SCENARIOS_EXHAUSTIFS_V68.md`
- `AUDIT_LEGAL_NIGHT.md`
- `CODE_AUDIT_FINAL.md`
- `CODE_AUDIT_NIGHT.md`
- `UPTIME_MONITORING.md`
- 20+ autres

L'agent compile ces fichiers en `docs/wiki/INDEX.md` + sous-dossiers thématiques pour navigation rapide.

## Algorithme

### Phase 1 — Scan + classification

1. `Glob` tous les `.md` dans `docs/` et sous-dossiers (exclure `node_modules/`, `.git/`)
2. Pour chaque fichier, extraire :
   - **Titre H1** ligne 1 si présent (sinon nom du fichier sans extension)
   - **Date** depuis frontmatter, mention "Date:" dans le body, OU mtime fichier
   - **Tags / themes** : auto-détection via keywords du titre + premier paragraphe
3. Classifier dans une des catégories suivantes (ordre de priorité de match) :

   | Thème | Keywords trigger |
   |---|---|
   | `compliance/` | RGPD, ALUR, eIDAS, ELAN, Climat, juridique, légal, art\\.\\s\\d, loi 89-462 |
   | `security/` | RLS, OWASP, vulnérabilité, REVOKE, anon, auth, NextAuth |
   | `audit/` | AUDIT, scénarios exhaustifs, parcours, V6\\d, V7\\d, bugs latents |
   | `architecture/` | architecture, design, pattern, migration, ISR, Realtime |
   | `perf/` | bundle, ISR, lazy-load, Core Web Vitals, performance |
   | `dx/` | logger, observability, Sentry, monitoring, build, tooling |
   | `business/` | matching, scoring, KPI, feature, roadmap, PMF |
   | `ux/` | a11y, WCAG, responsive, mobile, design system |
   | `roadmap/` | ROADMAP, PHASE, V\\d+ planning, future |
   | `misc/` | tout le reste |

   Si un fichier matche plusieurs thèmes, ranger dans le PREMIER matché (ordre listé). Documenter le tag secondaire dans le frontmatter d'index.

### Phase 2 — Génération wiki

1. Créer dossier `docs/wiki/` si absent
2. Pour chaque thème détecté avec ≥1 fichier :
   - Créer `docs/wiki/{theme}/INDEX.md` listant les fichiers du thème (titre + date + 1-line summary extrait)
   - **NE PAS** copier ou déplacer les fichiers source — ils restent intacts dans `docs/`
   - Le wiki contient des liens relatifs : `[Audit V67](../../AUDIT_PARCOURS_LOCATAIRE_PROPRIO_V67.md)`
3. Créer `docs/wiki/INDEX.md` racine :
   - Tableau récap : thème → nb docs → dernière date
   - Liens vers chaque `{theme}/INDEX.md`
   - Quick-reference top 5 fichiers les plus consultés (heuristique : taille + récence)
   - Section "Last 7 days" listant les fichiers modifiés récemment

### Phase 3 — Optimisation context

1. Pour chaque fichier > 500 lignes, générer un `docs/wiki/{theme}/{filename}.summary.md` :
   - Résumé en 100-150 mots
   - 3-5 bullets clés
   - Liens vers les sections importantes du fichier source
2. Le INDEX.md du thème pointe vers le summary par défaut, le source en lien secondaire

### Phase 4 — Maintenance

À chaque réinvocation :
- Détecter les fichiers source modifiés (mtime postérieur au INDEX)
- Régénérer uniquement les summaries impactés
- Mettre à jour le tableau racine

## Format des INDEX.md générés

### `docs/wiki/INDEX.md` (root)

```markdown
# Wiki KeyMatch

Compiled by `wiki-compiler` agent on YYYY-MM-DD.

## Themes

| Thème | Docs | Dernière MAJ | Index |
|---|---|---|---|
| Compliance | 4 | 2026-05-04 | [→](compliance/INDEX.md) |
| Security | 6 | 2026-05-05 | [→](security/INDEX.md) |
| Audit | 8 | 2026-05-05 | [→](audit/INDEX.md) |
| ... | ... | ... | ... |

**Total : N docs sur M thèmes**

## Quick reference (top 5)

1. [Audit parcours locataire+proprio V67](../AUDIT_PARCOURS_LOCATAIRE_PROPRIO_V67.md) — 268 lignes — 2026-05-03
2. [Audit scénarios exhaustifs V68](../AUDIT_SCENARIOS_EXHAUSTIFS_V68.md) — 309 lignes — 2026-05-04
3. ...

## Modified last 7 days
- `CODE_AUDIT_FINAL.md` — 2026-05-05
- `MIGRATION_062.sql` — 2026-05-05
- ...
```

### `docs/wiki/{theme}/INDEX.md`

```markdown
# {Theme}

## Documents (chronological desc)

### [Titre du doc](../../FILENAME.md)
**Date** : YYYY-MM-DD · **Lignes** : N · **Tags secondaires** : [...]

> Résumé extrait du premier paragraphe ou H2 (max 200 caractères).

---

### [Autre doc](../../OTHER.md)
...
```

## Règles

- **Ne pas modifier** les fichiers source dans `docs/` — wiki = surcouche read-only
- **Pas de duplication** — le wiki ne fait que indexer + summarizer, pas copier
- **Idempotent** : safe à re-exécuter, régénère uniquement les summaries impactés
- **Versionner** `docs/wiki/` dans git (utile pour onboarding sans rebuild)
- **Pattern Karpathy LLM Wiki** : rendre le savoir projet navigable et compressible pour les agents IA

## Output

À la fin de l'exécution, produire un rapport :
```
✅ Wiki compiled in docs/wiki/
   - {N} docs scanned
   - {M} themes
   - {K} new summaries generated
   - {L} summaries updated
   - INDEX.md regenerated
```

Mentionner si des fichiers n'ont pas pu être classifiés (thème `misc/`).
