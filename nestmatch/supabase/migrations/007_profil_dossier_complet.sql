-- =============================================================================
-- 007_profil_dossier_complet.sql
--
-- Étend la table `profils` pour un dossier locataire complet (type DossierFacile).
-- Crée `dossier_access_log` pour tracer les accès aux dossiers partagés.
--
-- Idempotent : utilise IF NOT EXISTS / ADD COLUMN IF NOT EXISTS partout.
-- Safe à rejouer.
-- =============================================================================

-- ─── Extension de profils : identité + famille + logement + pro ─────────────
ALTER TABLE IF EXISTS profils
  ADD COLUMN IF NOT EXISTS date_naissance        date,
  ADD COLUMN IF NOT EXISTS nationalite           text,
  ADD COLUMN IF NOT EXISTS situation_familiale   text,  -- celibataire|couple|marie|pacs|divorce|veuf
  ADD COLUMN IF NOT EXISTS nb_enfants            integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employeur_nom         text,
  ADD COLUMN IF NOT EXISTS date_embauche         date,
  ADD COLUMN IF NOT EXISTS logement_actuel_type  text,  -- locataire|proprietaire|heberge|foyer|colocation|autre
  ADD COLUMN IF NOT EXISTS logement_actuel_ville text,
  ADD COLUMN IF NOT EXISTS presentation          text,  -- lettre de présentation libre (500 car max)
  ADD COLUMN IF NOT EXISTS a_apl                 boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mobilite_pro          boolean DEFAULT false; -- déménagement prof (Visale +)

-- ─── Contraintes de cohérence ──────────────────────────────────────────────
-- Date de naissance plausible (majorité + pas plus de 120 ans)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_profils_date_naissance_plausible') THEN
    ALTER TABLE profils ADD CONSTRAINT chk_profils_date_naissance_plausible
      CHECK (date_naissance IS NULL OR (date_naissance <= CURRENT_DATE - INTERVAL '16 years'
                                        AND date_naissance >= CURRENT_DATE - INTERVAL '120 years'));
  END IF;
END $$;

-- nb_enfants raisonnable
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_profils_nb_enfants') THEN
    ALTER TABLE profils ADD CONSTRAINT chk_profils_nb_enfants
      CHECK (nb_enfants IS NULL OR (nb_enfants >= 0 AND nb_enfants <= 15));
  END IF;
END $$;

-- Presentation limitée à 500 caractères côté DB (client valide aussi mais défense en profondeur)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_profils_presentation_length') THEN
    ALTER TABLE profils ADD CONSTRAINT chk_profils_presentation_length
      CHECK (presentation IS NULL OR length(presentation) <= 500);
  END IF;
END $$;

-- ─── Index pour requêtes de filtrage / stats ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profils_situation_pro ON profils(situation_pro);
CREATE INDEX IF NOT EXISTS idx_profils_ville_souhaitee ON profils(ville_souhaitee);

-- ─── Logs d'accès au dossier partagé ───────────────────────────────────────
-- Permet au locataire de voir qui a consulté son dossier et quand.
-- Le token est haché (pas de stockage brut) — seuls les 10 premiers
-- caractères du hash sont stockés pour reconnaître la session sans exposer.
CREATE TABLE IF NOT EXISTS dossier_access_log (
  id          bigserial PRIMARY KEY,
  email       text NOT NULL,                 -- email du locataire propriétaire du dossier
  token_hash  text NOT NULL,                 -- hash SHA-256 du token (premiers 16 char)
  ip_hash     text,                          -- hash IP consultant (anonymisation RGPD)
  user_agent  text,                          -- UA tronqué à 200 char
  accessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dossier_access_log_email ON dossier_access_log(email, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_dossier_access_log_token ON dossier_access_log(token_hash);

-- Purge automatique après 90 jours (RGPD). Créé une fonction puis on l'appelle
-- via cron externe (Supabase pg_cron ou Vercel cron) — ici juste la fonction.
CREATE OR REPLACE FUNCTION purge_dossier_access_log_old()
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM dossier_access_log WHERE accessed_at < now() - INTERVAL '90 days';
$$;

COMMENT ON TABLE dossier_access_log IS 'Logs des accès aux dossiers partagés via token HMAC. Purge 90j (RGPD).';
COMMENT ON COLUMN dossier_access_log.token_hash IS 'SHA-256(token) tronqué à 16 caractères — permet de grouper les accès d''un même lien sans stocker le token.';
COMMENT ON COLUMN dossier_access_log.ip_hash IS 'SHA-256(ip + salt) — anonymisation conforme RGPD.';
