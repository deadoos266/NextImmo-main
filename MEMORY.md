# NestMatch — Mémoire du projet

## État actuel
- **Phase** : MVP avancé, en production sur Vercel
- **Stack** : Next.js 15 App Router, React 19, TypeScript, Supabase, NextAuth (Google + Credentials), Leaflet, SDK Anthropic
- **URL prod** : https://next-immo-main.vercel.app
- **Repo** : github.com/deadoos266/NextImmo-main (public — à passer en privé)
- **Dernière mise à jour** : 2026-04-18

## Pitch produit
Plateforme P2P de location immobilière (marché français). Locataires et propriétaires en direct, sans agence.
Différenciation : score de compatibilité propriété/locataire via algo maison (`lib/matching.ts`, 1000 pts, 7 dimensions).

## Décisions d'architecture
- **Styling** : inline styles uniquement (pas de Tailwind à l'exécution — installé mais non utilisé)
- **Palette** : `#F7F4EF` (fond global), `#111` (noir), `white` (cartes), `border-radius: 20px`
- **Typographie** : DM Sans (via `next/font/google`, font-display swap)
- **Pas d'emojis dans l'UI**
- **Écrire avec accents TOUJOURS** (é, è, à, ç, ê, ô, û, î)
- **Rôles** : locataire / propriétaire / admin — séparation STRICTE (un proprio ne voit jamais les scores de compatibilité)
- **Auth** : NextAuth JWT, Google OAuth + Credentials
- **DB** : Supabase PostgreSQL — client browser (anon key) + client serveur (service_role pour API routes)

## Conventions code
- Composants helpers (Toggle, Sec, F, etc.) définis HORS des composants React (évite bug perte de focus sur inputs)
- Jamais de `<nav>` dans une page (uniquement Navbar dans `app/layout.tsx`)
- Score affiché : `Math.round(score / 10) + "%"`
- Imports Supabase depuis `lib/supabase.ts` (browser) ou `lib/supabase-server.ts` (serveur)
- Détection proprio : via `useRole()` (flag `is_proprietaire` ou présence d'annonces)

## Hiérarchie z-index (à respecter partout)

| Couche | z-index |
|---|---|
| Toasts / notifications | 9999 |
| Modales (signalement, confirmations) | 9000 |
| Menu burger mobile ouvert | 8000 |
| AdminBar | 1001 |
| Header / Navbar sticky | 1000 |
| Overlays carte Leaflet | 500 |
| Bannière cookies | 400 |
| Contenu standard | 1 |

Toute nouvelle couche doit être ajoutée ici avec justification.

## Tables Supabase clés
| Table | PK | Usage |
|-------|-----|-------|
| profils | email | Profil locataire + is_proprietaire |
| annonces | id | Biens immobiliers |
| messages | id | Chat (from_email, to_email, lu, annonce_id) |
| visites | id | Demandes de visite |
| carnet_entretien | id | Maintenance |
| loyers | id | Quittances |
| users | id | NextAuth (password_hash, role, is_admin) |
| clics_annonces | | Tracking clics par bien |
| etats_des_lieux | | EDL stockés (statut, pieces_data) |

## Fichiers critiques
- `lib/matching.ts` — algo de score, cœur du produit
- `lib/cityCoords.ts` — référentiel GPS villes FR
- `lib/auth.ts` — config NextAuth
- `lib/agents/` — agents IA Claude Opus + Sonnet
- `app/layout.tsx` — shell global
- `app/components/Navbar.tsx` — navigation globale
- `app/components/MapAnnonces.tsx` — carte Leaflet (principale)
- `app/components/MapBien.tsx` — carte single bien (fiche annonce)
- `app/components/PasswordInput.tsx` — input mot de passe avec toggle œil
- `app/proprietaire/PipelineFunnel.tsx` — funnel candidats dashboard

---

## Historique des batchs

### Batch 23 — Dark mode + scroll sticky-bottom + fix boutons visite (2026-04-18)
- **Fix boutons visite dans /messages** : avant, quand on recevait une
  demande de visite, les boutons **Refuser** ET **Annuler** s'affichaient
  côte à côte, ce qui n'a pas de sens (Annuler = retrait de ma propre
  demande). Logique clarifiée en 3 cas exclusifs :
  1. Demande reçue en attente (l'autre a proposé) → Confirmer /
     Contre-proposer / **Refuser** (pas d'Annuler)
  2. Ma propre proposition en attente → **Annuler** uniquement
  3. Visite confirmée des 2 côtés → **Annuler** (avec motif obligatoire)
- **Dark mode (#69)** : implémentation complète via variables CSS.
  - `lib/theme.ts` : helpers `getStoredTheme`, `setStoredTheme`, `applyTheme`,
    `resolveTheme`. Persistance localStorage clé `nestmatch-theme`.
    Valeurs : `light` | `dark` | `system` (suit l'OS).
  - `globals.css` : variables `--bg`, `--card`, `--card-alt`, `--text`,
    `--text-muted`, `--text-dim`, `--border`, `--border-strong`, `--hover`
    définies pour light (racine) et dark (`[data-theme="dark"]`).
  - **Overrides CSS legacy** : comme les styles inline utilisent des
    couleurs hardcodées partout (`#F7F4EF`, `white`, `#111`, etc.), on
    redéfinit ces couleurs au niveau global avec des sélecteurs
    d'attribut `[style*="background: white"]` etc. Évite une migration
    massive des centaines d'endroits.
  - Inputs/textarea/select : bg et bordure dark auto.
  - `ThemeToggle.tsx` : boutons Clair / Sombre / Système dans
    AccountSettings. Applique le thème en direct sans reload.
  - **Anti-flash** : script inline dans `app/layout.tsx` qui lit
    localStorage et pose `data-theme` sur `<html>` AVANT le premier
    paint. Pas de flash blanc → sombre au chargement.
- **Scroll messages : refonte sticky-bottom** (WhatsApp style) :
  - Flag `stickBottomRef` : true si user est à < 80px du fond
  - `MutationObserver` + `ResizeObserver` sur le conteneur : à chaque
    changement de taille/contenu (image qui charge, nouveau msg),
    re-stick automatique si flag true
  - Listener scroll user : si l'user scroll vers le haut, `stickBottom`
    passe à false → on respecte sa lecture, plus de saut forcé
  - Au changement de conv : reset stickBottom=true + scroll immédiat
  - Retries 50/200/600/1200ms pour couvrir les images lentes
  - Solution beaucoup plus robuste que les précédentes tentatives
    (scrollIntoView, scrollTo+RAF) qui ratait au reload

### Batch 22 — Fix scroll messages au reload (2026-04-18)
- **Fix scroll /messages au reload** : la page retombait sur le premier
  message du fil à chaque rechargement. Trois causes combinées :
  1. Le navigateur restaure automatiquement le scroll (top = premier msg)
  2. Les images/avatars chargent après coup et poussent le scrollHeight
  3. Un seul RAF ne suffit pas à attraper tous les layout shifts mobile
- **Solutions empilées** :
  - `window.history.scrollRestoration = "manual"` sur la page messages
  - Retries de `scrollTo(bottom)` à 0ms + RAF + 120ms + 350ms + 800ms
  - Listener `img.load` sur chaque image dans le conteneur messages :
    re-scroll en bas dès qu'une image finit de charger
  - Le scroll vise le conteneur messages directement (jamais le document)

### Batch 21 — Carte CartoDB Positron style SeLoger (2026-04-18)
- **Tuiles par défaut = CartoDB Positron** (`light_all`) — style
  minimaliste gris clair, même esprit que SeLoger / Leboncoin / PAP.
  Beaucoup plus soft qu'OSM France, centré sur la mise en valeur des
  marqueurs prix plutôt que de la cartographie. Labels OSM : en France,
  noms de villes/rues en français (l'attribution reste en anglais,
  contrainte de licence Carto — impossible à contourner pour les
  tuiles gratuites). Mode « Détaillé » reste OSM France pour les cas
  où l'utilisateur veut zoomer sur les rues/POI.

### Batch 20 — Carte FR garantie + contre-proposition visite (2026-04-18)
- **Carte 100% française + soft** : retour à OSM France (osmfr) pour garantir
  que tous les labels sont en français, avec un filtre CSS
  `saturate(0.72) brightness(1.04) contrast(0.94)` appliqué via la classe
  `leaflet-tile-soft` pour adoucir le rendu. Appliqué sur MapAnnonces (plan)
  et MapBien. Compromise trouvé : labels FR garantis + visuel style SeLoger.
- **Contre-proposition de visite** : nouveau bouton « Contre-proposer » dans
  la liste visites inline de `/messages`, visible pour la partie qui DOIT
  répondre (celle qui n'a pas proposé la visite). Au clic, ouvre le form
  visite pré-rempli avec la date/heure de la proposition initiale.
  À la soumission : annule la visite initiale, en crée une nouvelle avec
  `propose_par = moi`, poste un message auto « Contre-proposition : …».
  Le cycle propose ↔ contre-propose peut se répéter jusqu'à confirmation.

### Batch 19 — Carte soft style SeLoger (2026-04-18)
- **Style carte doux/épuré** par défaut : retour à CartoDB Voyager
  (plus soft, minimal, esprit SeLoger/Leboncoin) pour MapBien et le mode
  Plan de MapAnnonces. Les labels OSM restent en français sur le
  territoire FR. OSM France (osmfr) conservé en mode « Détaillé » pour
  zoomer sur les rues/POI quand besoin.
- **Zoom initial abaissé** : vue France 6, vue nationale avec annonces
  9 (au lieu de 10), vue ville précise 11 (au lieu de 12). Ouverture
  plus douce, marqueurs plus lisibles, pas de street-level imposé.
- **CenterOnHint** : zoom 11 quand on change de ville (au lieu de 12)
  pour rester sur une vue agglomération.

### Batch 18 — Carte FR + ville sur /annonces + Paris-default (2026-04-18)
- **Tuiles carte 100% françaises** : bascule complète vers OSM France
  (`tile.openstreetmap.fr/osmfr`) pour MapBien et MapAnnonces (mode Plan
  et Détaillé). Fini les labels anglais résiduels du fournisseur Carto.
  Attribution aussi en français.
- **Plus de Paris par défaut sur la carte** : quand aucune ville n'est
  sélectionnée (URL ni profil), la carte `/annonces` s'ouvre sur le
  centre de la France (`[46.603, 1.888]`) avec zoom 6 (vue nationale).
  Zoom 12 si ville précise, 10 si annonces avec coords.
- **Champ ville dans la sidebar `/annonces`** : nouveau CityAutocomplete
  tout en haut des filtres, permet de changer la ville sans retourner à
  l'accueil. Met à jour l'URL `?ville=X` et reset la zone carte.
- **Fini la suggestion Paris au focus vide** : CityAutocomplete ne propose
  plus de villes par défaut quand le champ est vide. Les suggestions
  apparaissent uniquement après avoir tapé au moins 2 caractères (nom ou
  code postal).

### Batch 17 — Hotfix publish + notifs + scroll + ville+CP (2026-04-18)
- **Fix publish annonce** : `/proprietaire/ajouter` et `/modifier` tentent
  d'insérer lat/lng, puis retentent automatiquement sans lat/lng si la
  colonne n'existe pas en DB (migration pas encore lancée). Détection via
  regex sur le message d'erreur Supabase. Débloque la publication même
  sans migration batch 16 appliquée.
- **Fix badge visites** : désormais = visites `proposée` dont
  `propose_par !== myEmail` (= demandes reçues qui attendent ma réponse).
  Plus de badge quand MOI j'ai proposé et j'attends la réponse de l'autre.
  Plus de badge non plus sur les visites confirmées (plus d'action attendue).
- **Fix scroll messagerie mobile** : remplacement de `scrollIntoView` par
  un `scrollTop = scrollHeight` ciblé sur le conteneur messages (pas le
  document entier). Double `requestAnimationFrame` pour attendre le layout
  complet sur mobile. Plus de décrochage ni de scroll document parasite.
- **CityAutocomplete refondu** : recherche par **nom OU code postal**
  (détection automatique selon input numérique), affichage du code postal
  dans chaque suggestion, gestion des villes multi-CP (Paris 75001–75020),
  inputMode `numeric` sur mobile si CP, prop `onSelect` optionnelle pour
  capturer le CP côté parent. Toutes les ~35 000 communes FR accessibles
  via l'API gouv.

### Batch 16 — Mobile UX, géoloc exacte, admin threads (2026-04-18)
- **Messagerie mobile fullscreen** : quand une conversation est active sur mobile,
  suppression du padding conteneur + du h1, le chat occupe `100vw × (100vh - 64px)`.
  Bordures et ombres retirées sur mobile pour un vrai feel plein écran, fond gris
  doux `#fafafa` pour la zone messages (style messagerie native), input en 16px
  (anti-zoom iOS), zone saisie compacte
- **Dossier locataire mobile** : grid cartes 2 colonnes au lieu de 3 (identité +
  pièces), boutons header qui wrapent, tailles de police adaptées, padding PDF
  preview réduit de 32 à 18px, inputs en 16px
- **Géolocalisation exacte du bien** : colonnes `lat` et `lng` (double precision)
  ajoutées à `annonces`. L'autocomplete BAN capture déjà les coords ; elles sont
  désormais sauvegardées à la publication/modification de l'annonce et utilisées
  en priorité par MapBien. Fallback sur les coords ville si absentes (annonces
  historiques)
- **Admin — vue conversation complète** : bouton « Voir thread » sur chaque
  message dans l'onglet Messages ouvre une modale affichant tout l'échange
  entre les deux utilisateurs (avec filtre par annonce si présente). Messages
  gauche/droite colorés selon expéditeur, horodatage + statut lu, lien vers
  l'annonce, lecture seule admin

  **Requiert migration DB :**
  ```sql
  ALTER TABLE annonces
    ADD COLUMN IF NOT EXISTS lat double precision NULL,
    ADD COLUMN IF NOT EXISTS lng double precision NULL;
  CREATE INDEX IF NOT EXISTS idx_annonces_coords ON annonces(lat, lng) WHERE lat IS NOT NULL;
  ```

### Batch 15 — Page contact + admin assignation (2026-04-18)
- **Nouvelle page publique `/contact`** : formulaire nom/email/sujet/message,
  rate-limit 5/h par email, 8 sujets prédéfinis (`lib/contacts.ts`), design
  cohérent avec le reste de l'app, message de confirmation + RGPD mention
- **Nouvelle API** `/api/contact` (POST public, GET admin) et `/api/contact/[id]`
  (PATCH admin : statut, réponse interne, prise en charge)
- **Onglet Admin "Contact"** : filtres Ouverts/En cours/Résolus/Tous, bouton
  "Prendre en charge" (assigne à l'admin courant + passe en_cours), boutons
  rapides pour changer le statut, champ note interne, lien mailto pour répondre
  directement par email avec le bon sujet
- **Footer** : ajout lien "Nous contacter" dans la colonne Informations
- **2 nouveaux sous-agents Claude Code** : `architect` (plan features avant
  implémentation, refuse les violations d'invariants) et `verifier`
  (vérifie que chaque claim correspond à la réalité code, détecte silent
  failures, lance le build)
- **Fix batch précédent** : badge visites dans la Navbar désormais basé
  uniquement sur les visites confirmées à venir (plus de pastille rouge sur
  les demandes en attente — visibles dans la page dédiée sans notification)
- **Menu burger mobile** : slide-in fluide (transform + transition 320ms),
  plein écran `100vw`, backdrop animé, retrait des derniers emojis résiduels
  (`💬` Messages, icônes `item.icon` de l'ancienne implémentation)

  **Requiert migration DB :**
  ```sql
  CREATE TABLE IF NOT EXISTS contacts (
    id bigserial PRIMARY KEY,
    nom text NOT NULL,
    email text NOT NULL,
    sujet text NOT NULL,
    message text NOT NULL,
    statut text NOT NULL DEFAULT 'ouvert',
    assigne_a text NULL,
    reponse text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_contacts_statut ON contacts(statut);
  CREATE INDEX IF NOT EXISTS idx_contacts_assigne_a ON contacts(assigne_a);
  ```

### Batch 14 — Setup agents Claude Code (2026-04-17)
- Création de `.claude/agents/` avec 12 sous-agents spécialisés
- SKILLS.md enrichi : matrice workflows par type de tâche, checklist pré-commit
- MEMORY.md : section "Hiérarchie z-index" documentée

### Batch 1 — Sécurité + Perf (2026-04-16)
- Retrait secrets versionnés, `.env.example`, `.gitignore` renforcé
- `ROTATION_SECRETS.md`, headers sécurité `next.config.js`
- XSS JSON-LD corrigée, `/api/agent` protégé (auth + rate limit)
- DM Sans via `next/font`, jsPDF lazy-load (~330 KB gzip économisés)

### Batch 2 — UX + bugs (2026-04-16)
- matching : normalisation défensive des booléens (fix scoring meublé)
- profil : dédupliqué garant, retiré filtres étage/trajet, mention RGPD
- navbar : Inscription → `/auth?mode=inscription`, fix resize "Mon espace"
- cookie banner : z-index 400
- carte : marqueurs couleur score, locale FR, bouton "Rechercher ici", bbox initial
- annonce détail : carte GPS sous équipements (cercle 400m)
- recherche : home → /annonces URL params
- EDL : ZIP photos (jszip)
- profil : `AccountSettings` (mdp + suppression compte)
- APIs : `/api/account/change-password` + `/api/account/delete`
- home : refonte sections (3 étapes, bénéfices, FAQ, CTA)
- messagerie : tri non-lus en premier
- Build : Suspense wrapping sur `/auth` et `/annonces`

### Batch 13 — Système de signalements (2026-04-17)
- **#100 Signalements complets** :
  - Nouveau `lib/signalements.ts` : types + 8 raisons prédéfinies
    (frauduleux, hors_plateforme, inapproprié, doublon, prix_abusif,
    description_fausse, spam, autre)
  - API `/api/signalements` : POST (user auth requise, rate-limit 10/jour,
    anti-doublon 7 jours) + GET (admin only, filtrable par statut)
  - API `/api/signalements/[id]` : PATCH pour traiter/rejeter/rouvrir
    (admin only), enregistre traite_par + traite_at
  - Composant `SignalerButton` avec modale : sélection motif radio +
    description optionnelle, tolère 1000 chars
  - Intégré dans `/annonces/[id]` sous la carte propriétaire
    (label discret "Signaler cette annonce")
  - Nouvel onglet admin "Signalements" en 2e position avec filtres
    (Ouverts / Traités / Rejetés / Tous), actions Marquer traité /
    Rejeter / Rouvrir, infos signaleur + lien vers cible

  **Requiert migration DB :**
  ```sql
  CREATE TABLE IF NOT EXISTS signalements (
    id bigserial PRIMARY KEY,
    type text NOT NULL,
    target_id text NOT NULL,
    raison text NOT NULL,
    description text NULL,
    signale_par text NOT NULL,
    statut text NOT NULL DEFAULT 'ouvert',
    traite_par text NULL,
    traite_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_signalements_statut ON signalements(statut);
  CREATE INDEX IF NOT EXISTS idx_signalements_signale_par ON signalements(signale_par);
  ```

### Batch 12-bis — Pouvoirs admin (2026-04-17)
- **#97 AdminBar globale** : `components/AdminBar.tsx` visible sur toutes
  les pages si `isAdmin`. Bandeau noir sticky top avec badge ADMIN +
  switcher Locataire/Propriétaire + lien dashboard. Ajouté dans layout.tsx
- **#98 Édition annonce par admin** : `/proprietaire/modifier/[id]` bypass
  la vérification `proprietaire_email` si `session.user.isAdmin === true`.
  L'admin peut donc éditer n'importe quelle annonce.
- **#99 Soft-ban utilisateur** : colonnes DB `is_banned boolean` et
  `ban_reason text` sur `users`. `lib/auth.ts` refuse le login (Credentials
  + Google) si `is_banned=true`. UI admin : boutons Bannir/Débannir avec
  prompt pour motif, badge "Banni" dans la liste users.
  **Requiert migration DB** : ALTER TABLE users ADD COLUMN is_banned
  boolean DEFAULT false, ADD COLUMN ban_reason text NULL.

### Batch 12 — Refonte admin (2026-04-17)
- **#52 Refonte espace admin** :
  - Protection serveur : nouveau `app/admin/layout.tsx` avec `getServerSession`
    + redirect si non admin. Remplace la vérif client facilement contournable.
  - 6 onglets : Vue d'ensemble / Annonces / Utilisateurs / Messages / SEO /
    Activité
  - KPI globaux : users, annonces, annonces actives, biens loués, messages
  - Vue d'ensemble : 3 mini-graphs 30 jours (inscriptions, annonces,
    messages) + annonces par statut + top villes (profils)
  - Annonces : recherche live, export CSV, suppression avec confirmation,
    lien vers fiche publique
  - Utilisateurs : chargement depuis table `users`, recherche,
    promotion/retrait admin (bouton toggle `is_admin`), suppression cascade
    profils + users, protection : impossible de se supprimer/retrograder
    soi-même
  - Messages : recherche + export CSV
  - SEO : conservé tel quel (score + audit par annonce)
  - Activité : flux chronologique des 60 derniers événements (inscriptions,
    annonces, messages) avec emails masqués via displayName()

### Batch 11 — Features moyennes (2026-04-17)
- **#74 Estimateur de budget locataire** : page `/estimateur` avec règle 3×
  revenus (loyer idéal + max raisonnable + bonus garant), CTA direct vers
  /annonces avec budget_max pré-rempli
- **#71 Recherche full-text** : input "Rechercher" dans la sidebar filtres
  de `/annonces`, filtre sur titre + description + ville + adresse
- **#72 Historique candidatures locataire** : page `/mes-candidatures`
  liste les annonces contactées avec statut déduit (contact / dossier
  envoyé / visite programmée / bail signé / refusée)
- **#76 Export visites .ics** : route `/api/visites/ics` (GET, auth
  requise) génère un fichier iCalendar avec les visites à venir,
  compatible Google/Apple/Outlook. Bouton "Exporter (.ics)" dans `/visites`
- **#73 Recommandations de quartiers** : page `/recommandations` classe
  les villes par score moyen de compatibilité avec le dossier locataire
  (top 8, annonces compatibles, loyer médian, CTA ville)
- **#75 Pages SEO par ville** : `/location/[ville]` server component avec
  metadata optimisée (title, description, canonical, OG), grille annonces,
  contenu éditorial, maillage interne vers autres villes. Ajoutées au
  sitemap.ts. Contribue à la longue traîne "location appartement paris"
- Adresse/ville liées : l'AddressAutocomplete rend la ville autoritaire
  quand une adresse est choisie (écrase la saisie manuelle)
- #70 Système d'avis reporté : nécessite nouvelle table `avis` + flow de
  détection bail terminé (batch dédié)

### Batch 10 — Adresse autocomplete BAN (2026-04-17)
- **#94 AddressAutocomplete via BAN** (api-adresse.data.gouv.fr, gratuit
  sans clé) : nouveau composant `components/AddressAutocomplete.tsx` avec
  debounce 300ms, navigation clavier (flèches + Entrée), fallback si API
  down. Au onSelect, renseigne automatiquement la ville du form si vide.
  Intégré dans /proprietaire/ajouter + /modifier (remplace l'input texte
  libre "Adresse / Quartier")
- Noté pour plus tard : #95 intégration DossierFacile (État),
  #96 autocomplete quartier spécifique (Bastille, Marais…)

### Batch 9 — Quick wins roadmap (2026-04-17)
- **#64 Onboarding 3 étapes** : page `/onboarding` avec wizard (ville+budget →
  taille → critères), auth/page redirige les nouveaux locataires dessus
  après inscription. Proprios vont direct au dashboard
- **#65 Loyer de marché suggéré** : nouveau `lib/marketRent.ts` (médiane DB
  par ville + surface ±25% + pièces), composant `MarketRentHint` affiche
  l'estimation et l'écart vs prix saisi (vert si conforme, orange/rouge sinon)
  dans `/proprietaire/ajouter`
- **#66 Partage dossier par lien sécurisé** : token HMAC stateless (pas de
  migration DB), `lib/dossierToken.ts` avec generate/verify. Route
  `/api/dossier/share` (POST, auth requise) génère URL 7 jours. Page
  `/dossier-partage/[token]` en lecture seule (metadata robots: noindex).
  `SharePanel.tsx` intégré dans `/dossier` avec copy-to-clipboard
- **#67 Complétude dossier badge sur /annonces** : nouveau helper partagé
  `lib/profilCompleteness.ts`, badge orange "Dossier X% — compléter" affiché
  dans le bandeau si < 100% (locataires uniquement)
- **#68 Alerte expiration annonce proprio** : bannière orange dans "Mes biens"
  si annonce disponible depuis > 45 jours sans update, CTA "Rafraîchir"
  (lien vers modifier)

### Batch 8 — Annulation visites avec motif (2026-04-17)
- **#63 Annulation de visite (confirmée ou proposée)** :
  - Nouveau composant `AnnulerVisiteDialog` : modale avec textarea motif
    (requis en mode annulation, optionnel en mode refus), ESC pour fermer,
    backdrop cliquable, confirmation rouge
  - Nouveau helper `lib/visitesHelpers.ts::annulerVisite()` : UPDATE statut
    à "annulée" + INSERT message auto dans la conv avec format
    "Visite annulée/Demande refusée — date/heure — Motif : [texte]"
  - Intégré dans :
    - `/proprietaire` (VisitesProprio) : bouton Annuler sur visites
      confirmées ET sur propositions en attente du locataire
    - `/visites` (locataire) : bouton Annuler étendu aux visites confirmées
      (plus seulement proposées)
    - `/messages` (section visitesConv inline) : mêmes boutons, même flow,
      puis loadMessages() pour rafraîchir l'affichage du message auto
  - Destinataire du message auto = l'autre partie (proprio ↔ locataire)

### Batch 7 — Messagerie moderne (2026-04-17)
- **#62 Messagerie complète** :
  - Reply-to : bouton "Répondre" dans le menu actions, preview du message
    cité au-dessus de l'input, quote au-dessus de chaque réponse dans le
    fil, clic sur la quote scrolle vers le message original + highlight
  - Menu d'actions sur chaque message (bouton ⋯ au hover) : Répondre /
    Copier le texte / Supprimer (propriétaire du message uniquement)
  - Indicateurs ✓/✓✓ (envoyé/lu) déjà présents — conservés
  - Encodage reply-to sans migration DB : préfixe `[REPLY:<id>]\n` dans
    contenu, helpers `parseReply()` + `encodeReply()`, preview liste conv
    filtre le préfixe pour afficher juste le texte

### Batch 6 — Privacy + routes + bugs (2026-04-17)
- **#47 Privacy emails proprios** : nouveau `lib/privacy.ts` avec `displayName()`,
  remplace les emails bruts par des noms lisibles dans /messages
- **#51 Toggle loc exacte** : option dans ajouter/modifier, passée à MapBien
  via prop `exact`. **Requiert colonne DB `localisation_exacte boolean` sur annonces.**
- **#59 Routes manquantes** : 7 redirects créés (/connexion, /login, /parametres,
  /edl, /publier, /proprietaire/mes-biens, /carnet-entretien)
- **#60 Page 404 custom** : `app/not-found.tsx` fond charte + 404 gros + liens utiles
- **#61 Footer + pages légales** : liens # morts retirés, footer 4 colonnes propres.
  Stubs créés : `/cgu`, `/mentions-legales`, `/confidentialite` (à personnaliser
  par le responsable légal, marqués "[à compléter]")
- **#50 Cookie sur carte** : l'icône flottante masquée sur /annonces via `usePathname`
- **#49 Carte anglaise** : `attributionControl.setPrefix(false)` (retire "Leaflet"),
  aria-labels + titles FR sur zoom in/out, localisation des popup close buttons
- **#46 Flow visites** : ajout du champ `propose_par` à l'insertion (depuis
  BookingVisite locataire et messages/proposerVisite). Dans VisitesProprio et
  AgendaVisites : boutons Confirmer/Refuser masqués si `v.propose_par === myEmail`,
  remplacés par "En attente du locataire". **Requiert colonne DB `propose_par text`
  sur visites.**

### Batch 5 — Favoris + tel intl + accents (2026-04-17)
- **#42 Carte favoris** : toggle Liste/Carte sur `/favoris`, MapAnnonces réutilisé
  avec uniquement les biens favoris (scoreMatching=null pour ne pas afficher),
  fallback si aucune coord, bouton cœur remplacé par SVG pour éviter les emojis
- **#43 Téléphone international** : nouveau composant `PhoneInput.tsx` avec
  sélecteur d'indicatif (25 pays courants : FR, BE, CH, LU, UK, DE, ES, IT, PT,
  NL, US, MA, DZ, TN, SN, CI, CM, AE, IL, HK, JP, CN, IN, AU, BR). Parse auto
  la valeur stockée format "+XX numéro". Intégré dans `/dossier`
- **#44 Accents (phase 2)** : fichiers traités — CookieBanner, /cookies (RGPD),
  /edl/consulter, /proprietaire/edl, /proprietaire/bail, /proprietaire/page,
  /messages (État des lieux), /dossier. Strings visibles ré-accentuées
  (État des lieux, envoyé, sauvegardé, vérifier, contesté, révision,
  propriétaire, renseigné, expérience, améliorer, préférences, sécurité,
  nécessaires, utilisé, collectées, légitimes, etc.)

### Batch 4 — UX formulaires (2026-04-17)
- **CityAutocomplete** : nouveau composant combobox avec filtre clavier,
  sélection stricte depuis `lib/cityCoords.ts` (52 villes FR).
  Navigation flèches haut/bas + Entrée, reset si texte invalide.
  Exporte `CITY_NAMES` (array trié) et `normalizeCityName`.
  Intégré dans : /profil, /proprietaire/ajouter, /proprietaire/modifier, / (home)
- **Type de quartier** : input texte → select avec options prédéfinies
  (centre-ville, intra muros, résidentiel, péri-urbain, campagne, bord de mer,
  calme, animé) dans /profil
- **Tooltip** : nouveau composant point d'interrogation (?) avec bulle
  explicative au hover/focus/click. Position adaptative (haut/bas selon
  espace), flèche pointante, z-index 2000.
  Intégré sur : DPE, type de bail, situation pro, type de garant (dans /profil)
  + titre "Mon dossier locataire" (dans /dossier)

### Batch 3 — Dashboard + bugs (2026-04-16)
- **3-A Bugs bloquants** : messages debug /dossier supprimés, error.message générique,
  ContactButton anti-doublon (useRef), carte centrée sur `?ville=`
- **3-A Passwords** : `PasswordInput` toggle œil (/auth + AccountSettings)
- **3-B Dashboard proprio** : 7 onglets repensés
  - "Vue d'ensemble" → **"Tableau de bord"** (KPIs gros + pipeline funnel)
  - "Performance" conservé (vue agrégée financière + marketing + tableau par bien cliquable)
  - Nouveau **"Documents"** (4e onglet) : baux + EDL centralisés par bien
  - Pipeline funnel 6 étapes : annonces → intéressés → candidatures → dossiers → visites → baux
  - Bouton "Statistiques" mis en primary dans "Mes biens"
- **3-C Fixes** :
  - Retour EDL/Bail contextuel (router.back au lieu de link fixe vers stats)
  - Vrai fix "Rechercher dans cette zone" avec ?ville= (CenterOnHint via useMap,
    userDriven flag, retrait key= qui causait remount)
  - Scroll messagerie : saut instant au switch de conv, smooth uniquement pour nouveau msg
  - Accents : AccountSettings entièrement ré-accentué
  - Page `/test/agent` → redirect vers / (debug inutile supprimé de l'UI)

---

## 🔴 Backlog à traiter — Bugs / Privacy

### Sécurité / Privacy (urgent)
- **#47 Masquer emails proprios côté public** : les emails des proprios apparaissent
  dans fiche annonce, threads messagerie, etc. Risque scraping/spam/phishing.
  À remplacer par prénom + "Propriétaire vérifié" ou identifiant anonyme.
- **RLS Supabase** : partiellement désactivée sur `visites` et `carnet_entretien`
- **Uploads photos sans validation MIME serveur** (SVG/HTML déguisé possible)
- **Admin protégé uniquement côté client** (`nestmatch2024`)

### Bugs UX
- **#44 Accents manquants** : 8 fichiers restants (proprietaire/edl, proprietaire/page,
  carnet, BookingVisite, proprietaire/ajouter, proprietaire/modifier, dossier, edl/consulter)
- **#46 Flow visites confirmation inversée** : côté proprio, après refus d'une visite
  locataire + nouvelle proposition, le système demande au proprio de confirmer
  sa propre visite. Confusion de rôles dans le cycle "proposée" → "confirmée".
  À debug dans VisitesProprio / AgendaVisites.
- **#49 Carte toujours partiellement en anglais** : malgré `FrenchLeafletLocale`
  et tuiles OSM.fr, certains éléments restent en anglais. Probable tooltips zoom
  Leaflet ou attribution tiers.
- **#50 Cookie icon empiète sur la carte (bis)** : malgré z-index 400 et position
  bottom-right, l'icône cookie se superpose aux contrôles map (bottom-right).
  À déplacer bottom-left OU masquer sur pages avec carte OU top-right.

---

## 🟡 Backlog à traiter — Features

- **#42 Carte favoris** : sur `/favoris`, ajouter une carte qui n'affiche que
  les biens favoris du user
- **#43 Téléphone international** : permettre le choix de l'indicatif pays
  (actuellement français seulement)
- **#51 Toggle localisation exacte du bien** : côté proprio, option lors de la
  publication pour afficher soit l'adresse exacte (marqueur GPS précis) soit
  une zone approximative (cercle 400m, default). Champ `localisation_exacte`
  à ajouter en base + UI toggle dans ajouter/modifier. MapBien supporte déjà
  la prop `exact`.
- **#45 Refonte filtres ↔ dossier locataire** (gros chantier)
  - Filtres visibles sur `/annonces` = miroir des critères du dossier
  - Toutes les dimensions du scoring filtrables (surface, pièces, équipements,
    DPE, meublé, animaux, type bail, zone)
  - Bi-directionnel : modifier filtre propose MAJ dossier
  - Pré-remplissage auto depuis dossier
  - Feedback visuel : badge "Correspond à votre dossier"
  - Persistance : filtres sauvegardés entre sessions
- **Messagerie moderne complète** : reply-to un message spécifique, sélection
  multiple (supprimer/copier/transférer), indicateurs "envoyé/lu" dans les
  bulles elles-mêmes (pas juste dans la liste des convs)
- **#52 Refonte espace admin** (gros chantier) : la page `/admin` actuelle
  est minimale (juste liste annonces/profils/messages avec delete). Besoin
  d'une vraie refonte après brainstorming :
  - Modération : signalements, vérification manuelle des annonces
  - Analytics globales : nb users, nb annonces, conversion, activité
  - Gestion users : roles, ban/unban, voir profil complet, historique
  - Audit logs : qui a fait quoi et quand
  - Export données
  - Protection serveur (actuellement juste code client `nestmatch2024` — à refaire
    avec vraie vérification `is_admin` côté middleware/API)
  - Dashboard dédié séparé de celui du proprio
- **Change email** : actuellement "bientôt" dans AccountSettings
  (flow vérification + cascade DB)
- **Notifications email** : toggle pas encore branché
- **Logo** : l'utilisateur le fournira, reste à l'intégrer (header, favicon,
  footer, PDFs, page /auth)

---

## 🟢 Backlog à traiter — Structure

### Routes manquantes (404 actuels)
- `/connexion` → redirect `/auth`
- `/login` → redirect `/auth`
- `/parametres` → redirect `/profil#parametres`
- `/edl` → redirect vers page EDL pertinente
- `/publier` → redirect `/proprietaire/ajouter`
- `/proprietaire/mes-biens` → redirect `/proprietaire`
- `/carnet-entretien` → redirect `/carnet`

### Page 404 custom
- Fond `#F7F4EF`, logo NestMatch, texte FR "Cette page n'existe pas"
- Liens : Accueil, Annonces, Connexion

### Footer (Option A choisie)
- Retirer tous les liens `#` non fonctionnels
- Créer stubs pages légales (obligatoires pour FR) :
  - `/mentions-legales` — placeholder structuré
  - `/cgu` — placeholder structuré
  - `/confidentialite` — placeholder structuré

### Filtres /annonces (UI)
- Ajouter filtres surface min/max et nombre de pièces
- Clarifier ou supprimer bouton "Personnalisé" (sans action actuellement)
- Placeholder barre de recherche : "Ville, quartier, code postal"

### UX formulaires — inputs avec choix restreints
- **#53 Ville en sélection (pas saisie libre)** : remplacer tous les inputs texte
  "ville" par un combobox/autocomplete avec la liste de `lib/cityCoords.ts`.
  Évite les fautes qui cassent le matching et le centrage carte. Concerne :
  /profil (ville_souhaitee), /proprietaire/ajouter + /modifier, barre home.
- **#54 Type de quartier en sélection** : remplacer l'input texte libre par un
  select avec options prédéfinies ("centre-ville", "intra muros", "péri-urbain",
  "résidentiel", "campagne", "bord de mer", "calme", "animé"). Dans /profil.
- **#55 Tooltips (?) sur notions complexes** : créer un composant `Tooltip`
  réutilisable (petit point d'interrogation + encadré au hover/focus).
  À appliquer sur : DPE, situation pro, type de garant, ALUR, dossier complet,
  mode strict/souple, "dossier partagé", etc.

### Autres
- `duree_credit` dans vue agrégée Performance (total crédit restant tous biens)
- Page `/` et `/annonces` en `"use client"` → convertir en Server Components (SEO)

---

## 🗺️ Roadmap fonctionnalités — par ordre de facilité

### 🟢 Quick wins (1-3h chacun, no-brainers)
- **#94 Adresse autocomplete via API BAN** : utiliser api-adresse.data.gouv.fr
  (gratuit, pas de clé) pour suggérer les adresses complètes dans les forms
  d'ajout/modification de bien. Récupère rue + code postal + ville + coords GPS.
- **#96 Autocomplete quartier spécifique** : en complément du select
  type_quartier (centre-ville/intra muros...), proposer un champ "quartier"
  (Bastille, Marais...) avec autocomplete BAN filtré par type=locality.
- **#64 Onboarding guidé 3 étapes** après inscription : wizard ville+budget →
  type de bien → critères essentiels → direction `/annonces` avec filtres
  pré-remplis. Juste une page wizard ou modale
- **#65 Loyer de marché suggéré** quand un proprio publie : calcul live de
  la médiane des biens similaires (ville + surface ±20% + pièces) depuis la DB
  et affichage "Dans votre ville, un T2 de 45 m² se loue en moyenne 720 €/mois"
- **#66 Partage de dossier locataire par lien sécurisé** : génération d'un
  token unique à durée limitée (ex 7 jours), URL `/dossier-partage/[token]`
  qui affiche le dossier en lecture seule. Utile pour partager hors plateforme
- **#67 Progress bar complétude dossier plus visible** sur `/annonces` :
  badge "Dossier 60% complet" avec CTA si pas 100%
- **#68 Alerte expiration annonce** : au bout de N jours sans update, bannière
  "Votre annonce est en ligne depuis X jours, envisagez de la rafraîchir"
- **#69 Dark mode** : toggle dans Paramètres compte, stocké en localStorage,
  variables CSS pour la palette

### 🟡 Moyens (demi-journée à journée)
- **#70 Système d'avis après bail terminé** : nouvelle table `avis`
  (locataire → proprio + proprio → locataire), formulaire post-bail,
  affichage "★ 4.8 · 12 avis" sur fiche proprio
- **#71 Recherche full-text dans annonces** : filtre par mot-clé sur
  titre + description + ville (PostgreSQL tsvector ou simple ILIKE)
- **#72 Historique candidatures locataire** : page `/mes-candidatures`
  listant les annonces contactées + statut (contact fait / dossier envoyé /
  visite programmée / bail signé / rejetée)
- **#73 Recommandations de quartiers** : basé sur critères + budget,
  suggestions des villes/quartiers où ça matche bien (liste top 5)
- **#74 Estimateur de budget locataire** : outil "Je gagne X, mon budget
  loyer idéal c'est Y" sur `/profil` ou page dédiée (règle 3× revenus)
- **#75 Pages SEO par ville** : `/location/paris`, `/location/lyon` etc.
  avec titre optimisé, meta description, liste des annonces + contenu
  éditorial court (booster SEO, aide à l'indexation)
- **#76 Calendrier sync** : export .ics des visites confirmées pour
  Google Calendar / Apple / Outlook

### 🟠 Plus complexes (plusieurs jours)
- **#95 Intégration API DossierFacile (service État)** : gros différenciant
  confiance. DossierFacile.fr certifie les dossiers locataires. Permettre
  d'importer un dossier DossierFacile validé pour afficher badge "Dossier
  vérifié par l'État". Nécessite étude de l'API publique + probable
  partenariat officiel.

- **#77 Notifications email transactionnelles** (gros impact rétention) :
  setup Resend/Sendgrid + 5-6 templates email (nouveau message, nouvelle
  candidature, visite proposée/confirmée/annulée, dossier partagé, mot de
  passe changé). Toggle user dans `AccountSettings` déjà placeholder,
  à brancher
- **#78 Alertes email nouvelles annonces matchantes** (LE différenciant) :
  cron job Supabase quotidien ou edge function, reprend l'algo matching
  sur les annonces créées depuis X heures, envoie email résumé aux
  locataires avec score > 70%. Requires Resend/Sendgrid
- **#79 Notifications push web** : Service Worker + VAPID keys + opt-in
  dans Paramètres compte. Pour les événements urgents (msg reçu, visite
  confirmée)
- **#80 Checklist légale obligatoire** : quand un proprio publie, case à
  cocher "Je certifie avoir réalisé les diagnostics : DPE / amiante /
  plomb / électricité / gaz". Génère un PDF récapitulatif signé
- **#81 Fiscalité locataire** : récap annuel des loyers payés pour
  déclaration d'impôts (avis des sommes payées)
- **#82 Fiscalité propriétaire** : récap annuel revenus fonciers pour
  déclaration 2044 (loyers encaissés - charges - intérêts emprunt)
- **#83 Screening auto candidats** (côté proprio) : score de qualité
  visible dès réception de candidature (revenus/loyer, complétude dossier,
  situation pro, garant présent)
- **#84 Analytics avancées proprio** : taux de conversion vs marché
  local, temps moyen pour louer, nb de vues par jour, recommandations
  automatiques ("Vos photos ont moins de vues que la moyenne")
- **#85 Colocation intelligente** : matching entre locataires cherchant
  à cohabiter. Nouveau type de profil "colocation", filtres par âge/sexe/
  fumeur/animaux, création d'un "groupe" de colocataires qui candidate
  ensemble

### 🔴 Très complexes / long terme
- **#86 Signature électronique du bail** : DocuSign-like intégré, PDF
  signé avec audit trail (horodatage, IP, identités). Nécessite legal
  review et probablement un service tiers (Yousign, DocuSign)
- **#87 Vérification identité (KYC)** : upload pièce d'identité + selfie,
  matching visage (service type Onfido / Veriff). Badge "Vérifié" sur
  profil
- **#88 PWA mobile** : manifest + service worker + icône add-to-home.
  Premier pas avant une vraie app. Couvre 80% des besoins mobile
- **#89 Application mobile native** : React Native / Expo. Gros projet,
  gestion deux stores, notifications natives, caméra pour photos
- **#90 Système de parrainage** : lien unique par user, bonus (mois
  premium gratuit ou badge VIP) à chaque parrain + filleul
- **#91 Blog / guides éditoriaux** : "Comment remplir son dossier locataire",
  "Les obligations du bailleur", "Louer sans agence" — SEO + autorité
- **#92 Chatbot IA d'assistance** : les agents Opus/Sonnet existent déjà
  (`lib/agents/`), intégrer un widget chat dans l'app pour questions user
  ("Comment déposer mon dossier ?", "Que faire si mon proprio ne répond pas ?")
- **#93 Programme fidélité** : proprios ayant signé N baux sur la plateforme
  → meilleure mise en avant, badge "Proprio expérimenté"

## Dette technique connue
- 0 test automatisé
- Repo GitHub encore public (historique contient anciens secrets)
- Pas de rate-limit sur `/api/auth/register`
- `lib/cityCoords.ts` : fichier statique, à surveiller si grossit
