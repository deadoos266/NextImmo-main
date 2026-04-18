-- =============================================================================
-- 010_indexes_performance.sql
--
-- Indexes de performance sur les colonnes de filtre fréquentes.
-- Idempotent (IF NOT EXISTS). À appliquer sur staging puis prod.
--
-- Benchmark attendu : passage Seq Scan → Index Scan sur requêtes :
--   - /annonces filtré ville + statut
--   - /messages d'une conv (from+to+annonce_id)
--   - /visites d'un user
-- =============================================================================

-- ─── annonces ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_annonces_ville           ON annonces(ville);
CREATE INDEX IF NOT EXISTS idx_annonces_statut          ON annonces(statut);
CREATE INDEX IF NOT EXISTS idx_annonces_prix            ON annonces(prix);
CREATE INDEX IF NOT EXISTS idx_annonces_proprietaire    ON annonces(proprietaire_email);
CREATE INDEX IF NOT EXISTS idx_annonces_locataire       ON annonces(locataire_email);
-- Composite pour la recherche publique : par ville en excluant les loués
CREATE INDEX IF NOT EXISTS idx_annonces_ville_statut
  ON annonces(ville, statut) WHERE statut IS DISTINCT FROM 'loué';

-- ─── messages ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_messages_to_email        ON messages(to_email);
CREATE INDEX IF NOT EXISTS idx_messages_from_email      ON messages(from_email);
CREATE INDEX IF NOT EXISTS idx_messages_annonce_id      ON messages(annonce_id) WHERE annonce_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_created_at      ON messages(created_at DESC);
-- Badge non-lu : WHERE to_email = X AND lu = false
CREATE INDEX IF NOT EXISTS idx_messages_unread          ON messages(to_email) WHERE lu = false;

-- ─── visites ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_visites_proprietaire     ON visites(proprietaire_email);
CREATE INDEX IF NOT EXISTS idx_visites_locataire        ON visites(locataire_email);
CREATE INDEX IF NOT EXISTS idx_visites_annonce          ON visites(annonce_id);
CREATE INDEX IF NOT EXISTS idx_visites_statut_date      ON visites(statut, date_visite);

-- ─── loyers ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_loyers_annonce           ON loyers(annonce_id);
CREATE INDEX IF NOT EXISTS idx_loyers_locataire         ON loyers(locataire_email);
CREATE INDEX IF NOT EXISTS idx_loyers_mois              ON loyers(mois);
CREATE INDEX IF NOT EXISTS idx_loyers_statut            ON loyers(statut);

-- ─── etats_des_lieux ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_edl_annonce              ON etats_des_lieux(annonce_id);
CREATE INDEX IF NOT EXISTS idx_edl_locataire            ON etats_des_lieux(locataire_email);
CREATE INDEX IF NOT EXISTS idx_edl_proprietaire         ON etats_des_lieux(proprietaire_email);

-- ─── carnet_entretien ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_carnet_annonce           ON carnet_entretien(annonce_id);
CREATE INDEX IF NOT EXISTS idx_carnet_proprietaire      ON carnet_entretien(proprietaire_email);
CREATE INDEX IF NOT EXISTS idx_carnet_locataire         ON carnet_entretien(locataire_email);

-- ─── clics_annonces ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clics_annonce            ON clics_annonces(annonce_id);

-- ─── signalements ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_signalements_statut      ON signalements(statut);
CREATE INDEX IF NOT EXISTS idx_signalements_type        ON signalements(type);

-- ─── Statistiques fraîches + reload PostgREST ────────────────────────────────
ANALYZE annonces;
ANALYZE messages;
ANALYZE visites;
ANALYZE loyers;
ANALYZE etats_des_lieux;
ANALYZE carnet_entretien;

NOTIFY pgrst, 'reload schema';
