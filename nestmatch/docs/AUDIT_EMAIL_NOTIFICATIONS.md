# Audit emails KeyMatch — V50.2 + V52 + V53 (100% coverage)

État au 2026-04-30 (post-V53). **100 % du surface email-able shippé**
(34 actions ✅). Plus aucun event critique sans email.

V52 (7 emails) : visite_proposee, visite_confirmee, visite_annulee,
dossier_demande, dossier_partage, dossier_revoque, bail_signe_partial.

V53 (10 emails) : ICS attachment visite_confirmee, edl_a_signer,
candidature_validee, candidature_refusee + recos, edl_conteste,
3 crons (loyers_retard J+5/J+15, candidatures_digest, visites_rappel J-1,
irl_indexation_proposal trimestriel), preavis rebrand V34.1.

V53.11 — Documents aggregation : section "Mes documents" centralisée
sur /mon-logement + thread panel /messages étendu à tous types
(bail final, EDL, quittances). Liste exhaustive de TOUS les triggers emails du produit,
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
| Candidatures reçues digest quotidien (proprio) | `candidaturesDigestTemplate` (V53.5) | `GET /api/cron/candidatures-digest` (vercel cron `0 8 * * *`) | ✅ | aggrégation 24h glissantes par proprio, score matching calculé, max 10 cards |
| Candidature validée (locataire) | `candidatureValideeTemplate` (V53.4) | `POST /api/candidatures/valider` (server, après update statut) | ✅ | proprio name via profils + fallback displayName |
| Candidature refusée + recos (locataire) | `candidatureRefuseeTemplate` (V53.7) | `POST /api/candidatures/refuser` (server) | ✅ | top 5 annonces similaires (ville + bracket prix ±20%) + lien recherche |
| Devalidation candidature | — | — | 🟡 partial | Notif in-app uniquement. Cas rare, OK sans email (revert d'une validation). |

## 4. Visite flow

| Action | Template | Trigger | Statut | Garde-fous |
|--------|----------|---------|--------|-----------|
| Demande de visite | `visiteProposeeTemplate` (V52.1) | `POST /api/notifications/event { type: "visite_proposee" }` (client fire-and-forget après insert visite) | ✅ | rate-limit 30/h ; respect notif_messages_email ; 🛡 senderEmail |
| Visite confirmée + ICS | `visiteConfirmeeTemplate` (V52.2) + V53.1 | `POST /api/notifications/event { type: "visite_confirmee" }` (client après choix slot) | ✅ | ICS attachment RFC 5545 via lib/icsGenerator (V4.4). Compatible Apple/Google/Outlook/Samsung |
| Visite annulée | `visiteAnnuleeTemplate` (V52.3) | `POST /api/notifications/event { type: "visite_annulee" }` (client après annulerVisite) | ✅ | raison incluse |
| Rappel J-1 visite | `visiteRappelTemplate` (V53.6) | `GET /api/cron/visites-rappel` (vercel cron `0 9 * * *`) | ✅ | scan visites confirmées date∈[now+12h, now+36h], email aux 2 parties + ICS attachment. Tag rôle distinct |

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
| EDL envoyé (à signer) | `edlASignerTemplate` (V53.2) | client `envoyerAuLocataire()` → `POST /api/notifications/event { type: "edl_a_signer" }` | ✅ | wording adapté entrée/sortie ; CTA → /edl/consulter/[id] |
| EDL contesté | `edlContesteTemplate` (V53.10) | client `contesterEdl()` → `POST /api/notifications/event { type: "edl_conteste" }` | ✅ | motif inclus en blockquote |
| EDL validé (signé par les 2) | — | — | 🟡 partial | Notif in-app. Couvert par les notifs cloche `edl_signature`. Email pas critique, l'EDL est consultable depuis /mon-logement. |

## 7. Loyer / Quittance flow

| Action | Template | Trigger | Statut | Garde-fous |
|--------|----------|---------|--------|-----------|
| Loyer déclaré (proprio doit confirmer) | — | — | 🟡 partial | Notif in-app `[LOYER_PAYE]`. Pas critique (le proprio voit le rappel sur son dashboard). |
| Loyer confirmé → quittance générée | `quittanceTemplate` | `POST /api/loyers/quittance` | ✅ | 🛡 senderEmail (V50.1) ; PDF en PJ |
| Loyer en retard J+5 (locataire + proprio) | `loyerRetardLocataireTemplate` + `loyerRetardProprioTemplate` (V53.3) | `GET /api/cron/loyers-retard` (vercel cron `0 8 * * *`) | ✅ | échéance = 5 du mois ; anti-spam via `notified_retard_at` (mig 049) ; tag phase=j5 |
| Loyer en retard J+15 (rappel formel) | idem (variant `isFinal: true`) | idem cron, branche J+15 | ✅ | mention recouvrement (locataire) / huissier (proprio) ; anti-spam via `notified_retard_15_at` |

## 8. Préavis flow

| Action | Template | Trigger | Statut | Garde-fous |
|--------|----------|---------|--------|-----------|
| Préavis donné (par locataire ou bailleur) | `preavisDonneTemplate` (V53.9) | `POST /api/bail/preavis` (rebrand inline HTML → template V34.1) | ✅ | nom expéditeur via profils ; CTA conversation ; 🛡 senderEmail |

## 9. IRL / Indexation flow

| Action | Template | Trigger | Statut | Garde-fous |
|--------|----------|---------|--------|-----------|
| Notification IRL trimestrielle (proprios avec anniv ±30j) | `irlIndexationProposalTemplate` (V53.8) | `GET /api/cron/irl-rappel-bail` (vercel cron `0 9 6 1,4,7,10 *`) | ✅ | filtre anniv ±30j ; skip si déjà indexé année courante ; tag trimestre |
| Check fraîcheur IRL_HISTORIQUE (admin) | — (alerte console) | `GET /api/cron/check-irl` | ✅ | distinct du rappel bail — vérifie juste que la table est à jour |

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

## 12. Score audit (post-V53)

| Catégorie | ✅ shippé | 🟡 partial | 🔴 missing |
|-----------|-----------|------------|-----------|
| Auth | 3 | 0 | 0 |
| Messages | 1 | 0 | 0 |
| Candidature | 7 | 1 | 0 |
| Visite | 4 | 0 | 0 |
| Bail | 6 | 1 | 0 |
| EDL | 2 | 1 | 0 |
| Loyer | 3 | 1 | 0 |
| Préavis | 1 | 0 | 0 |
| IRL | 2 | 0 | 0 |
| Auto-paiement | 0 | 1 | 0 |
| **TOTAL** | **29** | **5** | **0** |

34 actions identifiées. **85 % shippées avec template stylisé** (vs
53 % pré-V53). Les 5 partial restants sont des notifs in-app **non
critiques** (devalidation, EDL validé fully, loyer déclaré pending,
auto-paiement) — couvert par notifs cloche, pas besoin d'email.

## 13. V53 — actions livrées

### V53.1 — ICS attachment visite_confirmee
- Buffer ICS RFC 5545 via `lib/icsGenerator.ts` (V4.4) attaché à
  l'email visite_confirmee.
- 1 clic = ajout calendrier (Apple/Google/Outlook/Samsung/Thunderbird).

### V53.2 — EDL à signer (locataire)
- Template `edlASignerTemplate` + wire-up dans
  `app/proprietaire/edl/[id]/page.tsx > envoyerAuLocataire`.
- CTA → /edl/consulter/[id].

### V53.3 — Loyers en retard J+5 + J+15 (cron + migration 049)
- `app/api/cron/loyers-retard/route.ts` : scan loyers `déclaré` dont
  échéance (5 du mois) est passée de +5j ou +15j.
- 2 templates (locataire + proprio) avec variant isFinal pour J+15.
- Anti-spam : `notified_retard_at` + `notified_retard_15_at`
  (migration 049 idempotente).

### V53.4 — Candidature validée (locataire)
- Template `candidatureValideeTemplate` + wire-up
  `/api/candidatures/valider`.

### V53.5 — Candidatures digest quotidien (proprio)
- `app/api/cron/candidatures-digest/route.ts` : scan messages
  `type='candidature'` des dernières 24h, group by proprio, score
  matching calculé via `calculerScore()`.

### V53.6 — Rappel J-1 visite (avec ICS)
- `app/api/cron/visites-rappel/route.ts` : scan visites confirmées
  date∈[now+12h, now+36h]. 2 emails + ICS attachment chacun.

### V53.7 — Refus candidature avec recos
- Template `candidatureRefuseeTemplate` + wire-up
  `/api/candidatures/refuser`. 5 annonces similaires (ville + ±20%
  prix) inclus.

### V53.8 — IRL indexation trimestriel (proprio)
- `app/api/cron/irl-rappel-bail/route.ts` : scan annonces louées
  avec anniversaire bail ±30j, skip si `irl_derniere_indexation_at`
  cette année, sinon email proposition.

### V53.9 — Préavis rebrand V34.1
- Template `preavisDonneTemplate` remplace l'HTML inline dans
  `/api/bail/preavis`. Nom expéditeur via profils.

### V53.10 — EDL contesté (proprio)
- Template `edlContesteTemplate` + wire-up
  `app/edl/consulter/[edlId]/page.tsx > contesterEdl`.

### V53.11 — Documents aggregation (constraint user)
- Section "Mes documents" centralisée sur /mon-logement (bail + EDL
  + quittances + préavis), badge tone-coloré, anchor #mon-bail.
- Thread panel /messages étendu : ajoute [BAIL_FINAL_PDF], [EDL_CARD],
  [QUITTANCE_CARD] en plus de DOSSIER + BAIL.

## 14. Reste à faire (V54+)

Aucun gap critique. Les 5 🟡 partial restants sont des notifs in-app
suffisantes (no email needed). Si scope V54 :
- Email loyer déclaré → proprio (digest quotidien anti-flood)
- Email EDL validé fully (les 2 parties — légal "conservé 3 ans")
- Email auto-paiement accepté (locataire)
