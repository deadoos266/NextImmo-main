# Uptime monitoring KeyMatch

État : V64 a livré l'endpoint, ce doc explique comment le brancher.

## Endpoint

```
GET https://keymatch-immo.fr/api/health
```

- Public (pas d'auth) → pingable directement par UptimeRobot/BetterStack/Pingdom
- 200 OK + JSON `{ status: "ok", services: { ... } }` quand tout va bien
- 503 + JSON `{ status: "degraded", services: { ... } }` si Supabase down ou env manquant
- `Cache-Control: no-store` → check live à chaque ping

## Setup UptimeRobot (gratuit)

1. Créer un compte sur [uptimerobot.com](https://uptimerobot.com)
2. **Add new monitor** :
   - Monitor type : `HTTP(s)`
   - URL : `https://keymatch-immo.fr/api/health`
   - Friendly name : `KeyMatch — Health`
   - Interval : `5 minutes` (gratuit jusqu'à 50 monitors / interval 5 min)
3. **Alert contacts** : ajouter ton email + (optionnel) Slack/Discord webhook
4. **Save** → premier ping immédiat

UptimeRobot considère le monitor comme `down` si :
- 3 pings consécutifs renvoient un code ≥ 400 (donc 503 healthcheck = down après 15 min)
- Ou timeout (>10s par défaut)

## Setup BetterStack (alternative payante mais plus précis)

[betterstack.com/uptime](https://betterstack.com/uptime) — free tier 10 monitors.
Avantages : check toutes les 30s, multi-régions, on-call rotation, status page publique.

## Que monitor en plus

- **Homepage** `https://keymatch-immo.fr/` — détecte les 500 globaux Next.js
- **API publique** `https://keymatch-immo.fr/api/annonces?ville=Paris` — détecte les
  régressions DB qui masquent les annonces
- **Sitemap** `https://keymatch-immo.fr/sitemap.xml` — détecte les routes dynamiques
  cassées qui bloqueraient le crawl Google

## Que faire quand alerte

1. Ouvrir [Vercel logs](https://vercel.com/) du projet → onglet "Functions"
2. Chercher l'erreur dans `/api/health` ou la route impactée
3. Si Supabase down : check [status.supabase.com](https://status.supabase.com)
4. Si env manquant : vérifier les ENV vars Vercel project settings

## Latency

Le healthcheck mesure la latency Supabase et la retourne dans le payload :
```json
{ "services": { "supabase": { "status": "ok", "latency_ms": 42 } } }
```

UptimeRobot peut afficher cette valeur via le monitoring "Keyword" si on configure
`status":"ok"` comme keyword attendu — sinon le timing est juste le RTT total HTTP.

## TODO V66+

- [ ] Status page publique `/status` qui affiche l'historique des incidents
  (basée sur l'API UptimeRobot ou BetterStack)
- [ ] Webhook Slack/Discord depuis BetterStack pour notifier l'équipe
