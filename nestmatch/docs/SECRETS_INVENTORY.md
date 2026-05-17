# KeyMatch Secrets Inventory

Inventaire centralisé des secrets KeyMatch — où ils sont stockés, qui y a accès, quand les rotater.

État vivant. À mettre à jour à chaque ajout/retrait de service ou rotation.

## Principes

1. **Aucun secret hardcodé dans Git** (à l'exception des templates `.env.example`).
2. **Tous les secrets prod** vivent dans 2 endroits :
   - Vercel Dashboard → Project Settings → Environment Variables (pour les services qui tournent sur Vercel)
   - `/etc/keymatch.env` sur le VPS OVH (root-readable, 600, après Phase 6)
3. **Backup des secrets** : password manager Paul (1Password / Bitwarden), pas en clair dans un fichier non chiffré.
4. **Rotation** : annuelle minimum. Immédiatement si fuite suspectée (logs publics, screenshot, etc.).
5. **Principe du moindre privilège** : chaque secret limité au scope nécessaire.

## Inventaire

### Auth & session

| Secret | Type | Vercel | VPS /etc/keymatch.env | Source | Rotation |
|---|---|:-:|:-:|---|---|
| `NEXTAUTH_SECRET` | HS256 sign key (32+ chars) | ✓ | ✓ | `openssl rand -base64 32` | Annuelle. ⚠ invalide toutes les sessions. |
| `GOOGLE_CLIENT_ID` | Public OAuth | ✓ | ✓ | Google Cloud Console | À la rigueur si client ID compromis |
| `GOOGLE_CLIENT_SECRET` | OAuth secret | ✓ | ✓ | Google Cloud Console → Credentials | Annuelle |

**Impact rotation `NEXTAUTH_SECRET`** : tous les users déconnectés. À faire en heure creuse + communication in-app.

### Database

| Secret | Type | Vercel | VPS | Source | Rotation |
|---|---|:-:|:-:|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public URL | ✓ | ✓ | Supabase Dashboard | Statique |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public JWT (RLS) | ✓ | ✓ | Supabase Dashboard | Si compromis |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypass RLS | ✓ | ✓ | Supabase Dashboard | Annuelle. Très sensible. |
| `DATABASE_URL` | Connection Postgres VPS (Phase 2) | ✓ | ✓ | Phase 2 setup | Annuelle |
| `POSTGRES_PASSWORD` | Postgres VPS | ✗ | tools/postgres-vps/.env | `openssl rand -base64 32` | Annuelle |

**Impact rotation `SUPABASE_SERVICE_ROLE_KEY`** : routes API admin failent jusqu'au redeploy. Faire en heure creuse.

### Storage

| Secret | Type | Vercel | VPS | Source | Rotation |
|---|---|:-:|:-:|---|---|
| `MINIO_ACCESS_KEY` | Public-ish (= MINIO_ROOT_USER) | ✓ | tools/minio-vps/.env | docker-compose | Annuelle |
| `MINIO_SECRET_KEY` | Secret (= MINIO_ROOT_PASSWORD) | ✓ | tools/minio-vps/.env | `openssl rand -base64 32` | Annuelle |

**Rotation** : update les 2 endroits en même temps + `docker compose down && up -d` + redeploy Vercel.

### Email

| Secret | Type | Vercel | VPS | Source | Rotation |
|---|---|:-:|:-:|---|---|
| `RESEND_API_KEY` | Resend API key | ✓ | ✓ (pour backup notif) | Resend Dashboard → API Keys | Annuelle |
| `BREVO_API_KEY` | Brevo API key v3 | ✓ | (pas utilisé côté VPS) | Brevo Dashboard → API Keys | Annuelle |

### Worker fetcher (Phase 1)

| Secret | Type | Vercel | VPS | Source | Rotation |
|---|---|:-:|:-:|---|---|
| `EXTERNAL_FETCHER_TOKEN` | Bearer Vercel→Worker | ✓ | tools/zendriver-worker/.env (`FETCHER_TOKEN`) | `openssl rand -hex 32` | Annuelle |
| `WORKER_CALLBACK_TOKEN` | Bearer Worker→Vercel | ✓ | tools/zendriver-worker/.env | `openssl rand -hex 32` | Annuelle |

**Synchronisation** : les 2 endroits doivent être updated en même temps (rotation V97.x : `tools/zendriver-worker/.env` puis Vercel env).

### Crons

| Secret | Type | Vercel | VPS | Source | Rotation |
|---|---|:-:|:-:|---|---|
| `CRON_SECRET` | Bearer auth crons | ✓ | ✓ /etc/keymatch.env | `openssl rand -hex 32` | Annuelle |

Avant Phase 9 : Vercel cron utilise CRON_SECRET. Après : systemd timers VPS le réutilisent. Pendant la transition : 1 seule valeur partagée.

### Rate-limit

| Secret | Type | Vercel | VPS | Source | Rotation |
|---|---|:-:|:-:|---|---|
| `UPSTASH_REDIS_REST_URL` | URL public | ✓ | ✓ | Upstash Console | Statique |
| `UPSTASH_REDIS_REST_TOKEN` | Token | ✓ | ✓ | Upstash Console → Database | Annuelle |

### Sentry

| Secret | Type | Vercel | VPS | Source | Rotation |
|---|---|:-:|:-:|---|---|
| `SENTRY_DSN` | DSN server-side | ✓ | ✓ | Sentry Dashboard → Project Settings → Client Keys | Si fuite |
| `NEXT_PUBLIC_SENTRY_DSN` | DSN client (public) | ✓ | ✓ | Idem | Si fuite |
| `SENTRY_AUTH_TOKEN` | Token source maps upload | ✓ (Production only) | (non utilisé) | Sentry → Account → API Tokens (scope project:releases) | Annuelle |

### Anthropic IA

| Secret | Type | Vercel | VPS | Source | Rotation |
|---|---|:-:|:-:|---|---|
| `ANTHROPIC_API_KEY` | API key Claude | ✓ | (utile si agent IA tourne VPS) | console.anthropic.com → Keys | Annuelle |

### Backups (Phase 8)

| Secret | Type | Vercel | VPS | Source | Rotation |
|---|---|:-:|:-:|---|---|
| `BACKBLAZE_KEY_ID` ou OVH | API key cloud | ✗ | rclone config + tools/postgres-vps/.env | Backblaze / OVH Manager | Annuelle |
| `BACKBLAZE_APPLICATION_KEY` ou OVH | Secret | ✗ | Idem | Idem | Annuelle |
| `BACKUP_NOTIFY_EMAIL` | Email (= tic3467@gmail.com) | ✗ | tools/postgres-vps/.env | Hardcoded Paul | Statique |

### Misc

| Secret | Type | Vercel | VPS | Source | Rotation |
|---|---|:-:|:-:|---|---|
| `DOSSIER_LOG_SALT` | HMAC salt (IP hash RGPD) | ✓ | ✓ | `openssl rand -hex 32` | **JAMAIS rotater en prod** (invaliderait les hashes historiques) |
| `CLAUDE_BRIEF_TOKEN` | Token blocages WebFetch | ✓ | (pas utile) | `openssl rand -hex 32` | À la rigueur |

## Procédures de rotation

### Routine annuelle (1× par an, ~30 min)
1. Génère nouveaux secrets pour : NEXTAUTH_SECRET, CRON_SECRET, EXTERNAL_FETCHER_TOKEN, WORKER_CALLBACK_TOKEN, RESEND_API_KEY, BREVO_API_KEY, UPSTASH_REDIS_REST_TOKEN, SENTRY_AUTH_TOKEN, GOOGLE_CLIENT_SECRET, MINIO_ROOT_PASSWORD, POSTGRES_PASSWORD, ANTHROPIC_API_KEY
2. Update Vercel + VPS /etc/keymatch.env en parallèle
3. Restart services concernés
4. Verify : test login + envoi email + cron manuel + dashboard health
5. Stocke les anciennes valeurs dans password manager 30 jours (rollback safety)
6. Communique 1× notif in-app si NEXTAUTH_SECRET changé (users vont devoir re-login)

### Rotation d'urgence (suite à fuite)
< 15 min :
1. Identifier le secret compromis (cf logs Sentry "Authorization header", screenshot user, etc.)
2. Génère nouveau secret
3. Update Vercel + VPS
4. Redeploy + restart
5. Forcer logout users si NEXTAUTH_SECRET : invalider les rows `sessions` Postgres + redeploy

### Audit
1× par trimestre, exécuter `grep -r "SECRET\|API_KEY\|TOKEN\|PASSWORD" docs/ scripts/` (worktree) pour vérifier qu'aucun secret n'a leaké.

## Audit Git history pour secrets exposés

```bash
# Cherche les patterns suspects dans tout l'history
git log --all -p | grep -E "(api[_-]?key|secret|password|token)[\"'\s]*=[\"'\s]*[A-Za-z0-9+/=]{20,}" -i

# Outil dédié (faux positifs probables, à filtrer)
docker run --rm -v $(pwd):/path zricethezav/gitleaks:latest detect --source /path
```

## Stockage Paul

| Endroit | Contenu | Backup |
|---|---|---|
| 1Password ou Bitwarden Paul | Tous les secrets en clair | Backup cloud chiffré + 2FA Paul |
| `~/.ssh/keymatch_vps` | Clé privée SSH VPS | Clé USB chiffrée + 1Password |
| Vercel Dashboard | Env vars production | Vercel cloud (pas de backup user-side) |
| `/etc/keymatch.env` sur VPS | Env vars VPS | Inclus dans backups Phase 8 (mais root-encrypted recommandé) |

## Checklist sécurité

- [ ] Aucun `.env` ou `.env.local` commit dans Git (vérif `.gitignore`)
- [ ] Vercel env vars marquées "Production" pour les secrets sensibles (pas exposées en preview)
- [ ] `/etc/keymatch.env` mode 600 root:root
- [ ] SSH key ed25519 (pas RSA), passphrase obligatoire
- [ ] Password auth SSH désactivé (`/etc/ssh/sshd_config.d/50-cloud-init.conf`)
- [ ] fail2ban actif (sshd jail)
- [ ] UFW : seuls 22/80/443 ouverts en externe
- [ ] HTTPS partout (Caddy auto Let's Encrypt)
- [ ] Sentry redact patterns : `authorization`, `cookie`, `x-amz-*`, `api-key`, etc.
- [ ] `DOSSIER_LOG_SALT` jamais changé en prod (preuve immuable IP→hash)
