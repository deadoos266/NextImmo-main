# Audit Complet — Flow Bail KeyMatch (V22.1)

**Généré:** 2026-04-29
**Auditor:** Claude Agent (V22.1 Read-Only Audit)
**Repo:** `nestmatch/` — KeyMatch Next.js 15 + Supabase

---

## TL;DR — Findings critiques

- **`bail_invitations` existe en prod mais sans migration versionnée** — schéma drift, audit à risque.
- **Wizard step 7 peut set `statut="loué"` sans créer d'invitation bail** — bien marqué loué mais zéro trace de bail.
- **RLS désactivée sur `bail_invitations` + `bail_signatures` + `edl_signatures`** — anon peut INSERT/UPDATE (token-validation server-side mitige mais pas suffisant).
- **`date_debut_bail` dupliquée annonces vs bail_invitations.import_metadata** — pas de source de vérité.
- **Aucune génération auto de `loyers` à activation du bail** — locataire ne voit pas l'échéancier.

---

## 1. Entry Points — Création d'un bail

### 1.1 Wizard `/proprietaire/ajouter` (Step 7)
- File: `app/proprietaire/ajouter/page.tsx` lines 328–352, 360–369.
- Step 7 set `statut: form.statut` (default "disponible"), `loue: true if dejaLoue`, optional `locataire_email` + `date_debut_bail`.
- **Gotcha**: `statut="loué"` crée l'annonce avec `loue=true` mais **ne crée PAS de `bail_invitations`** → locataire non invité, aucun cycle de vie bail attaché.

### 1.2 Import bail existant `/proprietaire/bail/importer`
- File: `app/proprietaire/bail/importer/page.tsx` + `app/api/bail/importer/route.ts`.
- Form : titre, ville, adresse, surface, pieces, meuble, loyerHC, charges, dépôt garantie, dates, locataireEmail, message.
- POST → crée annonce hidden `bail_source="imported_pending"` + bail_invitations row (token 64-char, expiry 14 j) + email Resend au locataire.

### 1.3 Acceptation côté locataire
- Page : `app/bail-invitation/[token]/page.tsx`.
- GET `/api/bail/accepter/[token]` : load invitation (auto-passe à "expired" si dépassé).
- POST `/api/bail/accepter/[token]` : auth NextAuth + email match → update invitation `accepted` + annonce `bail_source='imported'` + notif proprio.

### 1.4 Refus
- POST `/api/bail/refuser/[token]` : pas de login requis, juste token. Update statut `declined` + clear `loue/locataire_email` sur annonce.

### 1.5 Détail / édition bail
- Page : `app/proprietaire/bail/[id]/page.tsx`.
- Form ~30 champs (parties, propriété, financier, IRL, équipement, clauses, annexes).
- Génération PDF via `genererBailPDF(formState)` (lib/bailPDF.ts, jsPDF lazy).
- Upload annexes (DPE, ERP, CREP, notice) → bucket `baux`.

---

## 2. Schéma DB

### 2.1 `bail_invitations` (⚠️ migration manquante)

Référencée dans 3 routes mais aucune `CREATE TABLE` versionnée. Existe en prod (REVOKE dans MIGRATION_030 le confirme).

**Schéma inféré** :
```sql
CREATE TABLE IF NOT EXISTS public.bail_invitations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  annonce_id      integer NOT NULL REFERENCES public.annonces(id) ON DELETE CASCADE,
  proprietaire_email text NOT NULL,
  locataire_email text NOT NULL,
  token           text NOT NULL UNIQUE,            -- 64-char hex, 14j expiry
  statut          text NOT NULL DEFAULT 'pending', -- pending | accepted | declined | expired
  loyer_hc        numeric,
  charges         numeric,
  message_proprio text,
  expires_at      timestamptz NOT NULL,
  responded_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
```

**Issues** :
- Pas de CHECK sur `statut`.
- Pas d'index `(proprietaire_email, locataire_email, statut='pending')`.
- Pas de FK `proprietaire_email`.

