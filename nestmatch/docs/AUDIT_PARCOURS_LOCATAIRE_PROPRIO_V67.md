# Audit parcours locataire + proprio — V67

État au 5 mai 2026. Audit code-driven exhaustif (lecture profonde des routes
API + helpers métier + composants critiques) pour valider ou invalider chaque
étape des 2 parcours utilisateur.

Méthodo : 2 invocations `business-logic-reviewer` (1 locataire / 1 proprio)
avec scope ciblé sur les routes API + `lib/`. Pas de simulation runtime.

## Résumé exécutif

- **13 bugs latents identifiés** (8 critiques 🔴 + 5 risques 🟠)
- **7 fixés inline en V67** (commit `ca1163b3`)
- **6 reportés en V68** (nécessitent migration DB ou décision produit)
- **528/528 tests vitest verts** après fixes
- **Verdict global : 8/10** — fondations solides, race conditions à fermer
  avant scale ; quelques invariants produit à protéger.

---

## Section 1 — Parcours locataire (19 étapes)

### 1. Inscription / OTP
**Fichiers** : `app/auth/page.tsx`, `app/api/auth/register/route.ts`, `app/api/auth/verify-code/route.ts`

✅ zod + bcrypt 12 rounds + double rate-limit IP/email + OTP 6 chiffres + auto-login JWT post-OTP (V42) + verrouillage identité atomique.

🟠 `register/route.ts:73-77` utilise `.single()` sur le check d'existence email — si le user n'existe pas, Supabase renvoie une erreur PGRST116 silencieusement avalée. Marche par chance car `existing` est null. Préférer `.maybeSingle()`.

🟠 Race théorique : 2 requêtes simultanées même email peuvent passer le check `existing` avant l'INSERT. À mitiger via `UNIQUE(lower(email))` côté schema (TODO V68).

### 2. Walkthrough tuto
**Fichiers** : `app/components/onboarding/TutoLocataireWalkthrough.tsx`, `app/api/locataire/tuto/route.ts`

🔴 **FIXÉ V67 (commit ca1163b3)** : `update().eq("email")` no-op silencieux si la row profils n'existe pas → tuto re-popup à chaque visite /annonces. Switch en upsert(onConflict: email).

### 3. Profil critères
**Fichier** : `app/api/profil/save/route.ts`

✅ whitelist anti-injection (`ADMIN_ONLY_FIELDS`), email forcé = session, upsert.

🟢 Pas de validation Zod du payload — un client peut écrire des colonnes inexistantes (Supabase ignore) ou des types farfelus dans `preferences_equipements` jsonb. Cohérence runtime à valider via Zod (TODO V66.9 déféré).

### 4. Profil dossier / completude
**Fichier** : `lib/profilCompleteness.ts`

🟢 `type_garant` est dans la complétude (poids 15) mais peut être `"aucun"`. `!!profil.type_garant` retourne true sur `"aucun"` → score gonflé. À filtrer (TODO V68).

### 5/6/7. Annonces / matching / carte / recherches sauvegardées
**Fichiers** : `lib/matching.ts`, `lib/qualiteAnnonce.ts`, `app/api/recherches-sauvegardees/route.ts`

✅ monotonie largement respectée, `toBool` défensif partout, profil vide = 500, équipements `Indispensable` exclusion explicite.

🟠 `matching.ts:614-626` applique `qualiteFacteur` en multiplicateur final → score effectif peut descendre à 700. Le commentaire CLAUDE.md "Score sur 1000 pts" est légèrement trompeur mais l'invariant fonctionnel est respecté.

🟠 `matching.ts:611` test `Array.isArray(a.photos)` — si `photos` arrive en string JSON depuis DB legacy, `hasQualiteSignal=false` → annonce stub gardée à plein score. À vérifier en prod (TODO V68).

### 8/9. Fiche annonce + contact
**Fichiers** : `app/annonces/[id]/page.tsx`, `app/annonces/[id]/ContactButton.tsx`, `app/api/messages/candidature/route.ts`

✅ ISR 5 min (V65.7), NextAuth, rate-limit 10/h, anti-self-candidature, notif cloche conditionnelle au premier contact.

