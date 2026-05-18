# Brainstorm — Système d'intégration agences immobilières

**Date** : 2026-05-18
**Statut** : exploration, pas d'implémentation décidée
**Pour** : Paul, fondateur KeyMatch

---

## 1. Le problème à résoudre

KeyMatch est aujourd'hui pensé pour des **proprios particuliers** (un bailleur,
un bien, une candidature à la fois). Une agence immo c'est :

- **Plusieurs collaborateurs** qui gèrent le même portefeuille
- **Dizaines à centaines de biens** à publier d'un coup
- Déjà **un logiciel métier** qui gère leur portefeuille (Apimo, Hektor,
  Périclès, Immo-Facile…)
- Déjà des annonces sur **SeLoger, LBC, Logic-immo, Bien'ici** via passerelles
- Un workflow différent : mandat, dossier, commission, suivi commercial

**Si on demande à une agence de saisir manuellement 50 biens un par un sur
KeyMatch, elle dit non.** Il faut une voie d'entrée massive.

---

## 2. Marché agences FR — qui on cible

### Les grands réseaux franchisés (volume → cible prioritaire)

| Réseau | Estimé biens loc | Logiciel back-office |
|---|---|---|
| Century 21 | 800+ agences | Hektor (gestion locative) |
| Orpi | 1300+ agences | Hektor, Apimo |
| Laforêt | 700+ agences | Apimo |
| Stéphane Plaza | 600+ agences | Périclès |
| ERA | 350+ agences | Hektor |
| Guy Hoquet | 530+ agences | Périclès, Hektor |
| Foncia | 600+ agences | Foncia internal |

### Mandataires / réseaux indépendants

- **SAFTI, IAD, Capifrance, MeilleursAgents** : agents indépendants, pas de
  bureau physique mais utilisent un logiciel central
- **Welmo, Liberkeys, Hosman, Imkiz** : néo-agences full digital, déjà
  sensibilisées à l'intégration API

### Petites agences locales (long tail)

- Agences de quartier, 1-5 collaborateurs
- Souvent Apimo en SaaS (~50€/mois)
- Décident plus vite, moins de bureaucratie achat

---

## 3. Standards d'intégration du métier — les "passerelles"

Quand une agence veut diffuser ses biens sur les portails (SeLoger, LBC, etc.)
elle a 3 voies :

### a) Saisie manuelle dans le logiciel métier + diffusion automatique

Le logiciel (Apimo, Hektor) envoie des feeds aux portails. Le format est
**propriétaire** mais documenté côté éditeur.

- **Apimo** : XML/REST API, doc publique pour les portails
- **Hektor** (Périclès) : XML, intégration "automatique" via partenariat
- **Périclès** : XML push, contrat de partenariat requis
- **Immo-Facile, Immo Cloud** : XML, REST

### b) Format pivot "SeLoger Pro" (ALUR XML)

Né dans les années 2000, format XML standardisé tentant de unifier. **Quasi
mort** mais certains anciens logiciels métier le supportent encore.

### c) API personnalisée

Quelques portails publient une API REST publique :
- **LBC Pro API** (payante, accès agences uniquement)
- **Bien'ici API** (B2B, contrat partenaire)
- **SeLoger API** (B2B, contrat partenaire)

**Conclusion** : pas de standard universel. Le plus utilisé en France =
**format Apimo XML** + **format Hektor XML** (couvre ~70% des agences).

---

## 4. Modèle technique proposé pour KeyMatch — 3 phases

### Phase A — Compte agence dans KeyMatch (8-15 jours dev)

**Objectif** : permettre à une agence d'avoir un compte différencié, multi-
utilisateur, sans rien changer au workflow KeyMatch actuel.

**Concrètement** :

1. **Nouveau type de compte** : `agence` (en plus de `proprietaire` /
   `locataire`)
2. **Champs spécifiques agence** :
   - Nom commercial + raison sociale + SIRET (vérifiable INSEE)
   - **Carte professionnelle T** (transactions immo, loi Hoguet) — obligatoire
     en France pour gérer des biens en location
   - Numéro RCS
   - Assurance RC pro (justificatif uploadable, vérification optionnelle)
   - Logo + couleurs marque (pour personnaliser ses annonces)