### 2.2 `bail_signatures` (Migration 014)
```sql
CREATE TABLE public.bail_signatures (
  id              bigserial PRIMARY KEY,
  annonce_id      integer NOT NULL REFERENCES public.annonces(id) ON DELETE CASCADE,
  signataire_email text NOT NULL,
  signataire_nom  text NOT NULL,
  signataire_role text NOT NULL CHECK (signataire_role IN ('bailleur', 'locataire', 'garant')),
  signature_png   text NOT NULL,           -- base64 PNG canvas
  mention         text NOT NULL,           -- "Lu et approuvé, bon pour accord"
  bail_hash       text,                    -- SHA-256 du payload JSON (intégrité)
  ip_address      text,
  user_agent      text,
  signe_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_bail_signatures_unique
  ON public.bail_signatures (annonce_id, signataire_email, signataire_role);
```
**eIDAS** : Niveau 1 (simple) — suffisant pour bail résidentiel français (article 1366 Code civil + règlement UE 910/2014).

### 2.3 `annonces` — colonnes bail
```sql
-- Migration 014
ALTER TABLE annonces
  ADD COLUMN bail_signe_locataire_at timestamptz,
  ADD COLUMN bail_signe_bailleur_at timestamptz;

-- Migration 015 statut update
-- statut: 'disponible' | 'bail_envoye' | 'loué' | 'loue_termine'

-- Migration 021 fin de bail
ALTER TABLE annonces
  ADD COLUMN bail_termine_at timestamptz,
  ADD COLUMN locataire_email_at_end text;

-- Baseline
loue boolean, bail_genere_at timestamptz, locataire_email text, date_debut_bail date,
bail_source text, mensualite_credit, valeur_bien, duree_credit, taxe_fonciere, ...
```

### 2.4 `etats_des_lieux` + `edl_signatures` (000 + Migration 016)
```sql
CREATE TABLE etats_des_lieux (
  id uuid PK, annonce_id, email_locataire, type ('entree'|'sortie'),
  date_edl date, statut ('brouillon'|'valide'), pieces jsonb,
  signe_locataire_at, signe_bailleur_at, ...
);

CREATE TABLE edl_signatures (
  id bigserial PK, edl_id uuid FK, signataire_email, signataire_nom,
  signataire_role CHECK ('bailleur'|'locataire'),
  signature_png, mention, ip_address, user_agent, signe_at,
  UNIQUE(edl_id, signataire_email, signataire_role)
);
```

### 2.5 `loyers` (Baseline 000)
```sql
CREATE TABLE loyers (
  id bigserial PK, annonce_id integer, mois text ('YYYY-MM'),
  montant numeric, statut ('déclaré'|'payé'|'relancé'),
  created_at timestamptz
);
```
**Issues** : Pas de FK annonce_id, pas de UNIQUE(annonce_id, mois), **pas de génération auto à activation**.

### 2.6 Storage bucket `baux` (Migration 015)
- Public, 15 Mo max, MIME `application/pdf` only.
- RLS storage : INSERT auth users own folder, SELECT public, DELETE own.

---

## 3. Flow standard pas-à-pas

1. Proprio → `/proprietaire/bail/importer` → form.
2. POST `/api/bail/importer` → annonce hidden `imported_pending` + bail_invitations + email Resend.
3. Locataire reçoit email → clic link → `/bail-invitation/{token}`.
4. Auth login (NextAuth Google) avec email cible.
5. POST `/api/bail/accepter/{token}` → update invitation `accepted` + annonce `imported` + notif proprio.
6. Proprio édite bail à `/proprietaire/bail/[id]` → génère PDF.
7. Locataire signe via BailSignatureModal → POST `/api/bail/signer` (rate-limit 5/h, validation mention "Lu et approuvé", PNG base64).
8. Server : upsert bail_signatures + update annonce `bail_signe_locataire_at` + `statut='loué'`.
9. Bailleur signe pareil (role='bailleur').
10. **Double signature détectée** : crée message `[EDL_A_PLANIFIER]` + notifications → trigger flow EDL d'entrée.

---

## 4. Flow bail importé

Identique au flow standard sauf :
- Annonce créée `bail_source='imported_pending'` (cachée du public) au lieu de wizard.
- Visible publiquement seulement après acceptation locataire.

---

## 5. PDF — Conformité ALUR

**lib/bailPDF.ts** (1035 lignes, jsPDF lazy-loaded).

**BailData** : ~50 champs (parties, propriété, financier, IRL, zone tendue, équipement meublé, annexes, clauses, signatures).

**ALUR compliance** :
- Notice informative décret 2015-549 incluse.
- Liste équipements meublés mandatés.
- Clause IRL revision.
- Caution, charges, durée capturés.

**Limite** : Compliance ALUR = assurance manuelle, pas de validation auto que toutes les clauses obligatoires sont présentes.

**Signature injection** : `BailData.signatures[]` permet pré-impression (download/archive) avec signatures canvas PNG base64.

