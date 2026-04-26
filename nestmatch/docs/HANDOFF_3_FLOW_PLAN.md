# Plan chirurgical — Flow logique entre sections

User : "je vois pas seulement le visuel, que tout soit relié — la logique
de travail entre candidatures, mon logement, bail, EDL, stats, paiements,
candidatures, mes biens".

Audit complet du flow proprio + locataire. Identifie les liens existants
vs manquants pour que la chaîne soit fluide.

---

## 🟢 Flow PROPRIO — chaîne logique attendue

```
   ┌────────────────────────────────────────────────────────────────┐
   │  1. PUBLIER                  → /proprietaire/ajouter           │
   │     ↓ statut=disponible                                         │
   │  2. MES BIENS                → /proprietaire (onglet "Mes biens")│
   │     ↓ click sur "Candidatures (X)"                              │
   │  3. CANDIDATURES PAR BIEN    → /proprietaire/annonces/[id]/candidatures│
   │     ↓ click sur un candidat → /messages?with=&annonce=         │
   │  4. ÉCHANGER + VALIDER       → /messages                        │
   │     ↓ bouton "Valider la candidature" (POST /api/candidatures/valider)│
   │     ↓ statut_candidature='validee' → débloque demande visite    │
   │  5. VISITE                    → BookingVisite côté locataire    │
   │     ↓ /messages — VISITE_CONFIRMEE card                         │
   │  6. ACCEPTER LOCATION        → /messages bouton "Louer à ce candidat"│
   │     ↓ accepterLocation() → annonce.statut='loué' + locataire_email│
   │     ↓ message [LOCATION_ACCEPTEE] dans la conv                  │
   │     ↓ notifie autres candidats orphelins (email + msg in-app)   │
   │  7. GÉNÉRER BAIL              → /proprietaire/bail/[id]         │
   │     ↓ POST /api/bail/signer (signature)                          │
   │     ↓ insère [BAIL_SIGNE] + [EDL_A_PLANIFIER] dans conv         │
   │  8. EDL ENTRÉE                → /proprietaire/edl/[id]?type=entree│
   │     ↓ POST /api/edl/signer (signatures bilatérales)             │
   │  9. STATS / PAIEMENTS         → /proprietaire/stats?id=[id]     │
   │     ↓ Confirmer loyer reçu → message [QUITTANCE_CARD]           │
   │     ↓ Demande auto-paiement → [AUTO_PAIEMENT_DEMANDE]           │
   │ 10. FIN DE BAIL               → /proprietaire/edl/[id]?type=sortie│
   │     ↓ statut="loue_termine" → onglet "Anciens biens"             │
   └────────────────────────────────────────────────────────────────┘
```

## 🔵 Flow LOCATAIRE — chaîne logique attendue

```
   ┌────────────────────────────────────────────────────────────────┐
   │  1. RECHERCHER                → /annonces (grille + carte)     │
   │     ↓ favoris à /favoris                                         │
   │  2. POSTULER                  → /annonces/[id] ContactButton    │
   │     ↓ message type='candidature' inséré → /messages?with=       │
   │  3. SUIVRE CANDIDATURES       → /mes-candidatures               │
   │     ↓ statut auto-déduit (contact / dossier / visite / bail / rejete)│
   │  4. ENVOYER DOSSIER           → /messages bouton "Envoyer mon dossier"│
   │     ↓ message [DOSSIER_CARD] → statut → "dossier"               │
   │  5. ATTENTE VALIDATION        → notif "Validée" reçue           │
   │     ↓ débloque "Proposer une visite"                            │
   │  6. PROPOSER VISITE            → /messages BookingVisite        │
   │     ↓ table visites + message [VISITE_DEMANDE]                  │
   │  7. SUIVRE VISITES            → /visites                        │
   │     ↓ confirmer / annuler / itinéraire                          │
   │  8. CANDIDATURE ACCEPTÉE      → notif + message [LOCATION_ACCEPTEE]│
   │     ↓ accès débloqué à /mon-logement                            │
   │  9. SIGNER BAIL                → /messages BailSignatureModal   │
   │ 10. EDL ENTRÉE                 → /messages EdlCard              │
   │ 11. MON LOGEMENT              → /mon-logement (logement actif)  │
   │     ↓ accès quittances /mes-quittances + carnet entretien /carnet│
   │ 12. PAYER LOYER                → reçoit [QUITTANCE_CARD] mensuel│
   └────────────────────────────────────────────────────────────────┘
```

