# Audit RGPD KeyMatch — 2026-05-06

Audit de conformité au Règlement (UE) 2016/679 (RGPD) et à la loi Informatique et Libertés n°78-17 modifiée. Périmètre : marketplace immobilière keymatch-immo.fr collectant des PII sensibles (CNI, fiches de paie, IBAN, dossier locataire, KYC).

Auditeur : agent `gdpr-rgpd-auditor` (méthodologie article-par-article).

---

## Score global : **62/100**

Bon socle technique (RLS Phase 5 12/12, audit-trail dossier hashé sel, tokens HMAC, rate-limits, cookie banner CNIL-conforme, suppression de compte fonctionnelle). Mais plusieurs blockers réglementaires avant lancement commercial : **DPIA non écrite (Art. 35 obligatoire)**, **registre des traitements absent (Art. 30 obligatoire)**, **export RGPD partiel (Art. 20)**, **preuve de consentement non persistée en DB**, **DPA signés non centralisés**, **procédure de notification de violation non formalisée**.

Détail :

| Bloc | Score | Pondération |
|---|---|---|
| Sécurité technique (Art. 25, 32) | 14/15 | Excellent : RLS lockdown, hashage IP+token, signed URLs, bcrypt 12 |
| Politiques publiques (CGU, Conf, Cookies) | 12/15 | Politique riche, bien structurée |
| Droits utilisateurs (Art. 12-22) | 9/20 | Suppression OK ; export partiel ; rectif OK ; portabilité incomplète ; opposition OK |
| Bases légales & consentement (Art. 6, 7) | 9/15 | Cookie banner OK ; pas de preuve consent en DB |
| Documentation obligatoire (Art. 30, 35) | 0/15 | Aucun registre ni DPIA écrits |
| Sous-traitance & transferts (Art. 28, 44-46) | 8/10 | Listés mais DPA signés non archivés |
| Notification violation (Art. 33-34) | 2/5 | Mention dans politique mais procédure non formalisée |
| Délais conservation (Art. 5.1.e) | 8/5 | Documentés en politique mais pas appliqués techniquement (purge auto) |

---

## 1. Tableau exhaustif des PII collectées