---

## 6. Signatures électroniques — eIDAS

**Niveau 1 (simple)** suffisant pour bail résidentiel.

**Audit trail capturé** : email auth NextAuth, nom typé, role, signature_png canvas, mention regex `/lu et approuv/i`, bail_hash SHA-256, IP, user_agent, signe_at server.

**Validation route** (`/api/bail/signer`) :
- Auth NextAuth obligatoire.
- Rate-limit 5/h/user/IP.
- Email match expected role (locataire/bailleur from annonces).
- PNG `data:image/png;base64,...` max 500KB.
- Unique (annonce_id, email, role).

**EDL signatures** : même pattern `/api/edl/signer` (niveau eIDAS 1, validation locataire/bailleur).

---

## 7. Vie du bail

### Loyers
- ⚠️ **Pas d'auto-génération à signature complète**.
- UI suppose que les loyers existent mais aucune route hook ne les insère.
- Locataire ne voit pas l'échéancier tant que loyers pas peuplés.

### Quittances
- POST `/api/loyers/quittance` génère PDF.
- **Table `quittances` non documentée** dans les migrations (peut-être stockée implicitement).

### Préavis (notice)
- ⚠️ **Non implémenté**. Pas de workflow pour servir préavis ou tracker fin de bail.

### Indexation IRL annuelle
- `irlTrimestre` + `irlIndice` stockés dans BailData.
- ⚠️ **Pas d'automatisation**. Manuelle.

### EDL entry/exit
1. Bail signé double → message `[EDL_A_PLANIFIER]`.
2. Init à `/proprietaire/edl/[id]` → form pieces JSONB.
3. Signature double via `/api/edl/signer`.
4. Locataire signe → `statut='valide'`.
5. EDL sortie : type='sortie' à fin de bail.

---

## 8. Surfaces UI

### Proprio
- `/proprietaire` (dashboard list + statut)
- `/proprietaire/ajouter` (wizard step 7)
- `/proprietaire/bail/importer`
- `/proprietaire/bail/[id]` (edit + PDF)
- `/proprietaire/edl/[id]` (EDL entry)
- `/proprietaire/stats` (loyers tracking)

### Locataire
- `/bail-invitation/[token]` (acceptance)
- `/mon-logement` (logement courant)
- `/mes-quittances`
- `/edl` + `/edl/consulter/[edlId]`

### Components
- `BailSignatureModal` (canvas + mention)
- `UploadBailModal` (PDF upload)
- `AnnexeUploader` (DPE/ERP/CREP/notice)
- `BailCard` (in messages, render `[BAIL_CARD]` payload)

---

## 9. Bugs identifiés

### HIGH

1. **[H] `bail_invitations` migration manquante** — `/supabase/migrations/`. Schéma drift, recovery à risque. **Fix** : migration 026 explicite.

2. **[H] Wizard step 7 ne crée pas de bail** — `app/proprietaire/ajouter/page.tsx:328-352`. statut='loué' + loue=true mais zéro bail_invitations. **Fix** : si `dejaLoue` + `locataire_email`, rediriger vers `/proprietaire/bail/importer` avec données pré-remplies, OU appeler `/api/bail/importer` server-side.

3. **[H] RLS off sur bail_invitations/bail_signatures/edl_signatures** — `MIGRATION_030_rls_lockdown_etape_1.sql:68-69`. SELECT/INSERT/UPDATE anon ouverts. **Fix** : activer RLS + policies READ own + REVOKE INSERT/UPDATE anon.

4. **[H] Duplication `date_debut_bail`** — annonces.date_debut_bail vs bail_invitations.import_metadata.date_debut. Pas de sync. **Fix** : annonces canonical, retirer du metadata.

5. **[H] Pas d'auto-génération `loyers` à double signature** — `app/api/bail/signer/route.ts`. **Fix** : hook double-signe → INSERT 36 loyers (mois × montant × statut='déclaré').

### MEDIUM

6. **[M] `loyers` pas d'UNIQUE(annonce_id, mois)** — duplicates possibles. **Fix** : `ALTER TABLE loyers ADD CONSTRAINT loyers_unique_month UNIQUE(annonce_id, mois)`.

7. **[M] Tokens expirés non purgés** — `/api/bail/importer/route.ts`. **Fix** : cron mensuel `DELETE WHERE expires_at < now() AND statut IN ('declined','expired')`.