---

## ✅ LIENS EXISTANTS (déjà câblés)

### Côté proprio
| De | Vers | Mécanisme |
|----|------|-----------|
| `/proprietaire/ajouter` | `/proprietaire` | router.push après création |
| `/proprietaire` cards Mes biens | `/proprietaire/annonces/[id]/candidatures` | bouton "Candidatures (X)" |
| `/proprietaire` cards Mes biens | `/proprietaire/stats?id=[id]` | bouton "Statistiques" |
| `/proprietaire` cards Mes biens | `/proprietaire/modifier/[id]` | bouton "Modifier" |
| `/proprietaire` cards Mes biens | `/annonces/[id]` | "Voir l'annonce" |
| `/proprietaire/annonces/[id]/candidatures` | `/messages?with=&annonce=` | click sur candidat |
| `/messages` (bouton Valider) | API `/api/candidatures/valider` | reload conv |
| `/messages` (bouton Louer) | annonce.statut='loué' + LOCATION_ACCEPTEE | reload conv |
| `/messages` LOCATION_ACCEPTEE card | `/proprietaire/bail/[id]` | bouton "Générer le bail" |
| `/proprietaire/bail/[id]` signature | API `/api/bail/signer` | insère BAIL_SIGNE + EDL_A_PLANIFIER |
| `/messages` EDL_A_PLANIFIER card | `/proprietaire/edl/[id]?type=entree` | bouton |
| `/proprietaire/edl/[id]` signatures | API `/api/edl/signer` | bilatéral |
| `/proprietaire/stats` confirmer loyer | message [QUITTANCE_CARD] dans conv | déjà fait |
| `/proprietaire` Anciens biens | `/proprietaire/bail/[id]` + `/proprietaire/edl/[id]` | conservés en archive |

### Côté locataire
| De | Vers | Mécanisme |
|----|------|-----------|
| `/annonces/[id]` | `/messages?with=` | ContactButton crée msg type='candidature' |
| `/mes-candidatures` ligne | `/messages?with=` | bouton "Messages" |
| `/mes-candidatures` ligne (statut bail) | `/mon-logement` | bouton "Mon logement" |
| `/messages` (bouton Envoyer dossier) | message [DOSSIER_CARD] | génère shareUrl HMAC 7j |
| `/messages` (bouton Proposer visite, si validée) | BookingVisite dialog | crée visite + msg [VISITE_DEMANDE] |
| `/visites` | `/annonces/[id]` | bouton "Voir l'annonce" |
| `/visites` | `/messages?with=` | bouton "Contacter" |
| `/messages` LOCATION_ACCEPTEE card (locataire) | `/mon-logement` | bouton |
| `/mon-logement` | `/messages?with=` | "Contacter mon propriétaire" |
| `/mon-logement` | `/annonces/[id]` | "Voir la fiche" (commit récent) |
| `/mon-logement` | `/visites` | quick link |
| `/mon-logement` | `/carnet` | quick link entretien |
| `/mon-logement` | `/dossier` | quick link mise à jour |
| `/anciens-logements` | `/mes-quittances` | déjà existant |

---

## 🔴 LIENS MANQUANTS / FRICTIONS du flow

### **HAUTE — visibilité ÉTAT global côté proprio**

**1. Dashboard proprio sans timeline globale**
- Aujourd'hui : `/proprietaire` est une liste plate de biens. On ne voit
  pas où en est chaque bien dans la chaîne (publication / candidatures /
  visite / bail / EDL / loué).
