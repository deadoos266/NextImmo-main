# Audit emails KeyMatch — V50.2

État au 2026-04-29. Liste exhaustive de TOUS les triggers emails du produit,
classés par flow. Pour chacun : trigger, template, garde-fous (auth, rate-limit,
self-email guard V50.1), statut "shippé / TODO".

## Légende
- ✅ shippé = trigger live + template stylisé V34.1
- 🟡 partial = trigger live mais sans template stylisé (HTML inline ad-hoc)
- 🔴 missing = trigger absent du code
- 🛡 guard = guard self-email V50.1 actif

## Architecture

Tous les emails passent par `lib/email/resend.ts > sendEmail({ to, subject,
html, senderEmail? })`. Si `RESEND_API_KEY` absent → log + skip (pas de crash).

V50.1 : guard `senderEmail.toLowerCase() === to.toLowerCase()` →
short-circuit `{ skipped: "Self-email blocked" }`. Wire-up à 7 routes
(voir bas du doc).

## 1. Auth flow

| Action | Template | Trigger | Statut | Garde-fous |
|--------|----------|---------|--------|-----------|
| Création compte (credentials) | `verifyEmailTemplate` | `POST /api/auth/register` | ✅ | rate-limit IP |
| Renvoi code OTP | `verifyEmailTemplate` | `POST /api/auth/resend-verify-code` | ✅ | rate-limit |
| Reset password | `resetPasswordTemplate` | `POST /api/auth/reset-password` | ✅ | rate-limit |

Pas de `senderEmail` ici — le sender est le système, pas un user. Pas de
risque self-email.

## 2. Messages flow

| Action | Template | Trigger | Statut | Garde-fous |
|--------|----------|---------|--------|-----------|
| Nouveau message in-app | `newMessageTemplate` | `POST /api/notifications/new-message` (fire-and-forget client) | ✅ | rate-limit 3/h/dest, 30/h/expéditeur · respect `notif_messages_email` · 🛡 senderEmail (V50.1) |

## 3. Candidature flow

| Action | Template | Trigger | Statut | Garde-fous |
|--------|----------|---------|--------|-----------|
| Candidat orphelin (J+7 sans login) | `candidatOrphelinTemplate` | `GET /api/notifications/candidats-orphelins` (cron quotidien) | ✅ | cron auth ; idempotent |
| Candidature reçue (proprio) | — | — | 🔴 missing | Aucun email proprio quand un candidat postule. Le proprio reçoit juste une notif cloche in-app et un message [CANDIDATURE]. **TODO** : email récap quotidien des nouvelles candidatures (anti-flood). |
| Candidature validée (locataire) | — | — | 🟡 partial | Notif in-app via `[CANDIDATURE_VALIDEE]` mais pas d'email. Locataire doit ouvrir l'app pour le savoir. **TODO** : email "votre candidature est validée + prochaines étapes". |
| Candidature refusée (locataire) | — | — | 🟡 partial | Notif in-app via `[CANDIDATURE_NON_RETENUE]` mais pas d'email. **TODO** : email courtois (RGPD ok à bref). |
| Devalidation candidature | — | — | 🟡 partial | Notif in-app uniquement. Cas rare, peut-être OK sans email. |

## 4. Visite flow

| Action | Template | Trigger | Statut | Garde-fous |
|--------|----------|---------|--------|-----------|
| Demande de visite | — | — | 🟡 partial | Notif in-app via `[VISITE_DEMANDE]`, pas d'email. **TODO** : email "X propose une visite le ..." (avec lien direct vers conv). |
| Visite confirmée | — | — | 🟡 partial | Notif in-app via `[VISITE_CONFIRMEE]`. **TODO HIGH** : email avec ICS calendar invite (pour ajouter au calendrier locataire ET proprio). |
| Visite annulée | — | — | 🟡 partial | Notif in-app uniquement. **TODO** : email avec raison de l'annulation. |
| Rappel J-1 visite | — | — | 🔴 missing | Pas de cron de rappel. **TODO** : cron daily envoie email aux 2 parties pour les visites confirmées de J+1. |

## 5. Bail flow

| Action | Template | Trigger | Statut | Garde-fous |
|--------|----------|---------|--------|-----------|
| Invitation bail (locataire) | `bailInvitationTemplate` | `POST /api/bail/from-annonce` | ✅ | 🛡 senderEmail (V50.1) |
| Invitation bail externe (PDF importé) | `bailInvitationTemplate` | `POST /api/bail/importer` | ✅ | 🛡 senderEmail (V50.1) |
| Relance locataire (bail à signer) | `bailRelanceLocataireTemplate` | `POST /api/bail/relance` (cron + manuel) | ✅ | 🛡 senderEmail (V50.1) ; throttle 7j ; J+3/J+7 windows |
| Relance bailleur (locataire signé, attend proprio) | `bailRelanceProprioTemplate` | `POST /api/bail/relance-bailleur` | ✅ | 🛡 senderEmail (V50.1) |
| Bail double-signé final | `bailFinalActifTemplate` | `lib/bail/finalize.ts` (post double-sig) | ✅ | PDF en pièce jointe ; envoyé aux 2 parties |
| Bail signé + PDF dans conv (V50.10) | — | `lib/bail/finalize.ts` (insert message) | ✅ | Pas un email mais une carte in-app |
| Refus invitation bail | — | — | 🟡 partial | Message in-app `[BAIL_REFUSE]`, pas d'email proprio. **TODO** : email "le locataire a refusé le bail (raison: ...)". |

