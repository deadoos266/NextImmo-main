-- NestMatch users table for authentication
-- Run this in the Supabase SQL editor or via the Supabase CLI

CREATE TABLE IF NOT EXISTS public.users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  password_hash text,          -- NULL for OAuth-only users (e.g. Google)
  name          text,
  image         text,
  role          text NOT NULL DEFAULT 'locataire' CHECK (role IN ('locataire', 'proprietaire')),
  is_admin      boolean NOT NULL DEFAULT false,
  email_verified boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Index for fast lookup by email (used in login)
CREATE INDEX IF NOT EXISTS users_email_idx ON public.users (email);
