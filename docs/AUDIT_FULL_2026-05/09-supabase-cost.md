# Supabase Cost Audit — KeyMatch

**Auditor** : `supabase-cost-auditor` (Claude)
**Date** : 2026-05-06
**Plan actuel** : Free tier
**Stack auth** : NextAuth v4 Google (sessions cookie) — Supabase utilisé en DB + Storage + Realtime uniquement

---

## 1. Plan Free + projections

### Limites Free (2026)

| Dimension              | Limite Free           | Pro ($25/mo)         |
|------------------------|-----------------------|----------------------|
| Database size          | 500 MB                | 8 GB ($0.125/GB+)    |
| File storage           | 1 GB                  | 100 GB               |
| Egress (bandwidth)     | 2 GB / mois           | 250 GB / mois        |
| MAU auth               | 50 000                | 100 000              |
| Edge function invoc.   | 500K / mois           | 2M                   |
| Realtime peers (cc)    | 50 000                | 500 000              |
| Backups daily          | non                   | oui (7j)             |
| Pause auto inactivité  | 7 jours               | non                  |

### Estimation usage actuel KeyMatch (sans télémétrie dashboard, basé code-only)

| Dimension              | Estimation 2026-05    | % Free | Saturation projetée |
|------------------------|-----------------------|--------|---------------------|
| Database size          | ~30-50 MB             | 6-10 % | 24-36 mois          |
| File storage           | ~50-150 MB            | 5-15 % | 12-24 mois          |
| Egress                 | < 500 MB / mois       | 25 %   | sain                |
| MAU                    | 0 (NextAuth seul)     | 0 %    | jamais              |
| Edge functions         | 0 (pas d'usage)       | 0 %    | jamais              |
| Realtime peers cc      | ~5-8 / user actif     | < 1 %  | jamais              |
| Backups custom         | ~5 MB/jour x 7        | inclus | sain                |

**Verdict global** : Free tier OK pour beta privée + 6-12 premiers mois public. Risque #1 = **storage orphelin** (photos d'annonces supprimées) qui croît linéairement, et #2 = **auto-pause 7j** si KeyMatch reste sans activité.

---

## 2. Audit par dimension (7 sections)

### 2.1 Database size growth

**Tables identifiées (62 migrations parcourues)** :

Tables à risque de bloat (linéaire avec activité) :

| Table                      | Croissance attendue                    | Purge cron ?  | Risque |
|----------------------------|----------------------------------------|---------------|--------|
| `messages`                 | ~5-20 lignes / user actif / jour       | NON           | HAUT   |
| `notifications`            | ~3-10 lignes / user / jour             | NON           | HAUT   |
| `dossier_access_log`       | ~1 ligne / lien partagé consulté       | fonction `purge_dossier_access_log_old()` créée mais **jamais appelée** par un cron | MOYEN |
| `messages_emails_log`      | ~1 ligne / email envoyé                | NON           | MOYEN  |
| `clics_annonces`           | 1 ligne / clic sur annonce             | NON           | MOYEN  |
| `historique_baux`          | 1 ligne / fin de bail                  | conservation 3 ans légale (ALUR) | BAS |
| `bail_invitations`         | 1 ligne / invitation, expirent à J+14  | passage à statut `expired` mais aucun DELETE | BAS |
| `signalements`             | rare                                   | NON           | BAS    |
| `irl_history`              | 1 ligne / trimestre                    | aucun         | NÉGLIGEABLE |

Tables de référence (croissance limitée) : `profils`, `annonces`, `users`, `loyers` (≤ 12 / bail / an), `etats_des_lieux`, `bail_signatures`, `edl_signatures`, `bail_avenants`, `carnet_entretien`, `visites`, `favoris`, `recherches_sauvegardees`.

**Pas un seul cron de purge en production.** Vérifié dans `nestmatch/vercel.json` (14 crons) : aucun nommé `purge-*` ou `cleanup-*`.

**Code des migrations à risque** :
- `nestmatch/supabase/migrations/007_profil_dossier_complet.sql:76` → fonction `purge_dossier_access_log_old()` créée, jamais appelée.
- `nestmatch/supabase/migrations/012_notifications.sql` → table sans cleanup.
- `nestmatch/supabase/migrations/056_messages_anti_spam.sql` → `messages_emails_log` sans purge.

### 2.2 Storage cleanup — risque ÉLEVÉ

**Buckets identifiés** (depuis migrations 005, 015, 020, et code uploads) :
- `annonces-photos` (10 MB max, public, JPEG/PNG/WebP/HEIC/HEIF) — photos biens + EDL
- `dossiers` (15 MB max, public, +PDF) — pièces dossier locataire
- `baux` (15 MB max, public, PDF only) — contrats signés
- `quittances` (10 MB max, public, PDF only) — quittances PDF
- `avatars` (référencé dans `app/api/account/avatar/route.ts` mais migration absente du repo — créé manuellement ?)
- `backups` (utilisé par `cron/db-backup`, rétention 7j ✅)

**Anti-pattern critique : photos non scopées par `annonce_id`**
- `nestmatch/app/api/proprietaire/photo/route.ts:88` → path = `${email}/${ts}_${rand}.jpg`
- Conséquence : suppression d'une annonce ne peut pas purger les photos par préfixe (le bucket ne sait pas quelle photo appartenait à quelle annonce).

**Suppression annonce ne nettoie PAS le storage**
- `nestmatch/app/api/annonces/[id]/route.ts:62-86` → DELETE cascade sur 7 tables (visites, messages, carnet, loyers, edl, clics, signalements) mais **aucun appel `storage.remove([...])`**.
- Pareil pour `bail/importer:205` qui supprime l'annonce sans nettoyer baux PDF.

**Effet projeté** : à 50 annonces avec 5-8 photos × 200-400 KB = 80-160 MB. Si 20 % d'annonces supprimées → 16-32 MB définitivement orphelins après 1 an. Acceptable maintenant, dette qui pousse vers Pro ($25/mo) plus tôt.

**Avatars** : rotation OK (`avatars/${email}/avatar.jpg` overwrite) — `app/api/account/avatar/route.ts:172-174` purge l'ancien à la suppression de compte.

**Backups** : rétention 7j active dans `db-backup/route.ts:91-117` ✅.

### 2.3 Bandwidth (egress)

**Sources principales** :
1. **Photos annonces** servies en `getPublicUrl` (URL stable, CDN) — chaque visiteur homepage / `/annonces` → N téléchargements.
2. **Avatars** dans Navbar / messages — petits mais N par page.
3. **PDFs bail / quittance / EDL** — gros mais rares (1 download / création).
4. **API JSON** — pagination probablement OK (annonces filtrées par ville).

**Pattern bandwidth :**
- `getPublicUrl` (13 occurrences) — pas de signature, gratuit côté egress comptage signed URLs **mais** chaque téléchargement compte en bandwidth Supabase.
- **Pas de re-signature à chaque hit** détectée → bon point.
- **Pas de short TTL signed URLs détecté** — KeyMatch utilise public URLs partout (CNI, fiches paie, baux dans bucket `dossiers` **public**). Cf. `005_storage_bucket_policies.sql:93-96` policy `dossiers_select_public` ouvre lecture à tout anon.
  - C'est un **risque privacy potentiel** (déjà flagué dans `RLS_AUDIT.md`) plus que bandwidth, mais ça maintient les téléchargements gratuits côté hébergement aussi (Vercel Edge cache).

**Optimisation immédiate manquante** : pas de compression côté client avant upload photo (sanitize côté serveur dans `imageSanitize.ts` ramène à 2000px / quality 85, OK). Mais l'upload brut peut atteindre 10 MB → coûte en bandwidth INBOUND. Bandwidth Supabase Free = 2 GB **incluant** uploads.

### 2.4 MAU auth — 0 attendu

KeyMatch utilise **NextAuth v4 + Google OAuth**, sessions JWT cookie. Aucun `supabase.auth.signIn*` dans le code (vérifié grep). Donc :
- `auth.users` Supabase reste vide → 0 MAU comptabilisé.
- Le client browser utilise `anon key` (pas de session Supabase).

**Risque** : si Storage policies utilisent `auth.jwt() ->> 'email'` (ex `005:62`, `015:21`, `020:36`), elles ne fonctionnent pas vraiment côté client browser (pas de JWT Supabase) — sauf que c'est OK ici puisque tous les uploads passent par routes API server-side avec `supabaseAdmin` (service_role bypass RLS). Ces policies sont mortes mais pas dangereuses.

**MAU = 0 — OK pour Free tier indéfiniment**.

### 2.5 Realtime subscribers

**Channels par user actif** (vérifié grep `supabase.channel`) :

| Page                     | Channels                                                 | Tables abonnées                                  |
|--------------------------|----------------------------------------------------------|--------------------------------------------------|
| Navbar (toutes pages)    | `navbar-visites-${email}`, `navbar-messages-${email}`    | `visites`, `messages`                            |
| NotificationBell         | `notifs-${email}`                                        | `notifications`                                  |
| ToastStack               | `toasts-${email}`                                        | `messages` (filter to_email)                     |
| `/messages` (active)     | `messages-${conv}`, `visites-${conv}`, `typing:${conv}`  | `messages`, `visites`, `annonces`, `bail_signatures`, `edl_signatures`, `etats_des_lieux` |
| `/mon-logement`          | `mon-logement-${bien.id}`                                | `annonces`, `bail_signatures`, `etats_des_lieux`, `loyers` |

**Comptage** :
- User passif (Navbar + bell + toasts ouverts) = **3 channels** concurrent.
- User dans `/messages` = **3 + 3 = 6 channels** (typing presence + postgres_changes).
- User dans `/mon-logement` = **3 + 1 = 4 channels**.

→ Pic ~6 channels par user actif.

À 100 users actifs simultanés → 600 peers. À 1000 → 6000. Limite Free 50 000 = **largement OK**.

**Anti-pattern à surveiller** : Navbar + ToastStack + NotificationBell écoutent toutes `messages` ou `notifications` du même user — 3 connexions wsockets distinctes pour des infos overlapping. Pas critique vu la limite, mais coût performance client (3 listeners postgres_changes parallèles).

`REPLICA IDENTITY FULL` activé sur `messages`, `annonces`, `etats_des_lieux`, `visites` (mig 047). Coût WAL bandwidth en interne, peut booster bandwidth Postgres si activité forte. À surveiller via dashboard Supabase quand il y a 100+ users.

### 2.6 Indexes manquants

Indexes Phase 5 V70 (mig 010 + 062) couvrent les colonnes `WHERE` fréquentes :
- `annonces` : ville, statut, prix, proprio, locataire, composite (ville, statut) partial.
- `messages` : to_email, from_email, annonce_id, created_at, partial unread.
- `visites` : proprio, locataire, annonce, (statut, date_visite).
- `loyers` : annonce, locataire, mois, statut, partial retard.
- `etats_des_lieux` : annonce, locataire, proprio.
- `carnet_entretien` : annonce, proprio, locataire.
- `bail_invitations` : token, (locataire, statut), (proprio, statut), annonce, **UNIQUE pending par annonce** (mig 062).
- `notifications` : (user_email, created_at), partial unread.
- `messages_emails_log` : (receiver, conv, sent_at), (receiver, last_digest_at).
- `dossier_access_log` : email + token_hash.
- `historique_baux` : proprio, locataire, annonce.
- `irl_history` : (annee, trim).
- `clics_annonces` : annonce_id.
- `signalements` : statut, type.
- `favoris` : user_email + UNIQUE (user, annonce).
- `bail_avenants` : (annonce, statut), propose_par.

**Aucun trou évident.** Couverture indexes ≥ 95 %. `pg_stat_statements` non auditable code-only ; à valider via dashboard Supabase si activité réelle révèle un seq scan.

### 2.7 RLS overhead

**État RLS Phase 5 (post-mig 059) : 12/12 tables verrouillées** ✅

Le pattern KeyMatch est :
- `REVOKE SELECT/INSERT/UPDATE/DELETE FROM anon` sur la quasi-totalité des tables sensibles.
- Toutes les routes API server-side utilisent `supabaseAdmin` (service_role) → **bypass RLS** → coût RLS = 0 sur les chemins normaux.
- Les policies RLS qui restent (ex `bail_avenants_read_own` mig 044, `dossiers_select_public` mig 005) sont essentiellement mortes ou super légères.

**Anti-pattern détecté mais non critique** :
- `nestmatch/supabase/migrations/044_bail_avenants.sql:47-56` — policy SELECT avec `EXISTS (SELECT 1 FROM annonces ...)` per-row. Coûteux mais cette table est lue **uniquement via supabaseAdmin** → bypass → policy jamais évaluée en pratique.

**Verdict** : pas d'overhead RLS détectable. Les policies storage `auth.jwt() ->> 'email'` sont mortes (NextAuth ≠ Supabase Auth) mais inoffensives.

---

## 3. Tables risque DB bloat — résumé

| Priorité | Table                  | Action recommandée                                                      |
|----------|------------------------|-------------------------------------------------------------------------|
| **P1**   | `messages`             | Cron mensuel : DELETE WHERE `lu = true` AND `created_at < now() - 180 days` AND messages **non-system** (pas commençant par `[BAIL_CARD]`/`[QUITTANCE_CARD]`/`[EDL_CARD]`) |
| **P1**   | `notifications`        | Cron mensuel : DELETE WHERE `lu = true` AND `created_at < now() - 30 days` (déjà recommandé dans la doc agent) |
| **P2**   | `messages_emails_log`  | Cron mensuel : DELETE WHERE `sent_at < now() - 90 days` (sert juste à debounce) |
| **P2**   | `dossier_access_log`   | **Câbler** la fonction `purge_dossier_access_log_old()` existante via cron Vercel quotidien (RGPD 90j déjà commenté dans la mig 007) |
| **P3**   | `clics_annonces`       | Cron mensuel : DELETE WHERE `created_at < now() - 90 days` (analytics court terme suffisent) |
| **P3**   | `bail_invitations`     | Cron mensuel : DELETE WHERE `statut = 'expired'` AND `expires_at < now() - 30 days` (lien mort, plus utile) |

---

## 4. Anti-patterns détectés

1. **Aucun cron de purge** — 14 crons Vercel programmés (`vercel.json`) tous métier (loyers retard, IRL, digest, etc.), zéro housekeeping DB.
2. **Storage orphelin systémique** :
   - `app/api/annonces/[id]/route.ts:62-86` — DELETE annonce ne nettoie pas `annonces-photos`.
   - `app/api/bail/importer/route.ts:205` — DELETE annonce sans nettoyer bucket `baux`.
   - Path photo non scopé par `annonce_id` (`${email}/${ts}_${rand}.jpg`) → impossible de retrouver les photos d'une annonce supprimée pour les purger.
3. **Bucket `dossiers` public** (`mig 005:93-96`) — CNI, fiches paie, contrats accessibles en lecture par tout anon avec l'URL devinée. Côté coûts : pas critique. Côté privacy + RGPD : flag déjà dans `docs/RLS_AUDIT.md`. À traiter dans audit RGPD (5).
4. **3 channels Realtime overlapping côté Navbar/Toast/Bell** — Navbar écoute `messages` filtré to_email, ToastStack idem, NotificationBell écoute `notifications` (qui sont créées en réaction aux `messages`). 2 listeners `messages` sur le même user. Refactor possible : 1 channel multiplexé. Non bloquant tant que < 1000 users actifs.
5. **`REPLICA IDENTITY FULL` sur 4 tables** (mig 047) — coût WAL accru. Justifié par le besoin de payload complet sur UPDATE. À surveiller si DB > 200 MB.
6. **Path photo annonce non-scopé** (P1 dette technique) — empêche cleanup propre par préfixe `annonce_id`. Refactor : `annonces/${annonce_id}/${ts}_${rand}.jpg`. Migration data nécessaire si on bouge.
7. **`messages_emails_log` croît indéfiniment** — sert juste au debounce 5 min, peut être purgé à 30j sans perte.
8. **Fonction `purge_dossier_access_log_old()` orpheline** — créée mig 007 jamais appelée. Win facile.

---

## 5. Top 5 fixes immédiats

### Fix 1 — Cron `purge-housekeeping` quotidien (1h chantier)

Nouvelle route `app/api/cron/purge-housekeeping/route.ts` qui en parallèle :
```sql
DELETE FROM notifications WHERE lu = true AND created_at < now() - interval '30 days';
DELETE FROM messages_emails_log WHERE sent_at < now() - interval '90 days';
DELETE FROM bail_invitations WHERE statut = 'expired' AND expires_at < now() - interval '30 days';
SELECT purge_dossier_access_log_old();  -- déjà existante
```
Ajouter dans `vercel.json` : `{ "path": "/api/cron/purge-housekeeping", "schedule": "0 4 * * *" }`.

**Gain** : maintient 3-5 tables flat. Évite ~50-200 MB de bloat à 1 an.

### Fix 2 — Cleanup storage à la suppression d'annonce (30 min)

Dans `app/api/annonces/[id]/route.ts` après ligne 79, ajouter pre-DELETE :
```ts
// Liste les photos uploadées par ce proprio (paginé) puis cross-référence
// le tableau annonces.photos[] pour déterminer ce qui peut être supprimé.
const { data: ann } = await supabaseAdmin.from("annonces")
  .select("photos, proprietaire_email").eq("id", id).single()
if (ann?.photos?.length) {
  const paths = ann.photos.map((url: string) => extractStoragePath(url, "annonces-photos"))
  await supabaseAdmin.storage.from("annonces-photos").remove(paths.filter(Boolean))
}
```
Pareil pour `bail/importer:205` avec bucket `baux`.

**Gain** : élimine la fuite storage la plus grave. Économise ~10-30 MB/an.

### Fix 3 — Câbler `purge_dossier_access_log_old()` (5 min)

Inclus dans Fix 1, mais peut être fait indépendamment. Conformité RGPD 90j déclarée dans la mig 007 mais jamais activée.

### Fix 4 — Compresser images côté client avant upload (1h)

Ajouter `browser-image-compression` ou un canvas resize dans `app/proprietaire/ajouter/page.tsx` pour passer toutes les photos à max 2000px / quality 0.85 **avant** envoi multipart. Le serveur re-sanitize de toute façon mais bandwidth INBOUND chute.

**Gain** : -50 % d'egress entrant en moyenne (10 MB → ~500 KB).

### Fix 5 — Refactor path photo annonce (P1 dette, 2h + migration data)

Changer `${email}/${ts}_${rand}.jpg` → `${email}/${annonce_id}/${ts}_${rand}.jpg` dans `app/api/proprietaire/photo/route.ts`. Backfill SQL pour annonces existantes :
```sql
-- Pour chaque annonce, déduire de photos[] les paths actuels et générer
-- un nouveau path scopé. Côté code, déplacer storage avec move().
```
Permet purge propre par `storage.list("${email}/${id}/")` puis `remove(...)` au DELETE annonce.

---

## 6. Décision upgrade Pro : NON (encore 6-12 mois sur Free)

### Raison

- DB ~30-50 MB / 500 MB → 6-10 % usage. Avec Fix 1 (purges) la croissance reste sous-linéaire pendant longtemps.
- Storage ~50-150 MB / 1 GB → 5-15 % usage. Fix 2+5 résorbent le risque orphelin.
- MAU = 0 (NextAuth) → indifférent.
- Bandwidth < 25 % avec usage actuel beta privée.
- Realtime largement sous la limite.

### Quand basculer Pro ($25/mo)

**Trigger 1** : DB > 300 MB **ou** storage > 700 MB (60 % de marge avant le hard limit).
**Trigger 2** : passage public + > 100 users actifs / jour pendant 7 jours consécutifs.
**Trigger 3** : besoin daily backups managés (Pro inclut 7 jours, plus le custom `db-backup`).
**Trigger 4** : dépendance critique → besoin d'éviter pause auto 7 jours d'inactivité (pas applicable tant qu'il y a du trafic régulier).

### Ce qui retarde l'upgrade

- Application des Fix 1 + 2 + 3 ce mois-ci → repousse de 6+ mois.
- Refactor Fix 5 (path scopé) → permet de tenir Free jusqu'à ~500 annonces actives.

### Ce qui force l'upgrade

- Lancement public sans Fix 1 → DB peut atteindre 500 MB en 3-6 mois sur `messages` + `notifications` seuls.
- Pause 7j si trafic chute → Vercel cron fail silently.

---

## Récap actionnable

| Priorité | Fix                                            | Effort | Impact                          |
|----------|------------------------------------------------|--------|---------------------------------|
| P0       | Cron `purge-housekeeping` (Fix 1+3)            | 1h     | -100 MB/an DB                   |
| P0       | Cleanup storage au DELETE annonce (Fix 2)      | 30 min | -10-30 MB/an storage            |
| P1       | Compress images côté client (Fix 4)            | 1h     | -50 % egress in                 |
| P1       | Path photo scopé annonce_id (Fix 5)            | 2h     | dette résolue, prep upgrade     |
| P2       | Channel Realtime mutualisé Navbar/Toast/Bell   | 2h     | UX + ws perf, pas coût Supabase |

**Décision finale** : rester Free, appliquer Fix 1+2+3 dans le sprint en cours. Re-auditer dans 60 jours si lancement public.
