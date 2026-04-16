-- Booking de visites
CREATE TABLE IF NOT EXISTS public.visites (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  annonce_id        integer NOT NULL,
  locataire_email   text NOT NULL,
  proprietaire_email text NOT NULL,
  date_visite       date NOT NULL,
  heure             text NOT NULL,
  message           text,
  statut            text NOT NULL DEFAULT 'proposée'
                    CHECK (statut IN ('proposée', 'confirmée', 'annulée', 'effectuée')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visites_annonce_idx ON public.visites (annonce_id);
CREATE INDEX IF NOT EXISTS visites_locataire_idx ON public.visites (locataire_email);
CREATE INDEX IF NOT EXISTS visites_proprio_idx ON public.visites (proprietaire_email);
