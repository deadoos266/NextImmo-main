# PLAN — Rate-limits Upstash Redis distribués

## 1. Contexte et objectif
`lib/rateLimit.ts` actuel stocke les compteurs en **mémoire process-local** (`Map<string, number[]>`). Vercel = serverless multi-instances : un attaquant qui tape 1000 req/s réparties sur 10 instances passe sous le radar. Remplacer par Upstash Redis serverless (free 10k commandes/jour) pour des compteurs **partagés** entre toutes les instances.

## 2. Audit de l'existant

### Fichier actuel
```
lib/rateLimit.ts  → in-memory Map, pas multi-instance safe
```

### Endpoints consommateurs
```
app/api/account/avatar/route.ts      → avatar:{email}:{ip}
app/api/account/delete/route.ts
app/api/account/change-password/route.ts
app/api/auth/register/route.ts
app/api/contact/route.ts             → contact:ip / contact:email
app/api/dossier/access-log/route.ts  → dossier-access-log:{ip}
app/api/dossier/share/route.ts       → dossier-share:{email} / dossier-share:ip
app/api/signalements/route.ts
app/api/visites/ics/route.ts
```

Chaque appel utilise `checkRateLimit(key, config)`. On garde la même signature.

## 3. Fichiers impactés

| Fichier | Statut | Changement |
|---|---|---|
| `nestmatch/lib/rateLimit.ts` | MODIF | Réécriture : appel Upstash Redis au lieu de Map. Fallback in-memory si Upstash indispo. |
| `nestmatch/lib/rateLimit.test.ts` | **NOUVEAU** | Tests : compteur incrémente, réinitialise, fallback, API signature inchangée. |
| `nestmatch/.env.local.example` | MODIF | Ajouter vars Upstash. |
| `nestmatch/package.json` | MODIF | `@upstash/redis` + `@upstash/ratelimit`. |

## 4. Migrations SQL
**Aucune**. Redis externe.

## 5. Variables d'env

```bash
UPSTASH_REDIS_REST_URL=https://<subdomain>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<token>
```

## 6. Dépendances

```bash
cd nestmatch
npm install @upstash/redis @upstash/ratelimit
```

## 7. Étapes numérotées

### Bloc A — Création du Redis Upstash
1. Aller sur https://console.upstash.com/ → créer compte (Google login possible).
2. Créer nouvelle Redis database :
   - Name : `nestmatch-ratelimit`
   - Region : **Europe (AWS eu-west-1)** — proche de Vercel
   - Plan : **Free** (10k cmd/jour, 256 MB)
   - Eviction : **allkeys-lru**
   - TLS : ON
3. Dans l'onglet "Details" du DB créé, copier :
   - `REST URL`
   - `REST Token`
4. Ajouter dans `nestmatch/.env.local` :
    ```
    UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
    UPSTASH_REDIS_REST_TOKEN=AXXXXX...
    ```

