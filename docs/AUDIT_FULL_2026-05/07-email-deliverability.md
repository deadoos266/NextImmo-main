# Email Deliverability Audit — keymatch-immo.fr — 2026-05-06

Audit complet de la chaîne email transactionnelle KeyMatch (Resend) selon la méthodologie `email-deliverability-auditor` (7 dimensions) + Gmail/Yahoo bulk sender 2024.

Auditeur : agent `email-deliverability-auditor`. Mode read-only.

Vérifications DNS en live (DoH Google `dns.google/resolve`) sur :
- `keymatch-immo.fr` (TXT, MX)
- `_dmarc.keymatch-immo.fr` (TXT)
- `resend._domainkey.keymatch-immo.fr` (TXT)
- `send.keymatch-immo.fr` (TXT, MX — sous-domaine return-path Resend/SES)

Code audité :
- `nestmatch/lib/email/resend.ts` (wrapper sendEmail)
- `nestmatch/lib/email/templates.ts` (1727 lignes, 23 templates)
- `nestmatch/lib/notifPreferences.ts` + `notifPreferencesServer.ts` (opt-out granulaire)
- 27 routes API qui envoient des emails (auth, messages, notifications, visites, bail, candidatures, dossier, loyers, crons)
- `nestmatch/vercel.json` (14 crons dont 6 envoient des emails)

---

## Score global : **74/100**

Bonnes nouvelles d'entrée :
- Authentification email solide (SPF subdomain Resend OK + DKIM publié + DMARC présent).
- Templates en HTML inline + tables, design propre, ratio texte/image excellent (logo SVG seul).
- Garde-fous robustes côté code : guard self-email V50.1, opt-out granulaire 30+ events, rate-limits 30/h sur dispatcher, fallback graceful sans `RESEND_API_KEY`, idempotence quittance/loyers-retard via flags `notified_*_at`.
- `RESEND_API_KEY` correctement gitignorée (`nestmatch/.gitignore` couvre `.env*.local`, `git ls-files` confirme non tracké).

Mais avant de pousser à >1000 emails/jour, **5 fixes prioritaires** (cf. § final) :
- 🔴 DMARC en `p=none` → durcir à `p=quarantine` une fois confiance acquise.
- 🔴 Aucun header `List-Unsubscribe` ni `List-Unsubscribe-Post: One-Click` (RFC 8058) — exigence Gmail/Yahoo bulk sender 2024.
- 🟠 SVG inline rendu cassé sur Outlook desktop (le logo s'affiche en alt text seul).
- 🟠 `loyers-retard` cron envoie à la chaîne sans throttle Resend (risque 429 si plus de 10/sec).
- 🟠 Pas de gestion de bounces (webhook Resend `email.bounced` non câblé) ni suppression list automatique.

Détail :

| Bloc | Score | Pondération |
|---|---|---|
| 1. DNS Auth (SPF/DKIM/DMARC) | 16/20 | DMARC `p=none` est trop laxiste pour 1k+/j |
| 2. Gmail/Yahoo bulk requirements 2024 | 8/15 | List-Unsubscribe-Post manquant |
| 3. Blacklists | 13/15 | Vérif live impossible via WebFetch (mxtoolbox bloque) — domaine récent + reputation Resend OK |
| 4. HTML rendering cross-client | 11/15 | Logo SVG inline cassé Outlook desktop ; emojis ✓ et 📍 dans 3 sujets |
| 5. Spam score | 13/15 | Score estimé < 2/5 (pas de mots-clés trigger, ratio texte/image excellent) |
| 6. Reputation domain | 7/10 | Postmaster Tools / SNDS pas configurés — domaine neuf |
| 7. Content compliance + RGPD | 6/10 | "Gérer mes notifications" présent ; pas de mentions légales footer ni DPO ; Reply-To OK |

---

## 1. DNS Authentification : 16/20

### SPF (apex)

```
keymatch-immo.fr.    IN TXT    "v=spf1 include:mx.ovh.com -all"
```

✅ SPF présent
✅ Qualifier strict `-all`
🟠 **N'inclut PAS Resend directement.** Mais OK car :

### Return-path Resend (subdomain pattern)

```
send.keymatch-immo.fr.   IN TXT   "v=spf1 include:amazonses.com ~all"
send.keymatch-immo.fr.   IN MX 10 feedback-smtp.eu-west-1.amazonses.com.
```

✅ Resend route les bounces via le sous-domaine `send.keymatch-immo.fr` (Resend = wrapper AWS SES). C'est la config recommandée par Resend, et ça fonctionne avec l'alignement `relaxed` DMARC tant que le DKIM signe `keymatch-immo.fr`.

⚠️ Le qualifier sur le sous-domaine est `~all` (soft fail) au lieu de `-all` — c'est la valeur fournie par Resend par défaut, à laisser tel quel (Resend l'exige pour ses retries internes). Ne pas durcir.

