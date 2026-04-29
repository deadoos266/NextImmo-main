-- Migration 046 — V43 (Paul 2026-04-29)
-- Bug fix privacy : favoris étaient stockés en localStorage clé globale
-- "nestmatch_favoris" — partagés entre tous les comptes du même browser.
-- User A logout → User B login sur le même browser → User B voit les
-- favoris de User A. Fuite privacy.
--
-- Migration vers DB : 1 row par (user_email, annonce_id), RLS lockdown
-- (passe via /api/favoris avec NextAuth + supabaseAdmin server-side).
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.favoris (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  annonce_id integer NOT NULL REFERENCES public.annonces(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT favoris_unique UNIQUE (user_email, annonce_id)
);

CREATE INDEX IF NOT EXISTS idx_favoris_user ON public.favoris(user_email);

COMMENT ON TABLE public.favoris IS
  'V43 — Favoris par utilisateur, scopés par user_email. Remplace le '
  'localStorage global "nestmatch_favoris" qui leakait entre comptes '
  'sur le même browser.';

-- RLS strict : tout passe via /api/favoris avec supabaseAdmin (NextAuth-gated).
ALTER TABLE public.favoris ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, SELECT ON TABLE public.favoris FROM anon, authenticated;
