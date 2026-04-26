# Handoff (3) — TODO consolidé

Référence : `design-handoff/keymatch-design-system/project/ui_kits/keymatch/`
(handoff Claude Design v3, contient `app.jsx`, `pages.jsx`, `messages.jsx`,
`candidatures.jsx`, `dossier.jsx`, `dashboard.jsx`, `publish.jsx`, `modals.jsx`).

Ce doc liste écran par écran ce qui est aligné vs ce qui reste à faire pour
un gros patch consolidé. Mis à jour 2026-04-26.

---

## ✅ Écrans alignés (déjà commités)

### `/messages`
- Wrapper unifié 3 cols radius 24 (commit `9bd973d`)
- Sidebar 340px + thread 1fr + details 320px (commit `61f1a7c`)
- Container 1700px maxWidth + padding 24/24
- Onglets segmented control 4 tabs avec dot coloré + count (`ed51eab`)
- Pills statut filtres colorées (déjà fait)
- Avatar ring candidate status (déjà fait)
- BienPicker multi-biens (`01c0a3e`)
- Bulles asymétriques 18/4 (déjà fait)
- Photo bien + match% pill + Voir l'annonce + Documents partagés + Timeline 5 étapes État (déjà fait)
- QuickReply chips composer + "Question loyer" (`571a6dd`)
- Bouton Valider/Dévalider candidature + workflow strict (`81b4659`, `f4afa35`)
- Persistance tab + désélection au switch d'onglet (`e5321fe`, `d6240e5`)
- Header éditorial "Messagerie / Conversations" + Chiffré E2E (déjà fait)

### `/annonces` mode carte
- Page edge-to-edge full viewport (commit `f5d3d7e` — header h2, bandeaux,
  FiltersBar tous masqués en mode liste+carte desktop)
- Aside 600px (`e391aa1` — bumpé depuis 480 → 550 → 600 sur demande user)
- Header aside enrichi : eyebrow Annonces + h1 22/600 X logements + Live
  indicator + tri segmented (`451db88`)
- 3 QuickFilter chips (Compat / Lieu / Loyer) + popovers + bouton "Tous les
  filtres" full width avec count badge (`5775ea6`)
- MapListCard riche layout 180×210 photo + badges NOUVEAU/match% + favori
  + compteur photos + dots + actions Aperçu/Comparer/Voir (`d75ef55`)

### `/mon-logement`
- Hero unifié 380px + mini-stats inline Loyer/Charges/Surface/DPE (`82cd63c`)

### `/proprietaire` (Mes biens onglet)
- Cards grille 2 cols + photo hero 16/10 + pill statut overlay + badge
  candidatures + actions menu ⋯ (`fd8d21f`)

### Autres pages déjà partiellement alignées
- `/favoris`, `/mes-candidatures`, `/visites` — KMPageHeader + KMToggle +
  cards horizontales (commits historiques `004f0ea`)
- Marketing home (`/`) — direction A validée 2026-04-20

---

## 🔧 Écrans restant à aligner — handoff (3)

Trié par priorité d'impact UX.

### **HAUTE — `/annonces` mode carte** (finition)

