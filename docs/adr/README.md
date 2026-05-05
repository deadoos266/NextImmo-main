# Architecture Decision Records — KeyMatch

Index des décisions architecturales du projet. Format Michael Nygard / MADR.

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | accepted | 2026-05-05 |

## Lifecycle

```
proposed → accepted → [deprecated | superseded by ADR-NNNN]
```

- **proposed** : décision en discussion, pas encore committée
- **accepted** : décision active, suivie par le code
- **deprecated** : décision obsolète (feature retirée, contexte changé)
- **superseded** : remplacée par un ADR plus récent (toujours linker)

## Comment créer un nouvel ADR

Utiliser l'agent `adr-writer` (`.claude/agents/adr-writer.md`) qui :
1. Détecte automatiquement les décisions pendant une session
2. Demande confirmation avant d'écrire le fichier
3. Numérote séquentiellement
4. Met à jour ce README

## Catégories KeyMatch (pour référence future)

| Catégorie | Exemples KeyMatch |
|-----------|-------------------|
| **Technology** | Next.js 15 App Router, Supabase vs Postgres direct, Resend vs SendGrid |
| **Architecture** | RLS Phase 5 server-side via supabaseAdmin, ISR /annonces, Realtime |
| **API design** | /api routes vs Server Actions, REST naming, rate-limit Upstash |
| **Data modeling** | profils.dossier_docs jsonb vs colonnes, historique_baux snapshot |
| **Security** | NextAuth credentials + Google OAuth, eIDAS niveau 1, RLS partials |
| **Compliance FR** | ALUR durée bail, eIDAS audit-trail, RGPD durée conservation |
