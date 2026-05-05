# Audit légal FR — KeyMatch — 2026-05-06

Auditeur : `french-legal-page-auditor`
Périmètre : pages `cgu`, `cgv`, `mentions-legales`, `confidentialite`, `cookies` + composant `CookieBanner.tsx`
Mode : read-only — recommandations uniquement

---

## Score global : **78 / 100**

| Page                       | Score    | Statut                                                  |
|----------------------------|----------|---------------------------------------------------------|
| Mentions légales           | 6 / 12   | Bloquant : SIRET / RCS / capital / siège sociale TODO   |
| CGU                        | 13 / 15  | Solide, manque clause pre-contractuelle L221-5 explicite |
| CGV                        | 13 / 14  | Très bon, prévoit même des cas non encore actifs         |
| Politique de confidentialité | 19 / 21 | Très solide RGPD, manque DPO + droit d'opposition prospection |
| Cookies (page + banner)    | 13 / 14  | Excellente conformité CNIL 2020 ; petit défaut UX hiérarchique |
| Conformité globale Hoguet  | 4 / 4    | Statut LCEN art. 6-I-2° clairement affirmé              |
| Bail mobilité loi ELAN     | 1 / 4    | Non mentionné explicitement dans CGU / CGV              |
| Indexation pages légales   | 9 / 16   | Mentions légales `noindex` (TODO assumé) ; reste OK     |

> Score = 78/100. Excellent niveau de rédaction et de couverture juridique pour une plateforme en phase beta. Les manques sont essentiellement liés à l'absence de société immatriculée (cohérent avec phase beta solo founder). Au lancement commercial : combler les TODO mentions légales et c'est ~92/100.

---

## 1. Mentions légales — `nestmatch/app/mentions-legales/page.tsx`

**Score : 6 / 12**
**Verdict : conforme LCEN art. 6-III en structure, mais 5 champs critiques restent en TODO.**

### Présent
- Identité éditeur (raison sociale "KeyMatch SAS", forme juridique SAS) — affirmée
- Email contact `contact@keymatch-immo.fr`
- Directeur publication : Paul Sadrant
- Hébergeur Vercel Inc. avec adresse complète US (440 N Barranca Ave #4133, Covina, CA 91723)
- Sous-traitant DB/storage Supabase Inc. avec adresse Singapore
- Section LCEN art. 6 (responsabilité hébergeur)
- Procédure de signalement de contenu illicite (date / identité / URL / motifs)
- Liens vers CGU, confidentialité, cookies, contact
- `metadata.robots = { index: false, follow: true }` — page exclue de l'index Google tant que TODO non résolus

### Lacunes
- **Capital social : `<span style={S.todo}>à renseigner...</span>`** — obligatoire LCEN si SAS
- **RCS + ville : TODO** — obligatoire si société immatriculée
- **SIRET : TODO** — obligatoire LCEN art. 6-III-1° a)
- **N° TVA intracommunautaire : TODO** — obligatoire si activité TVA
- **Adresse siège social : TODO** — obligatoire LCEN
- **Téléphone éditeur** : absent (LCEN exige email OU téléphone — email seul = OK)
- **Téléphone hébergeur Vercel** : absent (LCEN art. 6-III-2° exige téléphone hébergeur — recommandation : `+1 559 288 7060` Vercel support)
- **Date "dernière mise à jour"** présente via `subtitle="En vigueur au 18 avril 2026"` mais devrait être actualisée à chaque modif réelle