### DKIM

```
resend._domainkey.keymatch-immo.fr.    IN TXT    "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCpiJMy..."
```

✅ Clé DKIM Resend publiée (1024 bits — défaut Resend, suffisant)
✅ Sélecteur `resend` standard
✅ Alignment DKIM avec From: domain (= `noreply@keymatch-immo.fr`) ⇒ DMARC pass

### DMARC

```
_dmarc.keymatch-immo.fr.    IN TXT    "v=DMARC1; p=none;"
```

✅ DMARC déclaré
🔴 **Policy `p=none`** — l'authentification est observée mais pas appliquée. Gmail tolère `p=none` mais pour bulk sender ≥ 5000/jour ils recommandent `p=quarantine` au minimum.
🔴 **Pas de `rua=`** (rapport agrégé) ni `ruf=` (rapport forensique). Sans `rua`, on ne peut pas détecter qu'un usurpateur envoie en se faisant passer pour `keymatch-immo.fr`.

**Action recommandée (après 2 semaines de monitoring rua) :**
```
v=DMARC1; p=quarantine; rua=mailto:dmarc@keymatch-immo.fr; ruf=mailto:dmarc@keymatch-immo.fr; fo=1; adkim=r; aspf=r; pct=100
```

### Synthèse Auth

| Check | État |
|---|---|
| SPF apex présent | ✅ |
| SPF subdomain Resend (return-path) | ✅ |
| DKIM publié + alignment | ✅ |
| DMARC publié | ✅ |
| DMARC `p=quarantine` ou plus | 🔴 actuellement `p=none` |
| DMARC `rua=` configuré | 🔴 absent |
| BIMI (logo dans Gmail) | 🔴 absent (nice-to-have, demande VMC certificate ~$1k/an) |

---

## 2. Gmail/Yahoo bulk sender requirements 2024 : 8/15

Depuis février 2024, Gmail et Yahoo imposent pour ≥ 5000 emails/jour vers leurs domaines :

| Exigence | État KeyMatch |
|---|---|
| SPF aligné | ✅ via DKIM (subdomain pattern) |
| DKIM signé sur From: domain | ✅ |
| DMARC publié (au moins `p=none`) | ✅ |
| Header `List-Unsubscribe: <mailto:...>, <https://...>` | 🔴 **ABSENT** dans `lib/email/resend.ts` |
| Header `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) | 🔴 **ABSENT** |
| Lien désinscription visible dans le body | 🟠 partial — "Gérer mes notifications" en footer mais pointe vers `/parametres?tab=compte#notifications-email` (login requis), pas un lien direct one-click |
| TLS pour SMTP | ✅ Resend default |
| PTR record sending IP | ✅ Resend gère |
| Spam complaint rate < 0.3% | 🟡 inconnu — pas de monitoring |

**Pourquoi c'est critique** : Resend envoie quotidiennement le digest messages (`messages-digest`, 8h, possiblement N users) + candidatures-digest (8h, proprios) + loyers-retard (8h, J+5 et J+15) + post-bail (10h) + visites-rappel (9h). À l'usage, KeyMatch va vite franchir 1000+/jour. Sans `List-Unsubscribe-Post`, Gmail commence à mettre en spam une fraction des emails.

