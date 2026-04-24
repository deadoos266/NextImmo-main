<!-- LIVRE 2026-04-19 -->
<!-- Evidence: lib/email/resend.ts + domaine verifie Resend -->

# PLAN — Resend emails (infra + 6 templates)

## 1. Contexte et objectif
Aucun email transactionnel aujourd'hui. Tout repose sur l'app ouverte. Intégrer Resend (3k emails/mois gratuit) + poser 6 templates React Email pour : vérification compte, reset password, nouveau message, loyer en retard, candidat orphelin, fin de bail proche. Respect des préférences user (`notif_*_email` de `profils`).

## 2. Audit de l'existant

### Événements identifiés (à emailifier)
- Inscription → envoyer vérification (actuellement : `email_verified` = false, jamais enforced)
- "Mot de passe oublié" depuis `/auth` → actuellement POST `/api/contact` (fallback manuel admin)
- Nouveau message reçu → toast real-time si online, rien si offline
- Location acceptée → message in-app, pas d'email
- Candidats orphelins (bail signé) → rien
- Loyer non confirmé J+10 → badge UI, pas d'email
- Bail qui finit dans 3 mois → rien

### Tables à enrichir
- `users.email_verified` + `users.email_verify_token` + `users.email_verify_expires`
- `users.reset_password_token` + `users.reset_password_expires`
- `profils.notif_*_email` existent déjà (P0 migration 008).

## 3. Fichiers impactés

| Fichier | Statut | Changement |
|---|---|---|
| `nestmatch/lib/email/resend.ts` | **NOUVEAU** | Client Resend + helper `sendEmail({ to, subject, react })`. |
| `nestmatch/lib/email/templates/VerifyEmail.tsx` | **NOUVEAU** | Template React Email. |
| `nestmatch/lib/email/templates/ResetPassword.tsx` | **NOUVEAU** | |
| `nestmatch/lib/email/templates/NewMessage.tsx` | **NOUVEAU** | |
| `nestmatch/lib/email/templates/LoyerRetard.tsx` | **NOUVEAU** | |
| `nestmatch/lib/email/templates/CandidatOrphelin.tsx` | **NOUVEAU** | |
| `nestmatch/lib/email/templates/BailFinApproche.tsx` | **NOUVEAU** | |
| `nestmatch/app/api/auth/register/route.ts` | MODIF | Après insert user, envoyer VerifyEmail. |
| `nestmatch/app/api/auth/verify-email/route.ts` | **NOUVEAU** | GET avec token → set email_verified. |
| `nestmatch/app/api/auth/reset-password/route.ts` | **NOUVEAU** | POST { email } → email avec token ; POST { token, password } → reset. |
| `nestmatch/app/auth/reset-password/[token]/page.tsx` | **NOUVEAU** | Page formulaire nouveau mot de passe. |
| `nestmatch/app/api/agent/route.ts` ou hooks | VÉRIFIER | Après message Supabase → trigger email si préf. |
| `nestmatch/app/messages/page.tsx` | MODIF | Côté `envoyer()`, fire-and-forget POST `/api/notifications/new-message`. |
| `nestmatch/app/api/notifications/new-message/route.ts` | **NOUVEAU** | Reçoit {to_email, message_id, conv_key} → envoie email si préf. |
| `nestmatch/app/api/notifications/loyer-retard/route.ts` | **NOUVEAU** | Cron-triggerable, parcourt loyers en retard, envoie emails. |
| `nestmatch/app/api/notifications/candidats-orphelins/route.ts` | **NOUVEAU** | Triggered par `accepterLocation`. |
| `nestmatch/app/messages/page.tsx` (workflow `accepterLocation`) | MODIF | Après update annonce → fire POST pour candidats orphelins. |
| `nestmatch/vercel.json` | **NOUVEAU** | Cron Vercel : loyer-retard J quotidien, bail-fin-approche hebdo. |

## 4. Migrations SQL

```sql
-- <timestamp>_email_tokens.sql
ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS email_verify_token     text,
  ADD COLUMN IF NOT EXISTS email_verify_expires   timestamptz,
  ADD COLUMN IF NOT EXISTS reset_password_token   text,
  ADD COLUMN IF NOT EXISTS reset_password_expires timestamptz;

CREATE INDEX IF NOT EXISTS idx_users_email_verify_token ON users(email_verify_token) WHERE email_verify_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_reset_password_token ON users(reset_password_token) WHERE reset_password_token IS NOT NULL;

NOTIFY pgrst, 'reload schema';
```

