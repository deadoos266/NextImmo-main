# PLAN — Refonte dossier locataire (suite + connexion filtres annonces)

## 1. Contexte et objectif
Le dossier locataire actuel est minimaliste (6 champs, 6 catégories docs) vs un vrai dossier de candidature type DossierFacile (identité étendue, pro, famille, logement actuel, présentation, 10+ catégories docs). Objectif : un dossier crédible qui donne vraiment envie à un proprio de signer, + reconnecter les critères de recherche dossier/profil aux filtres `/annonces` (budget_max, ville, meuble, animaux, pièces, surface, DPE, type_bail).

## 2. Audit de l'existant

### Déjà fait cette session (commit pending)
- **Migration 007_profil_dossier_complet.sql créée** avec nouveaux champs (`date_naissance`, `nationalite`, `situation_familiale`, `nb_enfants`, `employeur_nom`, `date_embauche`, `logement_actuel_type`, `logement_actuel_ville`, `presentation`, `a_apl`, `mobilite_pro`) + contraintes CHECK + table `dossier_access_log` avec fonction de purge RGPD 90j.
- **`/dossier/page.tsx`** : constantes `SITUATIONS` étendues (ajout Intérim, Alternance), `TYPES_GARANT` étendus, `SITUATIONS_FAMILIALES`, `LOGEMENT_TYPES`, `NATIONALITES_COURANTES`. Nouveaux `DocKey` ajoutés : `certificat_scolarite`, `attestation_caf`, `attestation_assurance`, `attestation_employeur`. Constantes `DOCS_REQUIS` refaites avec `hint`, `DOCS_OPTIONNELS` ajouté.
- **Form state étendu** : `date_naissance`, `nationalite`, `situation_familiale`, `nb_enfants`, `employeur_nom`, `date_embauche`, `logement_actuel_type`, `logement_actuel_ville`, `a_apl`, `mobilite_pro`, `presentation`.
- **load()** hydrate tous les nouveaux champs.
- **sauvegarder()** persiste tous les nouveaux champs.
- **States `removeTarget` + `dragKey` ajoutés** mais pas encore wirés dans l'UI.

### Ce qui reste à faire
- UI : rendre les nouvelles sections (Identité étendue, Pro étendue, Logement actuel, Présentation).
- UI : drag & drop handlers + confirm suppression visuelle.
- UI : rendre les 4 docs optionnels/conditionnels (hint pourquoi/quand).
- Screening enrichi (nouveaux signaux).
- PDF pro (jsPDF natif, pas html2canvas).
- Logs accès dossier partagé (insert au load + affichage locataire).
- **Connexion critères dossier → filtres `/annonces`** (cf. §11 nouveau).
- Types conditionnels : si `situation_pro === "Étudiant"` ou `"Alternance"` → afficher certificat scolarité comme requis. Si `a_apl === true` → attestation CAF recommandée.

## 3. Fichiers impactés

| Fichier | Changement |
|---|---|
| `supabase/migrations/007_profil_dossier_complet.sql` | ✅ Créé. À run via SQL Editor. |
| `nestmatch/app/dossier/page.tsx` | Déjà partiellement refait. Finir : nouvelles sections UI, drag&drop, docs optionnels, présentation. |
| `nestmatch/app/dossier-partage/[token]/page.tsx` | Afficher nouveaux champs + insert log accès. |
| `nestmatch/app/api/dossier/access-log/route.ts` | **NOUVEAU** — POST endpoint pour enregistrer un accès (appelé par la page `/dossier-partage/[token]`). |
| `nestmatch/lib/screening.ts` | Ajouter signaux : ancienneté emploi, Visale, mobilité pro, APL, situation familiale cohérente avec nb_occupants. |
| `nestmatch/lib/dossierPDF.ts` | **NOUVEAU** — génère un PDF jsPDF natif (pas html2canvas). Header NestMatch + sections. |
| `nestmatch/app/annonces/page.tsx` | Élargir l'auto-hydratation depuis `profils` : ajouter `budget_max`, `animaux`, `meuble`, `dpe_min`, `type_bail`. Le hook `useEffect` qui lit `profil` ne pré-remplit aujourd'hui que surface/pieces/parking/extérieur. |
| `nestmatch/lib/dossierAccessLog.ts` | **NOUVEAU** — helpers `hashToken`, `hashIP` (SHA-256 tronqués). |

