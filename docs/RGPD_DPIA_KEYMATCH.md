# DPIA — Analyse d'Impact RGPD KeyMatch

**Statut** : V78.1 — version initiale, à valider par DPO externe avant
paid launch. Score audit RGPD V72.5 = 62/100 (le plus bas — bloquait
le passage commercial).

**Date** : 2026-05-07
**Version** : 1.0
**Responsable de traitement** : KeyMatch (entrepreneur individuel Paul X
en phase beta — à transformer en SAS pré-paid launch)

---

## 1. Pourquoi cette DPIA ?

L'article 35 RGPD impose une DPIA pour les traitements qui présentent un
**risque élevé** pour les droits et libertés des personnes. KeyMatch
remplit **2 critères CNIL** déclencheurs :
- Traitement de **données financières** (revenus, IBAN, fiches paie)
- Traitement de **données d'identité** (CNI, numéro fiscal, adresse)
- **Profilage** (matching algorithmique 1000 points)
- **Combinaison de données** (locataire + propriétaire + bail + EDL)

→ DPIA OBLIGATOIRE selon CNIL guidelines (cf. https://www.cnil.fr/fr/RGPD-analyse-impact-protection-donnees-aipd).

---

## 2. Description du traitement

### 2.1 Vue d'ensemble

KeyMatch est une plateforme de location immobilière entre particuliers
qui :
- Met en relation locataires et propriétaires (matching algorithmique)
- Permet la signature électronique de bail eIDAS niveau 1
- Génère et stocke les états des lieux contradictoires (EDL entrée/sortie)
- Suit les loyers (encaissement, indexation IRL, quittances PDF)
- Gère la communication entre parties (messagerie chiffrée transit HTTPS)

### 2.2 Diagramme de flux des données

```
Locataire saisit dossier (CNI, fiches paie, IBAN, garant)
    ↓
Stockage Supabase (US, DPA + CCT) — RLS Phase 5 verrouillée 12/12 tables
    ↓
Partage avec proprio sélectionné via lien tokenisé HMAC TTL 7j
    ↓
Proprio valide candidature → bail signé eIDAS niveau 1
    ↓
Hash audit-trail SHA-256 stocké (eIDAS art. 26)
    ↓
EDL entrée → photos + signatures → archive 5 ans après fin bail
    ↓
Quittances mensuelles + indexation IRL annuelle
```

---

## 3. Finalités du traitement

| Finalité | Base légale | Article RGPD |
|---|---|---|
| Matching locataire/proprio | Consentement | Art. 6.1.a |
| Vérification solvabilité (revenus, garant) | Consentement + intérêt légitime proprio | Art. 6.1.a + 6.1.f |
| Signature électronique bail | Exécution du contrat | Art. 6.1.b |
| Conservation bail + EDL (5 ans) | Obligation légale (loi 89-462) | Art. 6.1.c |
| Conservation factures (10 ans) | Obligation légale (Code commerce L123-22) | Art. 6.1.c |
| Notification d'incidents loyer | Exécution du contrat | Art. 6.1.b |
| Indexation IRL annuelle | Obligation légale | Art. 6.1.c |
| Statistiques agrégées anonymes | Intérêt légitime | Art. 6.1.f |

---

## 4. Catégories de données collectées

### 4.1 Locataires

| Catégorie | Sensibilité | Conservation | Justification |
|---|---|---|---|
| Identité (nom, prénom, email, téléphone) | Standard | 3 ans après dernier accès | Compte utilisateur |
| CNI (recto/verso) | **Élevée** | 5 ans après fin bail | Vérification identité ALUR |
| Revenus mensuels nets | Sensible (financière) | 5 ans après fin bail | Solvabilité ALUR |
| Fiches paie (3 dernières) | Sensible | 5 ans après fin bail | Vérification revenus |
| IBAN | Sensible | 5 ans après fin bail | Prélèvement loyer (futur) |
| Garant (identité + revenus) | Sensible | 5 ans après fin bail | Cautionnement ALUR |
| Localisation souhaitée | Standard | 3 ans | Matching algorithmique |
| Critères de recherche (budget, surface, etc.) | Standard | 3 ans | Matching algorithmique |
| Score matching (1000 pts) | Standard (dérivé) | Calcul à la volée, non stocké | Pas de profilage persistant |

### 4.2 Propriétaires

| Catégorie | Sensibilité | Conservation | Justification |
|---|---|---|---|
| Identité (nom, prénom, email, téléphone) | Standard | 3 ans après dernier accès | Compte utilisateur |
| Adresse postale | Standard | 5 ans après fin bail | Mentions légales bail |
| RIB pour réception loyers | Sensible | 5 ans après fin bail | Encaissement |
| SIRET (si pro) | Standard | 5 ans | Conformité fiscale |
| Annonces immobilières (photos, descriptifs) | Standard | 5 ans | Historique location |

### 4.3 Communications

| Catégorie | Sensibilité | Conservation | Justification |
|---|---|---|---|
| Messages chat | Standard à sensible (selon contenu) | 3 ans après fin conversation | Preuve échanges, ALUR |
| Pièces jointes (PDF, images) | Selon type | 3 ans | Idem |
| Logs accès dossier | Audit | 1 an | Sécurité, traçabilité RGPD |

---

## 5. Catégories de personnes concernées

- **Locataires** : utilisateurs principaux, ~80% du trafic projeté
- **Propriétaires bailleurs** : ~15% du trafic
- **Garants** (cautionnement) : données collectées via locataire,
  consentement explicite via formulaire dédié + acceptation CGU
- **Visiteurs anonymes** : annonces publiques, pas de PII collectée
  (sauf cookies analytics anonymisés post-V78 si Vercel Analytics activé)

---

## 6. Destinataires des données

### 6.1 Internes
- Paul X (responsable de traitement, accès admin via `is_admin=true`)
- DPO externe (à recruter pré-paid launch)
- Support technique (à recruter post-PMF)

### 6.2 Sous-traitants (DPA + CCT requis)

| Sous-traitant | Localisation | Rôle | DPA signé ? |
|---|---|---|---|
| Vercel Inc. | US (Delaware) | Hébergement frontend + API | ⚠️ Standard DPA Vercel — CCT inclus |
| Supabase Inc. | US (Delaware) | Base de données + Auth + Storage | ⚠️ Standard DPA Supabase — CCT inclus |
| Resend Inc. | US (Delaware) | Envoi emails transactionnels | ⚠️ Standard DPA Resend — CCT inclus |
| Sentry | US/EU split | Error tracking | ⚠️ DPA + CCT |
| Upstash | US (multi-region) | Rate-limit Redis | ⚠️ DPA + CCT |
| Google (NextAuth OAuth) | US | Authentification SSO uniquement | DPA Google Workspace |

### 6.3 Aucun transfert commercial à des tiers

- Pas de revente de données
- Pas de partage publicitaire
- Pas de cookie tiers de tracking (sauf Vercel Analytics si activé,
  anonymisé selon CNIL délibération 2020)

---

## 7. Transferts hors UE

**Risque Schrems II identifié** : tous les sous-traitants US sont
théoriquement soumis au Cloud Act / FISA Section 702. Mesures
compensatoires :
- Clauses Contractuelles Types (CCT) signées avec chaque sous-traitant
- Données chiffrées at-rest (Supabase, Vercel)
- Données chiffrées in-transit (HTTPS partout, TLS 1.3)
- DPA Standard Contractual Clauses (SCCs) version 2021/914 EU

**Plan d'amélioration V79+** : envisager un sous-traitant alternatif
EU pour les données les plus sensibles (CNI, fiches paie, IBAN). Options :
- OVHcloud (FR) — Postgres managé
- Scaleway (FR) — object storage pour CNI/fiches paie

---

## 8. Durées de conservation

| Type de données | Durée | Référence légale |
|---|---|---|
| Compte utilisateur actif | Tant que compte actif + 3 ans après inactivité | RGPD art. 5.1.e |
| Bail signé | 5 ans après fin de bail | Loi 89-462 art. 7-1 |
| Quittances de loyer | 3 ans (locataire), 10 ans (proprio compta) | Code conso L137-2 |
| EDL entrée/sortie | 5 ans après fin bail | Décret 2016-382 |
| CNI, fiches paie, IBAN locataire | 5 ans après fin bail OU 1 an si pas de bail | RGPD art. 5.1.e + LCEN |
| Messages chat | 3 ans après dernier message | Pratique sectorielle |
| Logs accès dossier (audit RGPD) | 1 an | Recommandation CNIL |
| Cookies analytics | 13 mois max | CNIL délibération 2020 |
| Cookies fonctionnels | 6 mois (consentement) | CNIL délibération 2020 |

---

## 9. Mesures de sécurité

### 9.1 Sécurité technique

- **RLS Phase 5** : 12/12 tables Supabase verrouillées (V67-V70)
  - REVOKE SELECT/INSERT/UPDATE/DELETE pour anon
  - Policies `current_setting('request.jwt.email')` pour auth user
- **Authentification** : NextAuth Google OAuth + bcrypt local (mot de
  passe 12+ chars, vérifié dans `app/api/auth/`)
- **HTTPS** strict : `Strict-Transport-Security: max-age=63072000;
  includeSubDomains; preload`
- **CSP Report-Only** : restreint scripts/styles/images aux domaines
  whitelistés (à passer en enforcing post-validation 48h)
- **X-Robots-Tag** : noindex pre-launch (V71.0 SITE_INDEXABLE=false)
- **Rate-limit Upstash** : 60/min/IP sur routes critiques
- **Audit-trail eIDAS** : SHA-256 sur signature bail (art. 26)
- **HMAC tokens** : dossier partage TTL 7j, vérif `crypto.timingSafeEqual`
  (anti timing attack)

### 9.2 Sécurité organisationnelle

- Accès admin restreint (1 seul user `is_admin=true` actuellement)
- Pas de logs PII en clair (logger.ts masque emails dans request_id)
- DPA + CCT avec chaque sous-traitant (à formaliser pré-paid launch)
- Pas d'accès direct base de données via SQL pour les humains (toujours
  via routes API authentifiées + RLS)
