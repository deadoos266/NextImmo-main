<!-- LIVRE 2026-04 -->
<!-- Evidence: NotificationBell.tsx + migration 012_notifications.sql -->

# PLAN — Cloche notifications centralisée navbar

## 1. Contexte et objectif
Aujourd'hui les notifs sont fragmentées : ToastStack pour les real-time, badge chiffré sur Messages + Visites dans la navbar, mais aucun historique persistant. User loupe un événement = pas moyen de le retrouver. Poser une cloche navbar qui agrège les 30 derniers événements importants (message, visite, location, loyer, bail, retard) avec état lu/non-lu + lien contextuel.

## 2. Audit de l'existant

- `app/components/ToastStack.tsx` : toasts éphémères (5.5 s), capture via Supabase Realtime subs.
- `app/components/Navbar.tsx` : badges chiffrés séparés (visites attente, messages non lus).
- Aucune table `notifications` en DB → historique impossible.

## 3. Fichiers impactés

| Fichier | Statut | Changement |
|---|---|---|
| `nestmatch/supabase/migrations/<timestamp>_notifications.sql` | **NOUVEAU** | Table `notifications` + index email + unread. |
| `nestmatch/lib/notifications.ts` | **NOUVEAU** | Helpers `createNotification(...)` server-side. |
| `nestmatch/app/components/NotificationBell.tsx` | **NOUVEAU** | Cloche UI + dropdown + realtime sub. |
| `nestmatch/app/components/Navbar.tsx` | MODIF | Monter `<NotificationBell />` entre badges et avatar. |
| `nestmatch/app/api/notifications/route.ts` | **NOUVEAU** | GET (liste), POST (mark all read), DELETE (purge). |
| `nestmatch/app/messages/page.tsx` + `proprietaire/page.tsx` + autres | À WIRE | Call `createNotification` côté API où les events naissent. |

## 4. Migrations SQL

```sql
-- <timestamp>_notifications.sql
CREATE TABLE IF NOT EXISTS notifications (
  id         bigserial PRIMARY KEY,
  user_email text NOT NULL,
  -- type : 'message' | 'visite_proposee' | 'visite_confirmee' | 'visite_annulee' | 'location_acceptee' | 'location_refusee' | 'loyer_retard' | 'bail_genere' | 'dossier_consulte' | 'candidature_retiree'
  type       text NOT NULL,
  title      text NOT NULL,
  body       text,
  href       text,                       -- lien vers la page concernée
  related_id text,                       -- id de la ressource (message.id, visite.id, annonce.id…)
  lu         boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_user_email ON notifications(user_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications(user_email) WHERE lu = false;

-- Purge auto des notifs lues > 30 jours (cron Vercel hebdo)
-- CREATE OR REPLACE FUNCTION purge_notifications_old()
-- RETURNS void LANGUAGE sql AS $$
--   DELETE FROM notifications WHERE lu = true AND created_at < now() - INTERVAL '30 days';
-- $$;

NOTIFY pgrst, 'reload schema';
```

## 5. Variables d'env
**Aucune**.

## 6. Dépendances
**Aucune**.

## 7. Étapes numérotées

### Bloc A — Migration
1. `npx supabase migration new notifications` → coller SQL §4.
2. `npm run db:push:staging` → test. `npm run db:push` → prod après validation.

### Bloc B — Helper serveur
3. Créer `lib/notifications.ts` :
    ```ts
    import { supabaseAdmin } from "./supabase-server"

    type NotifType =
      | "message" | "visite_proposee" | "visite_confirmee" | "visite_annulee"
      | "location_acceptee" | "location_refusee" | "loyer_retard" | "bail_genere"
      | "dossier_consulte" | "candidature_retiree"

    type NotifArgs = {
      userEmail: string
      type: NotifType
      title: string
      body?: string
      href?: string
      relatedId?: string
    }

    export async function createNotification(args: NotifArgs): Promise<void> {
      try {
        await supabaseAdmin.from("notifications").insert({
          user_email: args.userEmail.toLowerCase(),
          type: args.type,
          title: args.title,
          body: args.body ?? null,
          href: args.href ?? null,
          related_id: args.relatedId ?? null,
        })
      } catch (err) {
        // Silent : ne jamais bloquer le flow métier si notif fail
        console.error("[notifications] create failed", err)
      }
    }
    ```