## 4. Migrations SQL (à run)

⚠️ La migration `007_profil_dossier_complet.sql` est déjà écrite. Contenu à run tel quel dans Supabase SQL Editor :

```sql
-- Voir le fichier : nestmatch/supabase/migrations/007_profil_dossier_complet.sql
-- Résumé des statements :
-- 1. ALTER TABLE profils ADD COLUMN IF NOT EXISTS {11 colonnes}
-- 2. CONSTRAINT chk_profils_date_naissance_plausible (16 < age < 120)
-- 3. CONSTRAINT chk_profils_nb_enfants (0..15)
-- 4. CONSTRAINT chk_profils_presentation_length (<= 500)
-- 5. INDEX idx_profils_situation_pro, idx_profils_ville_souhaitee
-- 6. CREATE TABLE dossier_access_log (email, token_hash, ip_hash, user_agent, accessed_at)
-- 7. INDEX idx_dossier_access_log_email, idx_dossier_access_log_token
-- 8. FUNCTION purge_dossier_access_log_old() — à appeler via cron
```

**RLS à poser après run** (pas dans la migration car politique NestMatch NextAuth — pas auth.jwt()) :
```sql
-- Aucune RLS sur profils (déjà la convention NestMatch : service_role ou anon sans RLS).
-- dossier_access_log : lecture réservée au propriétaire du dossier (email).
-- À faire via API Next (getServerSession) comme pour /api/edl/[id] plutôt qu'une RLS Supabase.
```

## 5. Étapes numérotées atomiques

