# KeyMatch — Contexte projet pour Claude Code

## Stack
Next.js 15 (App Router) · Supabase · NextAuth Google · TypeScript · Tailwind désactivé (inline styles uniquement)

## Env (.env.local)
Voir `.env.example` pour la liste des variables requises. Les valeurs sont stockées dans `.env.local` (gitignored) en dev et dans les variables d'environnement Vercel en prod. **Ne jamais committer de valeurs réelles ici.**

## Structure fichiers
```
app/
  layout.tsx          → Providers + Navbar (une seule navbar globale)
  providers.tsx       → SessionProvider + RoleContext (localStorage)
  page.tsx            → Accueil
  annonces/
    page.tsx          → Liste annonces + filtres + score matching
    [id]/
      page.tsx        → Fiche annonce (server component)
      ScoreBlock.tsx  → Score compatibilité (client, selon rôle)
      ContactButton.tsx → Crée thread message + redirige
  profil/page.tsx     → Profil locataire (critères matching)
  proprietaire/
    page.tsx          → Dashboard 4 onglets
    ajouter/page.tsx  → Formulaire ajout bien
    stats/page.tsx    → Stats financières par bien (?id=)
  messages/page.tsx   → Chat (?with=email)
  admin/page.tsx      → Dashboard admin (code: nestmatch2024)
  components/
    Navbar.tsx        → Sticky, switcher rôle persistant, dropdown avatar
lib/
  matching.ts         → Algo score sur 1000pts (filtres durs + score qualité)
  supabase.ts         → Client Supabase
```

## Supabase — Tables
**profils** (PK: email) : email, nom, ville_souhaitee, mode_localisation (strict/souple), budget_max, budget_min, surface_min, surface_max, pieces_min, chambres_min, animaux, meuble, parking, cave, fibre, balcon, terrasse, jardin, ascenseur, dpe_min, type_bail, etage_min, etage_max, rez_de_chaussee_ok, situation_pro, revenus_mensuels, garant, type_garant, nb_occupants, fumeur, profil_locataire, proximite_metro, proximite_ecole, proximite_commerces, proximite_parcs, temps_trajet_max, mode_transport, type_quartier, preferences_implicites (JSON)

**annonces** (PK: id identity) : id, titre, ville, adresse, prix, charges, caution, surface, pieces, chambres, etage, dispo, meuble, animaux, parking, cave, fibre, balcon, terrasse, jardin, ascenseur, dpe, description, proprietaire, proprietaire_email, membre, verifie, statut, type_bien, locataire_email, date_debut_bail, mensualite_credit, valeur_bien

**messages** (PK: id identity) : id, from_email, to_email, contenu, lu (bool), annonce_id, type, created_at

**loyers** (PK: id identity) : id, proprietaire_email, locataire_email, annonce_id, titre_bien, mois, montant, statut, date_confirmation

## Logique métier clé

### Rôles (RoleContext dans providers.tsx)
- `role`: "locataire" | "proprietaire" → persisté localStorage
- `isAdmin`: bool → persisté localStorage, activé via /admin + code
- Navbar switche le rôle ET redirige vers le bon espace

### Matching (lib/matching.ts)
**Filtres durs (estExclu)** :
- mode strict + ville différente → exclu
- prix > budget_max * 1.20 → exclu
- profil.animaux=true + annonce.animaux=false → exclu

**Score sur 1000** (calculerScore) :
- Budget: 300pts max (cap bonus 330, courbe convexe)
- Surface: 270pts (exposant 2.5 sous le min)
- Pièces: 150pts
- Meublé: 100pts (mismatch=40, jamais 0)
- Équipements: 100pts (plancher 40)
- DPE: 50pts
- Coefficient cohérence si surface+pièces insuffisants
- Bonus adaptatif via preferences_implicites JSON (multiplicateur ×1.02/1.03)
- Sécurité: Math.max(0, Math.min(score, 1000))
- Profil vide → 500 (neutre)

**Affichage** : score/10 pour afficher en %
**Labels** : 900+ Excellent · 750+ Très bon · 600+ Bon · 400+ Moyen · <400 Faible

### Score côté proprio
ScoreBlock détecte role === "proprietaire" → affiche qualité annonce (description, DPE, prix) au lieu du score matching

### Contact / Messagerie
ContactButton.tsx : vérifie si thread existe → sinon crée msg auto → router.push("/messages?with=email")
Messages page : accepte ?with= param pour ouvrir directement la bonne conv

## Règles code importantes
- JAMAIS de <nav> dans les pages → uniquement dans layout.tsx via Navbar
- Composants Toggle/Sec/F définis HORS des fonctions React (évite bug perte de focus)
- Pas de Tailwind → inline styles uniquement
- Design: fond #F7F4EF, noir #111, cartes blanches border-radius 20px
- Score affiché: Math.round(score / 10) + "%"

## Prochaines features prévues
1. Dossier locataire (upload docs, score complétude)
2. Bail + EDL auto-généré
3. Quittances PDF
4. Scraping annonces externes
