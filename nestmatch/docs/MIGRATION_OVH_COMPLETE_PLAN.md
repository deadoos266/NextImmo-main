# MIGRATION OVH COMPLETE PLAN — KeyMatch

**Statut** : Vivant. Mis à jour à chaque étape franchie.
**Décision actée** : 2026-05-17 — Paul valide migration progressive Vercel/Supabase/Resend → VPS OVH single-server.
**Hôte cible** : VPS-2 OVH Roubaix (6 vCore / 12 GB RAM / 100 GB NVMe / 10,19€ TTC/mois).
**Domaine** : keymatch-immo.fr (DNS reste sur OVH zone, on basculera à la fin si nécessaire).

---

## Table des matières

- [0. Contexte et règles d'or](#0-contexte)
- [1. Inventaire fonctionnel à préserver](#1-inventaire)
- [2. Architecture cible](#2-architecture)
- [3. Phases de migration (ordre strict)](#3-phases)
  - [Phase 0 — VPS bootstrap & hardening](#phase-0)
  - [Phase 1 — Worker Zendriver (DataDome bypass)](#phase-1)
  - [Phase 2 — Postgres self-host + dump Supabase](#phase-2)
  - [Phase 3 — MinIO storage + migration photos/docs](#phase-3)
  - [Phase 4 — Realtime socket.io](#phase-4)
  - [Phase 5 — Email Brevo (couper Resend)](#phase-5)
  - [Phase 6 — Next.js sur VPS (couper Vercel)](#phase-6)
  - [Phase 7 — Monitoring Sentry self-host](#phase-7)
  - [Phase 8 — Backups B2 + plan de reprise](#phase-8)
  - [Phase 9 — Cron Linux (couper Vercel cron)](#phase-9)
  - [Phase 10 — Cutover DNS + couper Supabase](#phase-10)
- [4. Protocole VERIFY par phase](#4-verify)
- [5. Plan de rollback par phase](#5-rollback)
- [6. Coûts cumulés par phase](#6-couts)
- [7. Inventaire DOIT-PAS-CASSER (cross-phase checklist)](#7-doit-pas-casser)

---

<a id="0-contexte"></a>
## 0. Contexte et règles d'or

### Pourquoi migrer
- Paul paye **Vercel Pro ~18€/mois** aujourd'hui.
- Indépendance des SaaS (Vercel, Supabase, Resend) → contrôle données, pas de blocage TOS.
- Coût stable et prédictible (10€/mois fixe au lieu de ~25-65€/mois croissance SaaS).
- **Self-host worker Camoufox/Zendriver** nécessaire pour bypass DataDome (Leboncoin/SeLoger) — autant prendre le VPS qui servira ensuite à tout.

### Règles d'or NON-NÉGOCIABLES
1. **Aucune fonctionnalité de KeyMatch ne se perd**. Si une feature n'est pas re-implémentée en self-host, on ne coupe pas le SaaS correspondant.
2. **Migration progressive, jamais big-bang**. Chaque phase ajoute du nouveau et garde l'ancien jusqu'à validation.
3. **Rollback prévu pour chaque phase** (procédure documentée + testée mentalement avant exécution).
4. **Protocole VERIFY de [CLAUDE.md](../CLAUDE.md)** appliqué à chaque commit : tsc + vitest + next build + verifier subagent + log explicite des "non vérifié".
5. **Pas d'env vars hardcodés**. Tout secret passe par `.env.local` (dev) + Vercel env (prod) + `/etc/keymatch.env` (VPS).
6. **Pas de breaking change RLS** sans test du flow utilisateur concerné.
7. **Annoncer en prod via `/admin/releases`** (script `release-from-commit.sh`) à chaque push qui livre une feature.

### Ce qu'on N'inclut PAS dans la migration V1
- Migration Upstash Redis → Redis self-host (utile mais pas critique, free tier Upstash OK longtemps).
- Migration GitHub → GitLab self-host (pas la peine).
- Migration NextAuth Google OAuth → autre provider (Google reste, on garde).
- Migration Cloudflare DNS (le DNS reste chez OVH, simple A record vers VPS quand on cutover).

---

<a id="1-inventaire"></a>
## 1. Inventaire fonctionnel à préserver

**Toute feature listée ici DOIT continuer à marcher après chaque phase.** Si une phase casse une feature, on revert.

### Auth & utilisateurs
- [x] Login NextAuth Google
- [x] Login NextAuth Email + OTP
- [x] Session persistante 30 jours
- [x] Rôles : locataire / proprio (détecté via `profils.is_proprietaire` OU `annonces.proprietaire_email`)
- [x] Page profil locataire (préférences, dossier docs CNI/fiches paie)
- [x] Page profil proprio
- [x] Avatar uploadé (Supabase Storage `avatars/`)

### Annonces (proprio)
- [x] CRUD annonces 7-step wizard `/proprietaire/ajouter`
- [x] Import URL depuis 17 sites (PAP, 12 agences V97.38, generic OG, + 3 DataDome V97.39 à venir)
- [x] Photos annonces upload (Supabase Storage `annonces/`)
- [x] Géolocalisation lat/lng (carte Leaflet)
- [x] Critères de filtrage (R10.6 v2)
- [x] Annonce → publiée / brouillon / archivée
- [x] Statistiques annonces vues/contactées (admin)

### Annonces (locataire)
- [x] Recherche par filtres `/annonces`
- [x] Recherches sauvegardées
- [x] Swipe Tinder `/swipe`
- [x] Score matching 1000 pts (`lib/matching.ts`)
- [x] Pages détail annonce avec galerie photos
- [x] Recommandations IA `/recommandations`

### Candidatures
- [x] Dossier locataire (12 champs + uploads docs : CNI, fiches paie, avis impôts, garants)
- [x] Candidature à une annonce
- [x] Vue proprio des candidatures reçues
- [x] Statuts : envoyée / vue / acceptée / refusée

### Visites
- [x] Demande de visite depuis fiche annonce ou messages
- [x] Calendrier visites proprio
- [x] Statuts : proposée / confirmée / annulée / effectuée
- [x] Email notification visite

### Messages
- [x] Chat 1-to-1 entre proprio et candidat
- [x] **Realtime** (messages apparaissent live sans refresh)
- [x] Compteur messages non lus (badge cloche)
- [x] Filtres conversations
- [x] Recherche conversations

### Bail
- [x] Génération bail PDF (modèle ALUR loi 89-462)
- [x] **Signature eIDAS niveau 1** (proprio + locataire dans le bail à 2)
- [x] Bail signé stocké en PDF (Supabase Storage `baux/`)
- [x] IRL automatique (révision annuelle)
- [x] Préavis 1/3 mois selon zone tendue

### EDL (État Des Lieux)
- [x] EDL entrée / sortie contradictoire
- [x] **Realtime** (proprio et locataire peuvent éditer simultanément)
- [x] Photos par pièce (Supabase Storage `edl/`)
- [x] Signature eIDAS sur EDL signé
- [x] PDF EDL téléchargeable

### Loyers & quittances
- [x] Génération quittance PDF automatique (mensuelle)
- [x] Historique loyers
- [x] Auto-paiement (notification réception)
- [x] Restitution dépôt de garantie (calcul auto retenues)

### Admin
- [x] `/admin` dashboard
- [x] `/admin/users` (gestion users)
- [x] `/admin/annonces` (modération)
- [x] `/admin/bugs` (rapports bugs users)
- [x] `/admin/crons` (statut crons)
- [x] `/admin/emails` (sortie Resend)
- [x] `/admin/health` (santé services)
- [x] `/admin/imports` (monitoring parsers)
- [x] `/admin/logos` (variantes brand)
- [x] `/admin/operations` (ops db/backup/etc.)
- [x] `/admin/qa` (release validation)
- [x] `/admin/releases` (changelog + checks Paul)
- [x] `/admin/settings`

### Crons (vercel.json — 19 crons existants)
- [x] Health check toutes heures
- [x] IRL update mensuel
- [x] Quittances génération mensuelle
- [x] Reminders visites
- [x] Cleanup sessions
- [x] Backups checks
- [x] Et 13 autres

### Pages publiques SEO
- [x] Homepage `/`
- [x] `/location/[ville]` (pages SEO villes)
- [x] `/location/[ville]/[quartier]`
- [x] `/aide/*`
- [x] `/cgu`, `/mentions-legales`, `/politique-confidentialite`, `/cookies`
- [x] `/blog/*` (si existant)

### Intégrations externes
- [x] Sentry (errors + performance)
- [x] Resend (emails transactionnels)
- [x] Google OAuth
- [x] Upstash Redis (rate-limit)

---

<a id="2-architecture"></a>
## 2. Architecture cible

### Avant migration (aujourd'hui)
```
USER → keymatch-immo.fr (OVH DNS) → A record → Vercel CDN → Next.js (SSR)
                                                       ↓
                              ┌────────────────────────┴────────────────────────┐
                              ↓                                                 ↓
                       Supabase (DB + Auth + Storage + Realtime)         Resend (emails)
                              ↓
                       Upstash Redis (rate-limit)
                              ↓
                       Sentry (errors)
```

### Après migration complète (cible)
```
USER → keymatch-immo.fr (OVH DNS) → A record → Cloudflare gratuit (CDN/DDoS)
                                                       ↓
                              ╔════════════════════════════════════════════╗
                              ║  VPS-2 OVH Roubaix (12 GB / 100 GB NVMe)   ║
                              ║                                            ║
                              ║  ┌─ Caddy (TLS auto Let's Encrypt) ─────┐ ║
                              ║  │                                       │ ║
                              ║  │  ┌─ Docker Compose ─────────────────┐│ ║
                              ║  │  │ keymatch-next:3000              ││ ║
                              ║  │  │ keymatch-postgres:5432          ││ ║
                              ║  │  │ keymatch-redis:6379             ││ ║
                              ║  │  │ keymatch-minio:9000             ││ ║
                              ║  │  │ keymatch-worker (zendriver):8080││ ║
                              ║  │  │ keymatch-glitchtip:8000 (opt)   ││ ║
                              ║  │  └─────────────────────────────────┘│ ║
                              ║  │                                       │ ║
                              ║  └───────────────────────────────────────┘ ║
                              ║                                            ║
                              ║  systemd cron : backups, IRL, quittances   ║
                              ║  rclone → Backblaze B2 (offsite backups)   ║
                              ╚════════════════════════════════════════════╝
                                              ↓ outbound
                              ┌───────────────┴───────────────┐
                              ↓               ↓               ↓
                     Brevo (emails)    Google OAuth    Target sites (scrape)
```

### Coût mensuel cible
- VPS-2 OVH : 10,19€
- Backblaze B2 backups (~5 GB) : ~0,03€
- Brevo email (free tier 300/jour) : 0€
- Cloudflare CDN free : 0€
- Domain keymatch-immo.fr (OVH) : 0,83€/mois (10€/an)
- **TOTAL : ~11€/mois TTC** (vs ~18€ Vercel Pro aujourd'hui)

---

<a id="3-phases"></a>
## 3. Phases de migration (ordre strict)

> **L'ordre est non-négociable.** Chaque phase dépend de la précédente (sauf indiqué). Aucune phase ne se merge avant l'audit VERIFY OK.

<a id="phase-0"></a>
### Phase 0 — VPS bootstrap & hardening

**Durée estimée** : 1h30
**Pré-requis** : Paul a commandé VPS-2, reçu l'IP par mail OVH.
**Objectif** : VPS sécurisé, Docker installé, Caddy prêt, monitoring basique.

#### Tâches
1. SSH initial avec mot de passe root reçu par OVH (port 22).
2. `apt update && apt full-upgrade -y`.
3. Créer user `keymatch` (non-root), ajouter à `sudo` et `docker` groupes.
4. Copier clé SSH publique de Paul dans `~/.ssh/authorized_keys`.
5. **Désactiver login SSH par mot de passe** (`/etc/ssh/sshd_config` → `PasswordAuthentication no`).
6. Installer `ufw` : allow 22/tcp, 80/tcp, 443/tcp, deny everything else.
7. Installer `fail2ban` (SSH brute-force ban auto).
8. Installer `unattended-upgrades` (patches sécu auto).
9. Installer Docker + Docker Compose v2.
10. Installer Caddy (`caddy.cloudsmith.io/repo`).
11. Créer `/srv/keymatch/` (working dir), `/etc/keymatch.env` (secrets centralisés).
12. Reverse DNS : configurer `keymatch-vps.example.com` ↔ IP via OVH panel (utile pour SMTP futur).
13. Test : `ssh keymatch@<IP>`, `docker --version`, `caddy version`, `ufw status verbose`.

#### Livrables
- VPS accessible uniquement par SSH key Paul.
- Docker + Caddy + UFW opérationnels.
- `/etc/keymatch.env` créé (vide pour l'instant).

#### Audit VERIFY (Phase 0)
- [ ] `ssh keymatch@<IP>` marche, login mot de passe refusé
- [ ] `ufw status` → 22/80/443 allowed, reste denied
- [ ] `fail2ban-client status` → sshd jail active
- [ ] `docker run hello-world` → OK
- [ ] `caddy run --config /dev/null` (smoke test binary)
- [ ] `unattended-upgrades --dry-run -d` → "No packages found" ou OK
- [ ] Reverse DNS : `dig -x <IP>` retourne le hostname OVH

#### Rollback Phase 0
- Réinstaller le VPS depuis le panneau OVH (option "Réinstaller"). Pas de data à perdre à ce stade.

---

<a id="phase-1"></a>
### Phase 1 — Worker Zendriver (DataDome bypass)

**Durée estimée** : 6-8h
**Dépend de** : Phase 0
**Objectif** : Bypass Leboncoin / SeLoger / Logic-immo via worker stealth déployé sur VPS, intégré à KeyMatch async polling.

> **C'est l'objectif business immédiat de Paul.** Cette phase suffit à débloquer LBC/SeLoger sans toucher au reste.

#### Tâches côté worker (`tools/zendriver-worker/`)
1. Créer `worker.py` (FastAPI + Zendriver) avec endpoints `POST /fetch`, `GET /health`.
2. Auth Bearer (constant-time compare).
3. SSRF guard (port Python de `lib/import/fetcher.ts:isPrivateIp`).
4. Host allowlist (`leboncoin.fr,seloger.com,logic-immo.com`).
5. Rate-limit 60 req/h/IP (sliding window in-memory).
6. Pool 3 contextes Zendriver warm avec rotation user_data_dir tous les 50 fetches.
7. Heuristique "page chargée" (`document.documentElement.outerHTML.length > 50000`).
8. Soft-challenge detection (patterns `captcha-delivery.com`, `datadome`, `Just a moment`).
9. `Dockerfile` multi-arch (amd64/arm64).
10. `docker-compose.yml` pour dev local.
11. `systemd/keymatch-worker.service` (auto-restart, `MemoryMax=4G`).
12. `README.md` setup détaillé.
13. `test_worker.py` pytest : auth, SSRF, allowlist, RL, fetch creepjs.

#### Tâches côté KeyMatch (`nestmatch/`)
1. Migration `083_p3_7_import_jobs.sql` : table `import_jobs(id, user_email, url, status enum, data jsonb, error_code, error_message, created_at, updated_at)` + RLS user_email + index.
2. Migration `084_p3_7_import_logs_fetcher.sql` : `ALTER TABLE import_logs ADD COLUMN fetcher_used text`.
3. `lib/import/fetcher-remote.ts` : appelle `POST $WORKER_URL/fetch` avec Bearer, mappe erreurs.
4. `lib/import/fetcher-router.ts` : routing hostname → worker ou wreq-js direct.
5. `lib/import/jobs.ts` : helpers `createJob`, `updateJob`, `getJob` sur `import_jobs`.
6. Modifier `lib/import/index.ts` : appelle `fetchUrlRouted` au lieu de `fetchUrl` direct.
7. Modifier `app/api/proprio/annonce/import/route.ts` : si host DataDome → crée job + fire worker → return 202 `{job_id}`. Sinon flow synchrone actuel.
8. Nouvelle route `app/api/proprio/annonce/import/status/route.ts` : `GET ?id=` → status job.
9. Nouvelle route `app/api/proprio/annonce/import/callback/route.ts` : `POST` du worker → parse HTML → UPDATE job done/failed.
10. Nouvelle route `app/api/admin/fetcher-health/route.ts` : ping worker, retourne latency + pool stats.
11. `lib/hooks/useImportJobPolling.ts` : hook React, poll status toutes 2s, timeout 30s.
12. Modifier `app/proprietaire/ajouter/page.tsx` : si réponse 202+job_id, lance polling + toast "Import en cours...".
13. Modifier `app/(public)/aide/import-annonce/page.tsx` : passer LBC/SeLoger/Logic-immo de "blocked" à "good" si tests verts.
14. Modifier `app/(authenticated)/admin/imports/page.tsx` : ajouter colonne `fetcher_used`, card santé worker.
15. Tests vitest : `__tests__/lib/import/fetcher-router.test.ts`, `__tests__/lib/import/fetcher-remote.test.ts`, `__tests__/lib/import/jobs.test.ts`.
16. Script `scripts/test-import-remote.ts` : test E2E worker live.
17. `.env.local` (dev) + Vercel env vars : `EXTERNAL_FETCHER_URL`, `EXTERNAL_FETCHER_TOKEN`, `WORKER_CALLBACK_TOKEN`, `EXTERNAL_FETCHER_ENABLED_HOSTS`.

#### Tâches infra
1. Sur VPS : `git clone keymatch-fetcher` (ou `git pull` du repo principal et `cd tools/zendriver-worker`).
2. Build container, `docker compose up -d`.
3. Caddyfile : reverse-proxy `keymatch-fetcher.xxx.workers.dev` (ou IP direct) → `localhost:8080`.
4. Génère tokens, sync entre `/etc/keymatch.env` VPS et Vercel env.
5. Test worker live : `curl -H "Authorization: Bearer $T" https://<host>/health`.

#### Audit VERIFY (Phase 1)
- [ ] `pytest tools/zendriver-worker/test_worker.py` : tous tests verts
- [ ] `curl /health` Bearer → 200 + pool stats
- [ ] `curl /fetch` URL Leboncoin réelle → 200 + HTML > 50KB
- [ ] 10 fetches consécutifs : cold ~6-9s, warm 3-5s
- [ ] `npx tsc --noEmit` clean
- [ ] `npx vitest run __tests__/lib/import/` : tous verts
- [ ] `npx next build` : succès
- [ ] **Verifier subagent sur le diff** : aucun bug critique
- [ ] Migrations 083+084 appliquées en prod via Management API
- [ ] Schema vérifié : `SELECT column_name FROM information_schema.columns WHERE table_name='import_jobs'` → 10 colonnes attendues
- [ ] Schema vérifié : `import_logs.fetcher_used` existe
- [ ] Test UI manuel preview Vercel : URL Leboncoin réelle → "Import en cours…" → champs pré-remplis 5-15s plus tard
- [ ] Worker arrêté manuellement → UI affiche "Service indisponible, réessaye dans 5 min" (PAS "site bloque")
- [ ] `/admin/imports` montre colonne `fetcher_used = zendriver-worker` pour les imports DataDome
- [ ] Test régression : URL PAP marche toujours en synchrone (pas de breaking change)
- [ ] Script `release-from-commit.sh` lancé après push

#### Rollback Phase 1
- Côté Vercel : flip env var `EXTERNAL_FETCHER_ENABLED_HOSTS=""` (vide) → fetcher-router court-circuite le worker, retour comportement V97.38 sans LBC/SeLoger.
- Côté DB : migrations 083+084 sont additives, pas besoin de rollback (laisser les tables/colonnes en place).
- Côté code : `git revert <commit>` si bug critique.

#### Non vérifié par défaut (à compléter)
- Délivrabilité Leboncoin sur 7 jours (succès rate prod réelle, peut chuter si DataDome update)
- Comportement sous charge concurrent >3 fetches simultanés
- Stabilité Zendriver après 24h+ uptime

---

<a id="phase-2"></a>
### Phase 2 — Postgres self-host + dump Supabase

**Durée estimée** : 8-10h (dont 2-3h pour les tests régression UI)
**Dépend de** : Phase 0
**Indépendant de** : Phase 1 (peut être fait en parallèle si Paul a la bande passante)
**Objectif** : Toute la DB tourne en local sur VPS. KeyMatch lit/écrit dans Postgres VPS. Supabase Storage et Auth restent en place (pas encore migrés).

#### Pré-tâches d'exploration
1. Lister TOUTES les tables Supabase actuelles : `SELECT tablename FROM pg_tables WHERE schemaname='public'`. Estimé : profils, annonces, candidatures, messages, visites, baux, edl, edl_pieces, loyers, quittances, restitutions, historique, carnet_entretien, import_logs, import_jobs, release_validations, service_pings, incidents, bug_reports, notifications, ... (~25 tables).
2. Lister TOUTES les RLS policies : `SELECT * FROM pg_policies`.
3. Lister TOUTES les fonctions SQL : `SELECT * FROM pg_proc WHERE pronamespace = 'public'::regnamespace`.
4. Lister TOUTES les triggers + indexes.
5. Lister TOUTES les publications Realtime : `SELECT * FROM pg_publication`.
6. Vérifier extensions installées : `pgvector`, `pg_trgm`, `pgcrypto`, etc.

#### Tâches infra
1. `docker-compose.yml` ajoute service `postgres:16` avec volume persistant `/srv/keymatch/postgres-data/`.
2. Variables : `POSTGRES_USER=keymatch`, `POSTGRES_PASSWORD=<générer>`, `POSTGRES_DB=keymatch`.
3. Installer extensions : créer `init-extensions.sql` chargé au démarrage avec `CREATE EXTENSION IF NOT EXISTS pgvector; pg_trgm; pgcrypto;`.
4. Verify extensions installées : `SELECT * FROM pg_extension`.

#### Tâches dump & restore
1. **`pg_dump`** depuis Supabase (utilise leur connection string fournie dans dashboard) → fichier `keymatch-supabase-YYYY-MM-DD.sql` (probablement 50-500 MB).
2. **Inspecter le dump** : pas de hardcoded URLs Supabase Storage à corriger, pas de seq mal numérotées, etc.
3. **Restore** sur Postgres VPS : `psql -U keymatch -d keymatch < keymatch-supabase-YYYY-MM-DD.sql`.
4. Vérifier nombre de rows par table : SELECT count(*) par table → comparer avec Supabase.
5. Vérifier RLS reload : `SELECT * FROM pg_policies` côté VPS = côté Supabase.
6. Vérifier sequences : `SELECT setval('xxx_seq', (SELECT max(id) FROM xxx))` si nécessaire.

#### Tâches côté KeyMatch
1. Variable env `DATABASE_URL` ajoutée (séparée de `SUPABASE_URL`). Format : `postgresql://keymatch:xxx@vps-host:5432/keymatch?sslmode=require`.
2. `lib/supabase.ts` reste tel quel (continue à parler à Supabase pour Auth et Storage).
3. **NOUVEAU** : `lib/db.ts` exporte `pgClient` (pg.Pool ou postgres-js) connecté à `DATABASE_URL`.
4. **GROS CHANTIER** : migrer ~80% des appels Supabase `.from('table').select()` → `pgClient.query(SQL)` équivalent. Stratégie progressive :
   - Phase 2a : routes admin (peu de RLS, plus simple)
   - Phase 2b : routes annonces read
   - Phase 2c : routes annonces write
   - Phase 2d : routes messages
   - Phase 2e : routes candidatures + dossier
   - Phase 2f : routes bail/EDL
   - Phase 2g : routes loyers/quittances
5. **Garder Supabase Auth + Storage** pour l'instant (RLS Postgres reste OK, mais les `.auth.getUser()` continuent côté Supabase).
6. Couche d'abstraction `lib/data/` : 1 fichier par domaine (`lib/data/annonces.ts`, `lib/data/messages.ts`, etc.) qui wrap les queries → facile à tester + migration progressive.
7. Pool connexion : `pg.Pool({ max: 20, idleTimeoutMillis: 30000 })`.
8. **Connection pooler** : installer **PgBouncer** sur le VPS (1 docker container léger). Évite l'explosion de connexions côté Next.js.

#### Tâches RLS
1. Adapter RLS Supabase (qui utilise `auth.uid()`) → Postgres équivalent. Approches :
   - **Option A** : Garder RLS Postgres mais utiliser `current_setting('app.user_email')::text` au lieu de `auth.uid()`. Set via `SET app.user_email = 'x@y.fr'` au début de chaque connexion (côté Next.js middleware).
   - **Option B** : Ne pas utiliser RLS Postgres, faire la sécurité côté Next.js (WHERE user_email = session). Plus simple, mais perd la défense en profondeur.
   - **Recommandation** : Option A pour les tables sensibles (profils, dossier_docs, baux, edl), Option B pour les tables triviales (annonces publiques, messages déjà sécurisés par flow business).
2. Tester chaque RLS critique : connecter en `keymatch_anon` user → vérifier qu'on ne peut PAS lire les profils d'autres.

#### Tâches publications Realtime
**À noter** : Realtime Supabase ne fonctionnera plus avec Postgres self-host. La Phase 4 résoudra ça avec socket.io. **Avant Phase 4**, les tables qui dépendaient de Realtime continuent de marcher via Supabase Realtime (les writes vont à Supabase aussi pendant la transition).
- Stratégie de transition : pendant les phases 2a-2g, on **écrit dans les DEUX bases** (Postgres VPS + Supabase). On lit dans Postgres VPS uniquement. Realtime continue de fire les events depuis Supabase. Quand Phase 4 est OK, on coupe les writes vers Supabase.
- **Alternative** : ne pas dual-write, juste documenter que Realtime est cassé pour la fenêtre Phase 2 → Phase 4 (1-2 semaines) sur les 8 tables Realtime. Demander à Paul.

#### Audit VERIFY (Phase 2)
- [ ] `pg_dump` Supabase complet (vérifier taille >50MB attendue)
- [ ] Restore VPS Postgres : `psql` exit code 0, pas d'erreurs
- [ ] Comparaison rows par table Supabase vs VPS : delta < 0.1% (acceptable si quelques inserts pendant le dump)
- [ ] `SELECT * FROM pg_policies` : identique côté VPS
- [ ] Extensions : `pgvector`, `pg_trgm`, `pgcrypto` présentes
- [ ] Sequences : `SELECT last_value FROM xxx_seq` >= max(id) de chaque table
- [ ] Connection test : `psql -h vps -U keymatch -c "SELECT now()"` OK
- [ ] PgBouncer : `psql -h vps -p 6432` (port pooler) OK
- [ ] **Test régression UI complet** : flow signup → publish annonce → candidature → message → visite → bail → EDL → loyer (chaque étape sur preview Vercel pointant DATABASE_URL=VPS Postgres)
- [ ] RLS test : user A ne peut pas lire profil user B (curl avec session A → 403)
- [ ] `npx tsc --noEmit` clean
- [ ] `npx vitest run` : tous tests verts
- [ ] `npx next build` : succès
- [ ] **Verifier subagent global** sur tous les fichiers touchés
- [ ] Réplication backup test : faire un `pg_dump` du VPS, restore sur conteneur de test, vérifier les rows.

#### Rollback Phase 2
- Très critique : si bug détecté en prod, **flip immédiat `DATABASE_URL` vers Supabase** → Next.js relit Supabase, application repart.
- Le dual-write pendant Phase 2 garantit que Supabase est à jour si rollback nécessaire.
- Garder le dump Supabase original pendant 30 jours minimum (sécurité).
- En cas de catastrophe : `psql Supabase < keymatch-supabase-YYYY-MM-DD.sql` (mais ça écrase les writes intermédiaires → vérifier l'horodatage).

---

<a id="phase-3"></a>
### Phase 3 — MinIO storage + migration photos/docs

**Durée estimée** : 4-6h
**Dépend de** : Phase 2 (DB Postgres OK pour stocker les URLs MinIO)
**Objectif** : Tous les fichiers (photos annonces, docs dossier, baux signés, EDL) sont servis par MinIO sur le VPS, plus de Supabase Storage.

#### Tâches infra
1. `docker-compose.yml` ajoute service `minio/minio` avec volume `/srv/keymatch/minio-data/`.
2. Buckets à créer : `avatars`, `annonces`, `dossier_docs`, `baux`, `edl`, `quittances`, `messages` (pièces jointes).
3. Policies bucket : `avatars` et `annonces` en read-public, le reste en private (signed URLs).
4. Caddy : reverse-proxy `media.keymatch-immo.fr` → `localhost:9000` (ou utiliser path-based routing).

#### Tâches migration data
1. Script `scripts/migrate-storage-supabase-to-minio.ts` : itère sur tous les buckets Supabase, télécharge chaque fichier, ré-upload sur MinIO avec la même clé.
2. Cas spéciaux : signed URLs côté Supabase ont une expiration → ne pas les utiliser, générer toujours à la volée côté MinIO.
3. Updater les URLs en base : `annonces.photos` (JSONB array d'URLs) → remplacer `https://xxx.supabase.co/storage/...` par `https://media.keymatch-immo.fr/...`.
4. Mêmes update pour `profils.dossier_docs`, `profils.avatar_url`, `baux.pdf_url`, `edl.photos`, etc.

#### Tâches code
1. `lib/storage.ts` : abstraction qui parle à MinIO via SDK `@aws-sdk/client-s3` (MinIO est S3-compatible).
2. Remplacer tous les `supabase.storage.from(...)` par `storage.upload(...)`, `storage.signedUrl(...)`, etc. dans le code Next.js.
3. Upload via presigned PUT URLs (client-side direct upload, pas via Next.js → économise bandwidth Vercel/Next).
4. Cleanup automatique : cron suppression fichiers orphelins (annonces archivées >6 mois, EDL terminés >2 ans réglementaire).

#### Audit VERIFY (Phase 3)
- [ ] MinIO accessible : `mc admin info` OK
- [ ] Tous les buckets créés avec policies attendues
- [ ] Script migration : count fichiers Supabase = count fichiers MinIO (allow 0% delta)
- [ ] Sample : 10 URLs au hasard testées via curl → 200 + Content-Length identique à Supabase
- [ ] Update URLs en base : `SELECT count(*) FROM annonces WHERE photos::text LIKE '%supabase.co%'` = 0
- [ ] Upload UI : photo annonce uploadée via wizard → visible dans MinIO bucket
- [ ] Signed URLs dossier : user A signed URL ne donne pas accès aux docs user B
- [ ] Test régression : fiche annonce affiche les photos, dossier locataire montre CNI, bail signé téléchargeable
- [ ] `npx tsc --noEmit` clean, vitest verts, build OK, verifier subagent OK
- [ ] Service Worker / cache navigateur : tester un user existant pour s'assurer que l'ancien cache photos ne casse pas (les vieilles URLs Supabase doivent être remplacées via update DB).

#### Rollback Phase 3
- Flip env `STORAGE_PROVIDER=supabase` → `lib/storage.ts` re-parle à Supabase.
- Garde les fichiers MinIO en place + les fichiers Supabase intacts pendant 30 jours.
- Updates URLs en base : sont reversibles (regex inverse).

---

<a id="phase-4"></a>
### Phase 4 — Realtime socket.io

**Durée estimée** : 10-14h (la plus complexe)
**Dépend de** : Phase 2
**Objectif** : Remplacer Supabase Realtime (utilisé sur 8 tables) par Postgres `LISTEN/NOTIFY` + socket.io. Aucune perte d'UX live.

#### Inventaire tables Realtime à migrer
1. `messages` (chat live)
2. `visites` (changement statut visite)
3. `candidatures` (vue par proprio en live)
4. `edl_pieces` (édition EDL contradictoire simultanée)
5. `notifications` (badge cloche)
6. `incidents` (admin)
7. `release_validations` (admin)
8. + 1 autre à confirmer

#### Tâches infra
1. `docker-compose.yml` : ajoute service `socket-io` (Node + socket.io 4.x). Container léger (~50MB RAM).
2. Caddy : reverse-proxy `ws.keymatch-immo.fr` → `socket-io:3001` avec WebSocket support.
3. Postgres `NOTIFY` triggers : créer une fonction `pg_notify('channel', payload_jsonb)` + AFTER INSERT/UPDATE triggers sur les 8 tables.

#### Tâches code
1. **Backend** : service Node socket.io qui écoute `pg.LISTEN('channel')` côté Postgres et broadcast aux clients socket.io connectés. Auth via JWT NextAuth (session token). Filter par user_email pour ne broadcaster que les events pertinents.
2. **Frontend** : remplacer `supabase.channel('...').on('postgres_changes', ...)` par `socket.on('event', ...)`.
3. Hook réutilisable `useRealtime(channel, callback)` qui abstrait socket.io.
4. Reconnect logic + offline indicator.

#### Audit VERIFY (Phase 4)
- [ ] Test 2 onglets : message envoyé d'un côté → apparaît instantanément de l'autre
- [ ] Test 2 users : EDL édité par proprio → locataire voit le changement en <2s
- [ ] Notif badge cloche s'incrémente quand un message arrive
- [ ] Test déconnexion réseau 30s → reconnect auto, pas de doublons
- [ ] Test 50 sockets simultanées : pas de leak mémoire
- [ ] Test sécurité : socket user A ne reçoit pas events user B
- [ ] `npx tsc --noEmit` clean, vitest verts, build OK
- [ ] **Verifier subagent** sur les 8 hooks Realtime modifiés
- [ ] Test régression chat /messages, EDL contradictoire, candidatures vue proprio

#### Rollback Phase 4
- Env `REALTIME_PROVIDER=supabase` → frontend re-utilise Supabase channels.
- Garde Supabase Realtime en double pendant 14 jours minimum (dual-broadcast) pour pouvoir flip back.

---

<a id="phase-5"></a>
### Phase 5 — Email Brevo (couper Resend)

**Durée estimée** : 2-3h
**Dépend de** : aucune (peut se faire en parallèle de toute phase ≥ Phase 0)
**Objectif** : Tous les emails (OTP, notifications, quittances, bail signé) passent par Brevo. Couper Resend.

#### Pourquoi Brevo plutôt que Postfix self-host
- Délivrabilité 95%+ jour 1 (pas de warm-up 4-8 semaines IP)
- 300 emails/jour gratuit (KeyMatch envoie <100/jour aujourd'hui)
- Français, RGPD-natif (data en EU)
- Templates + analytics + webhooks bounces équivalents Resend

#### Tâches
1. Créer compte Brevo gratuit (sib.fr ou brevo.com).
2. Vérifier le domaine `keymatch-immo.fr` côté Brevo (DKIM + SPF + DMARC records à ajouter dans OVH DNS zone).
3. Templates Brevo : recopier les 8-12 templates Resend utilisés (OTP, candidature reçue, visite confirmée, bail signé, etc.).
4. `lib/email.ts` : remplacer `Resend SDK` par `@getbrevo/brevo` SDK.
5. Env var `BREVO_API_KEY`.
6. Webhooks bounces/spam : route `app/api/webhooks/brevo/route.ts` qui logge les bounces + désactive les emails morts.
7. Test envoi : OTP signup, candidature, quittance.

#### Audit VERIFY (Phase 5)
- [ ] DKIM + SPF + DMARC records dans OVH zone, propagation OK (`dig TXT keymatch-immo.fr +short`)
- [ ] Brevo dashboard : domaine "Authenticated"
- [ ] Test envoi vers Gmail/Outlook/Yahoo : reçu en boîte principale (pas spam)
- [ ] DMARC report (1ère semaine) : 100% align passed
- [ ] Webhook bounces : un email vers `inexistant@test.invalid` génère un row dans `email_logs`
- [ ] Suite régression : OTP signup marche, quittance PDF arrive avec pièce jointe, bail signé envoyé
- [ ] Resend dashboard : volume tombe à 0 sur 24h
- [ ] `npx tsc --noEmit` clean, vitest, build, verifier

#### Rollback Phase 5
- Flip env `EMAIL_PROVIDER=resend` → `lib/email.ts` revient à Resend.
- Garder Resend SDK installé dans deps jusqu'à validation 14 jours Brevo.

---

<a id="phase-6"></a>
### Phase 6 — Next.js sur VPS (couper Vercel)

**Durée estimée** : 6-8h
**Dépend de** : Phase 2 (DB), Phase 3 (storage), Phase 5 (email). Optionnellement Phase 4 (realtime) si on accepte une fenêtre de coupure.
**Objectif** : Next.js tourne dans Docker sur VPS, accessible via Caddy → keymatch-immo.fr. Vercel debranché.

#### Tâches infra
1. `Dockerfile` Next.js production : multi-stage build (build → standalone runtime).
2. `docker-compose.yml` ajoute service `keymatch-next` avec env vars depuis `/etc/keymatch.env`.
3. Caddyfile : `keymatch-immo.fr` → `localhost:3000` avec TLS auto Let's Encrypt + HTTP/2 + HTTP/3 + Brotli compression.
4. Image sharp pour Next.js Image Optimization (Vercel le faisait gratos, on doit installer manuellement).
5. CDN : mettre Cloudflare gratuit devant pour cache statique + DDoS protection.

#### Tâches code
1. `next.config.js` : supporter `output: 'standalone'` pour build Docker.
2. Variables env adaptées (`NEXTAUTH_URL` reste `https://keymatch-immo.fr`).
3. Health endpoint `/api/health` retourne `{ ok: true, version, uptime }`.
4. Cron Linux remplace Vercel cron (Phase 9).
5. ISR : compatible avec standalone mais nécessite volume persistant pour le cache (`/srv/keymatch/next-cache/`).

#### Tâches DNS cutover
1. **Avant cutover** : baisser TTL du A record keymatch-immo.fr à 60s (pour rollback rapide).
2. Tester preview Vercel ET VPS en parallèle sur sous-domaine `staging.keymatch-immo.fr` → VPS.
3. **Cutover** : flip A record `keymatch-immo.fr` de Vercel IP → VPS IP. Propagation 1-15 min.
4. Surveiller Sentry + logs Next.js (`docker logs keymatch-next -f`).
5. Si tout OK 24h : remettre TTL à 3600s.

#### Audit VERIFY (Phase 6)
- [ ] `curl https://keymatch-immo.fr/api/health` → 200 + headers Caddy
- [ ] TLS : `curl -vI https://keymatch-immo.fr 2>&1 | grep TLS` → TLSv1.3
- [ ] Headers sécu : CSP, HSTS, X-Frame-Options présents
- [ ] HTTP → HTTPS redirect OK
- [ ] Images optimisées : `<img src="/_next/image?url=...">` retourne du WebP
- [ ] Routes API testées : `/api/annonces`, `/api/messages`, `/api/auth/session`
- [ ] Login Google OAuth marche
- [ ] Login Email OTP marche (envoi via Brevo)
- [ ] Suite régression complète /admin sur prod VPS
- [ ] Lighthouse score : Performance > 80, Accessibility > 90 (le minimum Vercel actuel)
- [ ] Core Web Vitals : LCP, INP, CLS dans le vert
- [ ] `npx tsc --noEmit` clean, vitest, build, verifier subagent global
- [ ] Sentry continue de recevoir des events
- [ ] Surveille Sentry 7 jours : ratio errors stable (pas de spike)

#### Rollback Phase 6
- Flip A record DNS → IP Vercel (TTL 60s rend ça quasi-instantané)
- Garde Vercel deploys actifs pendant 30 jours minimum
- Si rollback : investiguer logs Caddy + Next.js docker, fixer, re-cutover

---

<a id="phase-7"></a>
### Phase 7 — Monitoring Sentry self-host (optionnel)

**Durée estimée** : 3-4h (skippable)
**Dépend de** : Phase 0
**Objectif** : GlitchTip self-host remplace Sentry SaaS. **OPTIONNEL** car Sentry free tier (5k errors/mois) suffit longtemps.

#### Décision
- Si Sentry free tier OK → SKIPPER cette phase, économiser 3h.
- Si Sentry commence à facturer → faire cette phase à ce moment-là.

#### Si on la fait
1. `docker-compose.yml` ajoute `glitchtip:latest` + dépendances (postgres, redis).
2. Migration des dashboards Sentry existants → GlitchTip (compatible Sentry API).
3. Update `sentry.server.config.ts`, `sentry.client.config.ts`, `sentry.edge.config.ts` → DSN GlitchTip.
4. Test : provoquer une erreur, voir qu'elle arrive dans GlitchTip.

#### Audit VERIFY (Phase 7)
- [ ] GlitchTip UI accessible (HTTP basic auth ou Caddy auth)
- [ ] Erreur test reçue en GlitchTip dans <10s
- [ ] Sources maps fonctionnent (stack trace symbolisée)
- [ ] Notifications email/webhook configurées

#### Rollback Phase 7
- Flip DSN env back to Sentry → events repartent vers Sentry SaaS.

---

<a id="phase-8"></a>
### Phase 8 — Backups B2 + plan de reprise

**Durée estimée** : 3-4h
**Dépend de** : Phase 2 (DB), Phase 3 (storage)
**Objectif** : Backups automatiques quotidiens hors-site, plan de restoration testé.

#### Tâches
1. Compte Backblaze B2 gratuit (10 GB free).
2. Installer `rclone` sur VPS, configurer remote B2.
3. Script `/srv/keymatch/scripts/backup.sh` :
   - `pg_dump` Postgres → `keymatch-postgres-YYYY-MM-DD.sql.gz`
   - `tar` MinIO buckets sensibles (dossier_docs, baux, edl) → `keymatch-minio-YYYY-MM-DD.tar.gz`
   - `rclone copy` vers B2
   - Rotation : garde 30 daily + 12 weekly + 12 monthly
4. Cron Linux : daily 3am `/srv/keymatch/scripts/backup.sh`
5. Notification mail si backup échoue (via Brevo)
6. **Test restoration mensuel** : script `restore-test.sh` qui download le dernier backup B2 → restore dans conteneur Postgres temporaire → vérifie row counts.

#### Audit VERIFY (Phase 8)
- [ ] Premier backup : exit 0, fichier présent dans B2
- [ ] `rclone ls B2:keymatch-backups/` montre les fichiers attendus
- [ ] Test restoration : `restore-test.sh` complet OK, row counts cohérents
- [ ] Failure simulation : ajouter `exit 1` dans le script → email reçu
- [ ] Cron : `crontab -l` montre l'entry, `systemctl status cron` actif
- [ ] Documentation : `docs/DISASTER_RECOVERY.md` décrit la procédure de restoration manuelle (étape par étape)

#### Rollback Phase 8
- N/A : les backups n'impactent pas la prod. Si erreur, juste fixer le script.

---

<a id="phase-9"></a>
### Phase 9 — Cron Linux (couper Vercel cron)

**Durée estimée** : 2-3h
**Dépend de** : Phase 6 (Next.js sur VPS)
**Objectif** : Tous les crons Vercel migrés en crontab Linux native. Couper l'option Vercel cron.

#### Inventaire crons à migrer
Lire `vercel.json` actuel → liste de 19 crons :
- `/api/cron/health-check` (hourly)
- `/api/cron/irl-update` (monthly)
- `/api/cron/quittances` (monthly)
- `/api/cron/visites-reminders` (daily)
- `/api/cron/cleanup-sessions` (weekly)
- `/api/cron/backup-status` (daily)
- ...et 13 autres

#### Tâches
1. Créer `/etc/cron.d/keymatch` avec entries qui curl le endpoint local Next.js avec un header secret `X-Cron-Secret`.
2. Endpoint `/api/cron/[name]` vérifie le secret avant d'exécuter.
3. Logs cron : `journalctl -u cron` ou redirect stdout vers `/var/log/keymatch-cron.log`.
4. Alerts : si un cron retourne non-200, mail via Brevo.

#### Audit VERIFY (Phase 9)
- [ ] `crontab -u root -l` montre les 19 entries
- [ ] `journalctl -u cron --since "-1h"` montre les exécutions horaires (health-check)
- [ ] Test manuel d'un cron : `bash /etc/cron.d/keymatch_health_check.sh` → exit 0, log dans /var/log
- [ ] `vercel.json` cron entries supprimées (le déploiement n'aura plus de cron Vercel actif)
- [ ] 7 jours de surveillance : aucun cron manqué

#### Rollback Phase 9
- Garder `vercel.json` cron entries en double pendant 7 jours (Vercel cron actif aussi). Si rollback, juste désactiver les cron Linux.

---

<a id="phase-10"></a>
### Phase 10 — Cutover DNS final + couper Supabase Auth

**Durée estimée** : 4-6h
**Dépend de** : toutes les phases précédentes OK
**Objectif** : Couper le dernier service externe critique (Supabase Auth utilisé par NextAuth comme DB sous-jacente si applicable), et faire le grand ménage.

#### Tâches
1. Vérifier que NextAuth utilise bien `DATABASE_URL` (VPS Postgres) et plus Supabase pour la table `accounts/sessions/users`.
2. Si Supabase Auth utilisé par signup/OTP : remplacer par NextAuth pure + table Postgres `users` propre.
3. Couper le projet Supabase (downgrade à "Paused" pour ne pas payer, mais garder 30 jours en cas de rollback).
4. Couper Vercel Pro (downgrade à Hobby gratuit, garde projet en cas de rollback).
5. Couper Resend (déjà fait Phase 5, juste vérifier).
6. Désactiver Sentry (si Phase 7 faite).
7. Audit final : `lsof` sur le VPS pour s'assurer qu'aucun service ne parle plus à Supabase/Vercel/Resend.

#### Audit VERIFY (Phase 10)
- [ ] Login Google OAuth marche (NextAuth pure)
- [ ] Login OTP marche (Brevo)
- [ ] Profil utilisateur affiché correctement
- [ ] Suite régression complète UI
- [ ] `curl -L https://keymatch-immo.fr` → 200, headers Caddy
- [ ] DNS : `dig keymatch-immo.fr +short` → IP VPS
- [ ] Sentry / Brevo / Vercel logs : 0 events depuis le cutover
- [ ] Aucune ligne `console.error` ou Sentry breadcrumb mentionnant Supabase / Resend
- [ ] Backups Phase 8 actifs et testés depuis cutover

#### Rollback Phase 10
- Phase 10 inclut le **point de non-retour** côté SaaS. Avant cutover :
  - Faire backup complet (Phase 8 OK)
  - Documenter dans `docs/DISASTER_RECOVERY.md` comment réactiver Supabase + redéployer sur Vercel
- Si rollback nécessaire dans les 30 jours : Supabase pausé, on le réactive + flip DNS A record retour Vercel.

---

<a id="4-verify"></a>
## 4. Protocole VERIFY par phase (rappel)

Chaque phase suit le protocole VERIFY de `CLAUDE.md`. Pour chaque commit non trivial :

1. **Lister les claims du commit** (3-5 bullets de ce que la modif prétend faire)
2. **Pour chaque claim** → `grep` le code + `Read` les lignes → confirmer/infirmer
3. **Vérifs préventives selon le type de modif** :
   - Query SQL nouvelle → check column names via Management API
   - Route dynamique nouvelle → check slug uniqueness
   - Migration nouvelle → apply + verify `information_schema`
4. **`npx tsc --noEmit`**
5. **`npx next build`** si routes/pages modifiées
6. **Verifier subagent** sur le diff
7. **Vitest ciblé** si un test existant touche la zone
8. **Rapport 3 sections** à Paul : ✓ Vérifié OK / ✗ Non vérifié / ⚠ Bugs trouvés
9. **Fix avant commit** si bugs critiques
10. **Note bugs préexistants** dans commit message si hors scope

Et après chaque push qui livre une feature :
- Script `release-from-commit.sh` qui insère row `release_validations` + notif Paul.

---

<a id="5-rollback"></a>
## 5. Plan de rollback global

### Critères de rollback immédiat
- Tout incident severity ≥ major affectant >10% des users
- Régression > 5% du taux de conversion ou perte de feature critique (bail/EDL/messages)
- Taux d'erreur 5xx > 2% sur 1h

### Procédure de rollback global (worst case)
1. **Stop la propagation** : si DNS pas encore cutover (Phase 6), juste pousser le revert sur main et redéployer Vercel.
2. **Si DNS cutover (Phase 6 done)** :
   - Flip A record back to Vercel IP (TTL 60s = ~5 min propagation)
   - Vercel project doit toujours être actif (Phase 10 conserve 30 jours)
3. **Si DB cutover (Phase 2 done)** :
   - Flip `DATABASE_URL` back to Supabase connection string
   - Si dual-write actif (recommandé pendant Phase 2-3), Supabase est à jour
   - Si dual-write coupé, restaurer Supabase depuis dernier backup B2 (Phase 8) + perte data depuis backup
4. **Si Storage cutover (Phase 3 done)** :
   - Flip `STORAGE_PROVIDER=supabase`
   - Fichiers Supabase conservés intacts pendant 30 jours
5. **Si Realtime cutover (Phase 4 done)** :
   - Flip `REALTIME_PROVIDER=supabase` (dual-broadcast en place pendant 14 jours)
6. **Si Email cutover (Phase 5 done)** :
   - Flip `EMAIL_PROVIDER=resend` (Resend SDK toujours installé)

### Période de "double config" recommandée
- Vercel project actif : **30 jours** après cutover Phase 6
- Supabase project actif : **30 jours** après cutover Phase 10
- Resend account actif : **30 jours** après cutover Phase 5

---

<a id="6-couts"></a>
## 6. Coûts cumulés par phase

| Phase | Coût ajouté | Cumul mensuel | Notes |
|---|---|---|---|
| Phase 0 | +10,19€ (VPS) | 10,19€ | Vercel Pro 18€ encore actif |
| Phase 1 | 0 | 10,19€ | |
| Phase 2 | 0 | 10,19€ | |
| Phase 3 | 0 | 10,19€ | |
| Phase 4 | 0 | 10,19€ | |
| Phase 5 | 0 (Brevo gratuit) | 10,19€ | Resend coupé → -0€ (déjà gratuit) |
| Phase 6 | 0 | 10,19€ | Vercel Pro coupé → -18€ (économie nette) |
| **Phase 6 net** | | **-7,81€** | **Migration rentable immédiatement à partir de Phase 6** |
| Phase 7 | 0 (skippable) | -7,81€ | Sentry free tier suffit |
| Phase 8 | +0,03€ (B2) | -7,78€ | Backups offsite |
| Phase 9 | 0 | -7,78€ | |
| Phase 10 | 0 (Supabase coupé) | -7,78€ | Supabase free déjà gratuit |
| **Total final** | | **~11€/mois TTC** vs ~18€ aujourd'hui = **-7€/mois** |

**Période transition (Phase 0-5) : on paie 10,19€ EN PLUS du Vercel Pro pendant 1-3 mois.**
**À partir de Phase 6 (coupure Vercel) : économies nettes ~7€/mois.**
**Break-even temps investi vs économie : il faut ~2 ans à 7€/mois pour rembourser 35-50h de chantier. Mais le vrai gain c'est indépendance + contrôle + pas de surprise tarif.**

---

<a id="7-doit-pas-casser"></a>
## 7. Inventaire DOIT-PAS-CASSER (cross-phase checklist)

Avant CHAQUE merge de phase, vérifier que TOUTES ces features marchent :

### Flow critique 1 — Signup → Publish annonce → Premier candidat
- [ ] Signup Google OAuth → arriver sur `/profil`
- [ ] Signup OTP email → arriver sur `/profil`
- [ ] Activer mode proprio → bouton "Publier une annonce"
- [ ] Wizard 7 étapes → annonce publiée
- [ ] Annonce visible sur `/annonces` (recherche locataire)
- [ ] Candidat envoie dossier → arrive dans `/proprietaire/candidatures`
- [ ] Notification email reçue côté proprio

### Flow critique 2 — Messages temps réel
- [ ] Ouvre 2 onglets (proprio + candidat)
- [ ] Candidat envoie message → apparaît en <2s côté proprio
- [ ] Badge cloche notif s'incrémente
- [ ] Marquer comme lu → badge décrémente

### Flow critique 3 — Bail à 2 signataires
- [ ] Proprio génère bail depuis candidature acceptée
- [ ] Bail PDF s'affiche
- [ ] Proprio signe eIDAS → status = "signé proprio"
- [ ] Locataire reçoit notification email
- [ ] Locataire signe eIDAS → status = "signé"
- [ ] PDF final stocké et téléchargeable des 2 côtés
- [ ] Apparait dans `/admin/qa` pour validation Paul

### Flow critique 4 — EDL contradictoire
- [ ] Proprio crée EDL entrée
- [ ] Locataire édite simultanément (2 onglets)
- [ ] Photos uploadées par pièce
- [ ] EDL signé eIDAS par les 2 → PDF généré

### Flow critique 5 — Loyer + quittance auto
- [ ] Cron mensuel s'exécute (cron Vercel ou cron Linux selon phase)
- [ ] Quittance PDF générée
- [ ] Envoyée par email au locataire
- [ ] Apparait dans `/loyers` du locataire

### Flow critique 6 — Import URL annonce (Phase 1 cible)
- [ ] Coller URL PAP → 7 champs pré-remplis en <3s (synchrone, wreq-js)
- [ ] Coller URL Foncia → JSON-LD extrait
- [ ] Coller URL Leboncoin → "Import en cours…" → 5-15s → champs pré-remplis (worker Zendriver)
- [ ] Coller URL bidon → message "Source non reconnue, copie manuelle"

### Flow critique 7 — Admin dashboard
- [ ] `/admin` charge sans erreur
- [ ] `/admin/users` liste les users
- [ ] `/admin/annonces` modération
- [ ] `/admin/imports` montre stats parsers
- [ ] `/admin/releases` montre changelog + checks

### Smoke test minimal après chaque deploy
```bash
# À automatiser dans un script smoke-test.sh
curl -fI https://keymatch-immo.fr/ | grep -i "200 OK"
curl -fI https://keymatch-immo.fr/api/health | grep -i "200 OK"
curl -fI https://keymatch-immo.fr/annonces | grep -i "200 OK"
curl -fI https://keymatch-immo.fr/aide/import-annonce | grep -i "200 OK"
```

---

## Statut actuel (à mettre à jour)

| Phase | Statut | Date | Notes |
|---|---|---|---|
| Phase 0 — VPS bootstrap | ⏳ En attente | — | Paul commande VPS-2 OVH |
| Phase 1 — Worker Zendriver | 🚧 En cours | 2026-05-17 | Code en préparation (V97.39) |
| Phase 2 — Postgres | ⏳ Planifié | — | |
| Phase 3 — MinIO Storage | ⏳ Planifié | — | |
| Phase 4 — Realtime socket.io | ⏳ Planifié | — | |
| Phase 5 — Email Brevo | ⏳ Planifié | — | |
| Phase 6 — Next.js VPS | ⏳ Planifié | — | |
| Phase 7 — Sentry self-host | 🟡 Optionnel | — | Skippable si Sentry free OK |
| Phase 8 — Backups B2 | ⏳ Planifié | — | |
| Phase 9 — Cron Linux | ⏳ Planifié | — | |
| Phase 10 — Cutover final | ⏳ Planifié | — | |

---

## Annexes

### A. Liens utiles
- OVH VPS dashboard : https://www.ovh.com/manager/dedicated/
- Backblaze B2 : https://www.backblaze.com/b2/
- Brevo : https://app.brevo.com/
- Cloudflare : https://dash.cloudflare.com/
- Camoufox releases : https://github.com/daijro/camoufox/releases
- Zendriver : https://github.com/cdpdriver/zendriver

### B. Templates à préparer
- `docs/DISASTER_RECOVERY.md` (Phase 8)
- `docs/RUNBOOK_OPS.md` (procédures d'opération courantes)
- `docs/SECRETS_INVENTORY.md` (où sont stockés quels secrets)
- `tools/zendriver-worker/README.md` (Phase 1)

### C. Sources des décisions (recherche initiale)
- DataDome 2026 bypass : Zendriver ~75%, Camoufox 30-60%, CloakBrowser 100% mais licence restrictive
- 12 agences FR sans protection : Foncia, Orpi, iAD, Century 21, Guy Hoquet, ERA, Laforêt, Nestenn, Stéphane Plaza, LocService, Studapart, ImmoJeune
- Choix Brevo vs Mailgun vs Postfix : Brevo gagnant (FR, 300/jour gratuit, délivrabilité immédiate)
- Choix Zendriver vs Camoufox : Zendriver gagne (CDP plus léger, 75% vs 30-60%)
