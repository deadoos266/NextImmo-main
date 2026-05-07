# Registre des activités de traitement — RGPD Article 30

**Statut** : V78.1 — version initiale, à signer par DPO pré-paid launch.
**Date** : 2026-05-07
**Version** : 1.0
**Responsable de traitement** : KeyMatch (entrepreneur individuel
Paul X — à transformer en SAS pré-paid launch)
**Coordonnées RT** : `contact@keymatch-immo.fr`
**DPO** : à désigner pré-paid launch (cf
[`RGPD_DPIA_KEYMATCH.md`](RGPD_DPIA_KEYMATCH.md) §11). En attendant :
**privacy@keymatch-immo.fr** (alias DPO contact pour réclamations).

L'article 30 RGPD impose à tout responsable de traitement de tenir un
registre des activités de traitement. KeyMatch en a 7 distinctes
listées ci-dessous.

Modèle CNIL : https://www.cnil.fr/fr/RGPD-le-registre-des-activites-de-traitement.

---

## Traitement #1 — Inscription et gestion compte utilisateur

| Champ | Valeur |
|---|---|
| **Nom** | Compte utilisateur KeyMatch |
| **Finalité** | Identification + authentification + préférences |
| **Base légale** | Consentement (art. 6.1.a) + exécution contrat (6.1.b) |
| **Catégories de personnes** | Locataires, propriétaires |
| **Catégories de données** | Email, mot de passe (bcrypt 10 rounds), nom, prénom, téléphone, photo profil, préférences notifications |
| **Destinataires internes** | Paul X (admin) |
| **Sous-traitants** | Supabase (DB+Auth), Vercel (frontend), NextAuth Google (SSO optionnel) |
| **Transferts hors UE** | Oui — US (Supabase, Vercel, Google). CCT EU 2021/914. |
| **Durée de conservation** | Tant que compte actif + 3 ans après inactivité |
| **Mesures de sécurité** | RLS Phase 5, bcrypt 10 rounds, HTTPS, rate-limit Upstash 60/min IP, NextAuth JWT signé HS256 |

---

## Traitement #2 — Matching algorithmique locataire/propriétaire