| Donnée | Catégorie RGPD | Sensibilité | Finalité | Base légale | Durée conservation | Destinataires | Transfert hors UE | Champ DB / Storage |
|---|---|---|---|---|---|---|---|---|
| Email | Identification | Standard | Auth, notifications | Contrat (Art. 6.1.b) | Compte actif + 30j | Plateforme, Resend, Supabase | Resend (USA — DPF) | `users.email`, `profils.email` |
| Mot de passe (bcrypt 12) | Auth | Standard (haché) | Auth | Contrat | Compte actif + 30j | Plateforme | Non | `users.password_hash` |
| Nom + prénom | Identification | Standard | Documents contractuels | Contrat | 3 ans après fin bail (ALUR) | Proprio destinataires | Non | `profils.nom`, `profils.prenom` |
| Téléphone | Contact | Standard | Mise en relation post-bail | Consentement (facultatif) | Compte actif | Proprio destinataires | Non | `profils.telephone` |
| Date naissance + nationalité | Identification | **Sensible (Art. 9 si origines)** | Vérification dossier | Contrat (loi 89-462) | 3 ans après fin bail | Proprio destinataires (lien) | Non | `profils.date_naissance`, `profils.nationalite` |
| Pièce d'identité (CNI/passeport/titre séjour) | Identification | **Sensible** | KYC locataire (décret 2015-1437) | Contrat + obligation légale | 3 ans après fin bail | Proprio destinataires (lien) | Non | Storage `dossiers/...` (Supabase EU Frankfurt) |
| Bulletins de salaire (3-6) | Financière | **Sensible** | KYC solvabilité | Contrat | 3 ans après fin bail | Proprio destinataires (lien) | Non | Storage `dossiers/...` |
| Avis d'imposition | Fiscale | **Sensible** | KYC solvabilité | Contrat | 3 ans après fin bail (politique) / 6 ans fiscal applicable | Proprio destinataires | Non | Storage `dossiers/...` |
| Contrat de travail / attestation employeur | Employi | **Sensible** | KYC stabilité revenus | Contrat | 3 ans après fin bail | Proprio destinataires | Non | Storage `dossiers/...` |
| Quittances de loyer antérieures | Patrimoniale | Standard | KYC historique paiement | Contrat | 3 ans après fin bail | Proprio destinataires | Non | Storage `dossiers/...` |
| Pièces garant (CNI, bulletins, avis) | Tiers | **Sensible** (consent garant requis) | KYC garant | Contrat + intérêt légitime | 3 ans après fin bail | Proprio destinataires | Non | Storage `dossiers/...` |
| Pièces libres (≤ 5 : attest. caf, hébergement…) | Mixte | Variable | KYC complément | Consentement | 3 ans après fin bail | Proprio destinataires | Non | `profils.dossier_docs_libres` (jsonb) |
| IBAN locataire (futur — bail avec auto-paiement) | Bancaire | **Sensible** | Quittances + auto-paiement | Contrat | 5 ans après dernier paiement (compta) | Plateforme + Stripe (futur) | Stripe USA — DPF | À documenter (V69+) |
| Photos de profil | Image | Standard | UI sociale | Consentement | Compte actif | Plateforme + visiteurs | Non (Supabase EU) | `profils.photo_url_custom`, Storage `avatars/` |
| Photos de logement | Patrimoniale | Standard | Annonce publique | Contrat (proprio) | Pendant publication + 30j | Tous visiteurs | Non | Storage `annonces/` |
| Géolocalisation logement (précise ou zone) | Géo | Standard si publique | Recherche annonces | Consentement (proprio choisit) | Pendant publication | Tous visiteurs | Non | `annonces.lat`, `lng`, `zone_floue` |
| Messages (chat) | Communication | Standard (peut contenir PII tiers) | Mise en relation | Contrat | Compte actif des 2 users | Émetteur + destinataire + admin support | Non | `messages` |
| Bail signé électroniquement | Contractuel | **Sensible** | Preuve bail | Obligation légale (eIDAS) | 10 ans (eIDAS art. 24) | Bailleur + locataire | Non | Storage `baux/` |
| États des lieux + signatures | Contractuel | **Sensible** | Preuve EDL | Contrat (loi 89) | 3 ans après fin bail | Bailleur + locataire | Non | `etats_des_lieux`, `edl_signatures` |
| Loyers + quittances PDF | Financière | **Sensible** | Suivi paiement | Contrat + obligation comptable | 5 ans (compta L.123-22) | Bailleur + locataire | Non | `loyers`, Storage `quittances/` |
| Logs accès dossier | Sécurité | Pseudonymisé | Audit RGPD | Intérêt légitime | 90 jours (politique) | Locataire owner uniquement | Non | `dossier_access_log` (`ip_hash`, `token_hash` SHA-256 salé) |
| Logs connexion (IP, UA, session) | Technique | Pseudonymisé | Sécurité | Intérêt légitime + LCEN | 12 mois (LCEN décret 2011-219) | Plateforme | Non | (à vérifier — Sentry, NextAuth) |
| Cookie consent | Préférence | Standard | Conformité Art. 7 | Obligation légale | Storage local 13 mois max | Navigateur user | Non | `localStorage.cookie_consent` |
| Notification preferences | Préférence | Standard | Opt-out granulaire | Consentement | Compte actif | Plateforme | Non | `profils.notif_preferences` (jsonb) |
| Token de partage dossier (HMAC) | Auth temporaire | Standard | Partage limité | Consentement (locataire émet) | 7 jours par défaut (max 30j) | Destinataire choisi par locataire | Non | `dossier_share_tokens` (JWT-like, hash en DB) |

**Catégories spéciales Art. 9** : la nationalité peut révéler l'origine ethnique (Art. 9.1) — base légale = contrat + dérogation Art. 9.2.b (obligations en matière de droit du logement) à mentionner explicitement dans la politique.

---

## 2. Audit article par article

### Art. 5 — Principes du traitement — 🟠

