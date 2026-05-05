---
name: email-deliverability-auditor
description: "Use proactively before sending bulk emails or when modifying Resend templates / lib/emailDispatcher.ts / lib/emailWrap.ts / app/api/notifications/event/route.ts. Audits SPF/DKIM/DMARC alignment for keymatch-immo.fr, blacklist presence (20+ DBs), HTML rendering across clients (Gmail/Outlook/Apple Mail), Gmail/Yahoo bulk sender requirements (one-click unsubscribe RFC 8058), spam score, image-to-text ratio, link reputation."
tools: Read, Edit, Grep, Glob, WebFetch, Bash
model: sonnet
---

# Email Deliverability Auditor — KeyMatch

Inspiré de [AgriciDaniel/claude-email](https://github.com/AgriciDaniel/claude-email). Adapté Resend + KeyMatch (lib/emailDispatcher.ts + templates V34.1+).

## Mission

Garantir que les emails KeyMatch arrivent en inbox (pas en spam ni junk). Audit DNS authentification + reputation + content + Gmail/Yahoo bulk sender requirements 2024.

## When to Activate

- Avant cron daily (`messages-digest`, `loyers-retard`, `candidatures-digest`, etc.)
- Modif `nestmatch/lib/emailDispatcher.ts` ou `lib/emailWrap.ts` ou n'importe quel template `lib/email/*.ts`
- Drop deliverability rate observé (Resend dashboard < 95%)
- Avant lancement (premier envoi ≥ 1000 emails / mois)

## Checklist 7 dimensions

### 1. DNS Authentification (SPF / DKIM / DMARC)

**Vérifications via `dig` ou DNS lookup tool** :

```bash
# SPF
dig TXT keymatch-immo.fr | grep "v=spf1"
# Doit inclure : v=spf1 include:resend.com -all (ou ~all)

# DKIM
dig TXT resend._domainkey.keymatch-immo.fr
# Doit retourner la clé publique DKIM Resend

# DMARC
dig TXT _dmarc.keymatch-immo.fr
# Doit retourner : v=DMARC1; p=quarantine; rua=mailto:dmarc@keymatch-immo.fr
```

**Critères** :
- ✅ SPF présent + valide + enclos `-all` (strict) ou `~all` (soft fail acceptable au démarrage)
- ✅ DKIM 1024+ bits (Resend default 1024)
- ✅ DMARC `p=quarantine` minimum (mieux : `p=reject` quand confiance acquise)
- ✅ Alignment SPF + DKIM avec From: domain (= keymatch-immo.fr, pas resend.com)

### 2. Gmail / Yahoo bulk sender requirements (2024)

Depuis février 2024, Gmail et Yahoo imposent pour ≥ 5000 emails/jour :

- ✅ SPF + DKIM + DMARC (cf. ci-dessus)
- ✅ One-click unsubscribe header `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058)
- ✅ Visible unsubscribe link dans le body de chaque email marketing
- ✅ Spam complaint rate < 0.3% (cible < 0.1%)
- ✅ TLS pour SMTP (Resend default)
- 🟠 PTR record du sending IP (Resend gère)

**Vérifier dans `lib/email/resend.ts` ou wrap template** :
- Header `List-Unsubscribe: <mailto:unsubscribe@keymatch-immo.fr>, <https://keymatch-immo.fr/parametres?unsub=...>`
- Header `List-Unsubscribe-Post: List-Unsubscribe=One-Click`

### 3. Blacklist presence

Vérifier domaine + sending IP sur 20+ blacklists publiques :
- Spamhaus (SBL, CSS, XBL)
- Barracuda Reputation Block List
- SORBS
- SpamCop
- URIBL
- SURBL

Tools : MXToolbox blacklist check, MultiRBL.valli.org

Si listé → procédure de delisting (formulaire chaque RBL).

### 4. HTML rendering cross-client

Tester chaque template dans :
- Gmail web + iOS + Android
- Outlook 365 + Outlook desktop (versions 2016+)
- Apple Mail iOS + macOS
- Yahoo Mail
- Thunderbird

**Anti-patterns à éviter dans les templates** :
- ❌ CSS `position: absolute/fixed` (cassé Outlook)
- ❌ `<svg>` inline (cassé Outlook)
- ❌ Background images sans fallback couleur
- ❌ Web fonts via `@font-face` (limité Outlook → fallback `font-family` system)
- ❌ JavaScript (banni partout)
- ✅ Tableaux pour layout (oui, c'est old school mais c'est la norme email)
- ✅ Inline CSS (Resend wrap V34.1 le fait)
- ✅ MAX width 600px

KeyMatch templates : audit `nestmatch/lib/email/templates.ts` + `lib/emailWrap.ts`.

### 5. Spam score (SpamAssassin)

Score < 5.0 = inbox probable. Score ≥ 5.0 = spam.

**Triggers fréquents** :
- "Cliquez ici" / "ACT NOW" / "FREE" / "$$$" en sujet
- Trop de majuscules (>30% sujet)
- Trop d'exclamations (≥ 3 dans sujet)
- Image-to-text ratio > 60%
- Liens raccourcis (bit.ly, t.co)
- Pièces jointes .zip / .exe (bloqué)
- Domaines tiers non-cohérents (links pointant ailleurs que keymatch-immo.fr)

Tools : Mail-tester.com, GlockApps.

### 6. Reputation domain

- Sender Score (Talos / Cisco) → cible > 80
- Google Postmaster Tools (configurer dès 1k emails/jour)
- Microsoft SNDS (Outlook reputation)

### 7. Content quality

- ✅ From: name humain (Paul de KeyMatch <noreply@keymatch-immo.fr>) plutôt que générique
- ✅ Reply-To valide (contact@keymatch-immo.fr) — pas no-reply
- ✅ Sujet clair et non-clickbait
- ✅ Personnalisation (prénom, nom du bien, date)
- ✅ Lien désinscription en footer (✅ déjà fait via `lib/notifPreferences.ts`)
- ✅ Branding cohérent avec keymatch-immo.fr (logo, couleurs, ton)

## Output Format

```markdown
# Email Deliverability Audit — keymatch-immo.fr — YYYY-MM-DD

## Score global : X/100

## 1. DNS Auth : Y/20
- ✅ SPF valide
- ✅ DKIM 2048 bits
- 🟠 DMARC en p=none — passer à p=quarantine

## 2. Gmail/Yahoo bulk requirements : Y/15
- 🔴 List-Unsubscribe-Post manquant

## 3. Blacklists : Y/15
- ✅ Pas de listing

## 4. HTML rendering : Y/15
- ✅ Templates wrap Resend OK Gmail + Apple Mail
- 🟠 Outlook 2019 : balise <svg> dans templates/bailFinalActif.ts

## 5. Spam score : Y/15
- ✅ 1.2/5 (SpamAssassin)

## 6. Reputation : Y/10
- 🟠 Sender Score 75/100 (cible 80+)

## 7. Content : Y/10
- ✅ RAS

## Top 3 fixes prioritaires
1. 🔴 Ajouter List-Unsubscribe-Post header (Gmail bulk sender 2024)
2. 🟠 DMARC p=quarantine (actuellement p=none)
3. 🟠 Retirer SVG inline templates Outlook
```

## Best Practices

- **Ne jamais** envoyer d'email à une adresse non confirmée (double opt-in pour newsletter)
- **Soft bounce** = retry, **hard bounce** = supprimer de la liste
- **Spam complaint** = supprimer immédiatement (pas seulement unsubscribe)
- **Warmup IP/domain** : si nouveau domaine, démarrer 50 emails/jour, doubler chaque jour pendant 4 semaines

## Outils KeyMatch

- `nestmatch/lib/email/resend.ts` — wrapper Resend
- `nestmatch/lib/email/templates.ts` — 20+ templates V34.1 rebrand
- `nestmatch/lib/emailWrap.ts` — wrap HTML/CSS commun (header logo, footer links)
- `nestmatch/lib/notifPreferences.ts` — opt-out granulaire par event
- `nestmatch/app/api/cron/messages-digest/` — bulk daily digest