## 5. Variables d'env

```bash
RESEND_API_KEY=re_<récupéré sur resend.com/api-keys>
RESEND_FROM_EMAIL=noreply@nestmatch.fr    # nécessite domaine custom vérifié SPF/DKIM
RESEND_FROM_NAME=NestMatch
RESEND_REPLY_TO=contact@nestmatch.fr
# Fallback pendant Phase 1 si domaine custom pas encore prêt :
# RESEND_FROM_EMAIL=onboarding@resend.dev

# Secret pour sécuriser les endpoints cron
CRON_SECRET=<random 32 char>
```

## 6. Dépendances

```bash
cd nestmatch
npm install resend @react-email/components
npm install -D @react-email/preview-server   # pour preview local
```

## 7. Étapes numérotées

### Bloc A — Compte Resend + domaine
1. https://resend.com/signup → créer compte.
2. Domains → Add → `nestmatch.fr` (si domaine custom dispo, sinon skip — voir fallback).
3. Configurer DNS Gandi/OVH : records SPF + DKIM + DMARC fournis par Resend. Attendre vérification (10-30 min).
4. Copier la clé API. Ajouter dans `.env.local` + Vercel.

### Bloc B — Client Resend + helper
5. Créer `lib/email/resend.ts` :
    ```ts
    import { Resend } from "resend"

    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev"
    const fromName = process.env.RESEND_FROM_NAME || "NestMatch"
    const replyTo = process.env.RESEND_REPLY_TO

    if (!apiKey && process.env.NODE_ENV === "production") {
      console.error("[email] RESEND_API_KEY manquante — emails désactivés")
    }

    const resend = apiKey ? new Resend(apiKey) : null

    type SendArgs = {
      to: string
      subject: string
      react: React.ReactElement
      tags?: { name: string; value: string }[]
    }

    export async function sendEmail({ to, subject, react, tags }: SendArgs): Promise<{ ok: boolean; id?: string; error?: string }> {
      if (!resend) {
        console.warn("[email] sendEmail skipped (no api key)", { to, subject })
        return { ok: false, error: "Resend not configured" }
      }
      try {
        const res = await resend.emails.send({
          from: `${fromName} <${from}>`,
          to,
          reply_to: replyTo,
          subject,
          react,
          tags,
        })
        if (res.error) {
          console.error("[email] Resend error", res.error)
          return { ok: false, error: res.error.message }
        }
        return { ok: true, id: res.data?.id }
      } catch (err) {
        console.error("[email] exception", err)
        return { ok: false, error: err instanceof Error ? err.message : "Unknown" }
      }
    }
    ```

### Bloc C — Template de base (layout commun)
6. Créer `lib/email/templates/_layout.tsx` avec header logo + footer NestMatch (réutilisable).
7. Utiliser `@react-email/components` pour cross-client (Gmail / Outlook / Apple Mail).
   ```tsx
   import { Html, Body, Container, Section, Heading, Text, Button, Hr, Link } from "@react-email/components"
   import { BRAND } from "../../brand"
   import { logoEmailUrl } from "../../brandPDF"

   export default function EmailLayout({ preview, children }: { preview: string; children: React.ReactNode }) {
     return (
       <Html lang="fr">
         <Body style={{ backgroundColor: "#F7F4EF", fontFamily: "DM Sans, Arial, sans-serif", margin: 0, padding: "20px 0" }}>
           <Container style={{ maxWidth: 560, margin: "0 auto", backgroundColor: "white", borderRadius: 20, padding: "32px 28px" }}>
             <Section style={{ textAlign: "center", marginBottom: 24 }}>
               <img src={logoEmailUrl()} alt={BRAND.name} width={180} height={40} style={{ display: "inline-block" }} />
             </Section>
             {children}
             <Hr style={{ borderColor: "#e5e7eb", margin: "28px 0 16px" }} />
             <Text style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", lineHeight: 1.5 }}>
               {BRAND.name} · <Link href={BRAND.url} style={{ color: "#9ca3af" }}>{BRAND.url.replace("https://", "")}</Link>
               <br />
               Vous recevez cet email car vous avez un compte {BRAND.name}.
               {" "}<Link href={`${BRAND.url}/parametres?tab=compte`} style={{ color: "#9ca3af" }}>Préférences de notifications</Link>
             </Text>
           </Container>
         </Body>
       </Html>
     )
   }
   ```