| Principe | Statut | Note |
|---|---|---|
| Licéité (5.1.a) | ✅ | Bases légales documentées dans politique (section 5) |
| Loyauté & transparence (5.1.a) | ✅ | Politique exhaustive `/confidentialite` |
| Limitation finalités (5.1.b) | ✅ | Section 4 finalités explicites |
| Minimisation (5.1.c) | 🟠 | `/api/profil/save` accepte tout `body.*` sauf admin-only — **PAS DE WHITELIST** des champs métier. Risque : un client peut écrire dans n'importe quelle colonne `profils` (consent_at, ban_reason si renommé...). Action : ajouter `ALLOWED_PROFIL_FIELDS` whitelist. |
| Exactitude (5.1.d) | ✅ | User peut éditer via `/profil` et `/parametres` |
| Limitation conservation (5.1.e) | 🔴 | Durées documentées dans politique mais **pas appliquées techniquement** : aucun cron de purge `dossier_access_log` (politique : 90j), `messages` (compte actif), `notifications` (1 an). Seul `db-backup` retient 7j. |
| Intégrité & confidentialité (5.1.f) | ✅ | RLS Phase 5 12/12, bcrypt 12, HTTPS, signed URLs |
| Responsabilité (5.2) | 🟠 | Pas de registre Art. 30 → preuve de conformité difficile |

### Art. 6 — Bases légales — ✅