3. **Compte multi-collaborateurs** :
   - Un "owner" (gérant agence) invite N collaborateurs par email
   - Rôles : `admin` (gère collaborateurs + facturation future) /
     `agent` (crée annonces, voit candidatures) / `viewer` (lecture seule
     pour stagiaires)
   - Toutes les annonces appartiennent à l'agence, pas à un collaborateur
     individuel → si un agent part, les annonces restent
4. **Dashboard agence** dédié `/agence/` :
   - Vue agrégée : tous les biens, toutes les candidatures, tous les baux
   - Stats par agent (combien d'annonces, candidatures traitées, taux conv)
   - Vue "à faire" : candidatures non répondues, visites à confirmer, baux
     en attente signature
5. **Page publique agence** `/agence/[slug]` :
   - URL type `keymatch-immo.fr/agence/century-21-bastille`
   - Liste des biens en location de l'agence
   - Avis users (à terme)
   - Bouton "contact agence"
6. **Annonces marquées "Agence X"** :
   - Badge "Vérifié – Agence professionnelle" sur les annonces
   - Lien direct vers la page agence
   - Pour le locataire : signal de confiance

**Impact migration DB** :
- Nouvelle table `agences` (id, slug, nom, siret, carte_t, assurance, logo, …)
- Table `agence_membres` (agence_id, user_email, role, joined_at)
- Annonces gagnent une colonne `agence_id NULL` (pour particuliers, reste null)
- Page admin pour vérifier carte T (anti-fraude — KYC agence)

**Pas d'import massif à ce stade**, on reste sur saisie manuelle d'annonces
via le wizard existant. Mais le compte agence pose les fondations.

---

### Phase B — Import bulk via fichier XML/CSV (5-8 jours dev)

**Objectif** : pour les agences qui ont un logiciel métier, leur permettre
d'uploader un export pour créer 50 biens en 1 clic.

**Concrètement** :

1. Page `/agence/import` (admin agence uniquement) :
   - Upload XML Apimo / Hektor / CSV générique
   - Parser détecte le format auto
   - Preview : "Ce fichier contient 47 biens. Voici les 3 premiers :
     [titre / prix / surface]. Tout importer ? Sauter les doublons ?"
   - Mapping interactif si CSV (colonnes du CSV → champs KeyMatch)
2. **Parsers à écrire** :
   - `parsers/apimo.ts` (XML Apimo, format documenté côté Apimo SAS)
   - `parsers/hektor.ts` (XML Hektor, format Périclès)
   - `parsers/csv-generic.ts` (CSV avec mapping user-defined)
3. **Gestion doublons** :
   - Match sur `(adresse, surface, type_bien)` → si bien existant déjà
     dans l'agence → update au lieu de create
   - Si bien différent → create nouveau
4. **Photos** :
   - Si XML contient URLs photos → download + upload MinIO (workflow async,
     ~1-5 min pour 50 biens)
   - Si CSV pas de photos → demande à l'agence de drag-n-drop par bien
     plus tard

**Limites** :
- Pas de sync continu (l'agence doit re-upload si elle change un prix)
- Pas de diffusion KeyMatch → autre portail (one-way only)

**Cible** : ~80% des cas d'usage agence sont couverts. Reste les 20% qui
veulent du push automatique = Phase C.

---

### Phase C — API REST publique + sync continue (15-20 jours dev)

**Objectif** : connecter le logiciel métier agence en push automatique. Si
l'agence ajoute un bien dans Apimo → il apparaît automatiquement sur KeyMatch
dans la minute.

**Concrètement** :

1. **API REST KeyMatch** documentée OpenAPI v3 :
   ```
   POST   /api/v1/agences/{agence_id}/annonces      # create
   PUT    /api/v1/agences/{agence_id}/annonces/{id} # update
   DELETE /api/v1/agences/{agence_id}/annonces/{id} # archive
   GET    /api/v1/agences/{agence_id}/annonces      # list
   POST   /api/v1/agences/{agence_id}/photos        # upload photo
   GET    /api/v1/agences/{agence_id}/candidatures  # poll candidatures reçues
   ```
2. **Auth API key** :
   - Chaque agence génère sa clé dans `/agence/settings/api-keys`
   - Bearer token dans `Authorization`
   - Rate-limit 100 req/min par clé
   - Scopes : `annonces:read`, `annonces:write`, `candidatures:read`
3. **Webhooks** (pour les agences qui veulent recevoir les events) :
   - Configure URL webhook dans `/agence/settings/webhooks`
   - Events : `candidature.created`, `visite.confirmed`, `bail.signed`
   - Auth : signature HMAC SHA256 dans header `X-KeyMatch-Signature`
4. **Connecteurs prêts à l'emploi** (longue traîne, après le MVP API) :
   - Connecteur Apimo : KeyMatch poll l'API Apimo de l'agence, push KeyMatch
   - Connecteur Hektor : pareil
   - Documentation pour intégrateur Périclès / Immo-Facile

**Modèle économique** : c'est ici qu'on pourrait monétiser
- Compte agence : gratuit
- Import XML 1× : gratuit
- API REST + webhooks + sync continue : payant (~30-100€/mois selon volume) ?

---

## 5. Avantages KeyMatch pour les agences — la "value prop"

Pourquoi une agence basculerait vers KeyMatch alors qu'elle a déjà SeLoger Pro ?

### 1. **Coût** :
- SeLoger Pro : ~150-300€/mois selon zone géographique
- LBC Pro : ~50-150€/mois
- Logic-immo Pro : ~100€/mois
- **KeyMatch (Phase A+B) : gratuit**
- KeyMatch (Phase C API) : à définir mais largement moins cher

### 2. **Qualité du lead** : (vrai différenciateur)
- Sur SeLoger : agence reçoit 30 candidatures dont 25 sans dossier complet,
  perte de temps énorme.
- Sur KeyMatch : **dossier KYC vérifié** (CNI + revenus + contrat) →
  candidatures **pré-qualifiées** → tri 2× plus rapide.

### 3. **Algorithme matching** :
- Locataire qui a renseigné ses préférences a un score de compatibilité
  avec l'annonce. L'agence voit en priorité les locataires les plus
  compatibles → moins de candidatures non pertinentes.

### 4. **Workflow intégré** :
- Bail eIDAS, EDL contradictoire, quittances auto, IRL auto : aucun autre
  portail FR ne fait tout ça.
- Pour une agence : économise une signature Docusign / Yousign (~3-5€/bail)
  et 2h de saisie EDL.

### 5. **Conformité RGPD France** :
- Données hébergées 100% France OVH (Phase 7 cutover)
- vs SeLoger / Bien'ici hébergés sur AWS US

### 6. **Indépendance** :
- KeyMatch self-host, pas dépendant d'une politique de prix Schibsted
  (groupe norvégien qui détient SeLoger, LBC, Bien'ici).
- Une agence sur KeyMatch + 1 autre portail = diversifie son risque.

---

## 6. Acquisition agences — stratégie go-to-market

**Comment trouver les 10 premières agences ?**

### Approche 1 — Réseaux locaux (le plus simple à démarrer)

- Identifier 20 agences indépendantes ou franchisées dans 1 ville (Paris,
  Lyon, Marseille…)
- **Démarchage direct** : email personnalisé au gérant + appel suivi
- Argumentaire : "votre première année gratuite + onboarding fait par
  KeyMatch (j'importe vos 50 biens pour vous)"
- Cible : 1-2 agences pilotes → cas d'usage réels → témoignages

### Approche 2 — Salons immobiliers

- **RENT** (Rencontres de l'Innovation et des Métiers de l'immo, octobre Paris)
- **MIPIM** (Cannes, mars) — plutôt promoteur mais agences y vont aussi
- **Stand petit format + démo live** = 2-5k€ mais ROI direct

### Approche 3 — Content marketing B2B agences

- Blog KeyMatch : articles "Comment digitaliser sa gestion locative",
  "Les 5 erreurs de gestion locative qui coûtent cher", etc.
- LinkedIn : posts hebdo Paul fondateur, focus métier agence
- SEO ciblé : "logiciel gratuit agence immobilière", "alternative SeLoger Pro"

### Approche 4 — Partenariat avec un logiciel métier

- Le plus disruptif : **partenariat Apimo ou Hektor** pour intégration
  native "publier vers KeyMatch en 1 clic".
- Difficile à obtenir (ils peuvent se sentir concurrencés) mais énorme effet
  réseau si ça marche.

---

## 7. Plan de mise en œuvre — ce que je propose

**Phase 0 (cette semaine ou la semaine prochaine)** :
- Valide qu'on est OK sur l'idée
- Décide si le compte agence est gratuit perpétuellement ou freemium plus tard

**Phase A (sprint de 2 semaines)** :
- Migration DB : table `agences` + `agence_membres` + colonne `agence_id`
  sur `annonces`
- UI : pages `/agence/inscription`, `/agence/dashboard`, `/agence/[slug]`
- Wizard inscription avec vérification basique carte T (regex format) +
  upload assurance RC
- Sidebar admin : `/admin/agences` pour valider/refuser les inscriptions
- Sans Phase A, on ne peut rien faire pour les agences.

**Phase B (sprint de 1 semaine)** :
- Page `/agence/import` avec parser Apimo XML d'abord (le plus utilisé)
- Puis Hektor XML
- Puis CSV générique avec mapping
- Test avec 1 agence pilote (Paul démarche)

**Phase C (sprint de 3 semaines)** :
- API REST publique + auth API key + rate-limit
- Webhooks
- Doc OpenAPI publique
- Connecteur Apimo / Hektor automatique

**Modèle économique potentiel** :
- A + B : 100% gratuit → attire les agences
- C (API + webhooks + sync continue + support) : 49€/mois flat ou 0,50€/bien
  par mois → première source de revenu KeyMatch

---

## 8. Questions ouvertes pour Paul

1. **Validation concept** : OK pour partir là-dessus ? Ou tu vois autre chose ?
2. **Vérification carte T** : on fait du "déclaratif" (l'agence saisit son
   numéro, on vérifie le format) ou du "documenté" (upload PDF, vérif manuelle
   par toi en admin) ? **Recommandation : déclaratif + vérification manuelle
   admin avant validation du compte agence.** Pour 10 agences ça reste gérable.
3. **Branding** : l'agence peut customiser son logo + couleurs sur ses
   annonces ? Ou tout reste sous identité visuelle KeyMatch uniforme ?
   **Recommandation : permettre logo + couleur primaire pour la page
   `/agence/[slug]`, mais les annonces dans le feed public gardent l'UI
   KeyMatch (pour cohérence).**
4. **Limites comptes** : un compte agence peut avoir illimité de bien ?
   illimité de collaborateurs ? **Recommandation : illimité au début,
   limiter si abus.**
5. **Quand démarrer** : maintenant (avant d'avoir des particuliers users) ou
   après avoir validé KeyMatch avec 100 particuliers ?
   **Recommandation : valide d'abord particuliers (Priorité 1 du plan global),
   puis attaque agences. Sinon on disperse l'effort.**

---

## 9. Note importante — risque business

**Les agences sont un marché B2B saturé.** SeLoger, LBC, Bien'ici dominent
depuis 20 ans, ont des effets réseau énormes (locataires sont là). Une agence
ne va pas remplacer son canal principal pour KeyMatch — au mieux, en ajouter.

**Stratégie réaliste** : KeyMatch devient le **canal #2 ou #3** de l'agence,
positionné sur "qualité du lead" (dossier KYC) plutôt que "volume de leads".
Pas une concurrence frontale à SeLoger.

**Levier KeyMatch unique** : le dossier KYC pré-vérifié + le score de
matching. Aucun autre portail FR ne fait ça aujourd'hui.

---

## 10. À approfondir si on continue

- Étude de marché : 10 agences interviewées sur leur process actuel
- Benchmark prix précis SeLoger Pro / LBC Pro / Bien'ici Pro par tranche
  de volume
- Étude juridique : carte T obligatoire à vérifier pour la diffusion sur
  KeyMatch ? Ou juste pour le mandat ? (en théorie carte T = mandat de gestion,
  pas diffusion)
- Conformité ALUR : décret 2014-890 et liste des honoraires affichables
- Lien futur avec eIDAS niveau 2/3 (signature avancée) pour agences qui
  veulent niveau de preuve juridique supérieur sur le bail
