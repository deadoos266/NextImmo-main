# ROADMAP 6 MOIS — NestMatch

## Vue d'ensemble

| Phase | Durée | Objectif | Impact |
|---|---|---|---|
| **Phase 0** Consolidation | 2 semaines | Fondations saines (CI, monitoring, rate-limits, tests, perf) | Interne |
| **Phase 1** Quick wins | 4 semaines | Features gros impact / petit effort | Très utilisateur |
| **Phase 2** Structurant | 8 semaines | Features lourdes qui changent le produit (PWA, signature, legal) | Très utilisateur + crédibilité |
| **Phase 3** Croissance | 10 semaines | Acquisition + scale (SEO, partenariats, reviews, i18n) | Business |

Total : **24 semaines** ≈ 6 mois.

---

## PHASE 0 — CONSOLIDATION (2 semaines)

### Objectif mesurable
- Coverage tests > 70 % sur les libs critiques (matching, screening, profilCompleteness, dateHelpers, loyerHelpers, dossierToken).
- 100 % des erreurs prod trackées via Sentry (front + API routes).
- CI verte obligatoire avant merge (lint + tsc + test + build).
- Bundle audit fait, Leaflet chargé en lazy sur pages avec carte uniquement.
- 100 % des `<img>` migrées vers `next/image` sur les pages publiques (annonces, home, villes).
- 5 indexes Supabase ajoutés sur les colonnes de filtres (ville, prix, statut, annonce_id, date_visite).

### Chantiers (ordre recommandé respectant les dépendances)

| # | Chantier | Plan | Effort | Dépend de |
|---|---|---|---|---|
| P0.1 | Tests unitaires manquants (screening, profilCompleteness, dateHelpers) | PLAN_tests_unitaires.md | 1 j | — |
| P0.2 | Supabase CLI + migrations versionnées + seed | PLAN_supabase_cli_migrations.md | 1 j | — |
| P0.3 | Staging Supabase distinct | PLAN_staging_supabase.md | 0.5 j | P0.2 |
| P0.4 | Sentry monitoring front + API | PLAN_sentry_monitoring.md | 0.5 j | — |
| P0.5 | Rate-limits Upstash Redis distribués | PLAN_rate_limits_upstash.md | 1 j | — |
| P0.6 | CSP headers stricts | PLAN_csp_headers.md | 0.5 j | — |
| P0.7 | Bundle audit + lazy Leaflet + lazy jsPDF | PLAN_bundle_audit.md | 1 j | — |
| P0.8 | `next/image` partout sur pages publiques | PLAN_next_image_migration.md | 1 j | — |
| P0.9 | Indexes Supabase review | PLAN_indexes_supabase.md | 0.5 j | P0.3 |
| P0.10 | CI GitHub Actions (lint + tsc + test + build) | PLAN_ci_github_actions.md | 0.5 j | P0.1 |

**Total effort** : 7.5 jours + marge = 2 semaines.

### Ressources externes à ouvrir

| Service | Pourquoi | Free tier | URL d'inscription |
|---|---|---|---|
| **Sentry** | Erreurs prod front + back | 5k events/mois | https://sentry.io/signup/ |
| **Upstash** | Redis rate-limits serverless | 10k commandes/jour | https://console.upstash.com/ |
| **Supabase staging** | Base de prévisualisation séparée | Free plan identique | https://supabase.com/dashboard (nouveau projet) |

### Secrets `.env` à ajouter

```bash
# Sentry
SENTRY_DSN=https://<clé>@<org>.ingest.sentry.io/<project>
SENTRY_AUTH_TOKEN=<token>            # Pour source maps
NEXT_PUBLIC_SENTRY_DSN=<même DSN>    # Front

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://<subdomain>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<token>

# Staging Supabase (environnement séparé, .env.staging)
SUPABASE_URL_STAGING=https://<ref>.supabase.co
SUPABASE_ANON_KEY_STAGING=<clé>
SUPABASE_SERVICE_ROLE_KEY_STAGING=<clé>
```

### Budget mensuel estimé

| Service | Free | Payant (si dépassement) |
|---|---|---|
| Sentry | 5k events/mois | 26 $/mois |
| Upstash | 10k cmd/jour | 0,2 $/100k cmd |
| Supabase staging | Free tier (500 MB) | 25 $/mois si besoin plus |

**Total Phase 0 en free tier** : **0 €/mois**.

