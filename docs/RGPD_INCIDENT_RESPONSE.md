# Procédure d'incident de sécurité RGPD — KeyMatch

**Statut** : V79.4 — version initiale opérationnelle. À tester via tabletop
exercise pré-paid launch.
**Date** : 2026-05-07
**Version** : 1.0
**Responsable** : Paul X (responsable de traitement)
**DPO** : à désigner formellement pré-paid launch (cf [DPIA](RGPD_DPIA_KEYMATCH.md))
**Contact d'urgence** : `privacy@keymatch-immo.fr`

L'article 33 RGPD impose la notification d'un incident à la CNIL **dans les
72h** suivant sa connaissance, sous peine de sanction (jusqu'à 2 % du CA
mondial OU 10 M€). L'article 34 impose la notification aux personnes
concernées si le risque est élevé.

Ce document définit la procédure interne KeyMatch pour respecter ces délais.

---

## 1. Qu'est-ce qu'un "incident de sécurité" RGPD ?

Selon l'art. 4.12 RGPD : "violation de données" =
> Toute violation de la sécurité entraînant, de manière accidentelle ou
> illicite, la destruction, la perte, l'altération, la divulgation non
> autorisée de données à caractère personnel transmises, conservées ou
> traitées d'une autre manière, ou l'accès non autorisé à de telles données.

### Exemples concrets pour KeyMatch

| Type | Exemple |
|---|---|
| 🔴 **Accès non autorisé** | Compromission compte admin · faille RLS · token HMAC dossier dérobé · bruteforce auth réussi |
| 🔴 **Divulgation** | Bug rendant `dossier_docs` accessible à un autre user · email envoyé au mauvais destinataire avec PII |
| 🔴 **Fuite externe** | Compromise sous-traitant (Supabase / Vercel / Resend) · dump DB public · push accidentel `.env.local` sur GitHub |
| 🟠 **Altération** | Tampering `bail_signed_hash` (eIDAS art. 26) · modification illicite `dossier_docs` · dépose CNI altérée |
| 🟠 **Destruction** | Suppression DB accidentelle · ransomware · perte sauvegarde |
| 🟠 **Perte** | Vol device admin avec session active · clé API perdue / leakée |
| 🟢 **Phishing** | Email usurpant KeyMatch envoyé à des users (pas un breach KeyMatch direct, mais à monitorer) |

---

## 2. Détection

### 2.1 Signaux automatiques

| Source | Mécanisme | Sévérité |
|---|---|---|
| `/api/health/full` (V71.4) | Service `down` détecté → INSERT auto dans `incidents` table | 🟠 Major |
| `app/error.tsx` (V72.4) | Erreur runtime client → POST `/api/admin/incident-auto` | 🟢 Minor |
| `app/global-error.tsx` (V72.4) | Layout root crash → POST `/api/admin/incident-auto` | 🔴 Critical |
| Sentry (`@sentry/nextjs`) | Toute exception non catchée → alerte email Paul | 🟠 Major |
| RLS violation Postgres | `PGRST` errors → log Supabase + alerte si volume | 🔴 Critical |
| Rate-limit Upstash | > 60/min/IP sustained → log + manual review | 🟠 Major |
| `/api/cron/verify-integrity-baux` | SHA-256 mismatch sur signature bail → notif Paul | 🔴 Critical |

### 2.2 Signaux manuels

| Source | Action recommandée |
|---|---|
| Email user signalant accès suspect / compte compromis | Triage immédiat, sécuriser compte, investigation |
| Dispute mail Resend / SPF report | Vérifier si phishing usurpant KeyMatch ou breach interne |
| Researcher security email (`security@`) | Acknowledger sous 24h, suivre coordonnée disclosure |
| Notification sous-traitant (Supabase status, Vercel incident) | Évaluer impact KeyMatch, re-notifier users si nécessaire |

### 2.3 Veille proactive

- 1×/semaine : check `/admin/health` (V71.6) — incidents persistants
- 1×/semaine : check Sentry dashboard
- 1×/jour (cron) : `/api/cron/verify-integrity-baux` (à recâbler V80, cf [docs/UPTIME_ROBOT_SETUP.md](UPTIME_ROBOT_SETUP.md))
- 1×/mois : audit logs `dossier_access_log` — patterns suspects

---

## 3. Triage et qualification

### Niveau de gravité

