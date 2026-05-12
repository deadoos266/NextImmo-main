-- V97.24 — Seed des release_validations pour la session V97.x
-- (commits 377f5a74 → 9112b18a, 20 commits sur main)
--
-- À appliquer une fois via Management API. Idempotent : ON CONFLICT (commit_sha) DO NOTHING.

INSERT INTO public.release_validations (commit_sha, commit_short, commit_title, commit_body, checks) VALUES

('377f5a74', '377f5a74', 'V97 — EDL importé : photos multi + PDF locataire + fix encoding PDF',
'3 demandes Paul : (1) Locataire peut télécharger PDF EDL importé, (2) Proprio peut uploader photos EDL à l''import, (3) Tout dispo dans /messages comme bail normal. Plus fix encoding PDF jsPDF (pdfStr helper).',
$$[
  {"id":"img-upload","label":"Import bail proprio : page /proprietaire/bail/importer accepte upload multi-photos EDL avec preview + bouton Retirer","status":"pending"},
  {"id":"banner-success","label":"Après import, redirect vers /proprietaire/bail/[id]?just_imported=1 avec banner vert 'Invitation envoyée'","status":"pending"},
  {"id":"locataire-pdf","label":"Locataire dans /mon-logement : badge 'Actif' + 'Signé hors plateforme · PDF fourni' + bouton Télécharger marche","status":"pending"},
  {"id":"edl-photos-locataire","label":"Page /edl/consulter/[id] côté locataire : bloc beige 'EDL signé hors plateforme' + bouton PDF + galerie photos","status":"pending"},
  {"id":"edl-card-messages","label":"Card EDL dans /messages : PDF + 3 vignettes photos + '+N' si > 3","status":"pending"},
  {"id":"pdf-encoding","label":"PDF généré (clic Télécharger PDF sur /edl/consulter) : accents s''affichent correctement (pas de '??' à la place)","status":"pending"}
]$$::jsonb),

('7ea2861a', '7ea2861a', 'V97.7-9 — Fix 4 bugs visibles sur /admin/health',
'EDL by-annonces 400 (URL >2KB avec 218 IDs), Leaflet markers 404, service Application timeline vide, diag Resend.',
$$[
  {"id":"edl-by-annonces","label":"/proprietaire avec 218+ annonces : pas d''erreur 400 dans la console (POST body au lieu de GET query)","status":"pending"},
  {"id":"leaflet","label":"/annonces et /profil (picker quartier) : pas de 404 sur /marker-icon-2x.png ou /marker-shadow.png","status":"pending"},
  {"id":"app-timeline","label":"/admin/health timeline 'Application' affiche des barres vertes (plus vide)","status":"pending"},
  {"id":"resend-incident","label":"Cliquer 'Résoudre' sur l''incident Resend 401 (faux positif d''après Paul)","status":"pending"}
]$$::jsonb),

('ad5faf73', 'ad5faf73', 'V97.10-11 — Bug report système (manuel + auto-capture)',
'Bouton 🐛 flottant + screenshot html2canvas + auto-capture window.onerror + auto-report 404/error/global + anonymes + rate-limit + scrub PII.',
$$[
  {"id":"manual-report","label":"Bouton 🐛 flottant en bas à droite : modale → écris description → screenshot inclus → POST /api/bugs/report → row dans /admin/bugs avec screenshot affiché","status":"pending"},
  {"id":"auto-js-error","label":"Console DevTools : throw new Error(''test'') → modale s''ouvre auto avec stack pré-rempli","status":"pending"},
  {"id":"auto-404-authed","label":"Aller sur /annonces/99999999 connecté → page 404 + row [Auto-404] dans /admin/bugs avec referrer","status":"pending"},
  {"id":"auto-404-anonyme","label":"Navigation privée → /annonces/9999 → row [Auto-404] avec user_role='anonymous'","status":"pending"},
  {"id":"console-network","label":"Dans /admin/bugs détail : sections 'Console' et 'Network errors' repliables avec contenus","status":"pending"}
]$$::jsonb),

('64f042ca', '64f042ca', 'P3-2 — Alertes matching locataire (toggle + cron + UI accordion + seuil custom)',
'P3-2.A toggle + cron quotidien email matching + default ON + seuil % configurable + filtre destinataires (skip proprios + locataires actifs) + UI accordion.',
$$[
  {"id":"accordion-ui","label":"/parametres → Compte : liste notifications est en accordion (1 cat ouverte, autres avec compteur X/Y actifs)","status":"pending"},
  {"id":"alertes-on-default","label":"Catégorie 'Alertes recherche' : toggle 'Nouvelles annonces' déjà ON","status":"pending"},
  {"id":"seuil-match","label":"Sous le toggle : sélecteur seuil 40-90% avec '60% (recommandé)' par défaut. Change le seuil → sauvegarde live","status":"pending"},
  {"id":"cron-manual","label":"Test cron manuel : curl /api/cron/alertes-matching avec Bearer CRON_SECRET → 200 + stats JSON","status":"pending"}
]$$::jsonb),

