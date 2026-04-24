-- ═══════════════════════════════════════════════════════════════════
-- À COLLER DANS SUPABASE SQL EDITOR (prod) — MAINTENANT
-- ═══════════════════════════════════════════════════════════════════
-- Dashboard → SQL Editor → New query → coller tout ce fichier → Run.
--
-- Applique les migrations 019 + 020 d'un coup. Idempotent (IF NOT EXISTS
-- partout) → sûr même si une partie a déjà tourné.
--
-- Diagnostic exécuté 2026-04-21 :
--   profils.nom                    → EXISTE
--   profils.prenom                 → MANQUE
--   profils.identite_verrouillee   → MANQUE
--   profils.identite_confirmee_le  → MANQUE
-- ═══════════════════════════════════════════════════════════════════

-- ─── Migration 019 : document_key sur dossier_access_log ───────────
ALTER TABLE dossier_access_log
  ADD COLUMN IF NOT EXISTS document_key text;

COMMENT ON COLUMN dossier_access_log.document_key IS
  'Clé de la pièce consultée (ex: identite, bulletins). NULL = vue de la page partage. Purgé à 90 jours.';

-- ─── Migration 020 : identité immuable ─────────────────────────────
ALTER TABLE profils
  ADD COLUMN IF NOT EXISTS identite_verrouillee boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS identite_confirmee_le timestamptz;

ALTER TABLE profils ADD COLUMN IF NOT EXISTS prenom text;

UPDATE profils
SET
  prenom = split_part(nom, ' ', 1),
  nom    = NULLIF(substring(nom from position(' ' in nom) + 1), '')
WHERE prenom IS NULL
  AND nom IS NOT NULL
  AND nom LIKE '% %';

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

-- ─── Vérification post-apply (à ré-exécuter après le Run ci-dessus) ─
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'profils'
--    AND column_name IN ('prenom', 'identite_verrouillee', 'identite_confirmee_le');
-- SELECT tgname FROM pg_trigger WHERE tgname = 'trg_protect_identite_immuable';
