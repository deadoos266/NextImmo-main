# Audit Produit Expert — Flow Bail KeyMatch (V31)

**Généré :** 2026-04-29
**Auditor :** Claude (V31 expert produit — UX + logique métier + conversion)
**Scope :** Création / signature / activation de bail, côté locataire ET propriétaire
**Repo :** `nestmatch/` (Next.js 15 + Supabase + NextAuth + inline styles)
**Complément technique :** voir `docs/AUDIT_FLOW_BAIL.md` (V22.1 — schéma DB, RLS, sécurité)

---

## Verdict global : **5,5 / 10**

> Plomberie technique solide (eIDAS Niveau 1 conforme, audit-trail propre, PDF ALUR riche).
> **Mais expérience produit cassée à 3 endroits critiques** où le tunnel de conversion fuit massivement.
> Un proprio non-tech abandonnera. Un locataire de 25 ans aura peur de signer.

---

## TL;DR — 3 risques majeurs

1. **🔴 Pas de PDF preview avant envoi** — proprio génère ET envoie en un seul clic, sans relecture. Une faute de frappe sur un IBAN ou une date = bail vicié déjà signé.
2. **🔴 Locataire signe sans avoir lu le bail** — le PDF n'est téléchargeable qu'**après** acceptation. Signature à l'aveugle = perte de confiance immédiate + risque légal contestation.
3. **🔴 Tunnel candidat → bail invisible** — depuis `/proprietaire/annonces/[id]/candidatures`, **zéro CTA "Générer le bail"**. Proprio doit deviner qu'il faut aller dans `/messages` via la `DossierCard`. Friction de découverte qui tue la conversion.

---

## 1. Simulation user — Parcours complets

### 1.A Locataire — "Léa, 25 ans, premier bail"

**Contexte :** Léa cherche son premier appartement, elle a postulé sur KeyMatch, le proprio Marc a confirmé une visite, et 3 jours plus tard elle reçoit un email "Marc vous invite à signer le bail".

#### Étape 1 — Email arrive (T+0)
- Email Resend envoyé via `/api/bail/importer` → Léa voit "Marc Dupont vous a envoyé un bail" + lien.
- ⚠️ **Pas de preview du loyer ni de l'adresse dans l'email** → Léa hésite : c'est bien le bon bail ? Une URL `keymatch-immo.fr/bail-invitation/abc123` peut paraître phishing à un œil méfiant.

