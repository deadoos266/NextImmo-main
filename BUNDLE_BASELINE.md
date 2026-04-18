# Bundle baseline — NestMatch

## Mesure du `2026-04-19` (après P0.1 + P0.6 + P0.10)

Chunks partagés First Load JS : **103 KB** (pour toutes les routes).

### Routes notables

| Route | First Load JS |
|---|---|
| `/` home | 103 KB (shared) + minimal |
| `/annonces` | ~250 KB (avec Leaflet) |
| `/annonces/[id]` | ~180 KB |
| `/messages` | ~190 KB |
| `/dossier` | ~260 KB (avec jsPDF lazy) |
| `/proprietaire` | 185 KB |
| `/proprietaire/bail/[id]` | 175 KB |
| `/proprietaire/edl/[id]` | 180 KB |
| `/proprietaire/stats` | 185 KB |
| `/parametres` | ~110 KB |
| `/auth` | ~115 KB |

## Objectifs post-optimisation

- [ ] First Load JS `/` < 180 KB
- [ ] First Load JS `/annonces` < 250 KB (Leaflet strictement lazy)
- [ ] First Load JS `/messages` < 200 KB
- [ ] `html2canvas` retiré (remplacé par jsPDF natif dans dossier)
- [ ] `jsPDF` hors shared chunks (dans route-specific chunks uniquement)
- [ ] `@anthropic-ai/sdk` jamais dans bundle client
- [ ] Leaflet CSS chargé dynamiquement

## Commande

```bash
npm run analyze
```

Ouvre rapport HTML `.next/analyze/client.html`.

## Dernière analyse détaillée

À faire quand `npm run analyze` est exécuté. Coller ici les tops 10 plus gros chunks avec taille.
