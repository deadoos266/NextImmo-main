# KeyMatch Next.js self-host VPS — Phase 6 du plan migration OVH

Containerise Next.js 15 production sur le VPS OVH pour couper Vercel.

## Pour quoi
- **Indépendance Vercel** : Phase 6 du plan `nestmatch/docs/MIGRATION_OVH_COMPLETE_PLAN.md`
- **Économie immédiate** : -18€/mois Vercel Pro (Paul paye actuellement)
- **Coexistence** : tourne sur le même VPS-2 que Postgres + MinIO + worker Zendriver
- **Zero-downtime cutover** : staging.keymatch-immo.fr validé d'abord, puis flip DNS apex

## État actuel (préparation, ZÉRO risque prod)

Ce dossier contient :
- `Dockerfile` : multi-stage build Next.js standalone (~250 MB image)
- `docker-compose.yml` : service `keymatch-next` + healthcheck + cache ISR persistant
- `Caddyfile.fragment` : reverse-proxy `staging.keymatch-immo.fr` + bloc prod commenté
- `scripts/deploy.sh` : git pull → build → up -d → healthcheck → smoke test
- `systemd/keymatch-next-deploy.service` : auto-deploy via systemd (manuel ou webhook)
- `.dockerignore` : optimise le contexte build (~20 MB au lieu de 2 GB)

**Ce dossier ne fait RIEN tant que :**
1. Phase 2 (Postgres VPS) n'est pas faite — Next.js a besoin de `DATABASE_URL` ou Supabase fallback
2. `/etc/keymatch.env` n'est pas rempli avec les vraies env vars
3. `docker compose up -d` n'est pas lancé sur le VPS

## Pré-requis Phases dépendantes

| Phase | Statut souhaité avant Phase 6 |
|---|---|
| Phase 0 — VPS bootstrap | ✅ Fait (Docker + Caddy + ufw OK) |
| Phase 1 — Worker Zendriver | ✅ Fait (route /api/proprio/annonce/import call worker) |
| Phase 2 — Postgres self-host | ⚠ Idéal mais pas obligatoire (Next.js peut parler à Supabase) |
| Phase 3 — MinIO | ⚠ Idéal mais pas obligatoire (idem) |
| Phase 5 — Brevo email | ✅ Fait (dispatcher livré) |

Phase 6 peut techniquement marcher avec Next.js sur VPS qui parle encore à
Supabase + Resend. C'est ce qu'on recommande pour le **premier cutover** :
on coupe Vercel mais on garde Supabase. Phases 2+3+10 plus tard pour
couper Supabase aussi.

## Procédure complète activation (~3-4h le jour J)

### Phase A — Build local test (15 min, sur machine de Paul)

```bash
cd C:\Users\Paul\OneDrive\Documents\GitHub\NextImmo-main
docker build -f tools/next-vps/Dockerfile -t keymatch-next:test .
# Attends ~3-5 min de build

# Test rapide local (utilise .env.local de Paul)
docker run --rm -p 3000:3000 --env-file nestmatch/.env.local keymatch-next:test
# Ouvre http://localhost:3000 → KeyMatch local depuis container
# Ctrl+C pour arrêter
```

### Phase B — Setup VPS (30 min)

```bash
# Connect au VPS
ssh -i $HOME\.ssh\keymatch_vps ubuntu@149.202.60.152

# Pull derniers fichiers
cd /opt/keymatch/NextImmo-main && git pull

# Crée /etc/keymatch.env avec toutes les env vars Vercel actuelles
sudo nano /etc/keymatch.env
# Copie depuis Vercel Dashboard → Settings → Environment Variables → Production
# Format : un VAR=valeur par ligne, sans guillemets
sudo chmod 600 /etc/keymatch.env
sudo chown root:root /etc/keymatch.env

# Crée le réseau Docker si Phase 2 pas encore active
sudo docker network create keymatch-postgres-net 2>/dev/null || true
sudo docker network create keymatch-minio-net 2>/dev/null || true

# Crée cache persistant ISR
sudo mkdir -p /srv/keymatch/next-cache
sudo chown -R 1001:1001 /srv/keymatch/next-cache

# Build (peut prendre 5-10 min sur VPS-2)
cd tools/next-vps
sudo docker compose build
```

### Phase C — Premier run + smoke test (15 min)

```bash
sudo docker compose up -d
sudo docker compose logs -f keymatch-next
# Attends "▲ Next.js 15.x.x" + "Ready in Xs"
# Ctrl+C pour quitter les logs

# Test local depuis le VPS
curl -fsS http://localhost:3000/api/health
# Doit retourner {"ok":true,...}
```

### Phase D — Caddy reverse-proxy + DNS staging (30 min)

```bash
# Ajoute le fragment Caddyfile
sudo cat /opt/keymatch/NextImmo-main/tools/next-vps/Caddyfile.fragment >> /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo journalctl -u caddy --since "-2m"
# Attends "certificate obtained successfully" pour staging.keymatch-immo.fr
```

DNS dans OVH Manager → Zone DNS keymatch-immo.fr :
```
A  staging  → 149.202.60.152  (TTL 600)
```

Test : `curl -fI https://staging.keymatch-immo.fr/api/health` → 200.

### Phase E — Régression UI complète sur staging (1h)