### Cohérence affirmation/réalité
La page affirme "**KeyMatch SAS** / **SAS**" alors que le `<LegalNotice>` reconnaît que les champs sont à finaliser **avant lancement commercial**. C'est une **incohérence rédactionnelle** : si la SAS n'existe pas encore, il ne faut pas affirmer la forme juridique. Deux options propres :
- **Option A (phase beta cohérente)** : retirer "KeyMatch SAS" et "SAS", remplacer par "Paul Sadrant, entrepreneur individuel" avec adresse de domiciliation BAL postale ou personnelle, et préciser "site édité à titre personnel / phase beta non commerciale".
- **Option B (en cours d'immatriculation)** : conserver "KeyMatch SAS" mais ajouter "société en cours d'immatriculation" et la date prévue.

> ⚠️ Risque réel : LCEN art. 6-VI prévoit des sanctions (1 an d'emprisonnement / 75 000 € d'amende pour personne physique) en cas d'omission **volontaire** d'identification de l'éditeur. La phrase "à renseigner avant lancement commercial" ne couvre pas ce risque tant que le site est public et accessible.

---

## 2. CGU — `nestmatch/app/cgu/page.tsx`

**Score : 13 / 15**
**Verdict : très solide pour une plateforme beta. Couvre la quasi-totalité de l'art. L221-5 Code conso.**

### Présent (excellent)
- Objet, définitions claires, accès/inscription
- **Section 4 — qualification LCEN explicite** : "L'Éditeur n'est jamais partie aux contrats de location... agit uniquement en tant qu'intermédiaire technique et hébergeur au sens de la LCEN." → **clarification statut Hoguet vs LCEN parfaite.**
- Section 5 — gratuité phase beta + clause d'évolution
- Section 6 — obligations utilisateurs avec **renvoi explicite** :
  - loi ALUR n° 2014-366
  - **décret n° 2015-1437 du 5 novembre 2015** (liste limitative pièces dossier locataire) — **excellent point juridique, rare**
  - art. 22-2 loi 89-462
- Section 7 — modération + signalement (LCEN compatible)
- Section 8 — responsabilité (limitée, hébergeur LCEN)
- Section 9 — propriété intellectuelle + licence user content
- Section 10 — renvoi politique conf
- Section 11 — renvoi cookies
- Section 12 — résiliation (côté user + côté éditeur)
- Section 13 — modification CGU + notification
- Section 14 — droit FR + tribunaux compétents + plateforme ODR UE

### Lacunes
- **🟠 Médiation consommation art. L612-1** : la CGU mentionne uniquement la plateforme ODR UE (`ec.europa.eu/consumers/odr`). Mais l'art. L612-1 du Code conso impose qu'un **médiateur de la consommation nommément identifié** soit accessible (CMAP, CRDC, MEDICYS, etc.). À défaut → amende administrative 3 000 € (PM) / 15 000 € (PM avec antécédents). La CGV section 7 mentionne L612-1 mais sans nommer le médiateur — même lacune.
- **🟠 Pré-contractuel L221-5 / L111-1** : informations à fournir AVANT acceptation des CGU — actuellement l'écran d'inscription doit afficher (vérification hors scope mais à confirmer) : prix (gratuit), caractéristiques essentielles, durée du contrat, identité prestataire. Recommandation : ajouter un récapitulatif "Avant de vous inscrire" en haut de la CGU + lien depuis le formulaire d'inscription.
- **🟢 Bail mobilité (loi ELAN 2018, art. 107)** non mentionné. La plateforme génère des baux PDF — précise-t-elle quel type ? Si elle propose le bail mobilité (1-10 mois, locataire en mobilité professionnelle), il faudrait section dédiée car art. 25-12 à 25-18 loi 89-462 impose mentions spécifiques (motif mobilité du locataire, durée non renouvelable, dépôt de garantie interdit). Recommandation : ajouter dans la section 4 description du service un alinéa "Les baux générés via la Plateforme sont conformes à la loi du 6 juillet 1989 modifiée. Le type de bail est sélectionné par le Propriétaire (bail nu, bail meublé, bail mobilité loi ELAN du 23 novembre 2018)."

### Excellents points
- ✅ Pas une seule mention "agent immobilier" → **loi Hoguet correctement écartée**
- ✅ Statut LCEN affirmé deux fois (section 4 et 8)
- ✅ Renvoi explicite décret 2015-1437 (très rare dans les CGU marketplaces immo, montre la qualité juridique)

---

## 3. CGV — `nestmatch/app/cgv/page.tsx`

**Score : 13 / 14**
**Verdict : excellente CGV anticipative. Couvre des cas non encore activés — bonne pratique.**

### Présent (excellent)
- Articulation CGU/CGV (en cas de contradiction CGV prévalent pour services payants — clause classique, OK)
- **Section 2** : gratuité phase beta affirmée pour les deux parties + liste exhaustive des services gratuits (création compte, annonces, messagerie, dossier locataire chiffré, signature eIDAS Niv 1, PDF, archive 3 ans loi ALUR, notifications)
- **Section 3** : services premium futurs anticipés (assurance loyers impayés, vérification dossier, mise en avant, DPE) avec **opt-in explicite + notification email préalable** → conforme L221-5 et L221-2-1
- Section 4 : modalités paiement futures (Stripe SAS / DSP2 / PCI-DSS) — **mention non-stockage CB/IBAN parfaite**
- **Section 5 — droit de rétractation L221-18** + **exception L221-28** (services pleinement exécutés) — rédaction juridique propre
- Section 6 — limitation responsabilité (au montant perçu) + redite intermédiaire technique
- Section 7 — médiation L612-1 + ODR UE + tribunaux FR
- Section 8 — modification CGV avec préavis 30 jours pour modifications substantielles + droit de résiliation sans frais

### Lacunes
- **🟠 Médiateur consommation non nommé** (idem CGU) — L612-1 exige adhésion à un médiateur agréé (CMAP, MEDICYS, etc.). À nommer dès qu'une activité payante démarre.
- **🟢 Garantie légale conformité (art. L217-3 Code conso)** non mentionnée explicitement — recommandation : ajouter dans section 6 "L'Éditeur garantit le service contre les défauts de conformité au sens de l'art. L217-3 et suivants du Code de la consommation".

---

## 4. Politique de confidentialité — `nestmatch/app/confidentialite/page.tsx`

**Score : 19 / 21**
**Verdict : très solide RGPD, l'une des meilleures pages de l'audit.**

### Présent (excellent)
- Préambule + RGPD 2016/679 + loi 78-17
- Section 2 : responsable du traitement (renvoi mentions légales) + email contact
- Section 3 : 9 catégories de données détaillées avec **mention bcrypt** pour passwords + **renvoi décret 2015-1437** pour justificatifs dossier
- Section 4 : 10 finalités explicites incluant **mention art. 22 RGPD** (pas de profilage automatisé avec effet juridique)
- Section 5 : 4 bases légales (contrat, consentement, intérêt légitime, obligation légale) — toutes les bases art. 6 RGPD couvertes
- **Section 6 : sous-traitants nommés** — Vercel (DPF), Supabase EU Frankfurt, Resend (AWS SES), Cloudflare, Google OAuth, Anthropic, Upstash. **Mention DPF du 10 juillet 2023** explicite.
- **Section 7 : durée conservation par catégorie** — détail très complet : compte actif, suppression 30j, bail 3 ans (loi ALUR art. 8), eIDAS 10 ans (règlement UE 910/2014 art. 24), EDL/quittances 3 ans (loi 89-462 art. 22), comptable 10 ans (Code commerce L.123-22), fiscal 6 ans (LPF L.102 B), logs 12 mois (LCEN décret 2011-219), tokens partage 7 jours, signalements 3 ans
- Section 8 : sécurité (bcrypt 12, HTTPS, séparation rôles, journalisation, sauvegardes) + **engagement notification CNIL 72h art. 33 RGPD**
- Section 9 : 7 droits RGPD (accès, rectif, effacement, limitation, portabilité, opposition, retrait) + **directives post-mortem loi 2016-1321** + délai réponse 1 mois + droit plainte CNIL avec lien
- Section 10 : transferts hors UE encadrés (CCT, DPF, décisions adéquation)
- Section 11 : renvoi cookies
- Section 12 : modification politique avec notification

### Lacunes
- **🟠 DPO (Data Protection Officer) non mentionné** : KeyMatch traite données KYC (justificatifs identité), revenus, bail (donnée contractuelle de logement = sensible), géolocalisation. L'art. 37 RGPD n'impose pas un DPO sauf "suivi régulier et systématique à grande échelle" — KeyMatch peut s'en passer en phase beta, mais à recommander en tant que bonne pratique. Recommandation : mentionner "À ce jour, KeyMatch n'a pas désigné de DPO formel ; toute question RGPD doit être adressée à `privacy@keymatch-immo.fr` (ou contact@). Un DPO sera désigné dès que les conditions de l'art. 37 RGPD seront remplies."
- **🟠 Droit d'opposition à la prospection (art. 21 RGPD + art. L34-5 CPCE)** : non mentionné. Si KeyMatch envoie des emails marketing (lancement post-beta, newsletters), il faut mentionner ce droit spécifiquement + un mécanisme d'unsubscribe par email.
- **🟢 Caractère obligatoire/facultatif** : la formule "Les champs obligatoires sont signalés lors de la collecte" (section 3) est correcte mais pourrait être enrichie : "Le refus de fournir les données obligatoires empêche la création du compte" (RGPD art. 13.2.e).

---

## 5. Cookies — `nestmatch/app/cookies/page.tsx` + `nestmatch/app/components/CookieBanner.tsx`

**Score : 13 / 14**
**Verdict : excellente conformité CNIL 2020. Quasi-irréprochable. Un seul ajustement UX recommandé.**

### Page `/cookies` — présent (excellent)
- Définition cookie session vs persistant + interne vs tiers
- **Tableau 4 colonnes** : Catégorie / Finalité / Durée / Base légale — exactement le format CNIL recommandé
- 4 catégories : Nécessaires (intérêt légitime), Fonctionnels (consentement), Analytiques (consentement), Marketing (non utilisé — annoncé par transparence)
- Mention **NextAuth session-token + CSRF** explicite
- Liens config navigateur (Chrome / Firefox / Safari / Edge)
- Cookies tiers nommés (Google OAuth, base de données, OpenStreetMap)
- 6 droits RGPD listés
- Date mise à jour, contact CNIL avec lien

### CookieBanner — présent (excellent)
- Apparition à la première visite (`useEffect` + `getStoredConsent`)
- **3 boutons au même niveau** : "Tout accepter", "Personnaliser", "Tout refuser"
- localStorage `cookie_consent` avec 4 catégories + date ISO
- Pas de pré-cochage des cookies non essentiels (`functional` par défaut `true` dans state UI mais **pas écrit en localStorage tant que user ne sauve pas** — vérifié lignes 158-176)
- "Tout refuser" écrit `functional: false, analytics: false, marketing: false`
- Bouton flottant (icône cookie) en bas à gauche pour rouvrir le banner — conforme exigence CNIL "modifier ses choix à tout moment"
- Masqué sur pages avec carte Leaflet (UX, pas un défaut)

### Lacunes / défauts UX
- **🔴 Hiérarchie visuelle "Tout accepter" vs "Tout refuser" non équivalente** (CNIL recommandation 17 sept. 2020) :
  - "Tout accepter" : `background: "#111"` (noir), `color: "white"`, `padding: "10px 24px"`, `fontWeight: 700`, `fontSize: 13` — **bouton plein, prééminent**
  - "Tout refuser" : `background: "none"`, `border: "none"`, `color: "#8a8477"` (gris), `fontWeight: 500`, `textDecoration: "underline"` — **lien souligné gris, beaucoup moins visible**

  CNIL délibération SAN-2021-024 (Google) et SAN-2021-023 (Facebook) : amendes pour ce type de hiérarchie. **Refuser doit être aussi facile qu'accepter.**

  Fix proposé (ne pas implémenter — read-only) : donner à "Tout refuser" exactement le même style que "Personnaliser" (border 1px gris, padding identique, fontWeight 600, sans soulignement).

- **🟢 Durée stockage consentement** : le code écrit `date: new Date().toISOString()` mais ne définit pas de TTL. CNIL recommande **6 mois** (pas 13 — 13 mois c'est la durée max des cookies eux-mêmes). À ajouter : à la lecture du consent, vérifier `Date.now() - new Date(stored.date).getTime() > 180 * 24 * 3600 * 1000` → relancer le banner.

- **🟢 Catégorie "Analytiques" annonce "Aucun outil tiers" mais "Comptage des pages vues / Performance"** : si réellement aucun outil tiers, alors c'est de la mesure d'audience interne anonyme → **exemption CNIL** (peut être déposé sans consentement). Si Vercel Analytics est actif (à vérifier `app/layout.tsx`), il faut le mentionner.

- **🟢 Cohérence durée page vs banner** : la page `/cookies` annonce "Fonctionnels — durée 1 an" et "Analytiques — durée Session", mais le banner n'expose pas ces durées. Ajout possible dans le banner (déjà ok, l'utilisateur peut consulter `/cookies`).

---

## 6. Statut KeyMatch — Intermédiaire LCEN vs Éditeur

**Score : 4 / 4 — clarification PARFAITE.**

Trois ancrages dans les pages :

1. **CGU section 4** : "L'Éditeur n'est jamais partie aux contrats de location conclus entre Locataires et Propriétaires. Il agit uniquement en tant qu'intermédiaire technique et hébergeur au sens de la loi pour la confiance dans l'économie numérique (LCEN)."
2. **CGU section 8** : "L'Éditeur n'est pas responsable du contenu publié par les Utilisateurs. Il agit en qualité d'hébergeur au sens de l'article 6 de la LCEN."
3. **Mentions légales section Responsabilité** : reprise art. 6 LCEN + obligation de retrait prompt sur signalement.

**Conséquences positives** :
- Loi Hoguet n° 70-9 (transactions immobilières) **n'applique pas** : KeyMatch n'est ni mandataire, ni agent immobilier, ni administrateur de biens. Pas de carte T/G requise.
- Pas d'obligation garantie financière, pas d'obligation RCP Hoguet.

**Vigilance** :
- Si KeyMatch ajoute des fonctions "vérification dossier locataire payante" (mentionnée CGV section 3), cela reste un service technique — pas de basculement Hoguet.
- Si KeyMatch ajoute des fonctions "négociation entre parties", "estimation du loyer", "rédaction du bail à la place du proprio", **risque de requalification en agent immobilier ou en activité de gestion** — à éviter ou à encadrer par carte G.
- KeyMatch génère le bail PDF — si c'est un **template auto-rempli** (le proprio remplit, la plateforme assemble), pas de problème. Si KeyMatch **rédige sur mesure**, basculement possible.

**Recommandation** : ajouter dans CGU section 4 une phrase explicite : "Les modèles de bail proposés sont des modèles légaux pré-établis (bail nu loi 89-462, bail meublé, bail mobilité loi ELAN). KeyMatch n'effectue aucune rédaction sur mesure ni conseil juridique personnalisé."

---

## 7. Bail mobilité loi ELAN — manquant

**Score : 1 / 4**

CGV section 2 mentionne "signature électronique des baux" sans préciser les types. CGU section 4 mentionne "génération de documents (bail, état des lieux, quittances)" sans plus.

Si KeyMatch propose le **bail mobilité** (loi ELAN n° 2018-1021 du 23 novembre 2018, art. 107 — codifié art. 25-12 à 25-18 loi 89-462), il faut mentionner :
- Caractère temporaire (1 à 10 mois non renouvelable)
- Justification du motif de mobilité (formation, mission, mutation, étude, stage)
- **Interdiction du dépôt de garantie** (art. 25-15)
- Pas de visale/garant exigible obligatoirement
- Mention obligatoire dans le bail (clause de motif)

**À vérifier hors scope** : le code de génération PDF (`nestmatch/lib/bailPDF.ts`) gère-t-il le bail mobilité ? Si oui, il faut une section dédiée dans CGU et dans Politique conf (durée conservation différente potentiellement).

---

## 8. Indexation des pages légales

| Page                | `metadata.robots` | Verdict |
|---------------------|-------------------|---------|
| `/cgu`              | par défaut (index)| ✅ OK   |
| `/cgv`              | par défaut (index)| ✅ OK   |
| `/mentions-legales` | `index: false`    | 🟠 Justifié tant que TODO non résolus, mais à activer au lancement |
| `/confidentialite`  | par défaut (index)| ✅ OK   |
| `/cookies`          | layout par défaut (index) | ✅ OK |

> Le `noindex` sur mentions légales est cohérent avec la note "à finaliser avant lancement commercial". À retirer dès que SIRET/RCS/capital/siège seront renseignés.

---

## Top 5 fixes prioritaires

### 1. 🔴 BLOQUANT — Mentions légales : choisir un statut juridique cohérent (impact LCEN art. 6-VI)

Le site est public sous `keymatch-immo.fr`, donc les mentions légales **doivent être complètes**. La phrase "à renseigner avant lancement commercial" ne couvre pas le risque pénal LCEN art. 6-VI (1 an / 75 000 €).

Action : remplacer "KeyMatch SAS" par soit :
- (A) "Paul Sadrant, entrepreneur individuel" + adresse domiciliation + "site édité à titre personnel, phase beta non commerciale"
- (B) Maintenir "SAS en cours d'immatriculation" avec date prévue d'inscription RCS

Estimation effort : 30 min de rédaction.

### 2. 🟠 IMPORTANT — Banner cookies : équilibrer "Tout refuser" vs "Tout accepter" (impact CNIL délibération 2020)

Risque : amende administrative CNIL (jusqu'à 2% du CA mondial). Précédents : Google 150M€, Facebook 60M€, Amazon 35M€ — tous pour ce motif.

Action : appliquer à `<button onClick={handleRefuseAll}>` exactement le même style visuel que `<button onClick={() => setShowDetails(true)}>` (Personnaliser) — border 1px, padding 8px 20px, fontWeight 600, sans `textDecoration: underline`.

Fichier : `nestmatch/app/components/CookieBanner.tsx` lignes 326-344.

Estimation effort : 5 min.

### 3. 🟠 IMPORTANT — CGU + CGV : nommer un médiateur de la consommation agréé (L612-1)

Risque : amende administrative DGCCRF 3 000 € PP / 15 000 € PM. Obligation effective dès qu'une activité payante existe — phase beta gratuite atténue temporairement.

Action : adhérer à un médiateur (CMAP, MEDICYS, CRDC) puis ajouter dans CGU section 14 et CGV section 7 :
> "Conformément à l'art. L612-1 du Code de la consommation, l'Utilisateur peut recourir gratuitement au médiateur agréé : [Nom du médiateur], adresse, site web, formulaire de saisine."

Estimation effort : 1h (choix médiateur + adhésion) + 10 min rédaction.

### 4. 🟠 IMPORTANT — Politique confidentialité : ajouter mention DPO + droit opposition prospection

Action 1 — DPO (sec. 2 ou nouvelle sec. 2bis) :
> "À ce jour, KeyMatch n'a pas désigné de Délégué à la Protection des Données au sens de l'art. 37 RGPD. Toute question relative à vos données personnelles peut être adressée à privacy@keymatch-immo.fr."

Action 2 — droit opposition prospection (sec. 9) :
> "Vous pouvez à tout moment vous opposer à la réception de communications commerciales par email, sans frais, en cliquant sur le lien de désabonnement présent dans chaque email ou en nous écrivant à contact@keymatch-immo.fr."

Estimation effort : 15 min.

### 5. 🟢 RECOMMANDÉ — CGU section 4 : préciser type de baux générés (anti-requalification Hoguet)

Action : ajouter un alinéa après la liste des fonctionnalités :
> "Les modèles de bail proposés (bail nu loi 89-462, bail meublé, bail mobilité loi ELAN du 23 novembre 2018) sont des modèles légaux pré-établis. KeyMatch n'effectue aucune rédaction sur mesure ni conseil juridique personnalisé."

Bénéfice : ferme la porte à toute tentative de requalification en agent immobilier ou conseil juridique sans titre. Couvre aussi l'exigence d'information sur le bail mobilité.

Estimation effort : 10 min.

---

## Annexes

### Lacunes mineures (pour info, non prioritaires)

- Mentions légales : ajouter téléphone Vercel `+1 559 288 7060` (LCEN art. 6-III-2°)
- Politique conf : préciser conséquences refus données obligatoires (art. 13.2.e RGPD)
- CGV : ajouter garantie légale conformité L217-3
- Banner cookies : ajouter TTL 6 mois sur consent stocké
- Banner cookies : préciser durées dans le banner ou lien direct vers `/cookies` plus visible
- CookieBanner ligne 233 : émoji 🍪 contredit la règle "pas d'emojis sur pages publiques" (`memory/feedback_no_emojis_public.md`) — à arbitrer (le banner cookies n'est pas la homepage, mais reste visible publiquement)

### Pages annexes à vérifier hors scope

- Existence d'une page `/contact` (référencée depuis CGU section 15 et mentions légales) → si manquante, lien cassé
- `/privacy@keymatch-immo.fr` : alias mail créé chez Resend ? Sinon les demandes d'exercice de droits RGPD tombent dans le vide → **risque sanction CNIL pour défaut de réponse art. 12.3 RGPD**
- `app/layout.tsx` : Vercel Analytics activé sans consentement explicite ? À vérifier — si oui, et si cookies déposés, non-conformité ePrivacy

### Veille légale à activer

- Évolution loi 89-462 (amendements LDA / squatting / encadrement loyers)
- Orientations CNIL annuelles (2026 attendu)
- ePrivacy refonte UE (en cours depuis 2017)
- DSA (Digital Services Act) UE — applicable depuis 17 février 2024 — **KeyMatch est-il une "plateforme intermédiaire" au sens du DSA ?** Le règlement (UE) 2022/2065 impose nouvelles obligations (point de contact, transparence modération, notification injonctions) si traffic > seuils. À évaluer.

---

## Conclusion

**KeyMatch a un socle légal solide pour une plateforme en phase beta solo founder**, supérieur à la moyenne du marché immobilier digital français. La rédaction est précise, les renvois aux textes (loi 89-462, décret 2015-1437, loi ALUR, RGPD, eIDAS, DPF) sont nombreux et corrects. Le statut LCEN art. 6 est clairement et **trois fois affirmé** — c'est un excellent point qui ferme la porte à la loi Hoguet.

**Le seul vrai blocage est la cohérence des mentions légales** : il faut soit assumer la phase beta personnelle (Paul, entrepreneur individuel), soit accélérer l'immatriculation SAS. La situation actuelle (afficher "KeyMatch SAS" + tous les champs critiques en TODO) crée une exposition LCEN art. 6-VI.

Les autres fixes (médiateur, banner cookies, DPO) sont importants mais non bloquants tant que l'activité reste gratuite et que le volume utilisateurs reste limité.

**Score global : 78/100. Combler les TODO mentions légales + rééquilibrer banner cookies → 92/100 atteignable en 2h de travail cumulé.**
