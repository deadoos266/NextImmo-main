# Phase 5 — Migration emails Resend → Brevo

État : code **livré (V97.39.19)**, activation **manuelle ~1h le jour J** quand Paul est prêt.

## Pour quoi

Resend = US-based, plan gratuit 100 mails/jour puis $20/mo. Brevo (ex-Sendinblue) = FR, **300 mails/jour gratuits à vie**, RGPD-natif (données en EU). Phase 5 du plan migration OVH (`docs/MIGRATION_OVH_COMPLETE_PLAN.md`).

Le code permet de switcher **sans toucher aux 22 call sites** : flippez l'env var `EMAIL_PROVIDER=brevo` dans Vercel, redeploy, fait.

## Architecture livrée

```
22 routes API → import { sendEmail } from "@/lib/email"
                                          │
                                          ▼
                          lib/email/index.ts (dispatcher)
                          │
                ┌─────────┴─────────┐
                ▼                   ▼
   EMAIL_PROVIDER=resend   EMAIL_PROVIDER=brevo
   (défaut)                + BREVO_API_KEY
        │                       │
        ▼                       ▼
   lib/email/resend.ts     lib/email/brevo.ts
   resend SDK              POST api.brevo.com/v3/smtp/email
```

Garde-fous :
- Si `EMAIL_PROVIDER=brevo` mais `BREVO_API_KEY` absent → **fallback automatique Resend** (warning log, pas de crash).
- Si aucune clé → noop graceful (skipped:true).
- Suppress list (`email_suppress_list`) + self-email guard + email_logs : **identiques** entre les 2 providers.
- Le messageId Brevo est stocké dans `email_logs.resend_id` (legacy nom, à renommer un jour en `provider_message_id`).

## Activation en prod (~1h, à faire quand Paul est dispo)

### Étape 1 — Crée le compte Brevo (10 min)

1. https://onboarding.brevo.com/account/register avec `tic3467@gmail.com`.
2. Plan **Free** (300 emails/jour, 0€).
3. Skip onboarding "import contacts" → on n'a besoin que du transactionnel.

### Étape 2 — Vérifie le domaine keymatch-immo.fr (30 min, gros chantier DNS)

Brevo refuse d'envoyer depuis un domaine non vérifié.

1. Brevo dashboard → **Senders & IP → Domains → Add a domain → `keymatch-immo.fr`**.
2. Brevo te donne 3 records DNS à ajouter dans OVH :

   ```
   TXT  mail._domainkey.keymatch-immo.fr   →  "v=DKIM1; k=rsa; p=MIIBIj..."  (clé publique Brevo)
   TXT  keymatch-immo.fr                   →  "v=spf1 include:spf.brevo.com mx ~all"
   TXT  brevo-code.keymatch-immo.fr        →  "<code de validation Brevo>"
   ```

3. Ouvre **OVH Manager → Web Cloud → Noms de domaine → keymatch-immo.fr → Zone DNS**.
4. ⚠ **Si SPF existe déjà** (probable, Resend l'a peut-être posé) → tu ne peux avoir **qu'UN SEUL** record SPF. Fusionne :
   ```
   "v=spf1 include:spf.brevo.com include:amazonses.com mx ~all"
   ```
   (en gardant les includes des 2 providers le temps de la transition).
5. Pour DKIM : Resend et Brevo utilisent des **sélecteurs différents** (`resend._domainkey` vs `mail._domainkey`), donc tu peux avoir les 2 records DKIM coexistants. Aucun conflit.
6. DMARC : si tu as déjà `_dmarc.keymatch-immo.fr` (posé par la phase Resend) → ne pas toucher, il s'applique aux 2 providers.
7. Clique "Vérifier" dans Brevo. Si DNS pas encore propagé (peut prendre 15 min-2h) → ré-essaye.

### Étape 3 — Génère l'API key Brevo (5 min)

1. Brevo dashboard → **Senders & IP → API Keys → Create new API key → "KeyMatch Production"**.
2. Scope : **Send transactional emails**. (Pas besoin de Campaigns / Contacts.)
3. Copie la clé `xkeysib-xxxxxxxxxxxx` (ne s'affiche **qu'une seule fois**).

### Étape 4 — Configure Vercel (5 min)

Vercel dashboard → Settings → Environment Variables (Production + Preview) :

| Variable             | Valeur                              |
|----------------------|-------------------------------------|
| `EMAIL_PROVIDER`     | `brevo`                             |
| `BREVO_API_KEY`      | `xkeysib-xxxxxxxxxxxx`              |
| `BREVO_FROM_EMAIL`   | `noreply@keymatch-immo.fr`          |
| `BREVO_FROM_NAME`    | `KeyMatch`                          |
| `BREVO_REPLY_TO`     | `support@keymatch-immo.fr`          |

⚠ Garde `RESEND_API_KEY` aussi setée — c'est le fallback de sécurité.

### Étape 5 — Redeploy + test (5 min)

1. Vercel → Deployments → Redeploy production (ou push un commit no-op).
2. Une fois le deploy live, va sur `https://keymatch-immo.fr/api/admin/emails/test` (admin only) et envoie un test à `tic3467@gmail.com`.
3. Vérifie l'inbox + le log Brevo dashboard (Transactional → Logs).
4. Confirmation que le message-id commence par `<random>@smtp-relay.sendinblue.com` (Brevo) et pas `<random>@resend.com`.

### Étape 6 — Rollback si problème

Si Brevo plante : flip `EMAIL_PROVIDER=resend` dans Vercel + redeploy → retour Resend instantané. **Aucune perte de fonctionnalité** car les 2 providers ont la même signature côté code.

## Coût

- **Brevo Free** : 300 mails/jour, soit **9 000/mois**. KeyMatch envoie ~50/jour actuellement → 6× sous le plafond.
- **Premier upgrade payant** : 19€/mois pour 20k mails/mois (palier 12 mois si on dépasse régulièrement).
- **Économie vs Resend** : actuellement Resend = ~0€ aussi (sous les 100/jour). Le vrai gain Brevo = **plus de marge** + **données EU**.

## Limites / Notes

- Brevo signe les mails avec son IP partagée (réputation moyenne, OK pour transactionnel). Si on tape >10 000 mails/jour un jour, considérer leur **IP dédiée** (+30€/mois).
- Les webhooks Brevo (bounce/complaint) existent mais ne sont **pas** branchés dans la V97.39.19. À faire dans une V97.40.x si on coupe vraiment Resend (cf `/api/webhooks/resend` qui update `email_logs.delivered_at` etc.).
- `BREVO_FROM_EMAIL` doit appartenir au domaine vérifié sinon Brevo renvoie HTTP 400 "Invalid sender".

## Vérifications post-activation

- [ ] Test email signup OTP → reçu < 30s
- [ ] Test envoi candidature → notification proprio reçue
- [ ] Test relance loyer cron → arrive
- [ ] Brevo dashboard Logs montre status "delivered"
- [ ] `email_logs` Supabase contient les rows avec `resend_id` non-null (le messageId Brevo)
- [ ] Spam score sur `https://www.mail-tester.com/` : viser ≥ 9/10

Une fois 7 jours stables → on peut désactiver `RESEND_API_KEY` (mais garder le fallback code activé indéfiniment, ça coûte 0).
