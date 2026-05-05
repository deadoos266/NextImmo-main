# ADR-0001: Record architecture decisions

**Date**: 2026-05-05
**Status**: accepted
**Deciders**: Paul Sadrant (founder KeyMatch)

## Context

KeyMatch a accumulé des dizaines de décisions architecturales depuis V0 (Next.js 15 App Router, Supabase + RLS, NextAuth, eIDAS niveau 1 pour les bails, ISR sur fiches annonce, RLS Phase 5 lockdown anon, etc.).

Ces décisions sont aujourd'hui dispersées :
- Dans des fichiers `PLAN_*.md` à la racine
- Dans `MEMORY.md` (notes de travail Claude)
- Dans des commits git (commit messages exhaustifs mais pas indexés)
- Dans des rapports d'audit `docs/AUDIT_*.md`

Quand un nouveau contributeur (humain ou agent IA) arrive, il n'y a pas de **point d'entrée structuré** pour comprendre **pourquoi** le code est ainsi.

Le format ADR (Architecture Decision Record), proposé par Michael Nygard, est un standard largement adopté pour résoudre ce problème : un fichier markdown court par décision, dans `docs/adr/NNNN-titre.md`, avec un index `README.md`.

## Decision

Nous adoptons le format ADR (Michael Nygard / MADR) pour capturer les décisions architecturales significatives dans `docs/adr/`.

Workflow :
1. Quand une décision architecturale est prise (choix de stack, pattern, schéma DB, stratégie auth, etc.), créer un nouvel ADR via le subagent `adr-writer`
2. Numérotation séquentielle `NNNN-` (4 chiffres pour permettre 9999 ADRs)
3. Index maintenu dans `docs/adr/README.md`
4. Les ADRs ne sont jamais supprimés — superseded au lieu de delete (lien vers le remplaçant)

## Alternatives Considered

### Alternative 1 — Continuer à utiliser `MEMORY.md` + commit messages
- **Pros** : pas de surcouche, les décisions sont déjà partiellement capturées
- **Cons** : pas indexé, pas standardisé, perdu dans le bruit
- **Why not** : un nouveau contributeur ne peut pas répondre rapidement à "pourquoi RLS Phase 5 a-t-elle fait passer toutes les SELECT par /api ?"

### Alternative 2 — Wiki externe (Notion, Confluence)
- **Pros** : interface riche, lecteur facile
- **Cons** : sort du repo git, perd la traçabilité version + dérive
- **Why not** : KeyMatch est solo + agents IA ; un wiki externe n'est pas accessible aux agents qui lisent le repo

### Alternative 3 — Documentation libre dans `docs/ARCHITECTURE.md`
- **Pros** : un seul fichier, plus simple
- **Cons** : pas de structure par décision, difficile de tracer l'évolution
- **Why not** : `ARCHITECTURE.md` documente l'état courant, pas le pourquoi historique. Les 2 sont complémentaires (cf agent `docs-keeper` pour ARCHITECTURE.md)

## Consequences

### Positive
- Onboarding humain ou agent IA plus rapide : `docs/adr/README.md` = entry point
- Le `pourquoi` est tracé séparément du `comment` (code + ARCHITECTURE.md)
- Reviews futures peuvent vérifier qu'une décision a été documentée avant merge
- L'agent `adr-writer` automatise la capture pendant les sessions Claude Code

### Negative
- Surcouche docs à maintenir
- Risque de bouchon : l'ADR doit être écrit, pas reporté à plus tard
- Décisions triviales ne doivent pas être ADRsées (variable naming, formatting)

### Risks
- **Risque** : ADRs deviennent obsolètes si les décisions évoluent sans nouveau ADR.
  - **Mitigation** : statut `superseded by ADR-NNNN` obligatoire, lien vers remplaçant. Trimestriel, l'agent `prompt-improver` ou un audit manuel surface les ADRs `accepted` qui contredisent le code courant.
- **Risque** : ADRs trop verbeux ou trop nombreux.
  - **Mitigation** : guideline "<2 minutes de lecture", "pas d'essai", checklist dans `adr-writer.md` (Do/Don't section).

## Consequences for KeyMatch specifically

Les décisions historiques V0→V70 ne seront PAS toutes backfillées (effort démesuré). Seules les décisions **structurantes encore actives** seront documentées rétroactivement si demandées :
- ADR-0002 : RLS Phase 5 — REVOKE SELECT anon sur 12/12 tables (mig 058+059)
- ADR-0003 : eIDAS niveau 1 pour signatures bail (vs niveau qualifié)
- ADR-0004 : Inline styles (no Tailwind, no CSS modules)
- ...

À partir de cet ADR-0001, les **nouvelles** décisions architecturales sont documentées au fil de l'eau via l'agent `adr-writer`.