- **Fix** : ajouter une `BailTimeline` mini sur chaque card Mes biens,
  ou un statut visuel détaillé (ex. "5 candidatures · 1 visite confirmée").
  Inspirer du `PipelineFunnel` qui existe déjà mais est dans l'onglet
  Locataires uniquement.
- Complexité : moyenne (ajouter quelques counts par card)

**2. Pas de redirection après acceptation location**
- Quand le proprio clique "Louer à ce candidat" dans /messages, l'annonce
  passe loué mais on reste dans /messages. Le proprio doit ensuite
  manuellement aller sur /proprietaire/bail/[id] depuis le LOCATION_ACCEPTEE
  card.
- **Fix** : afficher un bandeau success "Bien marqué loué — générer le
  bail maintenant ?" avec CTA direct vers /proprietaire/bail/[id].
  Le LOCATION_ACCEPTEE card a déjà ce bouton mais il faut un appel à
  l'action plus fort.
- Complexité : faible (1-2 lignes)

**3. Pas de sidebar "Quoi faire ensuite" côté proprio**
- Pas de view-at-a-glance "X candidatures à valider, Y bails à signer,
  Z loyers à confirmer ce mois".
- **Fix** : header dashboard /proprietaire avec 3-4 stat tiles
  cliquables (par ex. "3 candidatures non lues" → /messages onglet
  Candidat).
- Complexité : moyenne

### **HAUTE — visibilité ÉTAT global côté locataire**

**4. Pas de visibilité sur "où j'en suis" entre candidatures**
- /mes-candidatures liste les candidatures avec statut individuel mais
  pas de vue d'ensemble "X en attente, Y validées, Z à relancer".
- **Fix** : header /mes-candidatures avec stat tiles (En attente / Validées
  / À relancer / Bail signé).
- Complexité : faible

**5. Pas de fil d'Ariane entre /mon-logement → /mes-quittances**
- /mon-logement a un lien "Mes quittances" mais l'inverse manque
  (/mes-quittances → /mon-logement).
- **Fix** : breadcrumb "Mon logement / Quittances" dans /mes-quittances.
  Déjà partiellement fait (lien retour vu dans le grep). À vérifier.
- Complexité : faible

### **MOYENNE — états manquants dans la chaîne**

**6. Pas de notif claire "ton bail est prêt à signer" côté locataire**
- Le bail signé par le proprio génère [BAIL_SIGNE] dans la conv messages.
  Le locataire doit ouvrir la conv pour voir.
- **Fix** : notif cloche `bail_a_signer` quand le proprio signe avant le
  locataire. Le bouton de la cloche → ouvre direct la conv avec la card
  bail à signer.
- Complexité : moyenne (modifier /api/bail/signer pour insert notification)

**7. Pas de transition "EDL entrée signé" → "Mon logement officiel"**
- Quand l'EDL entrée est signé bilatéralement, le locataire voit
  toujours /mes-candidatures (avec statut "Bail signé") mais devrait
  basculer plus clairement vers /mon-logement comme route principale.
- **Fix** : redirection auto dans /mes-candidatures quand bail+EDL
  signés → suggestion bandeau "Votre logement est officiellement à
  vous ! Voir Mon logement →".
- Complexité : faible

**8. Pas de retour /proprietaire après publication d'annonce**
- /proprietaire/ajouter fait `router.push("/proprietaire")` à la fin.
- **OK déjà fait** — confirmer que le toast "Annonce publiée" est visible.

**9. Pas de lien direct /messages → fiche annonce (mode debug proprio)**
- Quand un proprio est sur une conv candidat, il a un Link "Voir l'annonce"
  qui va sur /annonces/[id] (mode public). Mais pour modifier l'annonce
  il doit faire un détour via /proprietaire.
- **Fix** : sur /messages, si proprietaireActive et annonceActive est à lui,
  ajouter un bouton "Modifier l'annonce" → /proprietaire/modifier/[id].
- Complexité : faible

### **BASSE — friction visuelle**

