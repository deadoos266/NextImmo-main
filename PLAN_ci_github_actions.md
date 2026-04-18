# PLAN — CI GitHub Actions (lint + tsc + test + build)

## 1. Contexte et objectif
Aucune CI automatisée. `tsc --noEmit`, `vitest run`, `next build` sont tapés à la main. Un push `main` peut déployer du code cassé. Poser un workflow GitHub Actions qui tourne sur chaque PR + push main, bloque merge si rouge.

## 2. Audit de l'existant

### Présent
- `package.json` scripts : `lint`, `test`, `build`, `dev`.
- Vercel auto-deploy (Preview par branche + Production sur main). → déploie même si tests échouent.

### Absent
- `.github/workflows/*.yml` → aucun fichier.
- Badge README → aucun.
- Protected branch rule → probablement aucun.

## 3. Fichiers impactés

| Fichier | Statut | Changement |
|---|---|---|
| `.github/workflows/ci.yml` | **NOUVEAU** | Job lint + tsc + test + build sur push & PR. |
| `.github/workflows/deploy.yml` | **NOUVEAU** (optionnel) | Déclenche Vercel deploy uniquement si CI verte (redondant si Vercel Git = ok). |
| `nestmatch/package.json` | VÉRIFIER | Scripts `lint`, `test`, `build`, `typecheck`. |
| `.github/dependabot.yml` | **NOUVEAU** | Update auto dépendances npm hebdomadaire (sécurité). |

## 4. Migrations SQL
**Aucune**.

## 5. Variables d'env

Dans GitHub → Settings → Secrets and variables → Actions :
- `NEXTAUTH_SECRET` (dummy valide pour build, pas prod)
- `NEXTAUTH_URL` → `http://localhost:3000`
- `NEXT_PUBLIC_SUPABASE_URL` → staging URL (ou dummy valide syntaxe)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → staging anon
- `SUPABASE_SERVICE_ROLE_KEY` → staging service_role
- `NEXT_PUBLIC_URL` → `http://localhost:3000`