### Checklist "Phase 0 terminée"

- [ ] `npx vitest run` : couverture > 70 % sur `lib/matching`, `lib/screening`, `lib/profilCompleteness`, `lib/dateHelpers`, `lib/loyerHelpers`, `lib/dossierToken`, `lib/dossierAccessLog`.
- [ ] Une erreur volontaire dans un server component remonte dans Sentry en < 1 min.
- [ ] `npm run lint && npm run test && npm run build` passe en local et en CI.
- [ ] GitHub Actions workflow run sur chaque PR, bloque merge si rouge.
- [ ] `curl -X POST /api/agent` 200 fois sans auth → 429 après 10 (rate-limit Upstash).
- [ ] Header `Content-Security-Policy` présent dans `next build` via `vercel inspect`.
- [ ] `npx supabase migration list` ≥ 9 migrations versionnées, ordre respecté, reproductible sur staging.
- [ ] `next/image` sur `/`, `/annonces`, `/annonces/[id]`, `/location/[ville]`, `/favoris`.
- [ ] `explain analyze` sur requêtes `/annonces` filtrées par ville+prix : index utilisés (plus de Seq Scan).
- [ ] Bundle `/` first-load JS < 180 KB (vs probablement 250+ aujourd'hui).

---

## PHASE 1 — QUICK WINS (4 semaines)

### Objectif mesurable
- 6 événements métier déclenchent un email (Resend) : vérification compte, reset password, nouveau message, loyer en retard, candidats orphelins, bail fin.
- Cloche notifications dans la navbar avec historique des 20 derniers événements, état lu/non-lu.
- Proprio peut activer "Mode vacances" → annonces masquées des résultats publics.
- Timeline post-location visible chez proprio + locataire avec 4 étapes claires.
- Suggestions de réponses IA côté chat pour le locataire et le proprio (bouton "Répondre rapidement").
- Compteur vues annonce publique + nb de candidats visible sur la fiche.
- Photos uploadées passent par un endpoint serveur qui strip l'EXIF (pas de geo leak).
- Tout geste destructif a un "Annuler" 5 secondes (undo pattern pour suppressions).
- Toutes les vues async ont un empty state custom + skeleton (plus de "Chargement..." brut).

### Chantiers (ordre recommandé respectant les dépendances)

| # | Chantier | Plan | Effort | Dépend de |
|---|---|---|---|---|
| P1.1 | Resend — infra emails + templates | PLAN_resend_emails.md | 2 j | Phase 0 (monitoring pour attraper les fails) |
| P1.2 | Cloche notifications navbar | PLAN_notif_cloche_navbar.md | 1 j | — |
| P1.3 | Mode vacances proprio | PLAN_mode_vacances_proprio.md | 0.5 j | — |
| P1.4 | Timeline post-location 4 étapes | PLAN_timeline_post_location.md | 2 j | — |
| P1.5 | Suggestions réponses IA chat | PLAN_ia_chat_suggestions.md | 1.5 j | — |
| P1.6 | Compteur vues + candidats visible fiche | PLAN_compteur_vues_annonce.md | 0.5 j | — |
| P1.7 | Photos EXIF strip serveur | PLAN_photos_exif_strip.md | 1 j | — |
| P1.8 | Undo sur suppressions | PLAN_undo_suppressions.md | 1 j | — |
| P1.9 | Empty states + skeletons généralisés | PLAN_empty_states_skeletons.md | 1.5 j | — |
| P1.10 | Audit EDL / quittance dans thread messages | PLAN_edl_quittance_thread_audit.md | 1 j | — |

**Total effort** : 12 jours + marge = 4 semaines.

### Ressources externes à ouvrir

| Service | Pourquoi | Free tier | URL |
|---|---|---|---|
| **Resend** | Emails transactionnels | 3k emails/mois | https://resend.com/signup |
| **Domaine custom** (nestmatch.fr) | DNS pour Resend SPF/DKIM | Variable (~10 €/an) | Gandi / OVH |
| **Anthropic API** (déjà utilisée pour agent) | Suggestions IA chat | Pay as you go Claude Haiku 4.5 | https://console.anthropic.com/ |

### Secrets `.env` à ajouter

```bash
# Resend
RESEND_API_KEY=re_<clé>
RESEND_FROM_EMAIL=noreply@nestmatch.fr    # ou fallback onboarding@resend.dev
RESEND_FROM_NAME=NestMatch

# IA chat (déjà présent ?)
ANTHROPIC_API_KEY=sk-ant-...
```

### Budget mensuel estimé

| Service | Free | Payant |
|---|---|---|
| Resend | 3k emails/mois, 100/jour | 20 $/50k emails |
| Anthropic Haiku 4.5 (suggestions chat) | — | ~0,25 $/M input tokens · ~1,25 $/M output. Estimation réaliste : 5-10 $/mois à 1k users actifs. |
| Domaine | — | ~10 €/an (amortissable) |

**Total Phase 1 à l'arrivée** : **5-15 €/mois** selon volume. Très raisonnable.

### Checklist "Phase 1 terminée"

- [ ] Inscription nouveau compte → email vérification reçu en < 30 sec.
- [ ] Clic "Mot de passe oublié" → email magic link reçu.
- [ ] Locataire envoie un message → proprio reçoit email en < 1 min (si pas sur `/messages`).
- [ ] Proprio accepte un candidat → les autres candidats reçoivent email "désolé, bien loué".
- [ ] Loyer non confirmé après 10 du mois → locataire reçoit email rappel.
- [ ] Bail à 90 j de fin → proprio + locataire reçoivent email rappel.
- [ ] Clic cloche navbar : historique des 20 dernières notifs, état lu/non-lu.
- [ ] Toggle "Mode vacances" dans `/parametres` → `/annonces` n'affiche plus les biens du proprio.
- [ ] Après clic "Louer à ce candidat" : timeline 4 étapes visible chez proprio ET locataire.
- [ ] Dans `/messages`, bouton "Suggérer une réponse" → génère 3 options contextuelles en < 3 sec.
- [ ] Fiche annonce `/annonces/[id]` : "Vu X fois · Y candidatures" visible (déjà en backend, rendre visuel).
- [ ] Upload photo profil → EXIF stripé (testable via `exiftool` sur l'URL retournée).
- [ ] Suppression annonce → toast "Annulé" avec bouton undo pendant 5 sec.
- [ ] `/favoris` vide → empty state custom avec CTA "Découvrir les annonces".

---

## PHASE 2 — STRUCTURANT (8 semaines)

Objectif : **features lourdes qui changent le produit**. Plans détaillés à produire au début de Phase 2 (pas maintenant).

### Résumés chantiers Phase 2

#### P2.1 — PWA manifest + service worker + push (~5 jours)
Installer comme app native mobile. Service worker pour cache statiques + offline fallback. Notifs push navigateur (opt-in) pour nouveau message, nouvelle candidature, loyer confirmé. Complète Resend (push = instantané, email = persistant). Web-push standard + abonnements stockés en DB table `push_subscriptions`.

#### P2.2 — Signature électronique bail + EDL (OTP email) (~5 jours)
Proprio génère bail → envoie lien au locataire → OTP 6 chiffres par email → locataire signe → PDF régénéré avec tampon "Signé électroniquement le X par Y (IP / email / horodatage)". Pas du Yousign officiel mais probante pour bail amiable. Table `signatures` avec token, signé_at, ip_hash, email_signataire. Idem pour EDL.

#### P2.3 — Tests E2E Playwright (~4 jours)
5-6 parcours critiques : signup locataire → profil → candidature → reçue par proprio ; signup proprio → publier bien → recevoir candidature → accepter ; locataire reset password ; proprio génère bail + quittance ; locataire uploade dossier + partage lien. CI sur branche staging avec Supabase staging.

#### P2.4 — Design system tokens + primitifs (~6 jours)
`lib/tokens.ts` : couleurs, spacing, radius, typo, shadows.
Primitifs `<Button>`, `<Input>`, `<Card>`, `<Modal>`, `<Select>`, `<Chip>`, `<Badge>` dans `app/components/ui/`.
Migration progressive des pages (pas big bang). Pages prioritaires : `/parametres`, `/dossier`, `/annonces`, `/proprietaire`.

#### P2.5 — Icônes Lucide uniformisation (~2 jours)
Remplacer tous les SVG inline par `lucide-react`. Cohérence visuelle + taille bundle réduite (tree-shaking). Installer `lucide-react`, grep les `<svg>` inline, remplacer par `<Icon />` approprié.

#### P2.6 — Encadrement loyers auto Paris/Lyon/Lille (~3 jours)
Table `encadrement_loyers` (ville, quartier, type, nb_pieces, annee, meuble, loyer_max_m2). Seed data 2026 depuis data.gouv.fr. Au moment de publier une annonce, si ville encadrée → warning + suggestion prix max. Si dépassement, badge "Hors encadrement" visible locataire. Légal, protecteur juridique.

#### P2.7 — Blocage publication passoires DPE F/G (~1 jour)
Loi Climat : F interdite à la loc depuis 2025, G déjà interdite. Au moment de publier, si DPE ∈ {F, G} → modal blocant avec lien vers rénovations. Sauf loi spéciale (bail mobilité courte durée, meublé touristique, etc.).

#### P2.8 — Révision IRL automatique (~3 jours)
Table `baux` avec date_debut + loyer_initial + indice_ref_INSEE. Cron Vercel mensuel : détecte baux à réviser (anniversaire), calcule nouveau loyer via indice IRL à jour, envoie email au proprio "vous pouvez réviser" + bouton "Accepter nouveau montant". Compatible clauses de bail variables.

#### P2.9 — Quittance automatique post-paiement (~2 jours)
Actuellement : proprio clique "Confirmer loyer" → quittance générée. Automatiser : intégration webhook Stripe Connect (ou similar) quand paiement locataire → trigger auto-génération + envoi email. Nécessite paiement intégré. Sinon : cron hebdo qui génère les quittances pour les loyers confirmés mais sans quittance.

#### P2.10 — Audit logs (~2 jours)
Table `audit_logs` (user_email, action, resource_type, resource_id, payload_hash, ip_hash, created_at). Intercepter via middleware Next + hook API routes. Actions trackées : modif profil, suppression annonce, acceptation candidat, génération bail, upload doc sensible. Export CSV admin uniquement.

#### P2.11 — 2FA proprio TOTP (~3 jours)
Code Google Authenticator. Optionnel mais recommandé. Table `users.totp_secret`. Flow : proprio active → QR code → scan app → code à chaque login. Backup codes (10 codes à usage unique). Protection contre compromission compte avec biens en gestion.

#### P2.12 — Audit WCAG AA complet (~4 jours)
Lighthouse + axe DevTools. Corrections : `aria-labels`, contraste couleurs, focus visible, navigation clavier complète, skip-to-content, tailles police ajustables. Rapport final + badge accessibilité sur landing.

---

## PHASE 3 — CROISSANCE (10 semaines)

Objectif : **acquisition + crédibilité pour scaler**. Résumés seulement, plans à produire début Phase 3.

### Résumés chantiers Phase 3

#### P3.1 — Domaine custom nestmatch.fr (~1 jour)
Achat Gandi/OVH, DNS Vercel, SSL auto, redirect www → apex. SPF/DKIM/DMARC pour Resend. Purge toutes les URLs en dur vers l'ancien domaine Vercel.

#### P3.2 — Pages villes étoffées `/location/paris-15` (~5 jours)
Générer 50-100 pages optimisées SEO. Stats prix moyen, quartier, transports, 5 annonces vitrines, FAQ locale ("combien coûte un T2 à Lyon 7"). ISR avec revalidation journalière. Enrichit `/location/[ville]` existant.

#### P3.3 — Pages type × ville `/annonces/studio/lyon` (~5 jours)
Démultiplication SEO : type_bien × ville × min 10 résultats. Sitemap automatique. 200-500 pages potentielles.

#### P3.4 — OG images dynamiques Vercel OG (~2 jours)
Chaque annonce génère son OG image custom (photo + titre + prix). Utilisation `@vercel/og`. Meilleur CTR réseaux sociaux.

#### P3.5 — Rich snippets schema.org étendus (~2 jours)
Ajouter FAQPage, HowTo, BreadcrumbList, Review, Product, LocalBusiness. Compléter RealEstateListing. Star ratings dans SERP.

#### P3.6 — Blog SEO infra (~5 jours)
MDX dans `/content/blog/*`. Template `/blog/[slug]`. Sitemap auto. RSS feed. Auteur multi-support. Objectif 1 article/semaine : "Comment constituer un dossier locataire", "Les 5 erreurs proprio à éviter", "Guide fiscal revenus fonciers 2026", etc.

#### P3.7 — i18n FR/EN/ES avec next-intl (~6 jours)
Setup next-intl. Extraction strings → `messages/fr.json` + `messages/en.json` + `messages/es.json`. Switcher langue navbar. Prioriser : home, /annonces, /auth, /parametres. Les paragraphes légaux restent FR uniquement.

#### P3.8 — Intégration Visale API Action Logement (~5 jours)
Quand locataire éligible Visale (mobilité pro, jeune, étudiant), bouton "Demander ma garantie Visale". API actionlogement.fr. Score de confiance proprio +++ (garantie étatique). Revenus commission possible (~2% loyer).

#### P3.9 — Intégration DossierFacile import + export (~4 jours)
Locataire peut importer son dossier officiel DossierFacile (certifié ANIL) → remplit automatiquement. Export inverse : push du dossier NestMatch vers DossierFacile pour certification tierce. Badge "Certifié DossierFacile" très puissant côté proprio.

#### P3.10 — Badges profil (~2 jours)
Dossier complet · Garant Visale · Email vérifié · Téléphone vérifié · 1re location · 5 locations réussies · Réponse rapide (<24h) · Proprio actif. Visibles dans chat, dossier partagé, candidature.

#### P3.11 — Reviews bidirectionnelles locataire/proprio (~5 jours)
Post-bail (ou post-annulation propre), les deux parties peuvent se noter 1-5 étoiles + texte. Visible publiquement (opt-in) sur profil. Droit de réponse. Modération automatique mots offensants. Booste confiance marketplace.

#### P3.12 — Funnel analytics PostHog (~2 jours)
Événements métier : signup_completed, dossier_completed, candidature_sent, visite_proposed, location_accepted, bail_generated. Funnels & cohort retention. A/B tests framework. Free jusqu'à 1M events/mois.

---

## Synthèse budget mensuel 6 mois

| Poste | Phase 0 | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|---|
| Sentry | 0 € | 0 € | 26 $ (si growth) | 26 $ |
| Upstash | 0 € | 0 € | 0 € | ~5 $ |
| Supabase (free tier) | 0 € | 0 € | 25 $ (prod + staging) | 25 $ |
| Resend | — | 0 € | 20 $ (au-delà 3k) | 20 $ |
| Anthropic (suggestions IA) | — | ~5 $ | 15 $ | 30 $ |
| Vercel | 0 € | 0 € | 20 $ (Pro plan si besoin analytics) | 20 $ |
| Domaine nestmatch.fr | — | — | — | 1 €/mois amorti |
| PostHog | — | — | — | 0 € (1M free) |
| Visale API | — | — | — | Gratuit |
| **Total** | **0 €** | **~5 €** | **~100 $** | **~130 $** |

Raisonnable pour une plateforme sérieuse.

---

## Décisions business à trancher avant exécution

1. **Domaine custom** — nestmatch.fr est-il acheté ? Si non, le faire **maintenant** (blocker Phase 3.1 mais aussi Resend SPF/DKIM).
2. **Monétisation plan Pro** — on le lance en Phase 2 ou Phase 3 ? Plutôt Phase 3 pour pas diluer l'effort produit en Phase 2.
3. **i18n** — on fait vraiment ES dès Phase 3 ou seulement EN ? Si cible = France métropolitaine + Belgique + Suisse → FR suffit 12 mois. EN utile si expats Paris. ES : pas sûr, skip.
4. **Signature électronique** — OTP email (Phase 2) ou on part direct sur Yousign officiel (coût mais valeur juridique supérieure) ? OTP email = probant mais contestable en justice. Yousign = ~1 €/signature. **Avis : OTP en Phase 2, migrer vers Yousign si volume justifie.**
5. **Visale** — commission possible ~2% du loyer. Demande contrat avec Action Logement. Faisable ? À valider avec leur équipe commerciale avant Phase 3.8.
6. **DossierFacile** — partenariat à solliciter ou intégration API publique ? Vérifier si API ouverte ou accord requis.

---

## Ordre d'exécution global

Phase 0 → Phase 1 → Phase 2 → Phase 3, **sans chevauchement**. Chaque phase se termine par sa checklist avant de passer à la suivante. Si un chantier dépasse son budget temps de 50 %, on **arrête** et on review ce qui a bloqué avant de reprendre.

Les plans détaillés `PLAN_*.md` pour Phase 0 + Phase 1 sont à la racine. Phase 2 + 3 : plans à produire le moment venu.
