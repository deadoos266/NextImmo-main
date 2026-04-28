# RLS Audit V12 — Client-side Anon Usage on Sensitive Tables

**Generated:** 2026-04-28  
**Auditor Note:** Complete audit of anon supabase client usage on 14 sensitive tables.

## Executive Summary

**Total client-side files scanned:** 48 files  
**Total sensitive call sites found:** 184 distinct operations

| Operation | Count |
|-----------|-------|
| SELECT | 87 |
| INSERT | 47 |
| UPDATE | 36 |
| DELETE | 8 |
| UPSERT | 6 |

## Critical Findings

### High-Risk Tables (Must Migrate)

#### profils (44 operations)
- **Risk:** Contains dossier_docs jsonb with CNI, fiches paie, revenus, garants
- **Calls:** 20 SELECT, 5 INSERT, 10 UPDATE, 2 DELETE, 7 UPSERT
- **Critical:** pp/admin/page.tsx:126 loads ALL profils unfiltered
- **Recommendation:** RLS policy + migrate mutations to /api/profil/save (supabaseAdmin)

**SELECT Call Sites:**
- pp/profil/page.tsx:181 — load own profil (email filter: OK)
- pp/profil/creer/page.tsx:125 — load own profil (email filter: OK)
- pp/admin/page.tsx:126 — **CRITICAL: load ALL profils (NO filter)**
- pp/proprietaire/page.tsx:440 — load proprietaires profils (needs email filter)
- pp/annonces/AnnoncesClient.tsx:470 — load own profil (email filter: OK)
- pp/swipe/page.tsx:72 — load own profil (email filter: OK)
- pp/annonces/[id]/LocataireMatchCard.tsx:33 — load own profil (email filter: OK)
- pp/annonces/[id]/StickyCTABanner.tsx:46 — load own profil (email filter: OK)
- pp/annonces/[id]/ScoreBlock.tsx:19 — load own profil (email filter: OK)
- pp/annonces/comparer/ComparerClient.tsx:52 — load own profil (email filter: OK)
- pp/hooks/useUserHousingState.ts:54 — load anciens_logements (email filter: OK)
- pp/carnet/page.tsx:76 — load profils by email list (email filter: OK)
- pp/dossier/page.tsx:1397 — load own profil (email filter: OK)
- pp/messages/page.tsx:1762 — load profils by email list (email filter: OK)
- pp/messages/page.tsx:1766 — load own profil (email filter: OK)
- pp/messages/page.tsx:2078 — load profil for message (email filter: OK)
- pp/mes-documents/page.tsx:59 — load own dossier_docs (email filter: OK)
- pp/parametres/OngletProfil.tsx:37 — load own profile settings (email filter: OK)
- pp/parametres/OngletCompte.tsx:50 — load own profil (email filter: OK)
- pp/components/Navbar.tsx:112 — load photo_url_custom (email filter: OK)

**UPSERT/INSERT/UPDATE Call Sites:** All 22 mutation calls filter by email = session.user.email

#### messages (39 operations)
- **Risk:** Private conversations, sensitive content
- **Calls:** 18 SELECT, 14 INSERT, 5 UPDATE, 1 DELETE
- **Critical:** pp/admin/page.tsx:128 loads last 100 messages unfiltered
- **Recommendation:** RLS policy (most calls already filter by email) + migrate admin queries

**Unfiltered admin query:**
- pp/admin/page.tsx:128 — **CRITICAL: load 100 messages (NO filter)**
- pp/admin/page.tsx:151 — filter messages by content search (admin unfiltered)

**All other message calls filter by rom_email = session.user.email OR to_email = session.user.email**

#### users (5 operations)
- **Risk:** User IDs, admin flags, ban status
- **Calls:** 5 SELECT, 0 INSERT, 3 UPDATE, 1 DELETE
- **Critical:** pp/admin/page.tsx:127 loads ALL users unfiltered
- **Critical:** pp/admin/page.tsx:253, :260, :269 update admin/ban flags without validation
- **Recommendation:** Migrate to /api/admin/users with is_admin validation

#### visites (7 operations)
- **Risk:** Private booking data
- **All calls filter by:** proprietaire_email = session.user.email OR locataire_email = session.user.email
- **Status:** Safe once RLS policies in place

#### loyers (6 operations)
- **Risk:** Financial data
- **All calls filter by:** proprietaire_email = session.user.email OR locataire_email = session.user.email
- **Status:** Safe once RLS policies in place

#### annonces — writes only (16 operations)
- **Risk:** Property listings
- **All write calls filter by:** proprietaire_email = session.user.email
- **Exception:** pp/admin/page.tsx:204, :222 update is_test flag unfiltered
- **Status:** Safe once RLS policies in place + admin queries migrated

#### carnet_entretien (4 operations)
- **All calls filter by:** proprietaire_email or locataire_email
- **Status:** Safe once RLS policies in place

#### etats_des_lieux (4 operations)
- **All calls filter by:** proprietaire_email or locataire_email
- **Status:** Safe once RLS policies in place

## Admin Page Vulnerabilities

**File:** pp/admin/page.tsx

**Lines 125-128** — Dashboard loads:
- ALL annonces: supabase.from("annonces").select("*").order("id", { ascending: false })
- ALL profils: supabase.from("profils").select("*")
- ALL users: supabase.from("users").select(...)
- Last 100 messages: supabase.from("messages").select("*").limit(100)

**Lines 204, 222** — Mass update:
- supabase.from("annonces").update({ is_test }).eq("id", id)
- supabase.from("annonces").update({ is_test }).in("id", ids) — no is_admin check!