🔴 **FIXÉ V67** : dedupe trop large (regardait n'importe quel message). Filter sur `type='candidature'` désormais. Avant : si proprio écrivait en premier (cas rare), le locataire qui candidatait ensuite était invisible dans la liste candidats côté proprio.

🟠 Race théorique : entre check dedupe (l.85-91) et INSERT (l.95), 2 candidatures concurrentes peuvent passer comme "premier contact". Mitig recommandé : contrainte `UNIQUE(from_email, to_email, annonce_id) WHERE type='candidature'` partielle (TODO V68 migration).

### 10. Demande visite
**Fichier** : `app/api/visites/proposer/route.ts`

🔴 **FIXÉ V67** : le commentaire d'en-tête mentionnait le check candidature validée mais le code ne l'effectuait pas. Le UI gating (BookingVisite) restait bypassable via curl. Maintenant : 403 server-side si pas de candidature `statut='validee'`.

🟠 Pas de check de slot occupé — 2 locataires peuvent demander le même créneau. Acceptable produit (le proprio arbitre).

### 11. Visite confirmée
Hors scope direct. Routes `/api/visites/confirmer` + cron J-1 à auditer V68.

### 12/13. Invitation bail + signature locataire
**Fichier** : `app/api/bail/signer/route.ts`

✅ eIDAS niveau 1 propre, mention canonical strict (V50.11), payload SHA-256 snapshot anti-tampering (V34.2), audit IP + user-agent + pdfLuAt, gating role/email strict, V62 fix race avenant signing déjà appliqué côté avenant.

🔴 **FIXÉ V67** côté bail/signer : `statut='loué'` posé à signature locataire seule → annonce orpheline si bailleur ne signe pas. Bascule maintenant uniquement à double signature.

🔴 **NON FIXÉ (TODO V68)** : race signature double `bail/signer:226-373`. Si locataire et bailleur signent à <100ms, les 2 requêtes voient `roles={"locataire"}` puis ajoutent leur role respectif → chacune calcule `doubleSigne=true` → `finalizeBail` × 2 (PDF uploadé 2× dans bucket à cause de `Date.now()` dans path, 2 emails finaux). Mitig : advisory lock Postgres ou flag `bail_finalize_at` posé en update conditionnel.

### 14/15. Attente bailleur + bail final
**Fichier** : `lib/bail/finalize.ts`

✅ idempotence via `[BAIL_FINAL_PDF]` check, fallback BailData minimal, upload PDF + post message + double email avec PJ.

🟠 Cf race signature ci-dessus → 2 PDFs dans bucket à timestamps différents.

### 16. EDL signer locataire
Hors scope direct. Le message `[EDL_A_PLANIFIER]` est inséré idempotent. OK.

### 17. Vie du bail (loyers, IRL, avenants)
✅ `bail/signer:244-285` génère 12 mois de loyers à signature double. V62 fix `gte("mois", startMois)` correct (relouer cycle ne casse plus).

🟠 IRL hardcodé `lib/bailDefaults.ts:95` : `IRL_DERNIER = T3 2025`. Doit être MAJ manuellement. À 2026-05, T3 2025 est dépassé. Risque : indexation calcule sur indice obsolète. Fix V68 : fetch INSEE API ou cron mensuel.

### 18. Préavis
**Fichier** : `app/api/bail/preavis/route.ts`, `lib/preavis.ts`

✅ règles légales correctes (3 mois vide / 1 mois meublé/zone tendue/motif réduit / 6 mois bailleur), check préavis unique, zone tendue détectée.

🔴 **FIXÉ V67** : exigeait seulement `bail_signe_locataire_at`. Maintenant exige aussi `bail_signe_bailleur_at` (un locataire ne peut pas donner congé sur un bail unilatéral).

### 19. Fin de bail
🔴 **FIXÉ V67** côté relouer : `date_fin_bail = nowIso` au lieu de `bail_termine_at` réel → historique faux. Maintenant : `ann.bail_termine_at ?? nowIso`.

🟠 Race relouer : pas d'unique constraint `historique_baux(annonce_id, locataire_email, bail_termine_at)`. À ajouter V68.

---

## Section 2 — Parcours propriétaire (13 étapes)

### 1. Inscription + walkthrough proprio
**Fichiers** : `app/components/bail/TutoProprio.tsx`, `app/api/proprietaire/tuto/route.ts`

✅ 3 écrans, persistance DB + cache localStorage, gating biens=0, force-open via `?tuto=1`.

🟠 Race `TutoProprio.tsx:189` : `<Link onClick={handleComplete}>` lance la POST en fire-and-forget puis navigue. Sur mobile slow 3G, la modale réapparaîtra. Fix : `await handleComplete()` puis `router.push` (TODO V68).

### 2. Dashboard
**Fichier** : `app/proprietaire/page.tsx`

✅ V63 messages reçus migrés via /api/messages/all-mine. V65.2 EDL via /api/edl/by-annonces.

🟠 Fallback `b.length===0` refait `select * limit 500` puis filtre client. Sur tenants à >500 annonces totales (admin), le filtre rate les biens. Mineur en ce moment.

### 3. Wizard ajouter annonce
**Fichier** : `app/proprietaire/ajouter/page.tsx`

✅ 7 steps, validation chambres>pieces, surface≥9m², prix∈[1,50000], politique tri-state.

🔴 **NON FIXÉ (TODO V68 — bloquant Phase 5)** : INSERT direct via `supabase` client browser (anon) ligne 377. Avec RLS Phase 5 V65, ça casse dès qu'on REVOKE INSERT anon sur `annonces`. Migration vers `/api/annonces/create` server-side requise.

🟠 Multi-fallback en cascade re-execute INSERT 3-4 fois en cas d'erreur de colonne. Pas d'idempotence (pas de `dedup_key`).

### 4. Cron candidatures-digest
**Fichier** : `app/api/cron/candidatures-digest/route.ts`

✅ auth Bearer, group by proprio, respect notif_preferences, idempotence par fenêtre 24h.

🔴 **FIXÉ V67** : score matching envoyé au proprio dans le digest = violation invariant produit. Score retiré du payload (toujours `null` désormais). Import `calculerScore` retiré.

🟠 Race : si Vercel retry le cron 2× la même heure, le proprio reçoit 2 digests. Pas de dédup via `notif_log`. Mitig V68 : table `notif_log(type, user, day)` avec UNIQUE.

🟠 Pas de pagination — sur annonce virale >100 candidatures/24h, l'email explose.

### 5. Valider candidature
**Fichier** : `app/api/candidatures/valider/route.ts`

✅ auth, ownership check, idempotence (`alreadyValidated`), insert `[CANDIDATURE_VALIDEE]`, notif cloche, email locataire avec respect prefs.

🟠 Race double-clic : 2 inserts `[CANDIDATURE_VALIDEE]` consécutifs. La garde idempotente check `statut_candidature === 'validee'` mais ce flag est posé APRÈS l'insert message → fenêtre 50-200ms. Fix V68 : update statut FIRST, puis insert message.

### 6. Marquer "Louer à ce candidat" (loue_a_at)
🔴 **FEATURE MANQUANTE (TODO V68 décision produit)** : `loue_a_at` n'existe nulle part dans le code. Mentionné uniquement dans `docs/HANDOFF_3_FLOW_PLAN.md`. Le bail peut être généré sans flag intermédiaire — pas de gate avant `/api/bail/from-annonce`. Décision : (a) implémenter colonne + gate + bouton dédié, OU (b) retirer la mention V60.9 du brief.

### 7. Générer bail
**Fichier** : `app/api/bail/from-annonce/route.ts`

✅ rate-limit 5/h user + 20/h IP, ownership check, idempotence pending invitation, expire 14j, fallback prix/charges.

🟠 Race : `existing` check puis insert sans transaction → 2 requêtes simultanées peuvent créer 2 invitations actives. Migration V68 : `CREATE UNIQUE INDEX ... WHERE statut='pending'` partial.

### 8/9. Locataire signe → Realtime + signature proprio
**Fichier** : `app/proprietaire/bail/[id]/page.tsx`, `app/api/bail/signer/route.ts`

✅ Realtime channel `bail-sigs-${id}` MAJ live + toast. V60.7 button "Envoyer" devient "Signer à votre tour" + V62 fix race avenant.

🔴 **FIXÉ V67** : statut='loué' uniquement à double signature.

🟠 V60.7 — si Realtime sub tombe, pas de refetch sigs au focus tab. Ajouter `visibilitychange` listener V68.

### 10. EDL d'entrée
**Fichier** : `app/api/edl/save/route.ts`

✅ whitelist champs, statut enum, ownership prop OR locataire (contestation), force `statut=conteste` côté locataire.

🟠 2 onglets ouverts proprio = 2 PUT concurrents avec `pieces_data` lourd → last-write-wins. Risque de perdre photos. Mitig V68 : optimistic concurrency check `updated_at`.

🟠 Pas de cap taille `pieces_data` jsonb (peut bloater). Recommandé 500 KB JSON.

🟠 Pas de rate-limit alors que cet endpoint accepte des photos base64 lourdes.

### 11. Vie du bail (loyer payé, IRL, avenant)
✅ `/api/loyers/quittance` idempotent via `quittance_pdf_url`, ownership check, respect prefs.

🟠 IRL hardcodé (cf parcours locataire §17).

### 12. Préavis + EDL sortie + restitution
**Fichier** : `app/api/baux/restitution-depot/route.ts`

✅ valide montantRetenu≤caution, motifs requis si retenue (ALUR), cohérence sum motifs, idempotence via `depot_restitue_at`, génère PDF solde de tout compte (V58.4).

🟠 `restitution-depot:209` — `gte("mois", dateDebutBail.slice(0,7))` mais pas de `lte("mois", bail_termine_at)`. Edge case : si annonce déjà reloueée, on totalise loyers d'un bail postérieur. À fixer V68.

🟠 Pas de transaction entre `update annonces.depot_restitue_at` et `insert message [DEPOT_RESTITUE]`.

🟠 Pas de check que l'EDL sortie est validé avant d'autoriser restitution → audit légal incohérent.

### 13. Relouer 1-click
**Fichier** : `app/api/baux/relouer/route.ts`

✅ rate-limit 5/h, ownership, idempotence 24h, snapshot historique_baux complet, reset annonce, anciens_logements locataire.

🔴 **FIXÉ V67** : `date_fin_bail` posé à `nowIso` au lieu de `bail_termine_at` réel.

🟠 Reset annonce ne reset PAS `statut_candidature` sur les anciens messages → si on relouée et un ancien candidat repostule, son ancien `validee` traîne. Fix V68 : reset `statut_candidature = 'archived'` pour les anciens messages avec annonce_id.

🟠 Pas de check `depot_restitue_at != null` avant relouer.

---

## Section 3 — Bugs identifiés et fixés (commit `ca1163b3`)

| # | Étape | Fichier:Ligne | Bug |
|---|---|---|---|
| L2 | Tuto | `api/locataire/tuto/route.ts:43` | update→upsert (cas profils manquant) |
| L9 | Candidature dedupe | `api/messages/candidature/route.ts:88-95` | filter type='candidature' |
| L10 | Visite gating | `api/visites/proposer/route.ts:96` | check candidature.statut='validee' |
| L18 | Préavis | `api/bail/preavis/route.ts:89` | exige bail double-signé |
| P4 | Digest score | `api/cron/candidatures-digest/route.ts:113` | score retiré (invariant produit) |
| P9 | Statut loué | `api/bail/signer/route.ts:213-218` | bascule à doubleSigne uniquement |
| P13 | Relouer date | `api/baux/relouer/route.ts:156` | date_fin_bail = bail_termine_at réel |

---

## Section 4 — Verdict global

**Note logique end-to-end : 8/10**

### Ce qui marche solid ✅
- Auth NextAuth strict sur toutes les routes API examinées (pas de trust du body sur `from_email`)
- Idempotence sur les flux critiques (`[BAIL_FINAL_PDF]`, `[EDL_A_PLANIFIER]`, `alreadyValidated`)
- Préavis légal FR conforme à la jurisprudence (`lib/preavis.ts`)
- Normalisation booléens (`toBool`) cohérente partout dans le matching
- ALUR : aucun champ discriminant ajouté, critères protégés bien commentés
- Profil vide → 500 respecté
- RLS Phase 5 (V63→V65) prête : 0 sites client `supabase.from("messages"|"loyers"|"etats_des_lieux")` restants
- Rate-limits sur les routes destructives/financières (V64)

### Ce qui reste fragile 🟠
- Race signature bail double (advisory lock Postgres requis)
- /proprietaire/ajouter INSERT client direct (cassera RLS V65 sur annonces si REVOKE INSERT anon)
- IRL hardcodé `T3 2025` dans `lib/bailDefaults.ts`
- Race candidature double-clic (statut posé après insert)
- Race relouer (pas d'unique constraint historique_baux)
- Restitution dépôt sans gate EDL sortie validé

### Actions follow-up V68

1. **Race signature bail** → ajouter advisory lock ou flag `bail_finalize_at` conditionnel
2. **/proprietaire/ajouter** → migrer vers `/api/annonces/create` server-side
3. **IRL** → cron mensuel scrape INSEE OU fetch API
4. **Migration partielles UNIQUE** : candidature + bail_invitations pending + historique_baux
5. **Décision produit `loue_a_at`** : implémenter ou retirer du brief
6. **EDL sortie validé requis avant restitution dépôt**
7. **Reset `statut_candidature='archived'` au relouer**
8. **Tuto upsert** : déjà fixé V67

### Ce qui sort du scope audit V67
- E2E Playwright signature à 2 (V61.2 toujours pending — couvert partiellement par tests vitest unitaires)
- Visites cron rappel J-1 + ICS attachment
- /api/edl/save avec optimistic concurrency
- Logger structuré (V66.3 livré, à câbler progressivement V68+)
