# Migrations Supabase — conventions

Ordre strict, incrementiel, pas de gap — sauf les numeros documentes
ci-dessous.

## Numeros volontairement vacants

### 018 — absorbee dans 020

La numerotation 018 etait initialement reservee a une migration
`18_profils_prenom.sql` qui devait introduire les colonnes
`profils.prenom` + `profils.nom` avec un soft-split de la legacy
`profils.nom_complet`. Cette migration n'a jamais ete poussee en prod.

**Choix retenu** : au moment de poser la suite (identite immuable
apres confirmation), on a fusionne le soft-split dans la migration
**020_identite_immuable.sql** (commit `ac38fb0`). 020 est idempotente
et fait le travail de 018 + 019 + son propre scope en un seul run :

```sql
-- Extrait du header 020
-- Securite si 018 n'avait pas ete appliquee : relance le soft-split.
```

Ne pas creer de `018_*.sql` — le numero est reserve historiquement.

### 022 — reserve (tentative abandonnee)

Le numero 022 a ete saute lors d'un rebase/merge parallele en avril
2026. Un commit `022_*.sql` experimental a existe en local puis a ete
abandonne au profit d'un fix direct sur le bucket baux (**023_baux_rls_fix.sql**).

Ne pas creer de `022_*.sql` — le numero est reserve historiquement.

## Regle pour les prochaines migrations

Prochain numero libre : **024**.

Nommer au format :

```
024_<verbe_court>_<table_ou_feature>.sql
```

Exemples :

- `024_add_created_at_clics_annonces.sql`
- `025_rls_bail_signatures.sql`

Toutes les migrations doivent etre :

- **Idempotentes** (`IF NOT EXISTS`, `IF EXISTS`, `DO $$ BEGIN ... EXCEPTION`)
- **Reversibles** (commenter un bloc `-- ROLLBACK:` en fin de fichier)
- **Testables** (application locale via `supabase db push` avant prod)

## Application en prod

Workflow documente dans `MEMORY.md` (user) :

1. Si `SUPABASE_ACCESS_TOKEN` PAT dispo → Management API (`mcp__supabase__apply_migration`).
2. Sinon → fallback SQL Editor avec fichier `APPLY_NOW_NNN.sql` idempotent.

Projet prod : `wzzibgdupycysvtwsqxo` (alias NextImmo).