### Bloc B — Réécriture `lib/rateLimit.ts`
5. Remplacer le contenu par :
    ```ts
    import { Ratelimit } from "@upstash/ratelimit"
    import { Redis } from "@upstash/redis"

    /**
     * Rate-limit multi-instance via Upstash Redis (free tier 10k cmd/j).
     * Fallback in-memory si l'env Upstash n'est pas configurée
     * (utile en test local sans internet).
     *
     * Signature identique à l'ancienne version pour compat zero-friction.
     */

    type RateLimitConfig = { max: number; windowMs: number }
    type RateLimitResult = { allowed: boolean; retryAfterSec?: number; remaining: number }

    const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL
    const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
    const UPSTASH_ENABLED = !!(UPSTASH_URL && UPSTASH_TOKEN)

    let redis: Redis | null = null
    if (UPSTASH_ENABLED) {
      redis = new Redis({
        url: UPSTASH_URL!,
        token: UPSTASH_TOKEN!,
      })
    }

    // Cache des Ratelimit instances par config (évite de recréer à chaque call)
    const rlCache = new Map<string, Ratelimit>()
    function getRatelimit(config: RateLimitConfig): Ratelimit | null {
      if (!redis) return null
      const cacheKey = `${config.max}:${config.windowMs}`
      const cached = rlCache.get(cacheKey)
      if (cached) return cached
      const rl = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(config.max, `${config.windowMs} ms`),
        prefix: "nm:rl",
        analytics: false,
      })
      rlCache.set(cacheKey, rl)
      return rl
    }

    // Fallback in-memory (exact même logique que l'ancienne version)
    const memHits = new Map<string, number[]>()
    function checkRateLimitMemory(key: string, config: RateLimitConfig): RateLimitResult {
      const now = Date.now()
      const windowStart = now - config.windowMs
      const prev = memHits.get(key) ?? []
      const kept = prev.filter(t => t > windowStart)
      if (kept.length >= config.max) {
        const oldest = kept[0]
        const retryAfterSec = Math.max(1, Math.ceil((config.windowMs - (now - oldest)) / 1000))
        memHits.set(key, kept)
        return { allowed: false, retryAfterSec, remaining: 0 }
      }
      kept.push(now)
      memHits.set(key, kept)
      return { allowed: true, remaining: config.max - kept.length }
    }

    export async function checkRateLimitAsync(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
      const rl = getRatelimit(config)
      if (!rl) return checkRateLimitMemory(key, config)
      try {
        const { success, remaining, reset } = await rl.limit(key)
        if (!success) {
          const retryAfterSec = Math.max(1, Math.ceil((reset - Date.now()) / 1000))
          return { allowed: false, retryAfterSec, remaining: 0 }
        }
        return { allowed: true, remaining }
      } catch (err) {
        // Si Upstash down, fallback en mémoire pour ne pas bloquer l'app
        console.error("[rateLimit] Upstash error, fallback memory:", err)
        return checkRateLimitMemory(key, config)
      }
    }

    /**
     * Wrapper sync pour rétrocompat avec les API routes existantes qui
     * n'await pas. Renvoie le résultat mémoire immédiat + fire-and-forget
     * Upstash en arrière-plan. **À migrer progressivement vers async.**
     */
    export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
      const mem = checkRateLimitMemory(key, config)
      // Side-effect Upstash en best-effort, non bloquant
      const rl = getRatelimit(config)
      if (rl) rl.limit(key).catch(() => { /* silent fail */ })
      return mem
    }

    /** Extraction IP depuis headers, robuste aux proxies. */
    export function getClientIp(headers: Headers): string {
      const forwarded = headers.get("x-forwarded-for")
      if (forwarded) return forwarded.split(",")[0].trim()
      const real = headers.get("x-real-ip")
      if (real) return real.trim()
      return "unknown"
    }
    ```

### Bloc C — Migration des API routes (progressive)
6. Pour chaque route identifiée en §2 (liste des 9 endpoints), décider :
   - **Garder sync** (`checkRateLimit`) si modification trop risquée. Compat préservée.
   - **Migrer async** (`checkRateLimitAsync`) si route déjà async (99 % le sont en App Router).
7. Migration minimale recommandée : remplacer `checkRateLimit` par `await checkRateLimitAsync` dans toutes les routes. Ce sont déjà des `async function POST(req)` donc pas de refacto lourd.
8. **Exemple** dans `/api/dossier/access-log/route.ts` :
    ```ts
    // AVANT
    const rl = checkRateLimit(`dossier-access-log:${ip}`, { max: 5, windowMs: 60_000 })
    // APRÈS
    const rl = await checkRateLimitAsync(`dossier-access-log:${ip}`, { max: 5, windowMs: 60_000 })
    ```

### Bloc D — Test local
9. `npm run dev` avec `UPSTASH_REDIS_REST_URL` renseigné.
10. Boucle curl sur `/api/contact` POST avec un body valide :
    ```bash
    for i in {1..15}; do curl -X POST http://localhost:3000/api/contact -H "Content-Type: application/json" -d '{"nom":"Test","email":"a@b.c","sujet":"question_generale","message":"Test bla bla bla"}' -w "\n%{http_code}\n"; done
    ```
    → Doit voir `200` les 5 premiers, `429` ensuite.
11. Vérifier Upstash console → Data Browser → clés `nm:rl:contact:ip:127.0.0.1` présentes.

