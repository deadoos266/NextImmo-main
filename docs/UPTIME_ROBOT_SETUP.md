# UptimeRobot setup — recâbler les 13 crons KeyMatch retirés (Hobby workaround)

V75.4 a réduit `vercel.json` de 15 → 2 crons pour respecter Vercel Hobby
plan limits (max 2 crons, daily seulement). Les 13 routes API cron restent
dans le code (`app/api/cron/*/route.ts`), juste plus déclenchées par le
scheduler Vercel.

Ce doc explique comment les recâbler via [UptimeRobot](https://uptimerobot.com)
**gratuit** (50 monitors, ping toutes les 5 min mini, alerte email/SMS si
le ping échoue).

---

## Pourquoi UptimeRobot et pas un autre cron ?

| Service | Free tier | Granularité | Auth headers | Verdict KeyMatch |
|---|---|---|---|---|
| **UptimeRobot** | 50 monitors | 5 min mini | ✅ Custom HTTP headers | ✅ Recommandé |
| cron-job.org | illimité (mais 1×/min mini) | 1 min mini | ✅ headers | OK alternative, gestion granular |
| GitHub Actions schedule | illimité repos publics | 5 min mini | ✅ secrets | OK si KeyMatch repo public |
| Vercel Pro upgrade | inclus | 1 min mini | natif | $20/mois — overkill pour beta |

**Recommandé** : UptimeRobot pour les crons à fréquence ≥ 5 min, GitHub Actions
pour les crons quotidiens versionnés dans le repo (audit-trail), upgrade Pro
au passage paid launch.

---

## Étape 1 — Créer compte UptimeRobot

1. https://uptimerobot.com → "Free Sign Up" (email + password)
2. Vérifier email
3. Dashboard → "+ New monitor"

---

## Étape 2 — Récupérer le `CRON_SECRET`

Tous les crons KeyMatch protègent leur endpoint avec un Bearer token.
Le secret est dans Vercel env vars.

1. Vercel Dashboard → KeyMatch project → Settings → Environment Variables
2. Chercher `CRON_SECRET` → Copier la valeur

Si la variable n'existe pas, en créer une avec une valeur random forte :
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Puis sync sur les 3 environments (Production, Preview, Development).

---

## Étape 3 — Configurer 1 monitor par cron

Pour chaque entrée du tableau ci-dessous :

1. UptimeRobot → "+ New monitor"
2. Type : **HTTP(s)**
3. Friendly name : `KeyMatch · <cron name>`
4. URL : `https://keymatch-immo.fr/api/cron/<cron-path>`
5. Monitoring interval : **5 min** (ou plus selon recommandation table)
6. Onglet "Advanced" → **Custom HTTP headers** :
   ```
   Authorization: Bearer <CRON_SECRET>
   ```
   (remplacer `<CRON_SECRET>` par la valeur copiée Étape 2)
7. Onglet "Alerting" : ajouter ton email pour recevoir les alertes si le
   ping échoue (statut !== 200)
8. "Save changes"

Le cron sera désormais déclenché toutes les `interval` minutes par UptimeRobot.

---

## Tableau des 13 crons retirés

Priorité d'activation par ordre métier (P1 = critique légal, P2 = sécurité,
P3 = UX engagement) :

### P1 — Critiques ALUR (à activer en premier)

