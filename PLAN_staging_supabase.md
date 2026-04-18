# PLAN — Staging Supabase distinct

## 1. Contexte et objectif
Aujourd'hui 1 seule DB Supabase = prod. Chaque migration appliquée est live. Une erreur = app cassée pour les vrais users. Créer un projet Supabase de staging séparé pour tester les migrations, features risquées (nouvelles tables, changements RLS) et les tests E2E (Phase 2) sans pourrir la prod.

## 2. Audit de l'existant

### État actuel
- 1 projet Supabase "NestMatch Prod" utilisé par Vercel production + Vercel preview branches + dev local.
- Aucun isolement : un `DROP TABLE` en dev par erreur = catastrophe.
- Pas de procédure pour rejouer les migrations depuis zéro.

### Ce qui existe déjà
- Migrations propres si P0.2 (Supabase CLI) est terminé.
- `.env.local` pointe vers prod (SUPABASE_URL, anon key, service_role key).

## 3. Fichiers impactés

| Fichier | Statut | Changement |
|---|---|---|
| `nestmatch/.env.staging` | **NOUVEAU** | Copie de `.env.local` avec URL/clés staging. Ignoré par git. |
| `nestmatch/.env.local.example` | MODIF | Ajouter clés staging commentées. |
| `nestmatch/.gitignore` | MODIF | Vérifier `.env.staging` ignoré. |
| `nestmatch/supabase/config.toml` | MODIF (si P0.2 fait) | Aucun changement direct, mais on peut définir plusieurs env. |
| `nestmatch/package.json` | MODIF | Scripts `db:push:staging`, `db:push:prod`. |
| `nestmatch/supabase/README.md` | MODIF | Doc flow staging. |

## 4. Migrations SQL

Aucune nouvelle. On va juste appliquer **toutes** les migrations existantes sur le nouveau projet staging.

Si P0.2 est terminé :
```bash
npx supabase link --project-ref <staging-ref>
npx supabase db push
# vérifier
npx supabase db diff    # doit être vide
```

## 5. Variables d'env

### Dans `.env.staging` (local, jamais commit)

```bash
# Staging Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<staging-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key staging>
SUPABASE_SERVICE_ROLE_KEY=<service_role staging>

# NextAuth — secret séparé pour éviter cross-env auth
NEXTAUTH_SECRET=<nouveau secret random 32+ char>
NEXTAUTH_URL=http://localhost:3000

# Google OAuth — si on veut Google login en staging, créer un second OAuth client dans Google Cloud Console avec callback http://localhost:3000/api/auth/callback/google
GOOGLE_CLIENT_ID=<staging client id>
GOOGLE_CLIENT_SECRET=<staging client secret>

# Misc
NEXT_PUBLIC_URL=http://localhost:3000
DOSSIER_LOG_SALT=<nouveau random>
```

### Dans Vercel (optionnel — si on veut déployer staging sur Vercel preview)

Créer un "Preview" environment spécifique pour branches hors `main`, qui pointe vers staging :
- `NEXT_PUBLIC_SUPABASE_URL` (staging)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (staging)
- `SUPABASE_SERVICE_ROLE_KEY` (staging)

## 6. Dépendances

Aucune. `supabase CLI` déjà installée si P0.2 fait.

## 7. Étapes numérotées

### Bloc A — Créer le projet staging
1. Aller sur https://supabase.com/dashboard/projects
2. Cliquer **New project**
   - Organization : la même
   - Name : `nestmatch-staging`
   - Database password : générer fort (password manager), **noter**
   - Region : la même que prod (Eu-West)
   - Plan : Free
3. Attendre ~2 min que le projet soit provisionné.
4. Dans le nouveau projet → Settings → API → copier :
   - `URL` → `https://<staging-ref>.supabase.co`
   - `anon public` → clé anon
   - `service_role` → clé service_role

### Bloc B — Configuration .env.staging
5. Créer `nestmatch/.env.staging` avec les 3 clés Supabase + nouveau `NEXTAUTH_SECRET` (voir §5).
6. Vérifier `.gitignore` contient `.env.staging` et `.env.local` (il devrait déjà : `*.local`).
7. Ajouter exemple dans `nestmatch/.env.local.example` :
    ```bash
    # Staging (optionnel - créer un .env.staging séparé)
    # NEXT_PUBLIC_SUPABASE_URL=https://staging-xxx.supabase.co
    # NEXT_PUBLIC_SUPABASE_ANON_KEY=...
    # SUPABASE_SERVICE_ROLE_KEY=...
    ```

