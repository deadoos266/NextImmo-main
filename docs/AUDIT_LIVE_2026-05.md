# Audit live keymatch-immo.fr — 2026-05-07

Audit réel du site en production via `curl` HEAD/GET, contre les claims des
récaps V71 → V74.

## ⏱️ Update post-V75.1 (push c0fbbc3a)

Le commit V75.1 (fix wrapHandler TypeScript qui bloquait le build Vercel
depuis 25h) a été push avec succès sur `origin/main` à 22h35 UTC. Build
Next.js local validé (✅ tous les commits V71-V74 inclus).

**Re-audit live à 22h45 UTC (10 min après push)** :

| URL | HTTP | État |
|-----|------|------|
| `/og-default.png` | 404 | ❌ TOUJOURS CASSÉ |
| `/status` | 404 | ❌ TOUJOURS CASSÉ |
| `/api/health/full` | 404 | ❌ TOUJOURS CASSÉ |
| `/admin/health` | 307 → /auth | ❌ TOUJOURS CASSÉ (route admin existante prend le path) |
| `/api/admin/incidents/create` | 404 | ❌ TOUJOURS CASSÉ |
| `/robots.txt` body | `Allow: /` | ❌ V71.0 noindex toujours absent |
| `/` `Age` header | encore +6 min sans baisser | Build Vercel pas re-déclenché |

**Conclusion : Vercel n'a PAS redéployé après le push V75.1.**

Le poll Age sur `/` montre une augmentation continue (91259s → 91562s sur
6 min de poll = juste l'âge qui avance, pas de nouveau build qui resette).

→ **Action user OBLIGATOIRE** :
1. Aller sur https://vercel.com/[ton-org]/keymatch dashboard
2. Vérifier le statut du deployment pour le commit `c0fbbc3a`
3. 3 cas possibles :
   - **Building/Queued** → patienter 1-3 min, puis re-poll
   - **Failed** → lire logs (autre erreur TS/build à fixer)
   - **Pas listé du tout** → webhook GitHub→Vercel cassé, à reconnecter
4. Si nécessaire, trigger un redeploy manuel : "..." menu → Redeploy →
   décocher "Use existing Build Cache"

**Sans cette action manuelle, les 24 commits V71-V74 + V75.1 restent
inaccessibles user.**

---

## 🔴 DIAGNOSTIC PRINCIPAL — DEPLOYEMENT FIGÉ

**TOUS les commits V71 → V74 (24 commits sur main) ne sont PAS en prod.**

Preuves :
- `Last-Modified` 404 page : `Tue, 05 May 2026 22:41:08 GMT` (= build du 5 mai)
- `Age` home : **90029 s ≈ 25 h** de cache (donc le build courant date d'au
  moins 25 h)
- `<meta name="robots" content="index, follow"/>` ← V71.0 noindex absent
- `<meta name="viewport" content="...maximum-scale=1, user-scalable=no"/>`
  ← V73.6 WCAG zoom absent
- robots.txt : `Allow: /` + Disallow individuels ← V71.0 `Disallow: /`
  global absent
- /og-default.png 404 ← V72.1c PNG absent
- /status 404 ← V71.5 page absente
- /api/health/full 404 ← V71.4 route absente
- mentions-légales : pas de "Médiation" / "R.631-3" ← V72.1a sections absentes
- /annonces : pas de "Plus populaires" ← V73.4 tri absent

**Cause probable** : Vercel auto-deploy depuis main désactivé OU build
silencieusement échoué OU domain pointe vers une preview gelée.

**Action user requise** : checker https://vercel.com/[org]/keymatch dashboard
→ section "Deployments" pour voir si les commits récents apparaissent +
quel est leur statut (Building / Failed / Ready). Trigger un re-deploy
manuel si bloqué.

---

## 📊 Score réel

| Catégorie | OK | KO | Non testable |
|---|---|---|---|
| URLs publiques | 7 | 5 | — |
| Headers V71.0 noindex | 0 | 4 | — |
| Features V71-V74 dans HTML | 1* | 8 | 4 (auth/swipe/responsive) |

\* "Mes critères" pill détecté mais c'est la pill liste pré-V70 (pas la pill
overlay carte V73.3 qui aurait eu un wrapper différent).

**Ratio claims V71-V74 vraiment en prod : ~5 % (le reste figé sur build du
5 mai ou avant).**

---

## ✅ Ce qui marche en prod (build figé pré-V71)

