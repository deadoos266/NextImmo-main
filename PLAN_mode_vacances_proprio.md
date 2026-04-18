# PLAN — Mode vacances propriétaire

## 1. Contexte et objectif
Un proprio qui part 3 semaines reçoit quand même candidatures et messages. Friction. Poser un toggle "Je pars en vacances, masquer mes annonces disponibles" dans `/parametres` onglet Compte. Effet : `statut` des annonces passe temporairement en `réservé` (ou colonne dédiée) + bandeau informatif sur le profil public + auto-répondeur sur nouveaux messages.

## 2. Audit de l'existant

- `profils` table : aucun champ "vacances".
- Statut annonce : `disponible | en visite | réservé | loué`. On pourrait réutiliser "réservé" mais pollue la sémantique (réservation = bail presque signé).
- Auto-répondeur messages : aucun.

## 3. Fichiers impactés

| Fichier | Statut | Changement |
|---|---|---|
| `nestmatch/supabase/migrations/<timestamp>_mode_vacances.sql` | **NOUVEAU** | Colonne `profils.vacances_actif` + `vacances_message`. |
| `nestmatch/app/parametres/OngletCompte.tsx` | MODIF | Toggle "Mode vacances" + zone message auto-répondeur. |
| `nestmatch/app/annonces/page.tsx` | MODIF | Filtrer les annonces dont `proprietaire.vacances_actif = true`. |
| `nestmatch/app/annonces/[id]/page.tsx` | MODIF | Bandeau "Ce propriétaire est momentanément indisponible" sur fiche si actif. |
| `nestmatch/app/messages/page.tsx` | MODIF | Si proprio actif en vacances, poster auto-réponse à toute nouvelle conv entrante. |

## 4. Migrations SQL

```sql
ALTER TABLE IF EXISTS profils
  ADD COLUMN IF NOT EXISTS vacances_actif  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS vacances_message text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_profils_vacances_msg_length') THEN
    ALTER TABLE profils ADD CONSTRAINT chk_profils_vacances_msg_length
      CHECK (vacances_message IS NULL OR length(vacances_message) <= 400);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
```

## 5. Variables d'env
**Aucune**.

## 6. Dépendances
**Aucune**.

## 7. Étapes numérotées

### Bloc A — Migration
1. `npx supabase migration new mode_vacances` → coller §4.
2. Push staging + prod.

### Bloc B — UI toggle dans `/parametres/OngletCompte.tsx`
3. Dans l'onglet Compte, ajouter une card avant "Mes données" :
    ```tsx
    <section style={{ background: "white", borderRadius: 20, padding: 28 }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>Mode vacances</h2>
      <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 16px", lineHeight: 1.5 }}>
        Masque temporairement vos annonces disponibles de la recherche publique et active un message automatique sur vos conversations en cours.
      </p>
      <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={vacancesActif} onChange={...} style={{ width: 18, height: 18 }} />
        <span style={{ fontSize: 14, fontWeight: 700 }}>J'active le mode vacances</span>
      </label>
      {vacancesActif && (
        <textarea
          value={vacancesMessage}
          onChange={...}
          placeholder="Ex : Bonjour, je suis en congés jusqu'au 25 août. Je vous répondrai à mon retour. Merci pour votre patience !"
          maxLength={400}
          rows={3}
          style={{ width: "100%", marginTop: 12, padding: "10px 12px", border: "1.5px solid #e5e7eb", borderRadius: 12, fontSize: 14, fontFamily: "inherit" }}
        />
      )}
      <button onClick={sauverVacances} disabled={saving} style={{...}}>Enregistrer</button>
    </section>
    ```
4. Le toggle est conditionnel : afficher uniquement si `proprietaireActive === true`. Côté locataire, cacher (pas de sens).

### Bloc C — Filtrer annonces publiques
5. Dans `app/annonces/page.tsx`, étendre la query :
    ```ts
    // Actuel :
    supabase.from("annonces").select("*").or("statut.is.null,statut.neq.loué")
    // Nouveau :
    supabase.from("annonces").select("*, proprietaire_data:profils!annonces_proprietaire_email_fkey(vacances_actif)").or("statut.is.null,statut.neq.loué")
    ```
    Puis côté client, filter :
    ```ts
    const visible = annonces.filter(a => !a.proprietaire_data?.vacances_actif)
    ```
    → nécessite FK `annonces.proprietaire_email` → `profils.email` déclaré. Si pas de FK, faire un second query batched.

    **Alternative simple** : query `profils` séparément avec tous les proprios en vacances, filter côté client sans FK.