**ViewToggle Grille/Carte dans header aside**
- Handoff (3) `app.jsx` l. 586 (ViewToggle component) + l. 641 (placement
  à droite de l'h1 dans MapSplit)
- Aujourd'hui le toggle Grille/Carte est dans `FiltersBar` qui est masqué
  en mode liste+carte → on perd l'accès au mode grille depuis la map
- **Fix** : extraire le ViewToggle (icônes + label "Grille" / "Carte"),
  l'inline dans le header de l'aside à droite de l'h1
- Complexité : faible (1 commit)

**PreviewModal au survol marker**
- Handoff (3) `app.jsx` l. 895-1033 — modal de preview qui ouvre au
  click sur un marker carte
- Aujourd'hui : popup Leaflet basique
- **Fix** : créer un PreviewModal React avec photo carousel + infos riche
  + boutons Aperçu/Comparer/Voir l'annonce + favoris
- Complexité : moyenne (1 commit, ~150 lignes)

### **HAUTE — `/annonces` mode grille** (potentiellement déjà aligné)

Vérifier que `ListingCardSearch` (mode grille) match toujours le handoff (3).
Le handoff (3) `app.jsx` ListingCard l. 234-288 a peut-être évolué vs
celui qu'on avait initialement implémenté.
- À auditer : photo aspect 4/5 + barre segmentée + footer specs/prix inline
- Complexité : faible si déjà OK, moyenne sinon

### **HAUTE — `/annonces/[id]` fiche détail**

- Handoff (3) `app.jsx` `DetailScreen` l. 1379-1432 — refonte de la fiche
- Probablement écarts visuels significatifs vs notre fiche actuelle
- **À auditer en profondeur**
- Complexité : moyenne à grosse (300-500 lignes selon delta)

### **MOYENNE — `/proprietaire` (autres onglets)**

L'onglet "Mes biens" est fait. Reste :
- **Visites** — handoff non spécifique mais peut intégrer style cards visites
- **Locataires** — comparer avec dashboard handoff
- **Anciens biens** — déjà OK (peu de spec)
- **Statistiques** — handoff (3) `pages.jsx` `StatsScreen` l. 780-880
  - Graphique loyers 6 mois en barres
  - StatTile grid (Total perçu / À venir / Retards / Vacance)
  - Tableau historique loyers
  - **Fix** : refonte de la page stats actuelle si écart visible
  - Complexité : moyenne

### **MOYENNE — `/proprietaire/bail/[id]`**

- Handoff (3) `pages.jsx` `BailScreen` l. 881-979
- Structure : eyebrow + titre + état (timeline) + parties + sections
  contractuelles + signature
- Complexité : moyenne (page existe, alignement visuel)

### **MOYENNE — `/proprietaire/edl/[id]`**

- Handoff (3) `pages.jsx` `EdlScreen` l. 980-1048
- Structure : photos par pièce, états (bon/usure/dégradé), signature
- Complexité : moyenne (page existe, alignement visuel)

### **MOYENNE — `/dossier`**

- Handoff (3) `dossier.jsx` (499 lignes)
- Page partiellement alignée, à recheck contre handoff (3)
- Sections : Présentation / Identité / Situation pro / Logement actuel /
  Garant + sidebar documents
- Complexité : moyenne (page existe, à auditer)

### **MOYENNE — `/proprietaire/annonces/[id]/candidatures`**

- Handoff (3) `candidatures.jsx` (370 lignes) — écran dédié candidatures
  par bien
- Page existe avec layout maison, à comparer
- Complexité : moyenne

### **MOYENNE — `/proprietaire/ajouter` (publier)**

- Handoff (3) `publish.jsx` (390 lignes)
- Multi-step form publication annonce
- Page existe, alignement visuel à faire
- Complexité : moyenne

### **MOYENNE — `/visites`**

- Handoff (3) `pages.jsx` `VisitesScreen` l. 52-164
- Layout : hero prochaine visite + StatTile grid 4 + filtres pills + cards
  horizontales 120px photo + actions par statut
- Page existe avec KMPageHeader + KMToggle + cards horizontales 140px
- **Différences** : StatTile avec accent bg, layout cards 120px, actions
  spécifiques par statut (ACCEPTER / Décaler / Itinéraire / Annuler / CANDIDATER)
- Complexité : faible à moyenne

### **MOYENNE — `/mes-candidatures`**

- Handoff (3) `pages.jsx` `MesCandidaturesScreen` l. 170-241
- Layout : timeline horizontale + cards
- Page existe avec KMPageHeader + STATUT_HELP + CtaPill conditionnels
- Probablement écarts visuels mineurs
- Complexité : faible

### **NOUVELLE — `/mes-quittances`**

- Handoff (3) `pages.jsx` `MesQuittancesScreen` l. 242-302 — **écran nouveau**
- Liste des quittances avec download + état (payée / en retard)
- N'existe pas en prod aujourd'hui (les quittances sont dans /mon-logement)
- **Décision** : créer la page séparée OU intégrer le design dans /mon-logement
- Complexité : faible (page nouvelle)

### **MOYENNE — `/profil`**

- Handoff (3) `pages.jsx` `ProfilScreen` l. 406-531 — 5 onglets
  (Profil / Critères / Notifications / Sécurité / Compte)
- Aujourd'hui : `/profil` = critères matching uniquement (855 lignes),
  `/parametres` = compte settings
- **Architecture différente** : refonte = consolider /profil + /parametres
  en 1 seule page avec 5 onglets
- Complexité : grosse (refactor 2 pages → 1)

### **BASSE — `/estimateur`**

- Handoff (3) `pages.jsx` `EstimateurScreen` l. 537-622
- Calculateur prix avec inputs ville/surface/pièces → estimation
- Page existe, alignement visuel
- Complexité : faible

### **BASSE — `/swipe`**

- Handoff (3) `pages.jsx` `SwipeScreen` l. 623-711
- Mode swipe Tinder pour annonces
- Page existe, alignement visuel
- Complexité : faible

---

## 🌟 Composants partagés / nouveaux primitives

### `components.jsx` du handoff (3) — 197 lignes (vs 183 anciennes)

Probablement 1-2 primitives nouvelles à intégrer dans `app/components/ui/km.tsx`.
À auditer : faire un diff entre l'ancienne version et la nouvelle.

### `modals.jsx` du handoff (3) — 259 lignes inchangé

VisitRequestModal probablement déjà couvert par `ProposerVisiteDialog`.
Autres modals (signature, partage dossier) à recheck.

### `dashboard.jsx` — 384 lignes inchangé

Le dashboard handoff propose un layout général proprio. À recheck si
notre `/proprietaire` page suit.

---

## 🚫 Hors scope court terme

### `/messages`
- **Online indicator vert** — nécessite Supabase Realtime presence (gros
  chantier infra)
- **SlotProposal card inline** — cohabite avec ProposerVisiteDialog actuelle,
  refactor lourd
- **Pinned/Muted icons sur conversations** — pas de feature en DB

### Foundations / palette / typo
- Tout déjà aligné via `lib/dpeColors.ts` + `app/components/ui/km.tsx`

### Marketing home
- Direction A validée 2026-04-20, pas touché

---

## 📋 Ordre suggéré pour le gros patch

Si tu veux faire le patch consolidé en plusieurs commits cohérents :

1. **Commit 1 — Annonces map polish final** : ViewToggle inline + PreviewModal
2. **Commit 2 — Annonces grille recheck** : ListingCardSearch alignement handoff (3)
3. **Commit 3 — Fiche détail** : `/annonces/[id]` DetailScreen
4. **Commit 4 — Pages locataire courantes** : /visites, /mes-candidatures
   alignées handoff (3) `pages.jsx`
5. **Commit 5 — Mes quittances** : nouvelle page `/mes-quittances`
6. **Commit 6 — Pages proprio** : /proprietaire/stats, /proprietaire/bail/[id],
   /proprietaire/edl/[id]
7. **Commit 7 — Candidatures par bien** : /proprietaire/annonces/[id]/candidatures
8. **Commit 8 — Publier** : /proprietaire/ajouter form refonte
9. **Commit 9 — Dossier** : /dossier alignement handoff (3)
10. **Commit 10 — Profil consolidé** : /profil 5 onglets (refactor avec /parametres)

Optionnel après :
- Commit 11 — `/estimateur`
- Commit 12 — `/swipe`

---

## 🔍 Comment continuer

Pour chaque écran restant, le pattern est :
1. Lire le handoff (3) (`design-handoff/keymatch-design-system/project/ui_kits/keymatch/`)
2. Comparer avec le code actuel (`app/<route>/page.tsx`)
3. Identifier les écarts visuels
4. Refonte chirurgicale en préservant la logique métier
5. tsc + next build verts
6. Commit + push HEAD:main
