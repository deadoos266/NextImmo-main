-- Migration 045 — V36.6 (Paul 2026-04-29)
-- Audit V35 R35.5 (🟠) : recherches sauvegardées en localStorage uniquement
-- → non synced cross-device (laptop sauve / mobile vide). Trouble UX
-- "feature cassée" alors que c'est juste device-specific.
--
-- Migre vers une table Supabase pour vraie sync cross-device.
-- L'app garde le localStorage en cache local pour offline + perf.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.recherches_sauvegardees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  name text NOT NULL,
  -- Snapshot des filtres URL : ville, budget_max, surface_min, pieces_min,
  -- meuble, parking, balcon, terrasse, jardin, cave, fibre, ascenseur,
  -- exterieur, dispo, dpe, scoreMin, motCle, etc.
  -- jsonb pour flexibilité future (ajout de filtres sans migration).
  filtres jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT recherches_sauvegardees_name_length CHECK (char_length(name) BETWEEN 1 AND 100),
  CONSTRAINT recherches_sauvegardees_unique_per_user UNIQUE (user_email, name)
);

CREATE INDEX IF NOT EXISTS idx_recherches_sauv_user ON public.recherches_sauvegardees(user_email, updated_at DESC);

COMMENT ON TABLE public.recherches_sauvegardees IS
  'V36.6 — Recherches sauvegardées par l''utilisateur, syncées cross-device. '
  'Remplace le localStorage V14 pour rendre la feature pleinement utilisable '
  'sur laptop + mobile + autre device.';

-- RLS : ENABLE + policy READ/WRITE own (auth.jwt() does not work with NextAuth,
-- donc on désactive le SELECT anon et tout passe par /api/recherches-sauvegardees
-- avec supabaseAdmin.
ALTER TABLE public.recherches_sauvegardees ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, SELECT ON TABLE public.recherches_sauvegardees FROM anon, authenticated;
