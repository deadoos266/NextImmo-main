<!-- LIVRE 2026-04 -->
<!-- Evidence: 158 tests vitest sur 16 fichiers lib/ -->

# PLAN — Tests unitaires manquants (screening, profilCompleteness, dateHelpers)

## 1. Contexte et objectif
Le screening candidat (`lib/screening.ts`) a été enrichi récemment avec 5 nouveaux signaux (ancienneté emploi, Visale, APL, hébergé, présentation) mais n'a aucun test. Idem pour `profilCompleteness` et `dateHelpers`. Risque de régression silencieuse sur la logique métier centrale.

## 2. Audit de l'existant

### Tests présents
- `lib/matching.test.ts` — 20+ cas couvrant les 7 dimensions du scoring.
- `lib/loyerHelpers.test.ts` — 8 cas sur `joursRetardLoyer` et `labelRetard`.
- `lib/dossierToken.test.ts` — génération + vérification HMAC.
- `lib/cityCoords.test.ts` — normalisation + lookup.
- `lib/profilCompleteness.test.ts` — **existe déjà, à vérifier coverage**.

### Trous identifiés
- `lib/screening.ts` : **zéro test**. 5 signaux bonus/malus récents + 4 dimensions de base non couverts.
- `lib/dateHelpers.ts` : **zéro test**. Utilisé partout (visites, bail, quittances) → fragile.
- `lib/privacy.ts` : fonctions `displayName`, `maskEmail` — non testées.
- `lib/favoris.ts` : localStorage helpers — testable.
- `lib/dossierAccessLog.ts` : `hashToken`, `hashIP`, `parseUserAgent` — non testés.

## 3. Fichiers impactés

| Fichier | Statut | Changement |
|---|---|---|
| `nestmatch/lib/screening.test.ts` | **NOUVEAU** | 15-20 cas couvrant solvabilité + situation pro + garant + complétude + tous bonus/malus. |
| `nestmatch/lib/dateHelpers.test.ts` | **NOUVEAU** | Cas pour toutes les fonctions exportées. |
| `nestmatch/lib/privacy.test.ts` | **NOUVEAU** | `displayName` + `maskEmail` cases limites (vide, null, majuscules, caractères spéciaux). |
| `nestmatch/lib/dossierAccessLog.test.ts` | **NOUVEAU** | `hashToken` déterministe, `hashIP` avec salt, `parseUserAgent` parsing. |
| `nestmatch/lib/profilCompleteness.test.ts` | Existe | Relire, ajouter cas manquants si < 70 % coverage. |
| `nestmatch/package.json` | MODIF | Ajouter script `test:coverage` avec seuils. |
| `nestmatch/vitest.config.ts` | MODIF | Activer `coverage` provider `v8`, exclure `app/**`, `types/**`. |

## 4. Migrations SQL
**Aucune**. Tests pure logique.

## 5. Variables d'env
**Aucune**.

## 6. Dépendances npm

```bash
cd nestmatch
npm install -D @vitest/coverage-v8
```

## 7. Étapes numérotées

### Bloc A — Coverage config
1. Ouvrir `nestmatch/vitest.config.ts`. Ajouter au bloc `test` :
   ```ts
   coverage: {
     provider: "v8",
     reporter: ["text", "html", "json-summary"],
     include: ["lib/**/*.ts"],
     exclude: ["lib/**/*.test.ts", "lib/agents/**"],
     thresholds: {
       lines: 70,
       functions: 70,
       branches: 65,
       statements: 70,
     },
   },
   ```
2. Ajouter dans `package.json` scripts :
   ```json
   "test:coverage": "vitest run --coverage",
   "test:watch": "vitest"
   ```

### Bloc B — screening.test.ts
3. Créer `lib/screening.test.ts`. Importer `computeScreening`, `type ScreeningProfil`.
4. Helper : `const base: ScreeningProfil = { nom: "Jean", telephone: "0612345678", ville_souhaitee: "Paris", budget_max: 1000, profil_locataire: "jeune actif" }`.
5. Cas à écrire (15 tests minimum) :
   - Profil null/undefined → score 0, tier "incomplet"
   - Ratio revenus ≥ 3× loyer → 45 pts solvabilité
   - Ratio 2.5 ≤ x < 3 → 30 pts + flag "Revenus X× loyer"
   - Ratio 2 ≤ x < 2.5 → 15 pts
   - Ratio < 2 → 5 pts + flag "Revenus insuffisants"
   - Revenus null → flag "Revenus non renseignés"
   - Situation "CDI" → 25 pts
   - Situation "CDD" / "Intérim" → 15 pts
   - Situation "Étudiant" sans garant → flag "Étudiant sans garant"
   - Garant = true → 20 pts
   - `type_garant = "Aucun garant"` → sansGarant true
   - Bonus date_embauche > 24 mois → +8
   - Bonus 12 ≤ ancienneté < 24 → +5
   - Bonus Visale dans type_garant → +3
   - Bonus mobilite_pro + pas de garant → +2
   - Bonus a_apl → +2
   - Bonus présentation ≥ 50 char → +2
   - Malus hébergé sans garant + ratio < 2.5 → −5 + flag
   - Score max clamp à 100
   - Tier "excellent" ≥ 80, "bon" ≥ 60, "moyen" ≥ 40, "faible" ≥ 20, "incomplet" < 20
   - `buildSummary` : CDI + 2500 + Garant + ratio → format attendu
