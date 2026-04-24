<!-- LIVRE 2026-04 -->
<!-- Evidence: commit 373193d bulles systeme bail/quittance/EDL/auto-paiement -->

# PLAN — Audit EDL / quittance / bail / dossier dans thread messages

## 1. Contexte et objectif
Audit complet du rendu des **messages système à préfixes** dans `/messages` :
`[DOSSIER_CARD]`, `[DEMANDE_DOSSIER]`, `[EDL_CARD]`, `[BAIL_CARD]`, `[QUITTANCE_CARD]`, `[CANDIDATURE_RETIREE]`, `[RELANCE]`, `[LOCATION_ACCEPTEE]`, `[CONTRE_PROPOSITION]`, `[VISITE_CARD]`.

Chaque préfixe doit avoir :
1. Carte dédiée dans le bubble (pas JSON brut visible).
2. Preview correct dans la conv list.
3. Toast ToastStack si applicable.
4. Pas de spam (anti-duplicate, rate-limit).

## 2. Audit de l'existant

### État par préfixe

| Préfixe | Card bubble | Conv preview | ToastStack |
|---|---|---|---|
| `[DOSSIER_CARD]` | ✓ `DossierCard` | ✓ "Dossier envoyé" | Skip intentionnel |
| `[DEMANDE_DOSSIER]` | ✓ `DemandeDossierCard` | ✓ "Dossier demandé" | Skip intentionnel |
| `[EDL_CARD]` | ✓ `EdlCard` | ✓ "État des lieux envoyé" | ✓ "État des lieux partagé" |
| `[BAIL_CARD]` | ✓ `BailCard` | ✓ "Bail généré" | ✓ "Bail reçu" |
| `[QUITTANCE_CARD]` | ? **à vérifier** | ❓ pas sûr | ✓ "Quittance reçue" |
| `[CANDIDATURE_RETIREE]` | ✓ `CandidatureRetireeCard` | ✓ "Candidature retirée" | ✓ |
| `[RELANCE]` | ✓ badge "RELANCE" dans text | ✓ "Relance : ..." | ✓ |
| `[LOCATION_ACCEPTEE]` | ✓ `LocationAccepteeCard` | ✓ "Location acceptée ✓" | ✓ |
| `[CONTRE_PROPOSITION]` | ? **à vérifier** | ❓ | ✓ "Proposition de visite" |
| `[VISITE_CARD]` | ? **à vérifier** | ❓ | ✓ "Proposition de visite" |
| `[AUTO_VACANCES]` (nouveau Phase 1) | **à créer** (PLAN_mode_vacances_proprio) | **à créer** | Skip |

### Problèmes potentiels
- `QUITTANCE_CARD` : émis par `/proprietaire/stats::confirmerLoyer`, mais le rendu dans `/messages` ?
- `VISITE_CARD` / `CONTRE_PROPOSITION` : émis par `envoyerVisite`, peut-être rendu comme texte brut.

## 3. Fichiers impactés

| Fichier | Statut | Changement |
|---|---|---|
| `nestmatch/app/messages/page.tsx` | MODIF | Audit + fix rendering gaps. |
| `nestmatch/app/components/ToastStack.tsx` | MODIF si manquant | Ajouter préfixes manquants. |
| `nestmatch/lib/messagePrefixes.ts` | **NOUVEAU** | Source unique des préfixes + helpers parse/render. |

## 4. Migrations SQL
**Aucune**.

## 5. Variables d'env
**Aucune**.

## 6. Dépendances
**Aucune**.

## 7. Étapes numérotées

### Bloc A — Centraliser les préfixes
1. Créer `lib/messagePrefixes.ts` :
    ```ts
    export const PREFIXES = {
      DOSSIER: "[DOSSIER_CARD]",
      DEMANDE_DOSSIER: "[DEMANDE_DOSSIER]",
      EDL: "[EDL_CARD]",
      BAIL: "[BAIL_CARD]",
      QUITTANCE: "[QUITTANCE_CARD]",
      CANDIDATURE_RETIREE: "[CANDIDATURE_RETIREE]",
      RELANCE: "[RELANCE]",
      LOCATION_ACCEPTEE: "[LOCATION_ACCEPTEE]",
      VISITE: "[VISITE_CARD]",
      CONTRE_PROPOSITION: "[CONTRE_PROPOSITION]",
      AUTO_VACANCES: "[AUTO_VACANCES]",
      REPLY: "[REPLY:",
    } as const

    export type PrefixType = keyof typeof PREFIXES

    export function getPrefix(content: string): PrefixType | null {
      for (const [key, prefix] of Object.entries(PREFIXES) as [PrefixType, string][]) {
        if (content.startsWith(prefix)) return key
      }
      return null
    }

    export function stripPrefix(content: string, key: PrefixType): string {
      return content.slice(PREFIXES[key].length)
    }

    /**
     * Retourne un label court pour preview dans la conv list.
     */
    export function previewLabel(content: string): string | null {
      const key = getPrefix(content)
      switch (key) {
        case "DOSSIER": return "Dossier envoyé"
        case "DEMANDE_DOSSIER": return "Dossier demandé"
        case "EDL": return "État des lieux envoyé"
        case "BAIL": return "Bail généré"
        case "QUITTANCE": return "Quittance reçue"
        case "CANDIDATURE_RETIREE": return "Candidature retirée"
        case "RELANCE": return "Relance : " + content.slice(PREFIXES.RELANCE.length).slice(0, 60)
        case "LOCATION_ACCEPTEE": return "Location acceptée ✓"
        case "VISITE": return "Proposition de visite"
        case "CONTRE_PROPOSITION": return "Contre-proposition de visite"
        case "AUTO_VACANCES": return "Message automatique"
        default: return null
      }
    }
    ```
