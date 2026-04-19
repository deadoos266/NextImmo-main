# Roadmap Phase 3 — NestMatch

**Contexte** : Phase 0 (infra), Phase 1 (value UX), Phase 2 (SEO + PWA + finitions) toutes livrées. Phase 3 = features à forte valeur business qui nécessitent soit une migration DB, soit un service externe, soit une réflexion produit plus poussée.

**Convention de priorité** : 🔥 = gros impact, ⭐ = solide, ✨ = bonus.

---

## 🎯 Chantiers prioritaires

### 1. 🔥 Signature bail électronique (P3-1)

**Pourquoi** : vrai différenciateur vs Leboncoin/SeLoger. Permet au bail généré par NestMatch d'être signé en ligne avec valeur probante (niveau eIDAS simple), fin du ping-pong PDF→imprime→scan.

**Flow** :
1. Proprio génère le bail (déjà dispo `/proprietaire/bail/[id]`)
2. Bouton "Envoyer pour signature" → mail au locataire avec lien unique
3. Locataire ouvre le lien → affiche le bail → coche "J'ai lu et j'accepte" + saisit ses initiales
4. Système capture : `user_id`, `ip`, `user_agent`, `timestamp`, hash SHA-256 du PDF, coordonnées GPS (opt-in)
5. PDF régénéré avec mention "Signé électroniquement par X le Y"
6. Les 2 parties reçoivent une copie signée

**Migration SQL nécessaire** :
```sql
CREATE TABLE IF NOT EXISTS bail_signatures (
  id bigserial PRIMARY KEY,
  annonce_id bigint NOT NULL REFERENCES annonces(id),
  locataire_email text NOT NULL,
  bail_pdf_hash text NOT NULL,
  signature_token text NOT NULL UNIQUE,
  signed_at timestamptz,
  ip_hash text,
  user_agent text,
  gps_lat numeric,
  gps_lng numeric,
  initials text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bail_signatures_annonce ON bail_signatures(annonce_id);
CREATE INDEX idx_bail_signatures_token ON bail_signatures(signature_token) WHERE signed_at IS NULL;
```

**Effort** : 3-5 jours · **Dépendance** : migration Supabase (2 min user action).

### 2. 🔥 Alertes matching locataire (P3-2)

**Pourquoi** : retention énorme. Un locataire inscrit sans bien trouvé revient sur le site rarement. Si on lui envoie un email/push quand une annonce matche ses critères, il revient.

**Flow** :
1. Locataire configure ses critères dans `/profil` (déjà possible)
2. Toggle "M'alerter par email quand une nouvelle annonce matche" (nouveau)
3. Quand une annonce est publiée par un proprio, check les alertes actives qui matchent
4. Envoie email "3 nouvelles annonces correspondent à votre recherche"

**Variantes** :
- **V1 simple** : déclencher l'envoi à l'insert annonce (hook côté API route `/api/annonces`)
- **V2 batch** : cron quotidien qui regroupe les matches → moins de mails, meilleure délivrabilité

**Migration SQL** :
```sql
ALTER TABLE profils ADD COLUMN IF NOT EXISTS alertes_actives boolean DEFAULT false;
ALTER TABLE profils ADD COLUMN IF NOT EXISTS derniere_alerte_envoyee_at timestamptz;
```

**Effort** : 2-3 jours · **Dépendance** : cron (Vercel Pro ou cron-job.org externe) pour V2.

### 3. 🔥 Reviews post-bail (P3-3)