8. **[M] `bail_hash` jamais re-vérifié** — `/api/bail/signer/route.ts:131`. PDF tampering non détecté post-signature. **Fix** : re-hash + compare au download.

9. **[M] EDL sans `proprietaire_email`** — denormalize manquant pour RLS. **Fix** : ajouter colonne.

### LOW

10. **[L] `quittances` table non documentée**.
11. **[L] IRL indexation non automatisée**.
12. **[L] Préavis (notice) non implémenté**.

---

## 10. Recommandations priorisées

### Phase 1 — Critique (ASAP)

1. **Migration 026 `bail_invitations`** — schéma versionné explicite + indexes.
2. **Activer RLS** sur bail_invitations / bail_signatures / edl_signatures avec policies READ own + REVOKE INSERT/UPDATE anon.
3. **Auto-génération loyers** à double signature dans `/api/bail/signer`.
4. **Wizard step 7 redirige vers importer** si `dejaLoue` + `locataire_email`.

### Phase 2 — Important (2 semaines)

5. UNIQUE constraint sur `loyers(annonce_id, mois)`.
6. Documenter table `quittances`.
7. Validation `bail_hash` au download PDF.

### Phase 3 — Nice-to-have

8. IRL indexation auto annuelle.
9. Préavis workflow + countdown.
10. Cron purge invitations expirées.
11. `proprietaire_email` denormalize sur etats_des_lieux.

---

## 11. RLS / Sécurité

| Table | RLS | SELECT | INSERT | UPDATE | DELETE | TRUNCATE |
|---|---|---|---|---|---|---|
| bail_invitations | ❌ | ✓ | ✓ | ✓ | ✓ | ❌ (030) |
| bail_signatures | ❌ | ✓ | ✓ | ✓ | ✓ | ❌ (030) |
| edl_signatures | ❌ | ✓ | ✓ | ✓ | ✓ | ❌ (030) |
| loyers | ❌ | ✓ | ✓ | ✓ | ✓ | ❌ (030) |
| etats_des_lieux | ❌ | ✓ | ✓ | ✓ | ✓ | ❌ (030) |

**Token validation strong** côté routes server (NextAuth + email match), mais sans RLS table-level :
- INSERT fake bail_invitations possibles avec clé anon (server routes filtrent mais c'est du noise).
- INSERT fake bail_signatures possibles (post-sign hooks pourraient ne pas détecter).
- SELECT all invitations (privacy breach).

**Migration path 031+** :
1. ENABLE RLS toutes les tables ci-dessus.
2. CREATE POLICY READ own (proprietaire_email OR locataire_email = auth.jwt()).
3. REVOKE INSERT/UPDATE anon (writes via routes server avec supabaseAdmin).

---

## 12. Tests

`bailTimeline.test.ts` (3.8 KB) existe mais scope inconnu.

**À ajouter** :
- Unit tests `bailPDF.ts` (clauses ALUR).
- Integration `/api/bail/importer` → accept → sign → loyers.
- RLS policies tests.

---

## Annexe — Files concernés

### API
- `app/api/bail/accepter/[token]/route.ts`
- `app/api/bail/importer/route.ts`
- `app/api/bail/refuser/[token]/route.ts`
- `app/api/bail/signer/route.ts`
- `app/api/edl/[id]/route.ts`
- `app/api/edl/signer/route.ts`
- `app/api/loyers/quittance/route.ts`

### Pages
- `app/bail-invitation/[token]/page.tsx`
- `app/proprietaire/ajouter/page.tsx`
- `app/proprietaire/bail/importer/page.tsx`
- `app/proprietaire/bail/[id]/page.tsx`
- `app/proprietaire/edl/[id]/page.tsx`
- `app/mon-logement/page.tsx`
- `app/mes-quittances/page.tsx`
- `app/edl/page.tsx` + `app/edl/consulter/[edlId]/page.tsx`

### Lib
- `lib/bailPDF.ts` (1035 lignes)
- `lib/bailDefaults.ts`
- `lib/bailTimeline.ts` + test

### Migrations
- `000_baseline_schema.sql` (loyers, etats_des_lieux)
- `014_bail_signatures.sql`
- `015_baux_bucket_et_statut.sql`
- `016_edl_signatures.sql`
- `021_fin_de_bail.sql`
- `023_baux_rls_fix.sql`
- `030_rls_lockdown_etape_1.sql`

### Manquants
- ⚠️ `bail_invitations` (migration versionnée)
- ⚠️ `quittances` (schéma docs)

---

**END OF AUDIT**
