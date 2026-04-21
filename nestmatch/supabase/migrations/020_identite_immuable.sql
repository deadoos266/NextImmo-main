-- ═══════════════════════════════════════════════════════════════════
-- Migration 020 — Champs identité IMMUABLES après verrouillage.
-- ═══════════════════════════════════════════════════════════════════
--
-- Suite de la migration 018 qui avait introduit `profils.prenom` et le
-- soft-split du nom complet. Cette migration rend prenom + nom figés
-- après confirmation explicite sur /onboarding/identite.
--
-- Stratégie :
--   1. Ajoute `identite_verrouillee` (bool, default false) + timestamp
--   2. Ré-exécute le soft-split idempotent (ceinture + bretelles : si
--      018 n'avait pas été appliquée, 020 seule suffit)
--   3. Trigger BEFORE UPDATE qui lève une exception si prenom ou nom
--      change alors que identite_verrouillee = TRUE, ou si quelqu'un
--      tente de remettre le flag à FALSE côté client.
--
-- Override support (correction manuelle sur demande user) :
--   BEGIN;
--     SET LOCAL session_replication_role = replica;  -- bypass trigger
--     UPDATE profils SET prenom = 'X', nom = 'Y'
--       WHERE email = 'user@example.com';
--     -- trace l'opération dans vos logs audit
--   COMMIT;
--
-- Rollback :
--   DROP TRIGGER IF EXISTS trg_protect_identite_immuable ON profils;
--   DROP FUNCTION IF EXISTS protect_identite_immuable();
--   ALTER TABLE profils DROP COLUMN identite_verrouillee,
--                       DROP COLUMN identite_confirmee_le;
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE profils
  ADD COLUMN IF NOT EXISTS identite_verrouillee boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS identite_confirmee_le timestamptz;

-- Sécurité si 018 n'avait pas été appliquée : relance le soft-split.
-- Idempotent : ne touche aucune ligne déjà splittée.
ALTER TABLE profils ADD COLUMN IF NOT EXISTS prenom text;

UPDATE profils
SET
  prenom = split_part(nom, ' ', 1),
  nom    = NULLIF(substring(nom from position(' ' in nom) + 1), '')
WHERE prenom IS NULL
  AND nom IS NOT NULL
  AND nom LIKE '% %';

-- Trigger : refuse toute modif identité après verrouillage.
CREATE OR REPLACE FUNCTION protect_identite_immuable()
RETURNS trigger AS $$
BEGIN
  IF OLD.identite_verrouillee = true
     AND (NEW.prenom IS DISTINCT FROM OLD.prenom
          OR NEW.nom IS DISTINCT FROM OLD.nom) THEN
    RAISE EXCEPTION 'IDENTITE_VERROUILLEE: prenom et nom ne sont plus modifiables après confirmation (contact@keymatch-immo.fr pour correction)';
  END IF;
  IF OLD.identite_verrouillee = true
     AND NEW.identite_verrouillee = false THEN
    RAISE EXCEPTION 'IDENTITE_VERROUILLEE: impossible de déverrouiller l''identité côté client';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_identite_immuable ON profils;
CREATE TRIGGER trg_protect_identite_immuable
  BEFORE UPDATE ON profils
  FOR EACH ROW EXECUTE FUNCTION protect_identite_immuable();

COMMENT ON COLUMN profils.identite_verrouillee IS
  'TRUE = identité confirmée sur /onboarding/identite, plus modifiable en self-service (trigger protect_identite_immuable).';
COMMENT ON COLUMN profils.identite_confirmee_le IS
  'Timestamp de la confirmation. Audit RGPD.';

NOTIFY pgrst, 'reload schema';