6. Utiliser `vi.useFakeTimers()` + `vi.setSystemTime(new Date(2026, 3, 19))` pour les tests ancienneté (sinon non-déterministe).

### Bloc C — dateHelpers.test.ts
7. Lire `lib/dateHelpers.ts` pour lister les fonctions exportées.
8. Créer `lib/dateHelpers.test.ts`. Pour chaque fonction :
   - Cas nominal (entrée valide, sortie attendue)
   - Cas limite (null, undefined, chaîne vide, date invalide)
   - Cas fuseau horaire si applicable (UTC vs Europe/Paris)
9. Locale fixée : `toLocaleDateString("fr-FR")`, éviter `toLocaleString()` sans locale.

### Bloc D — privacy.test.ts
10. Créer `lib/privacy.test.ts`. Tester :
    - `displayName("jean@example.com", "Jean Dupont")` → "Jean Dupont"
    - `displayName("jean@example.com")` → "jean" ou équivalent (à vérifier code)
    - `displayName("")` → fallback propre, pas de crash
    - `displayName(null as any)` → fallback
    - `maskEmail("test@example.com")` → "t***@example.com" (vérifier format réel)

### Bloc E — dossierAccessLog.test.ts
11. Créer `lib/dossierAccessLog.test.ts`. Tester :
    - `hashToken("abc")` déterministe (même entrée = même sortie)
    - `hashToken("abc").length === 16`
    - `hashIP("127.0.0.1")` ≠ `hashIP("127.0.0.2")`
    - `hashIP` déterministe avec même salt env
    - `parseUserAgent` : Chrome/Windows, Firefox/macOS, Safari/iOS, Edge/Windows, Android, Linux, inconnu
12. Pour `hashIP`, mock `process.env.DOSSIER_LOG_SALT = "test-salt"` dans `beforeEach`.

### Bloc F — profilCompleteness audit
13. Ouvrir `lib/profilCompleteness.test.ts` existant. Relancer `npx vitest run lib/profilCompleteness.test.ts --coverage`.
14. Si < 70 % sur `profilCompleteness.ts`, ajouter cas manquants (valeurs partielles, booleans vides, arrays, null).

### Bloc G — Validation globale
15. `npx vitest run --coverage` → s'assurer seuils atteints.
16. Ouvrir `coverage/index.html` dans navigateur, vérifier zones rouges.
17. Si < 70 % sur screening, compléter jusqu'à atteindre le seuil.

## 8. Pièges connus

- **Dates non déterministes** : TOUJOURS `vi.useFakeTimers()` + `setSystemTime` pour les tests impliquant `Date.now()` / `new Date()`. Sinon rouge selon l'heure.
- **Locales** : `toLocaleDateString()` sans locale = dépend env → forcer `"fr-FR"` dans tests ET code.
- **Threshold fail** : la CI doit échouer si coverage < 70 %. Ne pas baisser le seuil sans débat.
- **Exclusions** : ne pas tester `lib/agents/**` (appels LLM réels, trop fragile). Lister dans `coverage.exclude`.
- **Ne PAS tester** les API routes ici. C'est un autre chantier (tests d'intégration avec mock Supabase).
- **`screening` types** : `ScreeningProfil` accepte `string | number | null`. Tester les 3 pour `revenus_mensuels`.

## 9. Checklist "c'est fini"

- [ ] `npx vitest run` : tous les tests passent (89+ au lieu de 79).
- [ ] `npx vitest run --coverage` : lines > 70 %, functions > 70 %, branches > 65 %.
- [ ] Coverage `lib/screening.ts` ≥ 85 % (feature critique).
- [ ] Coverage `lib/dateHelpers.ts` ≥ 80 %.
- [ ] Coverage `lib/dossierAccessLog.ts` ≥ 80 %.
- [ ] `npm run build` passe sans warning.
- [ ] Rapport coverage HTML consultable dans `coverage/index.html`.
- [ ] Aucun `.only` / `.skip` laissé dans un fichier test.

---

**Plan prêt, OK pour Sonnet.** Aucun bloc ⚠️ Opus-only : tests pure logique, pas de sécurité ni archi sensible.
