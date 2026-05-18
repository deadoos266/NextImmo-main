# Brainstorm — API publique KeyMatch pour agences & dev tiers

**Date** : 2026-05-18
**Statut** : exploration, décisions à valider Paul
**Pour** : Paul, fondateur KeyMatch
**Pré-requis** : Phase A agences déjà LIVE (compte, dashboard, membres, badge)

---

## 1. Pourquoi une API publique ?

Une agence avec **logiciel métier** (Apimo, Hektor, Périclès) a déjà 50-500
annonces dans sa base. Lui demander de re-saisir sur KeyMatch = elle ne le
fera pas. Solutions :

- **Upload XML/CSV** : exportable depuis quasi tous les logiciels métier.
  Manuel mais en 1 clic.
- **API REST** : son logiciel ou un middleware (Zapier, n8n, Make, script
  custom) push automatiquement.
- **Feed pull** : KeyMatch va lire le feed de son logiciel toutes les
  heures (côté Apimo/Hektor, ils exposent un feed XML signé par agence).
- **Webhooks** : KeyMatch notifie l'agence quand un user candidate, visite,
  signe → l'agence reçoit dans son CRM sans devoir poll.

**4 modes complémentaires.** Pas opposés. L'API REST est la base, les autres
sont des facilitateurs au-dessus.

---

## 2. Marché — qui va vraiment utiliser l'API ?

### Cible "agences tech-savvy" (5-15% du marché)

- Néo-agences full digital : Welmo, Liberkeys, Hosman, Imkiz
- Mandataires gros volumes : SAFTI, IAD top-100 mandataires
- Grands réseaux avec équipe IT : Century 21 SI central, Foncia
- Agences locales avec dev freelance régulier

**Usage probable** : intégration directe ou via n8n/Zapier.

### Cible "agences classiques" (60-70% du marché)

- Agence de quartier 1-5 collaborateurs avec Apimo SaaS
- Ne sait pas ce qu'est une API
- Veut juste pousser un fichier ou que ça se sync automatiquement

**Usage probable** : upload XML/CSV via dashboard + KeyMatch poll un feed.

### Cible "développeurs tiers" (long tail)