| Niveau | Critère | Délai notification CNIL |
|---|---|---|
| 🔴 **P0 Critique** | Volume > 1000 users OR données très sensibles (CNI, IBAN, fiches paie) divulguées OR breach actif en cours | < 24h (idéalement immédiat) |
| 🟠 **P1 Major** | Volume 50-1000 users OR PII standard divulguée OR breach contenu mais investigation en cours | < 72h |
| 🟢 **P2 Minor** | Volume < 50 users OR risque résiduel faible OR incident purement technique sans PII | Évaluer cas par cas (notification possible mais pas obligatoire si "improbable risque") |

### Critères pour notifier les utilisateurs (RGPD art. 34)

Notification user OBLIGATOIRE si :
- Risque **élevé** pour leurs droits et libertés
- ET pas de mesure de mitigation rendant le risque "improbable"

Mesures qui dispensent de notification user :
- Données chiffrées at-rest ET clés non compromises (ex: Supabase AES-256)
- Mesures post-breach effaçant le risque (ex: rotation tokens compromis)
- Notification disproportionnée → alternative communication publique
  (bandeau `/status` + post Twitter/Mastodon)

---

## 4. Procédure 72h pas à pas

### H+0 : Détection

Action immédiate :
1. Ouvrir incident dans la table `incidents` (V71.3) :
   ```sql
   INSERT INTO incidents (severity, status, title, description, started_at)
   VALUES ('critical', 'investigating', 'Description courte', 'Stack + contexte', NOW());
   ```
   Ou via UI `/admin/health` → bouton "Créer incident manuel".
2. Setup channel de communication crisis : Discord/WhatsApp DM avec DPO + tech lead
3. Préserver les logs : DB snapshot Supabase + dump Sentry events + logs Vercel functions

### H+0 → H+2 : Investigation

Objectifs :
- Scope : combien de users affectés ? quelles données ?
- Vector : comment l'incident s'est-il produit ?
- Status : breach actif (en cours) ou contenu (déjà arrêté) ?

Outils :
- Supabase logs : `select * from pg_audit_log where created_at > [start_time]`
- Vercel logs : Dashboard → Logs filter par incident time window
- Sentry events : filter par tag/release/user
- `dossier_access_log` (1 an rétention) : qui a accédé à quoi quand ?

### H+2 → H+24 : Containment + remediation

Si breach actif :
1. Isoler la cause :
   - Compte admin compromis → revoke session NextAuth + force re-auth + 2FA
   - Token API compromis → rotate (Supabase service-role, Resend, Vercel)
   - Faille RLS → désactiver la query problématique server-side, audit policies
   - Faille route API → patch immédiat + redeploy
2. Notifier les sous-traitants concernés (formulaire incident Supabase, support Vercel)
3. Documenter dans incident record (`UPDATE incidents SET status = 'identified', ...`)

Si breach contenu déjà :
1. Vérifier qu'il ne se reproduit pas (monitoring renforcé 7j)
2. Passer à phase notification

### H+24 → H+72 : Notification CNIL

Si > 50 personnes affectées OU données sensibles OR risque élevé :

1. **Formulaire CNIL** : https://notifications.cnil.fr/notifications/index
2. Sections à remplir :
   - **Identité responsable** : KeyMatch (entrepreneur individuel Paul X / SAS post-launch) — adresse, SIREN
   - **DPO** : email + tel (à mettre à jour dès désignation V79+)
   - **Description incident** : nature, date détection, date approximative début, durée
   - **Catégories de personnes** : nombre approximatif locataires/proprios/garants
   - **Catégories de données** : identité / financières / dossier KYC / messages / etc.
   - **Conséquences probables** : usurpation identité (CNI), fraude (IBAN), spam (email), etc.
   - **Mesures prises** : containment, rotation tokens, patch, notification sous-traitant
   - **Mesures user** : email envoyé X recipients, bandeau site, FAQ /status

3. Conserver l'accusé de réception (référence dossier CNIL)

### H+24 → H+72 : Notification users (si requis)

Conditions :
- Risque élevé pour droits/libertés (cf §3)
- Pas de mesure compensatoire dispensant

Format : email + bandeau site + post `/status`.

Modèle email — voir §6 ci-dessous.

### Post-incident (J+7 / J+30)

1. Rapport public sur `/status` page (V71.5)
2. ADR : `docs/adr/NNNN-incident-YYYY-MM-DD.md`
3. Tabletop exercise : revue avec DPO de ce qui a marché / pas marché
4. Update procédure si lessons learned (PR docs)
5. Réponse aux user questions sur l'incident (FAQ dédiée si > 10 demandes)

