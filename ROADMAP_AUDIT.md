# ROADMAP AUDIT — NestMatch (état 2026-04-19)

## 1. État des lieux

### Ce qui est solide
- **Auth NextAuth Google + Credentials** — stable, testé en prod Vercel.
- **Architecture App Router** — pages server-first, client components marqués explicitement, bon découpage.
- **Matching 1000 pts** (`lib/matching.ts`) — algo cœur produit, documenté, testé (matching.test.ts 20+ cas).
- **Screening candidat** (`lib/screening.ts`) — enrichi récemment (ancienneté, Visale, APL, hébergé, présentation) mais **non testé**.
- **Brand centralisé** (`lib/brand.ts` + `<Logo />` + `drawLogoPDF`) — swap logo = 2 fichiers.
- **Parcours dossier locataire** — 5 sections (identité, pro, logement, garant, présentation), drag&drop, docs conditionnels, ZIP complet, PDF récap vectoriel, logs accès, 3 migrations SQL propres (007/008/009).
- **Page `/parametres`** — 4 onglets, profil photo custom, bio, thème, sécurité, notifs, RGPD export, suppression compte.
- **Workflow « Louer à ce candidat »** — bouton proprio dans chat, update `annonces.statut` + `locataire_email`, message `[LOCATION_ACCEPTEE]`, migration auto Candidatures → Mon bail.
- **Gestion documents** : bail ALUR, EDL entrée/sortie contradictoire, quittances auto post-paiement, historique loyers PDF.
- **Messagerie** : realtime Supabase, scoping conv par annonce_id, archive localStorage, avatars, templates réponses, ToastStack avec tous les préfixes.
- **Hard lock animaux** sur `/annonces` avec override session (profil seul peut débrayer durablement).
- **Filtres annonces hydratés depuis profil** avec point orange discret "depuis profil" + bouton resync + chip budget valeur exacte.
- **Lightbox photos**, **share button**, **similaires server-side**, **social proof vues/candidatures**, **recherches sauvegardées localStorage**.
- **79 tests unitaires** qui passent (Vitest) — matching, loyerHelpers, dossierToken, cityCoords…

### Ce qui est fragile
- **RLS désactivée sur les tables sensibles** (profils, messages, visites, annonces) — anon key browser peut lire/écrire directement. Toute la sécurité repose sur le fait que l'anon key ne leake pas ET que les validations métier côté client ne sont pas bypassables. Vrai risque moyen en cas de fuite clé.
- **Rate-limit process-local** (`lib/rateLimit.ts` en mémoire) — inefficace en multi-instance Vercel serverless. Un attaquant qui tape 20 req/s répartit sur 20 instances passe tranquillement.
- **Gestion secrets ad-hoc** — `DOSSIER_LOG_SALT` a un fallback en dur `"nestmatch-default-salt-changeme"` dans `lib/dossierAccessLog.ts`. Fonctionnel mais amateur.
- **Bundle client non audité** — Leaflet, jsPDF, html2canvas, JSZip tous chargés (même lazy dans certains cas). Pas de `bundle-analyzer` configuré. Probablement 250+ KB JS sur certaines routes.
- **Pas de staging Supabase** — on run les migrations en prod direct. Une 008 ratée = user expérience cassée en live.
- **Pas de CI** — build + tests tournent en local seulement. Un push main peut déployer du code cassé.
- **Pas de monitoring** — aucun Sentry/Logtail. Une exception silencieuse en prod passe inaperçue.
- **Images non optimisées** — 15+ fichiers utilisent `<img>` au lieu de `next/image`. Pas de responsive/lazy natif Next.
- **Indexes Supabase incomplets** — pas d'index sur `messages.annonce_id`, `visites.date_visite`, `annonces.ville+prix`. Les requêtes de filtres scannent la table.
- **PostgREST schema cache** non géré — à chaque migration, il faut taper `NOTIFY pgrst, 'reload schema';` sinon l'API ne voit pas les nouvelles colonnes (déjà vécu 3 fois cette semaine).
- **Validation fichiers client-only** sur certains endpoints — `validateDocument` client ne remplace pas une validation serveur. `/api/account/avatar` en fait une correcte, mais pas `/storage/dossiers/*` uploads directs.

### Ce qui est critiquement manquant
- **Aucun email transactionnel** (Resend / équivalent) — vérif email, reset password, nouveau message, loyer retard, bail signé, candidats orphelins. Tout repose sur l'user ouvrant l'app.
- **Pas de tests E2E** — 79 unitaires oui, mais aucun flow bout-en-bout (signup → search → apply → accept → bail). Une régression UX passe tranquille.
- **Pas de logs produit** — impossible de dire "combien d'utilisateurs ont cliqué Louer ce mois-ci". PostHog/Plausible à brancher.
- **Design system fragmenté** — styles inline répétés. Button / Card / Input pas primitifs. Tokens couleurs dans `BRAND.colors` mais pas systématiquement utilisés.
- **i18n absent** — tout en dur en français. Impossible de lancer en Belgique, Suisse, Luxembourg sans refacto.
- **Signature électronique** — les baux et EDL sont imprimés/scannés à la main. Grosse friction.
- **Vraie gestion patrimoniale proprio** — dashboard agrégé manquant, revenus consolidés, export fiscal 2044, IRL auto.
- **Vérification employeur / référence** — un locataire peut déclarer n'importe quoi. Pas de vérif même lightweight.

## 2. Top 10 risques techniques (classés)