**Code actuel** (`lib/email/resend.ts` lignes 64-74) :
```ts
const res = await resend.emails.send({
  from: `${fromName} <${from}>`,
  to,
  replyTo,
  subject,
  html,
  text,
  tags,
  attachments,
})
```
**Aucun `headers` passé.** Resend supporte `headers: { "List-Unsubscribe": "...", "List-Unsubscribe-Post": "..." }` natif.

**Fix proposé** (à faire dans `sendEmail`) :
```ts
const unsubUrl = `${process.env.NEXT_PUBLIC_URL}/api/email/unsubscribe?email=${encodeURIComponent(to)}&t=<HMAC>`
const res = await resend.emails.send({
  from: `${fromName} <${from}>`,
  to,
  replyTo,
  subject,
  html,
  text,
  tags,
  attachments,
  headers: {
    "List-Unsubscribe": `<mailto:unsubscribe@keymatch-immo.fr>, <${unsubUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  },
})
```
Et créer `app/api/email/unsubscribe/route.ts` qui fait toggle `notif_preferences[*] = false` (peut être tag-aware via le query param `category`).

---

## 3. Blacklists : 13/15

**Vérif live impossible** : `mxtoolbox.com/blacklists.aspx` n'expose pas de JSON public et bloque WebFetch. Recommandation : check manuel régulier sur :
- https://mxtoolbox.com/blacklists.aspx?domain=keymatch-immo.fr
- https://www.dnsbl.info/dnsbl-domain-check.php (recherche `keymatch-immo.fr`)
- https://multirbl.valli.org/dnsbl-lookup/keymatch-immo.fr.html

**Heuristique** :
- Domaine `keymatch-immo.fr` : récent (renomé depuis NestMatch en avril 2026), historique inexistant côté blacklists.
- Sending IPs : Resend pool partagé (réputation collective AWS SES eu-west-1) — généralement OK.
- Aucun signal sortant suspect dans le code (pas de bulk envoi non sollicité, opt-out OK).

**Risque détecté** : si un user spamme via `/api/notifications/event` (rate-limit 30/h/from couvre), ou si un cron envoie des doublons (loyers-retard a anti-spam `notified_retard_at`, OK), Resend peut suspendre le domaine.

**Action** : abonner KeyMatch aux Resend Webhooks `email.complained` et `email.bounced` pour réagir avant qu'une blacklist agisse. Pas câblé actuellement.

---

## 4. HTML rendering cross-client : 11/15

**Templates audités** : 23 templates, structure commune via `wrap()` dans `templates.ts`.

✅ Bonne base :
- DOCTYPE HTML5 + `<meta charset>` + `<meta viewport>` (lignes 63-67)
- Layout 100% table-based (compatible Outlook 2007+)
- `max-width: 560px` (sous le 600px standard)
- Boutons CTA en table (`<table>` avec `td` background) — pas de `border` sur `<a>`
- Ratio texte/image excellent (1 logo SVG, pas d'image lourde)
- Footer avec preview text caché (`display:none` + `mso-hide:all`)
- `<meta name="x-apple-disable-message-reformatting">` (ligne 68)
- Inline CSS uniquement (pas de `<style>` ni `<link>`)
- Colors palette cohérente, dark mode-tolérante (`#111` text, `#F7F4EF` bg)

🟠 Problèmes détectés :

1. **SVG inline non supporté Outlook desktop 2016/2019/365** (lignes 41-58, fonction `logoSvg`) :
```ts
function logoSvg(id: string, size = 44): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" ...>`
}
```
Outlook utilise Word renderer, qui ignore SVG. Conséquence : sur Outlook desktop, le logo n'apparaît pas et ne montre pas non plus l'`alt` (Word ignore aussi). Le mot "KeyMatch" reste affiché en texte (fallback OK), mais visuellement faible.

**Fix** : remplacer par une image PNG hébergée (ex: `https://keymatch-immo.fr/logo-email-100x100.png`) avec `alt="KeyMatch"` et `width/height` explicites. Le PNG existe déjà via `lib/brandPDF.ts` (cf. `BRAND.colors`).

