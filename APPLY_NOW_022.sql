-- ═══════════════════════════════════════════════════════════════════
-- Migration 022 — Colonne `dossier_docs_libres` (pièces complémentaires).
--
-- À coller dans Supabase prod → Dashboard → SQL Editor → New query → Run.
-- Idempotent : peut être relancé sans risque.
--
-- Stocke jusqu'à 5 pièces libres avec label personnalisé par le locataire
-- (attestation d'hébergement, lettre de recommandation, etc.) — en plus
-- des catégories fixes de `dossier_docs`.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE profils
  ADD COLUMN IF NOT EXISTS dossier_docs_libres JSONB;

COMMENT ON COLUMN profils.dossier_docs_libres IS
  'Pièces complémentaires libres du dossier locataire. Format : [{url, label, uploaded_at}]. Max 5 entrées. NULL = aucune pièce libre fournie.';

NOTIFY pgrst, 'reload schema';