---

## 5. Contacts d'urgence

### Autorités

| Entité | Contact | Quand |
|---|---|---|
| **CNIL** | https://notifications.cnil.fr/notifications/index | Notification 72h art. 33 |
| **CNIL plaintes** | https://www.cnil.fr/fr/plaintes | Pour info user, pas pour notif RT |
| **ANSSI CERT-FR** | https://www.cert.ssi.gouv.fr/ | Si attaque sophistiquée / état nation |
| **Police judiciaire (Pharos)** | https://www.internet-signalement.gouv.fr/ | Si crime (ransomware, extorsion) |

### Sous-traitants

| Sous-traitant | Contact incident | SLA |
|---|---|---|
| **Supabase** | https://supabase.com/dashboard/support | Pro plan = SLA 4h business hours |
| **Vercel** | https://vercel.com/support | Pro plan = SLA 24h, Enterprise = 1h |
| **Resend** | support@resend.com | Best-effort sur Free, SLA 24h sur Pro |
| **Sentry** | support@sentry.io | Best-effort Free |
| **Upstash** | support@upstash.com | Best-effort Free |
| **Google (NextAuth)** | https://workspace.google.com/support/ | Selon plan Workspace |

### Externes (pré-paid launch)

| Rôle | Contact | Coût indicatif |
|---|---|---|
| **DPO externe** | À recruter (cabinet DPO certifié) | 3-5k€ setup + 500€/mois |
| **Avocat RGPD** | À recruter (réseau Bar de Paris) | 200-400€/h |
| **Pen-test ANSSI-cert** | À sourcer pré-paid launch | 3-5k€ /audit |
| **Communication crise** | À sourcer si volume > 10k users | Variable |

---

## 6. Modèle email — Notification user