### Bloc C — API routes
4. Créer `/api/notifications/route.ts` :
    - `GET` : `getServerSession` → récupérer 30 dernières notifs user → JSON.
    - `POST` : mark-all-read (`update lu=true where user_email=email and lu=false`).
    - `DELETE` : purge toutes les lues pour l'user.

### Bloc D — Composant UI `NotificationBell`
5. Créer `app/components/NotificationBell.tsx` :
    - Client component, `useSession`.
    - `useEffect` fetch initial + Supabase Realtime sub `notifications` filter `user_email=eq.${email}`.
    - State : `notifs: Notification[]`, `unreadCount`.
    - Bouton cloche avec badge chiffré.
    - Clic → dropdown avec liste (scroll si > 10), état lu/non-lu différencié.
    - Clic sur notif → mark lu + navigate href.
    - Footer dropdown : "Tout marquer comme lu" + "Voir tout" (future page `/notifications`).
    - Auto-close sur clic extérieur.

### Bloc E — Intégration Navbar
6. Modifier `app/components/Navbar.tsx` :
    - Retirer les badges séparés Messages / Visites (ou les garder en plus — à trancher).
    - Import `NotificationBell` et monter avant l'avatar.
    - Desktop + mobile.

### Bloc F — Wire les événements (côté API routes existantes)
7. `/api/notifications/new-message/route.ts` (déjà créé en Plan Resend) : ajouter après email successful, `createNotification({ userEmail: to, type: "message", title: "Nouveau message", href: "/messages", relatedId: messageId })`.
8. `app/messages/page.tsx` fonction `accepterLocation` : appeler un nouvel endpoint `/api/notifications/location` qui pose la notif pour le locataire accepté + les orphelins.
9. Actions visites (confirmer, annuler, contre-proposer) : côté proprio OU locataire selon le cas → poser notif via endpoint `/api/notifications/visite`.
10. Loyer confirmé par proprio : poser notif locataire.
11. Bail généré : poser notif locataire.
12. Dossier consulté via `/dossier-partage` : poser notif locataire (déjà log dans `dossier_access_log`, peut doubler avec notif lisible).

### Bloc G — Respect prefs user
13. Avant insert, check `profils.notif_*_email` ? Non, ça c'est pour email. La cloche doit tout enregistrer (user l'a ouverte = c'est qu'il veut voir). Les prefs email restent prefs email.

### Bloc H — Tests
14. Smoke test : login, envoyer message, vérifier notif créée.
15. Realtime : nouvelle notif s'affiche sans refresh.

## 8. Pièges connus

- **Realtime Supabase** filter email : s'assurer que `user_email` est en index. Confirmé par migration.
- **Overflow notifs anciennes** : purge 30 j cron (pas dans MVP, noter).
- **Double notif** : si message créé → déjà push email → aussi notif bell → ok, 2 canaux. Mais pas 2 notifs bell pour même event. Idempotence via `related_id` ? Non, 1 notif par événement dense.
- **Click outside** : portal recommandé pour le dropdown (éviter clipping).
- **Mobile** : dropdown peut sortir de l'écran. Fullscreen modal alternative sur mobile.
- **Mark read at navigation** : clic sur notif → navigate href + update lu=true. Fire-and-forget.
- **Badge unread count** : capé à "99+" pour éviter débordement visuel.
- **Pas de RLS** : API route avec `getServerSession` + filter email côté serveur. Ne jamais exposer notifs d'un autre user.

## 9. Checklist "c'est fini"

- [ ] Migration `notifications` appliquée staging + prod.
- [ ] `lib/notifications.ts::createNotification` exporté.
- [ ] `/api/notifications` GET + POST (mark-all-read) + DELETE.
- [ ] `<NotificationBell />` dans Navbar desktop + mobile.
- [ ] Badge chiffré correct, 99+ cappé.
- [ ] Realtime : nouvelle notif apparaît sans refresh.
- [ ] Clic notif → navigate + mark read.
- [ ] "Tout marquer comme lu" fonctionne.
- [ ] 6+ events wirés : message, visite *3, location, loyer, bail.
- [ ] `tsc --noEmit` OK, `next build` OK.

---

**Plan OK pour Sonnet.** ⚠️ Opus-only : Bloc C (API route) — vérifier qu'on ne leak pas les notifs d'autres users.
