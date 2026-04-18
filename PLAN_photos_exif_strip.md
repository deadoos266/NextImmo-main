# PLAN — Strip EXIF photos (annonces + avatars) côté serveur

## 1. Contexte et objectif
Toute photo uploadée (annonce, avatar) contient des métadonnées EXIF dont **géolocalisation GPS** précise si prise au smartphone. Risque : leak adresse locataire (avatar pris chez soi) ou proprio (photos annonce = localisation exacte même si l'annonce cache le numéro de rue). Strip EXIF côté serveur avant stockage.

## 2. Audit de l'existant

- Upload avatar : `/api/account/avatar/route.ts` — passe bytes directement à Supabase Storage. Aucun strip.
- Upload photo annonce : client direct à Storage via `supabase.storage.from("annonces-photos").upload(...)` dans `app/proprietaire/ajouter/page.tsx`. Aucun strip.
- Upload photos EDL : idem.

## 3. Fichiers impactés

| Fichier | Statut | Changement |
|---|---|---|
| `nestmatch/lib/imageSanitize.ts` | **NOUVEAU** | Fonction `sanitizeImage(bytes, mime)` → strip EXIF + re-encode. |
| `nestmatch/app/api/account/avatar/route.ts` | MODIF | Passer bytes par `sanitizeImage` avant upload. |
| `nestmatch/app/api/proprietaire/photo/route.ts` | **NOUVEAU** | Upload photo annonce via API serveur (au lieu de direct client). Strip EXIF. |
| `nestmatch/app/api/edl/photo/route.ts` | **NOUVEAU** | Idem pour photos EDL. |
| `nestmatch/app/proprietaire/ajouter/page.tsx` | MODIF | Remplacer upload direct par `fetch('/api/proprietaire/photo', FormData)`. |
| `nestmatch/app/proprietaire/edl/[id]/page.tsx` | MODIF | Idem pour photos EDL. |

## 4. Migrations SQL
**Aucune**.

## 5. Variables d'env
**Aucune**.

## 6. Dépendances

```bash
cd nestmatch
npm install sharp
```

`sharp` : lib image processing native Node, très rapide (utilisée par Vercel). Strip metadata + redimensionnement + re-encode en une fonction.

Sur Windows certaines versions `sharp` posent problème. Si blocage :
```bash
npm install --os=linux --cpu=x64 sharp
# ou
npm install sharp --include=optional
```

## 7. Étapes numérotées

### Bloc A — Lib `sanitizeImage`
1. Créer `lib/imageSanitize.ts` :
    ```ts
    import sharp from "sharp"

    type SanitizeOpts = {
      maxWidth?: number      // default 2000
      maxHeight?: number     // default 2000
      format?: "jpeg" | "webp"   // default jpeg (compat max)
      quality?: number       // default 85
    }

    type SanitizeResult = {
      bytes: Buffer
      mime: string
      width: number
      height: number
      size: number
    }

    export async function sanitizeImage(input: Buffer, opts: SanitizeOpts = {}): Promise<SanitizeResult> {
      const maxW = opts.maxWidth ?? 2000
      const maxH = opts.maxHeight ?? 2000
      const format = opts.format ?? "jpeg"
      const quality = opts.quality ?? 85

      let pipeline = sharp(input, { failOn: "truncated" })
        .rotate()  // honore EXIF orientation puis strip tout (sinon photo tournée)
        .resize({ width: maxW, height: maxH, fit: "inside", withoutEnlargement: true })
        // .rotate() ci-dessus lit EXIF orientation. Ensuite on re-encode sans metadata.

      if (format === "jpeg") {
        pipeline = pipeline.jpeg({ quality, progressive: true, mozjpeg: true })
      } else {
        pipeline = pipeline.webp({ quality })
      }

      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true })
      // sharp ne conserve PAS les metadata par défaut sauf si on appelle .withMetadata()
      // Donc l'EXIF est automatiquement strippé. Vérifier via exiftool sur le résultat.

      return {
        bytes: data,
        mime: format === "jpeg" ? "image/jpeg" : "image/webp",
        width: info.width,
        height: info.height,
        size: data.length,
      }
    }
    ```

### Bloc B — Avatar route modif
2. Ouvrir `app/api/account/avatar/route.ts`. Après `checkMagic(bytes, file.type)` :
    ```ts
    import { sanitizeImage } from "@/lib/imageSanitize"

    // ...

    const sanitized = await sanitizeImage(Buffer.from(bytes), { maxWidth: 512, maxHeight: 512, format: "webp", quality: 90 })
    // Upload le buffer sanitized à la place de bytes
    const path = `${email}/avatar.webp`  // ext forcée webp maintenant
    const { error: upErr } = await supabaseAdmin.storage
      .from("avatars")
      .upload(path, sanitized.bytes, { contentType: sanitized.mime, upsert: true })
    ```
3. Adapter les contenus `ALLOWED_EXT` pour ne plus se baser sur type MIME mais toujours sortir en webp.

### Bloc C — Photo annonce : API route
4. Créer `app/api/proprietaire/photo/route.ts` POST :
    ```ts
    export async function POST(req: NextRequest) {
      const session = await getServerSession(authOptions)
      const email = session?.user?.email?.toLowerCase()
      if (!email) return NextResponse.json({ error: "Auth requise" }, { status: 401 })

      // Rate-limit 50 uploads / heure
      const ip = getClientIp(req.headers)
      const rl = await checkRateLimitAsync(`photo-upload:${email}:${ip}`, { max: 50, windowMs: 60 * 60 * 1000 })
      if (!rl.allowed) return NextResponse.json({ error: "Trop d'uploads" }, { status: 429 })

      let form: FormData
      try { form = await req.formData() } catch { return NextResponse.json({ error: "multipart requis" }, { status: 400 }) }

      const file = form.get("file")
      if (!(file instanceof File)) return NextResponse.json({ error: "Fichier manquant" }, { status: 400 })
      if (file.size === 0 || file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Fichier invalide" }, { status: 413 })

      const bytes = Buffer.from(await file.arrayBuffer())

      // Magic bytes check
      if (!checkMagic(bytes, file.type)) return NextResponse.json({ error: "Contenu invalide" }, { status: 400 })

      // Sanitize EXIF + redimensionner
      const sanitized = await sanitizeImage(bytes, { maxWidth: 2000, maxHeight: 2000, format: "jpeg", quality: 85 })

      const ts = Date.now()
      const rand = Math.random().toString(36).slice(2, 10)
      const path = `${email}/${ts}_${rand}.jpg`

      const { error } = await supabaseAdmin.storage
        .from("annonces-photos")
        .upload(path, sanitized.bytes, { contentType: "image/jpeg", upsert: false })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const { data: urlData } = supabaseAdmin.storage.from("annonces-photos").getPublicUrl(path)
      return NextResponse.json({ ok: true, url: urlData.publicUrl })
    }
    ```
5. Factoriser `checkMagic` dans `lib/fileValidation.ts` server version si pas déjà fait.

### Bloc D — Migration côté client annonce
6. `app/proprietaire/ajouter/page.tsx` : fonction `uploadPhoto(file)`. Remplacer l'appel direct `supabase.storage.from("annonces-photos").upload(...)` par :
    ```ts
    const form = new FormData()
    form.append("file", file)
    const res = await fetch("/api/proprietaire/photo", { method: "POST", body: form })
    const json = await res.json()
    if (res.ok && json.ok) setPhotos(prev => [...prev, json.url])
    else setPhotoError(json.error || "Upload échoué")
    ```
7. Idem pour `/proprietaire/modifier/[id]/page.tsx` si edit.

### Bloc E — Photos EDL
8. Créer `/api/edl/photo/route.ts` même pattern (auth + sanitize + upload bucket `edl-photos` si dédié, sinon `annonces-photos`).
9. Migrer `app/proprietaire/edl/[id]/page.tsx` côté client.

### Bloc F — Tests
10. Tests unitaires `lib/imageSanitize.test.ts` :
    - Image JPEG avec EXIF GPS → output zéro EXIF.
    - Image 4000×3000 → resize 2000×1500.
    - Image corrompue → throw.
11. Vérif manuelle : uploader un JPEG smartphone (avec GPS EXIF), télécharger la version servie, `exiftool photo.jpg` → aucun tag EXIF.

### Bloc G — Nettoyage anciens buckets
12. **Optionnel** : script one-shot qui parcourt les photos existantes, re-process les plus anciennes (qui contiennent encore EXIF). Pas essentiel Phase 1.

## 8. Pièges connus

- **`sharp` sur Vercel** : supporté nativement, mais le binaire doit matcher linux x64. Ne pas committer `node_modules/sharp` (gros). Vercel build auto.
- **Upload direct client vs API** : le flow actuel client direct est rapide mais sans contrôle. Passer par API route = ++sécurité, ++contrôle, mais 2x bande passante (client→serveur→storage). Acceptable vu taille photos.
- **Re-encode perte qualité** : quality 85 JPEG = bon compromis, visuellement imperceptible sur photo.
- **Progressive JPEG + MozJPEG** : compression ~20 % meilleure que standard sans perte perceptible.
- **WebP vs JPEG** : WebP économise 25-30 % bande mais compat vieux browsers limitée. Laisser JPEG pour annonces (compat max), WebP pour avatars (récents).
- **Fichier HEIC** (iPhone) : sharp le gère si compilé avec libheif. Si pas dispo, refuser HEIC en frontend (mimes autorisés).
- **Magic bytes re-verify après sanitize** : pas nécessaire, le buffer de sharp est fiable.
- **Rate-limit photo upload** : 50/h/user/IP. Anti-DOS mais permissif pour vraie session d'ajout d'annonce (10-15 photos).

## 9. Checklist "c'est fini"

- [ ] `sharp` installé.
- [ ] `lib/imageSanitize.ts` créé avec tests.
- [ ] `/api/account/avatar` passe par sanitize → output webp 512px.
- [ ] `/api/proprietaire/photo` créé, rate-limit, sanitize, output jpeg 2000px.
- [ ] `/api/edl/photo` créé ou route factorisée.
- [ ] `app/proprietaire/ajouter/page.tsx` migré (plus de upload direct client).
- [ ] `app/proprietaire/modifier/[id]/page.tsx` migré.
- [ ] `app/proprietaire/edl/[id]/page.tsx` migré.
- [ ] Test exiftool sur une photo uploadée → zéro tag EXIF GPS.
- [ ] Tests unitaires passent.
- [ ] `tsc --noEmit` OK, `npm run build` OK.

---

**Plan MIXTE** :

- ⚠️ **EXÉCUTION OPUS UNIQUEMENT** : Blocs A (lib sanitize), B (avatar route), C (photo annonce route), E (EDL route) — sensible : si mauvaise config sharp, photos corrompues, upload cassé, PII leak continue. Magic bytes + auth + rate-limit critiques.
- **OK pour Sonnet** : Blocs D (client migration), F (tests), G (cleanup).