### Bloc C — Appliquer migrations en staging
8. `cd nestmatch`
9. `npx supabase link --project-ref <staging-ref>` (confirmera en demandant le DB password du Bloc A step 2).
10. `npx supabase db push` — applique les 9 migrations existantes.
11. **Vérifier** : Supabase Studio staging → Table Editor → toutes les tables présentes, colonnes correctes.
12. `NOTIFY pgrst, 'reload schema';` dans staging Studio SQL Editor (defense en profondeur).

### Bloc D — Créer les buckets Storage staging
13. Staging project → Storage → créer manuellement :
    - `dossiers` (public=false, même config que prod)
    - `annonces-photos` (public=false)
    - `avatars` (public=true, 2MB max, JPEG/PNG/WebP)
14. Policies = identiques à prod si P0.2 a posé `005_storage_bucket_policies.sql` correctement.

### Bloc E — Scripts helper
15. Ajouter dans `package.json` :
    ```json
    "dev:staging": "dotenv -e .env.staging -- next dev",
    "db:push:staging": "dotenv -e .env.staging -- supabase db push",
    "db:pull:staging": "dotenv -e .env.staging -- supabase db pull"
    ```
    → Requiert `npm install -D dotenv-cli`.

### Bloc F — Lier Vercel Preview à staging (optionnel — à faire seulement si souhaité maintenant)
16. Vercel dashboard → Project NestMatch → Settings → Environment Variables.
17. Pour chaque clé Supabase, créer une nouvelle entrée :
    - Scope : **Preview** only (pas Production, pas Development)
    - Value : les clés **staging** (≠ prod)
18. Push une branche → le deploy preview pointera vers staging DB.

### Bloc G — Procédure de sync prod → staging (pour tester futures migrations)
19. Documenter dans `supabase/README.md` :
    ```md
    ## Tester une migration risquée

    1. Créer branche `feature/migration-xxx`
    2. `npx supabase migration new ma_migration`
    3. Éditer le fichier
    4. `npm run db:push:staging`
    5. Tester via `npm run dev:staging`
    6. Si OK → PR → merge main → `npm run db:push` (prod)
    7. Si KO → débugguer sans stress, puis retry
    ```

### Bloc H — Seed staging (optionnel)
20. `dotenv -e .env.staging -- supabase db execute --file supabase/seed.sql`
    (ou via SQL Editor staging). Permet de bosser sur des vraies données fictives sans polluer sa base dev.

## 8. Pièges connus

- **2 projets Supabase Free** : le free tier est généreux (500 MB par projet). OK pour staging. Si dépassé, le projet staging est pause auto — pas grave si pas d'users réels dessus.
- **OAuth Google staging** : si on veut Google login en staging, **créer un second OAuth client** dans Google Cloud Console. Ne PAS réutiliser celui de prod (callback URL ≠).
- **Variables Vercel Preview** : si on configure Vercel preview à pointer staging, **tester** d'abord sur une branche isolée. Un oubli et les PR deviennent toutes sur staging (pas grave mais confusing).
- **db:push dangereux** : lire `db:diff` avant chaque push. La CLI peut proposer des DROP COLUMN inattendus.
- **Service_role staging != prod** : NE JAMAIS utiliser service_role prod en dev. Les clés sont différentes pour une raison.
- **Pas de RLS auth.*() rappel** : NextAuth ≠ Supabase Auth, pas la peine d'écrire des policies RLS avec `auth.uid()` en staging non plus.

## 9. Checklist "c'est fini"

- [ ] Projet Supabase staging créé, provisionné, accessible.
- [ ] `.env.staging` local présent avec 3 clés + NEXTAUTH_SECRET distinct.
- [ ] `npx supabase db push` a appliqué toutes les migrations sur staging.
- [ ] Supabase Studio staging → toutes les tables (`users`, `profils`, `annonces`, `messages`, `visites`, `carnet_entretien`, `loyers`, `etats_des_lieux`, `clics_annonces`, `contacts`, `signalements`, `dossier_access_log`).
- [ ] Buckets storage staging créés avec policies.
- [ ] `npm run dev:staging` fonctionne, login test ok (fake user via seed).
- [ ] Doc `supabase/README.md` à jour avec flow staging.
- [ ] Vercel Preview optionnellement branché staging (nice-to-have, pas bloquant).

---

**Plan prêt, OK pour Sonnet** sur tous les blocs A-E et G-H.

⚠️ **Bloc F (Vercel Preview pointé sur staging)** : décision business — si David veut garder Vercel Preview sur prod DB (pour tester exactement le comportement prod sur une PR), skipper. Si staging DB sur Preview, impliquer Opus pour valider la propagation des secrets.
