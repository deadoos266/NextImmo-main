# Vercel Hobby plan — limites crons KeyMatch

**Statut** : V75.4 — réduction `vercel.json` de 15 crons → 2 crons pour passer
le check Hobby qui bloquait tous les déploiements depuis V71.6.

## Pourquoi ?

Vercel a refusé tous les builds depuis le 5 mai 22h41 UTC avec l'erreur :
> Hobby accounts are limited to daily cron jobs. This cron expression
> (0 * * * *) would run more than once per day. Upgrade to the Pro plan
> to unlock all Cron Jobs features on Vercel.

Le cron incriminé : `/api/cron/health-check` à `0 * * * *` (hourly,
introduit V71.7) — interdit sur Hobby qui exige `1×/jour max` par cron
ET `2 crons max total` par projet.

Avant V75.4, `vercel.json` listait **15 crons** (V64 à V71) — sans doute
toléré historiquement par Vercel sur Hobby (vu que des crons existaient
depuis V64 et que le premier deploy figé date du 5 mai), mais le passage
à hourly sur health-check a déclenché le check strict qui rejette tout.

## Crons GARDÉS dans `vercel.json` (2/2)

| Path | Schedule | Pourquoi |
|---|---|---|
| `/api/cron/loyers-retard` | `0 8 * * *` (daily 8h) | **Critique ALUR loi 89-462** — notification locataire + proprio sur loyers en retard, calcul intérêts moratoires. Risque légal si pas envoyé. |
| `/api/cron/health-check` | `0 9 * * *` (daily 9h) | Monitoring services /status + /admin/health + auto-incident sur transition up→down. Granularité dégradée de hourly à daily — pour fine-grain, voir UptimeRobot ci-dessous. |

## Crons RETIRÉS de `vercel.json` (13)

Les routes API restent dans le code source `app/api/cron/*/route.ts`,
elles sont juste plus déclenchées par le scheduler Vercel. Elles peuvent :
- Être appelées manuellement via curl + `Authorization: Bearer $CRON_SECRET`
- Être recâblées au Vercel scheduler si upgrade Pro
- Être triggered par un cron externe (cron-job.org gratuit, GitHub Actions
  schedule, UptimeRobot avec POST si dispo)

| Path | Ancien schedule | Criticité | Recâblage prio post-Pro |
|---|---|---|---|
| `/api/cron/check-irl` | trimestriel `0 9 5 1,4,7,10 *` | 🟢 Basse | À recâbler quand IRL INSEE publie |
| `/api/cron/preavis-jalons` | daily 8h | 🔴 Critique ALUR | **PRIORITÉ 1 post-upgrade** |
| `/api/cron/visites-rappel` | daily 9h | 🟠 Moyenne | Nice to have |
| `/api/cron/candidatures-digest` | daily 8h | 🟠 Moyenne | UX engagement |
| `/api/cron/irl-rappel-bail` | trimestriel | 🟠 Moyenne | À aligner avec check-irl |
| `/api/cron/post-bail` | daily 10h | 🔴 Critique ALUR | **PRIORITÉ 2 post-upgrade** |
| `/api/cron/messages-digest` | daily 8h | 🟢 Basse | UX engagement only |
| `/api/cron/db-backup` | daily 3h | 🔴 Critique data | **PRIORITÉ 3 post-upgrade** ou via Supabase Pro auto-backups |
| `/api/cron/depot-retard` | daily 9h | 🔴 Critique ALUR art. 22 | **PRIORITÉ 4 post-upgrade** |
| `/api/cron/annonces-stagnantes` | weekly Mon 9h | 🟢 Basse | Nice to have |
| `/api/cron/verify-integrity-baux` | weekly Sun 4h | 🟠 Moyenne sécurité | À recâbler post-launch |
| `/api/cron/edl-contestation-retard` | weekly Mon 10h | 🟠 Moyenne ALUR | À recâbler post-launch |
| `/api/cron/scrape-irl-insee` | mensuel 1er 6h | 🟢 Basse | À aligner avec irl-rappel-bail |

## Solutions cron externe (gratuites, sans upgrade Pro)

### Option A — UptimeRobot (recommandé pour `/api/cron/health-check` granularité 5 min)

UptimeRobot offre 50 monitors gratuit, ping toutes les 5 min, supporte
les requêtes HTTPS avec headers (Authorization: Bearer). Idéal pour
remplacer le cron hourly perdu.

Setup :
1. Créer compte uptimerobot.com (gratuit)
2. New monitor : "HTTP(s)" → URL `https://keymatch-immo.fr/api/cron/health-check`
3. Custom HTTP headers : `Authorization: Bearer <CRON_SECRET>`
4. Interval : 5 minutes
5. Alerting si HTTP != 200

### Option B — cron-job.org (généraliste, jusqu'à 1×/min)

cron-job.org gratuit, supporte cron expressions arbitraires + headers.
Recommandé pour les autres crons critiques (preavis-jalons, post-bail,
db-backup, depot-retard).

Setup :
1. Créer compte cron-job.org
2. New cron job par route à recâbler
3. URL `https://keymatch-immo.fr/api/cron/<name>`
4. Header `Authorization: Bearer <CRON_SECRET>`
5. Schedule selon le tableau ci-dessus

### Option C — GitHub Actions (gratuit pour repos publics)

`.github/workflows/cron-*.yml` avec `on: schedule: cron: ...`. Gratuit
illimité pour repos publics (KeyMatch est public ?). Utile si on veut
versionner les schedules dans le repo.

## Plan d'upgrade Pro (si beta payante / >100 users)

Vercel Pro ($20/mois/user) débloque :
- Crons illimités (jusqu'à hourly OU custom)
- 1000 GB-hours functions (vs 100 Hobby)
- 1 TB bandwidth (vs 100 GB)
- Edge Config + analytics
- Team collaboration

Décision recommandée KeyMatch :
- **Phase beta gratuite (actuelle)** : Hobby + UptimeRobot externe pour
  les 2-3 crons critiques. Coût total : 0 €/mois.
- **Phase paid launch** : upgrade Pro avant > 100 users actifs (sinon
  bandwidth Hobby saturé).

## Action user post-V75.4

1. Une fois le commit V75.4 (`<hash>`) déployé par Vercel et site live :
2. Décider si upgrade Pro tout de suite ou plus tard
3. Si pas Pro maintenant → setup UptimeRobot pour `/api/cron/health-check`
   (granularité 5 min) + cron-job.org pour les 4 crons P1-P4 (preavis-
   jalons, post-bail, db-backup, depot-retard)
4. Tester chaque cron via curl avec `Authorization: Bearer $CRON_SECRET`
   pour confirmer qu'ils répondent toujours bien (route alive, pas
   d'erreur 500)
