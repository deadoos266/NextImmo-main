# NestMatch — Mémoire du projet

## État actuel
- **Phase** : MVP avancé, en production sur Vercel
- **Stack** : Next.js 15 App Router, React 19, TypeScript, Supabase, NextAuth (Google + Credentials), Leaflet, SDK Anthropic
- **URL prod** : https://next-immo-main.vercel.app
- **Repo** : github.com/deadoos266/NextImmo-main (public — à passer en privé)
- **Dernière mise à jour** : 2026-04-16

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

### Autres
- `duree_credit` dans vue agrégée Performance (total crédit restant tous biens)
- Page `/` et `/annonces` en `"use client"` → convertir en Server Components (SEO)

---

## Dette technique connue
- 0 test automatisé
- Repo GitHub encore public (historique contient anciens secrets)
- Pas de rate-limit sur `/api/auth/register`
- `lib/cityCoords.ts` : fichier statique, à surveiller si grossit
