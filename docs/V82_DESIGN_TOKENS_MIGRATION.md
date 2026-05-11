# V82 — Design tokens migration plan

> Audit + roadmap pour migrer ~3 394 hex hardcoded vers les tokens `km.*` centralisés.

## État actuel

| Métrique | Valeur |
|---|---|
| Adoption `km.*` | ~1 099 occurrences (24%) |
| Hex hardcoded restant | ~3 394 occurrences |
| Fichiers concernés | ~120 (.tsx) |
| Top file | `messages/page.tsx` (~398 occurrences) |
| Effort estimé total | ~15h (codemod + smoke test visuel) |

## Mapping hex → tokens

| Hex hardcoded | Token cible | Occurrences | Context typique |
|---|---|---:|---|
| `#111` | `km.ink` | ~857 | Texte principal, boutons noirs, icônes |
| `#EAE6DF` | `km.line` | ~898 | Borders, separators, hairlines |
| `#8a8477` | `km.muted` | ~729 | Labels secondaires, metadata (V81.31 darkened à #6b6358) |
| `#F7F4EF` | `km.beige` | ~555 | Background page, surfaces faibles |
| `#fff` / `#ffffff` | `km.white` | ~355 | Cartes, modales, surfaces principales |

**Fonts** (chained vars via `next/font` dans `layout.tsx`) :
- `"'DM Sans', sans-serif"` → `var(--font-dm-sans), 'DM Sans', sans-serif"` (~181)
- `"'Fraunces', Georgia, serif"` → `var(--font-fraunces), 'Fraunces', Georgia, serif"` (~119)

**Couleurs sémantiques** (déjà dans `km.*` mais peu utilisées hardcoded) :
- Success : `km.successBg` (#F0FAEE), `km.successLine` (#C6E9C0), `km.successText` (#15803d)
- Warn : `km.warnBg` (#FBF6EA), `km.warnLine` (#EADFC6), `km.warnText` (#a16207)
- Err : `km.errBg` (#FEECEC), `km.errLine` (#F4C9C9), `km.errText` (#b91c1c)
- Info : `km.infoBg` (#EEF3FB), `km.infoLine` (#D7E3F4), `km.infoText` (#1d4ed8)

## Fichiers déjà migrés (V82.4 MVP)

| Fichier | Hex → km | Date |
|---|---|---|
| `app/components/annonces/FiltersBar.tsx` | 23 occurrences | V82.4 |
| `app/components/Footer.tsx` | 6 occurrences | V82.4 |
| `app/components/BottomNavMobile.tsx` | 3 occurrences | V82.4 |
| `app/components/ui/km.tsx` (palette source) | — | V81.31 (km.muted darkened) |

## Top 20 fichiers à migrer prioritairement (V83 batch 1)

| # | Fichier | Hex approx | Notes |
|---:|---|---:|---|
| 1 | `app/(authenticated)/messages/page.tsx` | ~398 | Très gros, envisager split en sous-composants |
| 2 | `app/(public)/annonces/[id]/page.tsx` | ~78 | Page détail annonce |
| 3 | `app/(authenticated)/mon-logement/page.tsx` | ~133 | Hub locataire |
| 4 | `app/(authenticated)/proprietaire/bail/[id]/page.tsx` | ~93 | Bail editor |
| 5 | `app/components/MapAnnonces.tsx` | ~132 | ATTENTION : styles Leaflet (popups, pins) |
| 6 | `app/(authenticated)/proprietaire/modifier/[id]/page.tsx` | ~134 | Annonce edit |
| 7 | `app/components/CookieBanner.tsx` | ~39 | RGPD critical |
| 8 | `app/(authenticated)/parametres/OngletCompte.tsx` | ~53 | Settings |
| 9 | `app/(authenticated)/parametres/OngletProfil.tsx` | ~51 | Settings |
| 10 | `app/components/ProposerVisiteDialog.tsx` | ~65 | Modal visite |
| 11 | `app/components/BailSignatureModal.tsx` | ~55 | Modal signature eIDAS |
| 12 | `app/(authenticated)/proprietaire/edl/[id]/page.tsx` | ~74 | EDL editor |
| 13 | `app/components/annonces/ListingCardSearch.tsx` | ~33 | Card haute visibilité |
| 14 | `app/(public)/annonces/AnnoncesClient.tsx` | ~50 | Liste annonces |
| 15 | `app/components/Navbar.tsx` | ~25 | Déjà partiellement migré (km.white, km.line) |
| 16-20 | Long-tail (~30 occurrences chacun) | ~150 | Annexes, modals secondaires |

## Codemod template (jscodeshift)

```js
// codemods/hex-to-km.js
const HEX_MAP = {
  '#111': 'km.ink',
  '#EAE6DF': 'km.line',
  '#8a8477': 'km.muted',
  '#F7F4EF': 'km.beige',
  '#fff': 'km.white',
  '#FFFFFF': 'km.white',
  '#ffffff': 'km.white',
}

export default function transformer(file, api) {
  const j = api.jscodeshift
  const root = j(file.source)
  let modified = false

  // 1. Replace string literals "#111" → km.ink (JSX style props)
  root.find(j.Literal).forEach(path => {
    if (typeof path.value.value !== 'string') return
    const hex = path.value.value
    if (HEX_MAP[hex]) {
      const tokenName = HEX_MAP[hex].split('.')[1]
      path.replace(j.memberExpression(j.identifier('km'), j.identifier(tokenName)))
      modified = true
    }
  })

  // 2. Replace template strings "1px solid #EAE6DF" → `1px solid ${km.line}`
  root.find(j.Literal).forEach(path => {
    if (typeof path.value.value !== 'string') return
    let raw = path.value.value
    let hadMatch = false
    for (const [hex, token] of Object.entries(HEX_MAP)) {
      if (raw.includes(hex)) {
        hadMatch = true
        raw = raw.replace(new RegExp(hex, 'g'), `\${${token}}`)
      }
    }
    if (hadMatch) {
      path.replace(j.templateLiteral(
        [j.templateElement({ raw, cooked: raw }, true)],
        []
      ))
      modified = true
    }
  })

  // 3. Auto-import km if not already
  if (modified && !root.find(j.ImportDeclaration, { source: { value: /km$/ } }).size()) {
    // TODO: ajouter import { km } from "./ui/km" (path relatif à calculer)
  }

  return modified ? root.toSource({ quote: 'double' }) : null
}
```

Run :
```bash
npx jscodeshift -t codemods/hex-to-km.js nestmatch/app/**/*.tsx --dry  # preview
npx jscodeshift -t codemods/hex-to-km.js nestmatch/app/**/*.tsx        # apply
```

## Plan d'attaque V83

**Phase 1 (4h)** : Top 5 fichiers (mon-logement, messages, bail/[id], annonces/[id], proprietaire/modifier)
- Script codemod sur ces fichiers + revue manuelle des cas ambigus
- Smoke test page-par-page (visuel + Vitest)
- 1 commit par fichier pour pouvoir revert facilement

**Phase 2 (4h)** : Top 6-15 fichiers (modals, parametres, EDL, CookieBanner, MapAnnonces)
- ATTENTION MapAnnonces : styles Leaflet inline avec hex métier (DPE colors, score badges) — codemod doit IGNORER ces fichiers ou avoir une whitelist
- CookieBanner : critique RGPD, smoke test strict

**Phase 3 (4h)** : Long-tail (~100 fichiers <30 hex chacun)
- Codemod batch
- Build + Vitest pour catch les régressions
- 1 commit "V83.3 long-tail batch migration"

**Phase 4 (3h)** : Fonts hardcoded → CSS vars
- `grep -rn "'DM Sans'\|'Fraunces'" --include="*.tsx"` 
- Remplacement string → `var(--font-dm-sans), ...`
- Smoke test font swap (s'assure que tous les caractères rendent correctement)

**Total : ~15h** sur 4 sessions étalées.

## Risques

- **MapAnnonces.tsx** : hex métier (DPE colors A-G, score color tiers) ne sont PAS dans `km.*`. Codemod doit avoir une whitelist ou pattern (ex: `if (hex in [#1b9e50, #5dbf5a, ...]) skip`).
- **JSON-LD** : structured data peut contenir des hex (ne devrait pas être touché par codemod car string literal pas en JSX style prop).
- **Tests `__tests__/`** : peuvent référencer les hex pour assertions de couleurs — vérifier au cas par cas.
- **SVG inline** : `stroke="#111"` et `fill="#fff"` doivent être laissés ou migrés différemment (pas en var JS).

## Rollback

Chaque migration est dans son propre commit, donc rollback trivial via `git revert <sha>`. Vérifier que les tests Vitest passent à chaque step.

## Bénéfices attendus post-V83

1. **Maintenance** : changer la palette = 1 endroit (`km.tsx`), au lieu de 3 394 endroits.
2. **Cohérence visuelle** : impossible d'avoir un `#112` ou `#fef` typo qui dérive de la palette officielle.
3. **Dark mode futur** : si un jour besoin, `km.tsx` exporte 2 thèmes au lieu de chasser 3 394 endroits.
4. **Audit a11y** : changer `km.muted` une fois (V81.31 #8a8477 → #6b6358) propage à 729 endroits gratuitement.
5. **Refactor designer** : un designer peut donner un nouveau hex (ex: `#1A1A1A` pour ink), on update `km.ink`, fini.

## Métrique de succès

```bash
# Pré-migration (V82.4)
grep -rcE "#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{3}" nestmatch/app --include="*.tsx" | awk -F: '{s+=$2} END {print s}'
# Cible post-V83 : < 200 (hex métier whitelisted + rare cas justifiés)
```

---

*Doc créé V82.4 (2026-05-11). À mettre à jour après chaque phase V83.*
