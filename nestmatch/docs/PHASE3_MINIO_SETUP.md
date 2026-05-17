# Phase 3 — Migration Storage Supabase → MinIO

État : code **livré (V97.39.20)**, activation **~2-3h le jour J** quand Paul prêt.

## Pour quoi

Supabase Storage = 1 GB gratuit puis $0.021/GB/mois + $0.09/GB egress. KeyMatch consomme actuellement ~500 MB (photos annonces, dossier docs, baux signés, EDL photos, quittances). MinIO self-host sur le VPS = 0€, RGPD-natif (data sur VPS UE), pas de coupure si Supabase change ses TOS.

## Architecture livrée

```
22+ call sites Supabase Storage  →  import { upload, getPublicUrl, ... } from "@/lib/storage"
                                                            │
                                                            ▼
                                              lib/storage/index.ts (dispatcher)
                                                            │
                                          ┌─────────────────┴─────────────────┐
                                          ▼                                   ▼
                              STORAGE_PROVIDER=supabase            STORAGE_PROVIDER=minio
                              (défaut)                             + MINIO_* env vars
                                          │                                   │
                                          ▼                                   ▼
                              supabaseAdmin.storage.from(b)        @aws-sdk/client-s3 PutObjectCommand
                                                                   media.keymatch-immo.fr (Caddy → MinIO)
```

Garde-fous :
- Si `STORAGE_PROVIDER=minio` mais creds absents → erreur claire à l'upload, pas crash silencieux
- Si SDK AWS pas installé → `lib/storage/minio.ts` log clair "npm install @aws-sdk/client-s3"
- Buckets publics (avatars, annonces-photos) cachés 1 an par Caddy
- Buckets privés (dossiers, baux, edl, quittances, messages-images, bug-screenshots) accessibles uniquement via signed URLs (TTL 1h défaut)
- `getActiveStorageProvider()` exposé pour /admin/operations diagnostics

## Migration des call sites — STATUS

⚠ **Les 22 fichiers qui appellent `supabase.storage.from(...)` ne sont PAS encore migrés** vers `@/lib/storage`. C'est un follow-up (V97.39.21+).

Pourquoi pas dans cette V : 22 call sites × refactor + tests = ~6h de boulot. Le dispatcher est en place, la migration se fait progressivement par domaine (avatars d'abord, puis annonces-photos, puis dossiers, puis baux, etc.) — comme on a fait pour le dispatcher email Resend → Brevo.

Pour migrer un call site :
```ts
// AVANT
import { supabaseAdmin } from "@/lib/supabase-server"
await supabaseAdmin.storage.from("avatars").upload(path, file, { contentType: "image/jpeg" })
const { data: { publicUrl } } = supabaseAdmin.storage.from("avatars").getPublicUrl(path)

// APRÈS
import { upload, getPublicUrl } from "@/lib/storage"
const res = await upload("avatars", path, file, { contentType: "image/jpeg" })
if (!res.ok) return Response.json({ error: res.error }, { status: 500 })
const publicUrl = getPublicUrl("avatars", path)
```

## Activation en prod (~2-3h)

Procédure détaillée : `tools/minio-vps/README.md`.

Résumé :

1. **VPS** : `cd tools/minio-vps && cp .env.example .env && nano .env` (set MINIO_ROOT_PASSWORD)
2. **VPS** : `sudo docker compose up -d` (init buckets auto via service `minio-init`)
3. **DNS OVH** : ajoute A records `media.keymatch-immo.fr` + `media-admin.keymatch-immo.fr` → IP VPS
4. **Caddy VPS** : `sudo cat tools/minio-vps/Caddyfile.fragment >> /etc/caddy/Caddyfile && sudo systemctl reload caddy`
5. **Data migration** : récupère S3 Access Keys depuis Supabase Dashboard, ajoute dans `.env`, puis `./scripts/migrate-from-supabase.sh`
6. **SQL rewrite URLs** : `psql -v dry_run=1 -f scripts/rewrite-storage-urls.sql` puis `-v dry_run=0`
7. **Vercel** : `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner` côté dev + commit/push
8. **Vercel env vars** : set `STORAGE_PROVIDER=minio`, `MINIO_ENDPOINT=https://media.keymatch-immo.fr`, `MINIO_PUBLIC_URL=...`, `MINIO_ACCESS_KEY=keymatch`, `MINIO_SECRET_KEY=<MINIO_ROOT_PASSWORD>` + redeploy
9. **Migrer les call sites** progressivement (un domaine à la fois, push après chaque)

Rollback à n'importe quelle étape : flip `STORAGE_PROVIDER=supabase` + redeploy.
Les fichiers Supabase restent intacts 30 jours.

## Bucket policies

| Bucket | Visibilité | Lecture anonyme via Caddy | Notes |
|---|---|---|---|
| `avatars` | Public | ✓ (cache 1 an) | Photos profil utilisateurs |
| `annonces-photos` | Public | ✓ (cache 1 an) | Photos annonces + EDL pièces |
| `dossiers` | Privé | ✗ (signed URLs) | CNI, fiches paie, garants — RGPD sensible |
| `baux` | Privé | ✗ | PDF baux signés eIDAS |
| `edl` | Privé | ✗ | PDF EDL signés |
| `quittances` | Privé | ✗ | PDF mensuels |
| `messages-images` | Privé | ✗ | Pièces jointes chat |
| `bug-screenshots` | Privé | ✗ | Screenshots admin uniquement |

## Coût

- MinIO data : 0€ (volume sur VPS-2 existant, 100 GB NVMe disponibles)
- Bandwidth : 0€ (sortie VPS OVH illimitée incluse)
- Backups : inclus dans `tools/postgres-vps/scripts/backup-daily.sh` (Phase 8) — tarball volume → upload B2/OVH

vs Supabase Storage : ~5 GB × 0,021€ + ~10 GB egress × 0,09€ = ~1€/mois. Marginal mais on retire une dépendance.

## Tests vitest

`__tests__/integration/storage-dispatcher.test.ts` : 14 tests vert (default supabase, flip minio, getActiveStorageProvider, upload/getPublicUrl/createSignedUrl/download/remove, MinIO sans SDK installé).

## Limites V1 (à reprendre plus tard)

- **Sharp côté MinIO** : pas de transformation à la volée (resize, webp conversion). Côté Supabase, `?width=400` marche via image proxy. Pour MinIO il faudrait ajouter `imgproxy` ou faire le resize côté Next.js avant upload. Workaround actuel : `next/image` avec `unoptimized={false}` fait le boulot côté Vercel/Next.
- **Versioning** : MinIO supporte le versioning de bucket mais on l'active pas par défaut. À considérer pour `baux/` (PDF baux signés — preuves légales).
- **Lifecycle policies** : pas configurées. À ajouter pour purger `bug-screenshots` > 90 jours, `messages-images` > 1 an, etc.
- **Multi-region** : MinIO single-node. Si VPS meurt, on perd 24h max grâce aux backups B2 (Phase 8). Pas de réplication multi-DC.

## Wiring Phase 8 backup

Le script `tools/postgres-vps/scripts/backup-daily.sh` tarball automatiquement `/srv/keymatch/minio-data` si présent (V97.39.20). Si Phase 3 pas activée, le check `[[ -d "${MINIO_DATA_DIR}" ]]` skip silencieusement.