| Champ | Valeur |
|---|---|
| **Nom** | Score matching KeyMatch (1000 points) |
| **Finalité** | Suggérer aux locataires les annonces pertinentes selon leurs critères + suggérer aux propriétaires les candidats compatibles |
| **Base légale** | Consentement (art. 6.1.a) — l'user choisit ses critères et accepte qu'ils soient utilisés pour le matching |
| **Catégories de personnes** | Locataires, propriétaires |
| **Catégories de données** | Critères locataire (budget, surface, ville, équipements, DPE min, animaux, fumeur), profil (revenus, situation pro), caractéristiques annonce |
| **Destinataires internes** | User concerné uniquement (l'autre partie voit le score arrondi en %) |
| **Sous-traitants** | Supabase (lecture seule) |
| **Transferts hors UE** | Oui — US (Supabase). CCT 2021/914. |
| **Durée de conservation** | Calcul à la volée, score non stocké. Critères 3 ans post inactivité. |
| **Mesures de sécurité** | Calcul server-side `lib/matching.ts`, RLS empêche un user de voir le score d'autres |
| **Profilage automatisé** | Non — le score est purement informatif, pas de décision automatisée. L'user reste maître du choix. |

---

## Traitement #3 — Dossier locataire (KYC + financier)

| Champ | Valeur |
|---|---|
| **Nom** | Dossier numérique locataire KeyMatch |
| **Finalité** | Vérification identité + solvabilité + éligibilité ALUR |
| **Base légale** | Exécution contrat (art. 6.1.b — bail futur) + consentement (6.1.a) |
| **Catégories de personnes** | Locataires + leurs garants |
| **Catégories de données** | CNI (recto/verso), 3 fiches paie, IBAN, attestation employeur, RIB, garant (identité + revenus + cautionnement écrit) |
| **Destinataires internes** | Locataire propriétaire du dossier + propriétaires sélectionnés via partage tokenisé |
| **Sous-traitants** | Supabase Storage (chiffré at-rest AES-256), Vercel (signed URL TTL aligné JWT) |
| **Transferts hors UE** | Oui — US (Supabase, Vercel). CCT. **Risque Schrems II identifié — mitigation V79+ migration EU si volumes** |
| **Durée de conservation** | 5 ans après fin bail OU 1 an si pas de bail signé (loi 89-462 + RGPD minimisation) |
| **Mesures de sécurité** | RLS lockdown Phase 5 (`dossier_docs` table), tokens HMAC TTL 7j (`dossier_token`), Cache-Control: private no-store, audit log `dossier_access_log` 1 an (cron purge V79+), `crypto.timingSafeEqual` sur token verification |
| **Profilage automatisé** | Non — proprio voit le dossier complet, prend la décision humaine |

---

## Traitement #4 — Bail eIDAS niveau 1 (signature électronique)

| Champ | Valeur |
|---|---|
| **Nom** | Signature bail eIDAS KeyMatch |
| **Finalité** | Conclusion du contrat de location avec valeur juridique probante |
| **Base légale** | Exécution contrat (art. 6.1.b) + obligation légale (6.1.c — loi 89-462 art. 3) |
| **Catégories de personnes** | Locataire(s), propriétaire(s), garant(s) |
| **Catégories de données** | Identité complète, signature image PNG, mention légale "Lu et approuvé, bon pour accord" saisie au clavier, hash SHA-256 audit-trail, IP signature, timestamp UTC, user-agent |
| **Destinataires internes** | Parties au bail uniquement |
| **Sous-traitants** | Supabase Storage (PDF), Resend (envoi PDF par email signé) |
| **Transferts hors UE** | Oui — US. CCT 2021/914. |
| **Durée de conservation** | 5 ans après fin bail (loi 89-462 art. 7-1) |
| **Mesures de sécurité** | Hash SHA-256 immutable (re-vérifiable post-signature), audit-trail conforme art. 26 eIDAS, archive PDF dans Storage chiffré, intégrité vérifiée par cron `/api/cron/verify-integrity-baux` (weekly) |
| **Profilage automatisé** | Non |

---

## Traitement #5 — État des lieux contradictoire (EDL)

| Champ | Valeur |
|---|---|
| **Nom** | EDL entrée + sortie KeyMatch |
| **Finalité** | Constat contradictoire du logement (entrée + sortie) — base de la restitution dépôt de garantie |
| **Base légale** | Obligation légale (art. 6.1.c — décret 2016-382) + exécution contrat (6.1.b) |
| **Catégories de personnes** | Locataire(s), propriétaire(s) |
| **Catégories de données** | 10 items obligatoires décret (murs, sols, plafonds, électricité, plomberie, équipements, etc.) avec descriptifs + photos + signatures 2 parties |
| **Destinataires internes** | Parties au bail uniquement |
| **Sous-traitants** | Supabase Storage (photos + PDF), Resend (envoi notif EDL) |
| **Transferts hors UE** | Oui — US. CCT. |
| **Durée de conservation** | 5 ans après fin bail (cohérence avec bail) |
| **Mesures de sécurité** | RLS `etats_des_lieux` table verrouillée Phase 5, photos signed URL TTL court, audit-trail signatures hash SHA-256 |

---

## Traitement #6 — Communication chat + emails transactionnels

| Champ | Valeur |
|---|---|
| **Nom** | Messagerie KeyMatch + emails transactionnels Resend |
| **Finalité** | Communication entre parties pour candidature, visite, signature, gestion bail. Notifications transactionnelles automatiques. |
| **Base légale** | Exécution contrat (art. 6.1.b) + intérêt légitime (6.1.f — communication entre parties) |
| **Catégories de personnes** | Locataires, propriétaires, candidats |
| **Catégories de données** | Contenu messages (texte + pièces jointes), email expéditeur/destinataire, timestamps, métadonnées (annonce_id, statut candidature) |
| **Destinataires internes** | Expéditeur + destinataire uniquement (sauf admin pour modération) |
| **Sous-traitants** | Supabase (DB messages), Resend (emails transactionnels) |
| **Transferts hors UE** | Oui — US. CCT. |
| **Durée de conservation** | 3 ans après dernier message (preuve échanges, ALUR) |
| **Mesures de sécurité** | RLS `messages` table verrouillée Phase 5 (V70 mig 058), self-email guard (anti spam), rate-limit 30/h dispatcher Resend + 3/h/destinataire new-message, opt-out granulaire 30+ events via `notif_preferences` |
| **Soft-delete personnel** | V74.1 — `messages.hidden_for_emails` array (mig 065 à appliquer) — l'user peut "supprimer" la conv côté lui sans impacter l'autre partie |

---

## Traitement #7 — Loyers, quittances, indexation IRL

| Champ | Valeur |
|---|---|
| **Nom** | Suivi loyers + quittances + IRL KeyMatch |
| **Finalité** | Encaissement loyer + délivrance quittance PDF + indexation annuelle IRL (loi 89-462 art. 17-1) |
| **Base légale** | Obligation légale (art. 6.1.c — Code conso L137-2 + loi 89-462) + exécution contrat (6.1.b) |
| **Catégories de personnes** | Locataires, propriétaires |
| **Catégories de données** | Montant loyer HC + charges, mois concerné, IBAN proprio, date paiement, statut (paye/retard), timestamp encaissement, indexation IRL trimestre publié |
| **Destinataires internes** | Locataire (sa quittance), proprio (toutes les quittances de son bien) |
| **Sous-traitants** | Supabase (table `loyers`), Resend (envoi quittance PDF), Stripe (futur — paiement automatique opt-in V67) |
| **Transferts hors UE** | Oui — US. CCT. |
| **Durée de conservation** | 3 ans côté locataire (Code conso L137-2), 10 ans côté proprio (Code commerce L123-22) |
| **Mesures de sécurité** | RLS `loyers` table verrouillée Phase 5 (V70 mig 059), audit-trail paiement, cron `/api/cron/loyers-retard` daily 8h Paris (notif retard + intérêts moratoires) |

---

## Récapitulatif global

| # | Traitement | Risque RGPD | Conservation | DPIA requise |
|---|---|---|---|---|
| 1 | Compte utilisateur | 🟢 Faible | 3 ans inactif | Non |
| 2 | Matching algo | 🟢 Faible | À la volée | Non |
| 3 | **Dossier KYC** | 🔴 **Élevé** | 5 ans | **OUI** ✅ rédigée [DPIA](RGPD_DPIA_KEYMATCH.md) |
| 4 | **Bail eIDAS** | 🔴 **Élevé** | 5 ans | **OUI** ✅ couverte par même DPIA |
| 5 | EDL contradictoire | 🟠 Modéré | 5 ans | Couverte par DPIA |
| 6 | Communication | 🟠 Modéré | 3 ans | Non requise |
| 7 | Loyers/quittances/IRL | 🟠 Modéré | 3-10 ans | Non requise |

---

## Mise à jour du registre

Ce registre doit être mis à jour à CHAQUE :
- Ajout d'un nouveau traitement (nouvelle feature qui collecte de la PII)
- Changement de sous-traitant (ex : migration EU OVHcloud V80+)
- Changement de finalité (ex : ajout publicité ciblée → consentement
  séparé requis)
- Évolution durée de conservation (ex : décret modifiant ALUR)

**Conservation** : 5 ans minimum (recommandation CNIL).

**Communication** : sur demande aux personnes concernées + à la CNIL en
cas de contrôle.

---

## Référence

- [CNIL — Le registre des activités de traitement](https://www.cnil.fr/fr/RGPD-le-registre-des-activites-de-traitement)
- [Modèle CNIL téléchargeable](https://www.cnil.fr/sites/default/files/atoms/files/registre-rgpd-basique.pdf) (Excel)
- [RGPD UE 2016/679 art. 30](https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX%3A32016R0679#d1e2812-1-1)
- DPIA détaillée : [`RGPD_DPIA_KEYMATCH.md`](RGPD_DPIA_KEYMATCH.md)