**10. Pas de quick-jump entre conv messages et fiche candidat dossier**
- Sur /messages côté proprio, on voit le dossier card mais pas un lien
  rapide vers /proprietaire/annonces/[id]/candidatures pour comparer.
- **Fix** : pill discret "← Toutes les candidatures" en haut de la conv
  proprio si annonce_id défini.
- Complexité : faible

**11. Pas de "next action" badge dans /proprietaire onglet Locataires**
- Quand un locataire actif a un loyer en retard, on ne voit pas immédiatement
  l'alerte sur la sidebar /proprietaire onglet Locataires.
- **Fix** : badge rouge sur l'onglet "Locataires" si loyer.statut === "retard".
- Complexité : faible

**12. Pas de lien direct /proprietaire/stats?id=X → /proprietaire/bail/X**
- Sur la page stats d'un bien, on voit les loyers + carnet mais pas un
  retour vers le bail/EDL du même bien.
- **Fix** : footer /proprietaire/stats avec liens "Bail · EDL · Modifier".
- Complexité : faible

---

## 📋 Plan chirurgical en 6 commits

Si tu valides, je lance dans cet ordre (1 commit = 1 chantier cohérent) :

**Commit 1 — Header dashboards stat tiles** (HAUTE #3 + #4)
- /proprietaire : 4 tiles cliquables (Candidatures / Bails / Loyers / Visites)
- /mes-candidatures : 4 tiles (En attente / Validées / À relancer / Bail signé)

**Commit 2 — Timeline mini sur cards Mes biens** (HAUTE #1)
- Chaque card /proprietaire onglet "Mes biens" affiche une mini-timeline
  4-5 étapes (Publié / Candidatures / Visite / Bail / Loué)

**Commit 3 — CTA bandeau après acceptation location** (HAUTE #2)
- /messages : bandeau success "Loué ✓ — Générer le bail maintenant" avec
  CTA pulse, plus visible que le bouton actuel dans le LOCATION_ACCEPTEE card

**Commit 4 — Notif cloche "bail à signer"** (MOYENNE #6)
- /api/bail/signer : insert notification quand proprio signe avant locataire
- /api/bail/signer : insert notification quand locataire signe avant proprio
- Cloche click → ouvre la conv messages avec card bail

**Commit 5 — Bandeau /mes-candidatures bail signé** (MOYENNE #7)
- Si une candidature a statut "bail" : bandeau success en haut de la page
  avec CTA "Voir mon logement"

**Commit 6 — Liens manquants** (MOYENNE #9 + BASSE #10 + #12)
- /messages côté proprio sur sa propre annonce : bouton "Modifier l'annonce"
- /messages côté proprio : pill "← Toutes les candidatures" si annonce_id
- /proprietaire/stats?id=X footer : liens "Bail · EDL · Modifier"

---

## 🎯 Ordre suggéré + estimation

| Commit | Pages touchées | Risque | Estimation |
|--------|----------------|--------|------------|
| 1 — Stat tiles dashboards | /proprietaire, /mes-candidatures | Faible | 30 min |
| 2 — Timeline Mes biens | /proprietaire | Faible | 45 min |
| 3 — Bandeau acceptation | /messages | Faible | 15 min |
| 4 — Notif bail à signer | /api/bail/signer + /messages | Moyen | 30 min |
| 5 — Bandeau /mes-candidatures bail | /mes-candidatures | Faible | 15 min |
| 6 — Liens manquants | /messages, /proprietaire/stats | Faible | 30 min |

**Total** : ~3h pour 6 commits qui transforment l'expérience de "pages
isolées" à "flow connecté". Tout ça en gardant la logique métier intacte.

---

## 🚀 Lancement

Si tu valides, je peux faire **les 6 commits d'affilée** en mode autonome :
- Push HEAD:main après chaque commit
- tsc + next build verts garantis
- Aucune table Supabase modifiée
- Aucune fonction métier modifiée (juste ajout de visibilité + liens)

Dis-moi "go" pour que je lance, ou indique l'ordre que tu préfères, ou
ce que tu veux skipper.