| URL | HTTP | Note |
|---|---|---|
| https://keymatch-immo.fr/ | 200 | Hero original (pas RSC V71.2) |
| https://keymatch-immo.fr/annonces | 200 | Sans tri populaire V73.4 |
| https://keymatch-immo.fr/profil | 307 → /auth | Redirect normal (pas de session) |
| https://keymatch-immo.fr/messages | 307 → /auth | Redirect normal |
| https://keymatch-immo.fr/dossier | 307 → /auth | Redirect normal |
| https://keymatch-immo.fr/proprietaire | 307 → /auth | Redirect normal |
| https://keymatch-immo.fr/admin/health | 307 → /auth | Page V71.6 N'EXISTE PAS — c'est /admin/* qui matche le admin layout existant et redirect |
| https://keymatch-immo.fr/robots.txt | 200 | Body : ALLOW: / (V71.0 NON DÉPLOYÉ) |
| https://keymatch-immo.fr/api/health | 200 | Ancienne route V64 (pas /full V71.4) |
| https://keymatch-immo.fr/sitemap.xml | 200 | URLs présentes (V71.0 vide NON DÉPLOYÉ) |
| https://keymatch-immo.fr/cgu | 200 | OK pré-V72 |
| https://keymatch-immo.fr/mentions-legales | 200 | OK pré-V72 (sans Médiation conso V72.1a) |
| https://keymatch-immo.fr/confidentialite | 200 | URL canonique (pas /politique-confidentialite) |
| https://keymatch-immo.fr/auth | 200 | URL canonique (pas /connexion ni /inscription) |
| https://keymatch-immo.fr/connexion | 307 → /auth | Redirect existant |