### Bloc E — Tests unitaires
12. Créer `lib/rateLimit.test.ts` :
    ```ts
    import { describe, it, expect, beforeEach } from "vitest"
    import { checkRateLimit } from "./rateLimit"

    describe("checkRateLimit (mémoire fallback)", () => {
      beforeEach(() => {
        // S'assurer qu'Upstash est off pour ce test
        delete process.env.UPSTASH_REDIS_REST_URL
      })
      it("autorise les N premières requêtes", () => {
        const key = `test-${Date.now()}`
        for (let i = 0; i < 5; i++) {
          expect(checkRateLimit(key, { max: 5, windowMs: 1000 }).allowed).toBe(true)
        }
      })
      it("refuse la N+1ème", () => {
        const key = `test-refuse-${Date.now()}`
        for (let i = 0; i < 5; i++) checkRateLimit(key, { max: 5, windowMs: 1000 })
        const res = checkRateLimit(key, { max: 5, windowMs: 1000 })
        expect(res.allowed).toBe(false)
        expect(res.retryAfterSec).toBeGreaterThan(0)
      })
    })
    ```

### Bloc F — Vercel env vars
13. Vercel → Settings → Environment Variables :
    - `UPSTASH_REDIS_REST_URL` → scope Production + Preview + Development
    - `UPSTASH_REDIS_REST_TOKEN` → idem
14. Redeploy.

### Bloc G — Monitoring
15. Upstash console → "Usage" : vérifier commandes restantes (free = 10k/jour).
16. Si dépassement, soit upgrade (0.2 $/100k cmd, négligeable), soit tuner les windowMs plus large pour moins d'écritures.

## 8. Pièges connus

- **Fallback silencieux** : si Upstash down, le code retombe en mémoire et **ne bloque pas** l'app (bien). Mais rate-limit redevient fragile. Monitorer via Sentry les `[rateLimit] Upstash error`.
- **Latence Upstash** : ~50-200 ms par check selon région. Ça s'ajoute à chaque endpoint rate-limité. Acceptable.
- **Sync wrapper** : `checkRateLimit` (sync) renvoie le résultat mémoire immédiat + fire-and-forget Upstash. **Pas idéal** : premier hit d'un nouveau nœud Vercel retournera `allowed` même si Redis indique déjà dépassé. À migrer vers `checkRateLimitAsync` dès que possible.
- **Keys prefix** : `nm:rl:` pour ne pas polluer si le Redis sert à autre chose plus tard.
- **Analytics Upstash** : désactivé ici. Activer si on veut dashboards (coûte x2 cmd).
- **Auto-ban** : Upstash ratelimit lui-même ne bloque pas l'IP, il renvoie juste `success: false`. Notre route doit gérer le 429.
- **Tests locaux** : si `UPSTASH_REDIS_REST_URL` configuré en local, les tests unitaires peuvent polluer le Redis de dev. Les tests doivent `delete process.env.UPSTASH_REDIS_REST_URL` en `beforeEach`.

## 9. Checklist "c'est fini"

- [ ] Compte Upstash créé, DB `nestmatch-ratelimit` provisionnée.
- [ ] `@upstash/redis` + `@upstash/ratelimit` installés.
- [ ] `lib/rateLimit.ts` réécrit avec fallback.
- [ ] `lib/rateLimit.test.ts` créé, 4+ cas, passe.
- [ ] Toutes les API routes existantes passent toujours (pas de signature breaking).
- [ ] Test curl local : après 5 POST `/api/contact`, 429 renvoyé.
- [ ] Upstash console affiche clés `nm:rl:*` après test.
- [ ] Vercel env vars configurées (Production + Preview).
- [ ] `tsc --noEmit` clean, `next build` OK, tests passent.
- [ ] Monitoring Sentry capture erreurs Upstash éventuelles (dépend Plan Sentry).

---

**Plan mixte** :

- ⚠️ **EXÉCUTION OPUS UNIQUEMENT** : Bloc B (réécriture `lib/rateLimit.ts`) — sécurité, fallback critique, edge cases. Si buggé : soit rate-limit 0 (passe tout), soit rate-limit 100% (bloque tout).
- **OK pour Sonnet** : Blocs A (compte), C (migration routes ligne par ligne), D-G (tests, env, monitoring).