### Bloc A — Finir l'UI `/dossier/page.tsx`
1. **Section Identité étendue** : ajouter après "Informations personnelles" les champs `date_naissance` (input date), `nationalite` (select parmi `NATIONALITES_COURANTES` + champ libre), `situation_familiale` (boutons parmi `SITUATIONS_FAMILIALES`), `nb_enfants` (input number 0-15).
2. **Section Pro étendue** : ajouter sous Revenus les champs `employeur_nom` (text, caché si `situation_pro` ∈ {Étudiant, Retraité, Sans emploi}), `date_embauche` (input date, même condition). Tooltip "L'ancienneté rassure le propriétaire".
3. **Section Logement actuel** : nouvelle section entre Pro et Garant. Champs `logement_actuel_type` (boutons parmi `LOGEMENT_TYPES`), `logement_actuel_ville` (text), toggle `a_apl` (Je touche les APL), toggle `mobilite_pro` (Je déménage pour raison pro — éligible Visale).
4. **Section Présentation** : nouvelle section avant Documents. Textarea `presentation` maxLength 500, compteur `{n}/500`.
5. **Drag & drop upload** : dans `DocRow`, wrap le contenu dans un `<div onDragOver={e => { e.preventDefault(); setDragKey(docKey) }} onDragLeave={() => setDragKey(null)} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files?.length) uploadDoc(docKey, e.dataTransfer.files); setDragKey(null) }}>`. Style visuel quand `dragKey === docKey` (bordure pointillée #111).
6. **Confirm suppression** : `removeDoc` ne supprime plus direct. Clic × → `setRemoveTarget({key, idx})`. Affiche un mini-overlay inline "Confirmer / Annuler". Confirmer → supprime vraiment + `setRemoveTarget(null)`.
7. **Docs optionnels conditionnels** : après `DOCS_REQUIS.map`, rendre `DOCS_OPTIONNELS` filtré par condition :
   - `certificat_scolarite` si `form.situation_pro ∈ {"Étudiant", "Alternance"}`
   - `attestation_caf` si `form.a_apl === true`
   - `attestation_employeur` si `form.situation_pro ∈ {"CDI", "CDD", "Fonctionnaire", "Alternance"}`
   - `attestation_assurance` toujours (sous bloc "Optionnel mais recommandé")
8. **Complétude recalculée** : inclure les nouveaux champs obligatoires dans `champs` : `!!form.date_naissance`, `!!form.situation_familiale`, `!!form.logement_actuel_type`, `!!form.nationalite`. Garder le même total / %.

### Bloc B — Connexion dossier ↔ filtres `/annonces`
9. Ouvrir `app/annonces/page.tsx`, trouver le `useEffect` qui lit `profils` (search "if (p.surface_min"). **Ajouter avant le bloc conditionnel `!isProprietaire`** : extraire dans une fonction `hydrateFromProfil(p)`. À l'intérieur, pré-remplir aussi (avec garde "si pas déjà modifié par user") :
   - `urlVille` vide → set state `villeInit` (passer dans l'URL via `router.replace`)
   - `budget_max` → `setBudgetChip(Number(p.budget_max))` si pas déjà défini et `budgetChip === null`
   - `meuble` → `setFiltreMeuble(true)` si `p.meuble === true` et `filtreMeuble === false`
   - `animaux` → nouveau state `filtreAnimaux` et filtre dans `annoncesTraitees` (**HARD LOCK** : si profil animaux=true, on exclut les annonces sans `animaux=true`)
   - `dpe_min` → nouveau state `filtreDpe` et filtre ordre alphabétique (A<B<C…)
   - `type_bail` (court/longue) → nouveau state `filtreTypeBail`
10. **Ajouter chips nouveaux** pour refléter ces filtres : "Animaux OK" (lock visuel si profil), "DPE ≤ C", "Bail courte durée" / "Bail longue durée".
11. **Ajouter toggle "Utiliser mes critères"** (chip pill distinct) — 1 clic pour resynchroniser tous les filtres depuis le dossier/profil. Visible seulement si l'user a modifié les filtres vs les valeurs du profil. Indicateur "N filtres viennent de votre profil".

### Bloc C — Screening enrichi
12. Ouvrir `lib/screening.ts`. Ajouter dans le calcul :
   - `+10` si `date_embauche` existe et ancienneté > 12 mois (CDI stable)
   - `+5` si `type_garant === "Organisme Visale"` (marqueur de solvabilité)
   - `+5` si `mobilite_pro === true` (éligible Visale même sans garant)
   - `-5` si `logement_actuel_type === "Hébergé"` ET pas de garant ET revenus < 2× loyer
   - `+3` si `presentation` renseignée (engagement)
   - Flag "Emploi < 6 mois" si `date_embauche` et ancienneté < 6 mois
   - Flag "Étudiant sans garant" si `situation_pro === "Étudiant"` && !garant

13. Mettre à jour test `lib/screening.test.ts` (s'il existe, sinon créer) avec 3 cas.

### Bloc D — PDF pro
14. Créer `lib/dossierPDF.ts` export `genererDossierPDF(data: DossierData)`. Utilise `jsPDF` direct (pas html2canvas). Structure :
   - Page 1 : Header NestMatch (titre + logo via `Logo.getPDFBuffer()` quand dispo — pour l'instant juste texte), "DOSSIER LOCATAIRE", nom, date génération, score
   - Page 2 : Identité, Pro, Famille, Logement
   - Page 3 : Présentation + Documents checklist (✓/○)
   - Footer : email contact, `Généré via NestMatch le {date}`, numéro pagination
15. Remplacer `genererDossierPDF` dans `app/dossier/page.tsx` par appel à la fonction lib.

### Bloc E — Logs accès dossier partagé
16. Créer `lib/dossierAccessLog.ts` :
   ```ts
   export function hashToken(token: string): string // SHA-256 tronqué 16
   export function hashIP(ip: string, salt: string): string // SHA-256 tronqué 24
   ```
17. Créer `app/api/dossier/access-log/route.ts` POST : lit body `{ token, userAgent }`, hash token, hash IP (depuis headers), extrait email depuis token décodé (via `verifyDossierToken`), insert dans `dossier_access_log` via `supabaseAdmin`. Rate-limit 5/h par IP.
18. Dans `app/dossier-partage/[token]/page.tsx` : au mount (useEffect), fetch POST `/api/dossier/access-log`. Silencieux, fire-and-forget.
19. Dans `app/dossier/page.tsx` : nouveau bloc "Qui a consulté votre dossier" sous SharePanel. Fetch les 20 derniers logs via nouveau GET `/api/dossier/access-log` (filtré par `email === session.email`). Affiche date, user-agent parsed (juste "Chrome / macOS"), heure. Regrouper par `token_hash` pour dédupliquer.

## 6. Pièges connus

- **Séparation rôles** : `/dossier` = locataire-only. Si user est proprio (`proprietaireActive === true`), rediriger vers `/proprietaire`. Actuellement pas de garde — à ajouter.
- **Filtre animaux HARD LOCK** : si profil `animaux === true`, on doit **exclure** les annonces sans animaux (pas juste un bonus score). Ne pas permettre à l'user de l'activer/désactiver sans conscience — afficher un message "Vous avez des animaux dans votre profil" avec lien vers `/profil` pour le modifier.
- **Scores bidirectionnels** : le screening côté proprio ne doit JAMAIS modifier le score matching côté locataire (déjà OK dans le code actuel : `lib/matching.ts` ≠ `lib/screening.ts`).
- **RLS dossier_access_log** : PAS de RLS activée (convention NestMatch NextAuth) → TOUS les accès doivent passer par l'API route avec `getServerSession`. Ne JAMAIS requêter la table depuis le client browser avec anon key.
- **Token dossier partagé** : déjà HMAC + expire 7j. **NE PAS logger le token brut** — toujours hasher.
- **Presentation ≤ 500 char** : valider côté client avant DB (la contrainte CHECK existe mais erreur DB = UX dégradée).
- **date_naissance** : input HTML type=date envoie "YYYY-MM-DD". Stocker tel quel (Postgres date accepte). Ne pas convertir en Date() côté client (fuseau horaire = off-by-one day).
- **DossierFacile naming** : ne JAMAIS prétendre être DossierFacile / certifié. Notre dossier est simplement "un dossier de candidature". Ne jamais mettre "certifié" / "vérifié" dans le PDF / UI.
- **Cohérence `nb_occupants` vs `nb_enfants` + `situation_familiale`** : ne pas imposer cohérence dure (un célibataire avec 3 enfants = valide). Juste afficher hint "Vérifiez la cohérence avec votre situation familiale".

## 7. Checklist "c'est fini"

- [ ] Migration `007_profil_dossier_complet.sql` runnée sur Supabase (colonnes existent, index créés, contraintes appliquées, table `dossier_access_log` créée).
- [ ] `npx tsc --noEmit` pass sans nouvelle erreur.
- [ ] `npx next build` pass.
- [ ] `npx vitest run` pass (tous tests incluant `screening.test.ts` nouveau).
- [ ] `/dossier` affiche les 5 sections : Identité / Pro / Famille & logement / Garant / Documents.
- [ ] Drag&drop fichier sur une zone DocRow → upload fonctionne.
- [ ] Clic × sur un doc → confirm inline → 2e clic supprime vraiment.
- [ ] `situation_pro = "Étudiant"` → Certificat scolarité apparaît dans Documents.
- [ ] `a_apl = true` → Attestation CAF apparaît dans Documents.
- [ ] Présentation limitée à 500 caractères (compteur).
- [ ] Sauvegarde → reload → tous les champs sont persistés.
- [ ] `/annonces` (locataire connecté avec profil rempli) : filtres budget/ville/meuble/animaux/dpe pré-remplis depuis profil.
- [ ] Chip "Animaux OK" en hard-lock visuel si `profil.animaux === true`.
- [ ] Bouton "Utiliser mes critères" resynchronise les filtres.
- [ ] `/dossier-partage/[token]` au chargement → ligne ajoutée dans `dossier_access_log`.
- [ ] `/dossier` (locataire) affiche la liste "Qui a consulté votre dossier" (max 20, groupé par token_hash).
- [ ] PDF généré : header NestMatch, sections lisibles, footer paginé.
- [ ] Rate-limit `/api/dossier/access-log` à 5/h par IP.

---

⚠️ **EXÉCUTION OPUS UNIQUEMENT** :
- Bloc C (screening.ts) — logique de scoring sensible, impact direct sur la sélection des candidats.
- Bloc E étape 17 (access-log API) — sécurité + RLS + rate-limit.

**Reste** (Bloc A, B étape 9-11, Bloc D) → OK pour Sonnet.
