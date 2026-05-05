# Site Health Check — keymatch-immo.fr — 2026-05-06

**Scope** : scan live production end-to-end (HTTP, sécurité, perf, SEO, robots/sitemap, cert, broken links).
**Méthode** : `curl` + `openssl` + `WebFetch` (read-only, sans cookie de session).

## Statut global : WARNINGS

Le site est globalement sain (HTTPS OK, headers solides, /api/health vert, sitemap riche, JSON-LD propre). Trois warnings significatifs :
- CSP en mode **Report-Only** uniquement (pas appliquée)
- `robots.txt` `Disallow: /proprietaire` mais cette route est **publique** (landing 307 → /auth, donc OK fonctionnellement, mais bloque l'indexation d'une future landing publique annoncée dans le sitemap)
- viewport contient `user-scalable=no` + `maximum-scale=1` (anti-pattern accessibilité)

Aucun fail bloquant — pas de 500, pas de PII fuit, pas de cert expiré.

---

## 1. Routes publiques critiques

| Route | Status | Temps | Notes |
|---|---|---|---|
| `/` | OK 200 | 271 ms | HTML 98 KB, TTFB 68 ms |
| `/annonces` | OK 200 | 1747 ms | TTFB 261 ms (latence Supabase ?) |
| `/cgu` | OK 200 | 384 ms | |
| `/mentions-legales` | OK 200 | 392 ms | |
| `/confidentialite` | OK 200 | 442 ms | URL canonique |
| `/cookies` | OK 200 | 410 ms | |
| `/connexion` | WARN 307 | 372 ms | redirect vers `/auth` (alias legacy) |
| `/proprietaire` | WARN 307 | 975 ms | redirect vers `/auth?callbackUrl=...` — **n'est PAS une landing publique** malgré la mention dans la doc agent |
| `/politique-confidentialite` | INFO 404 | 206 ms | URL canonique = `/confidentialite` (404 attendu) |
| `/api/health` | OK 200 | 627 ms | `{status:"ok", supabase:208ms, env:ok}` |
| `/robots.txt` | OK 200 | — | text/plain, 612 bytes |
| `/sitemap.xml` | OK 200 | — | application/xml, 48 KB, **296 URLs** |

**Critère global** : tous les chemins prévus répondent < 2 s. `/annonces` est plus lent (1.7 s, probablement requête liste Supabase) → à profiler.

## 2. Routes auth-protected (sans session)

| Route | Status | Redirect | OK ? |
|---|---|---|---|
| `/profil` | 307 | `/auth?callbackUrl=...%2Fprofil` | OK |
| `/messages` | 307 | `/auth?callbackUrl=...%2Fmessages` | OK |
| `/dossier` | 307 | `/auth?callbackUrl=...%2Fdossier` | OK |
| `/proprietaire/ajouter` | 307 | `/auth?callbackUrl=...%2Fproprietaire%2Fajouter` | OK |
| `/proprietaire/visites` | 307 | `/auth?callbackUrl=...%2Fproprietaire%2Fvisites` | OK |

**Aucune fuite** : toutes les routes privées renvoient 307 vers `/auth` avec `callbackUrl` proprement encodé. Pas de 200 leak, pas de 500.

## 3. Headers sécurité (sur `/`)

| Header | Présent | Valeur |
|---|---|---|
| `Strict-Transport-Security` | OK | `max-age=63072000; includeSubDomains; preload` (2 ans, preload eligible) |
| `X-Content-Type-Options` | OK | `nosniff` |
| `X-Frame-Options` | OK | `DENY` |
| `Referrer-Policy` | OK | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | OK | `camera=(), microphone=(), geolocation=(), interest-cohort=()` |
| `Content-Security-Policy` | **WARN** | Présente uniquement en `Content-Security-Policy-Report-Only` — pas appliquée. `script-src` autorise `unsafe-inline` + `unsafe-eval` |
| `Server` | INFO | `Vercel` (banner exposé, faible impact) |
| `X-Powered-By` | OK | absent |