#### Étape 2 — Atterrissage sur `/bail-invitation/[token]`
- ✅ **Bon** : page hero affiche `[Marc Dupont] vous invite sur KeyMatch.` ([bail-invitation/[token]/page.tsx:185-186](nestmatch/app/bail-invitation/[token]/page.tsx#L185))
- ✅ Adresse, surface, pièces, meublé, **loyer HC + charges détaillés**.
- ❌ **PAS de PDF préviewable.** Aucun lien "Voir le bail avant d'accepter" ([bail-invitation/[token]/page.tsx:194-212](nestmatch/app/bail-invitation/[token]/page.tsx#L194)).
- ❌ **PAS de bouton "Demander des infos"** → Léa veut savoir si les charges incluent l'eau, pas de chat possible avant acceptation.

**Conséquence :** Léa doit accepter à l'aveugle pour pouvoir poser des questions. **Drop-off probable.**

#### Étape 3 — Acceptation
- Si déconnectée → modal "Connectez-vous avec leamartin@gmail.com" ([accepter/[token]/route.ts:113-119](nestmatch/app/api/bail/accepter/[token]/route.ts#L113)).
- ⚠️ Email mismatch silencieux : si Léa est connectée avec un autre email, elle voit la page **sans warning** jusqu'au clic "Accepter". Ça peut sembler bug.
- ✅ Bouton "Ce n'est pas mon bail / refuser" présent (escape hatch). Confirme via `confirm()` natif.
- ⚠️ Refus = `confirm()` browser → fragile UX, surtout mobile.

#### Étape 4 — Après acceptation : LIMBO
- Annonce passe à `bail_source='imported'`. **Aucun message envoyé.** Aucune notif côté Léa.
- Léa retourne dans son inbox → rien. Dans `/messages` → rien. Dans `/mon-logement` → toujours vide tant que proprio n'a pas généré le PDF.
- ❌ **Léa ne sait pas quoi faire ni quand le bail arrive.** Pas de page "On attend que [Marc] envoie le bail signable, vous serez notifiée".

**Conséquence :** Limbo silencieux qui peut durer des jours. Léa va relancer Marc par WhatsApp = sortie de la plateforme.

#### Étape 5 — Bail PDF reçu via `[BAIL_CARD]` dans messages
- BailCard rendue dans `/messages` ([messages/page.tsx:445-497](nestmatch/app/messages/page.tsx#L445)) avec CTA "Signer le bail".
- ⚠️ **Le PDF n'est toujours pas téléchargeable directement depuis la BailCard côté locataire** (à vérifier — actuellement seul download via `/mon-logement`).
- ❌ **Léa ne peut pas lire le bail intégral avant de signer** → elle clique "Signer" → BailSignatureModal s'ouvre.

#### Étape 6 — BailSignatureModal (3 étapes)
- **Step 1 (Récap)** : ✅ Loyer, durée, bailleur, caution clairs ([BailSignatureModal.tsx:248-320](nestmatch/app/components/BailSignatureModal.tsx#L248)).
- **Step 2 (Reconnaissance)** : ✅ Checkbox "Je reconnais avoir pris connaissance" + mention "Lu et approuvé" obligatoire.
- **Step 3 (Signature)** : nom, mention "Lu et approuvé, bon pour accord" à **retaper manuellement** + canvas signature.
  - ❌ **Mention non pré-remplie** alors que le placeholder donne le texte exact ([BailSignatureModal.tsx:472-492](nestmatch/app/components/BailSignatureModal.tsx#L472)) → friction inutile pour Léa.
  - ⚠️ Regex de validation `/lu et approuv/i` accepte "lu et approuvé" sans "bon pour accord" → ambiguïté légale.
  - ⚠️ Canvas signature : pas de bouton "Effacer / recommencer" visible dans le code → si Léa rate sa signature au doigt sur mobile, elle est bloquée.

#### Étape 7 — Post-signature
- Modal ferme, page refresh.
- ❌ **PAS d'email de confirmation** envoyé à Léa avec PDF signé attaché.
- ❌ **PAS de toast persistant** "Vous avez signé le bail le [date] à [heure]".
- Notification interne `"Prochaine étape : état des lieux d'entrée"` → href `/mon-logement` ([signer/route.ts:255](nestmatch/app/api/bail/signer/route.ts#L255)).

**Conséquence :** Léa doute. "C'est passé ? Je dois faire quoi ?" Elle va redemander confirmation à Marc.

#### Étape 8 — `/mon-logement`
- ✅ Statut bail clair ([mon-logement/page.tsx:731-742](nestmatch/app/mon-logement/page.tsx#L731)) : "Signé — en attente du propriétaire" ou "Signé par les deux parties".
- ✅ Liste signatures (qui + quand).
- ✅ Bouton "Télécharger le bail (PDF)".
- ❌ **Loyers auto-générés (12 mois)** existent en DB mais **PAS affichés** dans cette page. Léa ne voit pas son échéancier. ([signer/route.ts:169-213](nestmatch/app/api/bail/signer/route.ts#L169)).
- ❌ **Aucun lien direct "Démarrer l'EDL"** côté locataire — la notif renvoie sur `/mon-logement` qui est une page lecture seule. L'EDL se crée à `/proprietaire/edl/[id]` (proprio-only).

**Bilan Léa :** trust-signal au démarrage (bonne hero page), **chute brutale à chaque action** (acceptation à l'aveugle, signature à l'aveugle, succès silencieux, échéancier invisible). Score parcours locataire : **4/10**.

---

### 1.B Propriétaire — "Marc, 42 ans, 1er bien à louer"

**Contexte :** Marc a posté son annonce, reçu 5 candidatures, retenu Léa après visite. Il veut maintenant lui envoyer le bail.

#### Étape 1 — Découverte du flow bail (CRITIQUE)
- Marc va sur `/proprietaire/annonces/[id]/candidatures` → voit la carte de Léa avec son dossier.
- ❌ **AUCUN bouton "Générer le bail" sur cette carte** ([candidatures/page.tsx:217-231](nestmatch/app/proprietaire/annonces/[id]/candidatures/page.tsx#L217)).
- Marc cherche dans son dashboard `/proprietaire` → 5 onglets : "Mes biens / Visites / Locataires / Anciens biens / Stats". **Aucun n'est explicitement "Baux"**.
- Marc clique sur la fiche du bien → page détail → pas de CTA bail évidente.
- Marc tente l'URL `/proprietaire/bail/importer` (s'il la connaît) → page existe avec form 15 sections.
- **Vraie discovery :** dans `/messages`, sur la `DossierCard` du candidat ([messages/page.tsx:137-140](nestmatch/app/messages/page.tsx#L137)) : lien "Accepter & générer le bail →" qui pointe vers `/proprietaire/bail/${annonceId}?locataire=${email}`.

**Conséquence :** **3 entry points différents** (`/importer`, `/bail/[id]?locataire=`, wizard step 7), **aucun discoverable** depuis le dashboard. Marc va appeler le support ou abandonner.

#### Étape 2 — Wizard step 7 piège
- Si Marc passe par `/proprietaire/ajouter` step 7 et coche "Bien déjà loué", l'annonce est créée `statut='loué' loue=true` **sans bail_invitations** ([AUDIT_FLOW_BAIL.md HIGH #2](nestmatch/docs/AUDIT_FLOW_BAIL.md)).
- Le bien est marqué loué mais **zéro trace de bail**, locataire n'est pas invité, aucun cycle de vie attaché.
- ❌ **Bug majeur :** Marc croit avoir tout fait, en réalité rien n'est généré.

#### Étape 3 — Form `/proprietaire/bail/[id]` — 15 sections, ~50 champs
- ✅ **Pré-remplissage agressif** depuis profils proprio + candidat retenu ([bail/[id]/page.tsx:487-509](nestmatch/app/proprietaire/bail/[id]/page.tsx#L487)).
- ✅ **Auto-détection zone tendue, pré-population IBAN, durée par défaut** → confidence-builder.
- ✅ Validation contextuelle excellente : avertissements jaunes pointant la section précise à compléter ([bail/[id]/page.tsx:2024-2033](nestmatch/app/proprietaire/bail/[id]/page.tsx#L2024)).
- ✅ Auto-save localStorage ([bail/[id]/page.tsx:523-533](nestmatch/app/proprietaire/bail/[id]/page.tsx#L523)) → résiste aux fermetures de tab.
- ⚠️ Zéro indicateur de progression ("Section 6 sur 15", "70 % rempli").
- ⚠️ Pas de mode "Wizard pas-à-pas" pour le 1er bail — overwhelming pour un proprio qui ouvre ça pour la première fois.

#### Étape 4 — Bouton "Importer mon bail PDF"
- ❌ **Bouton grisé sans tooltip** si `bien.locataire_email` non set ([bail/[id]/page.tsx:1006](nestmatch/app/proprietaire/bail/[id]/page.tsx#L1006)).
- Marc ne comprend pas pourquoi → frustré.

#### Étape 5 — Génération PDF (CRITIQUE)
- Bouton "Générer le bail PDF et envoyer au locataire" ([bail/[id]/page.tsx:2046](nestmatch/app/proprietaire/bail/[id]/page.tsx#L2046)).
- ❌ **PAS DE PREVIEW.** Clic → PDF téléchargé en local + email envoyé à Léa **simultanément**. Aucune relecture possible.
- ❌ Si Marc a tapé un IBAN avec une faute, ou une date erronée, **le bail part déjà**, Léa peut signer un bail vicié.
- ⚠️ Erreur jsPDF → `alert()` natif "Erreur PDF : {error}" ([bail/[id]/page.tsx:681-687](nestmatch/app/proprietaire/bail/[id]/page.tsx#L681)) — pas de recovery path.

**Conséquence légale :** un bail signé avec une erreur de saisie nécessite un avenant. La feature avenant est marquée "à venir" ([bail/[id]/page.tsx:662-666](nestmatch/app/proprietaire/bail/[id]/page.tsx#L662)) sans date → Marc bloqué.

#### Étape 6 — Statut signature
- Marc ferme la page. Léa signe quelques heures plus tard.
- ❌ **La page form de Marc n'a pas de listener Realtime** sur `bail_signatures` → Marc revient sur `/proprietaire/bail/[id]`, **statut affiché toujours "envoyé"** alors que Léa a signé.
- Marc doit refresh manuellement.
- ✅ Une fois refresh : carte verte "✓ Bail déjà signé par le locataire" + bouton "Contresigner" ([bail/[id]/page.tsx:872-967](nestmatch/app/proprietaire/bail/[id]/page.tsx#L872)).

#### Étape 7 — Contresignature + EDL
- Marc contresigne via même modal → trigger auto :
  - INSERT 12 loyers `statut='déclaré'` ([signer/route.ts:169-213](nestmatch/app/api/bail/signer/route.ts#L169)).
  - Message `[EDL_A_PLANIFIER]` envoyé aux 2 parties.
  - Notif Marc : href `/proprietaire/edl/[id]`.
- ✅ Marc a un CTA clair pour démarrer l'EDL.
- ❌ **Léa n'a pas de CTA équivalent** — sa notif pointe `/mon-logement` qui ne permet pas de créer l'EDL.

**Bilan Marc :** flow puissant mais **piégé par défaut de discovery + manque de preview + statut non-realtime**. Score parcours proprio : **5/10**.

---

## 2. Logique produit — Cohérence du tunnel

### 2.1 Tunnel théorique vs réel

```
Théorique :  Annonce → Candidat → Visite → Acceptation → BAIL → EDL → Loyer
                                                ↑
                                                └── doit être 1 clic
```

```
Réel :       Annonce → Candidat → Visite → Acceptation
                                                ↓
                                          [????? → 3 entry points fragmentés]
                                                ↓
                                          /messages → DossierCard CTA
                                                ↓
                                          /proprietaire/bail/[id] (form 15 sections)
                                                ↓
                                          PDF généré + email Resend (pas de preview)
                                                ↓
                                          [????? → locataire en limbo silencieux]
                                                ↓
                                          /messages → BailCard apparaît
                                                ↓
                                          Signature locataire (sans relecture du bail)
                                                ↓
                                          [????? → proprio doit refresh manuellement]
                                                ↓
                                          Contresignature proprio
                                                ↓
                                          [EDL flow asymétrique]
```

**3 trous noirs** où l'utilisateur disparaît du radar. Chaque trou = drop-off.

### 2.2 Source de vérité confuse

- `annonces.statut` ('disponible' | 'bail_envoye' | 'loué' | 'loue_termine')
- `annonces.bail_source` ('imported_pending' | 'imported' | null)
- `annonces.loue` (boolean)
- `bail_invitations.statut` ('pending' | 'accepted' | 'declined' | 'expired')
- `bail_signatures` (présence ou absence pour locataire/bailleur)
- `annonces.bail_signe_locataire_at` + `annonces.bail_signe_bailleur_at`

⚠️ **6 colonnes pour décrire un état**. Risque de désynchronisation. Cf [AUDIT_FLOW_BAIL.md HIGH #4](nestmatch/docs/AUDIT_FLOW_BAIL.md) sur la duplication `date_debut_bail`.

### 2.3 Loyers fantômes
- Auto-générés à double signature (12 mois `statut='déclaré'`).
- ❌ **Aucune UI ne les expose au locataire** dans `/mon-logement`.
- ❌ Aucune notif "Votre échéancier de loyers est prêt".
- Quittances `/mes-quittances` filtre `quittance_pdf_url IS NOT NULL` → vide tant que proprio n'a pas confirmé le 1er paiement.

**Léa ne sait pas quand ni combien payer ni à qui.**

### 2.4 Multi-candidat — rejet implicite
Quand `annonce.locataire_email = candidat1`, les candidats 2-5 voient leur statut basculer à "rejete" ([candidatures/page.tsx:217-223](nestmatch/app/proprietaire/annonces/[id]/candidatures/page.tsx#L217)) **sans notif ni message**. Ghosting silencieux.

---

## 3. UX / Design — Affordances, copy, cohérence

### 3.1 Hiérarchie d'information
- ✅ Inline styles cohérents avec design system KeyMatch (#F7F4EF, #111, Fraunces serif).
- ✅ BailCard et DossierCard dans messages bien stylées.
- ⚠️ Form bail : 2470 lignes sur une seule page → wall of fields. Pas de TOC sticky, pas de progression %.
- ⚠️ Statut bail dans `/proprietaire` (dashboard) noyé dans onglet "Stats & paiements" — devrait être un onglet "Baux" dédié OU un badge sur chaque carte de bien.

### 3.2 Copy — clarté et confiance

**Excellent :**
- Validation jaune sur sections manquantes avec lien vers la section précise.
- "Confirmer le refus ? Votre propriétaire en sera informé et pourra refaire une invitation." → rassurant.
- Email mismatch : "Cette invitation a été envoyée à [email]. Connectez-vous avec ce compte." → précis.

**À retravailler :**
- "Importer un bail signé hors plateforme" vs "Vous avez déjà votre bail en PDF ?" → 2 paths confus, mêmes mots.
- "Le locataire a déjà signé ce bail. Vous ne pouvez pas le remplacer — un avenant (fonctionnalité à venir) sera nécessaire" → mention "à venir" sans timeline = perte de confiance.
- Bouton grisé "Importer mon bail →" sans tooltip explicatif.
- Mention "Lu et approuvé, bon pour accord" non pré-remplie alors que le placeholder donne le texte exact.

### 3.3 Mobile / responsive
- Form 15 sections sur mobile = scroll infini. Pas testé en simulation (à valider avec audit responsive séparé).
- Canvas signature : touch handling pas vérifié. Sans bouton "Effacer", un loupé est bloquant.
- `confirm()` natif pour refus = mauvaise pratique mobile.

### 3.4 États de chargement et erreurs
- ✅ Spinner sur fetch invitations.
- ❌ Erreurs PDF en `alert()` brut (jsPDF crash, upload annexe).
- ❌ Pas de skeleton sur form bail au load — page blanche pendant pré-fetch profils.

### 3.5 Cohérence avec le reste de l'app
- ✅ Toast `km:toast` + ToastStack utilisés dans certaines actions.
- ❌ **Pas utilisés sur signature bail** → succès silencieux.
- ❌ Timeline `bailTimeline.ts` calculée mais affichée seulement dans `/proprietaire/page.tsx`, jamais côté locataire.

---

## 4. Risques critiques — Légal + Conversion + Trust

### 4.1 🔴 Risques LÉGAUX

| # | Risque | Sévérité | Détail |
|---|--------|----------|--------|
| L1 | Bail signé avec erreur de saisie sans avenant possible | **CRITIQUE** | Pas de preview avant envoi + feature avenant "à venir" sans date. Bail vicié = contestable. |
| L2 | Locataire signe sans avoir lu le PDF intégral | **CRITIQUE** | Article 1188 Code civil : consentement éclairé. Si Léa peut prouver qu'elle n'a pas vu le PDF avant signature → bail attaquable. |
| L3 | Mention "Lu et approuvé" partielle acceptée par regex `/lu et approuv/i` | **MAJEUR** | "lu et approuvé" sans "bon pour accord" passe la validation. Faiblesse audit-trail eIDAS. |
| L4 | Hash PDF jamais re-vérifié post-signature | **MAJEUR** | `bail_hash` stocké mais jamais comparé. Tampering possible non détecté ([AUDIT_FLOW_BAIL.md MEDIUM #8](nestmatch/docs/AUDIT_FLOW_BAIL.md)). |
| L5 | RLS désactivée sur `bail_invitations` + `bail_signatures` | **MAJEUR** | Cf audit V22. INSERT/UPDATE fake possibles via clé anon. Mitigé côté routes mais defense-in-depth absente. |

### 4.2 🔴 Risques CONVERSION (drop-off)

| # | Risque | Estimation drop-off | Détail |
|---|--------|---------------------|--------|
| C1 | Proprio ne trouve pas comment générer un bail depuis candidatures | **30-40 %** | 3 entry points fragmentés, aucun depuis `/candidatures`. |
| C2 | Locataire abandonne car ne peut pas lire le PDF avant d'accepter | **15-25 %** | "Je signe quoi ?" — méfiance. |
| C3 | Locataire en limbo entre acceptation et réception bail | **10-20 %** | Pas de page "On attend que [proprio] envoie", pas de notif. |
| C4 | Locataire doute après signature (silent success) | **5-10 %** | Va relancer le proprio sur WhatsApp = sortie de plateforme. |
| C5 | Proprio rate la contresignature (statut non-realtime) | **5-10 %** | Croit que rien ne s'est passé. |

**Drop-off cumulé estimé sur tunnel complet : 50-70 % de candidats acceptés ne vont pas jusqu'à un bail double-signé.**

### 4.3 🔴 Risques TRUST

| # | Risque | Détail |
|---|--------|--------|
| T1 | Email Resend sans preview → ressenti phishing | Pas de logo, pas de récap loyer/adresse dans le mail. |
| T2 | Page `/bail-invitation/[token]` sans badge "verified landlord" | Trust-signal manquant. |
| T3 | Pas d'email confirmation post-signature avec PDF signé attaché | Léa pense que ça n'a pas marché. |
| T4 | Mention "fonctionnalité à venir" (avenant) sans timeline | Perception "produit incomplet". |
| T5 | Form bail proprio = 50 champs sans wizard | "C'est trop compliqué, je vais passer par un avocat." |

---

## 5. Recommandations priorisées

### 🔴 PHASE 1 — CRITIQUE (à shipper sous 2 semaines)

#### R1.1 — PDF preview avant envoi (proprio)
**Problème :** ligne `bail/[id]/page.tsx:681-687` génère + envoie en 1 clic.
**Fix :**
1. Bouton "Générer & prévisualiser" → ouvre modal avec PDF inline (iframe blob).
2. Boutons modal : "Modifier le bail" / "Confirmer et envoyer au locataire".
3. Email Resend déclenché seulement après confirmation.
**Effort :** 1 jour. **Impact conversion :** +10-15 % proprio satisfaction, -90 % bails à corriger.

#### R1.2 — Locataire peut lire le PDF avant d'accepter
**Problème :** `/bail-invitation/[token]/page.tsx` n'expose pas le PDF.
**Fix :**
1. Si proprio a uploadé un PDF (`bail_source='imported'`) ou généré via form → exposer un lien "Lire le bail (PDF)" sur la page d'acceptation.
2. Sinon, afficher au moins un récap structuré : durée, loyer, charges, dépôt, clauses spéciales.
3. Disclaimer : "En cliquant 'Accepter', vous reconnaissez avoir pris connaissance du bail ci-dessus."
**Effort :** 0.5 jour si PDF déjà uploadé. 2 jours si form-generated (génération preview server-side).
**Impact conversion :** +10-20 % acceptation. **Impact légal :** sécurise consentement éclairé.

#### R1.3 — CTA "Générer le bail" sur la candidatures page
**Problème :** [candidatures/page.tsx:217-231](nestmatch/app/proprietaire/annonces/[id]/candidatures/page.tsx#L217) sans bouton bail.
**Fix :**
1. Sur chaque CandidatureCard, ajouter un bouton primary "Générer le bail →" qui pointe vers `/proprietaire/bail/[id]?locataire={email}`.
2. Bouton conditionnel : visible si statut candidature = "accepté" ou "visite_effectuée".
3. Si annonce a déjà un bail en cours pour cet email → bouton "Voir le bail en cours →".
**Effort :** 0.5 jour. **Impact conversion :** +30-40 % discovery proprio.

#### R1.4 — Statut signature en temps réel
**Problème :** `/proprietaire/bail/[id]/page.tsx` n'a pas de listener Supabase Realtime sur `bail_signatures`.
**Fix :**
1. Subscription `postgres_changes` sur `bail_signatures` filtrée par `annonce_id`.
2. Refetch + toast "Le locataire vient de signer le bail" à l'INSERT.
3. Idem côté locataire dans `/mon-logement` pour la contresignature proprio.
**Effort :** 0.5 jour. **Impact conversion :** +5-10 %, -50 % messages "tu as signé ?".

#### R1.5 — Email confirmation post-signature avec PDF signé
**Problème :** `/api/bail/signer/route.ts` envoie une notif interne mais pas d'email.
**Fix :**
1. À chaque signature, envoyer email Resend avec PDF signé attaché (régénéré server-side avec `bailPDF.ts` + signatures embarquées).
2. Subject : "✓ Bail signé le [date] — [adresse]".
3. Body : récap + PDF en pièce jointe + lien `/mon-logement`.
**Effort :** 1 jour. **Impact trust :** énorme, éleve la perception "produit pro".

---

### 🟠 PHASE 2 — IMPORTANT (sous 4 semaines)

#### R2.1 — Page "Bail en cours" côté locataire (entre acceptation et signature)
**Problème :** Limbo silencieux post-acceptation invitation.
**Fix :** Page `/mon-logement` affiche carte "Bail invité par [proprio] — en attente de génération du PDF par [proprio]". Avec timeline visuelle.

#### R2.2 — Échéancier loyers visible côté locataire
**Problème :** 12 loyers générés en DB, jamais affichés.
**Fix :** Section "Mes loyers à venir" dans `/mon-logement` avec calendrier et statuts. Notif "Échéancier prêt" à la double signature.

#### R2.3 — Wizard 5 étapes pour 1er bail
**Problème :** Form 15 sections overwhelming.
**Fix :** Mode "Premier bail" (détecté = 0 baux antérieurs proprio) propose un wizard 5 steps : Parties / Bien / Financier / Annexes / Récap. Chaque step max 8 champs. Mode "Avancé" reste accessible.

#### R2.4 — Refus locataire : message au proprio + retry inline
**Problème :** Refus = silence côté proprio + re-création manuelle.
**Fix :**
1. À refus, créer message `[BAIL_REFUSE]` dans threads avec raison optionnelle.
2. Côté proprio, CTA "Renvoyer à un autre email" qui ouvre `/proprietaire/bail/importer` pré-rempli avec données précédentes.

#### R2.5 — Multi-candidat : notification rejet automatique
**Problème :** Candidats 2-5 ghostés.
**Fix :** Quand `annonce.locataire_email` est set à candidat1, INSERT messages `[CANDIDATURE_REFUSEE_BAIL_ATTRIBUE]` aux autres + toast "Le bien a été attribué à un autre candidat".

#### R2.6 — BailTimeline visible côté locataire
**Problème :** Timeline calculée mais affichée seulement dans dashboard proprio.
**Fix :** Importer `BailTimeline` dans `/mon-logement` avec vue locataire (mêmes 4 steps : Acceptée / Bail / EDL / Loyer).

#### R2.7 — Signature canvas : bouton "Effacer"
**Problème :** Si raté = bloqué.
**Fix :** Bouton "Effacer la signature" dans `BailSignatureModal` step 3.

#### R2.8 — Mention pré-remplie avec validation forte
**Problème :** Mention non pré-remplie + regex faible.
**Fix :**
1. Pré-remplir la mention avec "Lu et approuvé, bon pour accord".
2. Validation stricte : `mention.trim().toLowerCase() === "lu et approuvé, bon pour accord"`.
3. Renforce audit-trail eIDAS.

---

### 🟢 PHASE 3 — NICE-TO-HAVE (Q3 2026)

#### R3.1 — Avenant feature
Cf [AUDIT_FLOW_BAIL.md](nestmatch/docs/AUDIT_FLOW_BAIL.md). Permettre modification post-signature avec re-signature partielle.

#### R3.2 — Hash PDF re-vérifié au download
Comparer hash stocké vs hash recalculé. Alert si tampering.

#### R3.3 — IRL indexation auto annuelle
Notif proprio + locataire à anniversaire bail avec calcul IRL.

#### R3.4 — Préavis (notice) workflow
Templates + countdown + génération automatique de quittance de fin.

#### R3.5 — Email Resend rebrandé KeyMatch
Logo, footer, CTA boutons stylés (actuellement plain text).

#### R3.6 — Mode "import existant" simplifié
1 seul path "Vous avez déjà un bail PDF" avec 5 champs minimum (vs form 15 sections aujourd'hui).

#### R3.7 — Onboarding proprio "Comment fonctionne le bail KeyMatch"
Modal walkthrough 3 écrans avant 1er bail.

---

## 6. Verdict détaillé

### Forces (ce qui mérite d'être préservé)
- ✅ **eIDAS Niveau 1** correctement implémenté (audit-trail propre, hash, IP, user-agent, mention).
- ✅ **PDF ALUR riche** (1035 lignes `bailPDF.ts`, ~50 champs, clauses obligatoires couvertes).
- ✅ **Pré-remplissage agressif** — réduction de saisie significative.
- ✅ **Validation contextuelle excellente** (avertissements jaunes pointant la section).
- ✅ **Auto-save localStorage** sur form bail — résilient.
- ✅ **Auto-génération loyers** à double signature (récemment ajoutée V23.3).
- ✅ **Design system cohérent** (Fraunces, palette, cards).

### Faiblesses (ce qui casse l'expérience)
- ❌ **Pas de preview PDF avant envoi** (proprio).
- ❌ **Pas de PDF lisible avant acceptation** (locataire).
- ❌ **Tunnel candidat → bail invisible** (no CTA candidatures).
- ❌ **Statut bail non-realtime** sur form proprio.
- ❌ **Succès signature silencieux** (no email, no toast persistant).
- ❌ **Loyers générés mais cachés** côté locataire.
- ❌ **EDL transition asymétrique** (proprio CTA, locataire orphelin).
- ❌ **Refus / multi-candidat = ghosting**.
- ❌ **Wizard step 7 piège** (loué sans bail).

### Note finale par dimension

| Dimension | Note |
|-----------|------|
| Conformité légale (eIDAS, ALUR) | 8/10 |
| Audit-trail / sécurité signatures | 7/10 |
| Discovery / découvrabilité | 3/10 |
| Confidence-building (trust signals) | 4/10 |
| Tunnel de conversion / UX critique | 4/10 |
| Cohérence cross-pages (status, notifs, timeline) | 4/10 |
| Copy / micro-copy | 7/10 |
| Pré-remplissage / efficacité formulaire | 8/10 |
| Mobile / responsive (à valider plus en détail) | 5/10 |
| Robustesse (gestion erreurs, recovery) | 5/10 |

**Moyenne pondérée : 5,5 / 10**

> Le moteur est solide, l'habitacle est cassé. KeyMatch a un bail flow **techniquement plus complet que la moyenne du marché PAP**, mais **expérience produit en-dessous des standards d'un Doctolib ou d'un Qonto**. Les 3 risques 🔴 cités en TL;DR sont fixables en **3-5 jours de travail** et changeraient la perception complète du produit.

---

## 7. Plan d'action immédiat (next 2 sprints)

**Sprint 1 (semaine 1) :**
- [ ] R1.3 CTA candidatures (0.5j)
- [ ] R1.4 Realtime statut signature (0.5j)
- [ ] R1.1 PDF preview avant envoi (1j)
- [ ] R2.7 Bouton effacer signature (0.5j)
- [ ] R2.8 Mention pré-remplie + validation forte (0.5j)

**Sprint 2 (semaine 2) :**
- [ ] R1.2 PDF lisible avant acceptation (2j)
- [ ] R1.5 Email confirmation post-signature avec PDF attaché (1j)
- [ ] R2.2 Échéancier loyers visible côté locataire (1j)
- [ ] R2.6 BailTimeline côté locataire (0.5j)

**Total estimé : ~7,5 jours-dev** pour passer de **5,5/10 à 7,5+/10**.

---

**END OF AUDIT V31**