- Quelqu'un qui veut faire un plugin WP, Wix, Shopify
- Un agrégateur multi-portails (du genre Welcome qui scrape SeLoger + LBC + Bien'ici)
- Un nouveau site immo qui veut s'inter-syndicate avec KeyMatch

**Usage probable** : API REST + OpenAPI doc.

---

## 3. Modes d'intégration — détail technique

### Mode A — Upload XML/CSV (le plus simple)

**Workflow** :
```
Agence dans son Apimo/Hektor → Export "feed portails" → fichier XML
→ Va sur keymatch-immo.fr/agence/dashboard/<id>/import → drag & drop
→ Preview "47 biens détectés, voici les 3 premiers"
→ "Tout importer" → bulk INSERT
```

**Avantages** :
- Zéro setup côté agence (juste exporter + uploader)
- Marche pour 95% des agences
- Pas de auth API à gérer côté agence

**Inconvénients** :
- Pas de sync automatique : l'agence doit re-uploader si elle modifie un prix
- Manuel, pas scalable

**Effort dev** : **5-7 jours** (parsers Apimo + Hektor + CSV générique + UI preview + déduplication par adresse+surface+type).

---

### Mode B — API REST (le plus flexible)

**Workflow** :
```
Logiciel métier agence (Apimo/script custom/n8n/Zapier)
→ POST https://api.keymatch-immo.fr/v1/agences/X/annonces
   Authorization: Bearer <api_key>
   Content-Type: application/json
   { titre, ville, prix, surface, photos[], ... }
→ KeyMatch valide + insère + retourne { id, slug }
→ L'annonce apparaît sur keymatch-immo.fr/annonces dans la seconde
```

**Endpoints minimum** :

| Méthode | Path | Action |
|---|---|---|
| POST   | /v1/agences/{id}/annonces           | Créer une annonce |
| PUT    | /v1/agences/{id}/annonces/{ann_id}  | Update (idempotent par external_id) |
| DELETE | /v1/agences/{id}/annonces/{ann_id}  | Archive (set statut=loué_termine) |
| GET    | /v1/agences/{id}/annonces           | List (pour sync delta) |
| POST   | /v1/agences/{id}/annonces/{ann_id}/photos | Upload photo |
| GET    | /v1/agences/{id}/candidatures       | Poll candidatures reçues |
| GET    | /v1/agences/{id}/visites            | Poll visites planifiées |
| GET    | /v1/agences/{id}/messages           | Poll messages reçus |

**Auth** :
- API key par agence générée dans `/agence/dashboard/[id]/api-keys`
- Format : `km_live_<32 chars hex>` (style Stripe)
- Stockée bcrypt en DB (table `agence_api_keys`)
- Scopes : `annonces:read`, `annonces:write`, `candidatures:read`, etc.
- Rate-limit : 100 req/min par clé (réutilise Upstash Redis existant)

**Idempotence** :
- Header `Idempotency-Key: <uuid>` accepté sur POST
- Identifiant externe `external_id` (côté logiciel agence) pour UPSERT
- Évite les doublons si retry réseau

**Versioning** :
- `/v1/` dans l'URL
- Breaking changes → `/v2/`, `/v1/` deprecated 12 mois
- Header `X-KeyMatch-API-Version: 2026-05-18`

**Documentation** :
- OpenAPI v3 spec dans `docs/openapi.yaml`
- Swagger UI publique sur `/api-docs`
- Curl examples + Postman collection
- Pas de SDK officiel pour le MVP (curl + n'importe quel HTTP client suffit)

**Effort dev** : **10-15 jours** (auth, table api_keys, 8 endpoints, OpenAPI, doc page, rate-limit, idempotence, tests).

---

### Mode C — Webhooks (réception events côté agence)

**Workflow** :
```
KeyMatch détecte event (candidature reçue sur annonce X)
→ Fetch les webhooks configurés pour l'agence
→ POST https://<agence-url>/webhook/keymatch
   X-KeyMatch-Signature: sha256=<hmac>
   { event: "candidature.created", data: {...} }
→ Si HTTP 2xx : success. Sinon : retry exponential backoff (1m, 5m, 30m).
→ Après 3 échecs : marqué failed, alerté dans /agence/dashboard.
```

**Events à supporter** :
- `annonce.created` (utilisé pour double-check côté API consumer)
- `annonce.updated`
- `candidature.created` ← **le plus utile** pour CRM agence
- `candidature.accepted`
- `candidature.refused`
- `visite.proposee`
- `visite.confirmee`
- `visite.effectuee`
- `bail.signed`
- `message.received`

**Sécurité** :
- HMAC SHA256 du body avec secret partagé (configuré dans `/agence/.../webhooks`)
- Header `X-KeyMatch-Signature: sha256=<hex>`
- L'agence vérifie côté serveur avant de trust le payload
- Pas de retry sur signature invalide (l'agence a changé son secret)

**Worker delivery** :
- Table `webhook_deliveries` : id, webhook_id, event, payload, attempt, status, last_attempt_at
- Worker async (cron systemd toutes les 30s) qui pop les pending et POST
- TTL retry : 3 tentatives sur 36 minutes max

**Effort dev** : **5-7 jours** (table + worker + UI config + signature + retry logic).

---

### Mode D — Feed Pull (KeyMatch consomme le feed agence)

**Workflow** :
```
Agence configure dans /agence/dashboard/[id]/feed :
  URL: https://apimo.com/feed/agence-12345.xml?key=secret
  Format: apimo
→ KeyMatch crontask horaire : poll cet URL
→ Parse le XML, compare last_modified avec snapshot précédent
→ UPSERT les biens modifiés/nouveaux
→ Marque "soft delete" ceux disparus du feed
→ Email récap "23 biens ajoutés, 5 modifiés, 2 retirés" à l'agence
```

**Formats supportés (priorité ordre)** :
1. **Apimo XML** (couvert ~50% des agences FR avec Apimo)
2. **Hektor XML / Périclès XML** (Century 21, Orpi, ~30%)
3. **CSV générique** avec mapping user-defined
4. ALUR XML (legacy, rare)

**Effort dev** : **5-7 jours** (parsers + cron + snapshot + sync delta + UI config).

---

### Mode E — Connecteurs (intégrations sur étagère)

Plus tard, partenariats avec :
- **Apimo SAS** : intégration native "publier vers KeyMatch en 1 clic" dans
  leur UI agence
- **Périclès Immo** : idem
- **Zapier** : trigger "Nouvelle candidature KeyMatch" + action "Créer annonce KeyMatch"
- **n8n / Make** : connecteurs custom community
- **WordPress** : plugin "KeyMatch Immo Sync" pour syndicate les annonces

**Effort dev** : variable. Apimo/Périclès = négociation business 3-6 mois.
Zapier/n8n = doc tech pour qu'un dev tiers le fasse (gratuit pour KeyMatch).
WP plugin = 5-10 jours.

---

## 4. Recommandation ordre de livraison

**Étape 1 (Phase B) — Upload XML/CSV manuel — 5-7 jours**
- Couvre 80% des agences sans tech
- Aucun risque sécurité (pas d'auth API à gérer)
- Test sur ton compte démo avec 1 fichier Apimo test

**Étape 2 (Phase C) — API REST + webhooks basiques — 10-15 jours**
- Pour agences tech-savvy + dev tiers
- Permet la sync automatique côté agence
- Endpoints CRUD annonces + GET candidatures
- 3 webhooks essentiels : `candidature.created`, `visite.confirmee`, `bail.signed`

**Étape 3 (Phase D) — Feed pull automatique — 5-7 jours**
- Pour agences sans tech, qui ont juste un Apimo : "donne-moi ton URL feed"
- Sync horaire
- Email récap quotidien

**Étape 4 (Phase E) — Partenariats + plugins — long tail**
- Cas par cas selon traction réelle

**Total Phase B+C+D : ~25 jours dev** (3-4 semaines focus). Pas trivial mais
faisable solo si tu veux vraiment attaquer le marché agences.

---

## 5. Modèle économique — comment KeyMatch monétise

### Gratuit pour démarrer (couvre 90% des cas)

- Compte agence : gratuit
- Saisie manuelle annonces : illimité gratuit
- Upload XML/CSV (Phase B) : illimité gratuit
- API REST : 100 req/min gratuit (≈ 6000 req/h, suffisant pour 99% des agences)
- Webhooks : illimités gratuits
- 3 membres max par agence : gratuit

### Payant pour les gros volumes (Phase C+)

| Plan | Prix | Pour qui ? | Inclus |
|---|---|---|---|
| **Pro Agence** | 29€/mois | Agence avec 50+ biens en gestion | API illimitée, 10 membres, support email |
| **Réseau** | 99€/mois | Franchise multi-bureaux | API + sync automatique, membres illimités, branding custom, support prioritaire |
| **Enterprise** | sur devis | Grandes franchises (Foncia, Century 21 HQ) | SLA 99.9%, IP whitelisting, connecteur dédié, account manager |

**Estimation marché réaliste** :
- Si on touche 500 agences en 18 mois → 50 payent Pro (29€) + 5 payent Réseau (99€) = **1950€/mois = 23k€/an**
- Vs Vercel/Supabase qu'on a coupés : -228€/an. Donc l'API agences est vraiment ce qui peut générer du revenu.

**Risque** : SeLoger Pro coûte 200-500€/mois aux agences, donc tu es 10× moins
cher. Le risque c'est plutôt qu'elles te trouvent "pas sérieux" parce que pas cher.
Solution : positionner "Made in France, indépendant, données 100% locales".

---

## 6. Sécurité — points critiques

### API Key management

- Stockée bcrypt cost 10 en DB (jamais en clair)
- Affichée 1× au moment de la création (puis irrécupérable, juste révocable)
- Format : `km_live_xxx` (préfixe pour reconnaître KeyMatch vs autre)
- Rotation : l'agence peut révoquer + générer une nouvelle clé
- Audit log : chaque utilisation logguée (table `agence_api_usage`)

### Rate limiting

- Per-key : 100 req/min (sliding window Redis Upstash)
- Per-IP : 1000 req/min (anti-bot)
- Headers de réponse : `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- HTTP 429 si dépassé + `Retry-After`

### Validation input

- Schémas Zod strict (déjà utilisé dans /api/annonces/create)
- SIRET / carte T jamais modifiable via API (que par admin manuel)
- Pas de mass-create > 50 annonces par appel (anti-abuse)
- Logo upload : 5 MB max, JPG/PNG/WebP

### Webhooks delivery

- Signature HMAC SHA256 obligatoire
- L'agence DOIT vérifier la signature (sinon n'importe qui peut faker un webhook)
- Documentation très claire sur comment vérifier (code samples Node/PHP/Python)

### CORS

- Endpoints API `/v1/*` : Origin `*` autorisée (B2B server-to-server)
- Pas de cookies side, juste Bearer token
- OPTIONS preflight allowlist standard

---

## 7. Doc tech publique — `/api-docs`

Page publique avec :
- Quickstart : "Comment générer ma clé API et créer ma 1ère annonce"
- OpenAPI spec téléchargeable (`/api-docs/openapi.yaml`)
- Swagger UI interactif (testez les endpoints en ligne)
- Code samples par langage (cURL, Node fetch, Python requests, PHP curl)
- Sandbox : environnement test (`api-sandbox.keymatch-immo.fr`) avec données fictives
- Status page : uptime API + rate-limits courants
- Changelog : breaking changes documentés
- Limites & quotas : table claire par plan

---

## 8. Risques business à anticiper

| Risque | Probabilité | Mitigation |
|---|---|---|
| Agences indifférentes (préfèrent SeLoger malgré prix) | Élevée | Positionning "data en France + KYC = dossiers qualifiés" |
| Compétiteur copie l'API → switche les agences | Moyenne | Verrouiller par UX exceptionnelle + qualité KYC |
| Spam API : agence push 10000 fake annonces | Faible | Rate-limit + modération + ban brutal |
| Bug dans API casse les imports d'une grande agence | Moyen | Sandbox + tests E2E + rollback rapide |
| Coût infra augmente (API = + de DB writes) | Faible | Postgres self-host scale jusqu'à 100 agences sans pression |

---

## 9. Questions ouvertes pour Paul

Je propose qu'on tranche ces points avant de coder :

1. **Quel mode démarrer en premier** : Upload XML (le plus pratique pour
   l'agence) ou API REST (le plus orienté dev) ?
2. **Gratuité** : on garde gratuit illimité pour démarrer, ou on pose un
   palier "Pro" (29€) dès le début pour signaler "service sérieux" ?
3. **Sandbox** : on fait un environnement de test séparé `api-sandbox`
   ou les agences testent direct en prod avec des annonces dans un
   compte "demo" ?
4. **OpenAPI spec** : on la maintient à la main ou auto-générée depuis le
   code (avec `zod-to-openapi`) ?
5. **Doc** : page dédiée `/api-docs` ou on délègue à GitBook / ReadMe.com
   externe ?

---

## 10. Plan d'attaque concret

### Sprint 1 (1 semaine) — Upload XML/CSV (Phase B)
- Parsers Apimo + Hektor XML + CSV générique
- UI `/agence/dashboard/[id]/import` avec drag & drop, preview, dédoublonnage
- Cible : 1 agence test importe 20 biens en 5 minutes

### Sprint 2 (2 semaines) — API REST v1 (Phase C minimal)
- Table `agence_api_keys` (id, agence_id, name, key_hash bcrypt, scopes, created, last_used, revoked)
- Page UI `/agence/dashboard/[id]/api-keys` (generate + revoke)
- Endpoints :
  - POST/GET/DELETE `/api/v1/agences/[id]/annonces`
  - GET `/api/v1/agences/[id]/candidatures`
- Rate-limit Upstash per-key
- Tests vitest API key auth + idempotency

### Sprint 3 (1 semaine) — OpenAPI doc + sandbox
- Spec OpenAPI v3 dans `docs/openapi.yaml`
- Page `/api-docs` avec Swagger UI (lazy import client only)
- Code samples curl + Node + Python
- Optionnel : env `api-sandbox.keymatch-immo.fr` (subdomain DNS + Caddy)

### Sprint 4 (1 semaine) — Webhooks basiques
- Table `agence_webhooks` (URL, secret_hmac, events[], active)
- Worker systemd `keymatch-webhook-delivery.service` toutes les 30s
- 3 events : `candidature.created`, `visite.confirmee`, `bail.signed`
- UI `/agence/dashboard/[id]/webhooks` (config + test ping)

**Total ~5 semaines focus solo. Faisable.**

---

## 11. Mon avis pragmatique

Vu que :
- Tu es solo dev pré-launch
- Phase A agences est LIVE depuis aujourd'hui
- 0 agence inscrite encore

**Recommandation** :

1. **Attendre 2-4 semaines** avant d'attaquer l'API. Pendant ce temps :
   - Démarcher 5-10 agences locales pour tester l'inscription manuelle
   - Voir leurs vrais besoins (pas spéculer)
   - Identifier les 2-3 logiciels métier qu'elles utilisent réellement
2. **Quand tu as une agence pilote qui dit "j'ai 80 biens chez Apimo, je
   veux pas les ressaisir"** → là tu codes le parser Apimo XML en 3 jours
   et tu valides avec elle.
3. **Quand tu as 3+ agences qui te demandent "vous avez une API ?"** →
   tu codes Phase C en 2 semaines.

**Évite de coder une API publique sans aucun user qui en a besoin.** C'est
le piège classique du dev solo qui sur-construit.

---

## 12. Si on décide d'y aller quand même MAINTENANT

L'ordre le plus efficace si on attaque dès cette semaine :

1. **Aujourd'hui** : valider avec Paul les 5 questions ouvertes (§9)
2. **Sprint 1** : Upload XML (Phase B) — 5-7 jours
3. **Trouver une agence pilote** pour tester (sinon on code dans le vide)
4. **Sprint 2** : API REST minimal si la pilote demande de la sync automatique
5. **Sprint 3+** : webhooks + feed pull selon retours

---

## 13. Documentation de référence

- OpenAPI v3 spec : https://swagger.io/specification/
- Sentry SDK API : https://docs.sentry.io/api/ (bonne référence d'API B2B)
- Stripe API : https://stripe.com/docs/api (gold standard)
- Plivo / Twilio webhooks : exemples HMAC signatures
- Apimo doc partenaires : https://apimo.com/partenaires (à confirmer accès)
- Hektor / Périclès : doc privée, demander partenariat