CSP Report-Only contenu (résumé) :
```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
img-src 'self' data: blob: https://*.supabase.co [+8 hosts];
connect-src 'self' https://*.supabase.co wss://*.supabase.co
            https://*.ingest.sentry.io https://*.upstash.io
            https://geo.api.gouv.fr https://nominatim.openstreetmap.org;
frame-ancestors 'none'; base-uri 'self';
form-action 'self' https://accounts.google.com;
object-src 'none'; upgrade-insecure-requests;
```

**Recommandation** : passer la CSP de `Report-Only` à `Content-Security-Policy` une fois les violations Sentry observées et fixées (`unsafe-inline` reste à vivre tant que Next inline les RSC bootstraps, sauf nonce-based CSP).

## 4. Performance

| Métrique | Valeur | Cible | Statut |
|---|---|---|---|
| TTFB `/` (3 runs) | 68 / 78 / 70 ms | < 800 ms | OK |
| Total `/` | 87–101 ms | < 2 s | OK |
| HTML weight `/` | 98 023 b (96 KB) | < 200 KB | OK |
| TTFB `/annonces` | 261 ms | < 800 ms | OK |
| Total `/annonces` | 1747 ms | < 2 s | WARN |
| Bundle JS critique (top 5 sur `/`) | 4272 = 410 KB, 4bd1b6 = 169 KB, 4401 = 144 KB, layout = 83 KB, 44530001 = 53 KB | < 200 KB chaque | **WARN** chunk 4272 |
| Scripts inline + ext sur `/` | 30 balises `<script>` | < 25 idéal | INFO |

**À surveiller** : chunk `4272-e262d35c1c728bbd.js` à 410 KB → probable Leaflet/MapLibre + lib lourde shipped avec la home alors que la map n'est pas affichée. Candidat dynamic import.

## 5. SEO baseline

### Sur `/`

| Check | Statut | Valeur |
|---|---|---|
| `<title>` | OK | "KeyMatch — Location entre particuliers sans agence" (52 chars) |
| `<meta description>` | OK | 162 chars (légèrement > 160, troncature SERP possible) |
| `<link rel="canonical">` | OK | `https://keymatch-immo.fr` |
| `og:title` | OK | présent |
| `og:description` | OK | présent |
| `og:url` | OK | `https://keymatch-immo.fr` |
| `og:image` | OK | `/og-default.png` 1200x630 + alt |
| `og:type` | OK | `website` |
| `og:site_name` + `og:locale` | OK | `KeyMatch` / `fr_FR` |
| `twitter:card` | OK | `summary_large_image` (+ title/description/image) |
| `viewport` | **WARN** | contient `user-scalable=no, maximum-scale=1` → anti-A11Y, bloque le zoom utilisateur |
| JSON-LD | OK | 2 blocs : `Organization` + `WebSite` (avec `SearchAction` /annonces?ville=...) |

### Sur `/annonces`

| Check | Statut | Valeur |
|---|---|---|
| `<title>` | OK | "Annonces — Logements à louer entre particuliers \| KeyMatch" (60 chars) |
| `<meta description>` | OK | présente, ~155 chars |
| `<link rel="canonical">` | OK | `https://keymatch-immo.fr/annonces` |
| JSON-LD | OK | 2 blocs |

## 6. Robots & sitemap

### `robots.txt`

```
User-Agent: *
Allow: /
Allow: /annonces
Disallow: /admin
Disallow: /api/
Disallow: /profil /messages /visites /carnet /carnet-entretien
Disallow: /dossier /dossier-partage /favoris
Disallow: /proprietaire           ← incohérence vs sitemap
Disallow: /recommandations /mes-candidatures /onboarding
Disallow: /parametres /publier /edl /bail /mon-logement /stats
Disallow: /auth /connexion /login /test /monitoring
Sitemap: https://keymatch-immo.fr/sitemap.xml
```