### Bloc D — Template VerifyEmail
8. Créer `lib/email/templates/VerifyEmail.tsx` :
    ```tsx
    import EmailLayout from "./_layout"
    import { Button, Heading, Text } from "@react-email/components"

    export default function VerifyEmail({ userName, verifyUrl }: { userName: string; verifyUrl: string }) {
      return (
        <EmailLayout preview="Vérifiez votre email">
          <Heading style={{ fontSize: 22, color: "#111", margin: "0 0 12px" }}>Bienvenue{userName ? `, ${userName}` : ""} !</Heading>
          <Text style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
            Confirmez votre adresse email pour activer votre compte. Ce lien est valide pendant 24 heures.
          </Text>
          <Button href={verifyUrl} style={{ background: "#111", color: "white", padding: "12px 28px", borderRadius: 999, fontSize: 14, fontWeight: 700, textDecoration: "none", display: "inline-block", marginTop: 16 }}>
            Vérifier mon email
          </Button>
          <Text style={{ fontSize: 11, color: "#9ca3af", marginTop: 16 }}>
            Si vous n'êtes pas à l'origine de cette inscription, ignorez cet email.
          </Text>
        </EmailLayout>
      )
    }
    ```

### Bloc E — Autres templates (pattern identique)
9. `ResetPassword.tsx`, `NewMessage.tsx`, `LoyerRetard.tsx`, `CandidatOrphelin.tsx`, `BailFinApproche.tsx` — même structure, prop différentes.

### Bloc F — Vérification email au signup
10. Modifier `/api/auth/register/route.ts` :
    - Après insert user, générer token random (`crypto.randomBytes(24).toString("hex")`), store en DB avec expire = now + 24h.
    - `await sendEmail({ to: email, subject: "Vérifiez votre email", react: <VerifyEmail userName={name} verifyUrl={...}/> })`
    - Ne PAS bloquer le signup si email échoue (log Sentry + continue).
11. Créer `/api/auth/verify-email/route.ts` GET :
    - Lit `?token=xxx`, cherche user avec token+expires valide.
    - Set `email_verified=true`, clear token/expires.
    - Redirige vers `/parametres?verified=true`.

### Bloc G — Reset password flow
12. Créer `/api/auth/reset-password/route.ts` POST :
    - Body `{ email }` → génère token, store DB, envoie email avec lien `${BASE}/auth/reset-password/${token}`.
    - Réponse 200 même si email inconnu (anti-enumeration).
13. Créer `app/auth/reset-password/[token]/page.tsx` :
    - Formulaire nouveau mot de passe + confirmation.
    - POST vers `/api/auth/reset-password` (deuxième variant, Body `{ token, password }`) → vérif token, hash bcrypt, clear token.
14. Dans `app/auth/page.tsx`, le form "mot de passe oublié" actuel (fallback contact) → pointer vers ce nouveau flow.

### Bloc H — Nouveau message
15. Dans `app/messages/page.tsx`, fonction `envoyer()`, **après** l'insert Supabase réussi :
    ```ts
    fetch("/api/notifications/new-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: conv.other, messageId: data.id, convKey: convActive }),
    }).catch(() => { /* silent, non-blocking */ })
    ```
16. Créer `/api/notifications/new-message/route.ts` :
    - `getServerSession` → vérif from = session.
    - Check `profils.notif_messages_email` pour `to_email`. Si false, skip.
    - Récupère nom + url contexte (`/messages`).
    - `sendEmail({ to, subject: "Nouveau message sur NestMatch", react: <NewMessage ... /> })`.
    - Rate-limit 3/h par to_email pour pas spam si conv active (20 messages en 5 min).

### Bloc I — Candidats orphelins
17. Dans `app/messages/page.tsx`, fonction `accepterLocation()`, **après** le message `[LOCATION_ACCEPTEE]` réussi :
    ```ts
    fetch("/api/notifications/candidats-orphelins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annonceId: annId, locataireRetenu: peerEmail }),
    }).catch(() => {})
    ```
18. Créer `/api/notifications/candidats-orphelins/route.ts` :
    - Session check (proprio only).
    - Cherche autres candidats : `messages WHERE annonce_id = X AND from_email != locataireRetenu`, distinct from_email.
    - Pour chacun, vérif prefs + envoie email.

### Bloc J — Loyer en retard (cron)
19. Créer `/api/notifications/loyer-retard/route.ts` GET :
    - Auth par header `Authorization: Bearer ${CRON_SECRET}`.
    - Query : `loyers WHERE statut != 'confirmé' AND mois < today - interval '10 days'`.
    - Par loyer, check prefs user + send.
    - Dédoublonne si envoyé dans les dernières 72h (ajouter colonne `last_email_sent_at` ou table log).
