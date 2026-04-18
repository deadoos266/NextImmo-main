# PLAN — Supabase CLI + migrations versionnées + seed

## 1. Contexte et objectif
Actuellement les migrations `001-009` sont dans `nestmatch/supabase/migrations/` et lancées **à la main** dans SQL Editor. Pas reproductible, pas d'ordre strict vérifié, impossible à rejouer sur un nouveau projet (staging). Installer Supabase CLI pour versioner proprement et faciliter le futur staging (P0.3).

## 2. Audit de l'existant

### Fichiers présents
```
nestmatch/supabase/migrations/
├── 001_create_users.sql
├── 002_create_carnet_entretien.sql
├── 003_create_visites.sql
├── 004_batch26_security_hardening.sql
├── 005_storage_bucket_policies.sql
├── 006_gestion_documentaire.sql
├── 007_profil_dossier_complet.sql
├── 008_parametres_profil_public.sql
└── 009_profils_nullable_fields.sql
```

### Problèmes
- Nommage `001_xxx.sql` au lieu de format Supabase CLI `<timestamp>_xxx.sql`.
- Pas de `supabase/config.toml` (CLI non initialisée).
- Pas de script `npm run db:reset` / `db:seed`.
- Pas de `schema.sql` consolidé (dump de l'état attendu).
- Pas de mention `NOTIFY pgrst, 'reload schema';` dans plusieurs migrations (cause des bugs schema cache récents).

## 3. Fichiers impactés

| Fichier | Statut | Changement |
|---|---|---|
| `nestmatch/supabase/config.toml` | **NOUVEAU** | Généré par `supabase init`. Contient project_id, DB port local, etc. |
| `nestmatch/supabase/migrations/001-009` | RENOMMÉS | Préfixer par timestamp Supabase : `20251001000001_create_users.sql` etc. Garder l'ordre. |
| `nestmatch/supabase/seed.sql` | **NOUVEAU** | Seed data dev (optionnel mais utile) : 2 users admin, 5 annonces test, quelques profils. |
| `nestmatch/package.json` | MODIF | Scripts `db:reset`, `db:seed`, `db:diff`, `db:push`. |
| `.gitignore` | MODIF | Ajouter `supabase/.temp/`, `supabase/.branches/`. |
| `nestmatch/supabase/README.md` | **NOUVEAU** | Doc : comment appliquer une migration, comment tester en local, comment push prod. |

## 4. Migrations SQL
**Aucune nouvelle**. On renomme l'existant.

Mais : ajouter en fin de chaque migration ALTER TABLE la ligne :
```sql
NOTIFY pgrst, 'reload schema';
```
Si absente. Revue manuelle des 9 fichiers nécessaire.

## 5. Variables d'env

```bash
# Supabase CLI (local dev, lié au projet existant)
SUPABASE_PROJECT_ID=<récupérable via `supabase link`>
SUPABASE_DB_PASSWORD=<mot de passe postgres du projet Supabase>
SUPABASE_ACCESS_TOKEN=<token perso généré sur supabase.com/dashboard/account/tokens>
```

## 6. Dépendances

```bash
# Installer Supabase CLI localement (pas npm global pour éviter pollution)
cd nestmatch
npm install -D supabase

# Ou via Scoop / Homebrew / direct binary si npm pose problème Windows :
# https://supabase.com/docs/guides/cli
```

## 7. Étapes numérotées

### Bloc A — Init CLI
1. `cd nestmatch && npx supabase init`. Accepte les défauts. Crée `supabase/config.toml`.
2. Ouvre `supabase/config.toml`. Vérifie :
   ```toml
   [api]
   port = 54321
   [db]
   port = 54322
   ```
3. Dans le Supabase Dashboard → Settings → General : récupère `Reference ID`. `npx supabase link --project-ref <ref>` pour lier le projet distant.

### Bloc B — Renommage migrations
4. Pour chaque migration, renommer au format `YYYYMMDDHHMMSS_nom.sql`. **Ordre à respecter** :
   ```
   20250101000001_create_users.sql
   20250201000001_create_carnet_entretien.sql
   20250301000001_create_visites.sql
   20250401000001_batch26_security_hardening.sql
   20250501000001_storage_bucket_policies.sql
   20250601000001_gestion_documentaire.sql
   20250701000001_profil_dossier_complet.sql
   20250801000001_parametres_profil_public.sql
   20250901000001_profils_nullable_fields.sql
   ```
5. ⚠️ **Les dates doivent être antérieures à aujourd'hui** sinon la CLI les rejoue. On met des timestamps de 2025 puisque c'est "l'historique passé".
6. `git mv` plutôt que copier/supprimer pour garder l'historique.

### Bloc C — Synchronisation avec la prod
7. `npx supabase db pull` — génère un fichier `supabase/migrations/<timestamp>_remote_schema.sql` qui capture l'état actuel de la prod. **À comparer** avec nos migrations existantes.
8. Si divergence (colonnes en prod pas dans nos migrations, ou inverse), créer `supabase/migrations/<timestamp>_sync_prod.sql` avec les ajustements.
9. Commit tout ça dans `main`.

### Bloc D — Ajout `NOTIFY pgrst` manquant
10. Parcourir les 9 migrations. Pour chacune qui fait `ALTER TABLE` ou `CREATE TABLE`, vérifier la présence de `NOTIFY pgrst, 'reload schema';` en fin de fichier. Si absent, **ajouter** dans une ligne commentée ou créer une migration `xxx_reload_schema.sql` consolidée.

### Bloc E — Seed dev
11. Créer `nestmatch/supabase/seed.sql` :
    ```sql
    -- Seed dev uniquement. NE PAS run en prod.
    -- Exécuté automatiquement par `npx supabase db reset`.

    -- Users de test (mots de passe bcrypt "test1234")
    INSERT INTO users (email, nom, password_hash, email_verified, role, is_admin)
    VALUES
      ('admin@test.local', 'Admin Test', '$2a$10$...', true, 'proprietaire', true),
      ('proprio@test.local', 'Propriétaire Test', '$2a$10$...', true, 'proprietaire', false),
      ('locataire@test.local', 'Locataire Test', '$2a$10$...', true, 'locataire', false)
    ON CONFLICT (email) DO NOTHING;

    -- Annonces de test
    INSERT INTO annonces (titre, ville, prix, surface, pieces, type_bien, proprietaire_email, dispo, statut)
    VALUES
      ('Studio cosy Paris 15e', 'Paris', 950, 22, 1, 'Studio', 'proprio@test.local', 'Disponible maintenant', 'disponible'),
      ('T2 lumineux Lyon 6e', 'Lyon', 800, 45, 2, 'Appartement', 'proprio@test.local', 'Disponible maintenant', 'disponible')
    ON CONFLICT DO NOTHING;
    ```
12. ⚠️ Ne PAS mettre de données réelles dans seed. Ce fichier commit dans git.

### Bloc F — Scripts package.json
13. Ajouter :
    ```json
    "db:diff": "npx supabase db diff",
    "db:push": "npx supabase db push",
    "db:pull": "npx supabase db pull",
    "db:reset:local": "npx supabase db reset",
    "db:migrate:new": "npx supabase migration new"
    ```
14. **⚠️ Ne PAS ajouter `db:reset:prod`** — trop dangereux.

### Bloc G — Documentation
15. Créer `nestmatch/supabase/README.md` :
    ```md
    # Migrations Supabase NestMatch

    ## Créer une nouvelle migration
    `npm run db:migrate:new nom_de_la_migration`
    → Édite le fichier généré dans `supabase/migrations/`
    → Teste en local : `npm run db:reset:local`

    ## Pousser vers Supabase prod
    `npm run db:push`
    → Applique les migrations non encore en prod
    → ⚠️ N'inclut PAS les destructive changes (DROP COLUMN) sans confirmation

    ## Récupérer l'état de la prod en local
    `npm run db:pull`
    → Génère une migration miroir

    ## Toujours terminer par
    `NOTIFY pgrst, 'reload schema';` dans chaque ALTER/CREATE qui touche aux tables exposées.
    ```

### Bloc H — gitignore
16. Ajouter dans `nestmatch/.gitignore` :
    ```
    # Supabase CLI
    supabase/.temp/
    supabase/.branches/
    ```

### Bloc I — Test local (optionnel mais recommandé)
17. `npx supabase start` → Docker lance Postgres local + Studio local.
18. `npm run db:reset:local` → applique toutes les migrations + seed.
19. Ouvrir http://localhost:54323 (Studio local) → vérifier tables + seed présent.
20. `npx supabase stop` quand fini.

## 8. Pièges connus

- **`supabase db push` peut détruire** : la CLI détecte les DROP COLUMN / DROP TABLE et peut les proposer. **Toujours** faire `db:diff` d'abord pour review avant push.
- **Renommage timestamps** : si tu mets un timestamp **plus récent** qu'une migration déjà en prod, la CLI essaiera de le rejouer. **Toujours** timestamps 2025 pour l'historique existant.
- **Linking projet** : la CLI doit être linked avec le bon projet Supabase (`supabase link --project-ref`). Sinon `db:push` peut pousser dans le mauvais env.
- **Seed avec mot de passe bcrypt** : il faut un vrai hash bcrypt. Générer via `node -e "console.log(require('bcryptjs').hashSync('test1234', 10))"`. Ajouter `bcryptjs` en devDependency si absent.
- **Docker requis** pour `supabase start` local. Sur Windows, Docker Desktop indispensable. Si pas installé, skip le Bloc I.
- **Ne JAMAIS run `db:reset:local` sur l'URL prod** — c'est une commande locale, mais vérifier la config avant.
- **NextAuth ≠ Supabase Auth** : les seed users doivent utiliser le hash bcrypt de NextAuth, pas Supabase Auth. Table `users` NextAuth custom.

## 9. Checklist "c'est fini"

- [ ] `supabase/config.toml` présent et commit.
- [ ] `npx supabase link --project-ref <ref>` fonctionne, `supabase status` renvoie OK.
- [ ] `npx supabase db diff` sur `main` après renommage retourne **rien** (le schéma distant matche nos migrations locales).
- [ ] Les 9 migrations renommées au format `YYYYMMDDHHMMSS_nom.sql`, ordre respecté.
- [ ] `supabase/seed.sql` commit, fonctionne en local si tu as Docker.
- [ ] `supabase/README.md` lisible et clair.
- [ ] Scripts `npm run db:diff / db:push / db:pull` présents dans `package.json`.
- [ ] `.gitignore` exclut `supabase/.temp/` et `supabase/.branches/`.
- [ ] Chaque migration ALTER/CREATE termine par `NOTIFY pgrst, 'reload schema';`.

---

**Plan prêt, OK pour Sonnet.** ⚠️ Un bloc à surveiller : Bloc C (pull prod) — si divergence importante entre prod et migrations locales, **Opus doit trancher** sur la stratégie de sync (rewrite migrations ou migration corrective).