- Notification incident sous 72h CNIL — procédure formalisée pré-paid
  launch (V79+)

### 9.3 Privacy by design

- Minimisation : `app/api/profil/save` whitelist V79+ (audit V78 : pose
  accepte tout body, à durcir)
- Pseudonymisation : matching algorithmique sans stockage du score
- Effacement : `/api/account/delete` avec cascade 6 tables (V79+ étendre
  à 9 tables + Storage cleanup)
- Portabilité : `/api/profil/me` retourne JSON complet
  (V79+ étendre avec messages + visites + dossier zip)

---

## 10. Risques résiduels identifiés

### 10.1 🟠 Risque modéré : dépendance sous-traitants US

Probabilité : moyenne · Impact : modéré

Les 6 principaux sous-traitants sont basés aux US. Schrems II non
totalement compensé malgré CCT. Mitigation V79+ : audit Cloud Act
exposure + plan de migration partielle vers EU si volumes paid users.

### 10.2 🟠 Risque modéré : pas d'audit pen-test externe

Probabilité : moyenne · Impact : élevé

Aucun audit de sécurité externe n'a été fait sur KeyMatch. Mitigation
V79+ : commander pen-test ANSSI-certifié pré-paid launch (~3-5k€).

### 10.3 🟢 Risque faible : opt-in cookies analytics

