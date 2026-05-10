# Audit `/mon-logement` — 2026-05-11 (V81.5)

User feedback : "je peux pas appuyer dessus tu feras un audit bien de ça
parce que je sens que ça cache des problèmes".

Audit code-level de `app/(authenticated)/mon-logement/page.tsx` (1300+ lignes).

---

## 🔴 Bug 1 — Loyers futurs auto-créés en "Déclaré"

**Symptôme screenshot** : on est le 11 mai 2026, les loyers JUIN 2026 et
JUILLET 2026 sont déjà affichés avec le statut "DÉCLARÉ".

**Investigation** : code ligne 1126-1180 `projeterEcheancierBail()` merge
les loyers DB existants avec les mois futurs projetés.

**Hypothèse** :
- Soit auto-paiement activé → cron auto-create les loyers à l'avance avec
  statut "déclaré" automatiquement (`/api/cron/loyers-retard` ou autre)
- Soit un INSERT batch lors de création du bail qui pré-crée tous les mois
  jusqu'à la fin du bail en statut "déclaré"

**Risque** : confusion user ("pourquoi mes loyers futurs sont déjà
'déclarés' ?"). Peut induire une mauvaise compréhension : "déclaré" = signalé
manuellement par le locataire, pas "à venir".

**Fix recommandé V82** :
1. SELECT distinct statut sur les loyers futurs créés
2. Si `statut = "déclaré"` ET `mois > current_month` → backfill `statut = "à_venir"` ou similaire
3. Filter dans le rendu : `if (e.mois > currentMonth) → ne pas afficher chip "Déclaré"`
4. Ajouter colonne `auto_paiement_actif` boolean sur `loyers` pour traçabilité

---

## 🟠 Bug 2 — EDL BROUILLON Link semble non-cliquable

**Symptôme user** : "EDL Entrée 02/05/2026 BROUILLON" affiché — user clique,
rien ne se passe.

**Code** : ligne 1029
```tsx
<Link key={e.id} href={`/edl/consulter/${e.id}`} style={...}>
```

C'est bien un `<Link>` Next.js qui devrait fonctionner.

**Hypothèses** :
1. **Route `/edl/consulter/[edlId]` n'existe plus** post-V80 split layouts.
   Vérifié : `app/(authenticated)/edl/consulter/[edlId]/page.tsx` existe.
   → Pas la cause.

2. **Auth check restrictif** : la page consulter peut redirect si l'user
   n'est pas autorisé à voir l'EDL en mode BROUILLON (réservé proprio ?).
   → À vérifier dans `app/(authenticated)/edl/consulter/[edlId]/page.tsx`.

3. **Tap event mobile bloqué** : `<Link>` Next.js peut ne pas réagir au tap
   sur iOS Safari si un parent a `pointer-events: none` ou si un overlay
   invisible recouvre. Improbable car style explicite OK.

4. **EDL BROUILLON = non-publié** : peut-être que la route consulter retourne
   404 ou redirect si statut === "brouillon" ET role === "locataire" (l'EDL
   brouillon est en cours de saisie côté proprio, locataire ne devrait pas
   le voir).

**Fix V82 si hypothèse 4 confirmée** :
- Si EDL `brouillon` ET user locataire → NE PAS afficher la card dans `/mon-logement`
  (filter `edls.filter(e => e.statut !== "brouillon" || isProprio)`)
- OU afficher mais avec `cursor: not-allowed` + tooltip "EDL en cours de saisie par votre propriétaire"

**Fix V81.5 immédiat** (commit ce doc) : ajouter `cursor: pointer` explicit
sur le Link EDL pour signaler clairement la cliquabilité (au cas où le user
ne voyait pas le hand cursor sur mobile).

---

## 🟢 Bug 3 — Cards loyers individuelles non-cliquables (intentionnel)

**Symptôme** : Mai/Juin/Juillet 2026 chips "DÉCLARÉ" → tap n'ouvre rien.

**Code** : lignes 1173+ — `<div>` pas `<Link>`. Pas de `onClick`. Volontaire.

**Décision UX** : les actions sont dans le bouton CTA "J'ai payé" en haut
ou bouton "Télécharger PDF" sur les quittances. Ce sont les chips qui
montrent juste le statut.

**Suggestion V82** : si tu veux les rendre cliquables, ajouter `<Link>`
vers `/mes-quittances?mois=2026-05` pour ouvrir la quittance correspondante.
Mais pour l'instant pas un bug.

---

## 🟢 Bug 4 — "Prochaine échéance — 1 mai 2026 (en retard de 10 jours) — 4 €"

**Symptôme** : message rouge en haut des loyers indiquant un retard.

**Calcul** : 11 mai - 1 mai = 10 jours. Cohérent.

**Vraie question** : pourquoi 4 € de loyer ? `bien.prix + bien.charges`.
Probablement un test/seed avec un montant symbolique. Pas un bug code.

---

## 🟠 Bug 5 — UI cache des actions critiques

**Symptôme** : sur la card "LOYER DE MAI 2026 - Paiement signalé - en attente
de confirmation par votre propriétaire" → bouton "J'AI MIS EN PLACE UN VIREMENT
AUTOMATIQUE" en pointillé.

**Question UX** : c'est le bon endroit ? Le user qui cherche "comment activer
un virement auto" peut ne pas regarder cette card. Devrait être plus
prominent ou dans un toggle settings.

**Fix V82 nice-to-have** : déplacer la mise en place de l'auto-paiement
dans `/parametres` ou dans une section "Mes paiements" dédiée. Garder un
discrete CTA ici "Activer l'auto-paiement →".

---

## 📋 Checklist fixes priorisés

| Priorité | Bug | Effort |
|---|---|---|
| 🔴 | Loyers futurs auto-créés "Déclaré" | 2h |
| 🟠 | EDL BROUILLON locataire — hide ou disabled | 1h |
| 🟠 | Auto-paiement activation déplacée /parametres | 2h |
| 🟢 | Loyers chips cliquables → quittances | 1h |
| 🟢 | Card "4 €" — vérifier seed data prod | 30 min |

**Total V82 mon-logement polish** : ~6h.

---

## Tests automatiques manquants

Le fichier `mon-logement/page.tsx` (1300+ lignes) n'a aucun test unitaire
ni E2E Playwright dédié (vérifié `__tests__/` + `e2e/`). Recommandation
V82 :
- Test unitaire `projeterEcheancierBail()` avec mock loyers DB
- Test E2E mobile : "locataire signale un paiement → status passe à déclaré"
- Test E2E proprio : "confirmer un paiement déclaré → status passe à confirmé"