## 6. EDL flow

| Action | Template | Trigger | Statut | Garde-fous |
|--------|----------|---------|--------|-----------|
| EDL envoyé (à signer) | — | — | 🟡 partial | Notif in-app via `[EDL_CARD]`. **TODO HIGH** : email locataire avec PDF EDL préliminaire à valider. |
| EDL contesté | — | — | 🟡 partial | Notif in-app, pas d'email. **TODO** : email proprio "le locataire conteste l'EDL : voir motifs". |
| EDL validé (signé par les 2) | — | — | 🟡 partial | Notif in-app. **TODO** : email aux 2 parties "EDL validé, archive 3 ans". |

## 7. Loyer / Quittance flow

| Action | Template | Trigger | Statut | Garde-fous |
|--------|----------|---------|--------|-----------|
| Loyer déclaré (proprio doit confirmer) | — | — | 🟡 partial | Notif in-app `[LOYER_PAYE]`. **TODO** : email proprio quotidien récap des loyers déclarés. |
| Loyer confirmé → quittance générée | `quittanceTemplate` | `POST /api/loyers/quittance` | ✅ | 🛡 senderEmail (V50.1) ; PDF en PJ |
| Loyer en retard (J+5) | — | — | 🔴 missing | Pas de cron. **TODO HIGH** : cron daily envoie email locataire + proprio pour loyer du mois courant non payé après le 5. Eviter les harcèlements (1 seul rappel par mois max). |

## 8. Préavis flow

| Action | Template | Trigger | Statut | Garde-fous |
|--------|----------|---------|--------|-----------|
| Préavis donné (par locataire ou bailleur) | inline HTML | `POST /api/bail/preavis` | 🟡 partial | HTML inline non templatisé V34.1 ; 🛡 senderEmail (V50.1). **TODO** : extraire template stylisé `bailPreavisTemplate`. |

## 9. IRL / Indexation flow

| Action | Template | Trigger | Statut | Garde-fous |
|--------|----------|---------|--------|-----------|
| Notification IRL trimestrielle | — | — | 🔴 missing | Cron `vercel.json` "0 9 5 1,4,7,10 *" prévu mais pas branché. **TODO** : email proprio "indice IRL Q1 publié, vous pouvez réviser" (loi ALUR). |

## 10. Loyers automatiques (paiement programmé)

| Action | Template | Trigger | Statut | Garde-fous |
|--------|----------|---------|--------|-----------|
| Demande auto-paiement | — | — | 🟡 partial | Notif in-app `[AUTO_PAIEMENT_DEMANDE]`. **TODO** : email locataire avec CTA accepter/refuser. |

## 11. Self-email guard (V50.1)

Wire-up `senderEmail` paramètre dans `sendEmail()` aux routes suivantes :
- ✅ `/api/notifications/new-message` (existed + 🛡 V50.1)
- ✅ `/api/bail/preavis`
- ✅ `/api/bail/relance`
- ✅ `/api/bail/relance-bailleur`
- ✅ `/api/bail/from-annonce`
- ✅ `/api/bail/importer`
- ✅ `/api/loyers/quittance`

Routes sans guard (intentionnel — pas de "sender" applicatif) :
- `/api/auth/register` (sender = système)
- `/api/auth/reset-password` (sender = système)
- `/api/auth/resend-verify-code` (sender = système)
- `/api/notifications/candidats-orphelins` (cron)
- `lib/bail/finalize.ts` (envoi aux 2 parties par défaut, locEmail ≠ propEmail)

## 12. Score audit

| Catégorie | ✅ shippé | 🟡 partial | 🔴 missing |
|-----------|-----------|------------|-----------|
| Auth | 3 | 0 | 0 |
| Messages | 1 | 0 | 0 |
| Candidature | 1 | 4 | 1 |
| Visite | 0 | 3 | 1 |
| Bail | 5 | 1 | 0 |
| EDL | 0 | 3 | 0 |
| Loyer | 1 | 1 | 1 |
| Préavis | 0 | 1 | 0 |
| IRL | 0 | 0 | 1 |
| Auto-paiement | 0 | 1 | 0 |
| **TOTAL** | **11** | **14** | **4** |

29 actions identifiées. 38 % shippées avec template stylisé. La majorité des
gaps sont des notifs in-app sans email (le user ne reçoit rien dans son
inbox tant qu'il n'ouvre pas l'app).

## 13. Priorités V51 (si refonte emails)

P0 (bloquant produit) :
- Visite confirmée → ICS calendar invite (high impact, low effort)
- EDL envoyé à signer (locataire risque de rater)
- Loyer en retard cron J+5 (recouvrement)

P1 (forte valeur) :
- Candidature validée (locataire content, retient le proprio)
- Candidature reçue (proprio sait qu'il a du nouveau)
- Rappel J-1 visite

P2 (nice to have) :
- Refus candidature (RGPD ok)
- IRL trimestriel
- Préavis template stylisé V34.1
