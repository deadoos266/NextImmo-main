-- Migration 040 — V34.2 (Paul 2026-04-29)
-- Audit produit V31 R3.2 : "Hash PDF jamais re-vérifié post-signature.
-- Tampering possible non détecté."
--
-- Renforce l'audit-trail eIDAS Niveau 1 :
-- 1. payload_snapshot : copie immuable du bailData JSON au moment de la
--    signature. Permet de recalculer le hash à tout moment et de comparer
--    au payload courant pour détecter toute modification post-signature.
-- 2. payload_hash_sha256 : hash cryptographique SHA-256 (vs bail_hash V14
--    qui était un hash custom faible). Stocké pour vérification rapide
--    sans avoir à re-calculer à chaque check.
--
-- Idempotente.

ALTER TABLE public.bail_signatures
  ADD COLUMN IF NOT EXISTS payload_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS payload_hash_sha256 text;

COMMENT ON COLUMN public.bail_signatures.payload_snapshot IS
  'V34 — copie immuable du bailData JSON au moment de la signature, pour '
  'détection de tampering post-signature (re-comparaison côté server).';

COMMENT ON COLUMN public.bail_signatures.payload_hash_sha256 IS
  'V34 — hash SHA-256 du bailData JSON canonicalisé (clés triées). '
  'Renforce bail_hash V14 (hash custom faible) pour audit eIDAS robuste.';