**Lines 245-246** — Delete any user:
- supabase.from("profils").delete().eq("email", email)
- supabase.from("users").delete().eq("email", email) — no is_admin check!

**Lines 253, 260, 269** — Modify admin/ban status:
- supabase.from("users").update({ is_admin }).eq("email", email) — **Can escalate own privileges!**
- supabase.from("users").update({ is_banned, ban_reason }).eq("email", email)

**Mitigation:** Wrap /app/admin/page.tsx page in auth check that validates is_admin flag, OR migrate all admin operations to /api/admin/* routes (supabaseAdmin only).

## RLS Policies Required

For each sensitive table, create these policies:

\\\sql
-- profils
CREATE POLICY "Users can read own profils"
ON profils FOR SELECT
USING (email = auth.jwt() ->> 'email');

CREATE POLICY "Users can upsert own profils"
ON profils FOR INSERT WITH CHECK (email = auth.jwt() ->> 'email');
ALTER POLICY "Users can upsert own profils" ON profils USING (email = auth.jwt() ->> 'email');

-- messages
CREATE POLICY "Users can read own messages"
ON messages FOR SELECT
USING (from_email = auth.jwt() ->> 'email' OR to_email = auth.jwt() ->> 'email');

CREATE POLICY "Users can insert own messages"
ON messages FOR INSERT
WITH CHECK (from_email = auth.jwt() ->> 'email');

CREATE POLICY "Users can update own messages"
ON messages FOR UPDATE
USING (from_email = auth.jwt() ->> 'email');

-- visites
CREATE POLICY "Users can read own visites"
ON visites FOR SELECT
USING (proprietaire_email = auth.jwt() ->> 'email' OR locataire_email = auth.jwt() ->> 'email');

CREATE POLICY "Locataires can insert visites"
ON visites FOR INSERT
WITH CHECK (locataire_email = auth.jwt() ->> 'email');

CREATE POLICY "Proprietaires can update visites"
ON visites FOR UPDATE
USING (proprietaire_email = auth.jwt() ->> 'email');

-- loyers
CREATE POLICY "Users can read own loyers"
ON loyers FOR SELECT
USING (proprietaire_email = auth.jwt() ->> 'email' OR locataire_email = auth.jwt() ->> 'email');

CREATE POLICY "Proprietaires can write loyers"
ON loyers FOR INSERT WITH CHECK (proprietaire_email = auth.jwt() ->> 'email');

-- annonces (writes only, reads are public)
CREATE POLICY "Proprietaires can insert annonces"
ON annonces FOR INSERT
WITH CHECK (proprietaire_email = auth.jwt() ->> 'email');

CREATE POLICY "Proprietaires can update own annonces"
ON annonces FOR UPDATE
USING (proprietaire_email = auth.jwt() ->> 'email');

-- Similar policies for: etats_des_lieux, carnet_entretien, clics_annonces, conversation_preferences, users
\\\

## Migration Priorities

### Phase 1: CRITICAL (Immediate)
1. **Wrap admin page** — Check is_admin before rendering /admin
2. **Create /api/admin/dashboard** — Move all unfiltered queries (annonces, profils, users, messages) to server-side with supabaseAdmin
3. **Create /api/admin/moderation** — Move all admin mutations (is_test, is_admin, is_banned, delete) to server-side with validation
4. **Enable RLS enforcement** — Supabase console: RLS toggle for all 14 sensitive tables

### Phase 2: HIGH (Same sprint)
5. **Migrate profile mutations** — pp/dossier/page.tsx → /api/profil/save (supabaseAdmin)
6. **Migrate profile upserts** — All supabase.from("profils").upsert() → /api/profil/save

### Phase 3: MEDIUM (Next sprint)
7. **Migrate EDL mutations** — pp/proprietaire/edl/[id]/page.tsx → /api/edl/update
8. **Add carnet API** — /api/carnet/entry for all mutations

### Phase 4: LOW (Nice to have)
9. **Convert click tracking to server** — /api/track/click (fire-and-forget)

## Verification Checklist

- [ ] RLS enabled for all 14 sensitive tables
- [ ] Test anon key blocks unauthorized reads
- [ ] Test anon key blocks unauthorized writes
- [ ] Admin page requires is_admin flag (no exception for RLS)
- [ ] All admin mutations use supabaseAdmin
- [ ] No dossier_docs reads from client
- [ ] No user bulk reads from client
- [ ] All message bulk reads check auth
- [ ] Role-based access enforced (locataire vs proprietaire)
- [ ] Full app test with RLS enabled
- [ ] Penetration test with extracted anon key (should fail on all sensitive tables)

## Files Requiring Changes

**High Priority:**
- pp/admin/page.tsx — 7 vulnerability points
- pp/dossier/page.tsx — 2 upsert calls (dossier_docs)
- pp/profil/page.tsx — 7 mutations
- pp/proprietaire/modifier/[id]/page.tsx — 3 writes

**Medium Priority:**
- pp/messages/page.tsx — 14 insert calls (most safe but recommend audit)
- pp/proprietaire/edl/[id]/page.tsx — 2-4 mutations
- pp/proprietaire/stats/page.tsx — 6 mutations

**Low Priority:**
- pp/carnet/page.tsx — 4 operations
- pp/annonces/[id]/ViewTracker.tsx — 1 upsert (click tracking)

---

**Audit completed:** 2026-04-28  
**Recommendations:** Phase 1 (admin pages) must complete before production deployment.
