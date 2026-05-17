# KeyMatch crons VPS — Phase 9 du plan migration OVH

Remplace les 22 crons Vercel par des systemd timers sur le VPS OVH.

## Pour quoi
- **Indépendance Vercel** : Phase 9 du plan `nestmatch/docs/MIGRATION_OVH_COMPLETE_PLAN.md`
- **Pas de limite Vercel cron** (Pro = 40 max — on est à 22, mais on prépare l'avenir)
- **Logs centralisés** dans `/var/log/keymatch-cron.log` (rotation 30j)
- **Retry natif** systemd (Persistent=true + RandomizedDelaySec=2min)

## État actuel (préparation, ZÉRO risque prod)

Ce dossier contient :
- `cron-routes.tsv` : source de vérité, 22 crons (mapping Vercel → schedule)
- `scripts/generate-systemd-units.sh` : génère .service + .timer depuis le TSV
- `scripts/install.sh` : install les 44 fichiers sur le VPS + enable timers
- `scripts/run-cron.sh` : runner appelé par chaque service (Bearer auth + retry + log)
- `systemd/keymatch-cron-*.{service,timer}` : 22 paires d'units générées

**Ce dossier ne fait RIEN tant que :**
1. Phase 6 (Next.js sur VPS) n'est pas active OU on pointe `KEYMATCH_BASE_URL` vers Vercel pendant la transition
2. `/etc/keymatch.env` ne contient pas `CRON_SECRET` + `KEYMATCH_BASE_URL`
3. `sudo ./scripts/install.sh` n'est pas lancé

## Mapping Vercel → systemd

Le format Vercel `0 8 * * *` (cron classique) est traduit en OnCalendar
systemd `*-*-* 08:00:00`. Le générateur gère :
- Wildcards (`*`)
- Valeurs numériques simples (`30`, `8`)
- Listes (`10,18` → `10,18`)
- Pas-à-pas (`*/6` → `*/6`)
- Day-of-week (`1` → `Mon`, `2` → `Tue`, etc.)
- Day-of-month (`1` → `01` zero-padded)

Cas non couverts (à ajouter manuellement si besoin) :
- Cron complexes type `0 0 */3 * *` (chaque 3 jours) → fonctionne mais à valider
- Cron avec semaines (`@weekly`) → ne sont pas dans le TSV KeyMatch

## Procédure activation (~30 min)

### Étape 1 — Setup VPS (5 min)

```bash
ssh -i $HOME\.ssh\keymatch_vps ubuntu@149.202.60.152
cd /opt/keymatch/NextImmo-main && git pull

# Ajoute dans /etc/keymatch.env
sudo nano /etc/keymatch.env
# Avec :
#   CRON_SECRET=<copie depuis Vercel env vars>
#   KEYMATCH_BASE_URL=https://keymatch-immo.fr
```

### Étape 2 — Génère + installe les units (5 min)

```bash
cd tools/cron-vps

# Génère les 22 paires service+timer depuis cron-routes.tsv
bash scripts/generate-systemd-units.sh

# Installe sur le VPS
sudo bash scripts/install.sh
```

### Étape 3 — Vérifie les timers (1 min)

```bash
systemctl list-timers keymatch-cron-* --no-pager
# Doit afficher 22 timers avec NEXT trigger time
```

### Étape 4 — Test manuel (2 min)

```bash
sudo systemctl start keymatch-cron-health-check.service
tail -f /var/log/keymatch-cron.log
# Attends ~5s, doit afficher :
#   [2026-05-17T14:30:00Z] ✓ health-check → 200 | {"ok":true,...}
```

### Étape 5 — Désactive les crons Vercel (à faire avec stratégie A ou B)

⚠ **DOUBLE-FIRE pendant la transition** : si Vercel ET systemd appellent
la même route au même horaire, certains crons NON idempotents (messages-digest,
candidatures-digest, alertes-matching) enverront 2× le même email. Le verifier
V97.39.20 a flag ce risque.

**Stratégie A — Cutover atomique (recommandée)** :
1. Lance d'abord les timers systemd avec `KEYMATCH_BASE_URL=https://staging.keymatch-immo.fr`
   (ils tapent staging, pas la prod, donc 0 impact user)
2. Surveille `/var/log/keymatch-cron.log` 24-48h
3. Quand confiant : flip `KEYMATCH_BASE_URL=https://keymatch-immo.fr` dans `/etc/keymatch.env`
   AU MOMENT MÊME où tu retires le bloc `"crons": [...]` de `vercel.json` + push
4. Surveille les notifications email 24h
5. Si rollback nécessaire : remet le bloc Vercel, flip back KEYMATCH_BASE_URL

**Stratégie B — Cutover progressif** (acceptable mais risqué) :
1. Lance systemd contre la prod ET garde Vercel actif
2. Accept que certains users reçoivent 2 emails pendant 7 jours
3. Retire Vercel après surveillance

KeyMatch < 50 users actifs en V97.39.x → Stratégie A largement faisable, 0 user impacté.

## Monitoring

### Liste les timers + next run
```bash
systemctl list-timers keymatch-cron-* --no-pager
```

### Logs en live
```bash
tail -f /var/log/keymatch-cron.log
```

### Stats journalières
```bash
grep -c "✓" /var/log/keymatch-cron.log  # success
grep -c "✗" /var/log/keymatch-cron.log  # fail
```

### Si un cron fail
```bash
# Voir les 50 dernières lignes du cron problématique
grep "loyers-retard" /var/log/keymatch-cron.log | tail -50

# Status systemd
systemctl status keymatch-cron-loyers-retard.service

# Re-run manuel
sudo systemctl start keymatch-cron-loyers-retard.service
```

## Mise à jour des crons (workflow)

Ajouter / modifier un cron :
1. Éditer `tools/cron-vps/cron-routes.tsv` (1 ligne par cron)
2. Push sur main
3. Sur le VPS : `git pull && bash scripts/generate-systemd-units.sh && sudo bash scripts/install.sh`

Le `install.sh` overwrite les fichiers existants et `daemon-reload` automatique.

## Rollback

Si toute la stack cron systemd plante :
```bash
sudo systemctl disable --now keymatch-cron-*.timer
sudo rm /etc/systemd/system/keymatch-cron-*.{service,timer}
sudo systemctl daemon-reload
```
Vercel crons reprennent immédiatement (si bloc `"crons"` toujours dans vercel.json).

## Différences vs Vercel cron

| Critère | Vercel cron | systemd timer VPS |
|---|---|---|
| Limite plan | 40 (Pro) | illimité |
| Coût | inclus 18€/mois | 0€ |
| Logs | Vercel dashboard | /var/log/keymatch-cron.log |
| Précision | "around the time" | RandomizedDelaySec=2min |
| Retry | non | Persistent=true |
| Auth | bypass Vercel | Bearer CRON_SECRET (idem) |
| Timezone | UTC | UTC (par défaut) |
| Concurrence | 1 instance | 1 instance (systemd Type=oneshot) |

## Coût après Phase 9

| Avant | Après |
|---|---|
| Vercel Pro 18€ (inclut crons) | VPS 10€ (gratis) |
| 40 crons max | Illimité |

Cron-vps est un sous-élément de Phase 6 (Next.js VPS). Économie globale Phase 6 +
9 : ~8€/mois. Cf section 6 du plan migration OVH pour le détail.