2. Remplacer dans `app/messages/page.tsx` les constantes en doublon par `import { PREFIXES } from "../../lib/messagePrefixes"`.

### Bloc B — Vérifier QuittanceCard
3. `grep -n "QUITTANCE_CARD" app/messages/page.tsx` → vérifier qu'il y a un composant `QuittanceCard` rendu + check `isQuittance` dans le render loop.
4. Si absent : créer `QuittanceCard({ contenu, isMine })` similaire à `BailCard` :
    - Parse JSON post-prefix : `{ loyerId, bienTitre, mois, montant, dateConfirmation, proprio? }`
    - Design similaire BailCard mais couleur vert doux.
    - CTA "Voir la quittance" → `/mon-logement` locataire OU `/proprietaire/stats?id=X` proprio.

### Bloc C — Vérifier VisiteCard / ContreProposition
5. `grep -n "VISITE_CARD\|CONTRE_PROPOSITION" app/messages/page.tsx`
6. Si rendus en texte brut, créer `VisiteCard({ contenu, isMine })`. Payload attendu :
    ```json
    { "date": "2026-05-01", "heure": "14:00", "message": "...", "statut": "proposée" }
    ```
    Card avec date + heure bien visibles, CTA "Confirmer / Refuser" si isMine=false et statut=proposée. Sinon affichage passif.

### Bloc D — Audit complet rendering loop
7. Dans `app/messages/page.tsx` render loop, vérifier :
    ```tsx
    const prefix = getPrefix(m.contenu)
    if (prefix === "DOSSIER") return <DossierCard ... />
    if (prefix === "DEMANDE_DOSSIER") return <DemandeDossierCard ... />
    if (prefix === "EDL") return <EdlCard ... />
    if (prefix === "BAIL") return <BailCard ... />
    if (prefix === "QUITTANCE") return <QuittanceCard ... />
    if (prefix === "CANDIDATURE_RETIREE") return <CandidatureRetireeCard ... />
    if (prefix === "LOCATION_ACCEPTEE") return <LocationAccepteeCard ... />
    if (prefix === "VISITE") return <VisiteCard ... />
    if (prefix === "CONTRE_PROPOSITION") return <VisiteCard isCounter ... />
    if (prefix === "AUTO_VACANCES") return <AutoVacancesCard ... />
    // fallback : texte standard + badge RELANCE si applicable
    ```
8. Refactorer le `isDossier/isDemande/isEdl/isBail/isRetrait/isLocation` redundant en un seul `switch(prefix)`.

### Bloc E — ToastStack
9. Vérifier `app/components/ToastStack.tsx` couvre bien les 10+ préfixes. Ajouter manquants :
    - `AUTO_VACANCES` → skip (ce sont des auto-messages, pas besoin de toast).
    - Reste déjà en place selon l'audit précédent.

### Bloc F — Anti-duplication
10. Vérifier qu'un message `[LOCATION_ACCEPTEE]` ne peut pas être posté 2× pour la même conv :
    - Si la fonction `accepterLocation` set `annonces.statut='loué'`, re-clic = annonce.statut déjà loué → le bouton doit être caché (déjà fait via condition `annonceActive.statut !== "loué"`).
    - Idem pour bail/quittance, vérifier absence de bouton qui peut re-déclencher.

### Bloc G — Preview conv list
11. Utiliser `previewLabel(content)` de la lib pour harmoniser. Remplacer le gros `rawPreview.startsWith(...) ? ... : ...` par :
    ```ts
    const previewText = previewLabel(rawPreview) ?? parseReply(rawPreview).text
    ```

## 8. Pièges connus

- **Préfixes dupliqués** : un message `[REPLY:123]\n[BAIL_CARD]...` ne doit PAS être parsé comme BAIL_CARD direct. `parseReply` d'abord, puis `getPrefix` sur `text`.
- **JSON malformé** : un payload `[BAIL_CARD]not-json` doit tomber en fallback (card avec infos vides, pas crash). `try { JSON.parse } catch { return {} }` pattern déjà utilisé.
- **Backward compat** : les anciens messages en DB avec préfixe mais format JSON différent doivent fallback proprement.
- **Longueur messages** : `rawPreview.slice(0, 35)` + "…" maintenu pour éviter overflow conv list.
- **`[VISITE_CARD]` vs entrée dans `visites` table** : 2 sources de vérité. La table visites est la source canonique. Le message card est juste visuel. Vérifier cohérence.

## 9. Checklist "c'est fini"

- [ ] `lib/messagePrefixes.ts` centralise tous les préfixes.
- [ ] `getPrefix`, `stripPrefix`, `previewLabel` utilisables.
- [ ] `app/messages/page.tsx` utilise ces helpers, plus de duplication.
- [ ] Tous les 10+ préfixes ont une card dédiée.
- [ ] Tous les préfixes apparaissent correctement dans la conv list preview.
- [ ] ToastStack couvre les 10+ préfixes (skip intentionnel pour dossier / demande_dossier / auto_vacances).
- [ ] Zéro message rendu en JSON brut dans une bubble.
- [ ] Anti-duplication : on ne peut pas poster 2× le même event critique.
- [ ] `tsc --noEmit` OK.

---

**Plan OK pour Sonnet.** Pure audit + refactor cosmétique.