Mappage explicite dans politique (section 5). Tous les traitements identifiés ont une base légale appropriée. Vigilance : **garant** (PII d'un tiers) — la base légale doit reposer sur le consentement explicite du garant lui-même, pas du locataire qui upload ses pièces. Action : ajouter case à cocher "Je certifie avoir l'accord écrit de mon garant pour téléverser ses pièces" dans `/dossier`.

### Art. 7 — Consentement — 🟠

| Critère | Statut | Note |
|---|---|---|
| Granulaire | ✅ | 4 catégories cookies + `notif_preferences` 12+ events |
| Refus aussi simple qu'accepter | ✅ | "Tout refuser" visible dans bandeau (CookieBanner.tsx l. 326) |
| Pas pré-coché | ✅ | Analytics + Marketing à false par défaut |
| Retrait facile | ✅ | Floating button cookie + toggle granulaire dans `/parametres` |
| **Preuve consent persistée en DB** | 🔴 | Stockée uniquement en `localStorage` → **non-opposable** si user vide son cache. **Aucun champ `consent_at` / `consent_version` en DB** sur `profils` ou `users`. Action : migration ajouter `profils.consent_cgu_at`, `consent_cgu_version`, `consent_cookies_jsonb`, log timestamp signup. |
| Réafficher tous les 13 mois | 🔴 | Aucune logique de re-prompt dans `CookieBanner.tsx` (vérifie `localStorage` exist, pas l'âge). Action : si `Date.now() - new Date(consent.date) > 13*30*24*3600_000` → re-show. |

### Art. 8 — Mineurs — 🟠

CGU section 3 : "Les personnes mineures ne sont pas autorisées à s'inscrire". **Aucun mécanisme de vérification d'âge** (date de naissance optionnelle dans signup). Action : ajouter case "Je certifie être majeur·e" obligatoire à la création de compte + valider date naissance ≥ 18 ans dans `/dossier`.

### Art. 12-14 — Information transparente — ✅

Politique de confidentialité riche (12 sections, 200 lignes). RAS sauf : la politique ne mentionne pas explicitement Art. 9 (catégories spéciales — nationalité) ni les durées EXACTES par catégorie (regroupées en bloc).

### Art. 15 — Droit d'accès — 🟠

`/api/profil/me` retourne le profil JSON pour la session. **Mais accès limité au profil** — pas aux messages, candidatures, visites, loyers, EDL, baux. Action : créer `/api/account/export` qui agrège **toutes** les tables liées à l'email user.

### Art. 16 — Droit de rectification — ✅

`/profil` + `/parametres` + `/dossier` permettent l'édition. Identité immuable post-vérification (migration 020) — exception légitime pour CNI vérifiée, mais **doit pouvoir être contestée** (mailto contact@, déjà documenté `buildMailtoModifIdentite`).

### Art. 17 — Droit à l'effacement — ✅

`/api/account/delete` avec confirmation "SUPPRIMER", rate-limit 1/h, cascade sur 6 tables (messages, visites, loyers, carnet_entretien, annonces, profils, users). 🟠 **Manque** : storage Supabase (`dossiers/`, `annonces/`, `quittances/`, `baux/`, `avatars/`) — les fichiers restent. Action : enrichir cascade avec `supabaseAdmin.storage.from("dossiers").remove([prefix])`. Manque aussi : `bail_invitations`, `bail_avenants`, `bail_signatures`, `edl_signatures`, `dossier_share_tokens`, `dossier_access_log`, `notifications`, `signalements`, `recherches_sauvegardees`, `favoris`.

### Art. 18 — Droit à la limitation — 🔴

Aucun flag `account_frozen` ou `traitement_limite` sur `profils` / `users`. Action : ajouter colonne + logique côté `/api/profil/save` pour refuser writes pendant litige.

### Art. 19 — Notification rectif/effacement aux destinataires — 🟠

Best-effort sur révocation lien partage (`dossier/share/[id] DELETE` envoie email au proprio destinataire) — bon. Mais **pas de notif** quand un user supprime son compte (les proprios qu'il a contactés ne sont pas avertis que ses pièces ne sont plus accessibles).

### Art. 20 — Droit à la portabilité — 🟠

`OngletCompte.telechargerMesDonnees()` exporte uniquement `profil` JSON. **Insuffisant** : RGPD impose un export structuré incluant *toutes* les données fournies activement par l'user (messages envoyés, candidatures, photos, etc.) au format CSV/JSON/XML. Action : créer `/api/account/export` (cf. Art. 15) qui zippe :
- `profil.json` (déjà fait)
- `messages.json` (envoyés + reçus)
- `candidatures.json`
- `visites.json`
- `annonces.json` (si proprio)
- `dossier-pieces.zip` (CNI, bulletins, etc. — copies des fichiers Storage)
- `consent-history.json`

### Art. 21 — Droit d'opposition — ✅

`notif_preferences` (jsonb) + 4 modes message (smart/digest/all/none) → opt-out granulaire fonctionnel.

### Art. 22 — Décisions automatisées — ✅

Politique section 4 : "algorithme interne, aucun profilage automatisé avec effet juridique au sens de l'article 22". Confirmé : matching score ne refuse aucune candidature, juste un ordre d'affichage. Action mineure : documenter que le score est consultable et explicable par l'utilisateur (déjà partiellement le cas — `/api/matching` donne le détail).

### Art. 25 — Privacy by design / by default — ✅

| Critère | Statut |
|---|---|
| RLS lockdown 12/12 (Phase 5) | ✅ |
| Whitelist `dossier-partage` n'expose pas tout `profils.*` | 🟠 (le code `select("*")` ramène tout, le filtre est côté UI) |
| Géo précise opt-in proprio | ✅ |
| Logs IP hashés sel server-side | ✅ (`hashIP` + `DOSSIER_LOG_SALT` obligatoire) |
| Tokens HMAC stateless | ✅ |
| Signed URLs Supabase TTL aligné expiration | ✅ |
| Cache-Control private no-store sur signed URLs | ✅ |

### Art. 28 — Sous-traitants — 🟠

Listés dans politique :
- ✅ Vercel (USA — DPF) — hébergement
- ✅ Supabase (EU Frankfurt) — DB + storage + auth
- ✅ Resend (USA — DPF, sous-processeur AWS SES) — emails
- ✅ Cloudflare (mondial — DPF) — CDN + DDoS
- ✅ Google (USA — DPF) — OAuth
- ✅ Anthropic (USA — DPF) — IA conversationnelle
- ✅ Upstash (EU) — rate-limit Redis
- 🔴 **Stripe (futur)** — non listé, à anticiper avant lancement paiements
- 🔴 **Sentry** — utilisé en prod (cf. memory) mais **PAS listé** dans la politique de confidentialité

**DPA signés** : aucun document archivé centralement. Action : créer `docs/rgpd/dpa/` avec :
- DPA Vercel (Vercel Inc. Data Processing Addendum, signature électronique dashboard Vercel)
- DPA Supabase (auto-accepted at signup, mais télécharger une copie)
- DPA Resend (à demander depuis dashboard Resend)
- DPA Sentry (à activer dans org settings)

### Art. 30 — Registre des traitements — 🔴

**ABSENT**. Obligation légale (Art. 30.1) pour toute organisation traitant régulièrement des données — KeyMatch est un responsable de traitement principal. Doit lister chaque finalité avec : identité responsable + DPO, catégories de personnes, catégories de données, destinataires, transferts, durées, mesures de sécurité.

→ **Action P0** : créer `docs/rgpd/registre-traitements.md` avec template ci-dessous (cf. fixes Top 10).

### Art. 32 — Sécurité du traitement — ✅

| Mesure | Statut |
|---|---|
| Chiffrement at-rest | ✅ (Supabase EU Frankfurt encrypted, bcrypt 12 passwords) |
| Chiffrement in-transit | ✅ (HTTPS partout, HSTS supposé) |
| Pseudonymisation logs | ✅ (`ip_hash`, `token_hash` SHA-256 salé) |
| Confidentialité — RLS | ✅ (Phase 5 lockdown 12/12) |
| Intégrité — signatures eIDAS | ✅ (`bail_signatures`, `edl_signatures`) |
| Disponibilité — backups | ✅ (cron `db-backup` rétention 7j) |
| Test régulier sécurité | 🟠 (tests unitaires `dossierToken.test.ts`, `dossierAccessLog.test.ts` — mais pas de pen-test annuel) |
| Authentification forte | 🟠 (NextAuth Google OAuth + email/password ; **pas de MFA**) — recommandé pour propriétaires gérant plusieurs biens |

### Art. 33-34 — Notification de violation — 🟠

Politique section 8 mentionne "engagement à notifier la CNIL dans les 72 heures". Mais **aucune procédure interne formalisée** : pas de doc `incident-response.md`, pas de runbook, pas d'astreinte définie, pas de template de notification CNIL pré-rempli, pas de mécanisme automatique de détection d'anomalie (Sentry alerte ≠ violation RGPD).

→ Action : créer `docs/rgpd/incident-response.md` (cf. Top 10).

### Art. 35 — Analyse d'impact (DPIA) — 🔴

**OBLIGATOIRE** pour KeyMatch. Critères CNIL déclencheurs réunis :
1. ✅ Évaluation/scoring (matching algo) — critère 1
2. ✅ Traitement à grande échelle (marketplace ouverte au public) — critère 5
3. ✅ Données financières sensibles (fiches paie, IBAN, avis imposition) — critère 7 sur la liste CNIL des traitements soumis à DPIA
4. ✅ Croisement de données (KYC + matching + scoring) — critère 4

→ **Action P0** : DPIA obligatoire AVANT lancement commercial. Scope minimum :
- Description finalité : matching + KYC + signature bail
- Nécessité & proportionnalité : justifier chaque pièce demandée vs décret 2015-1437
- Risques : fuite dossier (signed URL fuite), profilage non-conforme, accès non autorisé proprio
- Mesures : RLS, hashing, audit-trail, expiration tokens, rate-limit
- Consultation DPO + personnes concernées (panel beta-testeurs)

→ Template à créer `docs/rgpd/dpia.md`.

### Art. 37-39 — DPO — 🟠

Politique mentionne `contact@keymatch-immo.fr` comme contact RGPD. **Pas de DPO formellement désigné** ; pour KeyMatch (responsable principal traitant des données sensibles à grande échelle), **DPO obligatoire (Art. 37.1.b)**. Action : désigner formellement (Paul Sadrant si fondateur ou DPO externe mutualisé), publier nom + contact en politique, déclarer à la CNIL via formulaire en ligne.

### Art. 44-49 — Transferts hors UE — ✅

Politique section 10 mentionne DPF (décision adéquation 10 juillet 2023). RAS sauf documenter les SCC (Standard Contractual Clauses) en backup au cas où DPF est invalidé (3e Schrems possible).

---

## 3. DPIA — Recommandée : OUI, OBLIGATOIRE

**Scope DPIA KeyMatch v1** :
1. Système de matching avec scoring (1000 pts) — décrire algo, prouver absence d'effet juridique
2. KYC locataire avec stockage CNI + fiches paie + IBAN — décrire flux upload, signed URL, durée
3. Partage dossier par lien HMAC — décrire chaîne de custody, audit-trail, révocation
4. Signature électronique eIDAS bail + EDL — décrire conformité règlement 910/2014

Template à utiliser : modèle CNIL (PIA Software) ou framework `docs/rgpd/dpia.md` à rédiger.

Délai : **avant lancement commercial** (= avant que les premiers loyers payants transitent OU avant ouverture publique non-beta, le plus tôt étant le déclencheur).

---

## 4. Top 10 fixes — Pré-paid-launch OBLIGATOIRES

### P0 — Blockers réglementaires

1. **🔴 Rédiger DPIA** (Art. 35) — sans DPIA, sanction administrative directe possible. Template CNIL PIA. Estimation : 2-4 jours rédaction + 1 jour consultation user panel.
2. **🔴 Créer registre traitements** `docs/rgpd/registre-traitements.md` (Art. 30) — version markdown puis tableur si scaling. Estimation : 1 jour.
3. **🔴 Endpoint `/api/account/export`** complet (Art. 15 + 20) — agrège profil + messages + candidatures + visites + dossier zip + annonces + consent-history. Estimation : 1 jour.
4. **🔴 Persister consentement en DB** : migration `profils.consent_cgu_at TIMESTAMPTZ`, `consent_cgu_version TEXT`, `consent_cookies JSONB`, `consent_marketing_at TIMESTAMPTZ` + log au signup et à chaque acceptation cookie banner via `/api/consent/log`. Estimation : 0.5 jour.

### P1 — Risque réglementaire élevé

5. **🟠 Procédure incident-response** `docs/rgpd/incident-response.md` (Art. 33-34) — runbook 72h CNIL, template notification, contacts d'urgence, déclencheurs. Estimation : 0.5 jour.
6. **🟠 Whitelist `ALLOWED_PROFIL_FIELDS`** dans `/api/profil/save` (Art. 5.1.c minimisation) — empêcher écriture champs non-prévus. Estimation : 30 min.
7. **🟠 Cron purge** `dossier_access_log` > 90j + `notifications` > 1 an + `messages` orphelins (Art. 5.1.e). Estimation : 0.5 jour.
8. **🟠 Cascade Storage** dans `/api/account/delete` (Art. 17) — supprimer fichiers `dossiers/`, `avatars/`, `annonces/`, `quittances/`, `baux/` + tables manquantes (`dossier_share_tokens`, `dossier_access_log`, `bail_*`, `edl_*`, `notifications`, `favoris`, `recherches_sauvegardees`, `signalements`). Estimation : 0.5 jour.

### P2 — Hygiène / hardening

9. **🟠 Vérification âge majeur** au signup (Art. 8) — checkbox "Je certifie être majeur·e" + validation `date_naissance` ≥ 18 ans dans dossier. Estimation : 30 min.
10. **🟠 Re-prompt cookie banner après 13 mois** + ajouter Sentry à la liste des sous-traitants dans politique. Estimation : 30 min total.

### Bonus (post-launch, M+1)

- MFA pour proprios (Art. 32) — TOTP via authenticator app
- DPA archivés `docs/rgpd/dpa/` (Vercel, Supabase, Resend, Sentry, Cloudflare) — copies pdf
- Désigner DPO formellement (interne ou mutualisé) + déclarer CNIL
- Flag `traitement_limite` sur `profils` (Art. 18)
- Notification destinataires lors de suppression compte (Art. 19) — email aux proprios contactés
- Consentement explicite garant (Art. 7 — base légale tiers)

---

## 5. Sous-traitants — Liste à mentionner dans politique de confidentialité

État actuel et corrections nécessaires :

| Sous-traitant | Rôle | Localisation | Garantie transfert | Présent dans `/confidentialite` ? |
|---|---|---|---|---|
| Vercel Inc. | Hébergement Next.js | USA | DPF | ✅ |
| Supabase Inc. | DB + Storage + Auth | EU (Frankfurt) | UE | ✅ |
| Resend (sous-processeur AWS SES) | Emails transactionnels | USA | DPF + sous-DPA AWS | ✅ |
| Cloudflare | CDN + DDoS | Mondial | DPF | ✅ |
| Google LLC | OAuth + Maps potentiel | USA | DPF | ✅ |
| Anthropic PBC | IA conversationnelle (si activée) | USA | DPF | ✅ |
| Upstash | Rate-limit Redis | EU | UE | ✅ |
| **Sentry (Functional Software Inc.)** | Monitoring erreurs prod | USA | DPF | 🔴 **À AJOUTER** |
| **GitHub (Microsoft)** | Repository + CI | USA | DPF | 🟡 ajouter si reste actif sur prod |
| **OpenStreetMap Foundation** | Tuiles cartes | UK + EU | UE/Adéquation | 🟡 (déjà mentionné dans cookies, à ajouter dans confidentialité) |
| **OVH** | Domaine `.fr` | EU (France) | UE | 🟡 ajouter par exhaustivité |
| **Stripe (futur)** | Paiements en ligne | USA + EU | DPF | 🔴 anticiper avant V69 paid launch |

→ Mettre à jour `app/confidentialite/page.tsx` section 6 avec les 4 manquants ci-dessus.

---

## 6. Mécanismes vérifiés (ce qui marche)

- ✅ **Audit-trail dossier** : `dossier_access_log` avec `ip_hash` (SHA-256 + sel obligatoire `DOSSIER_LOG_SALT`), `token_hash` (16 chars), `user_agent` tronqué 200 chars, `document_key`. RLS Phase 5 (mig 051). UI `/dossier` AccessLogPanel pour visualiser.
- ✅ **Tokens HMAC stateless** : signature SHA-256 + `NEXTAUTH_SECRET`, expiration 7j par défaut (max 30j), `crypto.timingSafeEqual` pour vérif (anti-timing-attack).
- ✅ **Révocation tokens** : `dossier_share_tokens.revoked_at`, vérifié à chaque accès (page + chaque file/[key]/[index]).
- ✅ **Signed URLs Supabase** : TTL aligné sur expiration JWT, redirect 302, `Cache-Control: private, no-store` (anti-cache CDN).
- ✅ **Suppression compte** : `/api/account/delete`, confirmation "SUPPRIMER", rate-limit 1/h, cascade 6 tables.
- ✅ **Cookie banner CNIL** : 4 catégories, "Tout refuser" aussi visible, pas pré-coché, retrait via floating button, lien `/cookies` détaillé.
- ✅ **Opt-out granulaire** : `notif_preferences` jsonb, 12+ events, mode messages 4 niveaux (smart/digest/all/none), required flag pour signaux légaux non désactivables.
- ✅ **Robots noindex** sur `/dossier-partage/[token]` (`metadata.robots = { index: false, follow: false }`).
- ✅ **Identité immuable post-vérification** (mig 020) avec mailto contestation.

---

## 7. Synthèse exécutive

KeyMatch dispose d'une **architecture technique RGPD-friendly solide** (RLS lockdown, audit-trail hashé, tokens HMAC, signed URLs, séparation rôles, bcrypt 12). Le travail technique des Phases 1-5 sécurité est de qualité.

**MAIS** les **livrables documentaires obligatoires sont absents** (registre Art. 30, DPIA Art. 35) et plusieurs **mécanismes utilisateur sont incomplets** (export portabilité, persistance consent, cascade Storage à la suppression).

**Verdict** : KeyMatch peut continuer la beta gratuite actuelle, mais **NE PEUT PAS lancer commercialement** (paiements, V69+) sans :
1. DPIA rédigée
2. Registre des traitements
3. Export portabilité complet
4. Persistance consent en DB
5. Procédure incident-response

Les 5 fixes P0 prennent ~5-7 jours de travail. Cette charge est **incompressible** côté CNIL — n'importe quel contrôle ou plainte aboutirait à constatation d'infraction sans ces livrables.

— Fin de l'audit RGPD KeyMatch 2026-05-06