2. **Emojis dans des sujets et bodies** :
   - `bailFinalActifTemplate` ligne 508 : `<h1>✓ Votre bail KeyMatch est actif</h1>` + sujet `✓ Votre bail KeyMatch est actif — ${params.bienTitre}` (line 566)
   - `visiteConfirmeeTemplate` line 758 : `📍 ${params.adresse}`
   - `visiteRappelTemplate` line 1242 : `📍 ${params.adresse}`

   Sur Outlook desktop / Apple Mail anciens, ces emojis peuvent s'afficher comme `?`. Soft-impact (pas d'invalidation), mais le projet a une règle stricte "pas d'emojis en pages publiques" (cf. `feedback_no_emojis_public.md`). À aligner.

3. **Inline `<svg>` dans le logo** est aussi le seul élément qui pourrait déclencher des règles de sanitization Gmail (qui blacklist parfois `<defs>`). Pas observé en pratique mais marginal.

4. **`white-space: pre-wrap`** dans `newMessageTemplate` (ligne 263) — supporté Gmail/Apple Mail/Outlook 365 web mais pas Outlook desktop ancien (rendu sur 1 ligne). Acceptable.

5. ✅ Pas de `position: fixed/absolute`, pas de `@font-face`, pas de JS, pas de background-image — RAS.

---

## 5. Spam score (SpamAssassin estimation) : 13/15