| # | Risque | Criticité | Pourquoi |
|---|---|---|---|
| 1 | **Fuite anon key Supabase** → lecture massive profils (données sensibles docs) | 🔴 Bloquant | RLS désactivée partout. Clé anon présente dans JS browser → obfuscation seulement. |
| 2 | **Rate-limit inefficace** en prod multi-instance | 🔴 Élevé | Process-local. Brute force auth / spam messages trivial à faire tenir. |
| 3 | **Pas de monitoring prod** | 🔴 Élevé | Erreur silencieuse = bug invisible. Un endpoint qui renvoie 500 → personne ne sait. |
| 4 | **Pas de staging** | 🟠 Moyen | Migration cassée → app down. 009 a failli arriver (nom NOT NULL). |
| 5 | **Pas de CI** | 🟠 Moyen | `npx tsc --noEmit` fait à la main. Push cassé possible. |
| 6 | **Bundle lourd** (jsPDF + Leaflet + JSZip + html2canvas) | 🟠 Moyen | Home + /annonces lents sur mobile 3G. Impact SEO Core Web Vitals. |
| 7 | **Indexes Supabase partiels** | 🟠 Moyen | Seq scan à chaque filtre ville+prix. Tiendra 5k annonces, explosera à 50k. |
| 8 | **Validation upload client-first** | 🟠 Moyen | Dossier docs uploadés direct en storage via anon — magic bytes client-only. Exploit PDF malveillant possible. |
| 9 | **Schema cache PostgREST non géré** | 🟡 Faible mais récurrent | Chaque migration nécessite un `NOTIFY pgrst, 'reload schema';` manuel. Bug UX déjà vécu 3×. |
| 10 | **Tests couverture trouée** (screening, profilCompleteness, dateHelpers) | 🟡 Faible | Régression silencieuse possible sur signaux de scoring. |

## 3. Top 10 opportunités business (quadrant gros impact / petit effort)

| # | Opportunité | Impact | Effort | Quick win ? |
|---|---|---|---|---|
| 1 | **Emails Resend** (vérif, reset, nouveau msg, orphelins, retards) | 🔥🔥🔥 | 1-2 jours | ✅ |
| 2 | **Cloche notif navbar centralisée** | 🔥🔥 | 0.5 jour | ✅ |
| 3 | **Mode vacances proprio** | 🔥🔥 | 0.5 jour | ✅ |
| 4 | **Timeline post-location guidée** | 🔥🔥🔥 | 1-2 jours | ✅ |
| 5 | **Suggestions réponses IA chat** | 🔥🔥 | 1 jour | ✅ |
| 6 | **Compteur vues annonce visible** (déjà backend, pousser UI) | 🔥 | 0.5 jour | ✅ |
| 7 | **Notif candidats orphelins auto** | 🔥🔥 | 0.5 jour (dépend Resend) | ✅ |
| 8 | **Révision IRL annuelle auto** | 🔥🔥 | 2 jours | ⚠️ dépend cron |
| 9 | **Export fiscal 2044 pré-rempli** | 🔥🔥 (proprio multi-biens) | 3-4 jours | ⚠️ complexe |
| 10 | **Plan Pro payant Stripe** | 🔥🔥🔥 (revenu) | 5-7 jours | ❌ structurant |

## 4. Top 5 "interdits" — à NE PAS faire maintenant

| Feature tentante | Pourquoi PAS MAINTENANT |
|---|---|
| **RLS complète Supabase** | Demande migration NextAuth → Supabase Auth ou custom JWT claims. Gros chantier, zéro bénéfice utilisateur. Tant que l'anon key ne leak pas, risque maîtrisé. À faire quand Phase 3 est stable. |
| **i18n EN/ES dès Phase 1** | Produit pas stabilisé, UX évolue chaque semaine. Chaque string à traduire = double la friction produit. **Attendre Phase 3** quand le produit est figé. |
| **OCR dossier / vérif docs** | Ambitieux, taux de faux positifs pénible, demande API tierce coûteuse (Mistral Vision, OpenAI). Pas de demande utilisateur forte. Skip jusqu'à preuve du besoin. |
| **Visite virtuelle 360° / vidéo** | Proprios ne vont pas upload des panos. Friction énorme. Aucune donnée ne justifie. Skip. |
| **Design system refacto complet** | Tentation Storybook + primitifs Button/Card/Input. Gros chantier, zéro feature user-facing. Le style inline marche. **À faire** quand 2-3 devs bossent sur le projet, pas avant. |

## 5. Dette technique globale : **MODÉRÉE**

**Raisonnement** :

- ✅ Code propre, TypeScript strict, pas de `any` en excès.
- ✅ Conventions respectées (inline styles, palette, rôles).
- ✅ 79 tests unitaires (bonne base).
- ⚠️ Infra faible : pas de CI, pas de monitoring, pas de staging, rate-limits naïfs.
- ⚠️ Performance non auditée : bundle probablement 300+ KB sur certaines routes.
- ⚠️ RLS absente — pas de blocker court terme, mais épée de Damoclès.

**Interprétation** :

Le code produit est **sain**. C'est **l'environnement d'exécution** qui est fragile (pas de garde-fous). Si on ne fait RIEN pendant 3 mois et qu'on rajoute features à l'arrache, on arrive à "lourde" facilement. La **Phase 0 (Consolidation)** de la roadmap doit absolument précéder toute nouvelle feature.

**Budget temps "remise à niveau"** : 2 semaines plein temps. Raisonnable.
