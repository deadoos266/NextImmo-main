# PLAN — RLS Hardening (tables critiques profils/annonces/messages/visites)

**Créé** : 2026-04-24 (Round 4 — audit sécurité)
**Statut** : BLOQUÉ — nécessite décision architecture avant application
**Risque** : 🔴 HAUT — peut casser l'app entière en prod

---

## État actuel en prod (projet `wzzibgdupycysvtwsqxo`)

Vérifié via MCP Supabase le 2026-04-24 :

| Table                | RLS ON ? | Policies ? | Access côté client (anon) |
|----------------------|----------|------------|---------------------------|
| `annonces`           | ❌       | —          | Full r/w (anon = dieu)    |
| `profils`            | ❌       | —          | Full r/w                  |
| `messages`           | ❌       | —          | Full r/w                  |
| `visites`            | ❌       | —          | Full r/w                  |
| `carnet_entretien`   | ❌       | —          | Full r/w                  |
| `bail_signatures`    | ❌       | —          | Full r/w                  |
| `edl_signatures`     | ❌       | —          | Full r/w                  |
| `etats_des_lieux`    | ❌       | —          | Full r/w                  |
| `loyers`             | ❌       | —          | Full r/w                  |
| `notifications`      | ❌       | —          | Full r/w                  |
| `users`              | ❌       | —          | Full r/w                  |
| `clics_annonces`     | ❌       | —          | Full r/w                  |
| `dossier_access_log` | ❌       | —          | Full r/w                  |
| `dossier_share_tokens` | ❌     | —          | Full r/w                  |
| `contacts`           | ✅       | ?          | Locked                    |
| `signalements`       | ✅       | ?          | Locked                    |

**Risque** : n'importe qui avec la clé anon (publique, dans le bundle JS)
peut lire/modifier toutes les données utilisateur.

---

## Pourquoi la migration 004 `ENABLE ROW LEVEL SECURITY` n'a jamais été appliquée

Migration 004 contenait :
```sql
ALTER TABLE public.visites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carnet_entretien ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visites_select_own" ON public.visites
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'email' = locataire_email ...)
```

**Problème bloquant** : le projet utilise **NextAuth v4** (pas Supabase Auth).
Le client Supabase (`lib/supabase.ts`) est créé avec la clé anon publique,
sans JWT Supabase-signed. Donc `auth.jwt()->>'email'` renvoie `NULL` et
ces policies refusent systématiquement l'accès. Appliquer la migration =
casser l'app immédiatement.

La migration 004 a probablement été appliquée EN LOCAL, puis jamais
propagée en prod quand cette incompatibilité a été découverte.

---

## Décision architecture requise AVANT migration 024

Trois options, à trancher AVANT toute DDL RLS :

### Option A — Full Supabase Auth (gros refactor)
Remplacer NextAuth par Supabase Auth ou intégrer un custom JWT signer
Supabase. Bénéfice : `auth.jwt()->>'email'` fonctionne nativement, RLS
authentifiée propre.
Coût : ~2 semaines, tous les flows login/register/callback à refaire,
tous les usages de `getServerSession()` à migrer.

### Option B — service_role côté serveur + anon read-only côté client
- **Serveur** (API routes) : utilisent déjà `supabaseAdmin` (service_role),
  bypassent RLS. OK pour écriture.
- **Client** (browser) : passe sur RLS avec policies "lecture publique
  restreinte" sur les tables où c'est acceptable (annonces = oui,
  profils = non, messages = non).
- Les écritures client-side (ex. `supabase.from("profils").upsert(...)` dans
  `onboarding/page.tsx` ligne 52) doivent migrer vers des routes API
  serveur auth'd.
Coût : ~3-4 jours, identifier tous les `supabase.from(...)` client-side
et router via API.

### Option C — Garder RLS off + durcir les routes API
Accepter que l'anon key est "aussi puissante qu'elle est lue en clair".
Durcir toutes les routes API pour :
- Valider `session.user.email === target.email` avant toute mutation
- Rate-limit Upstash global (voir R4.2)
- Audit-log des accès sensibles
Coût : faible, mais la surface d'attaque côté client reste.

---

## Recommandation

**Option B** — meilleur rapport sécurité/coût.

Étapes :
1. **Audit** : grep tous les `supabase.from(...)` client-side (17 fichiers
   trouvés, voir `Round 4 R4.1 audit`).
2. **Migration A** : créer routes API pour les écritures les plus critiques
   (profils, messages, visites).
3. **Migration B** : activer RLS + policies "select uniquement si
   colonne = email auth" en utilisant une approche custom :
   ```sql
   -- Policy custom : email passé en header ou cookie signé
   -- (nécessite une wrapper côté app qui set le header avant chaque request)
   ```
4. **Rollback-ready** : `DISABLE ROW LEVEL SECURITY` prêt si bug prod.

---

## Migration 024 (proposée, NON appliquée)

Brouillon disponible dans ce PLAN. À ne PAS appliquer tant que l'Option B
n'est pas implémentée. Voir commentaires `-- DANGER:` dans le SQL.

```sql
-- 024_rls_activation_profils_annonces_messages.sql
-- ⚠️ NE PAS APPLIQUER sans avoir d'abord migré les écritures client-side
-- vers des routes API (voir Option B du PLAN_RLS_HARDENING.md).
-- Appliquer tel quel casse l'app en prod.

-- Activation RLS
ALTER TABLE public.profils  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.annonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visites  ENABLE ROW LEVEL SECURITY;

-- annonces : lecture publique (moteur de recherche + visiteurs anonymes)
CREATE POLICY "annonces_select_public" ON public.annonces
  FOR SELECT TO anon, authenticated
  USING (true);

-- annonces : seul le proprio peut écrire (via route API serveur)
CREATE POLICY "annonces_write_owner" ON public.annonces
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'email' = proprietaire_email)
  WITH CHECK (auth.jwt() ->> 'email' = proprietaire_email);

-- profils : anon ne peut rien lire, authenticated = seulement son propre profil
-- ⚠️ DANGER : auth.jwt()->>'email' = NULL avec NextAuth → policy refuse tout.
-- Temporaire : garder les reads/writes côté serveur uniquement (service_role).
CREATE POLICY "profils_select_own" ON public.profils
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'email' = email);
```

(Suite dans une future PR.)

---

## Test plan (quand on applique)

Pre-apply :
- [ ] Tous les `supabase.from(...)` client-side migrés vers API
- [ ] Staging Supabase répliqué avec cette migration
- [ ] Smoke test staging : login → /profil → /messages → /annonces → /dossier
- [ ] Backup prod `pg_dump` avant apply

Post-apply :
- [ ] Sentry check 10 min : zéro 401/403 anormal
- [ ] Smoke test prod rapide : login + navigation pages authentifiées
- [ ] Rollback SQL prêt à coller si anomalie

---

## Prochain palier Round 4

R4.1 est BLOQUÉ ici. R4.2 (rate-limit Upstash global), R4.3 (salt
mandatory) et R4.4 (bundle audit) continuent indépendamment — ces trois
items n'ont pas la même dépendance architecturale.
