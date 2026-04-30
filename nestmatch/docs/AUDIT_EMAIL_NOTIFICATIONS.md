# Audit emails KeyMatch — V50.2 + V52 update

État au 2026-04-30 (post-V52). 7 emails P0 shippés en V52
(visite_proposee, visite_confirmee, visite_annulee, dossier_demande,
dossier_partage, dossier_revoque, bail_signe_partial). Liste exhaustive de TOUS les triggers emails du produit,
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
| Demande de dossier (proprio→locataire) | `dossierDemandeTemplate` (V52.4) | `POST /api/notifications/event { type: "dossier_demande" }` | ✅ | rate-limit ; respect notif_messages_email |
| Dossier partagé (locataire→proprio) | `dossierPartageTemplate` (V52.5) | `POST /api/notifications/event { type: "dossier_partage" }` | ✅ | inclut score complétude + shareUrl direct |
| Dossier révoqué (locataire→proprio) | `dossierRevoqueTemplate` (V52.6) | `DELETE /api/dossier/share/[id]` (server, parse label) | ✅ | best-effort ; skip si label non parseable |
| Candidature reçue (proprio) | — | — | 🔴 missing | Aucun email proprio quand un candidat postule. Le proprio reçoit juste une notif cloche in-app et un message [CANDIDATURE]. **TODO** : email récap quotidien des nouvelles candidatures (anti-flood). |
| Candidature validée (locataire) | — | — | 🟡 partial | Notif in-app via `[CANDIDATURE_VALIDEE]` mais pas d'email. Locataire doit ouvrir l'app pour le savoir. **TODO** : email "votre candidature est validée + prochaines étapes". |
| Candidature refusée (locataire) | — | — | 🟡 partial | Notif in-app via `[CANDIDATURE_NON_RETENUE]` mais pas d'email. **TODO** : email courtois (RGPD ok à bref). |
| Devalidation candidature | — | — | 🟡 partial | Notif in-app uniquement. Cas rare, peut-être OK sans email. |

## 4. Visite flow

| Action | Template | Trigger | Statut | Garde-fous |
|--------|----------|---------|--------|-----------|
| Demande de visite | `visiteProposeeTemplate` (V52.1) | `POST /api/notifications/event { type: "visite_proposee" }` (client fire-and-forget après insert visite) | ✅ | rate-limit 30/h ; respect notif_messages_email ; 🛡 senderEmail |
| Visite confirmée | `visiteConfirmeeTemplate` (V52.2) | `POST /api/notifications/event { type: "visite_confirmee" }` (client après choix slot) | ✅ | wording adapté au destinataireRole (loc/proprio) |
| Visite annulée | `visiteAnnuleeTemplate` (V52.3) | `POST /api/notifications/event { type: "visite_annulee" }` (client après annulerVisite) | ✅ | raison incluse |
| Rappel J-1 visite | — | — | 🔴 missing | Pas de cron de rappel. **TODO** : cron daily envoie email aux 2 parties pour les visites confirmées de J+1. |
| ICS calendar attachment | — | — | 🔴 missing | Le template visite_confirmee est text-based. **TODO** : générer fichier .ics et l'attacher pour ajouter au calendrier en 1 clic. |

## 5. Bail flow

| Action | Template | Trigger | Statut | Garde-fous |
|--------|----------|---------|--------|-----------|
| Invitation bail (locataire) | `bailInvitationTemplate` | `POST /api/bail/from-annonce` | ✅ | 🛡 senderEmail (V50.1) |
| Invitation bail externe (PDF importé) | `bailInvitationTemplate` | `POST /api/bail/importer` | ✅ | 🛡 senderEmail (V50.1) |
| Relance locataire (bail à signer) | `bailRelanceLocataireTemplate` | `POST /api/bail/relance` (cron + manuel) | ✅ | 🛡 senderEmail (V50.1) ; throttle 7j ; J+3/J+7 windows |
| Relance bailleur (locataire signé, attend proprio) | `bailRelanceProprioTemplate` | `POST /api/bail/relance-bailleur` | ✅ | 🛡 senderEmail (V50.1) |
| Bail signé partial (1 partie sur 2) | `bailSignePartialTemplate` (V52.7) | `POST /api/bail/signer` (server, après insert signature, si !doubleSigne) | ✅ | wording adapté destinataireRole ; CTA route role-aware ; ignore pref_off (signal critique) |
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
| Candidature | 4 | 4 | 1 |
| Visite | 3 | 0 | 2 |
| Bail | 6 | 1 | 0 |
| EDL | 0 | 3 | 0 |
| Loyer | 1 | 1 | 1 |
| Préavis | 0 | 1 | 0 |
| IRL | 0 | 0 | 1 |
| Auto-paiement | 0 | 1 | 0 |
| **TOTAL** | **18** | **11** | **5** |

34 actions identifiées (29 V50.2 + 5 nouvelles V52). **53 % shippées**
avec template stylisé (vs 38 % pré-V52).

## 13. Priorités restantes

P0 (bloquant produit) :
- ICS calendar attachment pour visite_confirmee (low effort, high impact)
- EDL envoyé à signer (locataire risque de rater)
- Loyer en retard cron J+5 (recouvrement)

P1 (forte valeur) :
- Candidature validée → email locataire
- Candidature reçue → email proprio (récap quotidien anti-flood)
- Rappel J-1 visite (cron)

P2 (nice to have) :
- Refus candidature (RGPD ok)
- IRL trimestriel
- Préavis template stylisé V34.1
- EDL contesté → email proprio