6. Ajouter petit badge sur la chip filtres "+X biens masqués (proprios en vacances)" si nécessaire (transparence).

### Bloc D — Bandeau fiche annonce
7. Dans `app/annonces/[id]/page.tsx`, **après** le fetch annonce, fetch aussi le profil proprio :
    ```ts
    const { data: proprio } = await supabase.from("profils").select("vacances_actif, vacances_message").eq("email", annonce.proprietaire_email).single()
    ```
8. Si `proprio?.vacances_actif === true`, afficher bandeau jaune en haut :
    ```tsx
    <div style={{ background: "#fff7ed", border: "1.5px solid #fed7aa", borderRadius: 14, padding: "14px 18px", marginBottom: 16, color: "#9a3412" }}>
      <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Propriétaire momentanément indisponible</p>
      <p style={{ fontSize: 13, color: "#7c2d12", margin: "6px 0 0", lineHeight: 1.5 }}>
        {proprio.vacances_message || "Vos messages seront traités dès son retour."}
      </p>
    </div>
    ```

### Bloc E — Auto-répondeur messages
9. Dans `app/messages/page.tsx`, fonction `envoyer()` : **après** l'insert du message du locataire, vérifier si le destinataire (proprio) est en vacances.
10. Si oui, insérer automatiquement un message depuis le proprio vers le locataire avec son message de vacances (préfixé `[AUTO_VACANCES]`).
    ```ts
    // Pseudo code :
    const { data: prop } = await supabase.from("profils").select("vacances_actif, vacances_message").eq("email", other).single()
    if (prop?.vacances_actif && prop.vacances_message) {
      await supabase.from("messages").insert({
        from_email: other,
        to_email: myEmail,
        contenu: `[AUTO_VACANCES]${prop.vacances_message}`,
        annonce_id: conv.annonceId,
        lu: false,
      })
    }
    ```
11. Handler préfixe `[AUTO_VACANCES]` :
    - Preview conv list : "Message automatique"
    - Card bubble : fond jaune, badge "Réponse automatique"
    - Pas dans ToastStack (car auto, pas un vrai msg)

### Bloc F — Edge case
12. Locataire qui relance → éviter spam auto-répondeur. Limite : 1 auto-réponse par conv par 24h. Check dernier `[AUTO_VACANCES]` dans la conv.

## 8. Pièges connus

- **Pas de RLS** : les vacances doivent être publiques (lecture) mais writable par le proprio only. Actuellement on passe par anon client Supabase → un user mal intentionné peut set `vacances_actif=true` de qqn d'autre si la table `profils` n'a pas d'ACL. Passer l'update via API route `/api/profil/vacances` avec getServerSession (like avatar).
- **FK manquante** : si `annonces.proprietaire_email` n'a pas de FK vers `profils.email`, le `join` Supabase ne marche pas. Vérifier via `information_schema`.
- **Auto-répondeur bruit** : ne PAS déclencher sur messages `[LOCATION_ACCEPTEE]`, `[BAIL_CARD]`, `[QUITTANCE_CARD]`, `[DOSSIER_CARD]` etc. (messages système).
- **Charset** : `vacances_message` doit être échappé si affiché (React le fait par défaut, OK).
- **Retour de vacances** : désactiver le toggle → recalculer rien, les annonces redeviennent visibles. Les messages auto passés restent dans l'historique (c'est OK).
- **Mobile UX** : toggle + textarea visibles mobile, pas couper.

## 9. Checklist "c'est fini"

- [ ] Migration appliquée, 2 colonnes dans `profils`.
- [ ] Toggle dans `/parametres?tab=compte` (proprio only).
- [ ] Message auto-répondeur 400 chars max avec compteur.
- [ ] Annonces d'un proprio en vacances **masquées** sur `/annonces` public.
- [ ] Fiche annonce affiche bandeau jaune si proprio en vacances.
- [ ] Nouveau message entrant → auto-réponse postée dans la conv.
- [ ] Rate-limit : max 1 auto-réponse / 24h / conv.
- [ ] Désactivation du mode → annonces ré-apparaissent.
- [ ] `tsc --noEmit` OK, tests passent.

---

**Plan OK pour Sonnet.**

⚠️ **Opus-only** : Bloc C étape 5 (update via API route sécurisée plutôt que anon direct) si on veut vraiment blinder contre manipulation d'autres profils.