| Check | Statut | Notes |
|---|---|---|
| Pas de `Disallow: /` global | OK | indexation non bloquée |
| Référence `Sitemap:` | OK | URL absolue correcte |
| Pages sensibles bloquées | OK | admin/api/auth/dossier protégés |
| `/proprietaire` Disallow | WARN | la doc agent attend une landing publique ; aujourd'hui c'est un 307 vers /auth donc le Disallow est cohérent. À aligner si Paul ajoute une vraie landing pour propriétaires. |

### `sitemap.xml`

| Check | Statut | Détail |
|---|---|---|
| XML valide | OK | `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` |
| Nombre d'URLs | OK | **296** entrées `<loc>` |
| `/` priority 1.0 / changefreq daily | OK | |
| `/annonces` priority 0.9 / hourly | OK | |
| Pages légales (cgu, cgv, mentions-legales, confidentialite, cookies) | OK | toutes présentes, priority 0.3 |
| Pages SEO villes `/location/<ville>` | OK | massif (≈ 280 entrées weekly priority 0.7) |
| Pages bloquées par robots dans le sitemap | À vérifier | aucun `/proprietaire` / `/auth` dans le sitemap (vérifié sur les 12 premières + recherche manuelle) |
| `lastmod` | OK | `2026-05-05T21:14:12Z` (build récent) |

## 7. Broken links — crawl 1 niveau depuis `/`

Liens internes uniques extraits du HTML de `/` (hors assets `_next/static`, manifests, icônes) :

| Lien | Status |
|---|---|
| `/annonces` | 200 |
| `/annonces?ville=Bordeaux` | 200 |
| `/annonces?ville=Lyon` | 200 |
| `/annonces?ville=Marseille` | 200 |
| `/annonces?ville=Nantes` | 200 |
| `/annonces?ville=Paris` | 200 |
| `/annonces?ville=Toulouse` | 200 |
| `/auth?mode=inscription` | 200 (page connexion) |

**0 lien interne 404** sur la home.

Tests complémentaires (depuis le sitemap) :

| Lien | Status |
|---|---|
| `/contact` | 200 |
| `/estimateur` | 200 |
| `/cgv` | 200 |
| `/plan-du-site` | 200 |
| `/location/paris` | 200 |
| `/location/lyon` | 200 |
| `/location/marseille` | 200 |
| `/location/toulouse` | 200 |
| `/location/bordeaux` | 200 |
| `/location/nantes` | 200 |

**Observation** : la home ne référence pas explicitement les pages légales (CGU, mentions, confidentialité, cookies, contact) dans son HTML SSR — elles sont probablement dans le footer rendu côté client (vérifier perception SEO côté Googlebot).

## 8. Cert + DNS + HTTP→HTTPS

