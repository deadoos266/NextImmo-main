# PLAN — Refonte page Paramètres

## 1. Contexte et objectif
Aujourd'hui les réglages perso (mot de passe, thème clair/sombre, notifs, suppression compte) sont mélangés dans `/profil` via le composant `AccountSettings.tsx` — mauvais endroit. `/profil` doit servir UNIQUEMENT aux critères de recherche (locataire) / infos publiques. Objectif : créer un vrai espace `/parametres` organisé en 4 onglets (Profil / Apparence / Sécurité / Compte), rendre l'accès 1-clic depuis le menu avatar navbar, cohérent locataire ET proprio.

## 2. Audit de l'existant

### Ce qui est mélangé à tort dans /profil (via AccountSettings)
Fichier source : `app/profil/AccountSettings.tsx`
- Mot de passe (form change password)
- Email (read-only pour l'instant)
- **Thème clair / sombre** (via `<ThemeToggle />` importé)
- Notifications (placeholder "bientôt")
- Suppression compte (form delete)

### /profil aujourd'hui
Fichier : `app/profil/page.tsx` (~400 lignes)
- Critères de recherche locataire (ville, budget, surface, pièces, DPE, type_bail, équipements souhaités)
- Infos perso utilisées pour matching (situation_pro, revenus, garant, nb_occupants)
- Mount `<AccountSettings />` en bas

### /parametres aujourd'hui
Fichier : `app/parametres/page.tsx`
```tsx
import { redirect } from "next/navigation"
export default function ParametresRedirect() { redirect("/profil") }
```
Juste un redirect vers /profil. À remplacer par la vraie page.

### Navbar (app/components/Navbar.tsx)
Menu avatar desktop (L188-220) et mobile (L323-380). Items actuels selon rôle (locataire/proprio). **Aucune entrée "Paramètres"** — ajout nécessaire.

### Ce qui existe côté API
- `app/api/account/delete/route.ts` : DELETE compte (cascade). OK.
- `app/api/auth/change-password/route.ts` : probablement existe (appelé par ChangePasswordForm). À vérifier.

## 3. Fichiers impactés

| Fichier | Changement |
|---|---|
| `nestmatch/app/parametres/page.tsx` | **REMPLACER** le redirect par la vraie page à onglets. |
| `nestmatch/app/parametres/OngletProfil.tsx` | **NOUVEAU** — onglet Profil (photo avatar, nom affiché, tel, bio publique). |
| `nestmatch/app/parametres/OngletApparence.tsx` | **NOUVEAU** — onglet Apparence (ThemeToggle). |
| `nestmatch/app/parametres/OngletSecurite.tsx` | **NOUVEAU** — onglet Sécurité (mot de passe, email, sessions actives [placeholder "bientôt"]). |
| `nestmatch/app/parametres/OngletCompte.tsx` | **NOUVEAU** — onglet Compte (notifs, export data, suppression). |
| `nestmatch/app/profil/page.tsx` | **RETIRER** `<AccountSettings />` mount. Ajouter en bas un encart "Retrouvez vos paramètres dans Paramètres →". |
| `nestmatch/app/profil/AccountSettings.tsx` | **SUPPRIMER** (composants découpés dans les onglets). |
| `nestmatch/app/profil/ChangePasswordForm.tsx` | **EXTRAIRE** depuis AccountSettings si embedded. Réutilisé par OngletSecurite. |
| `nestmatch/app/profil/DeleteAccountForm.tsx` | **EXTRAIRE** idem. Réutilisé par OngletCompte. |
| `nestmatch/app/components/Navbar.tsx` | Ajouter item "Paramètres" dans menu avatar (desktop L193-204 + mobile). Icône engrenage. Juste avant "Déconnexion". |
| `nestmatch/app/parametres/layout.tsx` | **NOUVEAU** — SSR garde auth (redirect /auth si pas connecté) + metadata `noindex`. |
| `nestmatch/app/robots.ts` | `/parametres` déjà dans disallow list — vérifier. |

## 4. Migrations SQL

### Ajout au onglet Profil — champs publics optionnels
```sql
-- 008_parametres_profil_public.sql
-- Champs d'affichage public contrôlés par l'user (bio, photo custom vs Google).
ALTER TABLE IF EXISTS profils
  ADD COLUMN IF NOT EXISTS bio_publique text,
  ADD COLUMN IF NOT EXISTS photo_url_custom text;  -- override de users.image si user upload sa propre photo

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_profils_bio_length') THEN
    ALTER TABLE profils ADD CONSTRAINT chk_profils_bio_length
      CHECK (bio_publique IS NULL OR length(bio_publique) <= 300);
  END IF;
END $$;

-- Préférences notifications (placeholder tant que Resend pas intégré,
-- mais la structure est posée pour éviter migration future).
ALTER TABLE IF EXISTS profils
  ADD COLUMN IF NOT EXISTS notif_messages_email    boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_visites_email     boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_candidatures_email boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_loyer_retard_email boolean DEFAULT true;
```

### Storage (photos avatar custom)
Le bucket `avatars` n'existe probablement pas. À créer :
```sql
-- Via Supabase Dashboard (Storage > New Bucket) ou :
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Policy upload : user authentifié upload dans son propre dossier (email)
CREATE POLICY "Avatar own upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.email());

-- Policy read : public (avatars affichés dans chat, profil public annonce)
CREATE POLICY "Avatar public read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');

-- Policy update/delete : owner
CREATE POLICY "Avatar own update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.email());
CREATE POLICY "Avatar own delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.email());
```
⚠️ **NestMatch utilise NextAuth, pas Supabase Auth** → `auth.email()` retournera NULL. Alternative : uploader via API route Next avec service_role + check `getServerSession` (pattern déjà utilisé pour `/api/annonces/[id]` DELETE et `/api/edl/[id]`).

**Décision archi tranchée** : utiliser API route `/api/account/avatar` (POST multipart, DELETE) avec service_role. Pas de RLS exploitable avec NextAuth.

## 5. Étapes numérotées atomiques

### Bloc A — Squelette page à onglets
1. Créer `app/parametres/layout.tsx` : server component, `getServerSession`, redirect `/auth` si pas connecté. Export `metadata = { title: "Paramètres — NestMatch", robots: "noindex,nofollow" }`.
2. Remplacer `app/parametres/page.tsx` par un client component "Paramètres" avec state `onglet: "profil" | "apparence" | "securite" | "compte"`. URL hash-based (`?tab=profil`) pour permettre de partager un lien direct.
3. UI : sidebar gauche (desktop) / tabs horizontaux (mobile < 768px) avec les 4 onglets. Icônes SVG inline (person, sun, shield, trash). Style : cards blanches borderRadius 20, #F7F4EF fond, inline styles only.
4. Rendre `<OngletX />` selon état. Créer les 4 fichiers d'onglets vides (juste `export default function () { return <div>Onglet X</div> }`).

### Bloc B — Onglet Profil
5. Dans `OngletProfil.tsx` :
   - Photo : afficher `session.user.image` ou `profil.photo_url_custom` ou initiale. Bouton "Changer la photo" → input file → POST `/api/account/avatar` (créer route) → update `profils.photo_url_custom`. Bouton "Utiliser ma photo Google" (si `session.user.image` dispo et ≠ custom) → set `photo_url_custom = null`.
   - Nom affiché : input texte, `profils.nom`. Déjà dans le dossier — ici just pointer vers `/dossier` ? Ou dupliquer ? **Décision** : champ "nom affiché public" séparé ; `profils.nom` reste pour dossier (nom complet légal), ajouter `profils.nom_affiche` migration additionnelle OU réutiliser un alias côté UI. **Tranchage** : ne pas dupliquer, juste un bouton "Modifier mon nom" qui renvoie vers `/dossier`.
   - Téléphone : idem, édité dans /dossier.
   - Bio publique : textarea maxLength 300, new field `profils.bio_publique`. Affichée sur le profil public d'un locataire (pour un proprio qui consulte). Optionnelle.
   - Sauvegarde : bouton "Enregistrer" → upsert profils.

### Bloc C — Onglet Apparence
6. Dans `OngletApparence.tsx` :
   - Importer `<ThemeToggle />` existant.
   - Ajouter preview visuelle (carte mini avec switch clair/sombre qui change en direct).
   - Optionnel (skip MVP) : taille de police, densité.

### Bloc D — Onglet Sécurité
7. Dans `OngletSecurite.tsx` :
   - Mot de passe : afficher "Dernière modification : {date}" (si stocké — sinon masquer). Bouton "Modifier" → render `<ChangePasswordForm />` inline.
   - Email : `session.user.email` read-only pour l'instant. Bouton "Modifier" disabled avec tooltip "Bientôt — contactez le support en attendant".
   - Sessions actives : placeholder "Bientôt disponible".
   - Déconnexion de tous les appareils : bouton `signOut({ callbackUrl: "/auth" })`.
8. Déplacer `ChangePasswordForm` depuis `AccountSettings.tsx` vers son propre fichier `app/profil/ChangePasswordForm.tsx` (ou mieux `app/parametres/ChangePasswordForm.tsx`). Garder la logique identique.

### Bloc E — Onglet Compte
9. Dans `OngletCompte.tsx` :
   - Notifications : 4 toggles pour les 4 nouveaux champs (`notif_messages_email`, `notif_visites_email`, `notif_candidatures_email`, `notif_loyer_retard_email`). Persistés dans `profils`. Mention "Les emails ne sont pas encore envoyés (intégration en cours) — vos préférences seront appliquées dès l'activation."
   - Export de mes données (RGPD) : bouton "Télécharger mes données" → POST `/api/account/export` (à créer) qui renvoie un JSON de profils+messages+visites+annonces filtré par email. Silent MVP : juste un placeholder si infra pas prête.
   - Suppression : déplacer `DeleteAccountForm` existant.
10. Extraire `DeleteAccountForm` dans `app/parametres/DeleteAccountForm.tsx`.

### Bloc F — Avatar navbar
11. Dans `Navbar.tsx` menu desktop (L193-204) : ajouter item `{ href: "/parametres", label: "Paramètres", desc: "Compte, sécurité, apparence" }` pour les DEUX rôles (avant "Déconnexion"). Idem mobile.
12. Icône engrenage inline SVG à côté du label.

### Bloc G — Nettoyage /profil
13. Dans `app/profil/page.tsx` : retirer `import AccountSettings` + le mount `<AccountSettings userEmail={...} />`.
14. Ajouter en bas un lien "Paramètres du compte (mot de passe, thème, notifs) →" vers `/parametres`.
15. Supprimer le fichier `app/profil/AccountSettings.tsx` UNIQUEMENT après avoir vérifié qu'aucun autre fichier ne l'importe (grep).

### Bloc H — APIs
16. Créer `app/api/account/avatar/route.ts` :
    - POST multipart → valider image (magic bytes via `lib/fileValidation.ts` existant) → max 2 Mo → upload via service_role dans bucket `avatars/{email}/avatar.{ext}` → update `profils.photo_url_custom` → return url.
    - DELETE → supprime fichier + reset photo_url_custom.
17. Créer `app/api/account/export/route.ts` : `getServerSession` → dump profils + messages (from/to user) + visites + annonces (owner) → return JSON as attachment.

## 6. Pièges connus

- **Bucket `avatars` politique public** : les avatars sont visibles par tous (nécessaire pour affichage dans chat, /annonces/[id] proprio preview). Ne PAS uploader de photos sensibles — preview la photo avant upload côté client.
- **photo_url_custom vs session.user.image** : priorité custom > Google. Maj les composants qui affichent actuellement `session.user.image` pour checker `profil.photo_url_custom` en premier. Cf. `Navbar`, `Avatar` dans `/messages`.
- **Déconnexion tous appareils** : `signOut` Next-Auth ne révoque PAS les JWT émis (JWT stateless). Pour une vraie révocation il faut une session blacklist. **Ne pas prétendre** que ça déconnecte les autres devices — label honnête "Me déconnecter de cet appareil".
- **RLS bucket** : inutile avec NextAuth (cf. §4). Toujours passer par API route service_role.
- **Suppression compte** : déjà implémentée et testée. Ne PAS réécrire, juste réutiliser.
- **Mobile** : les 4 onglets horizontaux vont scroller horizontalement si < 400px. Tester.
- **Séparation rôles** : /parametres accessible aux DEUX rôles (locataire + proprio) avec contenu identique. Pas de branche différente.
- **metadata noindex** : /parametres déjà dans robots.ts disallow — confirmer et ajouter `robots: "noindex,nofollow"` dans metadata explicite.
- **Aucun lien depuis AccountSettings supprimé** : grep "AccountSettings" pour s'assurer qu'aucun autre fichier ne l'importe avant de le supprimer.

## 7. Checklist "c'est fini"

- [ ] Migration `008_parametres_profil_public.sql` runnée (bio_publique, photo_url_custom, 4 notif_*).
- [ ] Bucket `avatars` créé (public=true) dans Supabase Storage.
- [ ] `/parametres` rend une page à 4 onglets (pas de redirect).
- [ ] URL `/parametres?tab=securite` ouvre direct l'onglet Sécurité.
- [ ] Navbar menu avatar contient "Paramètres" (desktop + mobile, locataire + proprio).
- [ ] Changer le thème dans `/parametres` → `<html data-theme>` change en direct, persiste au reload.
- [ ] Changer mot de passe → succès flash, déconnexion automatique.
- [ ] Upload avatar 500 Ko OK → affiché dans navbar + /messages immédiatement.
- [ ] Upload avatar 3 Mo → rejeté avec message "Max 2 Mo".
- [ ] Bouton "Utiliser ma photo Google" restaure `session.user.image`.
- [ ] Toggle notifs → persist dans profils.
- [ ] Export RGPD → JSON téléchargé avec mes données.
- [ ] Supprimer compte → flow déjà testé, toujours OK.
- [ ] `/profil` ne contient PLUS AccountSettings. Bloc "Paramètres →" présent.
- [ ] Fichier `app/profil/AccountSettings.tsx` supprimé.
- [ ] `grep "AccountSettings"` ne retourne aucun résultat.
- [ ] `npx tsc --noEmit` pass.
- [ ] `npx next build` pass.
- [ ] `npx vitest run` pass.

---

⚠️ **EXÉCUTION OPUS UNIQUEMENT** :
- Bloc H étape 16 (API avatar) — upload + storage + service_role, sécurité.
- Bloc D étape 7-8 (Sécurité, mot de passe) — sensible, déjà testé, à ne pas casser.

**Reste** (Bloc A, B, C, E, F, G) → OK pour Sonnet.

**Plan prêt, OK pour Sonnet** (Opus reprend pour API avatar + validation finale sécurité).