> **Objet** : [KeyMatch] Information importante concernant la sécurité de votre compte
>
> Bonjour {{ prenom }},
>
> KeyMatch a détecté le {{ date_detection }} un incident de sécurité ayant
> potentiellement affecté vos données personnelles. Nous tenons à vous
> informer dans le respect du Règlement Général sur la Protection des Données
> (RGPD art. 34).
>
> **Quoi s'est-il passé ?**
> {{ description_simple_une_phrase }}.
>
> **Quelles données sont concernées ?**
> {{ liste_categories_PII : ex. "votre adresse email, votre nom, et votre
> profil locataire (sans CNI ni fiches paie)" }}.
>
> **Quel risque pour vous ?**
> {{ analyse_risque_simple : ex. "Le risque de fraude est faible car aucune
> donnée financière ni pièce d'identité n'a été divulguée. Néanmoins, soyez
> vigilant face à d'éventuels emails de phishing usurpant KeyMatch." }}.
>
> **Que faisons-nous ?**
> - Nous avons {{ action_immediate : ex. "désactivé la faille à 14h32 le 7 mai 2026" }}
> - Nous avons notifié la CNIL dans les délais légaux (référence dossier
>   {{ ref_CNIL }})
> - Nous renforçons {{ mesure_long_terme : ex. "nos contrôles d'accès et
>   procédure de revue de code" }}
>
> **Que devez-vous faire ?**
> - Changer votre mot de passe KeyMatch immédiatement (si applicable)
> - Activer la double authentification dès qu'elle sera disponible (V80+)
> - Signaler tout email suspect à `privacy@keymatch-immo.fr`
> - Surveiller votre compte bancaire si données financières concernées
>
> **Vos droits**
> Vous disposez à tout moment des droits d'accès, rectification, effacement,
> portabilité, opposition. Pour exercer ces droits ou pour toute question :
> `privacy@keymatch-immo.fr`. Vous pouvez également déposer plainte auprès
> de la CNIL : https://www.cnil.fr/fr/plaintes
>
> Nous nous excusons pour la gêne occasionnée et restons à votre disposition.
>
> L'équipe KeyMatch
> https://keymatch-immo.fr/status — pour le statut public en temps réel
>
> ---
> KeyMatch SAS — siège : {{ adresse }} — SIREN {{ siren }} — DPO :
> privacy@keymatch-immo.fr

---

## 7. Modèle notification CNIL

Champs typiques du formulaire CNIL en ligne (à pré-remplir avant envoi
pour gagner du temps sous pression) :

```yaml
identite_responsable_traitement:
  raison_sociale: "KeyMatch SAS"
  forme_juridique: "Société par Actions Simplifiée"
  siren: "{{TODO}}"
  adresse_siege: "{{TODO}}"
  representant_legal: "Paul X — Président"
  email: "contact@keymatch-immo.fr"
  telephone: "{{TODO}}"

dpo:
  nom: "{{À désigner V79+}}"
  email: "privacy@keymatch-immo.fr"

incident:
  date_detection: "{{ISO 8601 UTC}}"
  date_debut_estimee: "{{ISO 8601 UTC}}"
  duree_minutes: "{{nombre}}"
  type_violation:
    - confidentialité  # divulgation non autorisée
    - intégrité         # altération
    - disponibilité     # destruction/perte
  description: |
    {{ Description neutre factuelle. Ex :
       "Une faille dans la policy RLS de la table `messages` a permis à
       un utilisateur authentifié de lire les messages d'autres conversations
       dans lesquelles il n'était pas participant. Détecté le 2026-05-07
       à 14h32 UTC via remontée user. Containment : policy patchée et
       redeploy à 15h08 UTC. Aucune fuite externe identifiée."
    }}

categories_personnes_concernees:
  - locataires: "{{ nombre approximatif }}"
  - proprietaires: "{{ nombre }}"
  total_estime: "{{ nombre }}"

categories_donnees:
  - identite_civile  # nom, prénom, email, téléphone
  - donnees_localisation  # ville souhaitée, adresse souhaitée
  - donnees_economiques  # revenus, IBAN, garant
  - donnees_identification  # CNI, fiches paie
  - donnees_communication  # messages chat
  - autre: "{{ précisions }}"

consequences_probables: |
  {{ Ex : "Risque limité d'usurpation d'identité car les CNI sont stockées
     dans un bucket Storage chiffré séparé non touché. Risque principal :
     atteinte à la vie privée (lecture conversations privées). Aucune
     conséquence financière directe identifiée." }}

mesures_techniques_organisationnelles:
  preventives:
    - "RLS Phase 5 sur 12/12 tables (lockdown V67-V70)"
    - "Audit policies trimestriel"
  prises_a_la_decouverte:
    - "Patch immédiat policy RLS — redeploy en 36 minutes"
    - "Audit complet des tables RLS pour pattern similaire — clean"
    - "Notification CNIL"
    - "Notification users affectés"
  futures:
    - "Pen-test ANSSI-cert programmé Q3 2026"
    - "DPO externe désigné Q3 2026"

notification_users:
  effectuee: true
  date: "{{ISO 8601}}"
  modalite: "email + bandeau site + post /status public"
  template: "voir RGPD_INCIDENT_RESPONSE.md §6"
  total_emails_envoyes: "{{nombre}}"

documentation_complementaire:
  - "Lien vers post-mortem public sur /status"
  - "Lien vers ADR docs/adr/NNNN-incident-YYYY-MM-DD.md (interne)"
```

---

## 8. Tests de la procédure (tabletop exercises)

À planifier 1×/an minimum :
- Scenario 1 : breach RLS Supabase (volume 500 users, données dossier KYC)
- Scenario 2 : leak `.env.local` GitHub (clés API exposées)
- Scenario 3 : compromise compte admin (full access)

Pour chaque tabletop :
1. Réunir DPO + tech lead + Paul X
2. Simuler les 72h (compressé sur 2-3h)
3. Mesurer : temps détection, temps containment, temps notif, qualité notif
4. Identifier gaps procédure → PR mise à jour ce doc

---

## 9. Liens utiles

- [CNIL — Notifier une violation de données](https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles)
- [CNIL — Quelles violations notifier ?](https://www.cnil.fr/fr/les-violations-de-donnees-personnelles)
- [RGPD UE 2016/679 — Articles 33 et 34](https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX%3A32016R0679#d1e3076-1-1)
- [ANSSI CERT-FR](https://www.cert.ssi.gouv.fr/)
- [DPIA KeyMatch](RGPD_DPIA_KEYMATCH.md) — analyse de risque détaillée
- [Registre Article 30](RGPD_REGISTRE_ARTICLE_30.md) — 7 traitements documentés
- [VERCEL_HOBBY_LIMITS.md](VERCEL_HOBBY_LIMITS.md) — crons retirés
- [UPTIME_ROBOT_SETUP.md](UPTIME_ROBOT_SETUP.md) — monitoring externe