20. Vercel cron — créer `nestmatch/vercel.json` :
    ```json
    {
      "crons": [
        { "path": "/api/notifications/loyer-retard?secret=...", "schedule": "0 9 * * *" },
        { "path": "/api/notifications/bail-fin?secret=...", "schedule": "0 10 * * 1" }
      ]
    }
    ```
    → Vercel Pro requis pour crons. Si Hobby, alternative : cron externe (cron-job.org) qui hit l'endpoint.

### Bloc K — Bail fin approche
21. Créer `/api/notifications/bail-fin/route.ts` :
    - Cherche annonces avec `date_debut_bail` + 33 mois (bail 3 ans -3 mois reminder) ou config custom.
    - Envoie email proprio + locataire.

### Bloc L — Preview local React Email
22. Script `npm run email:preview` :
    ```json
    "email:preview": "email dev --dir lib/email/templates"
    ```
    → Nécessite `@react-email/preview-server`. Ouvre localhost:3001 avec preview de chaque template.

### Bloc M — Tests
23. Tests unitaires pour `sendEmail` (mock Resend SDK).
24. Tests E2E (Phase 2) : flow signup → check mailcatcher local.

## 8. Pièges connus

- **Domaine custom requis** pour bon délivrabilité : `onboarding@resend.dev` marche au début mais risque spam / limite 100/jour.
- **SPF/DKIM/DMARC** : 3 records DNS à configurer correctement. Resend les affiche clairement.
- **Rate-limit Resend** : 100 emails/seconde, 3000/mois free. Largement. Mais `/api/notifications/new-message` sans dédoublonnage = spam.
- **Anti-enumeration** : reset password endpoint renvoie 200 **même si email inconnu**, sinon leak qui a un compte.
- **Token random** : 24+ bytes hex (`crypto.randomBytes(24).toString("hex")` = 48 chars). Ne pas utiliser `Math.random`.
- **Expires** : 24 h pour verify, 1 h pour reset (reset plus sensible).
- **Cron Vercel Hobby** : non dispo, doit upgrade Pro ou utiliser cron externe.
- **`CRON_SECRET`** : indispensable, sinon endpoint ouvert = spam gratuit. Header `Authorization: Bearer <secret>`.
- **Préfs user** : TOUJOURS check `profils.notif_*_email` avant d'envoyer. Ne pas ignorer.
- **Logs Sentry** : wrap chaque `sendEmail` fail dans `Sentry.captureMessage` pour monitorer délivrabilité.
- **Dev mode** : en local, console.log au lieu d'envoyer vraiment si variable `RESEND_API_KEY` absente.

## 9. Checklist "c'est fini"

- [ ] Compte Resend créé, domaine vérifié (ou fallback onboarding@resend.dev).
- [ ] `RESEND_API_KEY` + `CRON_SECRET` en env local + Vercel.
- [ ] 6 templates React Email créés, preview local fonctionnel.
- [ ] Migration tokens commitée et appliquée.
- [ ] Signup → email vérification reçu < 1 min.
- [ ] Clic lien vérif → email_verified = true.
- [ ] "Mot de passe oublié" → email reçu avec lien reset, flow complet fonctionne.
- [ ] Envoyer message → destinataire offline reçoit email < 2 min (si préf activée).
- [ ] Accepter candidat → autres candidats reçoivent email "bien loué".
- [ ] Cron loyer retard activé, email reçu à J+10 non confirmé.
- [ ] Cron bail fin activé, email reçu à J-90 de fin.
- [ ] Préfs `notif_*_email = false` → aucun email envoyé.
- [ ] Rate-limit anti-flood actif sur nouveau message.

---

**Plan MIXTE** — Phase 1 chantier central :

- ⚠️ **EXÉCUTION OPUS UNIQUEMENT** :
  - Bloc F (migration `/api/auth/register/route.ts` + verify-email) : sécurité auth critique.
  - Bloc G (reset-password flow complet) : sensibilité extrême, anti-enumeration, expire, hash bcrypt.
  - Bloc J-K (cron endpoints) : auth CRON_SECRET + query DB sensitive.
- **OK pour Sonnet** : Blocs A (compte Resend), B (client), C-E (templates), H (hook new-message UI), I (hook orphelins UI), L (preview), M (tests).

⚠️ **Blocker dépendance** : domaine custom `nestmatch.fr` pour déliverabilité optimale. Peut démarrer avec `onboarding@resend.dev`, mais prévoir migration rapide.