| Path | Frequency reco | Pourquoi |
|---|---|---|
| `/api/cron/preavis-jalons` | Daily 8h Paris | Notif jalons préavis ALUR (1/2/3 mois selon zone tendue) — risque légal si pas envoyé |
| `/api/cron/post-bail` | Daily 10h Paris | Workflow post-signature bail (relance EDL d'entrée, premier loyer, etc.) — **utilisé par les nouveaux baux** |
| `/api/cron/depot-retard` | Daily 9h Paris | ALUR art. 22 — délais légaux dépôt garantie (1 mois OR 2 mois selon retenue). Notif locataire + ADIL recours |
| `/api/cron/db-backup` | Daily 3h Paris | Snapshot DB. Alternative : Supabase Pro auto-backups inclus dans le tier supérieur |

UptimeRobot interval : **24h** (mais UptimeRobot ne supporte pas vraiment
"daily à 8h Paris" — donc utiliser cron-job.org pour ces 4 entrées qui
acceptent un cron expression complet `0 8 * * *`). UptimeRobot reste OK
pour les crons "every X minutes/hours" où la fenêtre d'exécution n'a pas
de contrainte horaire stricte.

### P2 — Sécurité + monitoring (activer une fois P1 stable)

| Path | Frequency reco | Pourquoi |
|---|---|---|
| `/api/cron/health-check` | **5 min** | Monitoring services /status + auto-incident transition up→down. Vercel cron daily 9h V75.4 garde un fallback minimal mais 5 min via UptimeRobot = monitoring temps réel. |
| `/api/cron/verify-integrity-baux` | Weekly Sun 4h | Tamper detection eIDAS — vérifie hashes signatures bail. Si compromis, alerte immédiate Paul. |
| `/api/cron/edl-contestation-retard` | Weekly Mon 10h | Notif locataire ADIL si EDL pas contesté dans les 10 jours (loi 89-462) |

### P3 — UX engagement (nice to have)

| Path | Frequency reco | Pourquoi |
|---|---|---|
| `/api/cron/visites-rappel` | Daily 9h Paris | Rappel visite J-1 par email/notif |
| `/api/cron/candidatures-digest` | Daily 8h Paris | Digest quotidien candidatures pour le proprio |
| `/api/cron/messages-digest` | Daily 8h Paris | Digest quotidien messages non-lus |
| `/api/cron/annonces-stagnantes` | Weekly Mon 9h | Notif proprio si annonce >30j sans candidature |
| `/api/cron/check-irl` | Quarterly | Trigger après publication trimestrielle IRL INSEE |
| `/api/cron/irl-rappel-bail` | Quarterly | Rappel proprio pour indexer le loyer |
| `/api/cron/scrape-irl-insee` | Monthly 1st | Scrape la dernière publication IRL depuis insee.fr |

---

## Étape 4 — Tester chaque monitor

UptimeRobot affiche le résultat de chaque ping (status HTTP + latency).
Pour chaque cron créé :

1. Dashboard UptimeRobot → cliquer sur le monitor
2. "Show advanced details" → vérifier :
   - HTTP status `200` (= cron a accepté + exécuté)
   - Si `401` → header Authorization mal copié
   - Si `404` → URL mal copiée
   - Si `500` → bug dans le cron, regarder Vercel logs

3. Côté KeyMatch, vérifier dans `/admin/health` (V71.6) qu'un nouveau
   `health_pings` row apparaît après 5 min pour le cron `health-check`.

---

## Étape 5 — Setup d'alerting

UptimeRobot envoie un email automatiquement si un monitor passe en down
(seuil par défaut : 1 ping failed). Pour configurer :

1. Dashboard → "My settings" → "Alert contacts"
2. Ajouter :
   - Email tic3467@gmail.com
   - Optionnel : SMS gratuit limité (10/mois)
   - Optionnel : webhook Slack/Discord
3. Pour chaque monitor → onglet "Alerting" → cocher les contacts

**Conseil** : seuil "down" = 2 pings consécutifs failed (évite false positives
sur un cold-start Vercel ponctuel).

---

## Étape 6 — Migration `health-check` Vercel → UptimeRobot

Une fois UptimeRobot ping `/api/cron/health-check` toutes les 5 min en
production, le cron Vercel daily 9h V75.4 devient redondant. Décision :

- **Option A — garder le Vercel cron** : ceinture + bretelles (UptimeRobot
  + Vercel chacun ping). +1 ping/jour = négligeable.
- **Option B — retirer du vercel.json** : libère le slot Hobby (1/2 utilisé,
  on pourrait y mettre un autre cron daily à la place).

Recommandé : **garder Option A** tant qu'UptimeRobot n'est pas validé en
prod. Dès qu'on est sûr du fonctionnement (≥ 1 semaine), passer Option B.

---

## Coût total après setup

- UptimeRobot Free : **0 €/mois** (50 monitors max, on en utilise ~13)
- Vercel Hobby : **0 €/mois** (2 crons restants : loyers-retard + health-check)
- cron-job.org : **0 €/mois** (alternative pour les crons P1 ALUR avec
  cron expression strict)
- Email/SMS UptimeRobot : **0 €/mois** (10 SMS gratuits/mois inclus)

**Total infra crons** : 0 €/mois. Pas d'upgrade Pro nécessaire en phase beta.

---

## Plan post-paid launch

Quand KeyMatch passera en payant (>100 users, >1k €/mois CA), upgrader
Vercel Pro ($20/mois/user) qui inclut :
- Crons illimités (granularité 1 min)
- 1 TB bandwidth (vs 100 GB Hobby)
- 1000 GB-hours functions (vs 100 Hobby)
- Edge Config + analytics intégrées

À ce moment-là, recâbler **tous les 15 crons** dans `vercel.json` (1
seule source de vérité) et désactiver UptimeRobot (ou le garder uniquement
pour le monitoring uptime externe).

Cf. aussi [docs/VERCEL_HOBBY_LIMITS.md](VERCEL_HOBBY_LIMITS.md) — décision
détaillée des 2 crons Hobby gardés.
