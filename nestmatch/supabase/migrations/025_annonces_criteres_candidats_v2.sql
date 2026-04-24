-- ============================================================================
-- Migration 025 — R10.6 Critères candidats v2 + équipements étendus
-- ============================================================================
-- Ajoute les critères non-discriminants bonus-only au matching :
--   • age_min / age_max (int 18-99) → borne d'âge recherchée
--   • max_occupants (int 1-20)      → plafond foyer
--   • animaux_politique (text)      → 'indifferent'|'oui'|'non'
--   • fumeur_politique  (text)      → 'indifferent'|'oui'|'non'
-- Et le sac d'équipements libre :
--   • equipements_extras (jsonb)    → { lave_linge: true, wifi: true, ... }
--
-- 100% idempotent — safe to re-run. Les critères discriminants protégés par la
-- loi (enfants, situation familiale, nationalité, origine, religion,
-- orientation) ne sont volontairement PAS ajoutés — matching.ts les ignore.
-- ============================================================================

ALTER TABLE annonces
  ADD COLUMN IF NOT EXISTS age_min              integer,
  ADD COLUMN IF NOT EXISTS age_max              integer,
  ADD COLUMN IF NOT EXISTS max_occupants        integer,
  ADD COLUMN IF NOT EXISTS animaux_politique    text,
  ADD COLUMN IF NOT EXISTS fumeur_politique     text,
  ADD COLUMN IF NOT EXISTS equipements_extras   jsonb DEFAULT '{}'::jsonb;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_annonces_animaux_politique') THEN
    ALTER TABLE annonces ADD CONSTRAINT chk_annonces_animaux_politique
      CHECK (animaux_politique IS NULL OR animaux_politique IN ('indifferent', 'oui', 'non'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_annonces_fumeur_politique') THEN
    ALTER TABLE annonces ADD CONSTRAINT chk_annonces_fumeur_politique
      CHECK (fumeur_politique IS NULL OR fumeur_politique IN ('indifferent', 'oui', 'non'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_annonces_age_range') THEN
    ALTER TABLE annonces ADD CONSTRAINT chk_annonces_age_range
      CHECK ((age_min IS NULL OR (age_min >= 18 AND age_min <= 99))
         AND (age_max IS NULL OR (age_max >= 18 AND age_max <= 99))
         AND (age_min IS NULL OR age_max IS NULL OR age_min <= age_max));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_annonces_max_occupants') THEN
    ALTER TABLE annonces ADD CONSTRAINT chk_annonces_max_occupants
      CHECK (max_occupants IS NULL OR (max_occupants >= 1 AND max_occupants <= 20));
  END IF;
END $$;

COMMENT ON COLUMN annonces.age_min IS 'R10.6 — âge minimum recherché (non discriminant, bonus matching uniquement)';
COMMENT ON COLUMN annonces.age_max IS 'R10.6 — âge maximum recherché (non discriminant, bonus matching uniquement)';
COMMENT ON COLUMN annonces.max_occupants IS 'R10.6 — plafond foyer recherché (bonus matching uniquement)';
COMMENT ON COLUMN annonces.animaux_politique IS 'R10.6 — tri-state indifferent|oui|non ; non = malus matching et filtre dur possible';
COMMENT ON COLUMN annonces.fumeur_politique IS 'R10.6 — tri-state indifferent|oui|non ; bonus/malus matching';
COMMENT ON COLUMN annonces.equipements_extras IS 'R10.6 — jsonb libre { lave_linge: true, wifi: true, ... }';
