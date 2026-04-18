-- =============================================================================
-- 009_profils_nullable_fields.sql
--
-- Corrige un verrou hérité : la colonne `profils.nom` était NOT NULL, ce qui
-- bloque tout upsert partiel (ex : uploader une photo de profil quand le
-- dossier locataire n'a pas encore été rempli).
--
-- `email` reste la seule clé obligatoire (PK). Tous les autres champs de
-- contenu deviennent nullable — le client valide déjà les règles côté UI.
--
-- Idempotent : DROP NOT NULL est sûr à rejouer.
-- =============================================================================

-- On relâche les contraintes NOT NULL seulement si elles existent.
-- La forme ALTER COLUMN ... DROP NOT NULL est no-op si déjà nullable.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profils' AND column_name = 'nom' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE profils ALTER COLUMN nom DROP NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profils' AND column_name = 'telephone' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE profils ALTER COLUMN telephone DROP NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profils' AND column_name = 'situation_pro' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE profils ALTER COLUMN situation_pro DROP NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profils' AND column_name = 'profil_locataire' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE profils ALTER COLUMN profil_locataire DROP NOT NULL;
  END IF;
END $$;

-- Force PostgREST à recharger le schéma (sinon l'API cache l'ancienne contrainte)
NOTIFY pgrst, 'reload schema';