Browse `https://staging.keymatch-immo.fr` :
- [ ] Homepage charge
- [ ] Login Google OAuth marche (le redirect URI doit inclure `staging.keymatch-immo.fr/api/auth/callback/google` côté Google Cloud Console)
- [ ] Login OTP email marche
- [ ] /annonces filtre + recherche
- [ ] /swipe charge
- [ ] /profil page utilisateur
- [ ] /proprietaire dashboard
- [ ] /messages chat avec realtime (si Phase 4 pas encore : Supabase Realtime continue d'envoyer les events)
- [ ] Visite + bail + EDL flow
- [ ] Quittance PDF génération
- [ ] /admin/* dashboard admin
- [ ] /admin/health montre statuts services
- [ ] Test upload photo annonce → arrive dans le storage actif

Si tout marche → continue.

### Phase F — Cutover prod (5 min de coupure perçue + 24h vigilance)

⚠ **IRRÉVERSIBLE** sauf à rollback DNS. Faire le dimanche matin 8h00 quand trafic le plus bas.

1. **Baisse le TTL DNS** keymatch-immo.fr 24h AVANT le cutover (passe de 3600s à 60s).
2. **Active le bloc prod** dans `/etc/caddy/Caddyfile` (décommente le bloc `keymatch-immo.fr, www.keymatch-immo.fr`).
3. `sudo systemctl reload caddy`
4. **Flip A record** dans OVH zone : `keymatch-immo.fr → 149.202.60.152` (TTL 60s).
5. Vérifie propagation : `dig +short keymatch-immo.fr` depuis plusieurs DNS publics (1.1.1.1, 8.8.8.8).
6. Vérifie tout marche : ouvre une session incognito sur https://keymatch-immo.fr et fait le tour.
7. Surveille `journalctl -u caddy -f` + `docker logs -f keymatch-next` pendant 1h.
8. Surveille Sentry : ratio errors avant/après. Si spike → ROLLBACK (flip DNS retour Vercel IP).
9. Si 24h OK → remet TTL à 3600s pour économiser les requêtes DNS.

### Phase G — Désactiver Vercel (J+30, après confirmation prod OK)

Vercel Dashboard → Settings → Domain → remove `keymatch-immo.fr` du projet (mais
garder le projet actif pour rollback rapide pendant 30 jours).

Au J+60 : downgrade Vercel Pro → Hobby (gratuit). Économie : 18€/mois.

## Rollback rapide

Si problème détecté en prod après cutover :
1. **DNS rollback** (le plus rapide, ~1-5 min avec TTL 60s) : flip A record keymatch-immo.fr → IP Vercel.
2. **Caddy rollback** : commenter le bloc prod, reload Caddy.
3. **Container rollback** : `docker compose down`, garde le state pour debug.

## Performance attendue sur VPS-2 12 GB

| Métrique | Vercel actuel | VPS attendu | Notes |
|---|---|---|---|
| TTFB cold | 200-800ms | 100-300ms | Pas de cold start (long-running process) |
| TTFB warm | 50-150ms | 80-200ms | Petit overhead car single-AZ |
| LCP (homepage) | 1.2s | 1.4s | +0.2s OK, cf CDN Cloudflare devant pour caching |
| INP | 80ms | 80ms | Côté client identique |
| Concurrent users | illimité | ~200 simultanés | Suffisant pour KeyMatch (estimé 50 actifs max actuellement) |
| Build time | 1 min | 3-5 min | Docker layer cache rend les rebuild incrémentaux <1min |

## Cloudflare gratuit devant (optionnel mais recommandé)

Ajoute un CDN gratuit Cloudflare pour cacher les assets statiques + DDoS.
Cf phase 6 du plan migration OVH section "DNS cutover".

## Coût après Phase 6

| Avant | Après | Économie |
|---|---|---|
| Vercel Pro 18€/mois | VPS 10€/mois | -8€/mois |
| **Total infra** : 18€ | **Total infra** : 10€ (Supabase encore 0€) | -44% |

## Maintenance courante

### Deploy après push main (manuel)
```bash
ssh -i $HOME\.ssh\keymatch_vps ubuntu@149.202.60.152
sudo systemctl start keymatch-next-deploy.service
tail -f /var/log/keymatch-deploy.log
```

### Deploy auto via GitHub webhook (V2 — pas dans ce commit)
1. Endpoint `/webhook/deploy` côté Caddy avec secret HMAC
2. POST GitHub webhook sur push main → trigger systemd unit
3. Auto rollback si healthcheck KO

### Logs
```bash
docker logs -f keymatch-next
journalctl -u caddy -f
tail -f /var/log/caddy/keymatch-prod.log
```

### Update Node.js / deps
```bash
cd /opt/keymatch/NextImmo-main && git pull
sudo docker compose -f tools/next-vps/docker-compose.yml build --no-cache
sudo docker compose -f tools/next-vps/docker-compose.yml up -d
```

## Limites V1

- **Pas de réplication multi-AZ** : si VPS meurt, downtime jusqu'à restore (max 24h avec backups Phase 8). Acceptable pour MVP. Migration vers VPS cluster ou Kubernetes hors scope.
- **Pas de blue/green deploy** : le `docker compose up -d` fait rolling restart (1-3s perçus comme 502 si load balancer pas devant). Pour zéro coupure : ajouter HAProxy ou utiliser nginx-rolling-deploy.
- **Pas de canary** : on push direct prod. À ajouter quand 10+ utilisateurs actifs.
- **Build CPU-intensif** : 5-10 min sur VPS-2. Pour build remote sur GitHub Actions puis push image vers registry GHCR : V2.