Optionnel (pour upload source maps Sentry) :
- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`, `SENTRY_PROJECT`

## 6. Dépendances
**Aucune** npm. GitHub Actions = gratuit 2000 min/mois.

## 7. Étapes numérotées

### Bloc A — Script `typecheck`
1. Vérifier `nestmatch/package.json` contient :
    ```json
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "next lint"
    ```
    Ajouter si manquant.

### Bloc B — Workflow CI
2. Créer `.github/workflows/ci.yml` :
    ```yaml
    name: CI

    on:
      push:
        branches: [main]
      pull_request:
        branches: [main]

    # Annule les runs précédents si nouveau push sur même branche
    concurrency:
      group: ${{ github.workflow }}-${{ github.ref }}
      cancel-in-progress: true

    jobs:
      quality:
        name: Lint + Types + Tests + Build
        runs-on: ubuntu-latest
        defaults:
          run:
            working-directory: nestmatch

        steps:
          - name: Checkout
            uses: actions/checkout@v4

          - name: Setup Node
            uses: actions/setup-node@v4
            with:
              node-version: "22"
              cache: "npm"
              cache-dependency-path: nestmatch/package-lock.json

          - name: Install dependencies
            run: npm ci

          - name: Lint
            run: npm run lint

          - name: TypeScript check
            run: npm run typecheck

          - name: Unit tests
            run: npm run test

          - name: Build
            env:
              NEXTAUTH_SECRET: ${{ secrets.NEXTAUTH_SECRET }}
              NEXTAUTH_URL: ${{ secrets.NEXTAUTH_URL }}
              NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
              NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
              SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
              NEXT_PUBLIC_URL: ${{ secrets.NEXT_PUBLIC_URL }}
            run: npm run build
    ```

### Bloc C — Secrets GitHub
3. Repo GitHub → Settings → Secrets and variables → Actions → New repository secret.
4. Ajouter les 6 secrets listés en §5. Utiliser les valeurs **staging** (ou dummy valide). **Ne JAMAIS** utiliser service_role prod dans CI.

### Bloc D — Protection branch main
5. Repo GitHub → Settings → Branches → Add branch protection rule.
6. Branch name pattern : `main`.
7. Cocher :
    - [x] Require a pull request before merging
    - [x] Require approvals (1) — optionnel si solo
    - [x] Require status checks to pass before merging
      - Recherche "quality" (nom du job) → ajouter
    - [x] Require branches to be up to date before merging
    - [x] Do not allow bypassing the above settings
8. Save.

### Bloc E — Dependabot (sécurité auto)
9. Créer `.github/dependabot.yml` :
    ```yaml
    version: 2
    updates:
      - package-ecosystem: "npm"
        directory: "/nestmatch"
        schedule:
          interval: "weekly"
          day: "monday"
          time: "06:00"
          timezone: "Europe/Paris"
        open-pull-requests-limit: 5
        groups:
          all-non-major:
            update-types:
              - "minor"
              - "patch"
        ignore:
          # On garde le contrôle sur les majors
          - dependency-name: "*"
            update-types: ["version-update:semver-major"]

      - package-ecosystem: "github-actions"
        directory: "/"
        schedule:
          interval: "monthly"
    ```
10. Dependabot créera des PR chaque lundi pour les minor/patch. La CI teste chaque PR.

### Bloc F — Badge README
11. Ajouter en tête du `README.md` :
    ```md
    [![CI](https://github.com/<owner>/<repo>/actions/workflows/ci.yml/badge.svg)](https://github.com/<owner>/<repo>/actions/workflows/ci.yml)
    ```

### Bloc G — Test du workflow
12. Créer une petite PR (modif README par ex) → vérifier CI se lance, verte.
13. Introduire volontairement une erreur (typo TS) → push → vérifier CI rouge → merge bloqué.
14. Reverter.

### Bloc H — Cache Next build (optionnel mais gain de temps)
15. Ajouter dans le step "Build" :
    ```yaml
    - name: Cache .next
      uses: actions/cache@v4
      with:
        path: nestmatch/.next/cache
        key: ${{ runner.os }}-nextjs-${{ hashFiles('nestmatch/**/package-lock.json') }}-${{ hashFiles('nestmatch/**.[jt]s', 'nestmatch/**.[jt]sx') }}
        restore-keys: |
          ${{ runner.os }}-nextjs-${{ hashFiles('nestmatch/**/package-lock.json') }}-
    ```
    → Builds suivants ~2x plus rapides.

## 8. Pièges connus

- **`working-directory: nestmatch`** : obligatoire car le projet est dans un sous-dossier. Oublier = `npm: command not found`.
- **`npm ci` vs `npm install`** : `ci` respecte strictement le lockfile, échoue si divergence. Bien pour CI.
- **Secrets en clair dans logs** : GitHub masque automatiquement si la valeur matche un secret. Mais **ne JAMAIS** `echo $SECRET` volontairement.
- **`concurrency`** : annule builds précédents sur même branche. Gain temps + quota.
- **Temps de build gratuit** : 2000 min/mois Free plan suffisant pour MVP (estimation 50-100 min/mois avec 10 PR/semaine).
- **Branche protégée bypass admin** : décocher "Do not allow bypassing" si tu veux pouvoir force-push en cas d'urgence. Par défaut : strict.
- **PR Dependabot** : peut pleuvoir. Ajouter label auto ou approuver en batch une fois par semaine.
- **Node version** : cohérent avec prod (Vercel). Actuellement Node 22 dispo, mais vérifier compat Next 15.

## 9. Checklist "c'est fini"

- [ ] `.github/workflows/ci.yml` commit sur `main`.
- [ ] Job CI run sur chaque PR + push main.
- [ ] Lint + TypeScript + Tests + Build passent en < 5 min.
- [ ] Erreur volontaire → CI rouge → merge bloqué.
- [ ] Branch protection `main` active.
- [ ] `.github/dependabot.yml` configuré.
- [ ] Badge CI dans `README.md`.
- [ ] Secrets GitHub configurés (NEXTAUTH, Supabase staging).
- [ ] 1 PR test réussie (merge possible après CI verte).

---

**Plan prêt, OK pour Sonnet.** Aucun bloc ⚠️ Opus-only : pure infra CI.

⚠️ **Blocker prérequis** : Sonnet doit avoir accès aux secrets GitHub (ajoutés par David) **avant** le premier run. Sinon CI échoue au step Build.