### Headers sécurité présents
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` ✅
- `X-Content-Type-Options: nosniff` ✅
- `X-Frame-Options: DENY` ✅
- `Referrer-Policy: strict-origin-when-cross-origin` ✅
- `Permissions-Policy: camera=(), microphone=()...` ✅
- `Content-Security-Policy-Report-Only: ...` ✅
- `Server: Vercel` ✅ (Edge prod confirmé)

---

## 🔴 Ce qui ne marche pas

### 1. `X-Robots-Tag: noindex, nofollow` ABSENT du `/`
**Symptôme** : header HTTP non présent dans la réponse de `/`.
**Hypothèse** : `next.config.js` headers V71.0 pas dans le build actif.
**Fix V75.1** : forcer un re-deploy Vercel après vérification dashboard.

### 2. `<meta name="robots" content="noindex...">` ABSENT
**Symptôme** : HTML home contient `<meta name="robots" content="index, follow"/>`.
**Hypothèse** : `app/layout.tsx` V71.0 (qui lit `NO_INDEX` depuis
`lib/featureFlags.ts`) pas dans le build actif.
**Conséquence** : le site est INDEXABLE par Google/GPTBot/etc. malgré la
demande user.
**Fix V75.1** : re-deploy Vercel.

### 3. `/og-default.png` 404
**Symptôme** : `Content-Type: text/html` (page 404 servie), pas l'image PNG.
**Hypothèse** : le commit V72.1c (`27d2d262`) qui a ajouté
`nestmatch/public/og-default.png` n'est pas dans le build.
**Conséquence** : tous les partages sociaux (Slack/WhatsApp/iMessage/Twitter/
LinkedIn) retournent une image 404 → preview cassée.
**Fix V75.1** : re-deploy Vercel.

### 4. `/status` 404
**Symptôme** : `X-Matched-Path: /404`.
**Hypothèse** : commit V71.5 (`856158e1`) qui a ajouté `app/status/page.tsx`
pas dans le build.
**Fix V75.1** : re-deploy Vercel.

### 5. `/api/health/full` 404
**Symptôme** : 404, pas le JSON 5 services attendu.
**Hypothèse** : commit V71.3+V71.4 (`9c29b1d1`) qui a ajouté la route pas
dans le build.
**Fix V75.1** : re-deploy Vercel + appliquer migration 063 (sinon route
fonctionnera mais persistera vide).

### 6. /robots.txt en mode pré-V71.0
**Symptôme** : body contient `Allow: /` au lieu de `Disallow: /`.
**Hypothèse** : `app/robots.ts` V71.0 pas dans le build.
**Conséquence** : robots.txt invite Google à indexer le site.
**Fix V75.1** : re-deploy Vercel.

### 7. /sitemap.xml peuplé (au lieu d'être vide V71.0)
**Symptôme** : 30+ URLs listées.
**Hypothèse** : `app/sitemap.ts` V71.0 pas dans le build.
**Conséquence** : Google reçoit des URLs à crawler malgré la demande noindex.
**Fix V75.1** : re-deploy Vercel.

### 8. `/inscription` 404 (mais c'était une mauvaise URL dans mon récap)
**Symptôme** : 404. La vraie route est `/auth?mode=inscription`.
**Cause** : claim incorrecte dans mon récap V74. Pas un bug code.
**Fix** : noter que l'URL canonique d'inscription est `/auth?mode=inscription`.

### 9. `/politique-confidentialite` 404 (mauvaise URL dans mon récap)
**Symptôme** : 404. La vraie route est `/confidentialite` (qui répond 200).
**Cause** : claim incorrecte dans mon récap V74.
**Fix** : noter l'URL canonique `/confidentialite`.

### 10. Mentions légales — section Médiation conso ABSENTE
**Symptôme** : grep "Médiation|R.631-3|L.611-1" sur le HTML de
/mentions-legales = 0 match.
**Hypothèse** : commit V72.1 (`27d2d262`) qui a ajouté ces sections pas
dans le build.
**Fix V75.1** : re-deploy Vercel.

### 11. /annonces — option "Plus populaires" ABSENTE
**Symptôme** : grep "Plus populaires|Populaires" sur HTML /annonces = 0 match.
**Hypothèse** : commit V73.4 (`e4ca1ee8`) pas dans le build.
**Fix V75.1** : re-deploy Vercel.

### 12. Viewport `user-scalable=no` toujours actif
**Symptôme** : HTML home contient `maximum-scale=1, user-scalable=no`.
**Hypothèse** : commit V73.6 (`76cad75a`) pas dans le build.
**Conséquence** : WCAG 1.4.4 violé.
**Fix V75.1** : re-deploy Vercel.

### 13. Aucun JSON-LD WebPage / ItemList sur /
**Symptôme** : grep `"@type":"..."` retourne uniquement Organization, WebSite,
ImageObject, EntryPoint, SearchAction (pas de WebPage ni ItemList).
**Hypothèse** : commit V71.2 (`8697a4f1`) RSC migration pas dans le build.
**Conséquence** : SEO/AEO IA-search dégradé.
**Fix V75.1** : re-deploy Vercel.

### 14. Cookie banner V72.1 — texte "6 mois" absent
**Symptôme** : grep "6 mois|Tout refuser|cookies pour" sur HTML home = 0
match (banner est probablement client-only et MountedOnly, donc absent du
SSR HTML — pas un bug en soi mais difficile à valider sans Playwright).
**Statut** : ⚠️ NON TESTABLE depuis SSR (cf. section ⚠️).

---

## ⚠️ Ce qui n'est pas testable depuis serveur

Features qui requièrent un navigateur réel :

- **Recherche annonces tap mobile (V72.1b)** — gesture tactile
- **Singleton modals (V72.1d)** — interaction 2 modals
- **Composer messages opaque (V72.1e)** — visuel scroll iOS
- **Header anti-jitter (V72.1f)** — animation scroll iOS
- **Drawer admin pill (V72.1c)** — burger ouvert mobile
- **Cookie pill bottom-right (V72.2e)** — banner visible 1ère visite
- **Burger drawer dvh (V72.2f)** — comportement scroll iOS
- **Notif × croix (V72.2d)** — dropdown notifs ouvert
- **Notif swipe-left (V73.1b)** — gesture tactile
- **Logo compact (V72.3c)** — viewport mobile
- **Photo placeholder (V72.3f)** — annonce sans photos
- **Profil critères mobile (V73.2)** — viewport mobile + auth
- **Carte toggle "Mes critères" (V73.3)** — vue carte annonces + auth
- **Bottom nav mobile (V73.9)** — viewport mobile + auth
- **Conv swipe-row (V74.1)** — gesture + sidebar messages auth
- **TopChrome (V74.3)** — wrapper sémantique vs DOM mounts séparés
- **Modal Z_INDEX (V74.5)** — interaction modal+drawer

**Verdict** : sans déploiement actif des commits V71-V74, ces features ne
peuvent même PAS être testées en navigateur (les fichiers ne sont pas servis).

---

## 🎯 Action prioritaire V75.1 — DEBLOCK DEPLOYMENT

1. **Aller sur Vercel dashboard** (https://vercel.com/[org]/keymatch ou
   équivalent) section "Deployments".
2. **Vérifier statut des derniers commits** (`4a0633a2` V74.2 doc,
   `32947a22` V74.3, `2bfc4c9c` V74.1, etc.).
3. Si les commits sont **listés mais "Failed"** : lire les logs build,
   probable erreur TypeScript ou runtime.
4. Si les commits sont **"Building" depuis 1h+** : annuler et relancer.
5. Si les commits **n'apparaissent pas** : vérifier que le webhook GitHub →
   Vercel est connecté (Settings > Git > GitHub).
6. **Force redeploy** : depuis le dashboard, cliquer "..." sur le dernier
   deployment ready → "Redeploy" en cochant "Use existing Build Cache: NO".

**Sans ce déblocage, toutes les features V71-V74 restent inaccessibles user.**

---

## 📝 Bonus — claims à corriger dans mes récaps

Mes récaps V72-V74 contenaient des liens incorrects que le user m'avait
demandé de vérifier :

| Lien envoyé | Statut | Vraie URL |
|---|---|---|
| `/politique-confidentialite` | 404 | `/confidentialite` |
| `/inscription` | 404 | `/auth?mode=inscription` |
| `/api/health/full` | 404 | (route à déployer V75.1) |
| `/og-default.png` | 404 | (image à déployer V75.1) |
| `/status` | 404 | (page à déployer V75.1) |
| `/admin/health` | 307 → /auth | (page à déployer V75.1) |

À l'avenir : tester chaque URL avant de la promettre dans un reporting.