| Check | Valeur | Statut |
|---|---|---|
| Cert subject | `CN=keymatch-immo.fr` | OK |
| Cert issuer | Let's Encrypt R13 | OK |
| Cert validity | `notBefore=Apr 20 2026` → `notAfter=Jul 19 2026` | **OK** (74 jours restants) |
| Auto-renewal | Vercel-managed | OK (en théorie auto-renouvelle à J-30) |
| DNS resolution | (outil `dig` indisponible dans l'env, mais résolution OK puisque tous les curl répondent) | OK |
| HTTP → HTTPS | `308 Permanent Redirect` vers `https://keymatch-immo.fr/` | OK |
| HSTS preload | `max-age=63072000; includeSubDomains; preload` → eligible https://hstspreload.org | OK |

---

## Top 5 fixes prioritaires

1. **MOYEN — Activer la CSP en mode bloquant**
   La CSP est présente uniquement en `Content-Security-Policy-Report-Only`. Tant que la prod est en beta restreinte, vérifier les rapports Sentry CSP, fixer les violations résiduelles, puis renommer le header en `Content-Security-Policy`. Garder `Report-Only` en parallèle pour itérer.

2. **MOYEN — Bundle JS chunk 4272 = 410 KB**
   `_next/static/chunks/4272-e262d35c1c728bbd.js` pèse 410 KB côté wire (~120 KB gzip). Vraisemblablement Leaflet + MapLibre embarqués sur la home alors que la carte n'est rendue que sur `/annonces`. Action : `dynamic(() => import(...), { ssr: false })` les composants carte.

3. **MOYEN — viewport `user-scalable=no` + `maximum-scale=1`**
   Anti-pattern A11Y (WCAG 1.4.4) : empêche les utilisateurs malvoyants de zoomer. À retirer dans `app/layout.tsx`. Garder seulement `width=device-width, initial-scale=1, viewport-fit=cover`.

4. **FAIBLE — `/annonces` TTFB 261 ms / total 1.7 s**
   La page liste prend 1.7 s en SSR — probablement requête Supabase non-indexée ou liste lourde. Profiler la query et ajouter un index si besoin (ou pagination/streaming RSC).

5. **FAIBLE — meta description home à 162 chars**
   Légèrement au-dessus de la cible 160 chars → tronquée dans certains SERP. Raccourcir à ≤ 155 chars dans le layout root.

### Bonus / À surveiller

- **`Disallow: /proprietaire`** : aujourd'hui cohérent (route 307→auth). Si une vraie landing pro est ajoutée, retirer cette ligne.
- **Cert expire le 2026-07-19** : Vercel auto-renouvelle, mais vérifier qu'aucun lockdown DNS OVH n'empêche le challenge ACME.
- **Pages légales absentes du HTML SSR de `/`** : assurer que le `<footer>` est bien rendu côté serveur (sinon Googlebot ne suit pas les liens — contrôler avec `curl -s / | grep -E 'cgu|mentions|confidentialite'`).

---

## Commandes reproductibles

```bash
# Health check global
curl -s -o /tmp/h.json -w "HTTP=%{http_code} TIME=%{time_total}s\n" https://keymatch-immo.fr/api/health
cat /tmp/h.json

# Routes publiques + temps
for p in / /annonces /connexion /proprietaire /cgu /mentions-legales /confidentialite /cookies; do
  curl -sI -o /dev/null -w "%{http_code} %{time_total}s ${p}\n" "https://keymatch-immo.fr${p}"
done

# Routes privées (doivent toutes 307 vers /auth)
for p in /profil /messages /dossier /proprietaire/ajouter /proprietaire/visites; do
  curl -sI -o /dev/null -w "%{http_code} ${p} -> %{redirect_url}\n" "https://keymatch-immo.fr${p}"
done

# Headers sécurité
curl -sI https://keymatch-immo.fr/ | grep -iE 'strict-transport|x-content|x-frame|content-security|referrer-policy|permissions-policy'

# SEO sur la home
curl -s -o /tmp/home.html https://keymatch-immo.fr/
grep -oE '<title>[^<]+</title>' /tmp/home.html
grep -oE '<meta name="description"[^>]*>' /tmp/home.html
grep -oE '<link rel="canonical"[^>]*>' /tmp/home.html
grep -oE 'application/ld\+json' /tmp/home.html | wc -l

# Robots + sitemap
curl -s https://keymatch-immo.fr/robots.txt
curl -s https://keymatch-immo.fr/sitemap.xml | grep -oE '<loc>[^<]+</loc>' | wc -l

# Cert
echo | openssl s_client -connect keymatch-immo.fr:443 -servername keymatch-immo.fr 2>/dev/null \
  | openssl x509 -noout -dates -issuer -subject

# HTTP -> HTTPS
curl -sI http://keymatch-immo.fr/ | head -5

# Bundle JS critique
for js in $(grep -oE 'src="/_next/static/chunks/[^"]+\.js"' /tmp/home.html | sed 's/src="//;s/"$//'); do
  size=$(curl -sI "https://keymatch-immo.fr${js}" | grep -i 'content-length' | awk '{print $2}' | tr -d '\r')
  echo "${size} ${js}"
done | sort -rn | head -10
```

---

**Auteur** : agent `site-health-checker`
**Date scan** : 2026-05-06
**Domaine** : `https://keymatch-immo.fr`
**Mode** : read-only (pas de cookie de session, pas de POST)
