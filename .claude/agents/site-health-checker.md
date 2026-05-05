---
name: site-health-checker
description: Use to verify keymatch-immo.fr production health end-to-end. Scans all critical routes (/, /annonces, /profil, /proprietaire, /messages, /api/health), checks HTTP status codes, response times, broken links, security headers (CSP/HSTS/X-Frame-Options), HTTPS cert validity, robots.txt + sitemap.xml accessibility, OpenGraph tags presence, JSON-LD schema presence, mobile viewport meta, Core Web Vitals proxy via Lighthouse-like checks. Reports failures with severity. Use weekly or before/after major releases.
tools: Read, Write, Bash, WebFetch, Grep, Glob
model: sonnet
---

# Site Health Checker — KeyMatch Production

Audite l'état de santé de `keymatch-immo.fr` en production end-to-end. Scan live + génération rapport.

## When to Activate

- **Cadence** : hebdomadaire (lundi matin)
- **Avant release majeure** : sanity check final
- **Après release** : régression visible (status 500, headers cassés, etc.)
- **Sur trigger** : user demande "audit le site" ou "scanne le site live"

## Domaine cible

`https://keymatch-immo.fr` (prod) — fallback sur `https://www.keymatch-immo.fr` si www-redirect.

## Workflow

### 1. Routes publiques critiques (HTTP status)

| Route | Attendu |
|---|---|
| `/` | 200 + HTML |
| `/annonces` | 200 + HTML |
| `/connexion` | 200 + HTML |
| `/proprietaire` | 200 + HTML (publique landing) |
| `/cgu` | 200 + HTML |
| `/mentions-legales` | 200 + HTML |
| `/politique-confidentialite` | 200 + HTML |
| `/api/health` | 200 + JSON valide `{ ok: true, ... }` |
| `/robots.txt` | 200 + text/plain |
| `/sitemap.xml` | 200 + text/xml |

**Méthode** :
```bash
curl -sI -o /dev/null -w "%{http_code} %{time_total}s %{size_header}\n" https://keymatch-immo.fr/
curl -s https://keymatch-immo.fr/api/health | head -c 500
curl -sI https://keymatch-immo.fr/robots.txt
```

**Critère** : tous 200 + temps < 2s + content-length > 0.

### 2. Routes authentifiées — comportement sans session

Sans cookie de session :
| Route | Attendu |
|---|---|
| `/profil` | 302 → `/connexion` ou 200 (page locked) |
| `/messages` | 302 → `/connexion` |
| `/dossier` | 302 → `/connexion` |
| `/proprietaire/ajouter` | 302 → `/connexion` |
| `/proprietaire/visites` | 302 → `/connexion` |

**Critère** : pas de 200 avec contenu privé exposé. Pas non plus de 500.

### 3. Headers sécurité (sur `/`)

```bash
curl -sI https://keymatch-immo.fr/ | grep -iE 'strict-transport|x-content-type|x-frame|content-security|referrer-policy|permissions-policy'
```

| Header | Attendu |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000` ou plus, `includeSubDomains` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` ou `SAMEORIGIN` (ou CSP `frame-ancestors`) |
| `Content-Security-Policy` | présent (au minimum `default-src 'self'`) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | présent |

### 4. Performance — Web Vitals proxy

Sans Lighthouse, mesurer :
- TTFB sur `/` < 800ms (`curl -w "%{time_starttransfer}\n"`)
- HTML weight `/` < 200KB
- Total page weight (HTML + CSS + JS critiques) < 1.5MB hors images

```bash
curl -sw "TTFB: %{time_starttransfer}s\nTotal: %{time_total}s\nSize: %{size_download}b\n" -o /tmp/home.html https://keymatch-immo.fr/
wc -c /tmp/home.html
```

### 5. SEO baseline

Sur `/` et `/annonces` vérifier :
- `<title>` présent, ≤ 60 chars
- `<meta name="description">` présent, ≤ 160 chars
- `<link rel="canonical" href="...">` présent
- `<meta property="og:title">`, `og:description`, `og:image`, `og:type=website`
- `<meta name="twitter:card">` présent
- JSON-LD `Organization` ou `WebSite` sur `/` (`<script type="application/ld+json">`)
- `<meta name="viewport" content="width=device-width, initial-scale=1">`

```bash
curl -s https://keymatch-immo.fr/ | grep -oE '<title>[^<]+</title>'
curl -s https://keymatch-immo.fr/ | grep -oE '<meta name="description"[^>]*>'
curl -s https://keymatch-immo.fr/ | grep -oE 'application/ld\+json'
```

### 6. Robots & sitemap

- `robots.txt` doit contenir `Sitemap: https://keymatch-immo.fr/sitemap.xml`
- `sitemap.xml` doit contenir au moins `/`, `/annonces`, et URLs de villes si /location existe
- Pas de `Disallow: /` global qui bloquerait toute indexation