('a9bdad67', 'a9bdad67', 'P3-4.A + P3-4.C — Read receipts + recherche conv',
'V97.14 vv-tick live avec realtime UPDATE + tooltip Lu-à-HH-MM + V97.17 search sticky dans la conv + V97.19 UX 2 search bars.',
$$[
  {"id":"read-receipt-live","label":"2 comptes ouverts : envoyer message côté A → ✓ → l''autre ouvre la conv → côté A le ✓ devient ✓✓ EN LIVE sans F5","status":"pending"},
  {"id":"read-receipt-tooltip","label":"Hover sur ✓✓ (desktop) ou tap (mobile) → tooltip/popover 'Lu à HH:MM'","status":"pending"},
  {"id":"search-in-conv","label":"Ouvrir une conv → search bar sticky en haut visible. Taper un mot → filter live + compteur résultats","status":"pending"},
  {"id":"ctrl-f","label":"Ctrl+F (ou Cmd+F) dans une conv → focus auto sur la search bar","status":"pending"},
  {"id":"sidebar-placeholder","label":"Search bar gauche : placeholder dit 'Filtrer les conversations (nom, bien, mot-clé)…'","status":"pending"}
]$$::jsonb),

('1691a9c9', '1691a9c9', 'V97.18 — Audit responsive mobile (8 bugs fixés)',
'Read receipt popover tap mobile, bouton X search 36px, fontSize 16 mobile anti-zoom iOS, checkbox bug report width/height, modale 90dvh, etc.',
$$[
  {"id":"mobile-search-input","label":"iPhone Safari sur /messages : tape dans la search bar → PAS de zoom auto (fontSize 16)","status":"pending"},
  {"id":"mobile-read-tap","label":"iPhone : tap sur ✓✓ → popover noir 'Lu à HH:MM' 3s","status":"pending"},
  {"id":"mobile-bug-modal","label":"iPhone : clic 🐛 → modale ne dépasse pas le clavier ouvert","status":"pending"},
  {"id":"mobile-accordion","label":"iPhone /parametres : accordion tap target OK, select seuil n''ouvre pas le zoom auto","status":"pending"}
]$$::jsonb),

('67017b0d', '67017b0d', 'P3-4.D — Images dans messages',
'V97.20 bucket privé messages-images + RLS + signed URL auth-gated + bouton 📎 + compression auto + rendering bubble + fix bypass auto-référence.',
$$[
  {"id":"upload-image","label":"Composer → bouton trombone → choisis image (jpg/png/webp ≤10 MB) → apparaît en bubble côté A","status":"pending"},
  {"id":"compress-auto","label":"Upload image > 2 MB → placeholder 'Envoi image en cours…' (compression JPEG q=0.85)","status":"pending"},
  {"id":"realtime-image","label":"2 comptes ouverts : B reçoit l''image via Realtime (apparaît automatiquement)","status":"pending"},
  {"id":"fullscreen-tap","label":"Tap sur image dans bubble → ouvre fullscreen dans nouvel onglet (signed URL 1h)","status":"pending"}
]$$::jsonb),

('a84158b0', 'a84158b0', 'T3 — Untrack 7686 fichiers node_modules + caches',
'Cleanup repo : node_modules/, tsconfig.tsbuildinfo, .claude/settings.local.json sortis du tracking git. Filesystem intact (--cached).',
$$[
  {"id":"repo-clean","label":"git status local : plus de fichiers node_modules listés comme tracked. Les push sont plus rapides","status":"pending"}
]$$::jsonb),

('5b1e4c31', '5b1e4c31', 'P3-12.A — Pack multi-documents ZIP download',
'/api/bail/[annonceId]/zip qui assemble bail PDF + annexes ALUR + EDL d''entrée + photos. Auth, rate-limit, SSRF whitelist, memory cap.',
$$[
  {"id":"zip-proprio","label":"/proprietaire/bail/[id] (bail avec PDF) → bouton 'Tout télécharger (.zip)' → DL un ZIP","status":"pending"},
  {"id":"zip-locataire","label":"/mon-logement → bouton 'Tout télécharger (.zip)' → DL un ZIP","status":"pending"},
  {"id":"zip-content","label":"Ouvrir le ZIP → bail.pdf + annexes/ + edl-entree.pdf + edl-photos/ + README.txt","status":"pending"}
]$$::jsonb),

('4a4e6fdb', '4a4e6fdb', 'P3-11 — Export RGPD complet',
'Article 20 RGPD. /api/account/export-complete ZIP avec profil + messages + candidatures + dossier + visites + loyers + EDLs + annonces + notifs. Limite 5/jour.',
$$[
  {"id":"export-button","label":"/parametres → Compte → section 'Mes données' : 2 boutons distincts (Export complet ZIP + Profil seul JSON)","status":"pending"},
  {"id":"export-zip-content","label":"Clic 'Export complet' → DL ZIP avec 9 JSON + README.txt avec références RGPD art. 20","status":"pending"},
  {"id":"export-rate-limit","label":"6 exports en 24h → erreur 429 'Limite quotidienne atteinte (5/jour)'","status":"pending"}
]$$::jsonb),

('9112b18a', '9112b18a', 'Doc — Protocole VERIFY enrichi (10 étapes)',
'Ajout étape next build, vérif colonnes SQL via Management API, vitest ciblé sur tests touchés. Historique des bugs catchés.',
$$[
  {"id":"claude-md","label":"Le fichier nestmatch/CLAUDE.md (en bas) contient le protocole 10 étapes avec exemples concrets","status":"pending"}
]$$::jsonb)

ON CONFLICT (commit_sha) DO NOTHING;