Probabilité : faible · Impact : faible

Vercel Analytics non activé en V78. Si activé V79+, doit suivre
recommandation CNIL 2020 (anonymisation IP, pas de tracking cross-site).

### 10.4 🟠 Risque modéré : DPO non désigné formellement

Probabilité : élevée (manque audit) · Impact : modéré

Pas de DPO actuellement. Mitigation : recruter DPO externe (cabinet
spécialisé RGPD, ~3-5k€ setup + 500€/mois) pré-paid launch.

### 10.5 🔴 Risque élevé : procédure incident-response 72h pas formalisée

Probabilité : moyenne · Impact : très élevé

Si fuite de données (ex : compromise sous-traitant), notification CNIL
sous 72h obligatoire (RGPD art. 33). Procédure pas écrite.

Mitigation **OBLIGATOIRE pré-paid launch** : créer
`docs/RGPD_INCIDENT_RESPONSE.md` avec :
- Rôles (qui détecte, qui notifie CNIL, qui notifie users)
- Templates email notif user
- Template formulaire CNIL
- Liste des contacts (DPO, avocat, support sous-traitants)

---

## 11. Plan d'action

### Avant paid launch (V79-V81)

| Action | Priorité | Effort estimé | Coût |
|---|---|---|---|
| Recruter DPO externe | 🔴 | 1 sem | 3-5k€ + 500€/mois |
| Pen-test ANSSI-certifié | 🔴 | 2 sem | 3-5k€ |
| `RGPD_INCIDENT_RESPONSE.md` | 🔴 | 1 j | 0€ (interne) |
| Formaliser DPA Schrems II | 🟠 | 2 sem | 0€ (relecture sous-traitants) |
| Whitelist `/api/profil/save` body | 🟠 | 4h | 0€ |
| Cron purge `dossier_access_log` 90j | 🟠 | 2h | 0€ |
| Étendre `/api/account/delete` à 9 tables + Storage | 🟠 | 1 j | 0€ |
| Étendre `/api/profil/me` à export complet zip | 🟠 | 1 j | 0€ |
| Bannière cookies anonymisée Vercel Analytics | 🟢 | 4h | 0€ |

### Post paid launch (V82+)

- Audit RGPD externe annuel
- Migration partielle sous-traitants → EU si > 1000 paid users
- Certification ISO 27001 si > 10k users

---

## 12. Décision de l'autorité

Cette DPIA est rédigée par le responsable de traitement. Avant paid
launch, elle DOIT être :
1. Validée par un DPO certifié (interne ou externe)
2. Signée par le responsable de traitement
3. Conservée 5 ans minimum
4. Mise à jour à chaque évolution majeure du traitement (nouvelle
   feature, nouveau sous-traitant, migration infrastructure)

Si le DPO juge le risque résiduel **élevé non maîtrisé**, la CNIL doit
être consultée préalablement (RGPD art. 36) avant le démarrage du
traitement payant.

---

## Référence

- [CNIL — DPIA / AIPD](https://www.cnil.fr/fr/RGPD-analyse-impact-protection-donnees-aipd)
- [CNIL — outil PIA](https://www.cnil.fr/fr/outil-pia-telechargez-et-installez-le-logiciel-de-la-cnil)
- [RGPD UE 2016/679 art. 35](https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX%3A32016R0679#d1e3146-1-1)
- [Schrems II decision](https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX%3A62018CJ0311)
- Voir aussi : [`docs/RGPD_REGISTRE_ARTICLE_30.md`](RGPD_REGISTRE_ARTICLE_30.md)