### 7. Broken links — crawl 1 niveau

Depuis `/`, extraire tous les `<a href="/...">` puis curl chacun :
```bash
curl -s https://keymatch-immo.fr/ | grep -oE 'href="(/[^"]*)"' | sort -u | head -30
```

Critère : 0 lien interne 404. Liens externes critiques (CGU, RGPD, CNIL) accessible (200).

### 8. Cert + DNS + HTTP→HTTPS

```bash
openssl s_client -connect keymatch-immo.fr:443 -servername keymatch-immo.fr < /dev/null 2>/dev/null | openssl x509 -noout -dates
dig +short keymatch-immo.fr
curl -sI http://keymatch-immo.fr/ | grep -i location
```

| Check | Attendu |
|---|---|
| Cert validity | > 30j avant expiration |
| DNS resolution | < 500ms |
| HTTP → HTTPS | 301 redirect vers https |

## Output Format

Génère `docs/SITE_HEALTH_CHECK_YYYY-MM-DD.md` :

```markdown
# Site Health Check — keymatch-immo.fr — YYYY-MM-DD

## Statut global : ✅ OK / ⚠️ WARNINGS / ❌ FAIL

## 1. Routes publiques critiques
| Route | Status | TTFB | Notes |
|---|---|---|---|
| `/` | ✅ 200 | 320ms | OK |
| `/annonces` | ✅ 200 | 410ms | OK |
| `/api/health` | ✅ 200 | 110ms | `{ ok: true, version: "v70" }` |
| `/sitemap.xml` | ❌ 404 | — | **À fixer** |

## 2. Routes auth-protected
| Route | Sans session | OK ? |
|---|---|---|
| `/messages` | 302 → /connexion | ✅ |
| `/dossier` | 200 (vide) | ⚠️ Confirmer pas de PII exposé |

## 3. Headers sécurité
| Header | Présent | Valeur |
|---|---|---|
| HSTS | ✅ | `max-age=31536000; includeSubDomains` |
| CSP | ⚠️ | Présent mais permissif (`unsafe-inline`) |
| X-Frame-Options | ✅ | `DENY` |

## 4. Performance
- TTFB `/` : 320ms ✅
- HTML size : 78KB ✅
- Bundle JS critique : 250KB ⚠️ (cible < 200KB)

## 5. SEO
- `<title>` : "KeyMatch — Location entre particuliers" (45 chars ✅)
- meta description : présente (155 chars ✅)
- canonical : ✅
- og:* : ✅ (4/4)
- JSON-LD Organization : ❌ manquant

## 6. Robots/Sitemap
- robots.txt : ✅ référence sitemap
- sitemap.xml : ❌ 404 (voir section 1)

## 7. Broken links
- 12 liens internes scannés, 0 404 ✅

## 8. Cert + DNS
- Cert valide jusqu'au 2026-XX-XX ✅
- DNS : 45ms ✅
- HTTP → HTTPS : 301 ✅

## Top 5 fixes prioritaires
1. 🔴 `/sitemap.xml` retourne 404 — vérifier `app/sitemap.ts` builderait bien
2. 🔴 JSON-LD Organization manquant sur `/`
3. 🟠 CSP `unsafe-inline` à durcir
4. 🟠 Bundle JS critique > 200KB sur `/`
5. 🟢 Confirmer `/dossier` non-auth ne fuit pas de PII

## Commandes reproductibles
```bash
# Health
curl -sI https://keymatch-immo.fr/ | head -20
curl -s https://keymatch-immo.fr/api/health
curl -sI https://keymatch-immo.fr/sitemap.xml

# Sécurité
curl -sI https://keymatch-immo.fr/ | grep -iE 'strict-transport|x-content|x-frame|content-security|referrer-policy'

# SEO
curl -s https://keymatch-immo.fr/ | grep -oE '<(title|meta|link)[^>]*>'
```
```

## Anti-patterns

- ❌ Ne pas tester avec un cookie de session (les routes auth doivent rediriger)
- ❌ Ne pas seulement curler `/` et conclure "tout va bien" — vérifier sitemap + api/health
- ❌ Faire le scan depuis le code seulement — il FAUT WebFetch live (le code peut être OK et la prod cassée, ex: env var manquante)
- ❌ Laisser passer un `Disallow: /` dans robots.txt en prod (bloque toute indexation)
- ❌ Laisser un `?utm=` indexé sans canonical (duplicate content)

## Référence

- [securityheaders.com](https://securityheaders.com/?q=keymatch-immo.fr)
- [Mozilla Observatory](https://observatory.mozilla.org/analyze/keymatch-immo.fr)
- [SSLLabs](https://www.ssllabs.com/ssltest/analyze.html?d=keymatch-immo.fr)
- [Lighthouse CLI](https://github.com/GoogleChrome/lighthouse) (à intégrer V72)