**Pourquoi** : trust marketplace. Après X mois de bail, locataire note proprio (propreté, réactivité, respect) et proprio note locataire (paiement à l'heure, respect du logement). Augmente la qualité du matching futur.

**Design important** :
- Pas de review publique sans verified bail → anti-trolling
- Double-aveugle : les 2 parties doivent soumettre avant de voir celle de l'autre
- Max 1 review par bail-partie

**Migration SQL** :
```sql
CREATE TABLE IF NOT EXISTS reviews (
  id bigserial PRIMARY KEY,
  annonce_id bigint REFERENCES annonces(id),
  author_email text NOT NULL,
  target_email text NOT NULL,
  role text NOT NULL CHECK (role IN ('locataire', 'proprietaire')),
  score_global int NOT NULL CHECK (score_global BETWEEN 1 AND 5),
  score_details jsonb,
  comment text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(annonce_id, author_email)
);
```

**Effort** : 4-5 jours.

---

## ⭐ Chantiers moyens

### 4. ⭐ Améliorer chat messages (P3-4)

- Indicateur "en train d'écrire" (realtime via Supabase)
- Accusés de lecture (✓ envoyé, ✓✓ lu)
- Recherche dans les messages (full-text search côté client)
- Attachements images (drag & drop)

**Migration** : colonne `last_read_at` par conv-user probablement.

### 5. ⭐ Dashboard admin étendu (P3-5)

Actuellement `/admin` existe mais minimal. Enrichir :
- Graphiques inscriptions par jour/semaine
- Taux de conversion (visiteur → inscrit → bail)
- Annonces les plus vues / contactées
- Alertes bugs (synthèse Sentry)
- Actions admin : désactiver compte, forcer reset password

### 6. ⭐ Programme de parrainage (P3-6)

"Invite un ami, chacun gagne un mois premium" (quand premium existe).
- Code unique par user
- Tracking des inscriptions via code
- Badges "Early adopter" / "Ambassadeur"

### 7. ⭐ Import annonce depuis Leboncoin / SeLoger (P3-7)

Flow "Déjà une annonce ailleurs ? On l'importe" → parse l'URL, extrait titre/prix/photos/description, pré-remplit le formulaire d'ajout NestMatch. Friction d'onboarding proprio ↓.

**Technique** : scraping côté serveur (Puppeteer/Playwright lourds) ou API ouvertes si dispo. Respecter robots.txt.

---

## ✨ Bonus / nice-to-have

### 8. ✨ Module EDL mobile-first (P3-8)

L'EDL actuel est une page complexe. Sur mobile, revoir :
- Mode photo rapide (camera + upload direct)
- Checklist guidée (pièce par pièce)
- Signature électronique intégrée à la validation EDL

### 9. ✨ Estimateur enrichi (P3-9)

Intégrer données publiques (INSEE, DVF cadastre) pour comparer un prix proprio avec la médiane du quartier. Aide les proprios à fixer un loyer juste.

### 10. ✨ Mode investisseur (P3-10)

Vue agrégée pour proprios multi-biens : rendement brut/net, évolution patrimoine, alertes ROI par bien. Segmenter de l'UI single-bien.

### 11. ✨ Export RGPD complet (P3-11)

L'actuel export `/parametres > Mes données` ne fait que le profil. Compléter avec : tous les messages, visites, candidatures, loyers, EDLs, baux → ZIP téléchargeable. Conformité RGPD article 20.

### 12. ✨ Pack multi-documents download (P3-12)

Un proprio qui vient de signer un bail veut en 1 clic : bail + EDL entrée + guide location + checklist. ZIP téléchargeable qui rassemble tout.

---

## 🛠️ Dette technique à purger

| # | Chantier | Effort |
|---|---|---|
| T1 | Soft delete messages (`deleted_at`) → débloque undo conv (Phase 1 skip) | 0.5 j |
| T2 | Nettoyer dead prefixes `[VISITE_CARD]` / `[CONTRE_PROPOSITION]` | 0.5 h |
| T3 | `.gitignore` : exclure `tsconfig.tsbuildinfo`, `node_modules/.vite`, `.claude/settings.local.json` | 10 min |
| T4 | Factoriser `checkMagic` (dupliqué dans 3 routes API) | 15 min |
| T5 | Ajouter tests E2E (Playwright) pour les flows critiques signup/reset/bail | 2-3 j |
| T6 | CSP : passer de report-only à enforcing (après 48h sans violation en Sentry) | 10 min |

---

## 📋 Règles pour les sessions autonomes Phase 3

1. **Toujours commencer par lire ce fichier + MEMORY.md** pour voir l'état.
2. **Chantier avec migration SQL** : rédiger le SQL, le **NE PAS appliquer**, laisser un NOTES_FOR_PAUL.md explicite avec les étapes d'application.
3. **Chantier avec dépendance payante** (Vercel Pro, API externe) : s'arrêter et laisser un NOTES_FOR_PAUL.md.
4. **Tests + typecheck** doivent rester verts à chaque commit.
5. **1 chantier par batch**, pas d'enchaînement mal cadré.

---

## 🎯 Ordre recommandé pour Paul

Quand Paul revient sur NestMatch :
1. **Review** des commits Phase 2 autonomes (cette session) → valider ou corriger
2. **Décider** du chantier Phase 3 à attaquer en premier. Ma reco : **P3-1 Signature bail** (plus gros différenciateur).
3. **Appliquer la migration SQL** P3-1 sur staging → valider le flow en test → appliquer prod.
4. Enchaîner P3-2 (alertes) ou P3-4 (chat amélioré) selon envies.

Les chantiers T1 à T6 (dette) peuvent être faits en parallèle en autonomie quand Paul n'est pas dispo.