Score estimé manuellement < 2.0/5 (on n'a pas pu lancer Mail-tester via WebFetch). Détail :

| Trigger SpamAssassin | Présent ? |
|---|---|
| "Cliquez ici" / "click here" | ❌ (utilise des libellés actions : "Choisir un créneau →") |
| "GRATUIT" / "FREE" en majuscules | ❌ (uniquement "gratuitement" en bas casse, contexte légitime) |
| "URGENT" / "ACT NOW" / "Action requise" | 🟡 `loyerRetardLocataireTemplate` ligne 1138 utilise "Action requise" en sujet quand `isFinal=true` (J+15). C'est légitime mais peut peser +0.5 sur SpamAssassin |
| ≥ 3 exclamations sujet | ❌ (jamais) |
| > 30% majuscules dans sujet | ❌ |
| Lien raccourci (bit.ly etc.) | ❌ (tous les liens vers `keymatch-immo.fr`) |
| Image-to-text ratio > 60% | ❌ (1 logo SVG ~500 octets / texte massif → ratio ~5%) |
| Pièce jointe .zip/.exe | ❌ (PDF + ICS uniquement) |
| Domaines tiers non-cohérents | ❌ (tous CTA → keymatch-immo.fr) |
| Reply-To absent / inexistant | ✅ `RESEND_REPLY_TO=support@keymatch-immo.fr` configuré |
| `From:` cohérent | ✅ `KeyMatch <noreply@keymatch-immo.fr>` |
| HTML mais pas de version texte | ❌ tous les templates fournissent `text` (très bonne pratique) |

**Score Mail-tester estimé : 9/10 ou 10/10** une fois le List-Unsubscribe ajouté.

---

## 6. Reputation domain : 7/10

| Check | État |
|---|---|
| Domaine actif depuis | ~3 semaines (rebrand keymatch-immo.fr du 19 avril 2026) |
| Sender Score (Cisco Talos) | non testé |
| Google Postmaster Tools configuré | 🔴 non — à configurer dès 100+ emails/j vers @gmail.com |
| Microsoft SNDS (Outlook reputation) | 🔴 non — à configurer si users @outlook.com / @hotmail.com |
| Resend dashboard monitoring | ✅ disponible (delivery rate, bounce rate, complaint rate) |
| Warmup IP/domain | 🟡 non géré explicitement, mais Resend pool partagé + volume actuel faible (< 100/j) → pas critique |

**Action** : configurer Google Postmaster Tools (gratuit, 5 min) avant la première campagne ≥ 1000 emails. URL : https://postmaster.google.com/managedomains

---

## 7. Content compliance + RGPD : 6/10

✅ Fait :
- Footer "Vous recevez cet email car vous avez un compte KeyMatch" (template wrap, ligne 146)
- Lien "Gérer mes notifications" → `/parametres?tab=compte#notifications-email` (ligne 149)
- Opt-out granulaire 30+ events via `notif_preferences` (`lib/notifPreferences.ts`)
- `Reply-To: support@keymatch-immo.fr` (cohérent, monitorable)
- Mention article 1366 Code civil + eIDAS dans les templates bail (légalité de la signature électronique)
- Pas d'envoi non sollicité (tous les emails déclenchés par action user ou jalon contractuel)
- Self-email guard V50.1 (anti-spam involontaire)

🟠 À améliorer :
- Pas de **mentions légales** dans le footer email (raison sociale, SIREN, adresse, DPO contact). Pour transactionnels c'est toléré, mais à ajouter avant lancement public.
- **Pas de bouton "Se désinscrire" one-click** dans le footer — l'unique chemin est de se logger et naviguer dans `/parametres`. Pour les emails transactionnels purs, c'est OK ; pour les digest (`messages-digest`, `candidatures-digest`, `irl-rappel-bail`, `annonce_stagnant`) c'est juste à la limite — ces emails sont catégorisés "marketing-like" par Gmail.
- Pas de mention "Cet email a été envoyé à `<receiver@email>`" — bonne pratique RGPD anti-confusion.
- Pas de lien vers la politique de confidentialité dans le footer email (bonne pratique CNIL).

---

## Inventaire templates (23 templates)

| Template (export) | Use case | Trigger | Cron ? |
|---|---|---|---|
| `verifyEmailTemplate` | Vérification email à l'inscription | `POST /api/auth/register`, `POST /api/auth/resend-verify-code` | ❌ |
| `resetPasswordTemplate` | Reset mot de passe | `POST /api/auth/reset-password` | ❌ |
| `newMessageTemplate` | Nouveau message reçu | `POST /api/notifications/new-message` | ❌ |
| `messagesDigestTemplate` | Digest quotidien messages | `GET /api/cron/messages-digest` | ✅ 0 8 * * * |
| `candidatOrphelinTemplate` | Rappel candidature non retenue | `GET /api/notifications/candidats-orphelins` | ✅ |
| `bailInvitationTemplate` | Invitation locataire à signer bail | `POST /api/bail/from-annonce`, `POST /api/bail/importer` | ❌ |
| `quittanceTemplate` | Quittance loyer reçue | `POST /api/loyers/quittance` (PDF en PJ) | ❌ |
| `bailFinalActifTemplate` | Bail double-signé final | `lib/bail/finalize.ts` (PDF en PJ) | ❌ |
| `bailRelanceLocataireTemplate` | Rappel signature locataire | `POST /api/bail/relance` | ❌ |
| `bailRelanceProprioTemplate` | Rappel signature proprio | `POST /api/bail/relance-bailleur` | ❌ |
| `visiteProposeeTemplate` | Demande de visite | `POST /api/notifications/event` | ❌ |
| `visiteConfirmeeTemplate` | Visite confirmée + ICS | `POST /api/notifications/event` | ❌ |
| `visiteAnnuleeTemplate` | Visite annulée | `POST /api/notifications/event` | ❌ |
| `visiteRappelTemplate` | Rappel J-1 visite + ICS | `GET /api/cron/visites-rappel` | ✅ 0 9 * * * |
| `dossierDemandeTemplate` | Demande de dossier | `POST /api/notifications/event` | ❌ |
| `dossierPartageTemplate` | Dossier partagé | `POST /api/notifications/event` | ❌ |
| `dossierRevoqueTemplate` | Accès dossier révoqué | `DELETE /api/dossier/share/[id]` | ❌ |
| `edlASignerTemplate` | EDL à signer | `POST /api/notifications/event` | ❌ |
| `edlContesteTemplate` | EDL contesté | `POST /api/notifications/event` | ❌ |
| `candidatureValideeTemplate` | Candidature validée | `POST /api/candidatures/valider` | ❌ |
| `candidatureRefuseeTemplate` | Candidature refusée + recos 5 annonces | `POST /api/candidatures/refuser` | ❌ |
| `candidaturesDigestTemplate` | Digest quotidien candidatures (proprio) | `GET /api/cron/candidatures-digest` | ✅ 0 8 * * * |
| `loyerRetardLocataireTemplate` | Loyer en retard J+5/J+15 (locataire) | `GET /api/cron/loyers-retard` | ✅ 0 8 * * * |
| `loyerRetardProprioTemplate` | Loyer en retard J+5/J+15 (proprio) | `GET /api/cron/loyers-retard` | ✅ 0 8 * * * |
| `irlIndexationProposalTemplate` | Proposition IRL trimestriel | `GET /api/cron/irl-rappel-bail` | ✅ 0 9 6 1,4,7,10 * |
| `preavisDonneTemplate` | Préavis donné | `POST /api/bail/preavis` | ❌ |
| `bailSignePartialTemplate` | Bail signé par 1 partie | `POST /api/notifications/event` | ❌ |
| `bailMerciLocataireTemplate` | Fin de bail (locataire) | `GET /api/cron/post-bail` | ✅ 0 10 * * * |
| `bailClosProprioTemplate` | Fin de bail (proprio) | `GET /api/cron/post-bail` | ✅ 0 10 * * * |
| `depotContentieuxLocataireTemplate` | Dépôt non restitué (recours locataire) | `GET /api/cron/depot-retard` | ✅ 0 9 * * * |
| `depotWarningProprioTemplate` | Délai dépôt approche (proprio) | `GET /api/cron/depot-retard` | ✅ 0 9 * * * |

Total : 30+ templates. 6 crons utilisent ≥ 1 template, dont 4 quotidiens à 8h-10h (potentiel pic d'envoi simultané → throttle Resend recommandé).

---

## Vérifications spécifiques code

### `RESEND_API_KEY` non committée

```
$ git ls-files --error-unmatch nestmatch/.env.local
error: pathspec did not match any file(s) known to git
```
✅ `.env.local` non tracké, gitignore couvre `.env*.local`.

### Resend env vars (sans valeurs)

`nestmatch/.env.local` contient bien `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME`, `RESEND_REPLY_TO`. ✅ tous configurés.

### Fallback graceful

`lib/email/resend.ts` ligne 21-23 : si `RESEND_API_KEY` absent en prod → `console.error` mais pas de crash. ✅ bon.

### Templates : React Email ou HTML inline ?

HTML inline (commentaire `templates.ts` ligne 5) — choix volontaire, plus léger. ✅ acceptable.

### Gestion bounces / unsubscribes

🔴 **Aucun webhook Resend câblé**. Pas de route `/api/webhooks/resend` qui consomme `email.bounced`, `email.complained`, `email.delivered`. Conséquence : si un email hard-bounce de manière permanente (hard bounce), KeyMatch continuera à envoyer sur cette adresse à chaque trigger → dégrade la réputation.

🔴 **Pas de table `email_bounces` ni `email_unsubscribes`** en DB.

### Idempotence (pas de double-envoi sur retry)

✅ `loyers-retard` : flags `notified_retard_at` + `notified_retard_15_at` (lignes 103-105 + UPDATE 178)
✅ `messages-digest` : log `messages_emails_log.last_digest_at` (lignes 188-194)
✅ `quittance` : check `loyers.quittance_pdf_url` existant avant régénération (lignes 67-69)
🟡 `new-message` : batch debounce 5 min via `messages_emails_log.sent_at` + online check (last_seen < 10min)
🟡 `register` / `resend-verify-code` : pas d'idempotence stricte mais OTP ré-émis avec rate-limit IP/email
🟡 `bail/from-annonce`, `bail/preavis` : pas de garde anti-double envoi explicite (mais ces actions sont fortement throttle-protégées V64)

### Rate-limit côté Resend

🔴 **Aucun throttle dans les crons** : `loyers-retard` boucle synchrone sur tous les loyers en retard → si N > 100, on dépasse le rate-limit Resend (10 req/sec par défaut sur le plan gratuit, 100/sec sur paid). Pas de `await sleep` ou queue.

Idem `messages-digest`, `candidatures-digest`, `post-bail`, `depot-retard`.

**Fix** : batcher 10 emails / 100ms ou utiliser `resend.batch.send` (jusqu'à 100 emails par appel API).

---

## Top 5 fixes pré-volume (avant > 1000 emails/jour)

### 1. 🔴 Ajouter headers `List-Unsubscribe` + `List-Unsubscribe-Post: One-Click` (RFC 8058)

Modifier `lib/email/resend.ts > sendEmail()` pour inclure dans `resend.emails.send()` :
```ts
headers: {
  "List-Unsubscribe": `<mailto:unsubscribe@keymatch-immo.fr>, <${process.env.NEXT_PUBLIC_URL}/api/email/unsubscribe?email=${encodeURIComponent(to)}&token=${hmac}>`,
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
},
```
Créer `app/api/email/unsubscribe/route.ts` (GET + POST one-click) qui désactive `notif_preferences[<category>] = false` après vérification HMAC du token (clé : `process.env.NEXTAUTH_SECRET`).

**Pourquoi prio 1** : exigence Gmail/Yahoo bulk sender 2024. Sans ça, taux de placement spam Gmail commence à grimper dès 100/jour vers @gmail.com.

### 2. 🔴 DMARC : ajouter `rua=` puis durcir à `p=quarantine`

Phase 1 (immédiat) — ajouter le reporting agrégé pour observer :
```
_dmarc.keymatch-immo.fr.  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@keymatch-immo.fr; ruf=mailto:dmarc@keymatch-immo.fr; fo=1"
```
Créer la mailbox `dmarc@keymatch-immo.fr` (ou utiliser un service comme Postmark DMARC Digests gratuit).

Phase 2 (après 14 jours sans alerte) — durcir :
```
v=DMARC1; p=quarantine; pct=10; rua=...; ruf=...; fo=1; adkim=r; aspf=r
```
Puis `pct=100` après 7 jours, puis `p=reject` après un mois supplémentaire.

### 3. 🟠 Webhook Resend `email.bounced` + suppression list

Créer `app/api/webhooks/resend/route.ts` qui consume les events Resend :
- `email.bounced` (hard bounce) → INSERT `email_bounces { email, type: 'hard', created_at }` + flag `profils.email_undeliverable = true`
- `email.complained` (spam complaint) → marquer immédiatement `notif_preferences = { all_off }`
- `email.delivered` → optionnel, pour stats

Modifier `sendEmail()` pour skip si `email_undeliverable=true` côté DB (1 lookup avant chaque envoi pour les addresses déjà bouncées).

Setup Resend webhook : https://resend.com/webhooks → endpoint `https://keymatch-immo.fr/api/webhooks/resend` → secret `RESEND_WEBHOOK_SECRET`.

### 4. 🟠 Logo SVG inline → image PNG hébergée pour Outlook

Remplacer `logoSvg(id, size)` par :
```ts
function logoImg(size = 44): string {
  const base = process.env.NEXT_PUBLIC_URL || "https://keymatch-immo.fr"
  return `<img src="${base}/logo-email-${size * 2}.png" alt="KeyMatch" width="${size}" height="${size}" style="display:block;border:0;" />`
}
```
Générer `public/logo-email-88.png` et `logo-email-100.png` (Retina). Remplacer les ~12 appels `logoSvg(...)` dans le wrap header.

Bonus : retirer les emojis ✓ (line 508) et 📍 (lines 758, 1242) dans les sujets/bodies pour cohérence avec règle "no-emojis-public".

### 5. 🟠 Throttle / batch les crons

Modifier `loyers-retard`, `messages-digest`, `candidatures-digest`, `post-bail`, `depot-retard` pour :
- Soit utiliser `resend.batch.send([...])` (jusqu'à 100 emails par appel)
- Soit insérer `await new Promise(r => setTimeout(r, 100))` entre chaque envoi (10 emails/sec max, sous le plafond Resend)

Bonus : monitorer le retour `result.ok === false` et ré-empiler dans une retry queue (table `email_retry_queue`) si Resend retourne 429.

---

## DNS records à publier (résumé exécutable)

**État actuel : 4/5 records OK.** Seul changement nécessaire à court terme = enrichir DMARC.

| Record | Existant ? | Action |
|---|---|---|
| `keymatch-immo.fr TXT v=spf1 include:mx.ovh.com -all` | ✅ | RAS |
| `send.keymatch-immo.fr TXT v=spf1 include:amazonses.com ~all` | ✅ | RAS (Resend) |
| `send.keymatch-immo.fr MX 10 feedback-smtp.eu-west-1.amazonses.com` | ✅ | RAS (Resend) |
| `resend._domainkey.keymatch-immo.fr TXT p=MIGfMA0G...` | ✅ | RAS (Resend) |
| `_dmarc.keymatch-immo.fr TXT v=DMARC1; p=none;` | 🟠 minimal | **REMPLACER** par version ci-dessous |

**Nouveau record DMARC à publier (OVH DNS console)** :
```
_dmarc    TXT    "v=DMARC1; p=none; rua=mailto:dmarc@keymatch-immo.fr; ruf=mailto:dmarc@keymatch-immo.fr; fo=1; adkim=r; aspf=r"
```
Puis, après 2 semaines d'observation des rapports `rua` :
```
_dmarc    TXT    "v=DMARC1; p=quarantine; pct=10; rua=mailto:dmarc@keymatch-immo.fr; ruf=mailto:dmarc@keymatch-immo.fr; fo=1; adkim=r; aspf=r"
```

**À ne PAS toucher** : la config `send.*` est gérée par Resend. Si Paul rebrand ou change de provider, les CNAME/MX seront pilotés depuis le dashboard Resend.

---

## Checklist 7-jours pré-lancement (≥ 1000 emails/jour)

- [ ] DMARC enrichi avec `rua` (15 min OVH)
- [ ] Mailbox `dmarc@keymatch-immo.fr` créée + redirection vers tic3467@gmail.com
- [ ] `List-Unsubscribe` + `List-Unsubscribe-Post` ajoutés à `sendEmail()`
- [ ] Route `/api/email/unsubscribe` créée + token HMAC
- [ ] Webhook Resend `/api/webhooks/resend` câblé (bounce + complaint)
- [ ] Table `email_bounces` ou flag `profils.email_undeliverable` ajouté
- [ ] Logo SVG → PNG dans templates (ou laisser SVG si on accepte le rendu Outlook dégradé)
- [ ] Google Postmaster Tools configuré (5 min)
- [ ] Test Mail-tester.com sur 3 templates (verifyEmail, newMessage, quittance) — viser ≥ 9/10
- [ ] Test Litmus / Email on Acid sur Gmail/Outlook365/Apple Mail (optionnel mais recommandé)
- [ ] Throttle / batch ajouté aux 5 crons à fort volume
- [ ] DMARC durci à `p=quarantine pct=10` (après 2 semaines de monitoring)

---

## Changelog audit

- **2026-05-06** — Création audit. Score 74/100. Live DNS via dns.google/resolve OK pour SPF/DKIM/DMARC/MX. mxtoolbox blacklist non-accessible WebFetch (vérif manuelle requise). Identifié 5 fixes prioritaires avant scaling 1k+/jour.
